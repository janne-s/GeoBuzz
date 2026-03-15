export function isFileSynth(obj) {
	const type = obj.type || obj;
	return type === 'SoundFile' || type === 'Sampler' || type === 'Granular' || type === 'StreamPlayer';
}

export function hasKeyboard(obj) {
	return obj.type !== 'NoiseSynth' && obj.type !== 'SoundFile' && obj.type !== 'StreamPlayer' && obj.type !== 'Granular';
}

export function isGranularMode(obj) {
	return obj.type === 'SoundFile' && obj.params.playbackMode === 'granular';
}

export function isLinearPath(path) {
	return path.type === 'line' || path.type === 'polygon';
}

export function isTouchDevice() {
	return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}
