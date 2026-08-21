import { CONSTANTS } from '../constants.js';
import { getSmoothedModulationValue } from './AudioSmoother.js';

export function applyModShaping(modConfig, lfoValue, smoothingKey, mod) {
	let value = lfoValue;

	const inertia = modConfig.inertia || 0;
	if (inertia > 0) {
		const alpha = Math.max(CONSTANTS.MODULATION_INERTIA_MIN_ALPHA, 1 - inertia);
		value = getSmoothedModulationValue(value, smoothingKey, `${mod}_inertia`, alpha);
	}

	return modConfig.invert ? -value : value;
}
