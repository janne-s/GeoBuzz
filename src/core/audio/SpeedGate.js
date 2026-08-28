import { CONSTANTS } from '../constants.js';

export function createSpeedGateState() {
	return { committed: undefined, transitionStart: null };
}

export function isSpeedGateActive(min, max) {
	return (min ?? 0) > 0 || (max ?? 10) < 10;
}

export function getGridKeySpeedRange(soundObj, midiNote) {
	const gridSample = soundObj?.params?.gridSamples?.[midiNote];
	return {
		min: Math.max(gridSample?.speedMin ?? 0, soundObj?.params?.speedGateMin ?? 0),
		max: Math.min(gridSample?.speedMax ?? 10, soundObj?.params?.speedGateMax ?? 10)
	};
}

export function evaluateSpeedGate(state, inRange, holdSeconds, nowMs, userSpeed) {
	const hold = (holdSeconds ?? 0) * 1000;
	if (hold === 0) return inRange;

	if (!inRange && userSpeed < CONSTANTS.ZERO_SPEED_THRESHOLD) {
		state.committed = false;
		state.transitionStart = null;
		return false;
	}

	if (state.committed === undefined) {
		state.committed = inRange;
		state.transitionStart = null;
		return inRange;
	}
	if (inRange === state.committed) {
		state.transitionStart = null;
		return inRange;
	}
	if (state.transitionStart === null || state.transitionStart === undefined) {
		state.transitionStart = nowMs;
	}
	if (nowMs - state.transitionStart >= hold) {
		state.committed = inRange;
		state.transitionStart = null;
		return inRange;
	}
	return state.committed;
}

export function hasPendingTransition(state) {
	return !!state && state.transitionStart !== null && state.transitionStart !== undefined;
}
