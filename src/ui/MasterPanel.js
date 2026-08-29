import { createElement, createButton } from './domHelpers.js';
import { CONSTANTS } from '../core/constants.js';
import { MasterBus } from '../core/audio/MasterBus.js';

const VISIBILITY_KEY = 'geobuzz_masterPanelVisible';

let panel = null;
let elements = null;
let frameId = null;
let lastFrameTime = 0;

function levelToPercent(db) {
	const floor = CONSTANTS.MASTER_METER_FLOOR_DB;
	if (db <= floor) return 0;
	if (db >= 0) return 100;
	return ((db - floor) / -floor) * 100;
}

function formatDb(db) {
	if (db === null || db <= CONSTANTS.MASTER_METER_FLOOR_DB) return '−∞';
	return db.toFixed(1);
}

function createMeterRow(label) {
	const row = createElement('div', 'master-meter-row');

	const labelEl = createElement('span', 'master-meter-label');
	labelEl.textContent = label;
	row.appendChild(labelEl);

	const track = createElement('div', 'master-meter-track');
	const target = createElement('div', 'master-meter-target');
	const targetLow = levelToPercent(CONSTANTS.MASTER_METER_TARGET_LOW_DB);
	target.style.left = `${targetLow}%`;
	target.style.width = `${levelToPercent(CONSTANTS.MASTER_METER_TARGET_HIGH_DB) - targetLow}%`;
	const peak = createElement('div', 'master-meter-fill master-meter-fill-peak');
	const rms = createElement('div', 'master-meter-fill master-meter-fill-rms');
	const hold = createElement('div', 'master-meter-hold');
	track.append(target, peak, rms, hold);
	row.appendChild(track);

	return { row, peak, rms, hold };
}

function createScale() {
	const scale = createElement('div', 'master-meter-scale');
	CONSTANTS.MASTER_METER_SCALE_TICKS_DB.forEach(db => {
		const tick = createElement('span', 'master-meter-tick');
		tick.style.left = `${levelToPercent(db)}%`;
		tick.textContent = db;
		scale.appendChild(tick);
	});
	return scale;
}

function createReadout(label) {
	const cell = createElement('div', 'master-readout-cell');
	const name = createElement('span', 'master-readout-label');
	name.textContent = label;
	const value = createElement('strong', 'master-readout-value');
	value.textContent = '−∞';
	cell.append(name, value);
	return { cell, value };
}

function buildPanel() {
	panel = createElement('div', 'master-panel');
	panel.id = 'masterPanel';

	const header = createElement('div', 'master-panel-header');
	const title = createElement('span', 'master-panel-title');
	title.textContent = 'Master';
	const clip = createElement('span', 'master-panel-clip');
	clip.textContent = 'CLIP';
	const close = createButton('×', () => setVisible(false), 'master-panel-close');
	header.append(title, clip, close);

	const controls = createElement('div', 'master-panel-controls');

	const muteBtn = createButton('', () => {
		MasterBus.setMuted(!MasterBus.isMuted());
		syncControls();
	}, 'master-mute-btn');

	const slider = createElement('input', 'master-volume-slider');
	slider.type = 'range';
	slider.min = CONSTANTS.MASTER_VOLUME_MIN_DB;
	slider.max = CONSTANTS.MASTER_VOLUME_MAX_DB;
	slider.step = 0.5;
	slider.value = MasterBus.getVolumeDb();
	slider.oninput = () => {
		MasterBus.setVolumeDb(parseFloat(slider.value));
		syncControls();
	};

	const volumeValue = createElement('span', 'master-volume-value');
	controls.append(muteBtn, slider, volumeValue);

	const meter = createElement('div', 'master-meter');
	const left = createMeterRow('L');
	const right = createMeterRow('R');
	meter.append(left.row, right.row, createScale());

	const readout = createElement('div', 'master-panel-readout');
	const peakOut = createReadout('Peak');
	const rmsOut = createReadout('RMS');
	const crestOut = createReadout('Crest');
	const rangeOut = createReadout('Range');
	const resetBtn = createButton('<i class="fas fa-rotate-left"></i>', () => {
		MasterBus.resetStats();
	}, 'master-reset-btn');
	resetBtn.title = 'Reset peak hold and range';
	readout.append(peakOut.cell, rmsOut.cell, crestOut.cell, rangeOut.cell, resetBtn);

	const note = createElement('p', 'master-panel-note');
	note.textContent = 'Editor reference only — not saved into the buzz';

	panel.append(header, controls, meter, readout, note);
	document.body.appendChild(panel);

	elements = { clip, muteBtn, slider, volumeValue, left, right, peakOut, rmsOut, crestOut, rangeOut };
	syncControls();
}

function syncControls() {
	const muted = MasterBus.isMuted();
	elements.muteBtn.innerHTML = muted
		? '<i class="fas fa-volume-xmark"></i>'
		: '<i class="fas fa-volume-high"></i>';
	elements.muteBtn.classList.toggle('active', muted);
	elements.slider.value = MasterBus.getVolumeDb();
	elements.volumeValue.textContent = `${MasterBus.getVolumeDb().toFixed(1)} dB`;
}

function renderChannel(target, channel) {
	target.peak.style.clipPath = `inset(0 ${100 - levelToPercent(channel.peakDb)}% 0 0)`;
	target.rms.style.clipPath = `inset(0 ${100 - levelToPercent(channel.rmsDb)}% 0 0)`;
	target.hold.style.left = `${levelToPercent(channel.holdDb)}%`;
}

function render() {
	const reading = MasterBus.update();

	renderChannel(elements.left, reading.channels[0]);
	renderChannel(elements.right, reading.channels[1]);

	elements.peakOut.value.textContent = formatDb(reading.peakDb);
	elements.rmsOut.value.textContent = formatDb(reading.rmsDb);
	elements.crestOut.value.textContent = reading.rmsDb <= CONSTANTS.MASTER_METER_FLOOR_DB
		? '—'
		: reading.crestDb.toFixed(1);
	elements.rangeOut.value.textContent = reading.sessionMinRmsDb === null
		? '—'
		: `${reading.sessionMinRmsDb.toFixed(0)}…${reading.sessionMaxRmsDb.toFixed(0)}`;

	elements.clip.classList.toggle('active', reading.clipping);
}

function loop(timestamp) {
	frameId = requestAnimationFrame(loop);
	const elapsed = (timestamp - lastFrameTime) / 1000;
	if (elapsed < CONSTANTS.MASTER_METER_FRAME_INTERVAL) return;
	lastFrameTime = timestamp;
	render();
}

function startLoop() {
	if (frameId !== null) return;
	lastFrameTime = 0;
	frameId = requestAnimationFrame(loop);
}

function stopLoop() {
	if (frameId === null) return;
	cancelAnimationFrame(frameId);
	frameId = null;
}

function setVisible(visible) {
	if (!panel) return;
	panel.classList.toggle('visible', visible);
	if (visible) {
		startLoop();
	} else {
		stopLoop();
	}
	try {
		localStorage.setItem(VISIBILITY_KEY, visible ? 'true' : 'false');
	} catch (e) {
		console.warn('Master panel visibility could not be saved:', e);
	}
}

export function initMasterPanel() {
	if (panel) return;
	buildPanel();
	MasterBus.enable();

	let restored = false;
	try {
		restored = localStorage.getItem(VISIBILITY_KEY) === 'true';
	} catch (e) {
		restored = false;
	}
	if (restored) setVisible(true);

	document.addEventListener('visibilitychange', () => {
		if (document.hidden) {
			stopLoop();
		} else if (panel.classList.contains('visible')) {
			startLoop();
		}
	});
}

export function toggleMasterPanel() {
	if (!panel) return;
	setVisible(!panel.classList.contains('visible'));
}
