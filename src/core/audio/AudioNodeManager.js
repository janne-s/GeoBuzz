import { CONSTANTS } from '../constants.js';
import { Selectors } from '../state/selectors.js';
import { SYNTH_REGISTRY } from './SynthRegistry.js';
import { getUserMovementSpeed } from './AudioEngine.js';

export class AudioNodeManager {
	static createAudioChain(type, params = {}, spatialMode = 'off') {
		const masterGain = new Tone.Gain(0).toDestination();
		const envelopeGain = new Tone.Gain(1);

		const synthDef = SYNTH_REGISTRY[type] || {};
		const isStereoSource = synthDef.isStereo || false;

		let panner = null;
		if (spatialMode === 'hrtf') {
			panner = new Tone.Panner3D({
				panningModel: CONSTANTS.PANNER_3D_MODEL,
				distanceModel: CONSTANTS.PANNER_3D_DISTANCE_MODEL,
				refDistance: CONSTANTS.PANNER_3D_REF_DISTANCE,
				maxDistance: CONSTANTS.PANNER_3D_MAX_DISTANCE,
				rolloffFactor: CONSTANTS.PANNER_3D_ROLLOFF_FACTOR,
				positionX: 0,
				positionY: 0,
				positionZ: 0
			});
		} else if (!isStereoSource) {
			panner = new Tone.Panner(params.pan || 0);
		}

		const filter = new Tone.Filter({
			frequency: params.filterFreq || CONSTANTS.DEFAULT_SOUND.filterFreq,
			type: params.filterType || "lowpass",
			Q: params.resonance || 1
		});
		const eq = new Tone.EQ3({
			low: params.eq?.low || 0,
			mid: params.eq?.mid || 0,
			high: params.eq?.high || 0,
			lowFrequency: params.eq?.lowFrequency || 400,
			highFrequency: params.eq?.highFrequency || 2500
		});

		let synth;
		let loopFadeGain = null;

		try {
			if (!synthDef || !synthDef.factory) {
				console.warn(`Unknown synth type: ${type}, using fallback`);
				synth = new Tone.Synth({
					oscillator: { type: "triangle", detune: params.detune || 0 },
					envelope: this.getEnvelopeParams(params),
					volume: CONSTANTS.DEFAULT_SYNTH_VOLUME_DB
				});
			} else {
				synth = synthDef.factory(params);
			}

			let lastNodeInChain = filter;

			if (type === "SoundFile" || type === "Granular") {
				loopFadeGain = new Tone.Gain(1);
				synth.connect(loopFadeGain);
				loopFadeGain.connect(filter);
			} else {
				synth.connect(filter);
			}

			if (panner) {
				filter.connect(panner);
				lastNodeInChain = panner;
			}

			lastNodeInChain.connect(envelopeGain);
			envelopeGain.connect(masterGain);

			return { synth, gain: masterGain, envelopeGain, filter, panner, eq, fx1: null, fx2: null, fx3: null, loopFadeGain };

		} catch (error) {
			console.error('Error creating audio chain:', error);
			return this.createFallbackChain();
		}
	}

	static getEnvelopeParams(params) {
		return {
			attack: params.attack || CONSTANTS.DEFAULT_SOUND.attack,
			decay: params.decay || CONSTANTS.DEFAULT_SOUND.decay,
			sustain: params.sustain || CONSTANTS.DEFAULT_SOUND.sustain,
			release: params.release || CONSTANTS.DEFAULT_SOUND.release
		};
	}

	static getModulationEnvelopeParams(params) {
		return {
			attack: params.modAttack || 0.5,
			decay: params.modDecay || 0.0,
			sustain: params.modSustain || 1.0,
			release: params.modRelease || 0.5
		};
	}

	static createFallbackChain() {
		const masterGain = new Tone.Gain(0).toDestination();
		const envelopeGain = new Tone.Gain(1);
		const panner = new Tone.Panner(0);
		const filter = new Tone.Filter({
			frequency: CONSTANTS.DEFAULT_SOUND.filterFreq,
			type: "lowpass",
			Q: 1
		});
		const eq = new Tone.EQ3();

		const synth = new Tone.Synth({
			oscillator: { detune: 0 },
			envelope: this.getEnvelopeParams({}),
			volume: CONSTANTS.DEFAULT_SYNTH_VOLUME_DB
		});

		synth.connect(filter);
		filter.connect(panner);
		panner.connect(eq);
		eq.connect(envelopeGain);
		envelopeGain.connect(masterGain);

		return { synth, gain: masterGain, envelopeGain, filter, panner, eq, fx1: null, fx2: null, fx3: null };
	}

	static connectChain(nodes) {
		for (let i = 0; i < nodes.length - 1; i++) {
			if (nodes[i] && nodes[i + 1]) {
				nodes[i].connect(nodes[i + 1]);
			}
		}
	}

	static disposeNodes(nodes) {
		const nodeList = Array.isArray(nodes) ? nodes : Object.values(nodes);
		nodeList.forEach(node => {
			if (node && typeof node.dispose === 'function') {
				try {
					if (node.gain?.cancelScheduledValues) {
						node.gain.cancelScheduledValues(0);
					}
					if (node.disconnect) {
						node.disconnect();
					}
					node.dispose();
				} catch (e) {
					console.warn('Error disposing audio node:', e);
				}
			}
		});
	}

	static stopPlayback(obj, stopLoopedPlaybackFn) {
		if (!obj) return;

		try {
			if (obj.isPlaying) {
				if (obj.type === "SoundFile") {
					this.stopSoundFile(obj, stopLoopedPlaybackFn);
				} else if (obj.type === "StreamPlayer") {
				} else if (obj.synth && typeof obj.synth.triggerRelease === 'function') {
					obj.synth.triggerRelease();
				}
				obj.isPlaying = false;
			}

			if (obj.envelopeTimeoutId) {
				clearTimeout(obj.envelopeTimeoutId);
				obj.envelopeTimeoutId = null;
			}
			if (obj.releaseTimeoutId) {
				clearTimeout(obj.releaseTimeoutId);
				obj.releaseTimeoutId = null;
			}

			if (obj.gain) obj.gain.gain.cancelScheduledValues(0);
			if (obj.envelopeGain) obj.envelopeGain.gain.cancelScheduledValues(0);

		} catch (error) {
			console.warn('Error stopping playback:', error);
		}
	}

	static stopSoundFile(obj, stopLoopedPlaybackFn) {
		if (obj.params.loop && stopLoopedPlaybackFn) {
			stopLoopedPlaybackFn(obj);
		} else if (obj.synth && obj.synth.state === 'started') {
			obj.synth.stop();
		}
	}

	static updateFXChain(obj) {
		try {
			const preFxNode = obj.panner || obj.filter;

			preFxNode.disconnect();
			if (obj.fx1) obj.fx1.disconnect();
			if (obj.fx2) obj.fx2.disconnect();
			if (obj.fx3) obj.fx3.disconnect();
			if (obj.eq) obj.eq.disconnect();
			if (obj.envelopeGain) obj.envelopeGain.disconnect();

			const activeChain = [preFxNode];

			[obj.fx1, obj.fx2, obj.fx3].forEach(fx => {
				if (fx) {
					activeChain.push(fx);
				}
			});

			if (obj.eq && obj.params.eq?.enabled) {
				activeChain.push(obj.eq);
			}

			activeChain.push(obj.envelopeGain, obj.gain);

			Tone.connectSeries(...activeChain);

		} catch (error) {
			console.error('Error updating FX chain:', error);
			try {
				const sourceNode = obj.panner || obj.filter;
				sourceNode.disconnect();
				sourceNode.connect(obj.gain);
			} catch (e) {
				console.error('Fallback FX chain connection failed:', e);
			}
		}
	}

	static ensureEQNode(obj) {
		if (!obj.eq) {
			obj.eq = new Tone.EQ3({
				low: CONSTANTS.DEFAULT_EQ_VALUES.low,
				mid: CONSTANTS.DEFAULT_EQ_VALUES.mid,
				high: CONSTANTS.DEFAULT_EQ_VALUES.high,
				lowFrequency: CONSTANTS.DEFAULT_EQ_VALUES.lowFrequency,
				highFrequency: CONSTANTS.DEFAULT_EQ_VALUES.highFrequency
			});
		}

		if (obj.eq) {
			const eqParams = obj.params.eq || {};
			obj.eq.low.value = eqParams.low !== undefined ? eqParams.low : CONSTANTS.DEFAULT_EQ_VALUES.low;
			obj.eq.mid.value = eqParams.mid !== undefined ? eqParams.mid : CONSTANTS.DEFAULT_EQ_VALUES.mid;
			obj.eq.high.value = eqParams.high !== undefined ? eqParams.high : CONSTANTS.DEFAULT_EQ_VALUES.high;
			obj.eq.lowFrequency.value = eqParams.lowFrequency !== undefined ? eqParams.lowFrequency : CONSTANTS.DEFAULT_EQ_VALUES.lowFrequency;
			obj.eq.highFrequency.value = eqParams.highFrequency !== undefined ? eqParams.highFrequency : CONSTANTS.DEFAULT_EQ_VALUES.highFrequency;
		}
		return obj.eq;
	}
}

export class PolyphonyManager {
	static isPolyphonic(synthType) {
		const def = SYNTH_REGISTRY[synthType];
		return def && def.supportsPolyphony;
	}

	static determinePlaybackSource(soundObj) {
		if (soundObj.lastTouchedParam === 'frequency' || soundObj.frequencyMode) {
			return { type: 'frequency', values: [soundObj.params.frequency || 440] };
		}

		if (soundObj.lastTouchedParam === 'pitch') {
			const pitch = soundObj.params.pitch || 60;
			return { type: 'pitch', values: [pitch] };
		}

		if (soundObj.lastTouchedParam === 'keyboard') {
			if (soundObj.params.selectedNotes?.length > 0) {
				return { type: 'notes', values: soundObj.params.selectedNotes };
			} else {
				return null;
			}
		}

		if (soundObj.type === 'Sampler') {
			if (soundObj.params.selectedNotes?.length > 0) {
				return { type: 'notes', values: soundObj.params.selectedNotes };
			} else {
				return null;
			}
		}

		if (soundObj.params.selectedNotes !== undefined && soundObj.params.selectedNotes.length > 0) {
			return { type: 'notes', values: soundObj.params.selectedNotes };
		}

		if (soundObj.frequencyMode) {
			return { type: 'frequency', values: [soundObj.params.frequency || 440] };
		}

		const pitch = soundObj.params.pitch || 60;
		return { type: 'pitch', values: [pitch] };
	}

	static trigger(soundObj, source = null) {
		if (!soundObj || !soundObj.synth || !soundObj.params) return;
		if (soundObj.synth.disposed) return;

		if (soundObj.type === 'Sampler' && soundObj.params.samplerMode === 'single' && !soundObj.params.soundFile) {
			return;
		}

		if (soundObj.type === 'Sampler' && soundObj.params.samplerMode === 'grid') {
			const hasAnySamples = soundObj.params.gridSamples && Object.keys(soundObj.params.gridSamples).length > 0;
			if (!hasAnySamples) {
				return;
			}
		}

		if (soundObj.type === 'Sampler') {
			const hasSelectedNotes = soundObj.params.selectedNotes && soundObj.params.selectedNotes.length > 0;
			if (!hasSelectedNotes) {
				return;
			}

			const hasBuffers = soundObj.synth._buffers && soundObj.synth._buffers._buffers && soundObj.synth._buffers._buffers.size > 0;
			if (!hasBuffers) {
				return;
			}

			let allLoaded = true;
			soundObj.synth._buffers._buffers.forEach(buffer => {
				if (!buffer.loaded) {
					allLoaded = false;
				}
			});

			if (!allLoaded) {
				return;
			}

			if (soundObj.params.samplerMode === 'single') {
				const gateMin = soundObj.params.speedGateMin ?? 0;
				const gateMax = soundObj.params.speedGateMax ?? 10;
				if (gateMin > 0 || gateMax < 10) {
					const userSpeed = getUserMovementSpeed();
					if (userSpeed < gateMin || userSpeed > gateMax) {
						return;
					}
				}
			}
		}

		if (soundObj.type === 'NoiseSynth') {
			this.triggerPolyphonic(soundObj.synth, [], true, soundObj);
			return;
		}

		const playbackSource = source || this.determinePlaybackSource(soundObj);

		if (!playbackSource) {
			return;
		}

		if (playbackSource.type === 'frequency') {
			soundObj.synth.triggerAttack(playbackSource.values[0]);
		} else {
			this.triggerPolyphonic(soundObj.synth, playbackSource.values, true, soundObj);
		}

		if (soundObj.envelopeGain && !soundObj._skipEnvelope) {
			const now = Tone.now();
			const attack = soundObj.params.attack || 0.01;
			const decay = soundObj.params.decay || 0.2;
			const sustainLevel = soundObj.params.sustain ?? CONSTANTS.DEFAULT_SOUND.sustain;

			soundObj.envelopeGain.gain.cancelScheduledValues(now);
			soundObj.envelopeGain.gain.setValueAtTime(0, now);
			soundObj.envelopeGain.gain.linearRampToValueAtTime(1.0, now + attack);
			soundObj.envelopeGain.gain.linearRampToValueAtTime(sustainLevel, now + attack + decay);
		}
	}

	static release(soundObj, source = null) {
		if (!soundObj || !soundObj.synth || !soundObj.params) return;
		if (soundObj.synth.disposed) return;

		if (soundObj.type === 'NoiseSynth') {
			this.triggerPolyphonic(soundObj.synth, [], false, soundObj);
			if (soundObj.envelopeGain && !soundObj._skipEnvelope) {
				PolyphonyManager.exponentialRelease(soundObj.envelopeGain.gain, soundObj.params.release || 0.1);
			}
			return;
		}

		const playbackSource = source || this.determinePlaybackSource(soundObj);

		if (!playbackSource) {
			if (soundObj.envelopeGain) {
				PolyphonyManager.exponentialRelease(soundObj.envelopeGain.gain, soundObj.params.release || 0.1);
			}
			return;
		}

		if (playbackSource.type === 'frequency') {
			soundObj.synth.triggerRelease();
		} else {
			this.triggerPolyphonic(soundObj.synth, playbackSource.values, false, soundObj);
		}

		if (soundObj.envelopeGain && !soundObj._skipEnvelope) {
			PolyphonyManager.exponentialRelease(soundObj.envelopeGain.gain, soundObj.params.release || 0.1);
		}
	}

	static exponentialRelease(gainParam, duration) {
		const now = Tone.now();
		const currentValue = Math.max(0.001, gainParam.value);
		gainParam.cancelScheduledValues(now);
		gainParam.setValueAtTime(currentValue, now);
		gainParam.exponentialRampToValueAtTime(0.001, now + duration);
		gainParam.setValueAtTime(0, now + duration);
	}

	static generateChord(basePitch, polyphony) {
		if (polyphony <= 1) return [basePitch];
		const intervals = [0, 4, 7, 11];
		const notes = [];
		for (let i = 0; i < polyphony; i++) {
			notes.push(basePitch + intervals[i % intervals.length]);
		}
		return notes;
	}

	static triggerPolyphonic(synth, notes, isAttack = true, soundObj = null, StreamManager = null, velocities = null) {
		if (!synth || synth.disposed) return;

		if (synth instanceof Tone.Sampler) {
			const hasBuffers = synth._buffers && synth._buffers._buffers && synth._buffers._buffers.size > 0;
			if (!hasBuffers) {
				return;
			}
		}

		const notesToPlay = notes.map(n => Tone.Frequency(n, "midi").toNote());

		if (isAttack) {
			const now = Tone.now();
			if (synth instanceof Tone.PolySynth) {
				if (synth.voice === Tone.NoiseSynth) {
					const avgVelocity = velocities ? (Object.values(velocities).reduce((sum, v) => sum + v, 0) / Object.keys(velocities).length || 0.8) : 0.8;
					if (soundObj && soundObj.envelopeGain) {
						soundObj.envelopeGain.gain.setValueAtTime(avgVelocity, now);
					}
					synth.triggerAttack(Array(notes.length).fill(undefined), now);
				} else {
					if (velocities) {
						const velocityValues = notes.map(note => velocities[note] ?? 0.8);
						synth.triggerAttack(notesToPlay, now, velocityValues);
					} else {
						synth.triggerAttack(notesToPlay, now);
					}
				}
			} else if (synth instanceof Tone.Sampler) {
				if (!synth._activeNotes) synth._activeNotes = new Set();
				if (!synth._manualSources) synth._manualSources = new Map();

				notesToPlay.forEach((note, idx) => {
					const midiNote = notes[idx];
					const velocity = velocities ? (velocities[midiNote] ?? 0.8) : 0.8;

					if (soundObj && soundObj.params.samplerMode === 'grid' && soundObj.params.gridSamples) {
						const gridSample = soundObj.params.gridSamples[midiNote];

						if (gridSample && gridSample.fileName) {
							const speedMin = gridSample.speedMin ?? 0;
							const speedMax = gridSample.speedMax ?? 10;
							if (speedMin > 0 || speedMax < 10) {
								const userSpeed = getUserMovementSpeed();
								if (userSpeed < speedMin || userSpeed > speedMax) {
									return;
								}
							}

							const buffer = synth._buffers.get(midiNote.toString());
							if (!buffer) {
								console.warn(`Grid sampler: buffer not found for MIDI ${midiNote}`);
								return;
							}

							const pitchShift = gridSample.pitch || 0;
							const playbackRate = Math.pow(2, pitchShift / 12);
							const shouldLoop = soundObj.params.loop || false;

							const source = new Tone.ToneBufferSource({
								url: buffer,
								playbackRate: playbackRate,
								fadeIn: synth.attack,
								fadeOut: synth.release,
								loop: shouldLoop,
								volume: Tone.gainToDb(velocity)
							}).connect(synth.output);

							source.start(Tone.now());

							if (!synth._manualSources.has(note)) {
								synth._manualSources.set(note, []);
							}
							synth._manualSources.get(note).push(source);

							source.onended = () => {
								const sources = synth._manualSources.get(note);
								if (sources) {
									const index = sources.indexOf(source);
									if (index !== -1) sources.splice(index, 1);
								}
							};

							synth._activeNotes.add(note);
							return;
						}
					}

					if (soundObj && soundObj.params.loop && soundObj.params.samplerMode === 'single') {
						const baseNoteMidi = 60;
						const buffer = synth._buffers.get(baseNoteMidi.toString());
						if (buffer) {
							const targetNoteMidi = Tone.Frequency(note).toMidi();
							const semitoneDiff = targetNoteMidi - baseNoteMidi;
							const playbackRate = Math.pow(2, semitoneDiff / 12);

							const source = new Tone.ToneBufferSource({
								url: buffer,
								playbackRate: playbackRate,
								fadeIn: synth.attack,
								fadeOut: synth.release,
								loop: true,
								volume: Tone.gainToDb(velocity)
							}).connect(synth.output);

							source.start(Tone.now());

							if (!synth._manualSources.has(note)) {
								synth._manualSources.set(note, []);
							}
							synth._manualSources.get(note).push(source);

							source.onended = () => {
								const sources = synth._manualSources.get(note);
								if (sources) {
									const index = sources.indexOf(source);
									if (index !== -1) sources.splice(index, 1);
								}
							};

							synth._activeNotes.add(note);
							return;
						}
					}

					synth.triggerAttack(note, Tone.now(), velocity);
					synth._activeNotes.add(note);
				});
			} else if (synth instanceof Tone.Player) {
				if (synth.loaded) {
					synth.restart();
				}
			} else if (synth instanceof Tone.NoiseSynth) {
				const avgVelocity = velocities ? (Object.values(velocities).reduce((sum, v) => sum + v, 0) / Object.keys(velocities).length || 0.8) : 0.8;
				const now = Tone.now();
				if (soundObj && soundObj.envelopeGain) {
					soundObj.envelopeGain.gain.setValueAtTime(avgVelocity, now);
				}
				synth.envelope.cancel();
				synth.triggerAttack();
			} else if (soundObj && soundObj.type === 'StreamPlayer' && StreamManager) {
				StreamManager.playStream(soundObj);
			} else if (notesToPlay.length > 0) {
				synth.triggerAttack(notesToPlay[0]);
			}
		} else {
			if (synth instanceof Tone.PolySynth) {
				if (synth.voice === Tone.NoiseSynth) {
					synth.triggerRelease();
				} else {
					synth.triggerRelease(notesToPlay);
				}
			} else if (synth instanceof Tone.Sampler) {
				notesToPlay.forEach(note => {
					if (synth._manualSources && synth._manualSources.has(note)) {
						const sources = synth._manualSources.get(note);
						const now = Tone.now();
						const stopTime = now + (synth.release || 0.1);
						while (sources.length > 0) {
							const source = sources.shift();
							if (source.loop) {
								source.loop = false;
							}
							source.stop(stopTime);
						}
						synth._manualSources.delete(note);
					}

					synth.triggerRelease(note);
					if (synth._activeNotes) synth._activeNotes.delete(note);
				});
			} else if (synth instanceof Tone.Player) {
				if (synth.loaded) {
					synth.stop();
				}
			} else if (soundObj && soundObj.type === 'StreamPlayer' && StreamManager) {
				StreamManager.stopStream(soundObj);
			} else {
				synth.triggerRelease();
			}
		}
	}
}
