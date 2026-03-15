import { createElement, createButton, createSelect } from '../domHelpers.js';
import { createDraggableHeader } from '../controllers/HeaderBuilder.js';
import { createMenuStructure, createSwitch, createRadioButton, createCollapsibleSection } from '../controllers/UIBuilder.js';
import { CONSTANTS } from '../../core/constants.js';
import { ParameterCustomizer } from '../ParameterCustomizer.js';
import { getSettings as getAudioSmootherSettings, applySettings as applyAudioSmootherSettings } from '../../core/audio/AudioSmoother.js';

let AppState, Selectors, MenuManager, GeolocationManager, DeviceOrientationManager, appContext;
let closeAllMenus, ensureAudioContext, detachUserFromPath, attachUserToPath;
let startSimulationPlacement, setSpatialMode;

export function setContext(context) {
	AppState = context.AppState;
	Selectors = context.Selectors;
	MenuManager = context.MenuManager;
	GeolocationManager = context.GeolocationManager;
	DeviceOrientationManager = context.DeviceOrientationManager;
	appContext = context;
	closeAllMenus = context.closeAllMenus;
	ensureAudioContext = context.ensureAudioContext;
	detachUserFromPath = context.detachUserFromPath;
	attachUserToPath = context.attachUserToPath;
	startSimulationPlacement = context.startSimulationPlacement;
	setSpatialMode = context.setSpatialMode;
}

export function showUserMenu(point) {
	closeAllMenus();

	const { menu, overlay } = createMenuStructure(point);
	menu.addEventListener('click', e => e.stopPropagation());

	const { header, cleanup: headerCleanup } = createDraggableHeader(menu, 'User Settings');
	menu.appendChild(header);

	const menuData = Selectors.getTopMenu();
	if (menuData && menuData.menu === menu) {
		menuData.headerCleanup = headerCleanup;
		menuData.intervals = [];
		menu._menuData = menuData;
	}

	const gpsBtn = createButton('<i class="fas fa-satellite-dish"></i> Follow GPS', async () => {
		await ensureAudioContext();
		detachUserFromPath();
		GeolocationManager.setupGeolocation();
		GeolocationManager.toggleFollowGPS(true);
		if (GeolocationManager.getUserMarker()) GeolocationManager.getUserMarker().dragging.disable();
		closeAllMenus();
	}, "menu-btn");
	menu.appendChild(gpsBtn);

	const devBtn = createButton('<i class="fas fa-code"></i> Dev Mode (Draggable)', async () => {
		await ensureAudioContext();
		detachUserFromPath();
		GeolocationManager.stopWatching();
		GeolocationManager.toggleFollowGPS(false);
		if (GeolocationManager.getUserMarker()) GeolocationManager.getUserMarker().dragging.enable();
		closeAllMenus();
	}, "menu-btn");
	menu.appendChild(devBtn);

	const simulateBtn = createButton('<i class="fas fa-route"></i> Simulate Point-to-Point', async () => {
		await ensureAudioContext();
		detachUserFromPath();
		startSimulationPlacement();
		closeAllMenus();
	}, "menu-btn");
	menu.appendChild(simulateBtn);

	if (Selectors.getPaths().length > 0) {
		const pathContainer = document.createElement("div");
		pathContainer.className = "user-menu-section";

		const grid = document.createElement("div");
		grid.className = "context-menu-header-controls";

		const leftCol = document.createElement("div");
		const rightCol = document.createElement("div");

		const pathLabel = document.createElement("span");
		pathLabel.className = "user-menu-section-label";
		pathLabel.textContent = "Simulate Along Path";
		leftCol.appendChild(pathLabel);

		const pathOptions = [
			{ value: 'none', label: '- Detached -' },
			...Selectors.getPaths().map(p => ({ value: p.id, label: p.label }))
		];

		const behaviorLabel = document.createElement("span");
		behaviorLabel.className = "user-menu-section-label";
		behaviorLabel.textContent = "Path Behavior";
		rightCol.appendChild(behaviorLabel);

		const behaviorOptions = [
			{ value: 'forward', label: 'Forward' },
			{ value: 'backward', label: 'Backward' },
			{ value: 'pingpong', label: 'Ping-Pong' }
		];
		const behaviorSelect = createSelect(behaviorOptions, AppState.simulation.userPathAnimationState.behavior, (e) => {
			AppState.simulation.userPathAnimationState.behavior = e.target.value;
		});
		rightCol.appendChild(behaviorSelect);

		const pathSelect = createSelect(pathOptions, Selectors.getUserAttachedPathId() || 'none', (e) => {
			const pathId = e.target.value;
			if (pathId === 'none') {
				detachUserFromPath();
				rightCol.style.display = 'none';
			} else {
				attachUserToPath(pathId);
				behaviorSelect.value = 'forward';
				rightCol.style.display = 'block';
			}
		});
		leftCol.appendChild(pathSelect);

		grid.appendChild(leftCol);
		grid.appendChild(rightCol);
		pathContainer.appendChild(grid);
		menu.appendChild(pathContainer);

		rightCol.style.display = Selectors.getUserAttachedPathId() ? 'block' : 'none';
	}

	const accuracyBtnText = GeolocationManager.isAccuracyVisible ? 'Hide' : 'Show';
	const accuracyBtn = createButton(
		`<i class="fas fa-bullseye"></i> ${accuracyBtnText} Accuracy`,
		() => GeolocationManager.toggleAccuracyDisplay(),
		"menu-btn"
	);
	accuracyBtn.id = 'toggleAccuracyBtn';
	menu.appendChild(accuracyBtn);

	const customizeParamsBtn = createButton(
		'<i class="fas fa-sliders-h"></i> Customize Parameters',
		() => {
			const customizer = new ParameterCustomizer();
			customizer.show();
		},
		"menu-btn"
	);
	menu.appendChild(customizeParamsBtn);

	const spatialContainer = document.createElement("div");
	spatialContainer.className = "user-menu-section";

	const mainToggleContainer = document.createElement("div");
	mainToggleContainer.className = "switch-container";
	const spatialLabel = document.createElement("span");
	spatialLabel.textContent = "Enable Spatial Panning";
	const spatialToggle = createSwitch(Selectors.getSpatialMode() !== 'off', (enabled) => {
		setSpatialMode(enabled ? 'hrtf' : 'off');
		updateAllPanSliders();
	});
	mainToggleContainer.appendChild(spatialLabel);
	mainToggleContainer.appendChild(spatialToggle);
	spatialContainer.appendChild(mainToggleContainer);

	if (Selectors.getSpatialMode() !== 'off') {
		const modeSelectorContainer = document.createElement("div");
		modeSelectorContainer.className = "panning-mode-selector";

		const hrtfRadio = createRadioButton('panningMode', 'hrtf', 'HRTF (3D)',
			Selectors.getSpatialMode() === 'hrtf',
			() => {
				setSpatialMode('hrtf');
				updateAllPanSliders();
			}
		);
		const stereoRadio = createRadioButton('panningMode', 'stereo', 'Stereo (Bearing)',
			Selectors.getSpatialMode() === 'stereo',
			() => {
				setSpatialMode('stereo');
				updateAllPanSliders();
			}
		);
		const ambisonicsRadio = createRadioButton('panningMode', 'ambisonics', 'Ambisonics',
			Selectors.getSpatialMode() === 'ambisonics',
			() => {
				setSpatialMode('ambisonics');
				updateAllPanSliders();
			}
		);

		modeSelectorContainer.appendChild(hrtfRadio);
		modeSelectorContainer.appendChild(stereoRadio);
		modeSelectorContainer.appendChild(ambisonicsRadio);
		spatialContainer.appendChild(modeSelectorContainer);
	}
	menu.appendChild(spatialContainer);

	if (Selectors.getSpatialMode() === 'ambisonics') {
		const ambisonicControlsContainer = document.createElement("div");
		ambisonicControlsContainer.className = "ambisonic-controls-container";

		const orderControl = document.createElement("div");
		orderControl.className = "parameter-control";

		const orderLabel = document.createElement("label");
		orderLabel.textContent = "Ambisonic Order";
		orderControl.appendChild(orderLabel);

		const orderSelect = document.createElement("select");
		orderSelect.className = "ambisonic-select";
		[1, 2, 3].forEach(order => {
			const option = document.createElement("option");
			option.value = order;
			option.textContent = `${order}${order === 1 ? 'st' : order === 2 ? 'nd' : 'rd'} Order`;
			option.selected = order === CONSTANTS.AMBISONIC_ORDER;
			orderSelect.appendChild(option);
		});

		orderSelect.onchange = async () => {
			const newOrder = parseInt(orderSelect.value);
			CONSTANTS.AMBISONIC_ORDER = newOrder;
			if (appContext.AmbisonicsManager.scene) {
				await appContext.AmbisonicsManager.reinitialize((id) => AppState.getSound(id));
			}
			AppState.dispatch({ type: 'AUDIO_SPATIAL_MODE_CHANGED' });
			showUserMenu(point);
		};

		orderControl.appendChild(orderSelect);
		ambisonicControlsContainer.appendChild(orderControl);

		const gainControl = document.createElement("div");
		gainControl.className = "ambisonic-parameter-control";

		const gainLabel = document.createElement("label");
		gainLabel.textContent = "Gain Boost";
		gainControl.appendChild(gainLabel);

		const gainWrapper = document.createElement("div");
		gainWrapper.className = "ambisonic-control-wrapper";

		const gainSlider = document.createElement("input");
		gainSlider.type = "range";
		gainSlider.min = "0.5";
		gainSlider.max = "10";
		gainSlider.step = "0.5";
		gainSlider.value = appContext.AmbisonicsManager.outputGain ?
			appContext.AmbisonicsManager.outputGain.gain.value :
			CONSTANTS.AMBISONIC_GAIN_BOOST;
		gainSlider.className = "ambisonic-parameter-slider";

		const gainDisplay = document.createElement("span");
		gainDisplay.className = "ambisonic-value-display";
		gainDisplay.textContent = `${gainSlider.value}x`;

		gainSlider.oninput = () => {
			const newGain = parseFloat(gainSlider.value);
			if (appContext.AmbisonicsManager.outputGain) {
				appContext.AmbisonicsManager.outputGain.gain.linearRampToValueAtTime(
					newGain,
					appContext.AmbisonicsManager.audioContext.currentTime + 0.1
				);
			}
			gainDisplay.textContent = `${newGain}x`;
			CONSTANTS.AMBISONIC_GAIN_BOOST = newGain;
		};

		gainSlider.onchange = () => {
			AppState.dispatch({ type: 'AUDIO_SPATIAL_MODE_CHANGED' });
		};

		gainWrapper.appendChild(gainSlider);
		gainWrapper.appendChild(gainDisplay);
		gainControl.appendChild(gainWrapper);
		ambisonicControlsContainer.appendChild(gainControl);

		const rolloffControl = document.createElement("div");
		rolloffControl.className = "parameter-control";

		const rolloffLabel = document.createElement("label");
		rolloffLabel.textContent = "Distance Model";
		rolloffControl.appendChild(rolloffLabel);

		const rolloffSelect = document.createElement("select");
		rolloffSelect.className = "ambisonic-select";
		['linear', 'logarithmic', 'none'].forEach(model => {
			const option = document.createElement("option");
			option.value = model;
			option.textContent = model.charAt(0).toUpperCase() + model.slice(1);
			option.selected = model === CONSTANTS.AMBISONIC_ROLLOFF;
			rolloffSelect.appendChild(option);
		});

		rolloffSelect.onchange = () => {
			CONSTANTS.AMBISONIC_ROLLOFF = rolloffSelect.value;
			appContext.AmbisonicsManager.updateAllSourcesRolloff((id) => AppState.getSound(id));
			AppState.dispatch({ type: 'AUDIO_SPATIAL_MODE_CHANGED' });
			AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
		};

		rolloffControl.appendChild(rolloffSelect);
		ambisonicControlsContainer.appendChild(rolloffControl);

		const minDistControl = document.createElement("div");
		minDistControl.className = "parameter-control";

		const minDistLabel = document.createElement("label");
		minDistLabel.textContent = "Min Distance";
		minDistControl.appendChild(minDistLabel);

		const minDistWrapper = document.createElement("div");
		minDistWrapper.className = "control-wrapper";

		const minDistSlider = document.createElement("input");
		minDistSlider.type = "range";
		minDistSlider.min = "0.1";
		minDistSlider.max = "10";
		minDistSlider.step = "0.1";
		minDistSlider.value = CONSTANTS.AMBISONIC_MIN_DISTANCE;
		minDistSlider.className = "parameter-slider";

		const minDistDisplay = document.createElement("span");
		minDistDisplay.className = "value-display";
		minDistDisplay.textContent = `${minDistSlider.value}m`;

		minDistSlider.oninput = () => {
			const newDist = parseFloat(minDistSlider.value);
			CONSTANTS.AMBISONIC_MIN_DISTANCE = newDist;
			minDistDisplay.textContent = `${newDist}m`;
			appContext.AmbisonicsManager.updateAllSourcesDistances((id) => AppState.getSound(id));
		};

		minDistSlider.onchange = () => {
			AppState.dispatch({ type: 'AUDIO_SPATIAL_MODE_CHANGED' });
		};

		minDistWrapper.appendChild(minDistSlider);
		minDistWrapper.appendChild(minDistDisplay);
		minDistControl.appendChild(minDistWrapper);
		ambisonicControlsContainer.appendChild(minDistControl);

		const widthControl = document.createElement("div");
		widthControl.className = "parameter-control";

		const widthLabel = document.createElement("label");
		widthLabel.textContent = "Stereo Width";
		widthControl.appendChild(widthLabel);

		const widthWrapper = document.createElement("div");
		widthWrapper.className = "control-wrapper";

		const widthSlider = document.createElement("input");
		widthSlider.type = "range";
		widthSlider.min = "0.0";
		widthSlider.max = "2.0";
		widthSlider.step = "0.1";
		widthSlider.value = CONSTANTS.AMBISONIC_DEFAULT_STEREO_WIDTH;
		widthSlider.className = "parameter-slider";

		const widthDisplay = document.createElement("span");
		widthDisplay.className = "value-display";
		widthDisplay.textContent = `${widthSlider.value}x`;

		widthSlider.oninput = () => {
			const newWidth = parseFloat(widthSlider.value);
			CONSTANTS.AMBISONIC_DEFAULT_STEREO_WIDTH = newWidth;
			widthDisplay.textContent = `${newWidth.toFixed(1)}x`;
			appContext.AmbisonicsManager.updateAllStereoParameters((id) => AppState.getSound(id));
		};

		widthSlider.onchange = () => {
			AppState.dispatch({ type: 'AUDIO_SPATIAL_MODE_CHANGED' });
		};

		widthWrapper.appendChild(widthSlider);
		widthWrapper.appendChild(widthDisplay);
		widthControl.appendChild(widthWrapper);
		ambisonicControlsContainer.appendChild(widthControl);

		const spreadControl = document.createElement("div");
		spreadControl.className = "parameter-control";

		const spreadLabel = document.createElement("label");
		spreadLabel.textContent = "Stereo Spread";
		spreadControl.appendChild(spreadLabel);

		const spreadWrapper = document.createElement("div");
		spreadWrapper.className = "control-wrapper";

		const spreadSlider = document.createElement("input");
		spreadSlider.type = "range";
		spreadSlider.min = "0.0";
		spreadSlider.max = "50.0";
		spreadSlider.step = "0.1";
		spreadSlider.value = CONSTANTS.AMBISONIC_DEFAULT_STEREO_SPREAD;
		spreadSlider.className = "parameter-slider";

		const spreadDisplay = document.createElement("span");
		spreadDisplay.className = "value-display";
		spreadDisplay.textContent = `${spreadSlider.value}m`;

		spreadSlider.oninput = () => {
			const newSpread = parseFloat(spreadSlider.value);
			CONSTANTS.AMBISONIC_DEFAULT_STEREO_SPREAD = newSpread;
			spreadDisplay.textContent = `${newSpread.toFixed(1)}m`;
			appContext.AmbisonicsManager.updateAllStereoParameters((id) => AppState.getSound(id));
		};

		spreadSlider.onchange = () => {
			AppState.dispatch({ type: 'AUDIO_SPATIAL_MODE_CHANGED' });
		};

		spreadWrapper.appendChild(spreadSlider);
		spreadWrapper.appendChild(spreadDisplay);
		spreadControl.appendChild(spreadWrapper);
		ambisonicControlsContainer.appendChild(spreadControl);

		spatialContainer.appendChild(ambisonicControlsContainer);
	}

	const audioSmoothingSection = createCollapsibleSection(
		'Audio Smoothing',
		'fa-wave-square',
		() => createAudioSmoothingControls(),
		false
	);
	menu.appendChild(audioSmoothingSection);

	const directionContainer = document.createElement("div");
	directionContainer.className = "user-direction-container";

	const directionLabel = document.createElement("span");
	directionLabel.className = "user-menu-section-label";
	directionLabel.textContent = "Listener Direction";
	directionContainer.appendChild(directionLabel);

	const orientationStatus = DeviceOrientationManager?.getStatus() || { enabled: false, available: false };

	if (orientationStatus.available) {
		const orientationToggleContainer = document.createElement("div");
		orientationToggleContainer.className = "switch-container";
		orientationToggleContainer.style.marginBottom = "8px";

		const orientationLabel = document.createElement("span");
		orientationLabel.textContent = "Use Device Orientation";
		orientationLabel.style.fontSize = "12px";

		const permissionNote = document.createElement("span");
		permissionNote.textContent = "(Otherwise uses geolocation heading)";
		permissionNote.style.fontSize = "10px";
		permissionNote.style.color = "#888";
		permissionNote.style.marginLeft = "4px";

		const orientationToggle = createSwitch(orientationStatus.enabled, async (enabled) => {
			if (enabled) {
				const started = await DeviceOrientationManager.start();
				if (!started) {
					orientationToggle.querySelector('input').checked = false;
					DeviceOrientationManager.stop();
					updateDirectionSliderState();
					return;
				}
			} else {
				DeviceOrientationManager.stop();
			}
			updateDirectionSliderState();

			const userPos = GeolocationManager.getUserPosition();
			if (userPos) {
				if (appContext.audioFunctions?.resetAreaTracking) {
					appContext.audioFunctions.resetAreaTracking(userPos);
				}
				if (appContext.audioFunctions?.updateAudio) {
					appContext.audioFunctions.updateAudio(userPos);
				}
			}
		});

		const labelWrapper = document.createElement("div");
		labelWrapper.appendChild(orientationLabel);
		labelWrapper.appendChild(permissionNote);

		orientationToggleContainer.appendChild(labelWrapper);
		orientationToggleContainer.appendChild(orientationToggle);
		directionContainer.appendChild(orientationToggleContainer);
	}

	const controlsWrapper = document.createElement("div");
	controlsWrapper.className = "direction-controls-wrapper";

	const directionSlider = document.createElement("input");
	directionSlider.type = "range";
	directionSlider.min = 0;
	directionSlider.max = 360;
	directionSlider.value = Selectors.getUserDirection();
	directionSlider.className = "direction-slider";

	const arrow = document.createElement("i");
	arrow.className = "fas fa-location-arrow direction-arrow";
	arrow.style.transform = `rotate(${Selectors.getUserDirection() - 45}deg)`;

	const degreeDisplay = document.createElement("span");
	degreeDisplay.className = "degree-display";
	degreeDisplay.textContent = `${Selectors.getUserDirection()}°`;

	directionSlider.oninput = () => {
		const newDirection = parseInt(directionSlider.value);
		AppState.audio.userDirection = newDirection;
		arrow.style.transform = `rotate(${newDirection - 45}deg)`;
		degreeDisplay.textContent = `${newDirection}°`;
		AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
	};

	const updateDirectionSliderState = () => {
		const isOrientationActive = DeviceOrientationManager?.getStatus().enabled || false;
		directionSlider.disabled = isOrientationActive;
		directionSlider.style.opacity = isOrientationActive ? '0.5' : '1';
		directionSlider.style.cursor = isOrientationActive ? 'not-allowed' : '';
	};

	updateDirectionSliderState();

	controlsWrapper.appendChild(directionSlider);
	controlsWrapper.appendChild(arrow);
	controlsWrapper.appendChild(degreeDisplay);
	directionContainer.appendChild(controlsWrapper);
	menu.appendChild(directionContainer);

	document.body.appendChild(menu);

	if (menu._menuData) delete menu._menuData;
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

function updateAllPanSliders() {
	const allSoundMenus = document.querySelectorAll('.context-menu[data-sound-id]');

	allSoundMenus.forEach(menu => {
		const soundId = parseInt(menu.dataset.soundId);
		const sound = AppState.getSound(soundId);
		if (!sound) return;

		const allSliders = menu.querySelectorAll('input[type="range"]');
		for (const slider of allSliders) {
			const controlGroup = slider.closest('.parameter-control');
			if (!controlGroup) continue;

			const label = controlGroup.querySelector('label');
			if (label?.textContent === 'Pan') {
				const isPanDisabled = sound.useSpatialPanning && Selectors.getSpatialMode() !== 'off';
				slider.disabled = isPanDisabled;
				slider.style.opacity = isPanDisabled ? '0.5' : '1';
				slider.style.cursor = isPanDisabled ? 'not-allowed' : '';
				label.style.opacity = isPanDisabled ? '0.5' : '1';
				label.title = isPanDisabled ? 'Pan is disabled when Spatial panning mode is active. Set Panning to Manual to use this control.' : '';
				break;
			}
		}
	});
}
