export function createElement(tag, className, styles = {}) {
	const el = document.createElement(tag);
	if (className) el.className = className;
	Object.assign(el.style, styles);
	return el;
}

export function createButton(text, onClick, className = '', styles = {}) {
	const btn = createElement('button', className, styles);
	btn.innerHTML = text;
	btn.onclick = onClick;
	return btn;
}

export function createSelect(options, selectedValue, onChange, styles = {}) {
	const select = createElement('select', '', styles);
	options.forEach(opt => {
		const option = createElement('option');
		option.value = opt.value;
		option.textContent = opt.label || opt.value;
		option.selected = opt.value === selectedValue;
		select.appendChild(option);
	});
	select.onchange = onChange;
	return select;
}

export function makeValueEditable(display, slider, { modalSystem, formatValue, onUpdate }) {
	display.title = 'Click to enter value directly';
	display.addEventListener('click', async () => {
		const currentValue = parseFloat(slider.value);
		const input = await modalSystem.prompt('Enter value:', currentValue.toString(), 'Set Parameter Value');
		if (input === null) return;

		const newValue = parseFloat(input);
		if (isNaN(newValue)) return;

		const min = parseFloat(slider.min);
		if (newValue < min) {
			await modalSystem.alert(`Value must be at least ${min}`, 'Invalid Value');
			return;
		}

		if (newValue > parseFloat(slider.max)) {
			const step = parseFloat(slider.step);
			slider.max = Math.ceil(newValue / step) * step;
		}

		slider.value = newValue;
		display.textContent = formatValue(newValue);
		onUpdate(newValue);
	});
}

export function createDualRangeSlider({ label: labelText = 'Speed Range', min, max, step, valueLow, valueHigh, unit, formatValue, modalSystem, onChange, onCommit }) {
	const fmt = formatValue || ((v) => parseFloat(v).toFixed(1) + (unit || ''));

	const container = createElement('div', 'dual-range-container');
	const track = createElement('div', 'dual-range-track');
	const fill = createElement('div', 'dual-range-fill');
	track.appendChild(fill);

	const sliderLow = createElement('input', 'dual-range-input dual-range-low');
	sliderLow.type = 'range';
	sliderLow.min = min;
	sliderLow.max = max;
	sliderLow.step = step;
	sliderLow.value = valueLow;

	const sliderHigh = createElement('input', 'dual-range-input dual-range-high');
	sliderHigh.type = 'range';
	sliderHigh.min = min;
	sliderHigh.max = max;
	sliderHigh.step = step;
	sliderHigh.value = valueHigh;

	const displayLow = createElement('span', 'value-display dual-range-value-low');
	displayLow.textContent = fmt(valueLow);
	const displayHigh = createElement('span', 'value-display dual-range-value-high');
	displayHigh.textContent = fmt(valueHigh);

	const updateFill = () => {
		const range = max - min;
		const lowPct = ((parseFloat(sliderLow.value) - min) / range) * 100;
		const highPct = ((parseFloat(sliderHigh.value) - min) / range) * 100;
		fill.style.left = lowPct + '%';
		fill.style.width = (highPct - lowPct) + '%';
	};

	const fireChange = () => {
		if (onChange) onChange(parseFloat(sliderLow.value), parseFloat(sliderHigh.value));
	};

	const fireCommit = () => {
		if (onCommit) onCommit(parseFloat(sliderLow.value), parseFloat(sliderHigh.value));
	};

	sliderLow.oninput = () => {
		if (parseFloat(sliderLow.value) > parseFloat(sliderHigh.value)) {
			sliderLow.value = sliderHigh.value;
		}
		displayLow.textContent = fmt(sliderLow.value);
		updateFill();
		fireChange();
	};

	sliderHigh.oninput = () => {
		if (parseFloat(sliderHigh.value) < parseFloat(sliderLow.value)) {
			sliderHigh.value = sliderLow.value;
		}
		displayHigh.textContent = fmt(sliderHigh.value);
		updateFill();
		fireChange();
	};

	sliderLow.onchange = fireCommit;
	sliderHigh.onchange = fireCommit;

	if (modalSystem) {
		makeValueEditable(displayLow, sliderLow, {
			modalSystem,
			formatValue: fmt,
			onUpdate: (val) => {
				if (val > parseFloat(sliderHigh.value)) {
					sliderHigh.value = val;
					displayHigh.textContent = fmt(val);
				}
				updateFill();
				fireChange();
				fireCommit();
			}
		});
		makeValueEditable(displayHigh, sliderHigh, {
			modalSystem,
			formatValue: fmt,
			onUpdate: (val) => {
				if (val < parseFloat(sliderLow.value)) {
					sliderLow.value = val;
					displayLow.textContent = fmt(val);
				}
				updateFill();
				fireChange();
				fireCommit();
			}
		});
	}

	const label = createElement('label');
	label.textContent = labelText;

	const sliders = createElement('div', 'dual-range-sliders');
	sliders.appendChild(track);
	sliders.appendChild(sliderLow);
	sliders.appendChild(sliderHigh);

	container.appendChild(label);
	container.appendChild(displayLow);
	container.appendChild(sliders);
	container.appendChild(displayHigh);

	updateFill();

	container.getValues = () => ({
		low: parseFloat(sliderLow.value),
		high: parseFloat(sliderHigh.value)
	});

	return container;
}

export function animateSliderReset(slider) {
	slider.classList.add('slider-flash');
	requestAnimationFrame(() => {
		slider.classList.remove('slider-flash');
		slider.addEventListener('transitionend', () => {
			slider.style.transition = '';
		}, { once: true });
	});
}
