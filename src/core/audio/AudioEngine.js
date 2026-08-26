import { CONSTANTS } from '../constants.js';
import { AppState } from '../state/StateManager.js';
import { Selectors } from '../state/selectors.js';
import { Geometry } from '../geospatial/Geometry.js';
import { EchoManager } from './EchoManager.js';
import { LayerManager } from '../../layers/LayerManager.js';
import { calcGain, calculateRelativePosition, calculateBearingPan, calculateSilencingGain } from './audioUtils.js';
import { startLoopedPlayback, stopLoopedPlayback, startOneShotPlayback, stopOneShotPlayback, scheduleLoopFades } from './SoundLifecycle.js';
import {
	updateSmoothedPosition,
	getSmoothedPosition as getSmoothedPosFromSmoother,
	clampGainDelta,
	isInDeadZone,
	getSmoothedModulationValue
} from './AudioSmoother.js';

export { getSmoothedPosFromSmoother as getSmoothedPosition, getSmoothedModulationValue };

let context = null;
let totalDistanceTraveled = 0;
let lastUserPosition = null;
let lastOSCUpdateTime = 0;
const OSC_UPDATE_INTERVAL = 1000 / 30; // 30 updates per second
let loopActive = false;
let lastSpeedPosition = null;
let lastSpeedDistance = 0;
let lastSpeedTime = 0;
let computedSpeed = 0;
let listenerAtOrigin = false;

export function setContext(ctx) {
	context = ctx;
}

function evaluateGridKeySpeedGate(s, midi, inRange, nowMs, holdMs, userSpeed) {
	if (holdMs === 0) return inRange;
	if (!s._gridKeyHoldState) s._gridKeyHoldState = {};
	if (!s._gridKeyHoldState[midi]) {
		s._gridKeyHoldState[midi] = { committed: inRange, transitionStart: null };
		return inRange;
	}
	const key = s._gridKeyHoldState[midi];
	if (!inRange && userSpeed < CONSTANTS.ZERO_SPEED_THRESHOLD) {
		key.committed = false;
		key.transitionStart = null;
		return false;
	}
	if (inRange === key.committed) {
		key.transitionStart = null;
		return inRange;
	}
	if (key.transitionStart === null) key.transitionStart = nowMs;
	if (nowMs - key.transitionStart >= holdMs) {
		key.committed = inRange;
		key.transitionStart = null;
		return inRange;
	}
	return key.committed;
}

function evaluateSpeedGateWithHold(s, inRange, nowMs, userSpeed) {
	const hold = (s.params.speedGateHold ?? 0) * 1000;
	if (hold === 0) return inRange;

	if (!inRange && userSpeed < CONSTANTS.ZERO_SPEED_THRESHOLD) {
		s._speedGateCommitted = false;
		s._speedGateTransitionStart = null;
		return false;
	}

	if (s._speedGateCommitted === undefined) {
		s._speedGateCommitted = inRange;
		s._speedGateTransitionStart = null;
		return inRange;
	}
	if (inRange === s._speedGateCommitted) {
		s._speedGateTransitionStart = null;
		return inRange;
	}
	if (s._speedGateTransitionStart === null) {
		s._speedGateTransitionStart = nowMs;
	}
	if (nowMs - s._speedGateTransitionStart >= hold) {
		s._speedGateCommitted = inRange;
		s._speedGateTransitionStart = null;
		return inRange;
	}
	return s._speedGateCommitted;
}

export function getTotalDistanceTraveled() {
	return totalDistanceTraveled;
}

export function resetTotalDistance() {
	totalDistanceTraveled = 0;
	lastUserPosition = null;
}

export function getUserMovementSpeed() {
	if (Selectors.getUserAttachedPathId()) {
		return AppState.simulation.currentEffectiveSpeed || 0;
	}

	if (Selectors.isSimulationActive()) {
		return Selectors.getSimulationCurrentSpeed() || 0;
	}

	return computedSpeed;
}

function updateComputedSpeed(userPos) {
	const now = performance.now();

	if (!lastSpeedPosition) {
		lastSpeedPosition = { lat: userPos.lat, lng: userPos.lng };
		lastSpeedTime = now;
		return;
	}

	const dt = (now - lastSpeedTime) / 1000;
	if (dt <= 0) return;

	const dist = Geometry.calculateDistanceMeters(lastSpeedPosition, userPos);

	if (dist < CONSTANTS.MIN_TRACKING_DISTANCE) {
		computedSpeed = dt >= CONSTANTS.SPEED_IDLE_TIMEOUT
			? 0
			: Math.min(computedSpeed, lastSpeedDistance / dt);
		return;
	}

	computedSpeed = dist / dt;
	lastSpeedDistance = dist;
	lastSpeedPosition.lat = userPos.lat;
	lastSpeedPosition.lng = userPos.lng;
	lastSpeedTime = now;
}

export function isSoundControlledBySequencer(sound) {
	const sequencers = Selectors.getSequencers();
	const soundPersistentId = sound.persistentId;

	if (!soundPersistentId) return false;

	for (let i = 0; i < sequencers.length; i++) {
		const seq = sequencers[i];
		if (!seq.enabled) continue;

		for (let j = 0; j < seq.tracks.length; j++) {
			const track = seq.tracks[j];
			if (track.instrumentType === 'sound' && track.instrumentId === soundPersistentId) {
				return true;
			}
		}
	}
	return false;
}

export function updateAudio(userPos, now) {
	const NoteManager = context.NoteManager;
	const OSCManager = context.OSCManager;
	const processLFOs = context.processLFOs;
	const updateSoundPositionOnPath = context.updateSoundPositionOnPath;

	updateComputedSpeed(userPos);
	const smoothedPos = updateSmoothedPosition(userPos);
	const audioPos = smoothedPos || userPos;

	if (lastUserPosition && userPos) {
		const distance = Math.sqrt(
			Math.pow((userPos.lat - lastUserPosition.lat) * CONSTANTS.METERS_PER_LAT, 2) +
			Math.pow((userPos.lng - lastUserPosition.lng) * CONSTANTS.METERS_PER_LNG * Math.cos(userPos.lat * Math.PI / 180), 2)
		);
		if (distance < CONSTANTS.SEQUENCER_GPS_JUMP_THRESHOLD && distance > CONSTANTS.MIN_TRACKING_DISTANCE) {
			totalDistanceTraveled += distance;
		}
	}
	if (!userPos) {
		lastUserPosition = null;
	} else if (lastUserPosition) {
		lastUserPosition.lat = userPos.lat;
		lastUserPosition.lng = userPos.lng;
	} else {
		lastUserPosition = { lat: userPos.lat, lng: userPos.lng };
	}

	const silencingGain = calculateSilencingGain(audioPos);
	LayerManager.applySilencingGain(silencingGain);
	LayerManager.beginActivityFrame();

	const sequencers = Selectors.getSequencers();
	for (let i = 0; i < sequencers.length; i++) {
		const seq = sequencers[i];
		if (seq.enabled) {
			seq.applySilencingGain(silencingGain);
			seq.updatePosition(userPos.lat, userPos.lng);
			seq.reportLayerActivity();
		}
	}

	const spatialMode = Selectors.getSpatialMode();
	const userDirection = Selectors.getUserDirection();

	if (spatialMode === 'hrtf') {
		if (!listenerAtOrigin) {
			Tone.Listener.positionX.value = 0;
			Tone.Listener.positionY.value = 0;
			Tone.Listener.positionZ.value = 0;
			listenerAtOrigin = true;
		}
	} else {
		listenerAtOrigin = false;
		if (spatialMode === 'ambisonics') {
			const AmbisonicsManager = context.AmbisonicsManager;
			if (AmbisonicsManager) {
				AmbisonicsManager.updateListener(audioPos, userDirection);
				AmbisonicsManager.updateAllSourcePositions(audioPos);
			}
		}
	}

	// Throttle OSC updates to prevent spam from UI interactions
	const currentTime = performance.now();
	const shouldSendOSC = OSCManager && OSCManager.enabled && (currentTime - lastOSCUpdateTime >= OSC_UPDATE_INTERVAL);

	if (shouldSendOSC) {
		lastOSCUpdateTime = currentTime;
		AppState.dispatch({
			type: 'OSC_USER_POSITION_UPDATE',
			payload: { userPos, userDirection }
		});
	}

	const sounds = Selectors.getSounds();
	const anySoundSoloed = sounds.some(sound => sound.soloed);

	for (let i = 0; i < sounds.length; i++) {
		const s = sounds[i];

		if (!s.isReady) continue;

		const elementGain = anySoundSoloed ? (s.soloed ? 1 : 0) : (s.muted ? 0 : 1);

		if (s.type === "SoundFile" && (!s.synth.loaded || !s.synth.buffer)) {
			continue;
		}

		const isControlledBySequencer = s.controlledBySequencer || isSoundControlledBySequencer(s);

		let isInside;

		if (now !== undefined) {
			if (s.pathRoles?.movement) {
				const path = AppState.getPath(s.pathRoles.movement);
				if (path && updateSoundPositionOnPath) {
					updateSoundPositionOnPath(s, path, now);
				}
			}

			if (processLFOs) {
				isInside = processLFOs(s, now);
			}
		}

		const soundPos = s.marker.getLatLng();
		if (isInside === undefined) {
			isInside = Geometry.isPointInShape(audioPos, s);
		}

		const soundDistance = context.map ? context.map.distance(audioPos, soundPos) : 0;
		const inDeadZone = isInDeadZone(soundDistance, s.maxDistance || 100);

		if (shouldSendOSC) {
			AppState.dispatch({
				type: 'OSC_SOUND_UPDATE',
				payload: { sound: s, soundPos, userPos: audioPos, userDirection }
			});
		}

		if (!isControlledBySequencer && !isInside && !s.isPlaying) {
			if (s.wasInsideArea && s.echoNodes && s.echoNodes.size > 0) {
				AppState.dispatch({
					type: 'AUDIO_ECHO_UPDATE_REQUESTED',
					payload: { sound: s, userPos: audioPos, silencingGain, elementGain }
				});
			}
			s.wasInsideArea = false;
			continue;
		}

		AppState.dispatch({
			type: 'AUDIO_ECHO_UPDATE_REQUESTED',
			payload: { sound: s, userPos: audioPos, silencingGain, elementGain }
		});
		if (s.echoNodes && s.echoNodes.size > 0) {
			for (const [pathId, nodeData] of s.echoNodes.entries()) {
				if (nodeData.reflectionPoint) {
					EchoManager.updateEchoPannerPosition(nodeData, nodeData.reflectionPoint, audioPos);
				}
			}
		}

		if (spatialMode === 'hrtf') {
			if (s.useSpatialPanning && s.panner instanceof Tone.Panner3D && s.panner.positionX) {
				const coords = calculateRelativePosition(soundPos, audioPos, userDirection);
				s.panner.positionX.value = coords.x;
				s.panner.positionY.value = coords.y;
				s.panner.positionZ.value = 0;
			}
		} else if (spatialMode === 'stereo') {
			if (s.useSpatialPanning && s.panner) {
				if (s.panner instanceof Tone.Panner3D && s.panner.positionX) {
					const coords = calculateRelativePosition(soundPos, audioPos, userDirection);
					s.panner.positionX.rampTo(coords.x, CONSTANTS.PANNER_RAMP_TIME);
					s.panner.positionY.rampTo(coords.y, CONSTANTS.PANNER_RAMP_TIME);
					s.panner.positionZ.value = 0;
				} else if (s.panner.pan) {
					const panValue = calculateBearingPan(audioPos, soundPos, userDirection);
					s.panner.pan.rampTo(panValue, CONSTANTS.PANNER_RAMP_TIME);
				}
			}
		}

		if (s.type === 'Granular' && s.params.timeStretchMode === 'adaptive' && s.synth?.loaded) {
			AppState.dispatch({
				type: 'GRANULAR_ADAPTIVE_SPEED_UPDATE',
				payload: { sound: s }
			});
		}

		let targetGain = (isControlledBySequencer || isInside) ? calcGain(audioPos, s) : 0;

		if (inDeadZone && targetGain > 0) {
			if (s._lastDeadZoneGain === undefined) {
				s._lastDeadZoneGain = targetGain;
			}
			targetGain = s._lastDeadZoneGain;
		} else if (targetGain > 0) {
			s._lastDeadZoneGain = targetGain;
		}

		targetGain *= elementGain;

		const clampedGain = clampGainDelta(targetGain, s.id);
		const effectiveGain = (clampedGain > 0 ? clampedGain : 0) * silencingGain;
		LayerManager.reportActivity(s.layers, effectiveGain);

		if (s.type === "StreamPlayer") {
			if (!isControlledBySequencer) {
				AppState.dispatch({
					type: 'STREAM_PLAYBACK_UPDATE',
					payload: { sound: s, effectiveGain }
				});
			}
		} else {
			isInside = effectiveGain > 0;

			if (isInside && !s.isPlaying) {
				const gateMin = s.params.speedGateMin ?? 0;
				const gateMax = s.params.speedGateMax ?? 10;
				if (gateMin > 0 || gateMax < 10) {
					const userSpeed = getUserMovementSpeed();
					const rawInRange = userSpeed >= gateMin && userSpeed <= gateMax;
					if (!evaluateSpeedGateWithHold(s, rawInRange, performance.now(), userSpeed)) {
						isInside = false;
					}
				}
			}

			const wasInside = s.wasInsideArea || false;
			s.wasInsideArea = isInside;

			if (s.type === "SoundFile" && s.synth.loaded && !isControlledBySequencer) {
				if (s.params.speedLockScale > 0) {
					const userSpeed = getUserMovementSpeed();
					const baseSpeed = s.params.speed || 1.0;
					if (userSpeed < CONSTANTS.ZERO_SPEED_THRESHOLD) {
						if (s.synth.playbackRate !== baseSpeed) s.synth.playbackRate = baseSpeed;
					} else {
						const referenceSpeed = s.params.speedLockReference || CONSTANTS.REFERENCE_SPEED_DEFAULT;
						const lockedSpeed = baseSpeed + (userSpeed / referenceSpeed - 1) * s.params.speedLockScale;
						let effectiveSpeed = Math.max(CONSTANTS.MIN_PLAYBACK_RATE, Math.min(CONSTANTS.MAX_PLAYBACK_RATE, lockedSpeed));
						if (isNaN(effectiveSpeed)) effectiveSpeed = baseSpeed;
						if (s.synth.playbackRate !== effectiveSpeed) s.synth.playbackRate = effectiveSpeed;
					}
				} else if (!s._previouslyModulatedParams?.has('speed') && s.synth.playbackRate !== s.params.speed) {
					s.synth.playbackRate = s.params.speed || 1.0;
				}

				const gateMin = s.params.speedGateMin ?? 0;
				const gateMax = s.params.speedGateMax ?? 10;
				if (isInside && (gateMin > 0 || gateMax < 10)) {
					const userSpeed = getUserMovementSpeed();
					const rawInRange = userSpeed >= gateMin && userSpeed <= gateMax;
					if (!evaluateSpeedGateWithHold(s, rawInRange, performance.now(), userSpeed)) {
						isInside = false;
						s.wasInsideArea = false;
					}
				}

				if (s.params.speedAdvance) {
					const userSpeed = getUserMovementSpeed();
					const isMoving = userSpeed > s.params.speedAdvanceThreshold;

					if (isInside && isMoving && !s.isPlaying) {
						if (s.params.loop) {
							startLoopedPlayback(s);
						} else {
							startOneShotPlayback(s);
						}
					} else if ((!isInside || !isMoving) && s.isPlaying) {
						if (s.params.loop) {
							stopLoopedPlayback(s);
						} else {
							stopOneShotPlayback(s);
						}
					} else if (s.params.loop && s._loopActive) {
						scheduleLoopFades(s);
					}
				} else {
					if (s.params.loop) {
						if (isInside && !s.isPlaying) {
							startLoopedPlayback(s);
						} else if (!isInside && s.isPlaying) {
							stopLoopedPlayback(s);
						} else if (s._loopActive) {
							scheduleLoopFades(s);
						}
					} else {
						if (isInside && !wasInside && !s.isPlaying) {
							startOneShotPlayback(s);
						} else if (!isInside && s.isPlaying) {
							stopOneShotPlayback(s);
						}
					}
				}
			} else if (s.type !== "SoundFile" && NoteManager && !isControlledBySequencer) {
				if (isInside && !s.isPlaying) {
					s.isPlaying = true;
					NoteManager.trigger(s);
				} else if (!isInside && s.isPlaying) {
					s.isPlaying = false;
					NoteManager.release(s);
				} else if (isInside && s.isPlaying && s.type === 'Sampler' && s.params.samplerMode === 'grid') {
					const gridSamples = s.params.gridSamples;
					const spatialGateActive = (s.params.speedGateMin ?? 0) > 0 || (s.params.speedGateMax ?? 10) < 10;
					const hasGridSpeedRanges = gridSamples && (spatialGateActive || Object.values(gridSamples).some(
						gs => (gs.speedMin ?? 0) > 0 || (gs.speedMax ?? 10) < 10
					));
					s._hasGridSpeedRanges = hasGridSpeedRanges;
					if (hasGridSpeedRanges) {
						const userSpeed = getUserMovementSpeed();
						const spatialMin = s.params.speedGateMin ?? 0;
						const spatialMax = s.params.speedGateMax ?? 10;
						const nowMs = performance.now();
						const eligibleKeys = new Set();
						for (const [midi, gs] of Object.entries(gridSamples)) {
							if (!gs.fileName) continue;
							const sMin = Math.max(gs.speedMin ?? 0, spatialMin);
							const sMax = Math.min(gs.speedMax ?? 10, spatialMax);
							const holdMs = (gs.speedGateHold ?? s.params.speedGateHold ?? 0) * 1000;
							const rawInRange = userSpeed >= sMin && userSpeed <= sMax;
							if (evaluateGridKeySpeedGate(s, midi, rawInRange, nowMs, holdMs, userSpeed)) {
								eligibleKeys.add(midi);
							}
						}
						if (!s._eligibleGridKeys) {
							s._eligibleGridKeys = new Set();
							for (const [midi, gs] of Object.entries(gridSamples)) {
								if (gs.fileName) s._eligibleGridKeys.add(midi);
							}
						}
						const prevKeys = s._eligibleGridKeys;
						const changed = eligibleKeys.size !== prevKeys.size ||
							[...eligibleKeys].some(k => !prevKeys.has(k));
						if (changed) {
							const added = [...eligibleKeys].filter(k => !prevKeys.has(k));
							const removed = [...prevKeys].filter(k => !eligibleKeys.has(k));
							if (removed.length > 0) {
								const removedMidi = removed.map(k => parseInt(k));
								NoteManager.triggerPolyphonic(s.synth, removedMidi, false, s);
							}
							if (added.length > 0) {
								const addedMidi = added.map(k => parseInt(k));
								NoteManager.triggerPolyphonic(s.synth, addedMidi, true, s);
							}
						}
						s._eligibleGridKeys = eligibleKeys;
					} else if (s._eligibleGridKeys) {
						const prevKeys = s._eligibleGridKeys;
						delete s._eligibleGridKeys;
						delete s._gridKeyHoldState;
						const allKeys = new Set();
						for (const [midi, gs] of Object.entries(gridSamples)) {
							if (gs.fileName) allKeys.add(midi);
						}
						const added = [...allKeys].filter(k => !prevKeys.has(k));
						if (added.length > 0) {
							const addedMidi = added.map(k => parseInt(k));
							NoteManager.triggerPolyphonic(s.synth, addedMidi, true, s);
						}
					}
				} else if (isInside && s.isPlaying) {
					const gateMin = s.params.speedGateMin ?? 0;
					const gateMax = s.params.speedGateMax ?? 10;
					const hasSpeedGate = gateMin > 0 || gateMax < 10;
					if (hasSpeedGate || s._speedGateOpen === false) {
						const userSpeed = hasSpeedGate ? getUserMovementSpeed() : 0;
						const rawInRange = !hasSpeedGate || (userSpeed >= gateMin && userSpeed <= gateMax);
						const inRange = evaluateSpeedGateWithHold(s, rawInRange, performance.now(), userSpeed);
						if (inRange !== (s._speedGateOpen !== false)) {
							s._skipEnvelope = true;
							NoteManager.release(s);
							if (inRange) NoteManager.trigger(s);
							s._skipEnvelope = false;
						}
						s._speedGateOpen = inRange;
					}
				}
			}

			const gainRampTime = (effectiveGain === 0 && s.params.releaseMode === 'release') ?
				(s.params.release || 0.5) :
				CONSTANTS.GAIN_RAMP_TIME;
			s.gain.gain.rampTo(effectiveGain, gainRampTime);
		}
	}

	LayerManager.commitActivityFrame();
}

function hasPendingAudioWork() {
	if (Tone.context.state !== 'running') return true;
	if (Selectors.isSimulationActive() || Selectors.getUserAttachedPathId()) return true;

	const sounds = Selectors.getSounds();
	for (let i = 0; i < sounds.length; i++) {
		if (sounds[i].isPlaying) return true;
	}

	const sequencers = Selectors.getSequencers();
	for (let i = 0; i < sequencers.length; i++) {
		const seq = sequencers[i];
		if (seq.enabled && (seq.insideArea || seq.hasPendingWork())) return true;
	}

	return false;
}

export function audioUpdateLoop() {
	if (Tone.context.state === 'running') {
		audioUpdateLoop.suspendedListenerAdded = false;
	} else if (Tone.context.state === 'suspended' && !audioUpdateLoop.suspendedListenerAdded) {
		audioUpdateLoop.suspendedListenerAdded = true;
		const resumeOnInteraction = async () => {
			try {
				await Tone.start();
				audioUpdateLoop.suspendedListenerAdded = false;
				document.removeEventListener('click', resumeOnInteraction);
				document.removeEventListener('touchstart', resumeOnInteraction);
				document.removeEventListener('keydown', resumeOnInteraction);
				const userPos = context.GeolocationManager?.getUserPosition();
				if (userPos) {
					updateAudio(userPos, Tone.now());
				}
			} catch (e) {
				console.error("Failed to resume audio context:", e);
				audioUpdateLoop.suspendedListenerAdded = false;
			}
		};
		document.addEventListener('click', resumeOnInteraction, { once: true });
		document.addEventListener('touchstart', resumeOnInteraction, { once: true });
		document.addEventListener('keydown', resumeOnInteraction, { once: true });
	}

	const processPathLFOs = context.processPathLFOs;
	const now = Tone.now();
	let positionsMayHaveChanged = false;

	if (processPathLFOs) {
		positionsMayHaveChanged = processPathLFOs(now);
	}

	const currentSpeed = getUserMovementSpeed();
	if (audioUpdateLoop.lastSpeed === undefined || Math.abs(currentSpeed - audioUpdateLoop.lastSpeed) > CONSTANTS.ZERO_SPEED_THRESHOLD) {
		const sounds = Selectors.getSounds();
		for (let i = 0; i < sounds.length; i++) {
			const p = sounds[i].params;
			if ((p?.speedGateMin ?? 0) > 0 || (p?.speedGateMax ?? 10) < 10 || p?.speedLockScale > 0 || p?.speedAdvance ||
				(sounds[i].type === 'Sampler' && sounds[i]._hasGridSpeedRanges)) {
				positionsMayHaveChanged = true;
				break;
			}
		}
		audioUpdateLoop.lastSpeed = currentSpeed;
	}

	const sounds = Selectors.getSounds();
	for (let i = 0; i < sounds.length; i++) {
		const s = sounds[i];
		if (s._speedGateTransitionStart !== null && s._speedGateTransitionStart !== undefined) {
			positionsMayHaveChanged = true;
			break;
		}
		if (s._gridKeyHoldState) {
			const keyStates = Object.values(s._gridKeyHoldState);
			for (let j = 0; j < keyStates.length; j++) {
				if (keyStates[j].transitionStart !== null) {
					positionsMayHaveChanged = true;
					break;
				}
			}
			if (positionsMayHaveChanged) break;
		}
		if (s._positionModulated || s._sizeModulated) {
			positionsMayHaveChanged = true;
			break;
		}
		const lfo = s.params?.lfo;
		if (lfo) {
			if ((lfo.x.freq > 0 && lfo.x.range > 0) ||
				(lfo.y.freq > 0 && lfo.y.range > 0) ||
				(lfo.size.freq > 0 && lfo.size.range > 0) ||
				(lfo.mod1 && (lfo.mod1.range > 0 || (lfo.mod1.freq > 0 && lfo.mod1.source !== 'lfo'))) ||
				(lfo.mod2 && (lfo.mod2.range > 0 || (lfo.mod2.freq > 0 && lfo.mod2.source !== 'lfo'))) ||
				(lfo.mod3 && (lfo.mod3.range > 0 || (lfo.mod3.freq > 0 && lfo.mod3.source !== 'lfo')))) {
				positionsMayHaveChanged = true;
				break;
			}
		}
		if (s.pathRoles?.movement) {
			positionsMayHaveChanged = true;
			break;
		}
	}

	const sequencers = Selectors.getSequencers();
	for (let i = 0; i < sequencers.length; i++) {
		if (sequencers[i].enabled) {
			sequencers[i].processPendingSteps();
			sequencers[i].processModulation();
		}
	}

	if (positionsMayHaveChanged) {
		const userPos = context.GeolocationManager?.getUserPosition();
		if (userPos) {
			updateAudio(userPos, now);
		}
	}

	if (positionsMayHaveChanged || hasPendingAudioWork()) {
		AppState.intervals.audioUpdate = requestAnimationFrame(audioUpdateLoop);
	} else {
		loopActive = false;
		AppState.intervals.audioUpdate = null;
	}
}

export function startAudioLoop() {
	if (loopActive) return;
	loopActive = true;
	AppState.intervals.audioUpdate = requestAnimationFrame(audioUpdateLoop);
}

export function stopAudioLoop() {
	loopActive = false;
	if (AppState.intervals.audioUpdate) {
		cancelAnimationFrame(AppState.intervals.audioUpdate);
		AppState.intervals.audioUpdate = null;
	}
}
