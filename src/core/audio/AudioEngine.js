import { CONSTANTS } from '../constants.js';
import { AppState } from '../state/StateManager.js';
import { Selectors } from '../state/selectors.js';
import { Geometry } from '../geospatial/Geometry.js';
import { EchoManager } from './EchoManager.js';
import { calcGain, calculateRelativePosition, calculateBearingPan, calculatePathGain } from './audioUtils.js';
import { startLoopedPlayback, stopLoopedPlayback } from './SoundLifecycle.js';
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
let lastSpeedPosition = null;
let lastSpeedTime = 0;
let computedSpeed = 0;

export function setContext(ctx) {
	context = ctx;
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
		const speedKmh = Selectors.getSimulationSpeed() || 0;
		return (speedKmh * 1000) / 3600;
	}

	return computedSpeed;
}

function updateComputedSpeed(userPos) {
	const now = performance.now();
	if (lastSpeedPosition) {
		const dt = (now - lastSpeedTime) / 1000;
		if (dt > 0) {
			const dist = Geometry.calculateDistanceMeters(lastSpeedPosition, userPos);
			computedSpeed = dist / dt;
		}
	}
	lastSpeedPosition = { lat: userPos.lat, lng: userPos.lng };
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
	lastUserPosition = userPos ? { lat: userPos.lat, lng: userPos.lng } : null;

	let silencingGain = 1;
	const paths = Selectors.getPaths();
	for (let i = 0; i < paths.length; i++) {
		const path = paths[i];
		if (path.params.silencer && Geometry.isPointInControlPath(audioPos, path)) {
			const pathGain = calculatePathGain(audioPos, path);
			silencingGain = Math.min(silencingGain, 1 - pathGain);
		}
	}

	const sequencers = Selectors.getSequencers();
	for (let i = 0; i < sequencers.length; i++) {
		const seq = sequencers[i];
		if (seq.enabled) {
			seq.updatePosition(userPos.lat, userPos.lng);
		}
	}

	if (Selectors.getSpatialMode() === 'hrtf') {
		Tone.Listener.positionX.value = 0;
		Tone.Listener.positionY.value = 0;
		Tone.Listener.positionZ.value = 0;
	} else if (Selectors.getSpatialMode() === 'ambisonics') {
		const AmbisonicsManager = context.AmbisonicsManager;
		if (AmbisonicsManager) {
			AmbisonicsManager.updateListener(audioPos, Selectors.getUserDirection());
			AmbisonicsManager.updateAllSourcePositions(audioPos);
		}
	}

	// Throttle OSC updates to prevent spam from UI interactions
	const currentTime = performance.now();
	const shouldSendOSC = OSCManager && OSCManager.enabled && (currentTime - lastOSCUpdateTime >= OSC_UPDATE_INTERVAL);

	if (shouldSendOSC) {
		lastOSCUpdateTime = currentTime;
		AppState.dispatch({
			type: 'OSC_USER_POSITION_UPDATE',
			payload: { userPos, userDirection: Selectors.getUserDirection() }
		});
	}

	const sounds = Selectors.getSounds();
	for (let i = 0; i < sounds.length; i++) {
		const s = sounds[i];

		if (!s.isReady) continue;

		if (s.type === "SoundFile" && (!s.synth.loaded || !s.synth.buffer)) {
			continue;
		}

		const isControlledBySequencer = s.controlledBySequencer || isSoundControlledBySequencer(s);

		if (now !== undefined) {
			if (s.pathRoles?.movement) {
				const path = AppState.getPath(s.pathRoles.movement);
				if (path && updateSoundPositionOnPath) {
					updateSoundPositionOnPath(s, path, now);
				}
			}

			if (processLFOs) {
				processLFOs(s, now);
			}
		}

		const soundPos = s.marker.getLatLng();
		let isInside = Geometry.isPointInShape(audioPos, s);

		const soundDistance = context.map ? context.map.distance(audioPos, soundPos) : 0;
		const inDeadZone = isInDeadZone(soundDistance, s.maxDistance || 100);

		if (shouldSendOSC) {
			AppState.dispatch({
				type: 'OSC_SOUND_UPDATE',
				payload: { sound: s, soundPos, userPos: audioPos, userDirection: Selectors.getUserDirection() }
			});
		}

		AppState.dispatch({
			type: 'AUDIO_ECHO_UPDATE_REQUESTED',
			payload: { sound: s, userPos: audioPos }
		});
		if (s.echoNodes && s.echoNodes.size > 0) {
			for (const [pathId, nodeData] of s.echoNodes.entries()) {
				if (nodeData.reflectionPoint) {
					EchoManager.updateEchoPannerPosition(nodeData, nodeData.reflectionPoint, audioPos);
				}
			}
		}

		if (!isControlledBySequencer && !isInside && !s.isPlaying) {
			s.wasInsideArea = false;
			continue;
		}

		if (Selectors.getSpatialMode() === 'hrtf') {
			if (s.useSpatialPanning && s.panner instanceof Tone.Panner3D && s.panner.positionX) {
				const coords = calculateRelativePosition(soundPos, audioPos, Selectors.getUserDirection());
				s.panner.positionX.value = coords.x;
				s.panner.positionY.value = coords.y;
				s.panner.positionZ.value = 0;
			}
		} else if (Selectors.getSpatialMode() === 'stereo') {
			if (s.useSpatialPanning && s.panner) {
				if (s.panner instanceof Tone.Panner3D && s.panner.positionX) {
					const coords = calculateRelativePosition(soundPos, audioPos, Selectors.getUserDirection());
					s.panner.positionX.rampTo(coords.x, CONSTANTS.PANNER_RAMP_TIME);
					s.panner.positionY.rampTo(coords.y, CONSTANTS.PANNER_RAMP_TIME);
					s.panner.positionZ.value = 0;
				} else if (s.panner.pan) {
					const panValue = calculateBearingPan(audioPos, soundPos, Selectors.getUserDirection());
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
			targetGain = s._lastDeadZoneGain !== undefined ? s._lastDeadZoneGain : 1;
		} else if (targetGain > 0) {
			s._lastDeadZoneGain = targetGain;
		}

		const clampedGain = clampGainDelta(targetGain, s.id);
		const effectiveGain = (clampedGain > 0 ? clampedGain : 0) * silencingGain;

		if (s.type === "StreamPlayer") {
			if (!isControlledBySequencer) {
				AppState.dispatch({
					type: 'STREAM_PLAYBACK_UPDATE',
					payload: { sound: s, effectiveGain }
				});
			}
		} else {
			isInside = effectiveGain > 0;

			if (s.params.speedGate > 0 && isInside) {
				const userSpeed = getUserMovementSpeed();
				if (userSpeed < s.params.speedGate) {
					isInside = false;
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
				} else if (s.synth.playbackRate !== s.params.speed) {
					s.synth.playbackRate = s.params.speed || 1.0;
				}

				if (s.params.speedAdvance) {
					const userSpeed = getUserMovementSpeed();
					const isMoving = userSpeed > s.params.speedAdvanceThreshold;

					if (isInside && isMoving && !s.isPlaying) {
						if (s.params.loop) {
							startLoopedPlayback(s);
						} else {
							let offset = 0;
							if (s.params.resumePlayback) {
								if (s.playbackPosition >= s.soundDuration) s.playbackPosition = 0;
								offset = s.playbackPosition;
							}
							s.synth.start(undefined, offset);
							s.isPlaying = true;
							s._playbackStartTime = Tone.now();
							s.synth.onstop = () => { s.isPlaying = false; };
						}
					} else if ((!isInside || !isMoving) && s.isPlaying) {
						if (s.params.loop) {
							stopLoopedPlayback(s);
						} else {
							if (s.params.resumePlayback) {
								const elapsed = (Tone.now() - s._playbackStartTime) * (s.params.speed || 1.0);
								s.playbackPosition += elapsed;
								if (s.playbackPosition > s.soundDuration) s.playbackPosition = s.soundDuration;
							}
							s.isPlaying = false;
							s.synth.stop(Tone.now());
						}
					}
				} else {
					if (s.params.loop) {
						if (isInside && !s.isPlaying) {
							startLoopedPlayback(s);
						} else if (!isInside && s.isPlaying) {
							stopLoopedPlayback(s);
						}
					} else {
						if (isInside && !wasInside && !s.isPlaying) {
							let offset = 0;
							if (s.params.resumePlayback && s.playbackPosition > 0) {
								if (s.playbackPosition >= s.soundDuration) s.playbackPosition = 0;
								offset = s.playbackPosition;
							}
							s.synth.start(undefined, offset);
							s.isPlaying = true;
							s._playbackStartTime = Tone.now();
							s.synth.onstop = () => {
								if (!s.params.resumePlayback) s.playbackPosition = 0;
							};
						} else if (!isInside && s.isPlaying) {
							if (s.params.resumePlayback) {
								const elapsed = (Tone.now() - s._playbackStartTime) * (s.params.speed || 1.0);
								s.playbackPosition += elapsed;
								if (s.playbackPosition > s.soundDuration) s.playbackPosition = s.soundDuration;
							} else {
								s.playbackPosition = 0;
							}
							s.isPlaying = false;
							s.synth.stop(Tone.now());
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
				}
			}

			const gainRampTime = (effectiveGain === 0 && s.params.releaseMode === 'release') ?
				(s.params.release || 0.5) :
				CONSTANTS.GAIN_RAMP_TIME;
			s.gain.gain.rampTo(effectiveGain, gainRampTime);
		}
	}
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
			if (sounds[i].params?.speedGate > 0 || sounds[i].params?.speedLockScale > 0 || sounds[i].params?.speedAdvance) {
				positionsMayHaveChanged = true;
				break;
			}
		}
		audioUpdateLoop.lastSpeed = currentSpeed;
	}

	const sounds = Selectors.getSounds();
	for (let i = 0; i < sounds.length; i++) {
		const s = sounds[i];
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

	if (positionsMayHaveChanged) {
		const userPos = context.GeolocationManager?.getUserPosition();
		if (userPos) {
			updateAudio(userPos, now);
		}
	}
	AppState.intervals.audioUpdate = requestAnimationFrame(audioUpdateLoop);
}

export function startAudioLoop() {
	audioUpdateLoop();
}

export function stopAudioLoop() {
	if (AppState.intervals.audioUpdate) {
		cancelAnimationFrame(AppState.intervals.audioUpdate);
		AppState.intervals.audioUpdate = null;
	}
}
