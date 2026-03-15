export function isValidLatLon(lat, lon) {
	return typeof lat === 'number' &&
	       typeof lon === 'number' &&
	       lat >= -90 &&
	       lat <= 90 &&
	       lon >= -180 &&
	       lon <= 180 &&
	       !isNaN(lat) &&
	       !isNaN(lon);
}

export function isValidMarker(marker) {
	if (!marker) return false;
	const pos = marker.getLatLng ? marker.getLatLng() : marker;
	return pos && isValidLatLon(pos.lat, pos.lng);
}

export function isValidSound(sound) {
	return sound &&
	       typeof sound === 'object' &&
	       sound.id &&
	       sound.name &&
	       isValidLatLon(sound.lat, sound.lng);
}

export function isValidControlPath(path) {
	return path &&
	       typeof path === 'object' &&
	       path.id &&
	       path.type &&
	       (path.type === 'circle' || path.type === 'oval' ||
	        (Array.isArray(path.points) && path.points.length >= 2));
}

export function isValidSequencer(sequencer) {
	return sequencer &&
	       typeof sequencer === 'object' &&
	       sequencer.id &&
	       typeof sequencer.stepLength === 'number' &&
	       sequencer.stepLength > 0;
}

export function clampNumber(value, min, max) {
	return Math.min(Math.max(value, min), max);
}
