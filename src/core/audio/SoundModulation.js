import { CONSTANTS } from '../constants.js';
import { PARAMETER_REGISTRY } from '../../config/parameterRegistry.js';
import { getSmoothedModulationValue } from './AudioSmoother.js';

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
