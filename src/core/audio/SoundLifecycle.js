import { CONSTANTS } from '../constants.js';
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

export function getLoopBounds(obj) {
	const duration = obj.synth?.buffer?.duration || obj.soundDuration || 0;
	if (!duration) return null;

	let start = Math.max(0, Math.min(obj.params.loopStart || 0, duration));
	let end = Math.min(obj.params.loopEnd || duration, duration);

	if (end <= start) {
		start = 0;
		end = duration;
	}

	return { start, end, duration };
}

export function applySoundFilePlaybackParams(soundObj, shouldRestart = false) {
	if ((soundObj.type !== "SoundFile" && soundObj.type !== "Granular") || !soundObj.synth) {
		return;
	}

	const settings = {
		loop: soundObj.params.loop || false,
		playbackRate: soundObj.params.speed,
		reverse: soundObj.params.reverse
	};

	const bounds = getLoopBounds(soundObj);
	if (bounds) {
		settings.loopStart = bounds.start;
		settings.loopEnd = bounds.end;
	}

	soundObj.synth.set(settings);

	if (soundObj.type === "Granular") {
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

function loopFadeTimes(obj, passDuration) {
	return {
		fadeIn: Math.min(obj.params.loopFadeIn || CONSTANTS.LOOP_FADE_MIN, passDuration / 2),
		fadeOut: Math.min(obj.params.loopFadeOut || CONSTANTS.LOOP_FADE_MIN, passDuration / 2)
	};
}

export function scheduleLoopFades(obj) {
	if (!obj._loopActive || !obj.loopFadeGain || !obj.synth) return;

	const bounds = getLoopBounds(obj);
	if (!bounds) return;

	const rate = obj.synth.playbackRate || 1;
	const loopLength = bounds.end - bounds.start;
	const passDuration = loopLength / rate;
	if (!(passDuration > 0)) return;

	const gain = obj.loopFadeGain.gain;
	const now = Tone.now();
	const { fadeIn, fadeOut } = loopFadeTimes(obj, passDuration);

	const geometryChanged = obj._loopFadeRate !== rate
		|| obj._loopFadeStart !== bounds.start
		|| obj._loopFadeEnd !== bounds.end;

	if (geometryChanged) {
		const oldLength = obj._loopFadeEnd - obj._loopFadeStart;
		const consumed = Math.max(0, (now - obj._loopFadeAnchor) * obj._loopFadeRate);
		const bufferPos = obj._loopFadeStart + (oldLength > 0 ? consumed % oldLength : 0);
		const nextPass = now + Math.max(0, bounds.end - bufferPos) / rate;

		gain.cancelAndHoldAtTime(now);
		if (nextPass - now > fadeOut) {
			gain.linearRampToValueAtTime(1, nextPass - fadeOut);
			gain.linearRampToValueAtTime(0, nextPass);
		}

		obj._loopFadeAnchor = nextPass - passDuration;
		obj._loopFadeNextPass = nextPass;
		obj._loopFadeRate = rate;
		obj._loopFadeStart = bounds.start;
		obj._loopFadeEnd = bounds.end;
	}

	const horizon = now + CONSTANTS.LOOP_FADE_SCHEDULE_AHEAD;
	let passStart = obj._loopFadeNextPass;

	while (passStart < horizon) {
		gain.setValueAtTime(0, passStart);
		gain.linearRampToValueAtTime(1, passStart + fadeIn);
		gain.setValueAtTime(1, passStart + passDuration - fadeOut);
		gain.linearRampToValueAtTime(0, passStart + passDuration);
		passStart += passDuration;
	}

	obj._loopFadeNextPass = passStart;
}

export function startLoopedPlayback(obj) {
	if (obj.type !== "SoundFile" || !obj.synth || !obj.synth.loaded) {
		console.warn(`Cannot start loop: type=${obj.type}, synth exists=${!!obj.synth}, buffer loaded=${!!obj.synth?.loaded}`);
		return;
	}

	if (obj.isPlaying) {
		return;
	}

	const bounds = getLoopBounds(obj);
	const loopDuration = bounds ? bounds.end - bounds.start : 0;

	if (loopDuration <= 0) {
		console.warn("Cannot start loop with zero or negative duration");
		return;
	}

	let resumeOffset = 0;
	if (obj.params.resumePlayback && obj.playbackPosition > bounds.start && obj.playbackPosition < bounds.end) {
		resumeOffset = obj.playbackPosition - bounds.start;
	}

	const now = Tone.now();

	if (obj.synth.state !== 'stopped') {
		obj.synth.stop(now);
	}

	obj.synth.loop = true;
	obj.synth.loopStart = bounds.start;
	obj.synth.loopEnd = bounds.end;
	obj.synth.start(now, bounds.start + resumeOffset);

	obj.isPlaying = true;
	obj._loopActive = true;
	obj._loopStartTime = now;
	obj._loopInitialOffset = resumeOffset;

	const rate = obj.synth.playbackRate || 1;
	const passDuration = loopDuration / rate;
	const firstPassRemaining = (loopDuration - resumeOffset) / rate;

	if (obj.loopFadeGain) {
		const gain = obj.loopFadeGain.gain;
		const { fadeIn, fadeOut } = loopFadeTimes(obj, passDuration);
		const inTime = Math.min(fadeIn, firstPassRemaining / 2);
		const outTime = Math.min(fadeOut, firstPassRemaining / 2);

		gain.cancelAndHoldAtTime(now);
		gain.setValueAtTime(0, now);
		gain.linearRampToValueAtTime(1, now + inTime);
		gain.setValueAtTime(1, now + firstPassRemaining - outTime);
		gain.linearRampToValueAtTime(0, now + firstPassRemaining);
	}

	obj._loopFadeNextPass = now + firstPassRemaining;
	obj._loopFadeAnchor = now - resumeOffset / rate;
	obj._loopFadeRate = rate;
	obj._loopFadeStart = bounds.start;
	obj._loopFadeEnd = bounds.end;

	scheduleLoopFades(obj);
}

export function stopLoopedPlayback(obj) {
	if (obj.type !== "SoundFile" || !obj.synth) return;

	if (!obj.isPlaying && !obj._loopActive) {
		return;
	}

	const bounds = getLoopBounds(obj);

	if (bounds && obj.params.resumePlayback && obj._loopStartTime !== undefined) {
		const loopDuration = bounds.end - bounds.start;
		const elapsed = (Tone.now() - obj._loopStartTime) * (obj.params.speed || 1.0);
		obj.playbackPosition = bounds.start + ((obj._loopInitialOffset + elapsed) % loopDuration);
	}

	obj._loopActive = false;

	const now = Tone.now();
	const fadeOutTime = obj.params.loopFadeOut || CONSTANTS.GAIN_RAMP_TIME;

	if (obj.loopFadeGain) {
		obj.loopFadeGain.gain.cancelAndHoldAtTime(now);
		obj.loopFadeGain.gain.setTargetAtTime(0, now, fadeOutTime / 4);
	}

	if (!obj.synth.disposed && obj.synth.state !== 'stopped') {
		obj.synth.stop(now + fadeOutTime);
	}
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

export function startOneShotPlayback(soundObj) {
	if (!soundObj.synth) return;

	soundObj._stoppedManually = false;

	if (soundObj.loopFadeGain) {
		const now = Tone.now();
		soundObj.loopFadeGain.gain.cancelAndHoldAtTime(now);
		soundObj.loopFadeGain.gain.setValueAtTime(1, now);
	}

	let offset = 0;
	if (soundObj.params.resumePlayback) {
		if (soundObj.playbackPosition >= soundObj.soundDuration) {
			soundObj.playbackPosition = 0;
		}
		offset = soundObj.playbackPosition;
	}

	soundObj.synth.start(undefined, offset);
	soundObj.isPlaying = true;
	soundObj._playbackStartTime = Tone.now();

	soundObj.synth.onstop = () => {
		soundObj.isPlaying = false;
		soundObj._envelopeOpen = false;
		if (!soundObj._stoppedManually) {
			soundObj.playbackPosition = 0;
		}
	};
}

export function stopOneShotPlayback(soundObj) {
	if (!soundObj.synth) return;

	if (soundObj.params.resumePlayback) {
		const elapsed = (Tone.now() - soundObj._playbackStartTime) * (soundObj.params.speed || 1.0);
		soundObj.playbackPosition += elapsed;
		if (soundObj.playbackPosition > soundObj.soundDuration) {
			soundObj.playbackPosition = soundObj.soundDuration;
		}
	} else {
		soundObj.playbackPosition = 0;
	}

	soundObj._stoppedManually = true;
	soundObj.isPlaying = false;
	soundObj.synth.stop(Tone.now());
}

export function cancelFadeStop(obj) {
	if (obj._fadeStopTimeoutId) {
		clearTimeout(obj._fadeStopTimeoutId);
		obj._fadeStopTimeoutId = null;
	}
}

function stopSoundFileSource(obj) {
	if (obj.params.loop) {
		stopLoopedPlayback(obj);
	} else {
		stopOneShotPlayback(obj);
	}
}

export function openSoundFile(obj) {
	if (obj.type !== "SoundFile" || !obj.synth || !obj.synth.loaded) return;

	cancelFadeStop(obj);

	const fadeIn = Math.max(0, obj.params.fadeIn || 0);
	const starting = !obj.isPlaying;
	const env = obj.envelopeGain?.gain;

	if (env) {
		const now = Tone.now();
		const from = starting ? 0 : env.value;
		env.cancelAndHoldAtTime(now);
		if (fadeIn > 0 && from < 1) {
			env.setValueAtTime(from, now);
			env.linearRampToValueAtTime(1, now + fadeIn * (1 - from));
		} else {
			env.setValueAtTime(1, now);
		}
	}

	if (starting) {
		if (obj.params.loop) {
			startLoopedPlayback(obj);
		} else {
			startOneShotPlayback(obj);
		}
	}

	obj._envelopeOpen = true;
}

export function closeSoundFile(obj) {
	if (obj.type !== "SoundFile" || !obj.synth) return;

	cancelFadeStop(obj);
	obj._envelopeOpen = false;

	const fadeOut = Math.max(0, obj.params.fadeOut || 0);
	const env = obj.envelopeGain?.gain;

	if (fadeOut <= 0 || !env || !obj.isPlaying) {
		stopSoundFileSource(obj);
		return;
	}

	const now = Tone.now();
	const from = env.value;

	if (from <= 0) {
		stopSoundFileSource(obj);
		return;
	}

	const duration = fadeOut * from;
	env.cancelAndHoldAtTime(now);
	env.setValueAtTime(from, now);
	env.linearRampToValueAtTime(0, now + duration);

	const delay = Math.max(0, (now + duration) - Tone.context.currentTime);

	obj._fadeStopTimeoutId = setTimeout(() => {
		obj._fadeStopTimeoutId = null;
		if (obj._envelopeOpen || obj.synth?.disposed) return;
		stopSoundFileSource(obj);
	}, delay * 1000);
}

export function triggerPlayback(soundObj, userPos) {
	if (soundObj.type !== "SoundFile" || !soundObj.synth.loaded) return;

	const isInside = Geometry.isPointInShape(userPos, soundObj);
	if (!isInside) return;

	const targetGain = calcGain(userPos, soundObj);
	if (targetGain <= 0) return;

	if (soundObj.params.loop) {
		if (!soundObj.isPlaying) {
			openSoundFile(soundObj);
		}
	} else {
		if (!soundObj.wasInsideArea && !soundObj.isPlaying) {
			openSoundFile(soundObj);
			soundObj.wasInsideArea = true;
		}
	}
}

