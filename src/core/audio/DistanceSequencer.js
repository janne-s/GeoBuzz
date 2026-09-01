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
import { applySoundModulationPatches } from './SoundModulation.js';
import { openSoundFile, closeSoundFile, scheduleLoopFades } from './SoundLifecycle.js';
import { evaluateSpeedGate, createSpeedGateState } from './SpeedGate.js';
import { applyModShaping } from './ModShaping.js';
import { fxTailSeconds } from './FxTail.js';
import { LayerManager } from '../../layers/LayerManager.js';

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

function dropStaleSoundRefs(configs) {
	if (!configs || configs.length === 0) return [];
	return configs.filter(config => {
		if (config.type !== 'sound' || typeof config.id === 'string') return true;
		console.warn(`Dropping stale sequencer sound reference (${config.id})`);
		return false;
	});
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
		this.speedScale = options.speedScale || CONSTANTS.SEQUENCER_SPEED_SCALE_MIN;
		this.speedGateMin = options.speedGateMin !== undefined ? options.speedGateMin : CONSTANTS.SEQUENCER_SPEED_THRESHOLD;
		this.speedGateMax = options.speedGateMax !== undefined ? options.speedGateMax : CONSTANTS.SEQUENCER_SPEED_GATE_MAX;
		this.speedGateHold = options.speedGateHold !== undefined ? options.speedGateHold : CONSTANTS.SEQUENCER_SPEED_GATE_HOLD_DEFAULT;
		this.releaseOnStop = options.releaseOnStop !== undefined ? options.releaseOnStop : true;
		this.releaseDelay = options.releaseDelay !== undefined ? options.releaseDelay : 0;
		this.loop = options.loop !== undefined ? options.loop : true;
		this.muted = options.muted || false;
		this.soloed = options.soloed || false;
		this.resumeOnReenter = options.resumeOnReenter !== undefined ? options.resumeOnReenter : false;
		this.restartOnReenter = options.restartOnReenter !== undefined ? options.restartOnReenter : false;
		this.activePaths = dropStaleSoundRefs(options.activePaths);
		this.sceneChangePaths = dropStaleSoundRefs(options.sceneChangePaths);
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
		this.insideArea = false;
		this.lastPosition = null;
		this.positionHistory = [];

		this._activeNotes = new Map();
		this._synthPool = new Map();
		this._pendingSynths = new Map();
		this._synthGeneration = 0;
		this._silencingGain = 1;
		this._isMovingFastEnough = false;
		this._releaseTimeoutId = null;
		this._speedGateState = createSpeedGateState();

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

	_evaluateSpeedGate(speed, nowMs) {
		const inRange = speed >= this.speedGateMin && speed <= this.speedGateMax;
		return evaluateSpeedGate(this._speedGateState, inRange, this.speedGateHold, nowMs, speed);
	}

	_handleGateClosed() {
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
	}

	updatePosition(lat, lon) {
		if (!this.enabled) return;

		const currentPos = { lat, lon, timestamp: Date.now() };

		const userPos = L.latLng(lat, lon);
		const wasInside = this.insideArea;
		this.insideArea = context.PathZoneChecker.checkActivePaths(userPos, this.activePaths);

		if (!wasInside && this.insideArea) {
			this.dispatchEvent('enterArea');
			this._prewarmTracks();
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
		this._dispatchStateChangeIfChanged();

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

		const elapsed = (currentPos.timestamp - this.lastPosition.timestamp) / 1000;

		if (distance < CONSTANTS.SEQUENCER_MIN_DELTA) {
			if (elapsed >= CONSTANTS.SEQUENCER_IDLE_SAMPLE_SECONDS) {
				const idleSpeed = distance / elapsed;
				if (idleSpeed < this.speedGateMin || idleSpeed > this.speedGateMax) {
					this._handleGateClosed();
				}
			}
			return;
		}

		this.positionHistory.push(currentPos);
		if (this.positionHistory.length > CONSTANTS.SEQUENCER_SMOOTH_SAMPLES) {
			this.positionHistory.shift();
		}

		const smoothedDistance = this.calculateSmoothedDistance();
		const speed = elapsed > 0 ? smoothedDistance / elapsed : 0;

		const gateOpen = this._evaluateSpeedGate(speed, currentPos.timestamp);

		if (!gateOpen) {
			this._handleGateClosed();
			this.lastPosition = currentPos;
			return;
		}

		if (this._releaseTimeoutId) {
			clearTimeout(this._releaseTimeoutId);
			this._releaseTimeoutId = null;
		}

		this._isMovingFastEnough = true;
		this.totalDistance += smoothedDistance * this.speedScale;

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

			if (track.currentStep === -1 || track._lastAbsoluteStep === undefined) {
				track.currentStep = expectedStep;
				track._lastAbsoluteStep = absoluteStepCount;
				this.dispatchEvent('stateChange');
				this.onTrackStepTrigger(track, expectedStep);
			} else {
				const pending = this.loop
					? absoluteStepCount - track._lastAbsoluteStep
					: (expectedStep - track.currentStep + trackSteps) % trackSteps;
				track._lastAbsoluteStep = absoluteStepCount;
				if (pending > 0) {
					this._scheduleTrackSteps(track, pending, elapsed, trackSteps);
				}
			}
		});

		this._dispatchStateChangeIfChanged();
		this.lastPosition = currentPos;
	}

	_dispatchStateChangeIfChanged() {
		const signature = `${this.insideArea}|${this.currentStep}|${this.activeSceneIndex}|${Math.round(this.totalDistance * 10)}`;
		if (signature === this._stateSignature) return;
		this._stateSignature = signature;
		this.dispatchEvent('stateChange');
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

	_prewarmTracks() {
		this.tracks.forEach(track => {
			if (track.instrumentType !== 'synth') return;
			if (this._synthPool.has(track.id)) return;
			this._getSynth(track).catch(error => {
				console.error("Error preparing synth for sequencer:", error);
			});
		});
	}

	_getSynth(track) {
		if (this._synthPool.has(track.id)) return Promise.resolve(this._synthPool.get(track.id));

		const pending = this._pendingSynths.get(track.id);
		if (pending) return pending;

		const generation = this._synthGeneration;
		const creation = this._createTrackSynth(track).then(soundObj => {
			this._pendingSynths.delete(track.id);
			if (!soundObj) return undefined;

			if (generation !== this._synthGeneration) {
				context.destroySound(soundObj);
				return undefined;
			}

			this._synthPool.set(track.id, soundObj);
			return soundObj;
		}).catch(error => {
			this._pendingSynths.delete(track.id);
			throw error;
		});

		this._pendingSynths.set(track.id, creation);
		return creation;
	}

	async _createTrackSynth(track) {
		const params = track.synthParams || initializeSynthParameters(track.synthType, 'sound', {}, context.PARAMETER_REGISTRY);
		const authoredPolyphony = params.polyphony;
		const polyphony = Math.max(authoredPolyphony || 1, CONSTANTS.SEQUENCER_TRACK_POLYPHONY);

		const soundObj = await context.createFullSoundInstance({
			type: track.synthType,
			role: 'sound',
			params: { ...params, polyphony },
			layers: [...(track.layers || [])],
			color: '#8e44ad'
		}, { onMap: false });

		if (!soundObj) return null;

		soundObj._runtimePolyphony = polyphony;
		if (authoredPolyphony !== undefined) soundObj.params.polyphony = authoredPolyphony;

		soundObj.gain.gain.setValueAtTime(this._trackGainValue(soundObj), Tone.now());

		if (soundObj.type === 'Sampler') {
			soundObj.synth.attack = soundObj.params.attack ?? 0;
		}

		if (track.synthType === 'SoundFile' && params.soundFile) {
			await context.autoLoadSoundFile(soundObj, params.soundFile);
			context.applySoundFilePlaybackParams(soundObj, false);
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

		return soundObj;
	}

	_applyPolyphony(soundObj, required) {
		soundObj._runtimePolyphony = required;
		if (soundObj.synth instanceof Tone.Sampler) {
			soundObj.synth.maxPolyphony = required;
		} else if (soundObj.synth instanceof Tone.PolySynth) {
			soundObj.synth.set({ maxPolyphony: required });
		} else if (soundObj.synth instanceof Tone.Synth || soundObj.synth instanceof Tone.AMSynth || soundObj.synth instanceof Tone.FMSynth) {
			context._upgradeSynthToPolyphonic(soundObj, required);
		}
	}

	_trackGainValue(soundObj) {
		const volume = soundObj._modulatedVolume !== undefined ? soundObj._modulatedVolume : soundObj.params.volume;
		return volume * CONSTANTS.SEQUENCER_SYNTH_GAIN * this._silencingGain;
	}

	applySilencingGain(silencingGain) {
		if (silencingGain === this._silencingGain) return;
		this._silencingGain = silencingGain;
		this.tracks.forEach(track => this.updateTrackVolume(track));
	}

	updateTrackVolume(track) {
		const soundObj = this._synthPool.get(track.id);
		if (soundObj && soundObj.gain) {
			const now = Tone.now();
			soundObj.gain.gain.cancelAndHoldAtTime(now);
			soundObj.gain.gain.linearRampToValueAtTime(this._trackGainValue(soundObj), now + CONSTANTS.SEQUENCER_VELOCITY_RAMP);
		}
	}

	_trackTailSeconds(track) {
		const soundObj = this._synthPool.get(track.id);
		const release = soundObj?.params?.release ?? 0.1;
		const tail = soundObj?.type === 'SoundFile'
			? Math.max(release, soundObj?.params?.fadeOut ?? 0)
			: release;
		return fxTailSeconds(soundObj?.params?.fx, tail);
	}

	_wakeTrackAudio(track, soundObj) {
		if (track._bypassTimeout) {
			clearTimeout(track._bypassTimeout);
			track._bypassTimeout = null;
		}

		if (track._bypassFading && !track._audioBypassed) {
			track._bypassFading = false;
			if (soundObj?.gain && !soundObj.gain.disposed) {
				const resumeAt = Tone.now();
				soundObj.gain.gain.cancelScheduledValues(resumeAt);
				soundObj.gain.gain.setValueAtTime(soundObj.gain.gain.value, resumeAt);
				soundObj.gain.gain.linearRampToValueAtTime(
					this._trackGainValue(soundObj),
					resumeAt + CONSTANTS.FX_BYPASS_RAMP_TIME
				);
			}
			return;
		}

		if (!track._audioBypassed || !soundObj?.gain || soundObj.gain.disposed) return;

		track._audioBypassed = false;
		const now = Tone.now();
		soundObj.gain.gain.cancelScheduledValues(now);
		soundObj.gain.gain.setValueAtTime(0, now);

		soundObj.layers = [...(track.layers || [])];
		soundObj.layers.forEach(layerId => {
			const layer = LayerManager.getUserLayer(layerId);
			if (layer) LayerManager._wakeLayer(layer);
		});

		if (context.reconnectSoundToLayers) {
			context.reconnectSoundToLayers(soundObj);
		} else {
			soundObj.gain.toDestination();
		}
		soundObj.gain.gain.linearRampToValueAtTime(
			this._trackGainValue(soundObj),
			now + CONSTANTS.FX_BYPASS_RAMP_TIME
		);
	}

	_scheduleTrackBypass(track) {
		if (track._audioBypassed || track._bypassTimeout) return;
		if (!this._synthPool.has(track.id)) return;

		track._bypassTimeout = setTimeout(() => {
			track._bypassTimeout = null;
			if (this._activeNotes.get(track.id)?.size > 0) return;
			if (track._pendingSteps && track._pendingSteps.length > 0) return;

			const soundObj = this._synthPool.get(track.id);
			if (!soundObj?.gain || soundObj.gain.disposed) return;

			track._bypassFading = true;

			const fadeAt = Tone.now();
			soundObj.gain.gain.cancelScheduledValues(fadeAt);
			soundObj.gain.gain.setValueAtTime(soundObj.gain.gain.value, fadeAt);
			soundObj.gain.gain.linearRampToValueAtTime(0, fadeAt + CONSTANTS.SEQUENCER_BYPASS_FADE);

			setTimeout(() => {
				if (!track._bypassFading) return;
				track._bypassFading = false;

				if (!soundObj.gain || soundObj.gain.disposed) return;
				if (soundObj.synth && !soundObj.synth.disposed && soundObj.synth.releaseAll) {
					soundObj.synth.releaseAll();
				}

				soundObj.gain.disconnect();
				track._audioBypassed = true;
			}, CONSTANTS.SEQUENCER_BYPASS_FADE * 1000);
		}, this._trackTailSeconds(track) * 1000);
	}

	_clearTrackBypass(track) {
		if (track._bypassTimeout) {
			clearTimeout(track._bypassTimeout);
			track._bypassTimeout = null;
		}
		track._bypassFading = false;
		track._audioBypassed = false;
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

	_scheduleTrackSteps(track, pending, elapsed, trackSteps) {
		this.advanceTrackStep(track);
		if (pending < 2) return;

		const capped = Math.min(pending, trackSteps);
		if (capped < 2) return;

		const now = performance.now();
		const interval = (elapsed * 1000) / capped;
		track._pendingSteps = [];
		for (let i = 1; i < capped; i++) {
			track._pendingSteps.push(now + i * interval);
		}
	}

	processPendingSteps() {
		const now = performance.now();
		this.tracks.forEach(track => {
			const pending = track._pendingSteps;
			if (!pending || pending.length === 0) return;
			while (pending.length > 0 && pending[0] <= now) {
				pending.shift();
				this.advanceTrackStep(track);
			}
		});
	}

	scheduleTrackLoopFades() {
		this._synthPool.forEach(soundObj => {
			if (soundObj?._loopActive) {
				scheduleLoopFades(soundObj);
			}
		});
	}

	hasPendingWork() {
		const now = Tone.now();
		for (let i = 0; i < this.tracks.length; i++) {
			const track = this.tracks[i];
			if (track._pendingSteps && track._pendingSteps.length > 0) return true;
			if (track._releaseUntil && now < track._releaseUntil) return true;
			const notes = this._activeNotes.get(track.id);
			if (notes && notes.size > 0) return true;
		}
		return false;
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

		if (track.soundModulation && track.soundModulation.length > 0) {
			applySoundModulationPatches(track.soundModulation, {
				userPos: context.GeolocationManager?.getUserPosition(),
				selfPos: soundObj.marker ? soundObj.marker.getLatLng() : null,
				params: soundObj.params,
				smoothingKey: track.id,
				Geometry: context.Geometry,
				resolveSound: (id) => AppState.getSoundByPersistentId(id),
				addOffset
			});
		}

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

		let volumeChanged = false;

		paramsToReset.forEach(target => {
			if (target === 'pitch' || target === 'frequency') {
				context.updateSynthParam(soundObj, 'detune', soundObj.params.detune || 0, { isModulation: true });
			} else if (target === 'volume') {
				delete soundObj._modulatedVolume;
				volumeChanged = true;
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
				if (target === 'volume') {
					if (soundObj._modulatedVolume !== finalValue) {
						soundObj._modulatedVolume = finalValue;
						volumeChanged = true;
					}
				} else {
					context.updateSynthParam(soundObj, target, finalValue, { isModulation: true });
				}
			}

			track._previouslyModulatedParams.add(target);
		});

		if (volumeChanged) {
			this.updateTrackVolume(track);
		}
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

		return applyModShaping(soundObj.params.lfo[mod], lfoValue, trackContext.trackId, mod, t) * (totalModulationDepth / 2);
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
						} else if (Math.abs(fxNode[normalizedParam] - finalValue) > CONSTANTS.FX_PROPERTY_WRITE_EPSILON) {
							fxNode[normalizedParam] = finalValue;
						}
					} catch (error) {
						console.warn(`Error applying FX modulation to ${slotKey}.${normalizedParam}:`, error);
					}
				}
			}
		}
	}

	isTrackAudible(track) {
		const sequencers = Selectors.getSequencers();
		const anySeqSoloed = sequencers.some(s => s.soloed);
		if (anySeqSoloed && !this.soloed) return false;
		if (this.muted) return false;
		const anyTrackSoloed = this.tracks.some(t => t.soloed);
		if (anyTrackSoloed && !track.soloed) return false;
		if (track.muted) return false;
		return true;
	}

	releaseTrackNotes(track) {
		const activeNotes = this._activeNotes.get(track.id);
		if (activeNotes && activeNotes.size > 0) {
			activeNotes.forEach(note => this._triggerRelease(track, note));
			this._activeNotes.delete(track.id);
		}
		this._scheduleTrackBypass(track);
	}

	applyMuteState() {
		this.tracks.forEach(track => {
			if (!this.isTrackAudible(track)) {
				this.releaseTrackNotes(track);
			}
		});
	}

	onTrackStepTrigger(track, stepIndex) {
		if (!track.steps[stepIndex]) {
			console.warn(`Step ${stepIndex} does not exist for track ${track.id}`);
			this.releaseTrackNotes(track);
			return;
		}

		if (!this.isTrackAudible(track)) {
			this.releaseTrackNotes(track);
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

		const willHaveActiveNotes = notesForThisStep.size > 0;

		for (const midiNote of notesToStop) {
			this._triggerRelease(track, midiNote, willHaveActiveNotes);
		}

		const allNotesToTrigger = new Set([...notesToStart, ...notesToRetrigger]);

		const userSpeed = context.getUserMovementSpeed();
		const nowMs = performance.now();
		if (!track._noteHoldState) track._noteHoldState = {};

		const isNoteGateOpen = (note, fromStepIndex) => {
			const originStep = this._findNoteOriginStep(track, fromStepIndex, note);
			const step = track.steps[originStep];
			const gateMin = step?.speedGateMin?.[note] ?? CONSTANTS.SEQUENCER_SPEED_GATE_MIN;
			const gateMax = step?.speedGateMax?.[note] ?? CONSTANTS.SEQUENCER_SPEED_GATE_MAX;
			if (gateMin === CONSTANTS.SEQUENCER_SPEED_GATE_MIN && gateMax === CONSTANTS.SEQUENCER_SPEED_GATE_MAX) return true;
			if (!track._noteHoldState[note]) track._noteHoldState[note] = createSpeedGateState();
			const hold = step?.speedGateHold?.[note] ?? this.speedGateHold ?? 0;
			const inRange = userSpeed >= gateMin && userSpeed <= gateMax;
			return evaluateSpeedGate(track._noteHoldState[note], inRange, hold, nowMs, userSpeed);
		};

		for (const note of [...allNotesToTrigger]) {
			if (!isNoteGateOpen(note, stepIndex)) {
				allNotesToTrigger.delete(note);
				notesForThisStep.delete(note);
			}
		}

		for (const note of [...sustainedNotes]) {
			if (!isNoteGateOpen(note, stepIndex)) {
				notesForThisStep.delete(note);
				sustainedNotes.delete(note);
				this._triggerRelease(track, note, notesForThisStep.size > 0);
			}
		}

		track.steps[stepIndex].sustains.forEach(note => {
			if (sustainedNotes.has(note) || allNotesToTrigger.has(note)) return;
			if (isNoteGateOpen(note, stepIndex)) {
				allNotesToTrigger.add(note);
				notesForThisStep.add(note);
			}
		});

		this._activeNotes.set(track.id, notesForThisStep);

		if (allNotesToTrigger.size > 0) {
			const notesArray = Array.from(allNotesToTrigger);
			const velocities = track.steps[stepIndex].velocities || {};
			const velocitiesNormalized = {};
			notesArray.forEach(note => {
				const midiVel = velocities[note] ?? 100;
				velocitiesNormalized[note] = midiVel / 127;
			});
			try {
				this._triggerAttackChord(track, notesArray, velocitiesNormalized, notesForThisStep.size);
			} catch (error) {
				console.error(`Sequencer error on track ${track.id}:`, error.message);
			}
		}

		if (notesForThisStep.size === 0) {
			this._scheduleTrackBypass(track);
		}
	}

	_triggerAttackChord(track, midiNotes, velocity, soundingNotes = 0) {
		const handleAttack = (soundObj, notes = midiNotes) => {
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

			const requiredPolyphony = Math.max(notes.length, soundingNotes);
			if ((soundObj._runtimePolyphony ?? soundObj.params.polyphony ?? 1) < requiredPolyphony) {
				this._applyPolyphony(soundObj, requiredPolyphony);
			}

			const avgVelocity = Object.values(velocity).reduce((sum, v) => sum + v, 0) / Object.keys(velocity).length || 0.8;

			if (soundObj.type === 'SoundFile' && soundObj.synth.loaded) {
				openSoundFile(soundObj, avgVelocity);
			} else if (soundObj.type === 'StreamPlayer') {
				if (soundObj.envelopeGain) {
					soundObj.envelopeGain.gain.setValueAtTime(avgVelocity, Tone.now());
				}
				context.StreamManager.playStream(soundObj);
			} else {
				if (soundObj.envelopeGain) {
					const now = Tone.now();
					soundObj.envelopeGain.gain.cancelAndHoldAtTime(now);
					soundObj.envelopeGain.gain.linearRampToValueAtTime(avgVelocity, now + CONSTANTS.SEQUENCER_VELOCITY_RAMP);
				}
				const useVelocity = soundObj.type === 'Sampler' ? velocity : null;
				PolyphonyManager.triggerPolyphonic(soundObj.synth, notes, true, soundObj, null, useVelocity);
				soundObj.isPlaying = true;
			}
		};

		if (track.instrumentType === 'sound') {
			const sound = AppState.getSoundByPersistentId(track.instrumentId);
			if (!sound) return;
			handleAttack(sound);
		} else if (track.instrumentType === 'synth') {
			const pooled = this._synthPool.get(track.id);
			if (pooled) {
				this._wakeTrackAudio(track, pooled);
				handleAttack(pooled);
			} else {
				this._getSynth(track).then(soundObj => {
					if (!soundObj) return;

					const active = this._activeNotes.get(track.id);
					const stillActive = active ? midiNotes.filter(note => active.has(note)) : [];
					if (stillActive.length === 0) return;

					this._wakeTrackAudio(track, soundObj);
					handleAttack(soundObj, stillActive);
				}).catch(error => {
					console.error("Error preparing synth for sequencer:", error);
				});
			}
		}
	}

	_findNoteOriginStep(track, stepIndex, midiNote) {
		if (track.steps[stepIndex]?.notes?.includes(midiNote)) return stepIndex;
		for (let i = stepIndex - 1; i >= 0; i--) {
			if (track.steps[i]?.notes?.includes(midiNote)) return i;
			if (!track.steps[i]?.sustains?.includes(midiNote)) break;
		}
		return stepIndex;
	}

	_triggerRelease(track, midiNote, willHaveActiveNotes = false) {
		const soundObj = track.instrumentType === 'synth'
			? this._synthPool.get(track.id)
			: track.instrumentType === 'sound'
				? AppState.getSoundByPersistentId(track.instrumentId)
				: null;

		if (!soundObj || !soundObj.synth || soundObj.synth.disposed) return;

		const markRelease = seconds => {
			if (!willHaveActiveNotes) {
				track._releaseUntil = Tone.now() + seconds;
			}
		};

		if (soundObj.type === 'SoundFile') {
			closeSoundFile(soundObj);
			markRelease(soundObj.params.fadeOut || 0);
			return;
		}

		if (soundObj.type === 'StreamPlayer') {
			context.StreamManager.stopStream(soundObj);
			return;
		}

		if (soundObj.synth instanceof Tone.NoiseSynth) {
			soundObj.synth.triggerRelease();
			markRelease(soundObj.params.release || 0.1);
			return;
		}

		const note = Tone.Frequency(midiNote, 'midi').toNote();

		if (soundObj.synth instanceof Tone.Sampler) {
			if (soundObj.synth._manualSources && soundObj.synth._manualSources.has(note)) {
				const sources = soundObj.synth._manualSources.get(note);
				const stopTime = Tone.now();
				while (sources.length > 0) {
					const source = sources.shift();
					if (source.loop) source.loop = false;
					source.stop(stopTime);
				}
				soundObj.synth._manualSources.delete(note);
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

		markRelease(soundObj.params.release || 0.1);
	}

	_releaseAllNotes() {
		this.tracks.forEach(track => {
			track._pendingSteps = null;
			this._scheduleTrackBypass(track);
		});
		this._activeNotes.forEach((notes, trackId) => {
			const track = this._tracksMap.get(trackId);
			if (track) {
				notes.forEach(note => this._triggerRelease(track, note));
			}
		});
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
		this._speedGateState = createSpeedGateState();
		this._releaseAllNotes();

		this.tracks.forEach(track => {
			track.currentStep = -1;
			delete track._lastAbsoluteStep;
			delete track._noteHoldState;
		});

		this.dispatchEvent('stateChange');
	}

	stop() {
		if (this._releaseTimeoutId) {
			clearTimeout(this._releaseTimeoutId);
			this._releaseTimeoutId = null;
		}
		this.isActive = false;
		this._synthGeneration++;
		this._pendingSynths.clear();

		this._releaseAllNotes();

		this.tracks.forEach(track => this._clearTrackBypass(track));
		this._synthPool.forEach(soundObj => context.destroySound(soundObj));
		this._synthPool.clear();

		this.dispatchEvent('stateChange');

	}

	reconnectTracksToLayers() {
		if (!context.reconnectSoundToLayers) return;
		this.tracks.forEach(track => {
			if (track._audioBypassed) return;
			const soundObj = this._synthPool.get(track.id);
			if (soundObj?.gain && !soundObj.gain.disposed) {
				soundObj.layers = [...(track.layers || [])];
				context.reconnectSoundToLayers(soundObj);
			}
		});
	}

	reportLayerActivity() {
		const now = Tone.now();
		this.tracks.forEach(track => {
			if (!track.layers || track.layers.length === 0) return;
			if (track._audioBypassed) return;

			const notes = this._activeNotes.get(track.id);
			const ringing = (notes && notes.size > 0)
				|| (track._releaseUntil && now < track._releaseUntil)
				|| !!track._bypassTimeout;

			if (ringing) LayerManager.reportActivity(track.layers, 1);
		});
	}

	dispose() {
		this.stop();
		this.tracks.forEach(track => this._clearTrackBypass(track));
		if (this._releaseTimeoutId) {
			clearTimeout(this._releaseTimeoutId);
			this._releaseTimeoutId = null;
		}
	}

	addTrack(trackData = {}) {
		const params = trackData.synthParams || (() => {
			const p = initializeSynthParameters(trackData.synthType || 'Synth', 'sound', {}, context.PARAMETER_REGISTRY);
			p.polyphony = CONSTANTS.SEQUENCER_TRACK_POLYPHONY;
			return p;
		})();

		if (!params.lfo) {
			params.lfo = trackData.lfo || deepClone(DEFAULT_LFO_STRUCTURE);
		}

		const numSteps = trackData.numSteps !== undefined ? trackData.numSteps : this.numSteps;
		const makeEmptySteps = (count) => Array(count).fill(null).map(() => ({
			notes: [],
			sustains: [],
			velocity: 0.8,
			speedGateMin: {},
			speedGateMax: {},
			speedGateHold: {}
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
			muted: trackData.muted || false,
			soloed: trackData.soloed || false,
			layers: trackData.layers ? [...trackData.layers] : [],
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
			layers: [...(source.layers || [])],
			octave: source.octave,
			numSteps: source.numSteps,
			sceneSteps,
			paramTarget: source.paramTarget,
			editMode: source.editMode,
			offsetMode: source.offsetMode,
			offsetFraction: source.offsetFraction,
			offsetSteps: source.offsetSteps,
			offset: source.offset,
			muted: source.muted,
			soloed: source.soloed
		});
		newTrack.currentStep = source.currentStep;
		return newTrack;
	}

	async removeTrack(trackId) {
		const track = this._tracksMap.get(trackId);
		if (!track) return;

		const activeNotes = this._activeNotes.get(trackId);
		if (activeNotes && activeNotes.size > 0) {
			activeNotes.forEach(note => this._triggerRelease(track, note));
			this._activeNotes.delete(trackId);
		}

		const soundObj = this._synthPool.get(trackId);
		if (soundObj) {
			this._clearTrackBypass(track);
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
						steps.push({ notes: [], sustains: [], velocity: 0.8, speedGateMin: {}, speedGateMax: {}, speedGateHold: {} });
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
					notes: [], sustains: [], velocity: 0.8, speedGateMin: {}, speedGateMax: {}, speedGateHold: {}
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
