import { CONSTANTS } from '../constants.js';
import { Selectors } from '../state/selectors.js';
import { AppState } from '../state/StateManager.js';
import { PolyphonyManager } from './AudioNodeManager.js';
import { initializeSynthParameters } from './SynthRegistry.js';
import { setSequencerControl } from './SoundCreation.js';
import { DEFAULT_LFO_STRUCTURE } from '../../config/defaults.js';
import { deepClone } from '../utils/math.js';
import { generateLFOWaveform } from '../../config/parameterRegistry.js';
import { GpsInstabilityTracker } from '../geospatial/GpsInstabilityTracker.js';

let context = null;
let stateSubscriptionInitialized = false;

export function setContext(ctx) {
	context = ctx;

	if (!stateSubscriptionInitialized && ctx.AppState) {
		stateSubscriptionInitialized = true;
		ctx.AppState.subscribe((action) => {
			if (action.type === 'SEQUENCER_UPDATED') {
				const sequencer = action.payload?.sequencer;
				if (sequencer && sequencer.tracks) {
					sequencer.tracks.forEach(track => {
						if (track.instrumentType === 'synth') {
							sequencer.updateTrackVolume(track);
						}
					});
				}
			}
		});
	}
}

export class DistanceSequencer {
	constructor(options = {}) {
		this.id = options.id || `seq_${Date.now()}`;
		if (!options.label) {
			const existingCount = Selectors.getSequencers().length;
			this.label = `Sequencer #${existingCount + 1}`;
		} else {
			this.label = options.label;
		}
		this.enabled = options.enabled !== undefined ? options.enabled : true;
		this.numSteps = options.numSteps || CONSTANTS.SEQUENCER_DEFAULT_STEPS;
		this.stepLength = options.stepLength || CONSTANTS.SEQUENCER_DEFAULT_LENGTH;
		this.speedThreshold = options.speedThreshold !== undefined ? options.speedThreshold : CONSTANTS.SEQUENCER_SPEED_THRESHOLD;
		this.releaseOnStop = options.releaseOnStop !== undefined ? options.releaseOnStop : true;
		this.releaseDelay = options.releaseDelay !== undefined ? options.releaseDelay : 0;
		this.loop = options.loop !== undefined ? options.loop : true;
		this.resumeOnReenter = options.resumeOnReenter !== undefined ? options.resumeOnReenter : false;
		this.restartOnReenter = options.restartOnReenter !== undefined ? options.restartOnReenter : false;
		this.activePaths = options.activePaths || [];
		this.sceneChangePaths = options.sceneChangePaths || [];
		this._sceneChangeInsideState = new Map();
		this._sceneChangeEntryOrder = [];
		this.baseSceneIndex = options.baseSceneIndex !== undefined ? options.baseSceneIndex : 0;
		this.tracks = options.tracks || [];
		this._listeners = {};
		this._tracksMap = new Map();

		const defaultSceneId = `scene_${Date.now()}`;
		this.scenes = options.scenes || [{ id: defaultSceneId, name: 'Scene 1' }];
		this.activeSceneIndex = options.activeSceneIndex || 0;

		if (options.tracks && options.tracks.length > 0) {
			this.tracks.forEach(track => {
				if (track.currentStep === undefined) {
					track.currentStep = -1;
				}
				if (track.instrumentType === 'synth' && track.synthParams) {
					if (!track.synthParams.lfo) {
						track.synthParams.lfo = track.lfo || deepClone(DEFAULT_LFO_STRUCTURE);
					}
					delete track.lfo;
				}

				if (!track.sceneSteps) {
					track.sceneSteps = {};
					const sceneId = this.scenes[0].id;
					track.sceneSteps[sceneId] = track.steps || [];
					track.steps = track.sceneSteps[sceneId];
				} else {
					const activeSceneId = this.scenes[this.activeSceneIndex].id;
					track.steps = track.sceneSteps[activeSceneId] || [];
				}

				this._tracksMap.set(track.id, track);

				if (track.instrumentType === 'sound' && track.instrumentId && AppState) {
					const sound = AppState.getSoundByPersistentId(track.instrumentId);
					if (sound) {
						setSequencerControl(sound, true);
					}
				}
			});
		}

		this.totalDistance = 0;
		this.lastStepDistance = 0;
		this.currentStep = -1;
		this.isActive = false;
		this.insideArea = true;
		this.lastPosition = null;
		this.positionHistory = [];

		this._activeNotes = new Map();
		this._synthPool = new Map();
		this._isMovingFastEnough = false;
		this._releaseTimeoutId = null;

		this.geoMode = false;
		this.gridMode = false;
	}

	addEventListener(event, callback) {
		if (!this._listeners[event]) {
			this._listeners[event] = [];
		}
		this._listeners[event].push(callback);
	}

	removeEventListener(event, callback) {
		if (this._listeners[event]) {
			this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
		}
	}

	dispatchEvent(event, data) {
		if (this._listeners[event]) {
			this._listeners[event].forEach(callback => callback(data));
		}
	}

	updatePosition(lat, lon) {
		if (!this.enabled) return;

		const currentPos = { lat, lon, timestamp: Date.now() };

		const userPos = L.latLng(lat, lon);
		const wasInside = this.insideArea;
		this.insideArea = context.PathZoneChecker.checkActivePaths(userPos, this.activePaths);

		if (!wasInside && this.insideArea) {
			this.dispatchEvent('enterArea');
			if (this.restartOnReenter) {
				this.reset();
			}
		} else if (wasInside && !this.insideArea) {
			this.dispatchEvent('exitArea');
			if (this._releaseTimeoutId) {
				clearTimeout(this._releaseTimeoutId);
				this._releaseTimeoutId = null;
			}
			this._releaseAllNotes();
		}
		this._updateSceneChangePaths(userPos);
		this.dispatchEvent('stateChange');

		if (!this.insideArea) return;

		if (!this.lastPosition) {
			this.lastPosition = currentPos;
			this.positionHistory = [currentPos];
			return;
		}

		const distance = context.map.distance(
			L.latLng(this.lastPosition.lat, this.lastPosition.lon),
			L.latLng(lat, lon)
		);

		if (distance > CONSTANTS.SEQUENCER_GPS_JUMP_THRESHOLD) {
			this.reset();
			this.lastPosition = currentPos;
			return;
		}

		if (distance < CONSTANTS.SEQUENCER_MIN_DELTA) {
			return;
		}

		this.positionHistory.push(currentPos);
		if (this.positionHistory.length > CONSTANTS.SEQUENCER_SMOOTH_SAMPLES) {
			this.positionHistory.shift();
		}

		const smoothedDistance = this.calculateSmoothedDistance();
		const timeDelta = (currentPos.timestamp - this.lastPosition.timestamp) / 1000;
		const speed = timeDelta > 0 ? smoothedDistance / timeDelta : 0;

		if (speed < this.speedThreshold) {
			if (this._isMovingFastEnough && this.releaseOnStop) {
				if (this.releaseDelay === 0) {
					this._releaseAllNotes();
				} else if (!this._releaseTimeoutId) {
					this._releaseTimeoutId = setTimeout(() => {
						this._releaseAllNotes();
						this._releaseTimeoutId = null;
					}, this.releaseDelay * 1000);
				}
			}
			this._isMovingFastEnough = false;
			this.lastPosition = currentPos;
			return;
		}

		if (this._releaseTimeoutId) {
			clearTimeout(this._releaseTimeoutId);
			this._releaseTimeoutId = null;
		}

		this._isMovingFastEnough = true;
		this.totalDistance += smoothedDistance;

		const distanceSinceLastGlobalStep = this.totalDistance - this.lastStepDistance;
		if (distanceSinceLastGlobalStep >= this.stepLength) {
			const stepsAdvanced = Math.floor(distanceSinceLastGlobalStep / this.stepLength);
			this.currentStep += stepsAdvanced;
			this.lastStepDistance += stepsAdvanced * this.stepLength;

			if (this.currentStep >= this.numSteps) {
				if (this.loop) {
					this.currentStep = this.currentStep % this.numSteps;
				} else {
					this.currentStep = this.numSteps - 1;
				}
			}
		}

		this.tracks.forEach(track => {
			const effectiveDistance = this.totalDistance - track.offset;

			if (effectiveDistance < 0) {
				return;
			}

			const trackSteps = Math.min(
				track.steps.length,
				track.numSteps !== undefined ? track.numSteps : this.numSteps
			);

			const absoluteStepCount = Math.floor(effectiveDistance / this.stepLength);
			const expectedStep = this.loop ? (absoluteStepCount % trackSteps) : Math.min(absoluteStepCount, trackSteps - 1);

			const nextStep = track.currentStep === -1 ? 0 : (track.currentStep + 1) % trackSteps;

			if (expectedStep === nextStep || (track.currentStep === -1 && expectedStep === 0)) {
				this.advanceTrackStep(track);
			}
		});

		this.dispatchEvent('stateChange');
		this.lastPosition = currentPos;
	}

	calculateSmoothedDistance() {
		if (this.positionHistory.length < 2) return 0;

		let totalDist = 0;
		for (let i = 1; i < this.positionHistory.length; i++) {
			const prev = this.positionHistory[i - 1];
			const curr = this.positionHistory[i];
			totalDist += context.map.distance(
				L.latLng(prev.lat, prev.lon),
				L.latLng(curr.lat, curr.lon)
			);
		}
		return totalDist / (this.positionHistory.length - 1);
	}

	async _getSynth(track) {
		if (!this._synthPool.has(track.id)) {
			const params = track.synthParams || initializeSynthParameters(track.synthType, 'sound', {}, context.PARAMETER_REGISTRY);
			if (!params.polyphony || params.polyphony < 8) {
				params.polyphony = 8;
			}

			const soundObj = await context.createFullSoundInstance({
				type: track.synthType,
				role: 'sound',
				params: params,
				color: '#8e44ad'
			}, { onMap: false });

			if (soundObj) {
				const gainValue = soundObj.params.volume * CONSTANTS.SEQUENCER_SYNTH_GAIN;
				soundObj.gain.gain.setValueAtTime(gainValue, Tone.now());

				if (track.synthType === 'SoundFile' && params.soundFile) {
					await context.autoLoadSoundFile(soundObj, params.soundFile);
					context._applySoundFilePlaybackParams(soundObj, false);
				}

				if (track.synthType === 'Sampler' && params.samplerMode === 'single' && params.soundFile) {
					await context.autoLoadSoundFile(soundObj, params.soundFile);
				}

				if (track.synthType === 'Sampler' && params.samplerMode === 'grid' && params.gridSamples && Object.keys(params.gridSamples).length > 0) {
				await new Promise((resolve) => {
					const checkLoaded = () => {
						if (soundObj.synth._buffers && soundObj.synth._buffers._buffers) {
							let allLoaded = true;
							soundObj.synth._buffers._buffers.forEach(buffer => {
								if (!buffer.loaded) allLoaded = false;
							});
							if (allLoaded) {
								soundObj.isReady = true;

								resolve();
							} else {
								setTimeout(checkLoaded, 100);
							}
						} else {
							setTimeout(checkLoaded, 100);
						}
					};
					checkLoaded();
				});
				}

				this._synthPool.set(track.id, soundObj);
			}
		}

		return this._synthPool.get(track.id);
	}

	updateTrackVolume(track) {
		const soundObj = this._synthPool.get(track.id);
		if (soundObj && soundObj.gain) {
			const gainValue = soundObj.params.volume * CONSTANTS.SEQUENCER_SYNTH_GAIN;
			const now = Tone.now();
			soundObj.gain.gain.cancelScheduledValues(now);
			soundObj.gain.gain.setValueAtTime(soundObj.gain.gain.value, now);
			soundObj.gain.gain.linearRampToValueAtTime(gainValue, now + 0.02);
		}
	}

	advanceTrackStep(track) {
		const nextStep = track.currentStep + 1;
		const trackSteps = Math.min(
			track.steps.length,
			track.numSteps !== undefined ? track.numSteps : this.numSteps
		);

		if (nextStep >= trackSteps) {
			if (this.loop) {
				track.currentStep = 0;
			} else {
				const activeNotes = this._activeNotes.get(track.id);
				if (activeNotes && activeNotes.size > 0) {
					activeNotes.forEach(note => {
						this._triggerRelease(track, note);
					});
					this._activeNotes.delete(track.id);
				}
				return;
			}
		} else {
			track.currentStep = nextStep;
		}

		this.dispatchEvent('stateChange');
		this.onTrackStepTrigger(track, track.currentStep);
	}

	processModulation() {
		if (!this.enabled) return;
		const now = Tone.now();
		this.tracks.forEach(track => {
			const activeNotes = this._activeNotes.get(track.id);
			const hasActiveNotes = activeNotes && activeNotes.size > 0;
			const inRelease = track._releaseUntil && now < track._releaseUntil;
			if (hasActiveNotes || inRelease) {
				this._processTrackModulation(track);
			}
		});
	}

	_processTrackModulation(track) {
		let soundObj;
		if (track.instrumentType === 'synth') {
			soundObj = this._synthPool.get(track.id);
		} else if (track.instrumentType === 'sound') {
			soundObj = AppState.getSoundByPersistentId(track.instrumentId);
		}

		if (!soundObj || !soundObj.synth || !soundObj.params.lfo) {
			return;
		}

		const now = Tone.now();
		const modulationOffsets = new Map();

		const addOffset = (target, offset) => {
			if (isNaN(offset)) return;
			const currentOffset = modulationOffsets.get(target) || 0;
			modulationOffsets.set(target, currentOffset + offset);
		};

		const trackContext = {
			currentStep: track.currentStep,
			numSteps: track.numSteps !== undefined ? track.numSteps : this.numSteps,
			totalDistance: this.totalDistance,
			trackId: track.id
		};

		const mods = ["mod1", "mod2", "mod3"];
		for (let i = 0; i < mods.length; i++) {
			const mod = mods[i];
			const { target, freq, range, source } = soundObj.params.lfo[mod];
			if (range > 0 || (freq > 0 && source !== 'lfo')) {
				const offset = this._processTrackInternalModulation(soundObj, mod, target, freq, range, source, now, trackContext);
				addOffset(target, offset);
			}
		}

		const fxMods = ["fxMod1", "fxMod2", "fxMod3"];
		for (let i = 0; i < fxMods.length; i++) {
			const mod = fxMods[i];
			if (soundObj.params.lfo[mod]) {
				const { target, freq, range, source } = soundObj.params.lfo[mod];
				if (target && target !== 'none' && (range > 0 || (freq > 0 && source !== 'lfo'))) {
					const offset = this._processTrackInternalModulation(soundObj, mod, target, freq, range, source, now, trackContext);
					this._processFXModulation(soundObj, target, offset);
				}
			}
		}

		if (!track._previouslyModulatedParams) {
			track._previouslyModulatedParams = new Set();
		}

		const modulatedParams = new Set(modulationOffsets.keys());
		const paramsToReset = new Set([...track._previouslyModulatedParams].filter(p => !modulatedParams.has(p)));

		paramsToReset.forEach(target => {
			if (target === 'pitch' || target === 'frequency') {
				context.updateSynthParam(soundObj, 'detune', soundObj.params.detune || 0, { isModulation: true });
			} else {
				const baseValue = soundObj.params[target];
				if (baseValue !== undefined) {
					context.updateSynthParam(soundObj, target, baseValue, { isModulation: true });
				}
			}
			track._previouslyModulatedParams.delete(target);
		});

		modulationOffsets.forEach((totalOffset, target) => {
			const def = context.PARAMETER_REGISTRY[target];
			if (!def) return;

			const baseValue = soundObj.params[target];
			if (baseValue === undefined) return;

			let finalValue;

			if (target === 'pitch' || target === 'frequency') {
				const detuneCents = target === 'pitch' ? totalOffset : (totalOffset / baseValue) * 1200;
				context.updateSynthParam(soundObj, 'detune', (soundObj.params.detune || 0) + detuneCents, { isModulation: true });

			} else {
				const paramMin = def.min !== undefined ? def.min : 0;
				const paramMax = def.max !== undefined ? def.max : 1;
				finalValue = Math.max(paramMin, Math.min(paramMax, baseValue + totalOffset));
				context.updateSynthParam(soundObj, target, finalValue, { isModulation: true });
			}

			track._previouslyModulatedParams.add(target);
		});
	}

	_processTrackInternalModulation(soundObj, mod, target, freq, range, source, t, trackContext) {
		const waveform = soundObj.params.lfo[mod].waveform || 'sine';
		if (!soundObj.params.lfo[mod].state) {
			soundObj.params.lfo[mod].state = {};
		}
		const modState = soundObj.params.lfo[mod].state;

		let lfoValue = 0;

		if (source === 'speed') {
			const userSpeed = context.getUserMovementSpeed();
			const referenceSpeed = soundObj.params.lfo[mod].referenceSpeed || 1.4;
			const normalizedSpeed = userSpeed / referenceSpeed;
			lfoValue = (normalizedSpeed - 1) * freq;

		} else if (source === 'stepPosition') {
			const direction = freq;
			if (trackContext.numSteps > 1 && trackContext.currentStep >= 0) {
				const normalizedPosition = trackContext.currentStep / (trackContext.numSteps - 1);
				const bipolarPosition = normalizedPosition * 2 - 1;
				lfoValue = bipolarPosition * direction;
			}

		} else if (source === 'randomStep') {
			if (trackContext.currentStep >= 0) {
				const seed = trackContext.trackId.charCodeAt(0) + trackContext.currentStep + Math.floor(freq * 1000);
				const random = ((seed * 9301 + 49297) % 233280) / 233280;
				lfoValue = random * 2 - 1;
			}

		} else if (source === 'walkableLFO') {
			const cyclesPerMeter = freq;
			const userSpeed = context.getUserMovementSpeed();
			const speedThreshold = soundObj.params.lfo[mod].speedThreshold !== undefined ? soundObj.params.lfo[mod].speedThreshold : 0.1;

			if (userSpeed < speedThreshold) {
				lfoValue = 0;
			} else {
				if (modState.walkablePhase === undefined) {
					modState.walkablePhase = 0;
					modState.walkableLastTime = t;
				}

				const deltaTime = t - modState.walkableLastTime;
				modState.walkableLastTime = t;

				const deltaPhase = userSpeed * cyclesPerMeter * deltaTime;
				modState.walkablePhase += deltaPhase;

				lfoValue = generateLFOWaveform(modState.walkablePhase * CONSTANTS.TWO_PI, waveform, modState);
			}

		} else if (source === 'gpsInstability') {
			const reactivity = soundObj.params.lfo[mod].instabilityReactivity ?? CONSTANTS.GPS_INSTABILITY_REACTIVITY_DEFAULT;
			GpsInstabilityTracker.setReactivity(reactivity);
			lfoValue = GpsInstabilityTracker.getSignedValue();

		} else if (source === 'distance' || source === 'x' || source === 'y') {
			lfoValue = 0;

		} else if (!source || source === "lfo") {
			const phase = t * freq * CONSTANTS.TWO_PI;
			lfoValue = generateLFOWaveform(phase, waveform, modState);
		}

		let def = context.PARAMETER_REGISTRY[target];

		// Handle FX targets (e.g., "slot1.delayTime")
		if (!def && target.includes('.')) {
			const parts = target.split('.');
			if (parts.length === 2) {
				const [slotKey, paramName] = parts;
				if (paramName === 'mix') {
					// Mix uses 0-100 range
					def = { min: 0, max: 100 };
				} else {
					// Look up FX parameter definition
					const fxParamKey = `fx_${paramName}`;
					def = context.PARAMETER_REGISTRY[fxParamKey];
				}
			}
		}

		if (!def) return 0;

		let totalModulationDepth;
		const rangePercent = range / 100;

		if (target === 'pitch') {
			totalModulationDepth = rangePercent * 1200;
		} else if (target === 'frequency') {
			const fullRange = CONSTANTS.MODULATION_FREQ_MAX - CONSTANTS.MODULATION_FREQ_MIN;
			totalModulationDepth = rangePercent * fullRange;
		} else {
			const paramMin = def.min !== undefined ? def.min : 0;
			const paramMax = def.max !== undefined ? def.max : 1;
			const fullRange = paramMax - paramMin;
			totalModulationDepth = rangePercent * fullRange;
		}

		return lfoValue * (totalModulationDepth / 2);
	}

	_processFXModulation(soundObj, target, offset) {
		if (!target || target === 'none' || !offset || isNaN(offset)) return;

		const parts = target.split('.');
		if (parts.length !== 2) return;

		const [slotKey, paramName] = parts;
		const slotNum = parseInt(slotKey.replace('slot', ''));
		if (isNaN(slotNum) || slotNum < 1 || slotNum > 3) return;

		const fxKey = `fx${slotNum}`;
		const fxNode = soundObj[fxKey];
		if (!fxNode) return;

		if (!soundObj.params.fx) return;
		const slotConfig = soundObj.params.fx[slotKey];
		if (!slotConfig || slotConfig.type === 'none') return;

		if (!soundObj._fxOriginalValues) {
			soundObj._fxOriginalValues = {};
		}
		if (!soundObj._fxOriginalValues[slotKey]) {
			soundObj._fxOriginalValues[slotKey] = {};
		}

		if (paramName === 'mix') {
			if (soundObj._fxOriginalValues[slotKey].mix === undefined) {
				soundObj._fxOriginalValues[slotKey].mix = slotConfig.mix !== undefined ? slotConfig.mix : 50;
			}
			const baseValue = soundObj._fxOriginalValues[slotKey].mix;
			const finalValue = Math.max(0, Math.min(100, baseValue + offset));
			if (fxNode.wet) {
				fxNode.wet.value = finalValue / 100;
			}
		} else {
			const normalizedParam = paramName.replace('_long', '');

			if (soundObj._fxOriginalValues[slotKey][normalizedParam] === undefined) {
				if (slotConfig.params && slotConfig.params[normalizedParam] !== undefined) {
					soundObj._fxOriginalValues[slotKey][normalizedParam] = slotConfig.params[normalizedParam];
				} else if (fxNode[normalizedParam] !== undefined) {
					if (typeof fxNode[normalizedParam].value !== 'undefined') {
						soundObj._fxOriginalValues[slotKey][normalizedParam] = fxNode[normalizedParam].value;
					} else {
						soundObj._fxOriginalValues[slotKey][normalizedParam] = fxNode[normalizedParam];
					}
				}
			}

			if (soundObj._fxOriginalValues[slotKey][normalizedParam] !== undefined) {
				const baseValue = soundObj._fxOriginalValues[slotKey][normalizedParam];
				let finalValue = baseValue + offset;

				if (fxNode[normalizedParam] !== undefined) {
					try {
						if (typeof fxNode[normalizedParam].value !== 'undefined') {
							const param = fxNode[normalizedParam];
							if (param.minValue !== undefined && param.maxValue !== undefined) {
								finalValue = Math.max(param.minValue, Math.min(param.maxValue, finalValue));
							}
							param.value = finalValue;
						} else {
							fxNode[normalizedParam] = finalValue;
						}
					} catch (error) {
						console.warn(`Error applying FX modulation to ${slotKey}.${normalizedParam}:`, error);
					}
				}
			}
		}
	}

	async onTrackStepTrigger(track, stepIndex) {
		if (!track.steps[stepIndex]) {
			console.warn(`Step ${stepIndex} does not exist for track ${track.id}`);
			return;
		}

		this._processTrackModulation(track);

		const previouslyActiveNotes = this._activeNotes.get(track.id) || new Set();
		const notesForThisStep = new Set();
		const sustainedNotes = new Set();

		track.steps[stepIndex].notes.forEach(note => notesForThisStep.add(note));

		if (previouslyActiveNotes.size > 0) {
			track.steps[stepIndex].sustains.forEach(sustainedNote => {
				if (previouslyActiveNotes.has(sustainedNote)) {
					notesForThisStep.add(sustainedNote);
					sustainedNotes.add(sustainedNote);
				}
			});
		}

		const notesToStop = new Set([...previouslyActiveNotes].filter(note => !sustainedNotes.has(note)));
		const notesToRetrigger = new Set([...track.steps[stepIndex].notes].filter(note => previouslyActiveNotes.has(note) && !sustainedNotes.has(note)));
		const notesToStart = new Set([...track.steps[stepIndex].notes].filter(note => !previouslyActiveNotes.has(note)));

		const hasSustainedNotes = sustainedNotes.size > 0;
		const willHaveActiveNotes = notesForThisStep.size > 0;
		const hadActiveNotes = previouslyActiveNotes.size > 0;

		for (const midiNote of notesToStop) {
			await this._triggerRelease(track, midiNote, willHaveActiveNotes);
		}

		for (const midiNote of notesToRetrigger) {
			await this._triggerRelease(track, midiNote, willHaveActiveNotes);
		}

		const allNotesToTrigger = new Set([...notesToStart, ...notesToRetrigger]);
		if (allNotesToTrigger.size > 0) {
			const notesArray = Array.from(allNotesToTrigger);
			const velocities = track.steps[stepIndex].velocities || {};
		const velocitiesNormalized = {};
		notesArray.forEach(note => {
			const midiVel = velocities[note] ?? 100;
			velocitiesNormalized[note] = midiVel / 127;
		});
			try {
				await this._triggerAttackChord(track, notesArray, velocitiesNormalized, hasSustainedNotes || hadActiveNotes);
			} catch (error) {
				console.error(`Sequencer error on track ${track.id}:`, error.message);
			}
		}

		this._activeNotes.set(track.id, notesForThisStep);
	}

	async _triggerAttackChord(track, midiNotes, velocity, hasActiveNotes = false) {
		const handleAttack = async (soundObj) => {
			if (!soundObj || !soundObj.synth) {
				return;
			}

			if (track.instrumentType === 'sound') {
				const userPos = context.GeolocationManager?.getUserPosition();
				if (userPos) {
					const isInside = context.Geometry.isPointInShape(userPos, soundObj);
					if (!isInside) {
						return;
					}
				}
			}

			const requiredPolyphony = midiNotes.length;
			if (soundObj.params.polyphony < requiredPolyphony) {
				soundObj.params.polyphony = requiredPolyphony;

				if (soundObj.synth instanceof Tone.Sampler) {
					soundObj.synth.maxPolyphony = requiredPolyphony;
				} else if (soundObj.synth instanceof Tone.PolySynth) {
					soundObj.synth.set({ maxPolyphony: requiredPolyphony });
				} else if (soundObj.synth instanceof Tone.Synth || soundObj.synth instanceof Tone.AMSynth || soundObj.synth instanceof Tone.FMSynth) {
					await context._upgradeSynthToPolyphonic(soundObj, requiredPolyphony);
				}
			}

			const avgVelocity = Object.values(velocity).reduce((sum, v) => sum + v, 0) / Object.keys(velocity).length || 0.8;

			if (soundObj.type === 'SoundFile' && soundObj.synth.loaded) {
				if (soundObj.envelopeGain) {
					soundObj.envelopeGain.gain.setValueAtTime(avgVelocity, Tone.now());
				}
				if (soundObj.params.loop) {
					context.startLoopedPlayback(soundObj);
				} else {
					soundObj.synth.start();
				}
				soundObj.isPlaying = true;
			} else if (soundObj.type === 'StreamPlayer') {
				if (soundObj.envelopeGain) {
					soundObj.envelopeGain.gain.setValueAtTime(avgVelocity, Tone.now());
				}
				await context.StreamManager.playStream(soundObj);
			} else {
				if (soundObj.envelopeGain) {
					const now = Tone.now();
					const attack = soundObj.params.attack || 0.01;
					soundObj.envelopeGain.gain.cancelScheduledValues(now);

					if (hasActiveNotes) {
						soundObj.envelopeGain.gain.setValueAtTime(soundObj.envelopeGain.gain.value, now);
						soundObj.envelopeGain.gain.linearRampToValueAtTime(avgVelocity, now + attack);
					} else {
						soundObj.envelopeGain.gain.setValueAtTime(0, now);
						soundObj.envelopeGain.gain.linearRampToValueAtTime(avgVelocity, now + attack);
					}
				}
				const useVelocity = soundObj.type === 'Sampler' ? velocity : null;
				PolyphonyManager.triggerPolyphonic(soundObj.synth, midiNotes, true, soundObj, null, useVelocity);
				soundObj.isPlaying = true;
			}
		};

		if (track.instrumentType === 'sound') {
			const sound = AppState.getSoundByPersistentId(track.instrumentId);
			if (!sound) return;
			await handleAttack(sound);
		} else if (track.instrumentType === 'synth') {
			try {
				const soundObj = await this._getSynth(track);
				await handleAttack(soundObj);
			} catch (error) {
				console.error("Error preparing synth for sequencer:", error);
			}
		}
	}

	async _triggerAttack(track, midiNote, velocity, hasActiveNotes = false) {
		this._triggerAttackChord(track, [midiNote], velocity, hasActiveNotes);
	}

	async _triggerRelease(track, midiNote, willHaveActiveNotes = false) {
		if (track.instrumentType === 'synth') {
			const soundObj = this._synthPool.get(track.id);
			if (soundObj && soundObj.synth && !soundObj.synth.disposed) {
				if (soundObj.type === 'SoundFile') {
					if (soundObj._loopActive) {
						context.stopLoopedPlayback(soundObj);
					} else if (soundObj.synth.state === 'started') {
						soundObj.synth.stop();
					}
				} else if (soundObj.type === 'StreamPlayer') {
					context.StreamManager.stopStream(soundObj);
				} else if (soundObj.synth instanceof Tone.NoiseSynth) {
					soundObj.synth.triggerRelease();
					if (!willHaveActiveNotes && soundObj.envelopeGain) {
						const release = soundObj.params.release || 0.1;
						this._exponentialRelease(soundObj.envelopeGain.gain, release);
						track._releaseUntil = Tone.now() + release;
					}
				} else {
					const note = Tone.Frequency(midiNote, 'midi').toNote();

					if (soundObj.synth instanceof Tone.Sampler) {
						if (soundObj.synth._manualSources && soundObj.synth._manualSources.has(note)) {
							const sources = soundObj.synth._manualSources.get(note);
							const now = Tone.now();
							const stopTime = now + (soundObj.synth.release || 0.1);
							while (sources.length > 0) {
								const source = sources.shift();
								source.stop(stopTime);
							}
						}

						if (soundObj.synth._activeNotes) {
							soundObj.synth._activeNotes.delete(note);
						}
						soundObj.synth.triggerRelease(note);
					} else if (soundObj.synth instanceof Tone.PolySynth) {
						if (soundObj.synth.voice === Tone.NoiseSynth) {
							soundObj.synth.triggerRelease();
						} else {
							soundObj.synth.triggerRelease([note]);
						}
					} else if (soundObj.synth.triggerRelease) {
						soundObj.synth.triggerRelease();
					}

					if (!willHaveActiveNotes && soundObj.envelopeGain) {
						const release = soundObj.params.release || 0.1;
						this._exponentialRelease(soundObj.envelopeGain.gain, release);
						track._releaseUntil = Tone.now() + release;
					}
				}
			}
		} else if (track.instrumentType === 'sound') {
			const soundEl = AppState.getSoundByPersistentId(track.instrumentId);
			if (soundEl && soundEl.synth && !soundEl.synth.disposed) {
				if (soundEl.type === 'SoundFile') {
					if (soundEl._loopActive) {
						context.stopLoopedPlayback(soundEl);
					} else if (soundEl.synth.state === 'started') {
						soundEl.synth.stop();
					}
					soundEl.isPlaying = false;
				} else if (soundEl.synth instanceof Tone.NoiseSynth) {
					soundEl.synth.triggerRelease();
					if (!willHaveActiveNotes && soundEl.envelopeGain) {
						const release = soundEl.params.release || 0.1;
						this._exponentialRelease(soundEl.envelopeGain.gain, release);
						track._releaseUntil = Tone.now() + release;
					}
				} else {
					const note = Tone.Frequency(midiNote, 'midi').toNote();

					if (soundEl.synth instanceof Tone.Sampler) {
						if (soundEl.synth._activeNotes) {
							soundEl.synth._activeNotes.delete(note);
						}
						soundEl.synth.triggerRelease(note);
					} else if (soundEl.synth instanceof Tone.PolySynth) {
						if (soundEl.synth.voice === Tone.NoiseSynth) {
							soundEl.synth.triggerRelease();
						} else {
							soundEl.synth.triggerRelease([note]);
						}
					} else if (soundEl.synth.triggerRelease) {
						soundEl.synth.triggerRelease();
					}

					if (!willHaveActiveNotes && soundEl.envelopeGain) {
						const release = soundEl.params.release || 0.1;
						this._exponentialRelease(soundEl.envelopeGain.gain, release);
						track._releaseUntil = Tone.now() + release;
					}
				}
			}
		}
	}

	async _releaseAllNotes() {
		const releasePromises = [];
		this._activeNotes.forEach((notes, trackId) => {
			const track = this._tracksMap.get(trackId);
			if (track) {
				notes.forEach(note => {
					releasePromises.push(this._triggerRelease(track, note));
				});
			}
		});
		await Promise.all(releasePromises);
		this._activeNotes.clear();
	}

	reset() {
		if (this._releaseTimeoutId) {
			clearTimeout(this._releaseTimeoutId);
			this._releaseTimeoutId = null;
		}
		this.totalDistance = 0;
		this.lastStepDistance = 0;
		this.currentStep = -1;
		this.lastPosition = null;
		this.positionHistory = [];
		this._releaseAllNotes();

		this.tracks.forEach(track => {
			track.currentStep = -1;
		});

		this.dispatchEvent('stateChange');
	}

	stop() {
		if (this._releaseTimeoutId) {
			clearTimeout(this._releaseTimeoutId);
			this._releaseTimeoutId = null;
		}
		this.isActive = false;

		this._releaseAllNotes();

		this._synthPool.forEach(soundObj => context.destroySound(soundObj));
		this._synthPool.clear();

		this.dispatchEvent('stateChange');

	}

	addTrack(trackData = {}) {
		const params = trackData.synthParams || (() => {
			const p = initializeSynthParameters(trackData.synthType || 'Synth', 'sound', {}, context.PARAMETER_REGISTRY);
			p.polyphony = 8;
			return p;
		})();

		if (!params.lfo) {
			params.lfo = trackData.lfo || deepClone(DEFAULT_LFO_STRUCTURE);
		}

		const numSteps = trackData.numSteps !== undefined ? trackData.numSteps : this.numSteps;
		const makeEmptySteps = (count) => Array(count).fill(null).map(() => ({
			notes: [],
			sustains: [],
			velocity: 0.8
		}));

		const activeSceneId = this.scenes[this.activeSceneIndex].id;
		const sceneSteps = {};
		if (trackData.sceneSteps) {
			Object.assign(sceneSteps, trackData.sceneSteps);
		} else {
			const initialSteps = trackData.steps || makeEmptySteps(numSteps);
			this.scenes.forEach(scene => {
				sceneSteps[scene.id] = scene.id === activeSceneId ? initialSteps : makeEmptySteps(numSteps);
			});
		}

		const track = {
			id: `track_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
			instrumentType: trackData.instrumentType || 'synth',
			instrumentId: trackData.instrumentId || null,
			synthType: trackData.synthType || 'Synth',
			synthParams: params,
			octave: trackData.octave !== undefined ? trackData.octave : 4,
			numSteps: numSteps,
			sceneSteps: sceneSteps,
			steps: sceneSteps[activeSceneId],
			paramTarget: trackData.paramTarget || 'pitch',
			editMode: trackData.editMode || 'note',
			offsetMode: trackData.offsetMode || 'division',
			offsetFraction: trackData.offsetFraction !== undefined ? trackData.offsetFraction : 0,
			offsetSteps: trackData.offsetSteps !== undefined ? trackData.offsetSteps : 0,
			offset: trackData.offset !== undefined ? trackData.offset : 0,
			currentStep: -1
		};
		this.tracks.push(track);
		this._tracksMap.set(track.id, track);

		if (track.instrumentType === 'sound' && track.instrumentId) {
			const sound = AppState.getSoundByPersistentId(track.instrumentId);
			if (sound) {
				setSequencerControl(sound, true);
			}
		}

		this.dispatchEvent('stateChange');
		return track;
	}

	duplicateTrack(trackId) {
		const source = this._tracksMap.get(trackId);
		if (!source) return;

		const sceneSteps = {};
		for (const [sceneId, steps] of Object.entries(source.sceneSteps)) {
			sceneSteps[sceneId] = deepClone(steps);
		}

		const newTrack = this.addTrack({
			instrumentType: source.instrumentType,
			instrumentId: source.instrumentId,
			synthType: source.synthType,
			synthParams: deepClone(source.synthParams),
			octave: source.octave,
			numSteps: source.numSteps,
			sceneSteps,
			paramTarget: source.paramTarget,
			editMode: source.editMode,
			offsetMode: source.offsetMode,
			offsetFraction: source.offsetFraction,
			offsetSteps: source.offsetSteps,
			offset: source.offset
		});
		newTrack.currentStep = source.currentStep;
		return newTrack;
	}

	async removeTrack(trackId) {
		const track = this._tracksMap.get(trackId);
		if (!track) return;

		const activeNotes = this._activeNotes.get(trackId);
		if (activeNotes && activeNotes.length > 0) {
			const releasePromises = activeNotes.map(note => this._triggerRelease(track, note));
			await Promise.all(releasePromises);
			this._activeNotes.delete(trackId);
		}

		const soundObj = this._synthPool.get(trackId);
		if (soundObj) {
			context.destroySound(soundObj);
			this._synthPool.delete(trackId);
		}

		const index = this.tracks.indexOf(track);
		if (index > -1) {
			this.tracks.splice(index, 1);
		}
		this._tracksMap.delete(trackId);

		if (track.instrumentType === 'sound' && track.instrumentId) {
			const sound = AppState.getSoundByPersistentId(track.instrumentId);
			if (sound) {
				const stillControlled = Selectors.getSequencers().some(seq =>
					seq.tracks.some(t =>
						t.instrumentType === 'sound' &&
						t.instrumentId === track.instrumentId &&
						t.id !== trackId
					)
				);
				if (!stillControlled) {
					setSequencerControl(sound, false);
				}
			}
		}
	}

	updateStepCount(newCount) {
		const oldCount = this.numSteps;
		this.numSteps = Math.max(CONSTANTS.SEQUENCER_MIN_STEPS, Math.min(newCount, CONSTANTS.SEQUENCER_MAX_STEPS));
		this.tracks.forEach(track => {
			if (track.numSteps !== undefined) return;

			if (this.numSteps > oldCount) {
				for (const sceneId of Object.keys(track.sceneSteps)) {
					const steps = track.sceneSteps[sceneId];
					for (let i = oldCount; i < this.numSteps; i++) {
						steps.push({ notes: [], sustains: [], velocity: 0.8 });
					}
				}
			}

			if (track.currentStep >= this.numSteps) {
				track.currentStep = this.numSteps - 1;
			}
		});

		if (this.currentStep >= this.numSteps) {
			this.currentStep = this.numSteps - 1;
		}
		this.dispatchEvent('stateChange');
	}

	_exponentialRelease(gainParam, duration) {
		const now = Tone.now();
		const currentValue = Math.max(0.001, gainParam.value);
		gainParam.cancelScheduledValues(now);
		gainParam.setValueAtTime(currentValue, now);
		gainParam.exponentialRampToValueAtTime(0.001, now + duration);
		gainParam.setValueAtTime(0, now + duration);
	}

	_updateSceneChangePaths(userPos) {
		if (!this.sceneChangePaths || this.sceneChangePaths.length === 0) return;

		const currentStates = context.PathZoneChecker.checkIndividualPaths(userPos, this.sceneChangePaths);
		let changed = false;

		for (const config of this.sceneChangePaths) {
			const isInside = currentStates.get(config.id) || false;
			const wasInside = this._sceneChangeInsideState.get(config.id) || false;
			this._sceneChangeInsideState.set(config.id, isInside);

			if (!wasInside && isInside) {
				this._sceneChangeEntryOrder = this._sceneChangeEntryOrder.filter(id => id !== config.id);
				this._sceneChangeEntryOrder.push(config.id);
				changed = true;
			} else if (wasInside && !isInside) {
				this._sceneChangeEntryOrder = this._sceneChangeEntryOrder.filter(id => id !== config.id);
				changed = true;
			}
		}

		if (changed) {
			const targetIndex = this._resolveCurrentScene();
			if (targetIndex !== this.activeSceneIndex) {
				this.switchScene(targetIndex);
			}
		}
	}

	_resolveCurrentScene() {
		for (let i = this._sceneChangeEntryOrder.length - 1; i >= 0; i--) {
			const id = this._sceneChangeEntryOrder[i];
			const config = this.sceneChangePaths.find(c => c.id === id);
			if (!config) continue;
			const isInside = this._sceneChangeInsideState.get(id);
			if (isInside) {
				const sceneIndex = config.sceneIndex;
				if (sceneIndex >= 0 && sceneIndex < this.scenes.length) {
					return sceneIndex;
				}
			}
		}
		return this.baseSceneIndex;
	}

	getActiveSceneId() {
		return this.scenes[this.activeSceneIndex].id;
	}

	addScene(copyFromCurrent = false) {
		const newId = `scene_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
		const existingNumbers = this.scenes.map(s => {
			const match = s.name.match(/^Scene (\d+)$/);
			return match ? parseInt(match[1]) : 0;
		});
		const name = `Scene ${Math.max(0, ...existingNumbers) + 1}`;
		this.scenes.push({ id: newId, name });

		this.tracks.forEach(track => {
			const numSteps = track.numSteps !== undefined ? track.numSteps : this.numSteps;
			if (copyFromCurrent) {
				track.sceneSteps[newId] = deepClone(track.steps);
			} else {
				track.sceneSteps[newId] = Array(numSteps).fill(null).map(() => ({
					notes: [], sustains: [], velocity: 0.8
				}));
			}
		});

		this.switchScene(this.scenes.length - 1);
		return this.scenes[this.scenes.length - 1];
	}

	deleteScene(sceneIndex) {
		if (this.scenes.length <= 1) return;

		const sceneId = this.scenes[sceneIndex].id;
		this.scenes.splice(sceneIndex, 1);

		this.tracks.forEach(track => {
			delete track.sceneSteps[sceneId];
		});

		if (this.activeSceneIndex >= this.scenes.length) {
			this.activeSceneIndex = this.scenes.length - 1;
		}
		const activeSceneId = this.getActiveSceneId();
		this.tracks.forEach(track => {
			track.steps = track.sceneSteps[activeSceneId];
		});

		this.dispatchEvent('stateChange');
	}

	switchScene(sceneIndex) {
		if (sceneIndex < 0 || sceneIndex >= this.scenes.length) return;
		this.activeSceneIndex = sceneIndex;
		const activeSceneId = this.getActiveSceneId();
		this.tracks.forEach(track => {
			track.steps = track.sceneSteps[activeSceneId];
		});
		this.dispatchEvent('stateChange');
	}

	onEnterGeoFence(areaId) {

		this.reset();
	}

	onExitGeoFence(areaId) {
		if (this._releaseTimeoutId) {
			clearTimeout(this._releaseTimeoutId);
			this._releaseTimeoutId = null;
		}
		this._releaseAllNotes();
	}

	onEnterHex(cellId) {}
}
