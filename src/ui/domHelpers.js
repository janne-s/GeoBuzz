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

export function animateSliderReset(slider) {
	slider.classList.add('slider-flash');
	requestAnimationFrame(() => {
		slider.classList.remove('slider-flash');
		slider.addEventListener('transitionend', () => {
			slider.style.transition = '';
		}, { once: true });
	});
}
