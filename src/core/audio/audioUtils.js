import { CONSTANTS } from '../constants.js';
import { toRadians, toDegrees } from '../utils/math.js';
import { Selectors } from '../state/selectors.js';

let context = null;

export function setContext(ctx) {
	context = ctx;
}

export function calculateBearing(lat1, lon1, lat2, lon2) {
	const lat1Rad = toRadians(lat1);
	const lat2Rad = toRadians(lat2);
	const deltaLonRad = toRadians(lon2 - lon1);

	const y = Math.sin(deltaLonRad) * Math.cos(lat2Rad);
	const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
		Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLonRad);

	const bearingRad = Math.atan2(y, x);
	const bearingDeg = toDegrees(bearingRad);

	return (bearingDeg + 360) % 360;
}

function isInsideAssignedZones(userPos, obj) {
	const zones = obj.pathRoles?.zones;
	if (!zones || zones.length === 0) return true;

	const paths = Selectors.getPaths();
	for (let i = 0; i < zones.length; i++) {
		const path = paths.find(p => p.id === zones[i]);
		if (path && context.Geometry.isPointInControlPath(userPos, path)) return true;
	}
	return false;
}

export function calcAreaScalar(userPos, obj) {
	if (!context.Geometry.isPointInShape(userPos, obj)) return 0;
	if (!isInsideAssignedZones(userPos, obj)) return 0;

	let volumeScalar;
	const volumeOrigin = obj.volumeOrigin || 'icon';

	if (volumeOrigin === 'division' || volumeOrigin === 'centerline') {
		volumeScalar = context.Geometry.getDivisionVolume(userPos, obj);
	} else if (obj.volumeModel === 'raycast') {
		volumeScalar = context.Geometry.getRaycastVolume(userPos, obj);
	} else {
		const iconPos = obj.marker.getLatLng();
		const d = context.map.distance(userPos, iconPos);
		let maxD;

		if (obj.shapeType === "circle") {
			maxD = context.Geometry.getDistanceToCircleBoundary(iconPos, userPos, obj.circle);
		} else if (obj.shapeType === "line") {
			maxD = context.Geometry.getDistanceToLineBoundary(iconPos, userPos, obj.linePoints, obj.lineTolerance);
		} else if (obj.shapeType === "oval") {
			maxD = context.Geometry.getDistanceToOvalBoundary(iconPos, userPos, obj.ovalCenter, obj.radiusX, obj.radiusY);
		} else {
			maxD = context.Geometry.calculateMaxDistanceToPolygonBoundary(obj.vertices, iconPos);
		}

		volumeScalar = context.Geometry.volumeCurve(d / Math.max(maxD, 1), obj.params);
	}

	return volumeScalar;
}

export function soundVolumeValue(obj) {
	return obj._modulatedVolume !== undefined ? obj._modulatedVolume : obj.params.volume;
}

export function calcGain(userPos, obj) {
	const scalar = calcAreaScalar(userPos, obj);
	if (scalar === 0) return 0;
	return scalar * soundVolumeValue(obj);
}

export function isPathAudioActive(path) {
	return !!(path.params.echo?.enabled || path.params.silencer);
}

export function pathContributes(path, role) {
	const paths = Selectors.getPaths();
	const isPeer = role === 'echo'
		? (p) => !!p.params.echo?.enabled
		: (p) => !!p.params.silencer;

	for (let i = 0; i < paths.length; i++) {
		if (paths[i].soloed && isPeer(paths[i])) return !!path.soloed;
	}
	return !path.muted;
}

const silencerStates = new Map();

export function silencerSettings(silencer) {
	return {
		mode: silencer.mode ?? 'inside',
		action: silencer.action ?? 'fade',
		fade: silencer.fade ?? CONSTANTS.SILENCER_DEFAULT_FADE_M,
		curve: silencer.curve ?? 1,
		attack: silencer.attack ?? 0,
		release: silencer.release ?? 0
	};
}

function silencedDepth(userPos, path, settings) {
	const inside = context.Geometry.isPointInControlPath(userPos, path);
	if (inside !== (settings.mode === 'inside')) return 0;
	if (settings.action === 'gate' || settings.fade <= 0) return 1;

	const depth = Math.min(1, context.Geometry.distanceToControlPathEdge(userPos, path) / settings.fade);
	const exponent = CONSTANTS.SILENCER_MIN_EXPONENT + settings.curve * (1 - CONSTANTS.SILENCER_MIN_EXPONENT);
	return Math.pow(depth, exponent);
}

function settleSilencerLevel(pathId, target, settings, now) {
	const state = silencerStates.get(pathId);
	if (!state) {
		silencerStates.set(pathId, { level: target, target, time: now });
		return target;
	}

	const elapsed = Math.max(0, now - state.time);
	const duration = target > state.level ? settings.attack : settings.release;
	state.time = now;
	state.target = target;

	if (duration <= 0) {
		state.level = target;
	} else if (target > state.level) {
		state.level = Math.min(target, state.level + elapsed / duration);
	} else {
		state.level = Math.max(target, state.level - elapsed / duration);
	}
	return state.level;
}

export function isSilencerSettling() {
	for (const state of silencerStates.values()) {
		if (state.level !== state.target) return true;
	}
	return false;
}

export function calculateSilencing(userPos) {
	const silencing = { gain: 1, gateClosed: false };
	if (!userPos) return silencing;

	const now = performance.now() / 1000;
	const fadingPaths = new Set();
	const paths = Selectors.getPaths();
	for (let i = 0; i < paths.length; i++) {
		const path = paths[i];
		if (!path.params.silencer || !pathContributes(path, 'silencer')) continue;

		const settings = silencerSettings(path.params.silencer);
		const depth = silencedDepth(userPos, path, settings);

		if (settings.action === 'gate') {
			if (depth > 0) silencing.gateClosed = true;
			continue;
		}

		fadingPaths.add(path.id);
		silencing.gain = Math.min(silencing.gain, 1 - settleSilencerLevel(path.id, depth, settings, now));
	}

	for (const pathId of silencerStates.keys()) {
		if (!fadingPaths.has(pathId)) silencerStates.delete(pathId);
	}
	return silencing;
}

export function calculatePathGain(userPos, path) {
	let rawGain = 1;

	if (path.type === 'circle') {
		const distance = context.map.distance(userPos, path.center);
		const normalized = Math.min(1, distance / path.radius);
		rawGain = 1 - normalized;
	} else if (path.type === 'oval') {
		const a = path.radius;
		const b = path.radiusY;
		const dx = (userPos.lng - path.center.lng) * CONSTANTS.METERS_PER_LNG * Math.cos(path.center.lat * Math.PI / 180);
		const dy = (userPos.lat - path.center.lat) * CONSTANTS.METERS_PER_LAT;
		const normalized = Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b));
		rawGain = Math.max(0, 1 - normalized);
	} else if (path.type === 'line' && path.points) {
		let minDist = Infinity;
		for (let i = 0; i < path.points.length - 1; i++) {
			const dist = context.Geometry.distanceToLineSegmentMeters(userPos, path.points[i], path.points[i + 1]);
			if (dist < minDist) minDist = dist;
		}
		const normalized = Math.min(1, minDist / (path.tolerance || CONSTANTS.LINE_PATH_BUFFER_M));
		rawGain = 1 - normalized;
	} else if (path.type === 'polygon') {
		const centroid = context.Geometry.calculateCentroid(path.points);
		const maxDist = context.Geometry.calculateMaxPolygonDistance(path.points);
		const distance = context.map.distance(userPos, centroid);
		const normalized = Math.min(1, distance / maxDist);
		rawGain = 1 - normalized;
	}

	return rawGain;
}

export function calculateRelativePosition(soundPos, userPos, userDirection) {
	const deltaLat = soundPos.lat - userPos.lat;
	const deltaLng = soundPos.lng - userPos.lng;

	const y = deltaLat * CONSTANTS.METERS_PER_LAT;
	const x = deltaLng * CONSTANTS.METERS_PER_LNG * Math.cos(userPos.lat * Math.PI / 180);

	const angleRad = userDirection * (Math.PI / 180);
	const cosAngle = Math.cos(angleRad);
	const sinAngle = Math.sin(angleRad);

	const rotatedX = x * cosAngle - y * sinAngle;
	const rotatedY = x * sinAngle + y * cosAngle;

	return { x: rotatedX, y: rotatedY, z: 0 };
}

export function calculateBearingPan(userPos, soundPos, userDirection) {
	const lat1 = userPos.lat * Math.PI / 180;
	const lat2 = soundPos.lat * Math.PI / 180;
	const deltaLng = (soundPos.lng - userPos.lng) * Math.PI / 180;

	const y = Math.sin(deltaLng) * Math.cos(lat2);
	const x = Math.cos(lat1) * Math.sin(lat2) -
		Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);

	let absoluteBearing = Math.atan2(y, x) * 180 / Math.PI;
	absoluteBearing = (absoluteBearing + 360) % 360;

	let relativeBearing = (absoluteBearing - userDirection + 360) % 360;
	return Math.sin(relativeBearing * Math.PI / 180);
}
