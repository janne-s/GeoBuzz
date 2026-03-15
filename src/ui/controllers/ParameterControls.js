import { createElement, createSelect, animateSliderReset } from '../domHelpers.js';
import { AppState } from '../../core/state/StateManager.js';
import { CONSTANTS } from '../../core/constants.js';
import { appContext } from '../../core/AppContext.js';
import { getParameterMeta, setCustomRange } from '../../config/ParameterRangeManager.js';
import { PARAMETER_REGISTRY } from '../../config/parameterRegistry.js';
import { ModalSystem } from '../ModalSystem.js';

let context = null;

export function setContext(appCtx) {
	context = appCtx;
}

export function updateFrequencyModeIndicators(target) {
	const pitchLabels = document.querySelectorAll('.parameter-control label');
	pitchLabels.forEach(label => {
		if (label.textContent === 'Pitch') {
			if (target.frequencyMode) {
				label.classList.add('pitch-inactive');
				label.classList.remove('pitch-active');
			} else {
				label.classList.add('pitch-active');
				label.classList.remove('pitch-inactive');
			}
		} else if (label.textContent === 'Frequency') {
			if (target.frequencyMode) {
				label.classList.add('frequency-active');
				label.classList.remove('frequency-inactive');
			} else {
				label.classList.add('frequency-inactive');
				label.classList.remove('frequency-active');
			}
		}
	});
}

export function createParameterControl(def, paramKey, target, onUpdate, options = {}) {
	const effectiveDef = getParameterMeta(paramKey) || def;

	const group = createElement('div', 'parameter-control' + (options.small ? ' small' : ''));

	const labelEl = createElement('label');
	labelEl.textContent = options.label || effectiveDef.label;
	group.appendChild(labelEl);

	const getValue = () => context.ParameterManager.getValue(target, paramKey, options);
	const setValue = (value) => {
		context.ParameterManager.setValue(target, paramKey, value, options);
		if (onUpdate) onUpdate();
	};

	if (effectiveDef.type === 'select') {
		const select = createSelect(effectiveDef.options, getValue(), (e) => {
			const value = e.target.value;
			AppState.dispatch({
				type: 'PARAMETER_CHANGED',
				payload: {
					target: target,
					paramKey: paramKey,
					value: value,
					options: options
				}
			});
			if (onUpdate) onUpdate();
		});
		group.appendChild(select);
		group.appendChild(createElement('span'));

	} else if (effectiveDef.type === 'checkbox') {
		const checkbox = createElement('input');
		checkbox.type = 'checkbox';
		checkbox.checked = getValue();

		checkbox.onchange = () => {
			const value = checkbox.checked;
			AppState.dispatch({
				type: 'PARAMETER_CHANGED',
				payload: {
					target: target,
					paramKey: paramKey,
					value: value,
					options: options
				}
			});
			if (onUpdate) onUpdate();
		};

		group.appendChild(checkbox);
		group.appendChild(createElement('span'));

	} else if (effectiveDef.type === 'number') {
		const input = createElement('input');
		input.type = 'number';
		input.min = effectiveDef.min;
		input.max = effectiveDef.max;
		input.step = effectiveDef.step || 1;
		input.value = getValue();
		input.style.width = '100px';

		const unit = createElement('span', 'value-display');
		unit.textContent = effectiveDef.unit || '';

		input.onchange = () => {
			const value = parseFloat(input.value);
			if (!isNaN(value)) {
				const clampedValue = Math.max(effectiveDef.min, Math.min(effectiveDef.max, value));
				input.value = clampedValue;

				AppState.dispatch({
					type: 'PARAMETER_CHANGED',
					payload: {
						target: target,
						paramKey: paramKey,
						value: clampedValue,
						options: options
					}
				});
			}
		};

		group.appendChild(input);
		group.appendChild(unit);

	} else if (paramKey === 'streamUrl') {
		const input = createElement('input');
		input.type = 'text';
		input.value = getValue();
		input.style.width = '100%';
		input.placeholder = 'Enter stream URL (MP3, OGG, AAC, etc.)';

		const statusIndicator = createElement('div', 'stream-status-inline');
		if (target.streamStatus) {
			statusIndicator.textContent = target.streamStatus;
			statusIndicator.className = `stream-status-inline ${target.streamStatus}`;
		}

		input.onchange = async () => {
			const value = input.value;
			target.params.streamUrl = value;

			statusIndicator.textContent = 'testing...';
			statusIndicator.className = 'stream-status-inline loading';

			if (value) {
				const result = await context.StreamManager.testStreamUrl(value);
				if (result.success) {
					statusIndicator.textContent = 'valid';
					statusIndicator.className = 'stream-status-inline ready';
					target.params.streamUrl = value;

					if (target.type === 'StreamPlayer') {
						await context.StreamManager.initializeStream(target);
					const userPos = context.GeolocationManager.getUserPosition();
					if (userPos) {
						target.wasInsideArea = false;
						await context.waitForNextFrame();
						context.audioFunctions.updateAudio(userPos);
					}
					}
				} else {
					statusIndicator.textContent = 'invalid';
					statusIndicator.className = 'stream-status-inline error';
				}
			} else {
				statusIndicator.textContent = '';
				statusIndicator.className = 'stream-status-inline';
				if (target.type === 'StreamPlayer') {
					context.StreamManager.cleanupStream(target);
				}
			}
		};

		const inputContainer = createElement('div');
		inputContainer.style.width = '100%';
		inputContainer.appendChild(input);
		inputContainer.appendChild(statusIndicator);

		group.appendChild(inputContainer);
		group.appendChild(createElement('span'));

	} else {
		const slider = createElement('input');
		slider.type = 'range';
		slider.min = effectiveDef.min;
		slider.step = effectiveDef.step;

		if (effectiveDef.dynamicMax && (target.type === 'SoundFile' && target.soundDuration)) {
			const maxFade = target.soundDuration;
			const step = parseFloat(slider.step);
			slider.max = Math.ceil(maxFade / step) * step;
			if (getValue() > maxFade) {
				setValue(maxFade);
			}
		} else {
			slider.max = typeof effectiveDef.max === 'function' ? effectiveDef.max(target) : effectiveDef.max;
		}

		slider.value = getValue();

		const isPanDisabled = paramKey === 'pan' && target.useSpatialPanning && context.Selectors.getSpatialMode() !== 'off';
		if (isPanDisabled) {
			slider.disabled = true;
			group.classList.add('control-disabled');
			labelEl.title = 'Pan is disabled when Spatial panning mode is active. Set Panning to Manual to use this control.';
		}

		const display = createElement('span', 'value-display');
		display.title = 'Click to enter value directly';

		const updateDisplay = (val) => {
			let displayVal = parseFloat(val).toFixed(2);
			if (paramKey === 'pitch') {
				display.textContent = context.midiToNoteName(val);
			} else if (effectiveDef.formatDisplay) {
				display.textContent = effectiveDef.formatDisplay(val);
			} else {
				let text = displayVal + (effectiveDef.unit || '');
				if (effectiveDef.showDistance) {
					text += ` (${(val * CONSTANTS.SPEED_OF_SOUND_MS).toFixed(0)}m)`;
				}
				display.textContent = text;
			}
		};
		updateDisplay(slider.value);

		display.addEventListener('click', async () => {
			const currentValue = parseFloat(slider.value);
			const promptValue = await ModalSystem.prompt('Enter value:', currentValue.toString(), 'Set Parameter Value');

			if (promptValue === null) return;

			const newValue = parseFloat(promptValue);
			if (isNaN(newValue)) return;

			const currentMax = parseFloat(slider.max);
			const currentMin = parseFloat(slider.min);

			if (newValue < currentMin) {
				await ModalSystem.alert(`Value must be at least ${currentMin}`, 'Invalid Value');
				return;
			}

			if (newValue > currentMax) {
				const baseParam = PARAMETER_REGISTRY[paramKey];
				if (!baseParam) return;

				const step = parseFloat(slider.step);
				const roundedMax = Math.ceil(newValue / step) * step;

				slider.max = roundedMax;

				const customRange = {};
				if (currentMin !== baseParam.min) customRange.min = currentMin;
				customRange.max = roundedMax;
				if (step !== baseParam.step) customRange.step = step;

				setCustomRange(paramKey, customRange);
			}

			slider.value = newValue;
			updateDisplay(newValue);
			setValue(newValue);
		});

		slider.addEventListener('dblclick', (e) => {
			e.preventDefault();

			let defaultValue;
			if (effectiveDef.defaultValue !== undefined) {
				defaultValue = effectiveDef.defaultValue;
			} else if (CONSTANTS.DEFAULT_SOUND[paramKey] !== undefined) {
				defaultValue = CONSTANTS.DEFAULT_SOUND[paramKey];
			} else if (paramKey.startsWith('fx_eq_') && CONSTANTS.DEFAULT_EQ_VALUES[paramKey.replace('fx_eq_', '')] !== undefined) {
				defaultValue = CONSTANTS.DEFAULT_EQ_VALUES[paramKey.replace('fx_eq_', '')];
			} else if (['low', 'mid', 'high', 'lowFrequency', 'highFrequency'].includes(paramKey)) {
				defaultValue = CONSTANTS.DEFAULT_EQ_VALUES[paramKey];
			} else {
				defaultValue = effectiveDef.min;
			}

			slider.value = defaultValue;
			updateDisplay(defaultValue);
			setValue(defaultValue);
			animateSliderReset(slider);
		});

		slider.oninput = () => {
			const value = parseFloat(slider.value);
			updateDisplay(value);
			AppState.dispatch({
				type: 'PARAMETER_CHANGED',
				payload: {
					target: target,
					paramKey: paramKey,
					value: value,
					options: options
				}
			});
		};

		group.appendChild(slider);
		group.appendChild(display);
	}

	return group;
}

export function updateNodeParameter(node, param, value) {
	if (!node || node[param] === undefined) return;

	try {
		if (typeof node[param].value !== 'undefined') {
			if (node[param].cancelScheduledValues) {
				node[param].cancelScheduledValues(Tone.now());
			}
			node[param].value = value;
		} else {
			node[param] = value;
		}
	} catch (error) {
		console.warn(`Error updating parameter ${param}:`, error);
	}
}
