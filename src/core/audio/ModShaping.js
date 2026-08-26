import { getSmoothedModulationValue } from './AudioSmoother.js';

const lastTimes = new Map();

export function applyModShaping(modConfig, lfoValue, smoothingKey, mod, now) {
	let value = lfoValue;

	const isLFO = !modConfig.source || modConfig.source === 'lfo';
	const inertia = isLFO ? 0 : (modConfig.inertia || 0);
	if (inertia > 0) {
		const timeKey = `${smoothingKey}_${mod}`;
		const last = lastTimes.get(timeKey);
		lastTimes.set(timeKey, now);

		const dt = last === undefined ? 0 : Math.max(0, now - last);
		const alpha = dt > 0 ? 1 - Math.exp(-dt / inertia) : 1;
		value = getSmoothedModulationValue(value, smoothingKey, `${mod}_inertia`, alpha);
	}

	return modConfig.invert ? -value : value;
}
