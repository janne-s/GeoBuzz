import { CONSTANTS } from '../constants.js';
import { PARAMETER_REGISTRY } from '../../config/parameterRegistry.js';
import { getSmoothedModulationValue } from './AudioSmoother.js';
import { calculatePathGain } from './audioUtils.js';

function pathAxisExtent(path) {
	const tolerance = path.tolerance || 0;

	if (path.type === 'circle') {
		return { center: path.center, halfLat: path.radius + tolerance, halfLng: path.radius + tolerance };
	}
	if (path.type === 'oval') {
		return { center: path.center, halfLat: path.radiusY + tolerance, halfLng: path.radius + tolerance };
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
		halfLat: (maxLat - minLat) / 2 * CONSTANTS.METERS_PER_LAT + tolerance,
		halfLng: (maxLng - minLng) / 2 * CONSTANTS.METERS_PER_LNG * Math.cos(center.lat * Math.PI / 180) + tolerance
	};
}

function toLocalMeters(point, origin) {
	return {
		x: (point.lng - origin.lng) * CONSTANTS.METERS_PER_LNG * Math.cos(origin.lat * Math.PI / 180),
		y: (point.lat - origin.lat) * CONSTANTS.METERS_PER_LAT
	};
}

function rayToEllipse(p, rx, ry, ux, uy) {
	const px = p.x / rx, py = p.y / ry, dx = ux / rx, dy = uy / ry;
	const a = dx * dx + dy * dy;
	const b = px * dx + py * dy;
	const c = px * px + py * py - 1;
	const disc = b * b - a * c;
	if (disc < 0) return null;
	const t = (-b + Math.sqrt(disc)) / a;
	return t > 0 ? t : null;
}

function rayToPolygon(vertices, origin, ux, uy) {
	const pts = vertices.map(v => toLocalMeters(v, origin));
	let nearest = null;
	for (let i = 0; i < pts.length; i++) {
		const a = pts[i];
		const b = pts[(i + 1) % pts.length];
		const ex = b.x - a.x, ey = b.y - a.y;
		const denom = ux * ey - uy * ex;
		if (Math.abs(denom) < 1e-9) continue;
		const t = (a.x * ey - a.y * ex) / denom;
		const s = (a.x * uy - a.y * ux) / denom;
		if (t > 0 && s >= 0 && s <= 1 && (nearest === null || t < nearest)) nearest = t;
	}
	return nearest;
}

function edgeReach(sound, origin, ux, uy) {
	if (sound.shapeType === 'polygon' && sound.vertices?.length >= 3) {
		return rayToPolygon(sound.vertices, origin, ux, uy);
	}
	if (sound.shapeType === 'oval' && sound.ovalCenter) {
		return rayToEllipse(toLocalMeters(origin, sound.ovalCenter), sound.radiusX, sound.radiusY, ux, uy);
	}
	if (sound.shapeType === 'circle') {
		const centre = sound.circle ? sound.circle.getLatLng() : origin;
		const radius = sound.circle ? sound.circle.getRadius() : sound.maxDistance;
		if (!(radius > 0)) return null;
		return rayToEllipse(toLocalMeters(origin, centre), radius, radius, ux, uy);
	}
	return null;
}

function reachToward(sound, origin, ux, uy, fallback) {
	const reach = edgeReach(sound, origin, ux, uy);
	return reach > 0 ? reach : fallback;
}

function volumeOffset(baseValue, modValue, amount) {
	return -baseValue * amount * (1 - Math.max(0, Math.min(1, modValue)));
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
		} else if (target === 'volume') {
			offset = volumeOffset(baseValue, modValue, depthPercent);
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
			const offset = toLocalMeters(userPos, refPos);
			const dist = Math.hypot(offset.x, offset.y);
			const reach = dist > 0 ? reachToward(refSound, refPos, offset.x / dist, offset.y / dist, maxDist) : maxDist;
			const rawValue = 1 - Math.min(1, dist / reach);
			modValue = getSmoothedModulationValue(rawValue, smoothingKey, `soundMod_${i}_distance`);
		} else if (patch.output === 'x') {
			const lngDiff = toLocalMeters(userPos, refPos).x;
			const reach = reachToward(refSound, refPos, lngDiff < 0 ? -1 : 1, 0, maxDist);
			const rawValue = Math.max(-1, Math.min(1, lngDiff / reach));
			modValue = (getSmoothedModulationValue(rawValue, smoothingKey, `soundMod_${i}_x`) + 1) / 2;
		} else if (patch.output === 'y') {
			const latDiff = toLocalMeters(userPos, refPos).y;
			const reach = reachToward(refSound, refPos, 0, latDiff < 0 ? -1 : 1, maxDist);
			const rawValue = Math.max(-1, Math.min(1, latDiff / reach));
			modValue = (getSmoothedModulationValue(rawValue, smoothingKey, `soundMod_${i}_y`) + 1) / 2;
		} else if (patch.output === 'gate') {
			modValue = Geometry.isPointInShape(userPos, refSound) ? 1 : 0;
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
		} else if (patch.target === 'volume') {
			offset = volumeOffset(baseValue, modValue, rangePercent);
		} else {
			const paramMin = def.min !== undefined ? def.min : 0;
			const paramMax = def.max !== undefined ? def.max : 1;
			const modulatedValue = paramMin + modValue * (paramMax - paramMin);
			offset = (modulatedValue - baseValue) * rangePercent;
		}

		addOffset(patch.target, offset);
	}
}
