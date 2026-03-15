import { AudioNodeManager } from './AudioNodeManager.js';
import { StreamManager } from './StreamManager.js';
import { EchoManager } from './EchoManager.js';
import { PolyphonyManager } from './AudioNodeManager.js';
import { SYNTH_REGISTRY } from './SynthRegistry.js';
import { Geometry } from '../geospatial/Geometry.js';
import { calcGain } from './audioUtils.js';
import { AppState } from '../state/StateManager.js';
import { waitForNextFrame } from '../utils/async.js';

let context = null;

export function setContext(ctx) {
	context = ctx;
}

export function destroySound(obj) {
	AudioNodeManager.stopPlayback(obj);
	if (obj._loopCheckInterval) {
		clearInterval(obj._loopCheckInterval);
		obj._loopCheckInterval = null;
	}
	if (obj.type === "StreamPlayer") {
		context.StreamManager.cleanupStream(obj);
	}

	EchoManager.cleanup(obj);

	if (obj.ambisonicSource) {
		const AmbisonicsManager = context.AmbisonicsManager;
		if (AmbisonicsManager) {
			AmbisonicsManager.removeSource(obj);
		}
		obj.ambisonicSource = undefined;
	}

	Geometry.removeDivisionLineVisual(obj, context.map);
	if (obj.marker) context.map.removeLayer(obj.marker);
	if (obj.labelMarker) context.map.removeLayer(obj.labelMarker);
	if (obj.circle) context.map.removeLayer(obj.circle);
	if (obj.handle) context.map.removeLayer(obj.handle);
	if (obj.polygon) context.map.removeLayer(obj.polygon);
	if (obj.xHandle) context.map.removeLayer(obj.xHandle);
	if (obj.yHandle) context.map.removeLayer(obj.yHandle);
	obj.vertexMarkers.forEach(marker => context.map.removeLayer(marker));
	if (obj.linePointMarkers) obj.linePointMarkers.forEach(marker => context.map.removeLayer(marker));

	if (context.FXManager) {
		context.FXManager.disposeAll(obj, { isLayer: false });
	}

	AudioNodeManager.disposeNodes([
		obj.synth, obj.gain, obj.envelopeGain, obj.filter,
		obj.panner, obj.eq, obj.loopFadeGain
	]);

	if (obj.pathRoles?.movement) {
		const path = AppState.getPath(obj.pathRoles.movement);
		if (path) {
			const index = path.attachedSounds.indexOf(obj.marker._leaflet_id);
			if (index > -1) path.attachedSounds.splice(index, 1);
		}
	}
}

export function startLoopedPlayback(obj) {
	if (obj.type !== "SoundFile" || !obj.synth || !obj.synth.loaded) {
		console.warn(`Cannot start loop: type=${obj.type}, synth exists=${!!obj.synth}, buffer loaded=${!!obj.synth?.loaded}`);
		return;
	}

	if (obj.isPlaying) {
		return;
	}

	const loopStart = obj.params.loopStart || 0;
	let loopEnd = obj.params.loopEnd || obj.soundDuration;
	if (loopEnd <= loopStart) {
		loopEnd = obj.soundDuration;
	}
	const loopDuration = loopEnd - loopStart;

	if (!loopDuration || loopDuration <= 0) {
		console.warn("Cannot start loop with zero or negative duration");
		return;
	}

	obj.isPlaying = true;
	obj._loopActive = true;
	obj._isFirstLoopIteration = true;

	let resumeOffset = 0;
	if (obj.params.resumePlayback && obj.playbackPosition !== undefined && obj.playbackPosition > 0) {
		if (obj.playbackPosition >= loopStart && obj.playbackPosition < loopEnd) {
			resumeOffset = obj.playbackPosition - loopStart;
		}
	}
	obj._resumeOffset = resumeOffset;

	obj._loopStartTime = Tone.now();
	obj._loopInitialOffset = resumeOffset;

	const playLoopIteration = () => {
		if (!obj._loopActive) return;

		const now = Tone.now();

		let startPos, duration;

		if (obj._isFirstLoopIteration && obj._resumeOffset > 0) {
			startPos = loopStart + obj._resumeOffset;
			duration = loopEnd - startPos;
			obj._isFirstLoopIteration = false;
		} else {
			startPos = loopStart;
			duration = loopDuration;
			obj._isFirstLoopIteration = false;
		}

		if (isNaN(startPos) || isNaN(duration) || duration <= 0) {
			console.error(`${obj.label}: Invalid loop values`);
			stopLoopedPlayback(obj);
			return;
		}

		obj._currentIterationStartTime = now;
		obj._currentIterationStartPos = startPos;
		obj._currentIterationDuration = duration;

		let currentSpeed = obj.synth.playbackRate;
		if (!currentSpeed || isNaN(currentSpeed) || currentSpeed <= 0) {
			currentSpeed = obj.params.speed || 1.0;
		}
		const playbackDuration = duration / currentSpeed;

		if (obj.params.playbackMode === 'granular') {
			obj.synth.start(now, startPos);
			obj.synth.stop(now + playbackDuration);
		} else {
			obj.synth.start(now, startPos, duration);
		}

		const fadeInDur = Math.min(obj.params.loopFadeIn || 0.01, playbackDuration / 2);
		const fadeOutDur = Math.min(obj.params.loopFadeOut || 0.01, playbackDuration / 2);

		obj.loopFadeGain.gain.cancelScheduledValues(now);
		obj.loopFadeGain.gain.setValueAtTime(0, now);
		obj.loopFadeGain.gain.linearRampToValueAtTime(1, now + fadeInDur);

		const fadeOutStartTime = now + playbackDuration - fadeOutDur;
		if (fadeOutStartTime > now + fadeInDur) {
			obj.loopFadeGain.gain.setValueAtTime(1, fadeOutStartTime);
			obj.loopFadeGain.gain.linearRampToValueAtTime(0, now + playbackDuration);
		}
	};

	const checkLoopStatus = () => {
		if (!obj._loopActive) {
			if (obj._loopCheckInterval) {
				clearInterval(obj._loopCheckInterval);
				obj._loopCheckInterval = null;
			}
			return;
		}

		if (obj.synth.state === 'stopped') {
			playLoopIteration();
		}
	};

	playLoopIteration();
	obj._loopCheckInterval = setInterval(checkLoopStatus, 50);
}

export function stopLoopedPlayback(obj) {
	if (obj.type !== "SoundFile" || !obj.synth.loaded) return;

	if (!obj.isPlaying && !obj._loopActive) {
		return;
	}

	if (obj.params.resumePlayback && obj._currentIterationStartTime && obj._currentIterationStartPos !== undefined) {
		const now = Tone.now();
		const elapsed = (now - obj._currentIterationStartTime) * (obj.params.speed || 1.0);
		let currentPos = obj._currentIterationStartPos + elapsed;

		const loopStart = obj.params.loopStart || 0;
		const loopEnd = obj.params.loopEnd || obj.soundDuration;
		const loopDuration = loopEnd - loopStart;

		if (currentPos >= loopEnd && loopDuration > 0) {
			currentPos = loopStart + ((currentPos - loopStart) % loopDuration);
		}

		obj.playbackPosition = Math.max(loopStart, Math.min(currentPos, loopEnd));
	}

	obj._loopActive = false;

	if (obj._loopCheckInterval) {
		clearInterval(obj._loopCheckInterval);
		obj._loopCheckInterval = null;
	}

	if (obj.loopFadeGain) {
		const now = Tone.now();
		const fadeOutTime = obj.params.loopFadeOut || 0.1;
		obj.loopFadeGain.gain.cancelScheduledValues(now);
		obj.loopFadeGain.gain.setTargetAtTime(0, now, fadeOutTime / 4);
	}

	obj.synth.stop(Tone.now() + 0.2);
	obj.isPlaying = false;
}

export async function upgradeSynthToPolyphonic(soundObj, requiredPolyphony) {
	const synthDef = SYNTH_REGISTRY[soundObj.type];
	if (!synthDef || !synthDef.factory) return;

	const wasPlaying = soundObj.isPlaying;
	const oldSynth = soundObj.synth;

	if (oldSynth.triggerRelease) {
		oldSynth.triggerRelease();
	}
	await waitForNextFrame();

	soundObj.params.polyphony = requiredPolyphony;
	const newSynth = synthDef.factory(soundObj.params);

	const connectionTarget = soundObj.loopFadeGain || soundObj.filter;
	oldSynth.disconnect();
	newSynth.connect(connectionTarget);

	oldSynth.dispose();
	soundObj.synth = newSynth;

	if (wasPlaying && soundObj.params.selectedNotes?.length > 0) {
		await waitForNextFrame();
		PolyphonyManager.triggerPolyphonic(newSynth, soundObj.params.selectedNotes, true, soundObj);
	}
}

export function triggerPlayback(soundObj, userPos) {
	if (soundObj.type !== "SoundFile" || !soundObj.synth.loaded) return;

	const isInside = Geometry.isPointInShape(userPos, soundObj);
	if (!isInside) return;

	const targetGain = calcGain(userPos, soundObj);
	if (targetGain <= 0) return;

	if (soundObj.params.loop) {
		if (!soundObj.isPlaying) {
			startLoopedPlayback(soundObj);
		}
	} else {
		if (!soundObj.wasInsideArea && !soundObj.isPlaying) {
			soundObj._stoppedManually = false;
			let offset = 0;

			if (soundObj.params.resumePlayback) {
				if (soundObj.playbackPosition >= soundObj.soundDuration) {
					soundObj.playbackPosition = 0;
				}
				offset = soundObj.playbackPosition;
			}

			soundObj.synth.start(undefined, offset);
			soundObj._playbackStartTime = Tone.now();
			soundObj.isPlaying = true;
			soundObj.wasInsideArea = true;

			soundObj.synth.onstop = () => {
				soundObj.isPlaying = false;
				if (!soundObj._stoppedManually) {
					soundObj.playbackPosition = 0;
				}
			};
		}
	}
}

