import { PARAMETER_REGISTRY } from './parameterRegistry.js';
import { AppState } from '../core/state/StateManager.js';
import { Actions } from '../core/state/actions.js';
import { Selectors } from '../core/state/selectors.js';

export function getParameterMeta(paramKey) {
	const defaultMeta = PARAMETER_REGISTRY[paramKey];
	if (!defaultMeta) return null;

	const customRange = Selectors.getCustomRange(paramKey);
	if (!customRange) return defaultMeta;

	return {
		...defaultMeta,
		min: customRange.min !== undefined ? customRange.min : defaultMeta.min,
		max: customRange.max !== undefined ? customRange.max : defaultMeta.max,
		step: customRange.step !== undefined ? customRange.step : defaultMeta.step
	};
}

export function validateRange(min, max, step) {
	const errors = [];

	if (min === null || min === undefined || isNaN(min) || !isFinite(min)) {
		errors.push('Min value must be a valid number');
	}

	if (max === null || max === undefined || isNaN(max) || !isFinite(max)) {
		errors.push('Max value must be a valid number');
	}

	if (step === null || step === undefined || isNaN(step) || !isFinite(step)) {
		errors.push('Step value must be a valid number');
	}

	if (errors.length > 0) return { valid: false, errors };

	if (min >= max) {
		errors.push('Min must be less than max');
	}

	if (step <= 0) {
		errors.push('Step must be greater than 0');
	}

	return { valid: errors.length === 0, errors };
}

export function getDefaultMin(paramKey) {
	const param = PARAMETER_REGISTRY[paramKey];
	if (!param) return 0;

	if (param.allowNegativeMin) {
		return param.min;
	}

	return Math.max(0, param.min);
}

export function setCustomRange(paramKey, customRange) {
	const param = PARAMETER_REGISTRY[paramKey];
	if (!param) {
		console.warn(`Parameter ${paramKey} not found in registry`);
		return { success: false, error: 'Parameter not found' };
	}

	const finalRange = {};

	if (customRange.min !== undefined) {
		finalRange.min = customRange.min;
	}

	if (customRange.max !== undefined) {
		finalRange.max = customRange.max;
	}

	if (customRange.step !== undefined) {
		finalRange.step = customRange.step;
	}

	const effectiveMin = finalRange.min !== undefined ? finalRange.min : param.min;
	const effectiveMax = finalRange.max !== undefined ? finalRange.max : param.max;
	const effectiveStep = finalRange.step !== undefined ? finalRange.step : param.step;

	const validation = validateRange(effectiveMin, effectiveMax, effectiveStep);
	if (!validation.valid) {
		return { success: false, errors: validation.errors };
	}

	AppState.dispatch(Actions.customizeParameterRange(paramKey, finalRange));
	clampParameterValues(paramKey, { min: effectiveMin, max: effectiveMax });

	return { success: true };
}

export function resetParameter(paramKey) {
	AppState.dispatch(Actions.resetParameterRange(paramKey));
}

export function resetAllParameters() {
	AppState.dispatch(Actions.resetAllParameterRanges());
}

export function clampParameterValues(paramKey, newRange) {
	const { min, max } = newRange;
	let modified = false;

	Selectors.getSounds().forEach(sound => {
		if (sound.params && paramKey in sound.params) {
			const currentValue = sound.params[paramKey];
			if (currentValue < min) {
				sound.params[paramKey] = min;
				modified = true;
			} else if (currentValue > max) {
				sound.params[paramKey] = max;
				modified = true;
			}
		}
	});

	Selectors.getPaths().forEach(path => {
		if (path.params && paramKey in path.params) {
			const currentValue = path.params[paramKey];
			if (currentValue < min) {
				path.params[paramKey] = min;
				modified = true;
			} else if (currentValue > max) {
				path.params[paramKey] = max;
				modified = true;
			}
		}
	});

	Selectors.getSequencers().forEach(sequencer => {
		if (sequencer.params && paramKey in sequencer.params) {
			const currentValue = sequencer.params[paramKey];
			if (currentValue < min) {
				sequencer.params[paramKey] = min;
				modified = true;
			} else if (currentValue > max) {
				sequencer.params[paramKey] = max;
				modified = true;
			}
		}
	});

	return modified;
}
