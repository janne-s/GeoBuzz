import { CONSTANTS } from '../constants.js';
import { Selectors } from '../state/selectors.js';
import { AppState } from '../state/StateManager.js';
import { Geometry } from '../geospatial/Geometry.js';
import { AudioNodeManager } from './AudioNodeManager.js';
import { calculatePartials } from './SynthRegistry.js';
import { startLoopedPlayback, stopLoopedPlayback } from './SoundLifecycle.js';
import { isGranularMode } from '../utils/typeChecks.js';
import { waitForNextFrame } from '../utils/async.js';

let GeolocationManager = null;
let NoteManager = null;
let PolyphonyManager = null;
let PARAMETER_REGISTRY = null;
let changeSoundType = null;

export function setContext(ctx) {
	GeolocationManager = ctx.GeolocationManager;
	NoteManager = ctx.NoteManager;
	PolyphonyManager = ctx.PolyphonyManager;
	PARAMETER_REGISTRY = ctx.PARAMETER_REGISTRY;
	changeSoundType = ctx.changeSoundType;
}

function getAudioNodeParameter(synth, audioNodePath) {
	if (!audioNodePath) return null;

	const parts = audioNodePath.split('.');
	let current = synth;

	for (const part of parts) {
		if (!current || !current[part]) return null;
		current = current[part];
	}

	return current;
}

function _applySoundFilePlaybackParams(soundObj, shouldRestart = false) {
	if ((soundObj.type !== "SoundFile" && soundObj.type !== "Granular") || !soundObj.synth) {
		return;
	}

	const isGranular = soundObj.type === "Granular";

	soundObj.synth.set({
		loop: soundObj.params.loop || false,
		playbackRate: soundObj.params.speed,
		reverse: soundObj.params.reverse,
		loopStart: soundObj.params.loopStart,
		loopEnd: soundObj.params.loopEnd
	});

	if (isGranular) {
		soundObj.synth.detune = soundObj.params.grainDetune || 0;
		if (soundObj.params.timeStretchMode === 'manual') {
			soundObj.synth.grainSize = soundObj.params.grainSize || 0.1;
			soundObj.synth.overlap = soundObj.params.overlap || 0.05;
		}
	} else {
		soundObj.synth.fadeIn = soundObj.params.fadeIn;
		soundObj.synth.fadeOut = soundObj.params.fadeOut;
	}

	if (shouldRestart && soundObj.isPlaying && soundObj.params.loop) {
		if (soundObj._restartTimeout) {
			cancelAnimationFrame(soundObj._restartTimeout);
		}
		soundObj._restartTimeout = requestAnimationFrame(async () => {
			stopLoopedPlayback(soundObj);
			await waitForNextFrame();
			startLoopedPlayback(soundObj);
		});
	}
}

export const updatePartials = (target, isMod = false, overrides = {}) => {
	const prefix = isMod ? 'mod' : '';
	const countParam = prefix + (isMod ? 'PartialCount' : 'partialCount');
	const curveParam = prefix + (isMod ? 'PartialCurve' : 'partialCurve');
	const waveParam = isMod ? 'modWaveform' : 'waveform';
	const defaultWave = isMod ? 'square' : 'sine';
	const nodeKey = isMod ? 'modulation' : 'oscillator';

	if (isMod ? (!target.synth?.modulation) : (target.type === "SoundFile" || target.type === "StreamPlayer" || !target.synth)) return;

	const rawCount = overrides[countParam] !== undefined ? overrides[countParam] : (target.params[countParam] || 1);
	const partialCount = Math.max(1, Math.round(rawCount));

	const partialCurve = overrides[curveParam] !== undefined ? overrides[curveParam] : (target.params[curveParam] ?? -0.5);
	const waveform = target.params[waveParam] || defaultWave;

	const partials = calculatePartials(partialCount, partialCurve, partialCount > 1 ? waveform : null);
	let newType = partialCount > 1 ? 'custom' : waveform;

	if (!isMod && target.type === "FatOscillator" && newType !== 'custom') {
		newType = 'fat' + waveform;
	}

	const config = {
		[nodeKey]: { type: newType }
	};
	if (partialCount > 1) {
		config[nodeKey].partials = partials;
	}

	if (target.synth instanceof Tone.PolySynth) {
		target.synth.set(config);
	} else {
		const node = target.synth[nodeKey];
		if (node) {
			node.type = newType;
			if (partialCount > 1) node.partials = partials;
		}
	}
};

export function updateSynthParam(obj, param, value, options = {}) {
	if (!obj.params) return;

	const isModulation = options.isModulation || false;

	if (!isModulation) {
		obj.params[param] = value;
	}

	try {
		const handlers = {
			pitch: async () => {
				const freq = Tone.Frequency(value, "midi").toFrequency();
				const rampTime = isModulation ? CONSTANTS.LFO_SMOOTH_RAMP_TIME : 0.01;

				if (!isModulation) {
					obj.params.pitch = value;
					obj.frequencyMode = false;
					obj.lastTouchedParam = 'pitch';
					if (obj.params.originalValues) {
						obj.params.originalValues.pitch = value;
					}
				}

				if (obj.type === "SoundFile" || obj.type === "StreamPlayer") return;

				if (obj.synth?.frequency) {
					obj.synth.frequency.rampTo(freq, rampTime);
				} else if (obj.synth instanceof Tone.PolySynth) {
					obj.synth.set({ frequency: freq });
				}

				if (!isModulation && obj.type !== "SoundFile" && obj.type !== "StreamPlayer" && GeolocationManager) {
					const userPos = GeolocationManager.getUserPosition();
					if (userPos && Geometry.isPointInShape(userPos, obj)) {
						if (obj.isPlaying && NoteManager) {
							NoteManager.release(obj);
						}
						obj.isPlaying = false;
						AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
					}
				}
			},
			frequency: async () => {
				const freq = value;

				if (!isModulation) {
					obj.params.frequency = freq;
					obj.frequencyMode = true;
					obj.lastTouchedParam = 'frequency';
					if (obj.params.originalValues) {
						obj.params.originalValues.frequency = freq;
					}
				}

				if (obj.type === "SoundFile" || obj.type === "StreamPlayer") return;

				const rampTime = isModulation ? CONSTANTS.LFO_SMOOTH_RAMP_TIME : 0.01;

				if (obj.synth?.frequency) {
					obj.synth.frequency.rampTo(freq, rampTime);
				} else if (obj.synth instanceof Tone.PolySynth) {
					obj.synth.set({ frequency: freq });
				}

				if (!isModulation && GeolocationManager) {
					const userPos = GeolocationManager.getUserPosition();
					if (userPos && Geometry.isPointInShape(userPos, obj)) {
						if (obj.isPlaying && NoteManager) {
							NoteManager.release(obj);
						}
						obj.isPlaying = false;
						AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
					}
				}
			},
			noiseType: () => {
				if (obj.synth?.noise) obj.synth.noise.type = value;
			},
			harmonicity: () => {
				if (obj.synth) {
					if (obj.synth instanceof Tone.PolySynth) obj.synth.set({ harmonicity: value });
					else if (obj.synth.harmonicity) obj.synth.harmonicity.value = value;
				}
			},
			count: () => {
				if (obj.synth && obj.type === 'FatOscillator') {
					if (obj.synth instanceof Tone.PolySynth) obj.synth.set({ oscillator: { count: value } });
					else if (obj.synth.oscillator) obj.synth.oscillator.count = value;
				}
			},
			spread: () => {
				if (obj.synth && obj.type === 'FatOscillator') {
					if (obj.synth instanceof Tone.PolySynth) obj.synth.set({ oscillator: { spread: value } });
					else if (obj.synth.oscillator) obj.synth.oscillator.spread = value;
				}
			},
			modAttack: () => {
				if (obj.synth) {
					if (obj.synth instanceof Tone.PolySynth) obj.synth.set({ modulationEnvelope: { attack: value } });
					else if (obj.synth.modulationEnvelope) obj.synth.modulationEnvelope.attack = value;
				}
			},
			modRelease: () => {
				if (obj.synth) {
					if (obj.synth instanceof Tone.PolySynth) obj.synth.set({ modulationEnvelope: { release: value } });
					else if (obj.synth.modulationEnvelope) obj.synth.modulationEnvelope.release = value;
				}
			},
			modWaveform: () => {
				if (obj.synth) updatePartials(obj, true);
			},
			detune: () => {
				if (obj.synth) {
					if (obj.synth instanceof Tone.PolySynth) obj.synth.set({ detune: value });
					else if (obj.synth.detune) obj.synth.detune.value = value;
					else if (obj.synth.oscillator?.detune) obj.synth.oscillator.detune.value = value;
				}
			},
			pulseWidth: () => {
				if (obj.synth) {
					if (obj.synth instanceof Tone.PolySynth) obj.synth.set({ oscillator: { width: value } });
					else if (obj.synth.oscillator?.width) obj.synth.oscillator.width.value = value;
				}
			},
			waveform: () => {
				if (obj.type === "SoundFile" || obj.type === "StreamPlayer" || !obj.synth) return;
				updatePartials(obj);
			},
			grainSize: () => {
				if (isGranularMode(obj)) obj.synth.grainSize = value;
			},
			overlap: () => {
				if (isGranularMode(obj)) obj.synth.overlap = value;
			},
			grainDetune: () => {
				if (isGranularMode(obj)) obj.synth.detune = value;
			},
			speed: () => {
				if ((obj.type === "SoundFile" || obj.type === "Granular") && obj.synth) {
					if (obj.params.loopEnd > obj.soundDuration) {
						obj.params.loopEnd = obj.soundDuration;
					}
					_applySoundFilePlaybackParams(obj, true);
				}
			},
			loopStart: () => {
				if (obj.type === "SoundFile" && obj.synth) _applySoundFilePlaybackParams(obj, true);
			},
			loopEnd: () => {
				if (obj.type === "SoundFile" && obj.synth) _applySoundFilePlaybackParams(obj, true);
			},
			loopFadeIn: () => {
				if (obj.type === "SoundFile" && obj.synth) _applySoundFilePlaybackParams(obj, true);
			},
			loopFadeOut: () => {
				if (obj.type === "SoundFile" && obj.synth) _applySoundFilePlaybackParams(obj, true);
			},
			loop: () => {
				if (obj.type === "SoundFile" && obj.synth?.loaded) {
					if (obj._loopActive) {
						obj._loopActive = false;
						if (obj._loopCheckInterval) {
							clearInterval(obj._loopCheckInterval);
							obj._loopCheckInterval = null;
						}
					}
					obj.synth.loop = false;
					if (obj.gain) {
						obj.gain.gain.cancelScheduledValues(Tone.now());
						obj.gain.gain.value = 0;
					}
					obj.synth.stop();
					obj.isPlaying = false;
					if (obj.loopFadeGain) {
						obj.loopFadeGain.gain.cancelScheduledValues(Tone.now());
						obj.loopFadeGain.gain.value = 1;
					}
					_applySoundFilePlaybackParams(obj, false);
					if (value) {
						obj.wasInsideArea = false;
					}
					AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
				} else if (obj.type === "Sampler" && obj.isPlaying && obj.params.selectedNotes?.length > 0) {
					PolyphonyManager.triggerPolyphonic(obj.synth, obj.params.selectedNotes, false, obj);
					if (value) {
						PolyphonyManager.triggerPolyphonic(obj.synth, obj.params.selectedNotes, true, obj);
					}
				}
			},
			reverse: () => {
				if (obj.type === "SoundFile" && obj.synth) _applySoundFilePlaybackParams(obj, true);
			},
			fadeIn: () => {
				if (obj.type === "SoundFile" && obj.synth) obj.synth.fadeIn = value;
			},
			fadeOut: () => {
				if (obj.type === "SoundFile" && obj.synth) obj.synth.fadeOut = value;
			},
			filterFreq: () => {
				if (obj.filter) obj.filter.frequency.rampTo(value, CONSTANTS.AUDIO_RAMP_TIME);
			},
			filterType: () => {
				if (obj.filter) obj.filter.type = value;
			},
			resonance: () => {
				if (obj.filter) obj.filter.Q.rampTo(value, CONSTANTS.AUDIO_RAMP_TIME);
			},
			attack: () => {
				if (obj.synth) {
					if (obj.synth instanceof Tone.Sampler) obj.synth.attack = value;
					else if (obj.synth instanceof Tone.PolySynth) obj.synth.set({ envelope: { attack: value } });
					else if (obj.synth.envelope) obj.synth.envelope.attack = value;
				}
			},
			decay: () => {
				if (obj.synth) {
					if (obj.synth instanceof Tone.PolySynth) obj.synth.set({ envelope: { decay: value } });
					else if (obj.synth.envelope) obj.synth.envelope.decay = value;
				}
			},
			sustain: () => {
				if (obj.synth) {
					if (obj.synth instanceof Tone.PolySynth) obj.synth.set({ envelope: { sustain: value } });
					else if (obj.synth.envelope) obj.synth.envelope.sustain = value;
				}
				if (obj.envelopeGain) {
					const isAreaPlaying = obj.isPlaying && obj.gain.gain.value > 0;
					if (isAreaPlaying) {
						obj.envelopeGain.gain.rampTo(value, CONSTANTS.SUSTAIN_RAMP_TIME);
					}
				}
			},
			release: () => {
				if (obj.synth) {
					if (obj.synth instanceof Tone.Sampler) obj.synth.release = value;
					else if (obj.synth instanceof Tone.PolySynth) obj.synth.set({ envelope: { release: value } });
					else if (obj.synth.envelope) obj.synth.envelope.release = value;
				}
			},
			modIndex: () => { if (obj.type === "FMSynth" && obj.synth?.modulationIndex) obj.synth.modulationIndex.value = value; },
			curveStrength: () => {
				if (!isModulation) {
					AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
				}
			},
			volume: () => {
				if (obj.gain && obj.marker) {
					obj.gain.gain.rampTo(value, CONSTANTS.AUDIO_RAMP_TIME);
				}
				if (!isModulation) {
					AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
				}
			},
			pan: () => {
				if ((Selectors.getSpatialMode() === 'off' || !obj.useSpatialPanning) && obj.panner) {
					if (obj.panner.pan) {
						obj.panner.pan.rampTo(value, CONSTANTS.AUDIO_RAMP_TIME);
					}
				}
			},
			partialCount: () => updatePartials(obj, false, { partialCount: value }),
			partialCurve: () => updatePartials(obj, false, { partialCurve: value }),
			modPartialCount: () => updatePartials(obj, true, { modPartialCount: value }),
			modPartialCurve: () => updatePartials(obj, true, { modPartialCurve: value }),
			polyphony: () => {
				if (isModulation) return;
				obj.params.polyphony = Math.floor(value);
				if (obj.params.selectedNotes && obj.params.selectedNotes.length > 0) return;
				if (obj.synth instanceof Tone.Sampler) {
					obj.synth.maxPolyphony = obj.params.polyphony;
				} else if (obj.synth instanceof Tone.PolySynth) {
					obj.synth.set({ maxPolyphony: obj.params.polyphony });
				} else if (obj.params.polyphony > 1 && PolyphonyManager && changeSoundType) {
					const wasPlaying = obj.isPlaying;
					if (wasPlaying) {
						const oldNotes = PolyphonyManager.generateChord(obj.params.pitch || 60, 1);
						PolyphonyManager.triggerPolyphonic(obj.synth, oldNotes, false, obj);
					}
					changeSoundType(obj, obj.type).then(() => {
						if (wasPlaying) {
							AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
						}
					});
				}
			}
		};

		if (handlers[param]) {
			handlers[param]();
		} else if (isModulation && PARAMETER_REGISTRY) {
			const def = PARAMETER_REGISTRY[param];
			if (def && def.audioNode && obj.synth) {
				const nodeParam = getAudioNodeParameter(obj.synth, def.audioNode);
				if (nodeParam) {
					if (nodeParam.rampTo) nodeParam.rampTo(value, CONSTANTS.LFO_SMOOTH_RAMP_TIME);
					else nodeParam.value = value;
				}
			}
		}

	} catch (e) {
		console.warn("Could not update parameter:", param, e);
	}
}
