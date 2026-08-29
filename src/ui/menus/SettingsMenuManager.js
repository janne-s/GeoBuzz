import { createButton } from '../domHelpers.js';
import { createCollapsibleSection } from '../controllers/UIBuilder.js';
import { CONSTANTS } from '../../core/constants.js';
import { ParameterCustomizer } from '../ParameterCustomizer.js';
import { getSettings as getAudioSmootherSettings, applySettings as applyAudioSmootherSettings } from '../../core/audio/AudioSmoother.js';

let AppState, GeolocationManager;

export function setContext(context) {
	AppState = context.AppState;
	GeolocationManager = context.GeolocationManager;
}

export function initSettingsMenu() {
	const host = document.getElementById('settingsDynamicSections');
	if (!host) return;

	const parameters = createSection('Parameters', 'fa-sliders-h');
	parameters.appendChild(createButton(
		'<i class="fas fa-sliders-h"></i> Customize Parameters',
		() => {
			const customizer = new ParameterCustomizer();
			customizer.show();
		},
		"menu-btn"
	));
	host.appendChild(parameters);

	const tuning = createSection('Tuning', 'fa-wave-square');
	tuning.appendChild(createCollapsibleSection(
		'Audio Smoothing',
		'fa-wave-square',
		() => createAudioSmoothingControls(),
		false
	));
	tuning.appendChild(createCollapsibleSection(
		'GPS Accuracy',
		'fa-satellite',
		() => createGpsSmoothingControls(),
		false
	));
	host.appendChild(tuning);
}

function createSection(title, icon) {
	const section = document.createElement('div');
	section.className = 'menu-section';

	const heading = document.createElement('h3');
	heading.className = 'section-title flex-center';
	heading.innerHTML = `<i class="fas ${icon}"></i> ${title}`;
	section.appendChild(heading);

	return section;
}

function createAudioSmoothingControls() {
	const container = document.createElement('div');
	container.className = 'audio-smoothing-controls';

	const settings = getAudioSmootherSettings();

	const smoothingControl = document.createElement('div');
	smoothingControl.className = 'parameter-control';

	const smoothingLabel = document.createElement('label');
	smoothingLabel.textContent = 'Position Smoothing';
	smoothingControl.appendChild(smoothingLabel);

	const smoothingWrapper = document.createElement('div');
	smoothingWrapper.className = 'control-wrapper';

	const smoothingSlider = document.createElement('input');
	smoothingSlider.type = 'range';
	smoothingSlider.min = '0';
	smoothingSlider.max = '1';
	smoothingSlider.step = '0.01';
	smoothingSlider.value = settings.smoothingAlpha;
	smoothingSlider.className = 'parameter-slider';

	const smoothingDisplay = document.createElement('span');
	smoothingDisplay.className = 'value-display';
	smoothingDisplay.textContent = settings.smoothingAlpha.toFixed(2);

	smoothingSlider.oninput = () => {
		const value = parseFloat(smoothingSlider.value);
		smoothingDisplay.textContent = value.toFixed(2);
		applyAudioSmootherSettings({ smoothingAlpha: value });
	};

	smoothingSlider.onchange = () => {
		AppState.dispatch({ type: 'AUDIO_SMOOTHING_CHANGED' });
	};

	smoothingWrapper.appendChild(smoothingSlider);
	smoothingWrapper.appendChild(smoothingDisplay);
	smoothingControl.appendChild(smoothingWrapper);
	container.appendChild(smoothingControl);

	const gainDeltaControl = document.createElement('div');
	gainDeltaControl.className = 'parameter-control';

	const gainDeltaLabel = document.createElement('label');
	gainDeltaLabel.textContent = 'Max Gain Change';
	gainDeltaControl.appendChild(gainDeltaLabel);

	const gainDeltaWrapper = document.createElement('div');
	gainDeltaWrapper.className = 'control-wrapper';

	const gainDeltaSlider = document.createElement('input');
	gainDeltaSlider.type = 'range';
	gainDeltaSlider.min = '0';
	gainDeltaSlider.max = '1';
	gainDeltaSlider.step = '0.01';
	gainDeltaSlider.value = settings.maxGainDelta;
	gainDeltaSlider.className = 'parameter-slider';

	const gainDeltaDisplay = document.createElement('span');
	gainDeltaDisplay.className = 'value-display';
	gainDeltaDisplay.textContent = settings.maxGainDelta.toFixed(2);

	gainDeltaSlider.oninput = () => {
		const value = parseFloat(gainDeltaSlider.value);
		gainDeltaDisplay.textContent = value.toFixed(2);
		applyAudioSmootherSettings({ maxGainDelta: value });
	};

	gainDeltaSlider.onchange = () => {
		AppState.dispatch({ type: 'AUDIO_SMOOTHING_CHANGED' });
	};

	gainDeltaWrapper.appendChild(gainDeltaSlider);
	gainDeltaWrapper.appendChild(gainDeltaDisplay);
	gainDeltaControl.appendChild(gainDeltaWrapper);
	container.appendChild(gainDeltaControl);

	const deadZoneControl = document.createElement('div');
	deadZoneControl.className = 'parameter-control';

	const deadZoneLabel = document.createElement('label');
	deadZoneLabel.textContent = 'Dead Zone';
	deadZoneControl.appendChild(deadZoneLabel);

	const deadZoneWrapper = document.createElement('div');
	deadZoneWrapper.className = 'control-wrapper';

	const deadZoneSlider = document.createElement('input');
	deadZoneSlider.type = 'range';
	deadZoneSlider.min = '0';
	deadZoneSlider.max = '50';
	deadZoneSlider.step = '1';
	deadZoneSlider.value = settings.deadZoneRadius;
	deadZoneSlider.className = 'parameter-slider';

	const deadZoneDisplay = document.createElement('span');
	deadZoneDisplay.className = 'value-display';
	deadZoneDisplay.textContent = `${settings.deadZoneRadius}m`;

	deadZoneSlider.oninput = () => {
		const value = parseFloat(deadZoneSlider.value);
		deadZoneDisplay.textContent = `${value}m`;
		applyAudioSmootherSettings({ deadZoneRadius: value });
	};

	deadZoneSlider.onchange = () => {
		AppState.dispatch({ type: 'AUDIO_SMOOTHING_CHANGED' });
	};

	deadZoneWrapper.appendChild(deadZoneSlider);
	deadZoneWrapper.appendChild(deadZoneDisplay);
	deadZoneControl.appendChild(deadZoneWrapper);
	container.appendChild(deadZoneControl);

	const hintText = document.createElement('div');
	hintText.className = 'audio-smoothing-hint';
	hintText.innerHTML = '<small>Lower values = more smoothing/lag. Higher values = more responsive. Set to 1 to disable smoothing entirely.</small>';
	container.appendChild(hintText);

	return container;
}

function createGpsSmoothingControls() {
	const container = document.createElement('div');
	container.className = 'audio-smoothing-controls';

	const currentValue = GeolocationManager?.getGpsSmoothing() ?? CONSTANTS.GPS_SMOOTHING_DEFAULT;

	const sliderControl = document.createElement('div');
	sliderControl.className = 'parameter-control';

	const label = document.createElement('label');
	label.textContent = 'GPS Responsiveness';
	sliderControl.appendChild(label);

	const wrapper = document.createElement('div');
	wrapper.className = 'control-wrapper';

	const slider = document.createElement('input');
	slider.type = 'range';
	slider.min = '0';
	slider.max = '1';
	slider.step = '0.01';
	slider.value = currentValue;
	slider.className = 'parameter-slider';

	const display = document.createElement('span');
	display.className = 'value-display';
	display.textContent = currentValue.toFixed(2);

	slider.oninput = () => {
		const value = parseFloat(slider.value);
		display.textContent = value.toFixed(2);
		GeolocationManager?.setGpsSmoothing(value);
	};

	slider.onchange = () => {
		AppState.dispatch({ type: 'AUDIO_SMOOTHING_CHANGED' });
	};

	wrapper.appendChild(slider);
	wrapper.appendChild(display);
	sliderControl.appendChild(wrapper);
	container.appendChild(sliderControl);

	const hint = document.createElement('div');
	hint.className = 'audio-smoothing-hint';
	hint.innerHTML = '<small>Lower values = heavily filtered, smooth but latent movement. Higher values = raw sensor data, more responsive but noisy — useful for organic, unpredictable spatial behaviour.</small>';
	container.appendChild(hint);

	return container;
}
