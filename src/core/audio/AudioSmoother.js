import { CONSTANTS } from '../constants.js';
import { Geometry } from '../geospatial/Geometry.js';

let smoothedPosition = null;
let lastGains = new Map();
let context = null;

export function setContext(ctx) {
	context = ctx;
}

export function getSmoothedPosition() {
	return smoothedPosition;
}

export function resetSmoothedPosition() {
	smoothedPosition = null;
	lastGains.clear();
}

export function updateSmoothedPosition(rawPosition) {
	if (!rawPosition) return null;

	const alpha = CONSTANTS.AUDIO_SMOOTHING_ALPHA;

	if (!smoothedPosition || alpha >= 1) {
		smoothedPosition = { lat: rawPosition.lat, lng: rawPosition.lng };
	} else if (alpha > 0) {
		smoothedPosition = {
			lat: smoothedPosition.lat + alpha * (rawPosition.lat - smoothedPosition.lat),
			lng: smoothedPosition.lng + alpha * (rawPosition.lng - smoothedPosition.lng)
		};
	}

	return smoothedPosition;
}

export function getSmoothedDistance(rawDistance, soundId) {
	const alpha = CONSTANTS.AUDIO_SMOOTHING_ALPHA;

	if (!lastGains.has(soundId)) {
		lastGains.set(soundId, { distance: rawDistance, gain: null });
		return rawDistance;
	}

	const cached = lastGains.get(soundId);

	if (alpha >= 1) {
		cached.distance = rawDistance;
		return rawDistance;
	}

	if (alpha > 0) {
		cached.distance = cached.distance + alpha * (rawDistance - cached.distance);
	}

	return cached.distance;
}

export function isInDeadZone(distance, soundMaxDistance) {
	const deadZoneRadius = CONSTANTS.AUDIO_DEAD_ZONE_RADIUS;
	if (deadZoneRadius <= 0) return false;

	const effectiveRadius = Math.min(deadZoneRadius, soundMaxDistance * 0.5);
	return distance < effectiveRadius;
}

export function clampGainDelta(targetGain, soundId) {
	const maxDelta = CONSTANTS.AUDIO_MAX_GAIN_DELTA;

	if (maxDelta <= 0 || maxDelta >= 1) {
		return targetGain;
	}

	if (!lastGains.has(soundId)) {
		lastGains.set(soundId, { distance: 0, gain: targetGain });
		return targetGain;
	}

	const cached = lastGains.get(soundId);

	if (cached.gain === null) {
		cached.gain = targetGain;
		return targetGain;
	}

	const delta = targetGain - cached.gain;
	const clampedDelta = Math.max(-maxDelta, Math.min(maxDelta, delta));
	const clampedGain = cached.gain + clampedDelta;

	cached.gain = clampedGain;
	return clampedGain;
}

export function getSoundSmoothedDistance(userPos, soundPos, soundId, map) {
	if (!userPos || !soundPos) return 0;

	const rawDistance = map ? map.distance(userPos, soundPos) : Geometry.calculateDistanceMeters(userPos, soundPos);
	return getSmoothedDistance(rawDistance, soundId);
}

export function getSmoothedModulationValue(rawValue, soundId, modKey) {
	const alpha = CONSTANTS.AUDIO_SMOOTHING_ALPHA;
	const cacheKey = `${soundId}_${modKey}`;

	if (!lastGains.has(cacheKey)) {
		lastGains.set(cacheKey, { value: rawValue });
		return rawValue;
	}

	const cached = lastGains.get(cacheKey);

	if (alpha >= 1) {
		cached.value = rawValue;
		return rawValue;
	}

	if (alpha > 0) {
		cached.value = cached.value + alpha * (rawValue - cached.value);
	}

	return cached.value;
}

export function clearSoundCache(soundId) {
	const keysToDelete = [];
	for (const key of lastGains.keys()) {
		if (key === soundId || key.startsWith(`${soundId}_`)) {
			keysToDelete.push(key);
		}
	}
	keysToDelete.forEach(key => lastGains.delete(key));
}

export function getSettings() {
	return {
		smoothingAlpha: CONSTANTS.AUDIO_SMOOTHING_ALPHA,
		maxGainDelta: CONSTANTS.AUDIO_MAX_GAIN_DELTA,
		deadZoneRadius: CONSTANTS.AUDIO_DEAD_ZONE_RADIUS
	};
}

export function applySettings(settings) {
	if (settings.smoothingAlpha !== undefined) {
		CONSTANTS.AUDIO_SMOOTHING_ALPHA = Math.max(0, Math.min(1, settings.smoothingAlpha));
	}
	if (settings.maxGainDelta !== undefined) {
		CONSTANTS.AUDIO_MAX_GAIN_DELTA = Math.max(0, Math.min(1, settings.maxGainDelta));
	}
	if (settings.deadZoneRadius !== undefined) {
		CONSTANTS.AUDIO_DEAD_ZONE_RADIUS = Math.max(0, Math.min(50, settings.deadZoneRadius));
	}
}
