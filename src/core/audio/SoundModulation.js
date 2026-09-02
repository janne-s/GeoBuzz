import { CONSTANTS } from '../constants.js';
import { PARAMETER_REGISTRY } from '../../config/parameterRegistry.js';
import { getSmoothedModulationValue } from './AudioSmoother.js';
import { calculatePathGain } from './audioUtils.js';

function pathAxisExtent(path) {
	if (path.type === 'circle') {
		return { center: path.center, halfLat: path.radius, halfLng: path.radius };
	}
	if (path.type === 'oval') {
		return { center: path.center, halfLat: path.radiusY, halfLng: path.radius };
	}

	const points = path.points;
	if (!points || points.length === 0) return null;

	let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
	for (let i = 0; i < points.length; i++) {
		const p = points[i];
		if (p.lat < minLat) minLat = p.lat;
		if (p.lat > maxLat) maxLat = p.lat;
		if (p.lng < minLng) minLng = p.lng;
		if (p.lng > maxLng) maxLng = p.lng;
	}

	const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
	return {
		center,
		halfLat: (maxLat - minLat) / 2 * CONSTANTS.METERS_PER_LAT,
		halfLng: (maxLng - minLng) / 2 * CONSTANTS.METERS_PER_LNG * Math.cos(center.lat * Math.PI / 180)
	};
}

export function applyPathModulationPatches(patches, options) {
	const { userPos, params, Geometry, resolvePath, addOffset } = options;
	if (!patches || patches.length === 0 || !userPos) return;

	for (let i = 0; i < patches.length; i++) {
		const patch = patches[i];
		const modulator = resolvePath(patch.pathId);
		if (!modulator) continue;

		let modValue = 0;

		if (patch.output === "distance") {
			modValue = calculatePathGain(userPos, modulator);
		} else if (patch.output === "x") {
			const extent = pathAxisExtent(modulator);
			if (!extent || !(extent.halfLng > 0)) continue;
			const lngDiff = (userPos.lng - extent.center.lng) * CONSTANTS.METERS_PER_LNG * Math.cos(extent.center.lat * Math.PI / 180);
			const normalized = Math.max(-1, Math.min(1, lngDiff / extent.halfLng));
			modValue = (normalized + 1) / 2;
		} else if (patch.output === "y") {
			const extent = pathAxisExtent(modulator);
			if (!extent || !(extent.halfLat > 0)) continue;
			const latDiff = (userPos.lat - extent.center.lat) * CONSTANTS.METERS_PER_LAT;
			const normalized = Math.max(-1, Math.min(1, latDiff / extent.halfLat));
			modValue = (normalized + 1) / 2;
		} else if (patch.output === "gate") {
			modValue = Geometry.isPointInControlPath(userPos, modulator) ? 1 : 0;
		}

		if (patch.invert) {
			modValue = 1 - modValue;
		}

		const target = patch.parameter;
		const def = PARAMETER_REGISTRY[target];
		if (!def) continue;

		const depthPercent = patch.depth / 100;
		if (depthPercent === 0) continue;

		const baseValue = params.originalValues?.[target] ?? params[target];
		if (baseValue === undefined) continue;

		let offset;
		if (target === 'pitch') {
			offset = (modValue - 0.5) * CONSTANTS.CENTS_PER_OCTAVE * depthPercent;
		} else {
			const paramMin = def.min !== undefined ? def.min : 0;
			const paramMax = def.max !== undefined ? def.max : 1;
			const modulatedValue = paramMin + modValue * (paramMax - paramMin);
			offset = (modulatedValue - baseValue) * depthPercent;
		}

		addOffset(target, offset);
	}
}

export function applySoundModulationPatches(patches, options) {
	const { userPos, selfPos, params, smoothingKey, Geometry, resolveSound, addOffset } = options;
	if (!patches || patches.length === 0 || !userPos) return;

	for (let i = 0; i < patches.length; i++) {
		const patch = patches[i];
		const refSound = resolveSound(patch.sourceId);
		if (!refSound?.marker) continue;

		const refPos = refSound.marker.getLatLng();
		const maxDist = refSound.maxDistance || CONSTANTS.DEFAULT_MOD_MAX_DISTANCE;
		let modValue = 0;

		if (patch.output === 'proximity') {
			if (!selfPos) continue;
			const distToThis = Geometry.calculateDistanceMeters(userPos, selfPos);
			const distToRef = Geometry.calculateDistanceMeters(userPos, refPos);
			const totalDist = distToThis + distToRef;
			modValue = totalDist > 0 ? distToThis / totalDist : 0.5;
		} else if (patch.output === 'distance') {
			const dist = Geometry.calculateDistanceMeters(userPos, refPos);
			const rawValue = 1 - Math.min(1, dist / maxDist);
			modValue = getSmoothedModulationValue(rawValue, smoothingKey, `soundMod_${i}_distance`);
		} else if (patch.output === 'x') {
			const lngDiff = (userPos.lng - refPos.lng) * CONSTANTS.METERS_PER_LNG * Math.cos(refPos.lat * Math.PI / 180);
			const rawValue = Math.max(-1, Math.min(1, lngDiff / maxDist));
			modValue = (getSmoothedModulationValue(rawValue, smoothingKey, `soundMod_${i}_x`) + 1) / 2;
		} else if (patch.output === 'y') {
			const latDiff = (userPos.lat - refPos.lat) * CONSTANTS.METERS_PER_LAT;
			const rawValue = Math.max(-1, Math.min(1, latDiff / maxDist));
			modValue = (getSmoothedModulationValue(rawValue, smoothingKey, `soundMod_${i}_y`) + 1) / 2;
		} else if (patch.output === 'gate') {
			const dist = Geometry.calculateDistanceMeters(userPos, refPos);
			modValue = dist <= maxDist ? 1 : 0;
		}

		const polarity = patch.polarity !== undefined ? patch.polarity : 1;
		modValue = 0.5 + (modValue - 0.5) * polarity;

		const def = PARAMETER_REGISTRY[patch.target];
		if (!def) continue;

		const rangePercent = patch.range / 100;
		if (rangePercent === 0) continue;

		const baseValue = params.originalValues?.[patch.target] ?? params[patch.target];
		if (baseValue === undefined) continue;

		let offset;
		if (patch.target === 'pitch') {
			offset = (modValue - 0.5) * CONSTANTS.CENTS_PER_OCTAVE * rangePercent;
		} else {
			const paramMin = def.min !== undefined ? def.min : 0;
			const paramMax = def.max !== undefined ? def.max : 1;
			const modulatedValue = paramMin + modValue * (paramMax - paramMin);
			offset = (modulatedValue - baseValue) * rangePercent;
		}

		addOffset(patch.target, offset);
	}
}
