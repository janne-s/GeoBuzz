import { AppState } from '../core/state/StateManager.js';
import { Selectors } from '../core/state/selectors.js';
import { GeolocationManager } from '../core/geospatial/GeolocationManager.js';
import { GpsNoise } from '../simulation/GpsNoise.js';
import { simulationSpeedMs } from '../simulation/SimulationSpeed.js';
import { CONSTANTS } from '../core/constants.js';
import { toRadians } from '../core/utils/math.js';

const ARRIVAL_RADIUS_M = 4;
const SCALE_MIN = 0;
const MAX_STEP_S = 0.5;
const PLAIN_ACCURACY_M = 5;
const DEFAULT_NOISE_M = 6;
const DEFAULT_VARIABILITY = 0.35;
const NOISE_MAX_M = 20;
const NOISE_STEP_M = 0.5;

const LABELS = {
	toggle: 'Guided listening',
	start: 'Start',
	stop: 'Stop',
	pace: 'Pace',
	scale: 'Scale',
	unevenness: 'Unevenness',
	drift: 'GPS drift',
	hint: 'Click the map to walk somewhere else.',
	steering: 'Walking to where you clicked.',
	arrived: 'Steering finished. Following the piece again.',
	close: 'Close'
};

const SPEED_CHOICES = [
	{ label: 'Walking', kmh: 5 },
	{ label: 'Strolling', kmh: 3 },
	{ label: 'Running', kmh: 12 },
	{ label: 'Cycling', kmh: 20 }
];

const ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
	'<circle cx="5" cy="18" r="2.4"/><circle cx="19" cy="6" r="2.4"/>' +
	'<path d="M7.4 16.6c3-1 3.6-3.4 2.2-5.2s-.6-4.2 2.4-5.2" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="2.6 2.6"/>' +
	'</svg>';

const state = {
	mounted: false,
	active: false,
	hadGeolocation: false,
	map: null,
	root: null,
	toggle: null,
	panel: null,
	switch: null,
	hint: null,
	position: null,
	target: null,
	tourIndex: 0,
	frameId: null,
	lastFrameTime: 0,
	mapClickHandler: null
};

function distanceM(from, to) {
	const meanLat = toRadians((from.lat + to.lat) / 2);
	const north = toRadians(to.lat - from.lat) * CONSTANTS.EARTH_RADIUS_M;
	const east = toRadians(to.lng - from.lng) * CONSTANTS.EARTH_RADIUS_M * Math.cos(meanLat);
	return Math.hypot(north, east);
}

function tourPoints() {
	return Selectors.getSounds()
		.map(sound => ({ lat: sound.userLat, lng: sound.userLng }))
		.filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function startPosition() {
	const points = tourPoints();
	if (points.length) return { ...points[0] };
	const centre = state.map?.getCenter();
	return centre ? { lat: centre.lat, lng: centre.lng } : null;
}

function currentTarget() {
	if (state.target) return state.target;
	const points = tourPoints();
	if (points.length < 2) return null;
	return points[state.tourIndex % points.length];
}

function onArrived() {
	if (state.target) {
		state.target = null;
		setHint(LABELS.arrived);
		return;
	}
	const points = tourPoints();
	if (points.length) state.tourIndex = (state.tourIndex + 1) % points.length;
}

function report(dt) {
	const noisy = GpsNoise.rawFrom(state.position, dt);
	const reading = noisy || {
		latitude: state.position.lat,
		longitude: state.position.lng,
		accuracy: PLAIN_ACCURACY_M,
		timestamp: Date.now()
	};

	GeolocationManager.handlePositionUpdate({
		coords: {
			latitude: reading.latitude,
			longitude: reading.longitude,
			accuracy: reading.accuracy,
			heading: null,
			speed: null
		},
		timestamp: reading.timestamp
	});
}

function tick(now) {
	if (!state.active) return;

	const delta = now - state.lastFrameTime;
	if (delta < GpsNoise.reportIntervalMs()) {
		state.frameId = requestAnimationFrame(tick);
		return;
	}

	const dt = Math.min(MAX_STEP_S, Math.max(0, delta / 1000));
	state.lastFrameTime = now;

	const speed = simulationSpeedMs(dt);
	const target = currentTarget();

	const step = speed * dt;

	if (target && state.position && step > 0) {
		const remaining = distanceM(state.position, target);

		if (remaining <= Math.max(step, ARRIVAL_RADIUS_M)) {
			state.position = { lat: target.lat, lng: target.lng };
			onArrived();
		} else {
			const fraction = step / remaining;
			state.position = {
				lat: state.position.lat + (target.lat - state.position.lat) * fraction,
				lng: state.position.lng + (target.lng - state.position.lng) * fraction
			};
		}
	}

	if (state.position) report(dt);
	state.frameId = requestAnimationFrame(tick);
}

function setHint(message) {
	if (state.hint) state.hint.textContent = message;
}

function createElement(tag, className, text) {
	const element = document.createElement(tag);
	if (className) element.className = className;
	if (text) element.textContent = text;
	return element;
}

function createSlider(labelText, min, max, step, value, unit, onInput) {
	const row = createElement('div', 'gb-guided-row');
	const label = createElement('label', 'gb-guided-label', labelText);
	const input = document.createElement('input');
	input.type = 'range';
	input.min = String(min);
	input.max = String(max);
	input.step = String(step);
	input.value = String(value);
	const readout = createElement('span', 'gb-guided-value', unit(value));

	input.addEventListener('input', () => {
		const parsed = parseFloat(input.value);
		readout.textContent = unit(parsed);
		onInput(parsed);
	});

	label.appendChild(input);
	row.appendChild(label);
	row.appendChild(readout);
	return row;
}

function buildPanel() {
	const panel = createElement('div', 'gb-guided-panel');
	panel.hidden = true;

	const header = createElement('div', 'gb-guided-header');

	state.switch = createElement('button', 'gb-guided-switch', LABELS.start);
	state.switch.type = 'button';
	state.switch.addEventListener('click', () => {
		if (state.active) GuidedMode.stop();
		else GuidedMode.start();
	});
	header.appendChild(state.switch);

	const close = createElement('button', 'gb-guided-close', '×');
	close.type = 'button';
	close.title = LABELS.close;
	close.setAttribute('aria-label', LABELS.close);
	close.addEventListener('click', () => GuidedMode.closePanel());
	header.appendChild(close);

	panel.appendChild(header);

	const speedRow = createElement('div', 'gb-guided-row');
	const speedLabel = createElement('label', 'gb-guided-label', LABELS.pace);
	const speedSelect = document.createElement('select');

	for (const choice of SPEED_CHOICES) {
		const option = document.createElement('option');
		option.value = String(choice.kmh);
		option.textContent = `${choice.label} (${choice.kmh} km/h)`;
		if (choice.kmh === Selectors.getSimulationSpeed()) option.selected = true;
		speedSelect.appendChild(option);
	}

	speedSelect.addEventListener('change', () => {
		AppState.simulation.speedKmh = parseFloat(speedSelect.value);
	});

	speedLabel.appendChild(speedSelect);
	speedRow.appendChild(speedLabel);
	panel.appendChild(speedRow);

	panel.appendChild(createSlider(LABELS.scale, SCALE_MIN, CONSTANTS.SIMULATION_SPEED_SCALE_MAX,
		CONSTANTS.SIMULATION_SPEED_SCALE_STEP, Selectors.getSimulationSpeedScale(),
		value => `${value.toFixed(2)}×`, value => { AppState.simulation.speedScale = value; }));

	panel.appendChild(createSlider(LABELS.unevenness, 0, CONSTANTS.SIMULATION_VARIABILITY_MAX,
		CONSTANTS.SIMULATION_VARIABILITY_STEP, Selectors.getSimulationVariability(),
		value => value.toFixed(2), value => { AppState.simulation.speedVariability = value; }));

	panel.appendChild(createSlider(LABELS.drift, 0, NOISE_MAX_M, NOISE_STEP_M, Selectors.getSimulationNoise(),
		value => `${value.toFixed(1)} m`, value => { AppState.simulation.positionNoise = value; }));

	state.hint = createElement('p', 'gb-guided-hint', LABELS.hint);
	panel.appendChild(state.hint);

	return panel;
}

function syncControls() {
	if (state.switch) {
		state.switch.textContent = state.active ? LABELS.stop : LABELS.start;
		state.switch.classList.toggle('active', state.active);
	}
	if (state.toggle) state.toggle.classList.toggle('active', state.active);
}

function handleMapClick(event) {
	if (!state.active) return;
	state.target = { lat: event.latlng.lat, lng: event.latlng.lng };
	setHint(LABELS.steering);
}

export const GuidedMode = {
	mount({ container, map, defaults = {} } = {}) {
		if (state.mounted || !container || !map) return;

		state.map = map;

		AppState.simulation.positionNoise = defaults.noise ?? DEFAULT_NOISE_M;
		AppState.simulation.speedVariability = defaults.variability ?? DEFAULT_VARIABILITY;
		if (Number.isFinite(defaults.speedKmh)) AppState.simulation.speedKmh = defaults.speedKmh;
		if (Number.isFinite(defaults.scale)) AppState.simulation.speedScale = defaults.scale;

		state.root = createElement('div', 'gb-guided');
		state.toggle = createElement('button', 'gb-guided-toggle');
		state.toggle.type = 'button';
		state.toggle.title = LABELS.toggle;
		state.toggle.setAttribute('aria-label', LABELS.toggle);
		state.toggle.setAttribute('aria-expanded', 'false');
		state.toggle.innerHTML = ICON_SVG;
		state.toggle.addEventListener('click', () => this.togglePanel());

		state.panel = buildPanel();
		state.root.appendChild(state.toggle);
		state.root.appendChild(state.panel);
		container.appendChild(state.root);

		state.mounted = true;
	},

	isActive() {
		return state.active;
	},

	isMounted() {
		return state.mounted;
	},

	setDestination(latlng) {
		if (!latlng) return;
		state.target = { lat: latlng.lat, lng: latlng.lng };
	},

	start() {
		if (state.active) return;

		state.position = startPosition();
		if (!state.position) return;

		const status = GeolocationManager.getStatusInfo().status;
		state.hadGeolocation = status === CONSTANTS.GEOLOCATION_STATUS.ACTIVE ||
			status === CONSTANTS.GEOLOCATION_STATUS.SEARCHING;

		GeolocationManager.stopWatching();
		GpsNoise.reset();

		state.active = true;
		state.target = null;
		state.tourIndex = 1;
		state.lastFrameTime = performance.now();

		state.mapClickHandler = handleMapClick;
		state.map.on('click', state.mapClickHandler);

		syncControls();
		setHint(LABELS.hint);

		report(0);
		state.frameId = requestAnimationFrame(tick);
	},

	stop() {
		if (!state.active) return;

		state.active = false;
		if (state.frameId) cancelAnimationFrame(state.frameId);
		state.frameId = null;

		if (state.mapClickHandler) {
			state.map.off('click', state.mapClickHandler);
			state.mapClickHandler = null;
		}

		GpsNoise.reset();

		syncControls();

		if (state.hadGeolocation) GeolocationManager.setupGeolocation();
	},

	openPanel() {
		if (state.panel) state.panel.hidden = false;
		if (state.toggle) state.toggle.setAttribute('aria-expanded', 'true');
	},

	closePanel() {
		if (state.panel) state.panel.hidden = true;
		if (state.toggle) state.toggle.setAttribute('aria-expanded', 'false');
	},

	togglePanel() {
		if (state.panel?.hidden) this.openPanel();
		else this.closePanel();
	}
};
