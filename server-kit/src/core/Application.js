// Core Application Module
// Main application initialization and orchestration

// API Layer
import { Security } from '../api/SecurityManager.js';
import { Backend } from '../api/Backend.js';
import { WorkspaceAPI } from '../api/WorkspaceAPI.js';
import { FilesAPI } from '../api/FilesAPI.js';

// Core
import { AppState, StateManager } from './state/StateManager.js';
import { Selectors } from './state/selectors.js';
import { Actions, ActionTypes } from './state/actions.js';
import { CONSTANTS, COLORS, PATH_COLORS } from './constants.js';
import { Geometry } from './geospatial/Geometry.js';
import { GeolocationManager } from './geospatial/GeolocationManager.js';
import { DeviceOrientationManager } from './geospatial/DeviceOrientationManager.js';
import { PathZoneChecker } from './geospatial/PathZoneChecker.js';
import { AudioNodeManager, PolyphonyManager } from './audio/AudioNodeManager.js';
import { SYNTH_REGISTRY, FX_REGISTRY, getSynthCapabilities, getParametersForSynth, getAvailableFXTypes, getAvailableSynthTypes, initializeSynthParameters, getAvailableFXModulationTargets } from './audio/SynthRegistry.js';
import { midiToNoteName } from './utils/audioHelpers.js';
import { StreamManager } from './audio/StreamManager.js';
import { FXManager } from './audio/FXManager.js';
import { AudioChainManager, updateFXChain, updateLayerFXChain } from './audio/AudioChainManager.js';
import { AudioContextManager } from './audio/AudioContextManager.js';
import { createEffect, createLayerFXNodes } from './audio/FXManager.js';
import { AmbisonicsManager } from './audio/AmbisonicsManager.js';
import { EchoManager } from './audio/EchoManager.js';
import { updateAudio, getUserMovementSpeed, startAudioLoop, stopAudioLoop } from './audio/AudioEngine.js';
import { updateSynthParam } from './audio/ParameterUpdater.js';
import { addSound, addSoundLine, addSoundOval, loadSound, createSoundObject, createFullSoundInstance } from './audio/SoundCreation.js';
import { destroySound, startLoopedPlayback, stopLoopedPlayback, upgradeSynthToPolyphonic, triggerPlayback } from './audio/SoundLifecycle.js';
import { DistanceSequencer } from './audio/DistanceSequencer.js';
import { calcGain, calculatePathGain, calculateRelativePosition, calculateBearingPan } from './audio/audioUtils.js';
import { processLFOs, processPathLFOs } from './audio/LFOProcessor.js';

// Utils
import { toRadians, toDegrees, deepClone, setTemporaryFlag, isCircularPath, mapValue } from './utils/math.js';
import { debounce, throttle } from './utils/debounce.js';
import { isValidLatLon, isValidMarker, isValidSound, isValidControlPath, isValidSequencer, clampNumber } from './utils/validation.js';
import { isFileSynth, hasKeyboard, isGranularMode, isLinearPath, isTouchDevice } from './utils/typeChecks.js';
import { delay, waitForNextFrame } from './utils/async.js';
import { CoordinateTransform } from './utils/coordinates.js';

// Config
import { PARAMETER_REGISTRY, generateLFOWaveform } from '../config/parameterRegistry.js';
import { CATEGORY_REGISTRY, tileLayers, SHAPE_REGISTRY, FXParamSets } from '../config/registries.js';
import { DEFAULT_LFO_STRUCTURE, DEFAULT_FX_STRUCTURE, DEFAULT_EQ_STRUCTURE, DEFAULT_SEQUENCER_CONFIG, DEFAULT_CONTROL_PATH_CONFIG, DEFAULT_MARKER_CONFIG } from '../config/defaults.js';

// UI
import { createElement, createButton, createSelect } from '../ui/domHelpers.js';
import { ModalSystem } from '../ui/ModalSystem.js';
import { MenuManager } from '../ui/controllers/MenuManager.js';
import { SequencerUIManager } from '../ui/SequencerUIManager.js';
import { createDraggableHeader, createElementNavigationDropdown, createCloseButton } from '../ui/controllers/HeaderBuilder.js';
import { createParameterControl, updateFrequencyModeIndicators, updateNodeParameter } from '../ui/controllers/ParameterControls.js';
import { UIBuilder, createCollapsibleSection, createColorPicker, createHeaderControls, createParamsContainer, createActionButtons, createSpatialSection, createExitBehaviorDropdown, createVolumeModelDropdown, createIconPlacementDropdown, createMenuStructure, createSourceTypeDropdown, createRoleDropdown, createShapeDropdown, createPanningDropdown, createLabelInput, createTabBar, createDeleteButton, createSwitch, createRadioButton, addSideMenuCloseButtons } from '../ui/controllers/UIBuilder.js';
import { MenuTabs } from '../ui/components/MenuTabsRegistry.js';
import * as PathMenuManager from '../ui/menus/PathMenuManager.js';
import * as SoundMenuManager from '../ui/menus/SoundMenuManager.js';
import * as UserMenuManager from '../ui/menus/UserMenuManager.js';
import * as LayerMenuManager from '../ui/menus/LayerMenuManager.js';
import * as DialogManager from '../ui/menus/DialogManager.js';

// Map & Shapes
import { MapManager } from '../map/MapManager.js';
import { ShapeManager } from '../shapes/ShapeManager.js';
import { LayerManager } from '../layers/LayerManager.js';

// Interactions
import { DragHandlers } from '../interactions/DragHandlers.js';
import { LabelDragHandler, setContext as setLabelDragHandlerContext } from '../interactions/LabelDragHandler.js';
import { attachDragHandlers } from '../interactions/attachDragHandlers.js';
import { startPolygonPathDrawing, startOvalPathDrawing, startLinePathDrawing, startCirclePathDrawing, finishPolygonPath, finishOvalPath, finishLinePath, finishCirclePath, cancelPathDrawing, showDrawingIndicator, hideDrawingIndicator } from '../interactions/DrawingTools.js';
import { startSoundShapeDrawing, cancelSoundDrawing, finishSoundLine, setContext as setSoundDrawingToolsContext } from './audio/SoundDrawingTools.js';
import { showShapeCreationMenu, hideShapeCreationMenu, toggleShapeCreationMenu, setContext as setShapeCreationMenuContext } from '../ui/components/ShapeCreationMenu.js';

// Paths
import * as PathFactory from '../paths/PathFactory.js';
import { getSmoothedPathPoints, generateOvalPoints } from '../paths/PathFactory.js';
import * as PathRenderer from '../paths/PathRenderer.js';
import { getOffsetPolyline } from '../paths/PathRenderer.js';
import * as PathEditor from '../paths/PathEditor.js';

// Simulation
import { SimulationController } from '../simulation/SimulationController.js';
import { RouteAnimator } from '../simulation/RouteAnimator.js';

// Selection
import { SelectionController, setSelectionControllerContext } from '../selection/SelectionController.js';
import { SelectionActions, setSelectionActionsContext } from '../selection/SelectionActions.js';
import { DragSelectHandler, setDragSelectHandlerContext } from '../selection/DragSelectHandler.js';
import { SelectionUIBuilder, setSelectionUIBuilderContext } from '../ui/builders/SelectionUIBuilder.js';

// Persistence
import { SettingsManager } from '../persistence/SettingsManager.js';
import { WorkspaceManager } from '../persistence/WorkspaceManager.js';
import { PackageExporter, setPackageExporterContext } from '../persistence/PackageExporter.js';
import { PackageImporter, setPackageImporterContext } from '../persistence/PackageImporter.js';

// Events
import { EventBus } from '../events/EventBus.js';
import { mapClickHandler } from '../events/MapEventHandler.js';
import { createUIEventHandlers, unlockAudio } from '../events/UIEventHandler.js';

// Debug
import { oscManager } from '../debug/OSCManager.js';

// AppContext for dependency injection
import { appContext } from './AppContext.js';

// Context setters from modules
import { setContext as setMenuTabsContext } from '../ui/components/MenuTabsRegistry.js';
import { setContext as setHeaderBuilderContext } from '../ui/controllers/HeaderBuilder.js';
import { setContext as setUIBuilderContext } from '../ui/controllers/UIBuilder.js';
import { setContext as setParameterControlsContext } from '../ui/controllers/ParameterControls.js';
import { setContext as setSoundCreationContext } from './audio/SoundCreation.js';
import { setContext as setAudioEngineContext } from './audio/AudioEngine.js';
import { setContext as setSoundLifecycleContext } from './audio/SoundLifecycle.js';
import { setContext as setParameterUpdaterContext } from './audio/ParameterUpdater.js';
import { setContext as setLFOProcessorContext } from './audio/LFOProcessor.js';
import { setContext as setEchoManagerContext } from './audio/EchoManager.js';
import { setContext as setDistanceSequencerContext } from './audio/DistanceSequencer.js';
import { setContext as setAudioUtilsContext } from './audio/audioUtils.js';
import { setContext as setAudioSmootherContext } from './audio/AudioSmoother.js';
import { setUIEventHandlersContext } from '../events/UIEventHandler.js';
import { setStorageAdapterContext } from '../persistence/StorageAdapter.js';
import { setDragHandlersContext } from '../interactions/DragHandlers.js';
import { setContext as setDrawingToolsContext } from '../interactions/DrawingTools.js';
import { setRegistriesContext } from '../config/registries.js';
import { setLayerManagerContext } from '../layers/LayerManager.js';
import { setShapeManagerContext } from '../shapes/ShapeManager.js';

// Setup Backend API structure
Backend.workspace = WorkspaceAPI;
Backend.files = FilesAPI;

function createControlPath(type, data = {}) {
	return PathFactory.createControlPath(type, data, {
		renderPath: renderControlPath,
		refreshList: refreshPathsList,
		updateCounts: () => WorkspaceManager.updateMenuCounts()
	});
}

function deleteControlPath(path) {
	return PathEditor.deleteControlPath(path, {
		map,
		refreshList: refreshPathsList,
		updateCounts: () => WorkspaceManager.updateMenuCounts()
	});
}

function renderControlPath(path) {
	return PathRenderer.renderControlPath(path, {
		map,
		isLinearPath,
		renderLineOrPolygon: renderLineOrPolygonPath,
		renderCircle: renderCirclePath,
		renderOval: renderOvalPath
	});
}

function renderLineOrPolygonPath(path) {
	return PathRenderer.renderLineOrPolygonPath(path, {
		map,
		getSmoothedPoints: PathFactory.getSmoothedPathPoints,
		createPathLabel: createAndAttachPathLabel,
		showMenu: showPathMenu,
		Geometry,
		Selectors,
		CONSTANTS,
		renderPath: renderControlPath,
		deleteControlPath,
		ModalSystem,
		SelectionController
	});
}

function renderCirclePath(path) {
	return PathRenderer.renderCirclePath(path, {
		map,
		addMarkers: addCirclePathMarkers
	});
}

function renderOvalPath(path) {
	return PathRenderer.renderOvalPath(path, {
		map,
		generateOvalPoints: PathFactory.generateOvalPoints,
		addMarkers: addOvalPathMarkers
	});
}

function addCirclePathMarkers(path) {
	return PathRenderer.addCirclePathMarkers(path, {
		map,
		Geometry,
		showMenu: showPathMenu,
		createPathLabel: createAndAttachPathLabel,
		CONSTANTS,
		deleteControlPath,
		ModalSystem,
		SelectionController,
		SelectionActions
	});
}

function addOvalPathMarkers(path) {
	return PathRenderer.addOvalPathMarkers(path, {
		map,
		Geometry,
		generateOvalPoints: PathFactory.generateOvalPoints,
		showMenu: showPathMenu,
		createPathLabel: createAndAttachPathLabel,
		CONSTANTS,
		deleteControlPath,
		ModalSystem,
		SelectionController,
		SelectionActions
	});
}

function createAndAttachPathLabel(path, position) {
	return PathFactory.createAndAttachPathLabel(path, position, {
		map,
		showMenu: showPathMenu,
		isCircularPath,
		LabelDragHandler,
		Selectors,
		SelectionController,
		deleteControlPath,
		ModalSystem
	});
}

function refreshPathsList() {
	refreshElementsList();
}

function updatePathVisibility(path) {
	return PathRenderer.updatePathVisibility(path, {
		map,
		LayerManager,
		shouldBeVisible: shouldPathBeVisible
	});
}

function shouldPathBeVisible(path) {
	return PathRenderer.shouldPathBeVisible(path, LayerManager);
}

function updateControlPathPosition(path, deltaLat, deltaLng) {
	return PathRenderer.updateControlPathPosition(path, deltaLat, deltaLng, {
		isCircularPath,
		generateOvalPoints: PathFactory.generateOvalPoints,
		getSmoothedPoints: PathFactory.getSmoothedPathPoints,
		getOffsetPolyline: PathRenderer.getOffsetPolyline,
		map
	});
}

function computePathLength(path) {
	return PathFactory.computePathLength(path, map);
}

function duplicatePath(originalPath) {
	return PathFactory.duplicatePath(originalPath, createControlPath);
}

function attachUserToPath(pathId) {
	return PathFactory.attachUserToPath(pathId, {
		GeolocationManager,
		showSimulationControls,
		stopSimulation,
		Selectors,
		animateUserOnPath
	});
}

function detachUserFromPath() {
	return PathFactory.detachUserFromPath(showSimulationControls);
}

function animateUserOnPath(currentTime) {
	return PathEditor.animateUserOnPath(currentTime, {
		GeolocationManager,
		Selectors,
		computePathLength,
		getPointAtDistance: getPointAtDistanceOnControlPath,
		updateAudio,
		updateDirectionUI: PathEditor.updateDirectionUI,
		detachUser: detachUserFromPath,
		calculateBearing,
		getSmoothedPoints: PathFactory.getSmoothedPathPoints,
		CONSTANTS
	});
}

function getPointAtDistanceOnControlPath(path, distance) {
	return PathEditor.getPointAtDistanceOnControlPath(path, distance, {
		computePathLength,
		getSmoothedPoints: PathFactory.getSmoothedPathPoints,
		getPointAtDistance,
		isCircularPath,
		CONSTANTS
	});
}

function changeMapStyle(styleName) {
	window.mapManager.changeStyle(styleName);
}

function updateSoundPositionOnPath(sound, path, time) {
	return PathEditor.updateSoundPositionOnPath(sound, path, time, {
		isLinearPath,
		isCircularPath,
		updateOnLine: updateSoundOnLinePath,
		updateOnCircle: updateSoundOnCirclePath
	});
}

function updateSoundOnLinePath(sound, path, speed, elapsed) {
	return PathEditor.updateSoundOnLinePath(sound, path, speed, elapsed, {
		map,
		getSmoothedPoints: PathFactory.getSmoothedPathPoints,
		updateMarkerPosition: updateSoundMarkerPosition
	});
}

function updateSoundOnCirclePath(sound, path, speed, elapsed) {
	return PathEditor.updateSoundOnCirclePath(sound, path, speed, elapsed, {
		updateMarkerPosition: updateSoundMarkerPosition,
		CONSTANTS
	});
}

function showPathMenu(point, path) {
	return PathMenuManager.showPathMenu(point, path);
}

function showPathMenuTab(path, container, tabId, tabBar) {
	return PathMenuManager.showPathMenuTab(path, container, tabId, tabBar);
}

// PARAMETER REGISTRY

const ElementFactory = {
	soundIcon(color) {
		return L.divIcon({
			html: `<div class="soundIcon" style="background: ${color};">
				<i class="fas fa-volume-up icon-white icon-sm"></i>
			</div>`,
			className: 'custom-div-icon',
			iconSize: CONSTANTS.SOUND_ICON_SIZE,
			iconAnchor: CONSTANTS.SOUND_ICON_ANCHOR
		});
	},

	labelIcon(text) {
		return L.divIcon({
			html: `<div class="sound-label">${text}</div>`,
			className: 'sound-label-marker',
			iconSize: [0, 0],
			iconAnchor: [0, 0]
		});
	},

	handleIcon() {
		return L.divIcon({
			html: '<div class="radius-handle"></div>',
			className: 'radius-handle-marker',
			iconSize: CONSTANTS.RADIUS_HANDLE_SIZE,
			iconAnchor: CONSTANTS.RADIUS_HANDLE_ANCHOR
		});
	},

	vertexIcon() {
		const isTouch = isTouchDevice();
		return L.divIcon({
			html: '<div class="vertex-handle"></div>',
			className: 'vertex-handle-marker',
			iconSize: isTouch ? CONSTANTS.VERTEX_HANDLE_SIZE_TOUCH : CONSTANTS.VERTEX_HANDLE_SIZE,
			iconAnchor: isTouch ? CONSTANTS.VERTEX_HANDLE_ANCHOR_TOUCH : CONSTANTS.VERTEX_HANDLE_ANCHOR
		});
	},

	marker(latlng, icon, draggable = true) {
		return L.marker(latlng, { draggable, icon });
	},

	userIcon(status = 'initial') {
		return L.divIcon({
			html: `<div class="userIcon geolocation-status-${status}">
				<i class="fas fa-user icon-white icon-md"></i>
			</div>`,
			className: 'custom-div-icon',
			iconSize: CONSTANTS.USER_ICON_SIZE,
			iconAnchor: CONSTANTS.USER_ICON_ANCHOR
		});
	}
};

async function syncPitchToKeyboard(obj, newPitch) {
	if (obj.isPlaying && obj.params.selectedNotes && obj.params.selectedNotes.length > 0) {
		PolyphonyManager.triggerPolyphonic(obj.synth, obj.params.selectedNotes, false);
	}

	const wasPolyphonic = obj.params.polyphony > 1;

	obj.params.pitch = newPitch;
	obj.params.selectedNotes = [];
	obj.params.polyphony = 1;

	if (obj.synth && obj.synth.releaseAll) {
		obj.synth.releaseAll();
	}

	if (wasPolyphonic) {
		const wasPlaying = obj.isPlaying;

		await changeSoundType(obj, obj.type);

		if (wasPlaying) {
			AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
		}
	} else if (obj.isPlaying && obj.type !== 'SoundFile' && obj.type !== 'StreamPlayer') {
		await waitForNextFrame();
		const notes = [newPitch];
		PolyphonyManager.triggerPolyphonic(obj.synth, notes, true);
	}

	AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
}

// MENU TABS

async function showGridSampleDialog(soundObj, midiNote) {
	const noteName = Tone.Frequency(midiNote, 'midi').toNote();
	const existingSample = soundObj.params.gridSamples[midiNote] || { fileName: null, pitch: 0 };

	const overlay = document.createElement('div');
	overlay.className = 'modal-overlay';

	const modal = document.createElement('div');
	modal.className = 'modal-dialog';
	modal.style.maxWidth = '400px';

	const currentFileName = existingSample.fileName || 'No sample loaded';

	modal.innerHTML = `
		<div class="modal-header">
			<h3>Configure ${noteName}</h3>
		</div>
		<div class="modal-body">
			<div class="parameter-control">
				<label>Sample File</label>
				<div class="file-info-text">${currentFileName}</div>
			</div>
			<div class="parameter-control">
				<label>Pitch Adjustment</label>
				<input type="range" id="gridPitchSlider" class="pitch-slider" min="-12" max="12" step="1" value="${existingSample.pitch || 0}">
				<span id="gridPitchDisplay" class="pitch-display">${existingSample.pitch || 0} st</span>
			</div>
		</div>
		<div class="modal-footer modal-footer-equal">
			<button id="gridLoadBtn" class="btn-primary">Load Sample</button>
			${existingSample.fileName ? '<button id="gridClearBtn" class="btn-secondary">Clear</button>' : ''}
			<button id="gridCancelBtn" class="btn-secondary">Close</button>
		</div>
	`;

	overlay.appendChild(modal);
	document.body.appendChild(overlay);

	const pitchSlider = modal.querySelector('#gridPitchSlider');
	const pitchDisplay = modal.querySelector('#gridPitchDisplay');

	pitchSlider.oninput = () => {
		const value = parseInt(pitchSlider.value);
		pitchDisplay.textContent = `${value > 0 ? '+' : ''}${value} st`;
	};

	return new Promise((resolve) => {
		const cleanup = () => {
			document.body.removeChild(overlay);
		};

		modal.querySelector('#gridLoadBtn').onclick = async () => {
			cleanup();

			const fileSelected = await new Promise((resolveFile) => {
				showFileManagerDialog(soundObj, (selectedFile) => {
					resolveFile(selectedFile);
				});
			});

			if (fileSelected) {
				if (!soundObj.params.gridSamples) soundObj.params.gridSamples = {};
				soundObj.params.gridSamples[midiNote] = {
					fileName: fileSelected,
					pitch: parseInt(pitchSlider.value)
				};

				await changeSoundType(soundObj, 'Sampler');

				resolve(true);
			} else {
				resolve(false);
			}
		};

		const clearBtn = modal.querySelector('#gridClearBtn');
		if (clearBtn) {
			clearBtn.onclick = async () => {
				cleanup();

				if (soundObj.params.gridSamples && soundObj.params.gridSamples[midiNote]) {
					delete soundObj.params.gridSamples[midiNote];
					await changeSoundType(soundObj, 'Sampler');
				}

				resolve(true);
			};
		}

		modal.querySelector('#gridCancelBtn').onclick = () => {
			if (existingSample.fileName && soundObj.params.gridSamples[midiNote]) {
				const newPitch = parseInt(pitchSlider.value);
				if (newPitch !== existingSample.pitch) {
					soundObj.params.gridSamples[midiNote].pitch = newPitch;
				}
			}
			cleanup();
			resolve(false);
		};

		overlay.onclick = (e) => {
			if (e.target === overlay) {
				modal.querySelector('#gridCancelBtn').click();
			}
		};
	});
}

const ParameterManager = {
	getValue(target, paramKey, options = {}) {
		if (paramKey.startsWith('lfo_')) {
			const [, axis, prop] = paramKey.split('_');
			return target.params.lfo[axis][prop] ?? this.getDefaultValue(paramKey);
		}

		if (paramKey === 'layerGain') {
			return target.gain !== undefined ? target.gain : CONSTANTS.DEFAULT_LAYER_GAIN;
		}

		const path = this.getParameterPath(paramKey, options);
		return this.getNestedValue(target, path) ?? this.getDefaultValue(paramKey);
	},

	setValue(target, paramKey, value, options = {}) {
		if (paramKey.startsWith('lfo_')) {
			const [, axis, prop] = paramKey.split('_');
			target.params.lfo[axis][prop] = value;
			return;
		}

		if (paramKey === 'layerGain') {
			target.gain = value;
			if (target.fxNodes && target.fxNodes.gain) {
				target.fxNodes.gain.gain.rampTo(value, 0.1);
			}
			return;
		}

		if (paramKey === 'eq_enabled') {
			if (options.isLayerFX) {
				target.eq = target.eq || deepClone(DEFAULT_EQ_STRUCTURE);
				target.eq.enabled = value;
				if (value) createLayerEQNode(target);
				updateLayerFXChain(target);
			} else {
				target.params.eq.enabled = value;
				AudioNodeManager.ensureEQNode(target);
				updateFXChain(target);
			}
			return;
		}

		const path = this.getParameterPath(paramKey, options);
		this.setNestedValue(target, path, value);

		const isEQParam = ['low', 'mid', 'high', 'lowFrequency', 'highFrequency'].includes(paramKey) ||
			paramKey.startsWith('fx_eq_');

		if (options.isLayerFX || options.slot || paramKey.startsWith('fx_') || isEQParam) {
			this.updateAudioNode(target, paramKey, value, options);
		} else {
			updateSynthParam(target, paramKey, value, options);
		}
	},

	getParameterPath(paramKey, options) {
		const def = PARAMETER_REGISTRY[paramKey];

		if (!options.isLayerFX && def && def.audioParam) {
			return ['params', 'eq', def.audioParam];
		}

		if (options.isLayerFX) {
			if (options.isMixParameter) return ['fx', options.slot, 'mix'];
			if (paramKey.startsWith('fx_eq_')) {
				const eqParam = def.audioParam || paramKey.replace('fx_eq_', '');
				return ['eq', eqParam];
			}
			if (paramKey.startsWith('fx_')) return ['fx', options.slot, 'params', options.paramName];
		}

		if (options.slot) {
			if (options.isMixParameter) return ['params', 'fx', options.slot, 'mix'];
			if (paramKey.startsWith('fx_')) return ['params', 'fx', options.slot, 'params', options.paramName];
		}

		return ['params', paramKey];
	},

	getNestedValue(obj, path) {
		return path.reduce((acc, key) => acc?.[key], obj);
	},

	setNestedValue(obj, path, value) {
		const last = path.pop();
		const target = path.reduce((acc, key) => {
			if (!acc[key]) acc[key] = {};
			return acc[key];
		}, obj);
		target[last] = value;
	},

	updateAudioNode(target, paramKey, value, options) {
		if (paramKey.startsWith('lfo_')) return;

		const node = this.getAudioNode(target, paramKey, options);
		if (node) {
			if (options.isMixParameter) {
				if (node.wet) {
					node.wet.value = value / 100;
				}
				return;
			}

			const def = PARAMETER_REGISTRY[paramKey];
			const actualParamName = def?.audioParam || options.paramName || paramKey.replace('fx_', '');

			updateNodeParameter(node, actualParamName, value);
		}
	},

	getAudioNode(target, paramKey, options) {
		if (paramKey.startsWith('fx_eq_')) {
			return options.isLayerFX ? target.fxNodes?.eq : target.eq;
		}

		if (options.isLayerFX) {
			if (options.slot) return target.fxNodes?.[`fx${options.slot.replace('slot', '')}`];
		}

		if (options.slot) return target[`fx${options.slot.replace('slot', '')}`];

		return null;
	},

	getDefaultValue(paramKey) {
		const def = PARAMETER_REGISTRY[paramKey];
		return def?.defaultValue ?? def?.min ?? 0;
	}
};

window.ParameterManager = ParameterManager;

async function restoreFXChain(obj) {
	await FXManager.restoreChain(obj, { isLayer: false });
}

function changeFX(obj, slot, fxType) {
	FXManager.change(obj, slot, fxType, { isLayer: false });
	AppState.dispatch({
		type: 'PARAMETER_CHANGED',
		payload: {
			target: obj,
			paramKey: `fx_slot${slot}`,
			value: fxType
		}
	});
}

function changeLayerFX(layer, slot, fxType) {
	FXManager.change(layer, slot, fxType, { isLayer: true });
	AppState.dispatch({
		type: 'PARAMETER_CHANGED',
		payload: {
			target: layer,
			paramKey: `fx_slot${slot}`,
			value: fxType
		}
	});
}

function clearAll() {
	return SettingsManager.clearAll();
}


function showSimulationControls(mode, options = {}) {
	return SimulationController.showControls(mode, options);
}

function startSimulationPlacement() {
	return SimulationController.startPlacement(map, placeSimulationTargetHandler);
}

function stopSimulation() {
	return SimulationController.stop(map, placeSimulationTargetHandler);
}

function placeSimulationTargetHandler(e) {
	return SimulationController.placeTargetHandler(e, map);
}

function getPointAtDistance(routePoints, distance) {
	return RouteAnimator.getPointAtDistance(routePoints, distance);
}

function calculateBearing(lat1, lon1, lat2, lon2) {
	return RouteAnimator.calculateBearing(lat1, lon1, lat2, lon2);
}

function animateMovement(currentTime) {
	return RouteAnimator.animateMovement(currentTime, stopSimulation);
}

async function getRouteAndAnimate() {
	return RouteAnimator.getRouteAndAnimate(stopSimulation);
}

function updateSoundMarkerPosition(sound, newPosition) {
	const oldPosition = sound.shapeType === 'polygon' ? sound.marker.getLatLng() : null;

	sound.marker.setLatLng(newPosition);
	sound.userLat = newPosition.lat;
	sound.userLng = newPosition.lng;

	if (sound.shapeType === 'circle') {
		Geometry.updateCirclePosition(sound.circle, sound.handle, sound.labelMarker, newPosition, sound.maxDistance);
	} else if (sound.shapeType === 'polygon') {
		if (!sound._originalMarkerPos) {
			sound._originalMarkerPos = oldPosition || newPosition;
		}
		const deltaLat = newPosition.lat - sound._originalMarkerPos.lat;
		const deltaLng = newPosition.lng - sound._originalMarkerPos.lng;
		sound.vertices = Geometry.updatePolygonPosition(
			sound.polygon, sound.vertices, sound.vertexMarkers, sound.labelMarker, deltaLat, deltaLng
		);
		sound._originalMarkerPos = newPosition;
	}
}

function getAvailableModulationTargets(synthType, role) {
	const synthParams = getParametersForSynth(synthType, role);

	const modulatableParams = synthParams.filter(param => {
		if (param.startsWith('lfo_') || param.startsWith('fx_')) {
			return false;
		}

		const def = PARAMETER_REGISTRY[param];
		if (!def) return false;

		return def.type === 'range' || def.type === 'number';
	});

	return [...new Set(modulatableParams)];
}

function getEffectParameters(effectType) {
	const fxDef = FX_REGISTRY[effectType];
	return fxDef ? fxDef.parameters : [];
}

async function protectAudioContext() {
	if (Tone.context.state !== 'running') {
		try {

			await Tone.context.resume();

			if (Tone.context.state !== 'running') {

				const resumeWithGesture = () => {
					Tone.context.resume().then(() => {

						document.removeEventListener('click', resumeWithGesture);
						document.removeEventListener('touchstart', resumeWithGesture);
					});
				};

				document.addEventListener('click', resumeWithGesture, { once: true });
				document.removeEventListener('touchstart', resumeWithGesture, { once: true });
			} else {

			}
		} catch (error) {
			console.warn('Could not resume audio context:', error);
		}
	}
	return Tone.context.state === 'running';
}

function ensureSoundDialogExists() {
	return DialogManager.ensureSoundDialogExists();
}function setupStreamTesting() {
	const testBtn = document.getElementById('testStreamBtn');
	const statusEl = document.getElementById('streamStatus');
	const urlInput = document.getElementById('streamUrlInput');

	if (!testBtn || !statusEl || !urlInput) return;

	let isPlaying = false;
	let testStreamObj = null;

	const startStream = async () => {
		if (isPlaying) return;

		const streamUrl = urlInput.value.trim();
		if (!streamUrl) {
			statusEl.textContent = 'Please enter a stream URL';
			statusEl.className = 'stream-status error';
			return;
		}

		statusEl.textContent = 'Loading stream...';
		statusEl.className = 'stream-status loading';

		try {
			if (!testStreamObj || testStreamObj.params.streamUrl !== streamUrl) {
				if (testStreamObj) {
					appContext.StreamManager.cleanupStream(testStreamObj);
					if (testStreamObj.gain) testStreamObj.gain.dispose();
					if (testStreamObj.envelopeGain) testStreamObj.envelopeGain.dispose();
					if (testStreamObj.filter) testStreamObj.filter.dispose();
				}

				const tempLatLng = GeolocationManager.getUserPosition() || L.latLng(0, 0);
				const { synth, gain, envelopeGain, filter } = AudioNodeManager.createAudioChain('StreamPlayer', {
					streamUrl: streamUrl,
					fadeIn: 0.5,
					fadeOut: 0.5
				}, Selectors.getSpatialMode());

				testStreamObj = {
					type: 'StreamPlayer',
					synth,
					gain,
					envelopeGain,
					filter,
					params: {
						streamUrl: streamUrl,
						fadeIn: 0.5,
						fadeOut: 0.5
					},
					isPlaying: false,
					streamLoaded: false,
					streamStatus: 'stopped'
				};

				gain.gain.value = 0.5;
			}

			if (testStreamObj.streamStatus === 'ready') {
				await appContext.StreamManager.playStream(testStreamObj);
				isPlaying = true;
				testBtn.innerHTML = '<i class="fas fa-stop"></i><span>Stop</span>';
				statusEl.textContent = 'Playing: ' + streamUrl;
				statusEl.className = 'stream-status playing';
			} else {
				const success = await appContext.StreamManager.initializeStream(testStreamObj);

				if (success) {
					await appContext.StreamManager.playStream(testStreamObj);
					isPlaying = true;
					testBtn.innerHTML = '<i class="fas fa-stop"></i><span>Stop</span>';
					statusEl.textContent = 'Playing: ' + streamUrl;
					statusEl.className = 'stream-status playing';
				} else {
					statusEl.textContent = 'Failed to load stream';
					statusEl.className = 'stream-status error';
				}
			}
		} catch (error) {
			console.error('Error starting test stream:', error);
			statusEl.textContent = 'Error: ' + error.message;
			statusEl.className = 'stream-status error';
		}
	};

	const stopStream = () => {
		if (!isPlaying || !testStreamObj) return;

		try {
			appContext.StreamManager.stopStream(testStreamObj);
			isPlaying = false;
			testBtn.innerHTML = '<i class="fas fa-play"></i><span>Start</span>';
			statusEl.textContent = '';
			statusEl.className = 'stream-status';
		} catch (error) {
			console.error('Error stopping test stream:', error);
		}
	};

	testBtn.onclick = async () => {
		if (!isPlaying) {
			await startStream();
		} else {
			stopStream();
		}
	};

	urlInput.addEventListener('keydown', async (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			urlInput.blur();
			await startStream();
		}
	});

	urlInput.addEventListener('blur', async () => {
		const streamUrl = urlInput.value.trim();
		if (streamUrl && !isPlaying) {
			await startStream();
		}
	});

	return testStreamObj;
}

function setupRecording(soundObj, refreshServerList) {
	const startBtn = document.getElementById('startRecordBtn');
	const stopBtn = document.getElementById('stopRecordBtn');
	const statusEl = document.getElementById('recordStatus');

	if (!startBtn || !stopBtn || !statusEl) return null;

	let mediaRecorder = null;
	let audioChunks = [];
	let recordingObj = null;

	startBtn.onclick = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			audioChunks = [];

			mediaRecorder = new MediaRecorder(stream);

			mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					audioChunks.push(event.data);
				}
			};

			mediaRecorder.onstop = async () => {
				const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
				const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
				const fileName = `recording_${timestamp}.webm`;

				statusEl.textContent = 'Uploading...';
				statusEl.className = 'record-status uploading';

				try {
					const file = new File([audioBlob], fileName, { type: 'audio/webm' });
					await Backend.files.uploadWithProgress(
						Selectors.getWorkspaceId(),
						file,
						(percentComplete) => {
							statusEl.textContent = `Uploading: ${percentComplete}%`;
						}
					);

					statusEl.textContent = 'Recording uploaded successfully';
					statusEl.className = 'record-status success';

					if (refreshServerList) {
						await refreshServerList(soundObj);
					}

					setTimeout(() => {
						statusEl.textContent = '';
						statusEl.className = 'record-status';
					}, CONSTANTS.STATUS_LONG_MS);
				} catch (error) {
					console.error('Error uploading recording:', error);
					statusEl.textContent = 'Upload failed: ' + error.message;
					statusEl.className = 'record-status error';
				}

				stream.getTracks().forEach(track => track.stop());
			};

			mediaRecorder.start();
			startBtn.disabled = true;
			stopBtn.disabled = false;
			statusEl.textContent = 'Recording...';
			statusEl.className = 'record-status recording';

		} catch (error) {
			console.error('Error starting recording:', error);
			statusEl.textContent = 'Microphone access denied';
			statusEl.className = 'record-status error';
		}
	};

	stopBtn.onclick = () => {
		if (mediaRecorder && mediaRecorder.state === 'recording') {
			mediaRecorder.stop();
			startBtn.disabled = false;
			stopBtn.disabled = true;
		}
	};

	recordingObj = {
		mediaRecorder: null,
		isRecording: false
	};

	return recordingObj;
}

function showFileManagerDialog(soundObj = null, onFileSelected = null) {
	return DialogManager.showFileManagerDialog(soundObj, onFileSelected);
}function duplicateLayer(originalLayer) {
	const newLayer = {
		id: `user_${LayerManager.nextLayerId++}`,
		name: `Copy of ${originalLayer.name}`,
		color: originalLayer.color,
		visible: originalLayer.visible,
		muted: originalLayer.muted,
		soloed: false,
		fx: deepClone(originalLayer.fx),
		eq: deepClone(originalLayer.eq),
		gain: originalLayer.gain
	};
	LayerManager.userLayers.push(newLayer);
	createLayerFXNodes(newLayer);
	LayerManager.refreshUserLayersUI();
}

function createLayerEQNode(layer) {
	if (!layer.eq) {
		layer.eq = deepClone(DEFAULT_EQ_STRUCTURE);
	}

	if (!layer.fxNodes) {
		createLayerFXNodes(layer);
	}

	if (!layer.fxNodes.eq) {
		layer.fxNodes.eq = new Tone.EQ3({
			low: layer.eq.low !== undefined ? layer.eq.low : CONSTANTS.DEFAULT_EQ_VALUES.low,
			mid: layer.eq.mid !== undefined ? layer.eq.mid : CONSTANTS.DEFAULT_EQ_VALUES.mid,
			high: layer.eq.high !== undefined ? layer.eq.high : CONSTANTS.DEFAULT_EQ_VALUES.high,
			lowFrequency: layer.eq.lowFrequency !== undefined ? layer.eq.lowFrequency : CONSTANTS.DEFAULT_EQ_VALUES.lowFrequency,
			highFrequency: layer.eq.highFrequency !== undefined ? layer.eq.highFrequency : CONSTANTS.DEFAULT_EQ_VALUES.highFrequency
		});

	}

	return layer.fxNodes.eq;
}

// SHOW LAYER FX DIALOG

function showLayerFXDialog(layer) {
	return LayerMenuManager.showLayerFXDialog(layer);
}function showLayerFXTab(layer, container, tabId, tabBar) {
	tabBar.querySelectorAll('button').forEach(btn => btn.classList.toggle('active', btn.dataset.tabId === tabId));
	container.innerHTML = '';

	if (tabId === 'eq') {
		layer.eq = layer.eq || deepClone(DEFAULT_EQ_STRUCTURE);

		const toggleGroup = createElement('div', 'parameter-control');
		const toggleLabel = createElement('label', 'label-eq');
		toggleLabel.textContent = 'Enable EQ';

		const toggleCheckbox = createElement('input');
		toggleCheckbox.type = 'checkbox';
		toggleCheckbox.checked = layer.eq.enabled || false;
		toggleCheckbox.onchange = () => {
			const isEnabled = toggleCheckbox.checked;
			layer.eq.enabled = isEnabled;

			AppState.dispatch({
				type: 'PARAMETER_CHANGED',
				payload: {
					target: layer,
					paramKey: 'eq_enabled',
					value: isEnabled,
					options: {
						isLayerFX: true,
						label: 'Enable EQ'
					}
				}
			});

			showLayerFXTab(layer, container, 'eq', tabBar);
		};
		toggleLabel.appendChild(toggleCheckbox);
		toggleGroup.appendChild(toggleLabel);
		container.appendChild(toggleGroup);

		if (!layer.eq.enabled) {
			container.appendChild(createElement('div', 'info-message', { textContent: 'EQ is currently disabled' }));
			return;
		}

		createLayerEQNode(layer);

		const bandsSection = UIBuilder.collapsibleSection({
			title: 'EQ Bands',
			icon: 'fa-sliders-h',
			expanded: true,
			isActive: () => layer.eq.low !== 0 || layer.eq.mid !== 0 || layer.eq.high !== 0,
			content: (update) => {
				const content = createElement('div');
				['fx_eq_low', 'fx_eq_mid', 'fx_eq_high'].forEach(key => {
					content.appendChild(createParameterControl(PARAMETER_REGISTRY[key], key, layer, update, { small: true, isLayerFX: true }));
				});
				return content;
			}
		});
		container.appendChild(bandsSection);

		const crossoverSection = UIBuilder.collapsibleSection({
			title: 'Crossover Frequencies',
			icon: 'fa-arrows-alt-h',
			isActive: () => layer.eq.lowFrequency !== CONSTANTS.DEFAULT_EQ_VALUES.lowFrequency || layer.eq.highFrequency !== CONSTANTS.DEFAULT_EQ_VALUES.highFrequency,
			content: (update) => {
				const content = createElement('div');
				['fx_eq_lowFreq', 'fx_eq_highFreq'].forEach(key => {
					content.appendChild(createParameterControl(PARAMETER_REGISTRY[key], key, layer, update, { small: true, isLayerFX: true }));
				});
				return content;
			}
		});
		container.appendChild(crossoverSection);

	} else if (tabId === 'gain') {
		layer.gain = layer.gain ?? CONSTANTS.DEFAULT_LAYER_GAIN;
		container.appendChild(createParameterControl(PARAMETER_REGISTRY['layerGain'], 'layerGain', layer, undefined, { small: true }));

	} else {
		[1, 2, 3].forEach(slotNum => {
			const section = UIBuilder.collapsibleSection({
				title: `FX Slot ${slotNum}`,
				icon: 'fa-sliders-h',
				isActive: () => layer.fx[`slot${slotNum}`]?.type !== 'none',
				content: () => createLayerFXSlot(layer, slotNum, container, tabBar)
			});
			container.appendChild(section);
		});
	}
}

function createLayerFXSlot(layer, slotNum, container, tabBar) {
	const currentFX = layer.fx[`slot${slotNum}`];
	const content = createElement('div');
	const fxOptions = getAvailableFXTypes();

	const fxSelect = createSelect(fxOptions, currentFX.type, async (e) => {
		changeLayerFX(layer, slotNum, e.target.value);
		await waitForNextFrame();
		showLayerFXTab(layer, container, 'fx', tabBar);
		const newSection = container.querySelectorAll('.collapsible-section')[slotNum - 1];
		if (newSection && e.target.value !== 'none') {
			newSection.classList.add('expanded');
		}
	}, { width: '100%', marginBottom: '8px' });

	content.appendChild(fxSelect);

	if (currentFX.type !== 'none') {
		const updateHeader = () => {
			const header = container.querySelectorAll('.collapsible-section-header')[slotNum - 1];
			if (header) header.classList.toggle('active', true);
		};

		content.appendChild(createParameterControl(PARAMETER_REGISTRY['fx_mix'], 'fx_mix', layer, updateHeader, { small: true, slot: `slot${slotNum}`, paramName: 'mix', isMixParameter: true, isLayerFX: true }));

		getEffectParameters(currentFX.type).forEach(paramKey => {
			const paramName = paramKey.replace('fx_', '').replace('_long', '');
			content.appendChild(createParameterControl(PARAMETER_REGISTRY[paramKey], paramKey, layer, updateHeader, { small: true, slot: `slot${slotNum}`, paramName: paramName, isLayerFX: true }));
		});
	}
	return content;
}

function refreshElementsList() {
	const listContainer = document.getElementById('elementsList');
	if (!listContainer) return;

	listContainer.innerHTML = '';

	const sounds = Selectors.getSounds();
	const paths = Selectors.getPaths();

	if (sounds.length === 0 && paths.length === 0) {
		const emptyMsg = document.createElement('div');
		emptyMsg.className = 'element-list-empty';
		emptyMsg.textContent = 'No elements yet';
		listContainer.appendChild(emptyMsg);
		return;
	}

	const shapeIcons = {
		'circle': 'fa-circle-notch',
		'polygon': 'fa-draw-polygon',
		'line': 'fa-bezier-curve',
		'oval': 'fa-circle'
	};

	sounds.forEach(sound => {
		const item = document.createElement('div');
		item.className = 'element-list-item';
		item.style.borderLeftColor = sound.color;

		const icon = document.createElement('i');
		icon.className = 'fas fa-volume-up element-icon';
		icon.style.color = sound.color;
		item.appendChild(icon);

		const label = document.createElement('span');
		label.className = 'element-label';
		label.textContent = sound.label || 'Untitled';
		item.appendChild(label);

		const type = document.createElement('span');
		type.className = 'element-type element-type-sound';
		type.textContent = sound.type;
		item.appendChild(type);

		item.onclick = () => {
			document.getElementById('controlMenu').classList.remove('active');
			const markerPoint = map.latLngToContainerPoint(sound.marker.getLatLng());
			showSoundMenu(markerPoint, sound.marker);
		};

		listContainer.appendChild(item);
	});

	paths.forEach(path => {
		const item = document.createElement('div');
		item.className = 'element-list-item';
		item.style.borderLeftColor = path.color;

		const iconClass = shapeIcons[path.type] || 'fa-question';
		const icon = document.createElement('i');
		icon.className = `fas ${iconClass} element-icon`;
		icon.style.color = path.color;
		item.appendChild(icon);

		const label = document.createElement('span');
		label.className = 'element-label';
		label.textContent = path.label;
		item.appendChild(label);

		const type = document.createElement('span');
		type.className = 'element-type element-type-path';
		type.textContent = path.type;
		item.appendChild(type);

		item.onclick = () => {
			document.getElementById('controlMenu').classList.remove('active');

			let pointToShow;
			if (isLinearPath(path)) {
				pointToShow = path.points[0];
			} else if (path.center) {
				pointToShow = path.center;
			} else if (path.points && path.points.length > 0) {
				pointToShow = Geometry.calculateCentroid(path.points);
			} else {
				return;
			}
			const markerPoint = map.latLngToContainerPoint(pointToShow);
			showPathMenu(markerPoint, path);
		};

		listContainer.appendChild(item);
	});
}

function resetAreaTracking(userPos) {
	if (!userPos) {
		userPos = GeolocationManager.getUserPosition();
		if (!userPos) return;
	}

	Selectors.getSounds().forEach(s => {
		if (s.type === "SoundFile" && !s.params.loop) {
			const targetGain = calcGain(userPos, s);
			const isInRange = targetGain > 0;

			if (!isInRange && s.wasInsideArea) {
				s.wasInsideArea = false;

			}
		}
	});
}

function reconnectAmbisonicsSource(sound) {
	if (!sound.ambisonicSource) return;

	sound.filter.disconnect();
	sound.envelopeGain.disconnect();
	sound.gain.disconnect();

	sound.filter.connect(sound.envelopeGain);
	sound.envelopeGain.connect(sound.gain);
	sound.gain.connect(sound.ambisonicSource.input);

	reconnectSoundToLayers(sound);
}

function reconnectSoundToLayers(sound) {
	sound.gain.disconnect();

	const assignedLayers = sound.layers.filter(layerId =>
		LayerManager._userLayersMap.has(layerId)
	);

	const anySoloed = LayerManager.userLayers.some(l => l.soloed);

	if (anySoloed && assignedLayers.length === 0) {

		return;
	}

	if (Selectors.getSpatialMode() === 'ambisonics' && sound.ambisonicSource) {
		sound.gain.connect(sound.ambisonicSource.input);

		return;
	}

	if (assignedLayers.length > 0) {
		assignedLayers.forEach(layerId => {
			const layer = LayerManager.getUserLayer(layerId);
			if (layer && layer.fxNodes) {
				if (!layer.fxNodes.input) {
					createLayerFXNodes(layer);
				}
				sound.gain.connect(layer.fxNodes.input);


				updateLayerFXChain(layer);
			}
		});
	} else {
		sound.gain.toDestination();

	}
}

function getAudioNodeParameter(synth, audioNodePath) {
	if (!audioNodePath) return null;

	const parts = audioNodePath.split('.');
	let current = synth;

	for (const part of parts) {
		if (!current || !current[part]) return null;
		current = current[part];
	}

	return current;
}

function _applySoundFilePlaybackParams(soundObj, shouldRestart = false) {
	if ((soundObj.type !== "SoundFile" && soundObj.type !== "Granular") || !soundObj.synth) {
		return;
	}

	const isGranular = soundObj.type === "Granular";

	soundObj.synth.set({
		loop: soundObj.params.loop || false,
		playbackRate: soundObj.params.speed,
		reverse: soundObj.params.reverse,
		loopStart: soundObj.params.loopStart,
		loopEnd: soundObj.params.loopEnd
	});

	if (isGranular) {
		soundObj.synth.detune = soundObj.params.grainDetune || 0;
		if (soundObj.params.timeStretchMode === 'manual') {
			soundObj.synth.grainSize = soundObj.params.grainSize || 0.1;
			soundObj.synth.overlap = soundObj.params.overlap || 0.05;
		}
	} else {
		soundObj.synth.fadeIn = soundObj.params.fadeIn;
		soundObj.synth.fadeOut = soundObj.params.fadeOut;
	}

	if (shouldRestart && soundObj.isPlaying && soundObj.params.loop) {
		if (soundObj._restartTimeout) {
			cancelAnimationFrame(soundObj._restartTimeout);
		}
		soundObj._restartTimeout = requestAnimationFrame(async () => {
			stopLoopedPlayback(soundObj);
			await waitForNextFrame();
			startLoopedPlayback(soundObj);
		});
	}
}

async function _handleSoundFileModeChange(soundObj, newMode) {
	if (soundObj.params.playbackMode === newMode) return;

	const soundFile = soundObj.params.soundFile;

	AudioNodeManager.stopPlayback(soundObj);
	soundObj.isReady = false;
	AudioNodeManager.disposeNodes([soundObj.synth]);
	await waitForNextFrame();

	soundObj.params.playbackMode = newMode;

	const newSynth = SYNTH_REGISTRY.SoundFile.factory(soundObj.params);
	soundObj.synth = newSynth;

	if (soundObj.loopFadeGain) {
		soundObj.synth.connect(soundObj.loopFadeGain);
	} else {
		soundObj.synth.connect(soundObj.filter);
	}

	if (soundFile) {
		await autoLoadSoundFile(soundObj, soundFile);
	}

	_applySoundFilePlaybackParams(soundObj, false);
}

async function _upgradeSynthToPolyphonic(soundObj, requiredPolyphony) {
	const synthDef = SYNTH_REGISTRY[soundObj.type];
	if (!synthDef || !synthDef.factory) return;

	const wasPlaying = soundObj.isPlaying;
	const oldSynth = soundObj.synth;

	if (oldSynth.triggerRelease) {
		oldSynth.triggerRelease();
	}
	await waitForNextFrame();

	soundObj.params.polyphony = requiredPolyphony;
	const newSynth = synthDef.factory(soundObj.params);

	const connectionTarget = soundObj.loopFadeGain || soundObj.filter;
	oldSynth.disconnect();
	newSynth.connect(connectionTarget);

	oldSynth.dispose();
	soundObj.synth = newSynth;

	if (wasPlaying && soundObj.params.selectedNotes?.length > 0) {
		await waitForNextFrame();
		PolyphonyManager.triggerPolyphonic(newSynth, soundObj.params.selectedNotes, true, soundObj);
	}
}

async function _buildAndInitializeSound(data) {
	const obj = await createFullSoundInstance(data, { onMap: true });

	if (!obj) return null;

	obj.id = obj.marker._leaflet_id;
	AppState.dispatch({
		type: 'SOUND_ADDED',
		payload: { sound: obj }
	});

	return obj;
}

function addEventHandlers(obj) {
	DragHandlers.attachMarkerHandlers(obj);

	if (obj.shapeType === "circle" && obj.handle) {
		DragHandlers.attachCircleHandlers(obj);
	}

	if (obj.shapeType === "polygon" && obj.vertices) {
		ShapeManager.createVertexMarkers(obj);
	}

	if (obj.labelMarker) {
		obj.labelMarker.on('click', (e) => {
			L.DomEvent.stopPropagation(e);
			if (Selectors.justDraggedMarker() || Selectors.justDraggedPath()) return;
			if (Selectors.getSelectionMode() === 'click') {
				SelectionController.toggleElement(obj.id, 'sound');
				return;
			}
			if (e.originalEvent.shiftKey) {
				deleteSound(obj);
				return;
			}
			showSoundMenu(e.containerPoint, obj.marker);
		});

		LabelDragHandler.attachTo(obj.labelMarker, obj, 'sound');
	}
}

function handleMarkerDrag(obj) {
	const newPos = obj.marker.getLatLng();

	if (obj.shapeType === "circle") {
		Geometry.updateCirclePosition(obj.circle, obj.handle, obj.labelMarker, newPos, obj.maxDistance);
	} else if (obj.shapeType === "polygon") {
		handlePolygonDrag(obj, newPos);
	}

	if (obj.isDragging) {
		obj.userLat = newPos.lat;
		obj.userLng = newPos.lng;
	}
}

function handleCircleDrag(obj) {
	const distance = map.distance(obj.marker.getLatLng(), obj.handle.getLatLng());
	Geometry.resizeCircle(obj, distance);
}

function handlePolygonDrag(obj, newPos) {
	if (!obj._originalMarkerPos) {
		obj._originalMarkerPos = obj.marker.getLatLng();
	}

	const deltaLat = newPos.lat - obj._originalMarkerPos.lat;
	const deltaLng = newPos.lng - obj._originalMarkerPos.lng;

	obj.vertices = Geometry.updatePolygonPosition(
		obj.polygon,
		obj.vertices,
		obj.vertexMarkers,
		obj.labelMarker,
		deltaLat,
		deltaLng
	);

	obj._originalMarkerPos = newPos;
}

// SHOW SOUND MENU

function showSoundMenu(point, marker, keepMenusOpen = false) {
	return SoundMenuManager.showSoundMenu(point, marker, keepMenusOpen);
}

function closeAllMenus() {
	while (Selectors.getMenuCount() > 0) {
		MenuManager.closeTop();
	}
}

function showMenuTab(obj, container, tabId, tabBar) {
	return SoundMenuManager.showMenuTab(obj, container, tabId, tabBar);
}

async function changeSoundType(obj, newType) {
	return SoundMenuManager.changeSoundType(obj, newType);
}

function updateSoundLabel(obj, newLabel) {
	return SoundMenuManager.updateSoundLabel(obj, newLabel);
}

function updateSpatialAudio(obj) {
	return SoundMenuManager.updateSpatialAudio(obj);
}

window.updateSpatialAudio = updateSpatialAudio;

async function deleteSound(obj) {
	return SoundMenuManager.deleteSound(obj);
}

async function duplicateSound(originalObj) {
	const offset = 0.001;

	const copiedParams = {
		...originalObj.params,
		lfo: deepClone(originalObj.params.lfo || DEFAULT_LFO_STRUCTURE),
		fx: deepClone(originalObj.params.fx || DEFAULT_FX_STRUCTURE),
		eq: deepClone(originalObj.params.eq || DEFAULT_EQ_STRUCTURE)
	};

	const newData = {
		...originalObj,
		lat: originalObj.userLat + offset,
		lng: originalObj.userLng + offset,
		label: `${originalObj.label} Copy`,
		params: copiedParams,
		lfo: copiedParams.lfo,
		fx: copiedParams.fx,
		eq: copiedParams.eq,
		motion: originalObj.motion ? deepClone(originalObj.motion) : undefined,
		pathRoles: originalObj.pathRoles ? deepClone(originalObj.pathRoles) : undefined,
		layers: originalObj.layers ? [...originalObj.layers] : [],
		modulationSources: originalObj.modulationSources ? [...originalObj.modulationSources] : []
	};

	if (originalObj.shapeType === 'polygon' && originalObj.vertices) {
		newData.vertices = originalObj.vertices.map(v => ({
			lat: v.lat + offset,
			lng: v.lng + offset
		}));
	}

	delete newData.marker;
	delete newData.circle;
	delete newData.polygon;
	delete newData.handle;
	delete newData.vertexMarkers;
	delete newData.labelMarker;
	delete newData.synth;
	delete newData.gain;
	delete newData.envelopeGain;
	delete newData.filter;
	delete newData.panner;
	delete newData.fx1;
	delete newData.fx2;
	delete newData.fx3;
	delete newData.id;

	const newSound = await loadSound(newData);

	await restoreFXChain(newSound);
	if (newSound.params.eq && newSound.params.eq.enabled) {
		AudioNodeManager.ensureEQNode(newSound);
	}
	AudioNodeManager.updateFXChain(newSound);

	if (newData.pathRoles?.movement) {
		const path = AppState.getPath(newData.pathRoles.movement);
		if (path && !path.attachedSounds.includes(newSound.marker._leaflet_id)) {
			path.attachedSounds.push(newSound.marker._leaflet_id);
		}
	}

	return newSound;
}

async function ensureAudioContext() {
	return SoundMenuManager.ensureAudioContext();
}

// SHOW USER MENU

function showUserMenu(point) {
	return UserMenuManager.showUserMenu(point);
}

async function setSoundPannerType(soundObj) {
	if (!soundObj.filter || !soundObj.panner || !soundObj.envelopeGain) return;

	const shouldUseHrtf = Selectors.getSpatialMode() === 'hrtf' && soundObj.useSpatialPanning;
	const shouldUseAmbisonics = Selectors.getSpatialMode() === 'ambisonics' && soundObj.useSpatialPanning;
	const currentIsAmbisonic = soundObj.ambisonicSource && soundObj.ambisonicSource !== null;

	const wasPlaying = soundObj.isPlaying;
	const playingNotes = soundObj.params.selectedNotes && soundObj.params.selectedNotes.length > 0 ? [...soundObj.params.selectedNotes] : (wasPlaying ? [soundObj.params.pitch || 60] : []);

	soundObj.filter.disconnect();
	soundObj.envelopeGain.disconnect();
	soundObj.gain.disconnect();

	if (soundObj.panner) {
		soundObj.panner.dispose();
		soundObj.panner = null;
	}

	if (currentIsAmbisonic) {
		appContext.AmbisonicsManager.removeSource(soundObj);
		soundObj.ambisonicSource = null;
	}

	if (shouldUseAmbisonics) {
		const source = await appContext.AmbisonicsManager.createSource(soundObj);
		if (source) {
			soundObj.ambisonicSource = source;
			soundObj.filter.connect(soundObj.envelopeGain);
			soundObj.envelopeGain.connect(soundObj.gain);
			soundObj.gain.connect(source.input);
		} else {
			soundObj.panner = new Tone.Panner(soundObj.params.pan || 0);
			soundObj.filter.connect(soundObj.panner);
			soundObj.panner.connect(soundObj.envelopeGain);
			soundObj.envelopeGain.connect(soundObj.gain);
			soundObj.gain.toDestination();
		}
	} else {
		if (shouldUseHrtf) {
			soundObj.panner = new Tone.Panner3D({
				panningModel: CONSTANTS.PANNER_3D_MODEL,
				distanceModel: CONSTANTS.PANNER_3D_DISTANCE_MODEL,
				refDistance: CONSTANTS.PANNER_3D_REF_DISTANCE,
				maxDistance: CONSTANTS.PANNER_3D_MAX_DISTANCE,
				rolloffFactor: CONSTANTS.PANNER_3D_ROLLOFF_FACTOR
			});
		} else {
			const synthDef = SYNTH_REGISTRY[soundObj.type];
			const isStereoSource = synthDef?.isStereo || false;

			if (isStereoSource && Selectors.getSpatialMode() === 'stereo') {
				soundObj.panner = new Tone.Panner3D({
					panningModel: 'equalpower',
					distanceModel: 'linear',
					refDistance: 1,
					maxDistance: 10000,
					rolloffFactor: 0
				});
			} else {
				soundObj.panner = new Tone.Panner(soundObj.params.pan || 0);
			}
		}

		soundObj.filter.connect(soundObj.panner);
		soundObj.panner.connect(soundObj.envelopeGain);
		soundObj.envelopeGain.connect(soundObj.gain);
		soundObj.gain.toDestination();
	}

	if (soundObj.synth) {
		try {
			soundObj.synth.disconnect();
			if (soundObj.type === 'SoundFile' && soundObj.loopFadeGain) {
				soundObj.synth.connect(soundObj.loopFadeGain);
				soundObj.loopFadeGain.disconnect();
				soundObj.loopFadeGain.connect(soundObj.filter);
			} else if (soundObj.type === 'StreamPlayer' && soundObj.mediaSource) {
				soundObj.mediaSource.disconnect();
				Tone.connect(soundObj.mediaSource, soundObj.filter);
			} else {
				soundObj.synth.connect(soundObj.filter);
			}
		} catch (e) {
			console.warn('Error reconnecting synth to filter:', e);
		}
	}

	if (wasPlaying && soundObj.type !== 'SoundFile' && soundObj.type !== 'StreamPlayer') {
		await waitForNextFrame();
		if (playingNotes.length > 0) {
			PolyphonyManager.triggerPolyphonic(soundObj.synth, playingNotes, true);
		}
	}
}

async function setSpatialMode(newMode) {
	if (Selectors.getSpatialMode() === newMode) return;

	AppState.audio.isRebuildingChains = true;

	const oldMode = Selectors.getSpatialMode();
	AppState.dispatch({
		type: 'AUDIO_MODE_CHANGED',
		payload: { mode: newMode }
	});

	if (newMode === 'ambisonics') {
		await unlockAudio();
		await appContext.AmbisonicsManager.initialize();
	}

	const userPos = GeolocationManager.getUserPosition();

	for (const sound of Selectors.getSounds()) {
		await rebuildSoundAudioChain(sound);

		if (sound.echoNodes && sound.echoNodes.size > 0) {
			EchoManager.cleanup(sound);

			if (userPos) {
				EchoManager.update(sound, userPos);
			}
		}
	}

	if (oldMode === 'ambisonics' && newMode !== 'ambisonics') {
		appContext.AmbisonicsManager.dispose();
	}

	AppState.audio.isRebuildingChains = false;

	if (userPos) {
		resetAreaTracking(userPos);
		Selectors.getSounds().forEach(s => {
			s.wasInsideArea = false;
		});
		updateAudio(userPos);
	}

	AppState.dispatch({
		type: 'AUDIO_SPATIAL_MODE_CHANGED',
		payload: { newMode: newMode }
	});
}

async function rebuildSoundAudioChain(soundObj) {
	const currentType = soundObj.type;
	const currentParams = { ...soundObj.params };
	const soundFile = currentParams.soundFile;

	AudioNodeManager.stopPlayback(soundObj);
	if (soundObj.ambisonicSource) {
		appContext.AmbisonicsManager.removeSource(soundObj);
		soundObj.ambisonicSource = null;
	}
	AudioNodeManager.disposeNodes([
		soundObj.synth, soundObj.gain, soundObj.envelopeGain,
		soundObj.filter, soundObj.panner, soundObj.eq,
		soundObj.fx1, soundObj.fx2, soundObj.fx3, soundObj.loopFadeGain
	]);
	await waitForNextFrame();

	const newChain = AudioNodeManager.createAudioChain(currentType, currentParams, Selectors.getSpatialMode());
	Object.assign(soundObj, newChain);

	if (Selectors.getSpatialMode() === 'ambisonics' && soundObj.useSpatialPanning) {
		const source = await appContext.AmbisonicsManager.createSource(soundObj);
		if (source) {
			soundObj.ambisonicSource = source;
		}
	}

	soundObj.params = currentParams;
	if (currentType === 'SoundFile' && soundFile) {
		await autoLoadSoundFile(soundObj, soundFile);
		_applySoundFilePlaybackParams(soundObj, false);
	}

	await restoreFXChain(soundObj);
	if (soundObj.params.eq && soundObj.params.eq.enabled) {
		AudioNodeManager.ensureEQNode(soundObj);
	}

	reconnectSoundToLayers(soundObj);
	AudioNodeManager.updateFXChain(soundObj);
}

function updateListenerOrientation() {
	if (Selectors.getSpatialMode() !== 'hrtf') {
		Tone.Listener.forwardX.value = 0;
		Tone.Listener.forwardY.value = 0;
		Tone.Listener.forwardZ.value = -1;
		Tone.Listener.upX.value = 0;
		Tone.Listener.upY.value = 1;
		Tone.Listener.upZ.value = 0;
		return;
	}

	const angleRad = Selectors.getUserDirection() * (Math.PI / 180);

	const forwardY = Math.cos(angleRad);
	const forwardX = Math.sin(angleRad);

	Tone.Listener.forwardX.value = forwardX;
	Tone.Listener.forwardY.value = forwardY;
	Tone.Listener.forwardZ.value = 0;
	Tone.Listener.upX.value = 0;
	Tone.Listener.upY.value = 0;
	Tone.Listener.upZ.value = 1;
}

async function loadServerSoundFile(filename, soundObj) {
	const statusEl = document.querySelector('#soundDialog')?.previousElementSibling?.previousElementSibling;

	try {
		if (soundObj.isPlaying) {
			AudioNodeManager.stopPlayback(soundObj);
		}
		await waitForNextFrame();

		soundObj.params.soundFile = filename;

		if (soundObj._gridFileCallback) {
			const callback = soundObj._gridFileCallback;
			delete soundObj._gridFileCallback;
			callback(filename);
			document.getElementById("soundDialog")?.remove();
			AppState.dispatch({ type: 'SOUND_UPDATED', payload: { sound: soundObj } });
			return;
		}

		if (soundObj.type === 'Sampler' && soundObj.params.samplerMode === 'single') {
			await changeSoundType(soundObj, 'Sampler');
		} else {
			await autoLoadSoundFile(soundObj, filename);
		}

		document.getElementById("soundDialog")?.remove();

		if (Selectors.getMenuCount() > 0) {
			const currentMenu = Selectors.getMenus().find(m => m.menu.contains(document.activeElement))?.menu || Selectors.getTopMenu().menu;
			if (currentMenu) {
				const container = currentMenu.querySelector('.params-container');
				const tabBar = currentMenu.querySelector('.tab-bar');
				if (container && tabBar) {
					showMenuTab(soundObj, container, 'sound', tabBar);
				}
			}
		}

		AppState.dispatch({ type: 'SOUND_UPDATED', payload: { sound: soundObj } });
	} catch (err) {
		const errorMsg = err.name === 'EncodingError' ?
			`Cannot decode audio file. Try converting to MP3 or OGG format.` :
			err.message;

		if (statusEl) {
			statusEl.textContent = "Error: " + errorMsg;
		}

		console.error("Server file load error:", err);
	}
}

async function autoLoadSoundFile(soundObj, filename) {
	if (soundObj.type !== "SoundFile" && soundObj.type !== "Sampler") {
		return;
	}

	if (soundObj.type === 'Sampler' && soundObj.params.samplerMode === 'grid') {

		return;
	}

	soundObj.isReady = false;

	return new Promise(async (resolve, reject) => {
		try {
			const fileUrl = filename.includes('/')
				? filename
				: `workspaces/${Selectors.getWorkspaceId()}/sounds/${filename}`;

			if (!soundObj.synth || soundObj.synth.disposed) {
				return reject(new Error("Synth not available or disposed"));
			}

			const onload = () => {
				let duration = 0;
				if (soundObj.synth.buffer && soundObj.synth.buffer.duration) {
					duration = soundObj.synth.buffer.duration;
				} else if (soundObj.synth.get && soundObj.synth.get('C4') && soundObj.synth.get('C4').duration) {
					duration = soundObj.synth.get('C4').duration;
				}
				if (soundObj.type !== 'Sampler' || !soundObj.soundDuration) {
					soundObj.soundDuration = duration;
				}


				soundObj.wasInsideArea = false;
				soundObj.isPlaying = false;
				soundObj.isReady = true;


				if (soundObj.type !== 'Sampler') {
					AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
				}

				resolve();
			};

			if (soundObj.type === 'Sampler') {
				if (!soundObj.synth.connected) {
					soundObj.synth.connect(soundObj.filter);
				}
				const buffer = new Tone.Buffer(fileUrl, () => {
					soundObj.soundDuration = buffer.duration;
					soundObj.synth.add('C4', buffer);
					onload();
				}, reject);
			} else if (soundObj.type === 'SoundFile') {
				if (soundObj.params.playbackMode === 'granular') {
					const buffer = new Tone.Buffer(fileUrl, () => {
						soundObj.synth.buffer = buffer;
						onload();
					}, reject);
				} else {
					await soundObj.synth.load(fileUrl);
					onload();
				}
			} else {
				soundObj.isReady = true;
				resolve();
			}

		} catch (error) {
			console.error(`Error auto-loading sound file ${filename}:`, error);
			soundObj.params.soundFile = filename;
			reject(error);
		}
	});
}

function saveSettings() {
	return SettingsManager.saveSettings();
}

async function loadSettings(event) {
	return SettingsManager.loadSettings(event);
}

const helperMenu = document.getElementById('helperMenu');
const controlMenu = document.getElementById('controlMenu');

const Menus = {
	helper: { toggle: document.getElementById('helperMenuToggle'), menu: helperMenu },
	elements: { toggle: document.getElementById('elementsMenuToggle'), menu: document.getElementById('elementsMenu') },
	control: { toggle: document.getElementById('controlMenuToggle'), menu: controlMenu },
	sequencing: { toggle: document.getElementById('sequencingMenuToggle'), menu: document.getElementById('sequencingMenu') },
	interface: { toggle: document.getElementById('interfaceMenuToggle'), menu: document.getElementById('interfaceMenu') },
	selection: { toggle: document.getElementById('selectionMenuToggle'), menu: document.getElementById('selectionMenu') },
	about: { toggle: document.getElementById('aboutMenuToggle'), menu: document.getElementById('aboutMenu') }
};

Object.entries(Menus).forEach(([name, { toggle, menu }]) => {
	toggle?.addEventListener('click', (e) => {
		e.stopPropagation();
		const wasActive = menu.classList.contains('active');

		if (Selectors.getActiveSideMenu() && Selectors.getActiveSideMenu() !== menu) {
			Selectors.getActiveSideMenu().classList.remove('active');
		}

		menu.classList.toggle('active');
		AppState.ui.menuState.activeSideMenu = menu.classList.contains('active') ? menu : null;
		AppState.dispatch({
			type: 'UI_SIDE_MENU_TOGGLED',
			payload: { menu, wasActive }
		});
	});
});

const mapManager = new MapManager();
const map = mapManager.initialize();
Geometry.setMap(map);

const ambisonicsManagerInstance = new AmbisonicsManager();
ambisonicsManagerInstance.setDependencies({
	unlockAudio,
	getGeolocation: () => GeolocationManager.getUserPosition(),
	appState: AppState,
	reconnectSound: reconnectAmbisonicsSource,
	geometry: Geometry
});

const streamManagerInstance = new StreamManager();
streamManagerInstance.setAudioContext(AudioContextManager.nativeContext);

appContext.initialize({
	core: {
		map,
		mapManager,
		Selectors: Selectors,
		Actions: Actions,
		CONSTANTS: CONSTANTS,
		DragHandlers: DragHandlers,
		CoordinateTransform: CoordinateTransform,
		PathEditor: PathEditor,
		PARAMETER_REGISTRY: PARAMETER_REGISTRY,
		DistanceSequencer: DistanceSequencer,
		PathZoneChecker: PathZoneChecker,
		Geometry: Geometry,
		AudioContextManager: AudioContextManager,
		L: window.L,
		NoteManager: PolyphonyManager,
		OSCManager: oscManager,
		AmbisonicsManager: ambisonicsManagerInstance,
		PolyphonyManager: PolyphonyManager,
		StreamManager: streamManagerInstance,
		GeolocationManager: GeolocationManager,
		DeviceOrientationManager: DeviceOrientationManager,
		LayerManager: LayerManager,
		ElementFactory: ElementFactory,
		ShapeManager: ShapeManager,
		AppState: AppState,
		Security: Security,
		Backend: Backend,
		MenuManager: MenuManager,
		ModalSystem: ModalSystem,
		AudioNodeManager: AudioNodeManager,
		WorkspaceManager: WorkspaceManager
	},
	managers: {
		PolyphonyManager: PolyphonyManager,
		StreamManager: streamManagerInstance,
		FXManager: FXManager,
		EchoManager: EchoManager,
		ModalSystem: ModalSystem,
		MenuManager: MenuManager,
		ElementFactory: ElementFactory,
		ParameterManager: ParameterManager,
		AudioNodeManager: AudioNodeManager,
		AudioChainManager: { updateFXChain, updateLayerFXChain }
	},
	registries: {
		CATEGORY_REGISTRY: CATEGORY_REGISTRY,
		SHAPE_REGISTRY: SHAPE_REGISTRY,
		SYNTH_REGISTRY: SYNTH_REGISTRY,
		FX_REGISTRY: FX_REGISTRY,
		FXParamSets: FXParamSets,
		tileLayers
	},
	security: {
		Security: Security,
		Backend: Backend
	},
	ui: {
		UIBuilder: UIBuilder,
		Menus: Menus,
		createElement,
		createButton,
		createSelect,
		createCollapsibleSection,
		createColorPicker,
		createHeaderControls,
		createParamsContainer,
		createActionButtons,
		createSpatialSection,
		createExitBehaviorDropdown,
		createVolumeModelDropdown,
		createIconPlacementDropdown,
		createMenuStructure,
		createSourceTypeDropdown,
		createRoleDropdown,
		createShapeDropdown,
		createPanningDropdown,
		createLabelInput,
		createTabBar,
		createDeleteButton,
		createSwitch,
		createRadioButton,
		createDraggableHeader,
		createElementNavigationDropdown,
		createCloseButton,
		createParameterControl,
		updateFrequencyModeIndicators,
		updateNodeParameter,
		addSideMenuCloseButtons
	},
	typeChecks: {
		isFileSynth,
		hasKeyboard,
		isGranularMode,
		isLinearPath
	},
	fxStructures: {
		fx: DEFAULT_FX_STRUCTURE,
		eq: DEFAULT_EQ_STRUCTURE,
		lfo: DEFAULT_LFO_STRUCTURE
	},
	defaults: {
		sequencer: DEFAULT_SEQUENCER_CONFIG,
		controlPath: DEFAULT_CONTROL_PATH_CONFIG,
		marker: DEFAULT_MARKER_CONFIG
	},
	audioFunctions: {
		updateAudio,
		resetAreaTracking,
		attachDragHandlers,
		destroySound,
		startLoopedPlayback,
		stopLoopedPlayback,
		upgradeSynthToPolyphonic,
		triggerPlayback,
		reconnectSoundToLayers,
		loadSound,
		addSound,
		addSoundLine,
		addSoundOval,
		createLayerFXNodes,
		createEffect,
		updateSynthParam,
		calcGain,
		calculatePathGain,
		updateListenerOrientation,
		calculateRelativePosition,
		calculateBearingPan,
		processLFOs,
		processPathLFOs,
		getParametersForSynth,
		getAvailableSynthTypes,
		getAvailableFXTypes,
		getSynthCapabilities,
		initializeSynthParameters,
		getEffectParameters,
		getAvailableModulationTargets,
		changeFX,
		changeLayerFX,
		createLayerEQNode,
		getAudioNodeParameter,
		midiToNoteName,
		generateLFOWaveform,
		startAudioLoop,
		stopAudioLoop,
		getUserMovementSpeed,
		createControlPath,
		refreshPathsList,
		refreshElementsList,
		closeAllMenus,
		saveWorkspaceSettings: () => WorkspaceManager.saveWorkspaceSettings(),
		showUserMenu
	},
	soundFunctions: {
		showUserMenu,
		showSoundMenu,
		showPathMenu,
		showLayerFXDialog,
		showFileManagerDialog,
		closeAllMenus,
		createSoundObject,
		addEventHandlers,
		handleMarkerDrag,
		handleCircleDrag,
		handlePolygonDrag,
		updateSoundLabel,
		updateSpatialAudio,
		updateSoundMarkerPosition,
		updateSoundOnLinePath,
		updateSoundOnCirclePath,
		updateSoundPositionOnPath
	},
	pathFunctions: {
		createControlPath,
		deleteControlPath,
		renderControlPath,
		renderLineOrPolygonPath,
		renderCirclePath,
		renderOvalPath,
		addCirclePathMarkers,
		addOvalPathMarkers,
		createAndAttachPathLabel,
		refreshPathsList,
		updatePathVisibility,
		shouldPathBeVisible,
		updateControlPathPosition,
		computePathLength,
		duplicatePath,
		attachUserToPath,
		detachUserFromPath,
		animateUserOnPath,
		getPointAtDistanceOnControlPath,
		getPointAtDistance,
		showPathMenuTab
	},
	layerFunctions: {
		duplicateLayer,
		showLayerFXTab,
		createLayerFXSlot,
		refreshElementsList,
		changeLayerFX,
		createLayerEQNode,
		getEffectParameters
	},
	simulationFunctions: {
		stopSimulation,
		detachUserFromPath,
		showSimulationControls,
		startSimulationPlacement,
		placeSimulationTargetHandler,
		calculateBearing,
		animateMovement,
		getRouteAndAnimate
	},
	workspaceFunctions: {
		saveWorkspaceSettings: () => WorkspaceManager.saveWorkspaceSettings(),
		initWorkspace: () => WorkspaceManager.initWorkspace(),
		updateWorkspaceUI: () => WorkspaceManager.updateWorkspaceUI(),
		updateMenuCounts: () => WorkspaceManager.updateMenuCounts(),
		buildSettingsObject: () => SettingsManager.buildSettings(),
		saveSettings,
		loadSettings,
		clearAll,
		exportBuzzPackage: (meta) => PackageExporter.export(meta)
	},
	mapFunctions: {
		changeMapStyle,
		updateOSCStatus
	},
	utils: {
		deepClone,
		toRadians,
		toDegrees,
		setTemporaryFlag,
		isCircularPath,
		mapValue,
		debounce,
		throttle,
		delay,
		waitForNextFrame
	},
	validation: {
		isValidLatLon,
		isValidMarker,
		isValidSound,
		isValidControlPath,
		isValidSequencer,
		clampNumber
	},
	api: {
		workspaceAPI: WorkspaceAPI,
		filesAPI: FilesAPI
	},
	pathFactory: PathFactory,
	pathRenderer: PathRenderer,
	simulation: {
		controller: SimulationController,
		animator: RouteAnimator
	},
	selection: {
		controller: SelectionController,
		actions: SelectionActions,
		dragHandler: DragSelectHandler,
		uiBuilder: SelectionUIBuilder
	},
	persistence: {
		settingsManager: SettingsManager,
		workspaceManager: WorkspaceManager,
		packageExporter: PackageExporter,
		packageImporter: PackageImporter
	},
	events: {
		eventBus: EventBus,
		mapClickHandler,
		createUIEventHandlers,
		unlockAudio
	},
	interactions: {
		labelDragHandler: LabelDragHandler,
		startPolygonPathDrawing,
		startOvalPathDrawing,
		startLinePathDrawing,
		startCirclePathDrawing,
		startSoundShapeDrawing,
		finishPolygonPath,
		finishOvalPath,
		finishLinePath,
		finishCirclePath,
		cancelPathDrawing,
		cancelSoundDrawing,
		showDrawingIndicator,
		hideDrawingIndicator,
		showShapeCreationMenu,
		hideShapeCreationMenu,
		toggleShapeCreationMenu
	},
	menuTabs: MenuTabs,
	functions: {
		getParametersForSynth,
		getAvailableSynthTypes,
		getAvailableFXTypes,
		getSynthCapabilities,
		initializeSynthParameters,
		changeSoundType,
		showMenuTab,
		showFileManagerDialog,
		showGridSampleDialog,
		showSoundMenu,
		showPathMenu,
		changeFX,
		getEffectParameters,
		getAvailableModulationTargets,
		getAvailableFXModulationTargets,
		computePathLength,
		updatePathVisibility,
		updateControlPathPosition,
		deleteSound,
		duplicateSound,
		updateSpatialAudio,
		setSpatialMode,
		setSoundPannerType,
		updateSoundLabel,
		createParameterControl,
		unlockAudio,
		ensureAudioContext,
		addEventHandlers,
		restoreFXChain,
		reconnectSoundToLayers,
		processLFOs,
		processPathLFOs,
		createLayerEQNode,
		createLayerFXNodes,
		getUserMovementSpeed,
		calculatePathGain,
		calcGain,
		calculateRelativePosition,
		calculateBearingPan,
		midiToNoteName,
		waitForNextFrame,
		updateSynthParam,
		updateAudio,
		autoLoadSoundFile,
		_applySoundFilePlaybackParams,
		updateLayerFXChain,
		updateSoundPositionOnPath,
		createFullSoundInstance,
		getSmoothedPathPoints: PathFactory.getSmoothedPathPoints,
		generateOvalPoints: PathFactory.generateOvalPoints,
		getOffsetPolyline: PathRenderer.getOffsetPolyline,
		startSimulationPlacement,
		attachUserToPath,
		detachUserFromPath
	},
	syncPitchToKeyboard,
	ensureSoundDialogExists,
	setupStreamTesting,
	setupRecording
});

const sequencerUIManager = new SequencerUIManager(appContext);
appContext.setDependency('SequencerUIManager', sequencerUIManager);
appContext.setDependency('audioFunctions.showSequencerPanel', (point, sequencer) => sequencerUIManager.showSequencerPanel(point, sequencer));
appContext.setDependency('audioFunctions.refreshSequencersList', () => sequencerUIManager.refreshSequencersList());
appContext.setDependency('soundFunctions.showSequencerPanel', (point, sequencer) => sequencerUIManager.showSequencerPanel(point, sequencer));

appContext.setDependency('destroySound', destroySound);
appContext.setDependency('startLoopedPlayback', startLoopedPlayback);
appContext.setDependency('stopLoopedPlayback', stopLoopedPlayback);
appContext.setDependency('createFullSoundInstance', (data, options) => createFullSoundInstance(data, options));
appContext.setDependency('_upgradeSynthToPolyphonic', upgradeSynthToPolyphonic);
appContext.setDependency('updateAudio', updateAudio);
appContext.setDependency('initializeSynthParameters', initializeSynthParameters);
appContext.setDependency('getSynthCapabilities', getSynthCapabilities);
appContext.setDependency('autoLoadSoundFile', autoLoadSoundFile);
appContext.setDependency('_applySoundFilePlaybackParams', _applySoundFilePlaybackParams);
appContext.setDependency('_handleSoundFileModeChange', _handleSoundFileModeChange);
appContext.setDependency('setupRecording', setupRecording);
appContext.setDependency('setupStreamTesting', setupStreamTesting);
appContext.setDependency('loadServerSoundFile', loadServerSoundFile);

GeolocationManager.setContext(appContext);
DeviceOrientationManager.setContext(appContext);
SettingsManager.setContext(appContext);
WorkspaceManager.setContext(appContext);
setPackageExporterContext(appContext);
setPackageImporterContext(appContext);
setMenuTabsContext(appContext);
setHeaderBuilderContext(appContext);
setUIBuilderContext(appContext);
setParameterControlsContext(appContext);
setSoundCreationContext(appContext);
setAudioEngineContext(appContext);
setSoundLifecycleContext(appContext);
setParameterUpdaterContext(appContext);
setLFOProcessorContext(appContext);
setEchoManagerContext(appContext);
setDistanceSequencerContext(appContext);
setAudioUtilsContext(appContext);
setAudioSmootherContext(appContext);
setUIEventHandlersContext(appContext);
setStorageAdapterContext(appContext);
setDragHandlersContext(appContext);
setDrawingToolsContext(appContext);
setSoundDrawingToolsContext(appContext);
setShapeCreationMenuContext(appContext);
setLabelDragHandlerContext(appContext);
setRegistriesContext(appContext);
setLayerManagerContext(appContext);
setShapeManagerContext(appContext);
PathMenuManager.setContext(appContext);
SoundMenuManager.setContext(appContext);
UserMenuManager.setContext(appContext);
LayerMenuManager.setContext(appContext);
DialogManager.setContext(appContext);
setSelectionControllerContext(appContext);
setSelectionActionsContext(appContext);
setDragSelectHandlerContext(appContext);
setSelectionUIBuilderContext(appContext);
SelectionUIBuilder.initialize(map);

startAudioLoop();

const EVENT_HANDLERS = {
	map: {
		click: (e) => mapClickHandler(e, { map, addSound, renderControlPath })
	},
	'body:click,touchstart': {
		handler: unlockAudio,
		options: { once: true }
	},
	...createUIEventHandlers({
		saveWorkspaceSettings: () => WorkspaceManager.saveWorkspaceSettings(),
		initWorkspace: () => WorkspaceManager.initWorkspace(),
		updateWorkspaceUI: () => WorkspaceManager.updateWorkspaceUI(),
		addSideMenuCloseButtons,
		finishLinePath,
		finishPolygonPath,
		finishSoundLine,
		cancelPathDrawing,
		cancelSoundDrawing,
		saveSettings,
		loadSettings,
		showFileManagerDialog,
		clearAll,
		changeMapStyle,
		updateOSCStatus,
		stopSimulation,
		detachUserFromPath,
		getRouteAndAnimate,
		helperMenu,
		controlMenu,
		Menus
	})
};

EventBus.register(EVENT_HANDLERS, map);

function updateOSCStatus() {
	const status = document.getElementById('oscStatus');
	if (!status) return;

	const osc = appContext.OSCManager;
	if (!osc) return;

	const isConnected = osc.enabled && osc.ws && osc.ws.readyState === WebSocket.OPEN;

	if (isConnected) {
		status.textContent = '● Connected';
		status.className = 'osc-status-connected';
	} else {
		status.textContent = '○ Disconnected';
		status.className = 'osc-status-disconnected';
	}
}

if (AppState.intervals.oscStatus) {
	clearInterval(AppState.intervals.oscStatus);
}
AppState.intervals.oscStatus = setInterval(updateOSCStatus, 1000);

window.addEventListener('beforeunload', () => {
	if (AppState.intervals.oscStatus) {
		clearInterval(AppState.intervals.oscStatus);
	}
});

const visibilityState = {
	isVisible: !document.hidden,
	hiddenTimestamp: null
};

document.addEventListener('visibilitychange', () => {
	const wasVisible = visibilityState.isVisible;
	const isVisible = !document.hidden;
	visibilityState.isVisible = isVisible;

	if (!isVisible && wasVisible) {
		visibilityState.hiddenTimestamp = Date.now();

		requestAnimationFrame(() => {
			const hiddenDuration = Date.now() - visibilityState.hiddenTimestamp;
			if (hiddenDuration >= 100 && !visibilityState.isVisible) {
				Selectors.getSounds().forEach(sound => {
					if (sound.isPlaying) {
						if (sound.type === 'StreamPlayer') {
							appContext.StreamManager.stopStream(sound);
						} else {
							PolyphonyManager.release(sound);
						}
						sound.isPlaying = false;
					}
					sound.wasInsideArea = false;
				});
				Selectors.getSequencers().forEach(sequencer => {
					if (sequencer.enabled) {
						sequencer._releaseAllNotes();
					}
				});
				stopAudioLoop();
			}
		});
	} else if (isVisible && !wasVisible) {
		visibilityState.hiddenTimestamp = null;

		(async () => {
			if (Tone.context.state === 'closed') {
				await AudioContextManager.initialize();
				appContext.StreamManager.setAudioContext(AudioContextManager.nativeContext);
				if (appContext.AmbisonicsManager) {
					appContext.AmbisonicsManager.setAudioContext(AudioContextManager.nativeContext);
				}
				Selectors.getSounds().forEach(sound => {
					if (sound.type === 'StreamPlayer' && sound.params.streamUrl) {
						appContext.StreamManager.initializeStream(sound);
					}
				});
			}

			if (Tone.context.state === 'suspended') {
				const resumeOnInteraction = () => {
					Tone.start().then(() => {
						startAudioLoop();
						AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
					}).catch(e => {
						console.error("Failed to resume audio context:", e);
					});
				};
				document.addEventListener('click', resumeOnInteraction, { once: true, passive: true });
				document.addEventListener('touchstart', resumeOnInteraction, { once: true, passive: true });
				document.addEventListener('keydown', resumeOnInteraction, { once: true, passive: true });
			}

			startAudioLoop();
			AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
		})();
	}
});

const mapStyleSelect = document.getElementById('mapStyleSelect');
if (mapStyleSelect) mapStyleSelect.value = mapManager.getCurrentStyle();

GeolocationManager.init();
DeviceOrientationManager.init();
AppState.subscribe((action) => {
	switch (action.type) {
		case 'SOUND_NOTE_SELECTED':
		case 'SOUND_NOTE_DESELECTED': {
			const sound = AppState.getSound(action.payload.soundId);
			if (!sound) break;

			const userPos = GeolocationManager.getUserPosition();
			const isSelected = action.type === 'SOUND_NOTE_SELECTED';
			const isSamplerWithLoop = sound.type === 'Sampler' && sound.params.loop;

			if (action.payload.isGridSampler || isSamplerWithLoop || (sound.type === 'Sampler' && sound.params.samplerMode === 'single')) {
				if (sound.isPlaying && sound._speedGateOpen !== false) {
					PolyphonyManager.triggerPolyphonic(sound.synth, [action.payload.note], isSelected, sound);
				}
			} else {
				const isInside = userPos ? Geometry.isPointInShape(userPos, sound) : false;

				if (sound.synth.releaseAll) {
					sound.synth.releaseAll();
				} else {
					if (!isSelected && action.payload.note) {
						PolyphonyManager.triggerPolyphonic(sound.synth, [action.payload.note], false, sound);
					}
					if (sound.params.selectedNotes.length > 0) {
						PolyphonyManager.triggerPolyphonic(sound.synth, sound.params.selectedNotes, false, sound);
					}
				}

				const newNoteCount = sound.params.selectedNotes.length;
				if (newNoteCount > sound.params.polyphony) {
					sound.params.polyphony = newNoteCount;
					if (sound.type === 'Sampler' && sound.synth) {
						sound.synth.maxPolyphony = newNoteCount;
					} else {
						changeSoundType(sound, sound.type);
					}
				}

				if (isInside && sound.params.selectedNotes.length > 0) {
					PolyphonyManager.triggerPolyphonic(sound.synth, sound.params.selectedNotes, true, sound);
					sound.isPlaying = true;
				} else {
					sound.isPlaying = false;
				}
			}
			if (userPos && !AppState.audio.isRebuildingChains) {
				updateAudio(userPos);
			}

			break;
		}

		case 'SOUND_GRID_CLEARED': {
			const snd = AppState.getSound(action.payload.soundId);
			if (snd) changeSoundType(snd, 'Sampler');
			break;
		}

		case 'SOUND_TYPE_CHANGED': {
			const { sound } = action.payload;
			updateSoundLabel(sound, sound.label);

			let soundMenu = null;
			for (const menuData of Selectors.getMenus()) {
				const menuSoundId = menuData.menu?.dataset?.soundId;
				if (menuSoundId && parseInt(menuSoundId) === sound.id) {
					soundMenu = menuData.menu;
					break;
				}
			}

			if (soundMenu) {
				const container = soundMenu.querySelector('.params-container');
				const tabBar = soundMenu.querySelector('.tab-bar');
				const currentTab = Selectors.getCurrentTab() || 'sound';

				if (container && tabBar) {
					showMenuTab(sound, container, currentTab, tabBar);
				}

				const labelInput = soundMenu.querySelector('.context-menu-header-controls input[type="text"]');
				if (labelInput) {
					labelInput.value = sound.label;
				}

				const titleElement = soundMenu.querySelector('.menu-title');
				if (titleElement) {
					titleElement.textContent = `Sound Settings`;
				}
			}
			break;
		}

		case 'PARAMETER_CHANGED': {
			const { target, paramKey, value, options } = action.payload;

			if (target) {
				ParameterManager.setValue(target, paramKey, value, options);

				if (target.params && target.params.originalValues && target.params.originalValues[paramKey] !== undefined) {
					target.params.originalValues[paramKey] = value;
				}

				if (paramKey === 'speedGateMin' || paramKey === 'speedGateMax') {
					AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
				}
			}
			break;
		}

		case 'AUDIO_SPATIAL_MODE_CHANGED': {
			if (Selectors.getMenuCount() > 0) {
				const topMenu = Selectors.getTopMenu().menu;
				const titleEl = topMenu.querySelector('.menu-title');

				if (titleEl && titleEl.textContent === 'User Settings') {
					const rect = topMenu.getBoundingClientRect();
					const point = (rect.left >= 0 && rect.top >= 0) ? { x: rect.left, y: rect.top } :
						Selectors.getLastMenuPosition() || { x: 100, y: 100 };

					MenuManager.closeTop();
					showUserMenu(point);
				}
			}
			break;
		}

		case 'AUDIO_ECHO_UPDATE_REQUESTED': {
			const { sound, userPos } = action.payload;
			EchoManager.update(sound, userPos);
			break;
		}

		case 'STREAM_PLAYBACK_UPDATE': {
			const { sound, effectiveGain } = action.payload;
			if (effectiveGain > 0 && !sound.isPlaying) {
				if (sound.params.streamUrl && sound.streamStatus === 'stopped') {
					appContext.StreamManager.initializeStream(sound).then(() => {
						if (sound.streamStatus === 'ready') {
							appContext.StreamManager.playStream(sound);
						}
					});
				} else if (sound.streamStatus === 'ready') {
					appContext.StreamManager.playStream(sound);
				}
			} else if (effectiveGain === 0 && sound.isPlaying) {
				appContext.StreamManager.stopStream(sound);
			}
			sound.gain.gain.rampTo(effectiveGain, 0.1);
			break;
		}

		case 'GRANULAR_ADAPTIVE_SPEED_UPDATE': {
			const { sound } = action.payload;
			const userSpeed = getUserMovementSpeed();
			const grainSize = mapValue(
				userSpeed,
				CONSTANTS.GRANULAR_ADAPTIVE_SPEED_MIN,
				CONSTANTS.GRANULAR_ADAPTIVE_SPEED_MAX,
				CONSTANTS.GRANULAR_ADAPTIVE_GRAIN_SIZE_AT_MIN_SPEED,
				CONSTANTS.GRANULAR_ADAPTIVE_GRAIN_SIZE_AT_MAX_SPEED
			);
			const overlap = grainSize * CONSTANTS.GRANULAR_ADAPTIVE_OVERLAP_FACTOR;
			const grainSizeMin = PARAMETER_REGISTRY.grainSize.min || 0.01;
			const grainSizeMax = PARAMETER_REGISTRY.grainSize.max || 0.5;
			const overlapMin = PARAMETER_REGISTRY.overlap.min || 0.01;
			const overlapMax = PARAMETER_REGISTRY.overlap.max || 0.2;
			sound.synth.grainSize = Math.max(grainSizeMin, Math.min(grainSizeMax, grainSize));
			sound.synth.overlap = Math.max(overlapMin, Math.min(overlapMax, overlap));
			break;
		}

		case 'OSC_USER_POSITION_UPDATE': {
			const { userPos, userDirection } = action.payload;
			appContext.OSCManager.send('/geobuzz/user/lat', userPos.lat);
			appContext.OSCManager.send('/geobuzz/user/lng', userPos.lng);
			appContext.OSCManager.send('/geobuzz/user/direction', userDirection);
			break;
		}

		case 'OSC_SOUND_UPDATE': {
			const { sound, soundPos, userPos, userDirection } = action.payload;
			if (!userPos || !soundPos) break;

			const relativePos = appContext.OSCManager.calculateRelativeXY(
				userPos,
				userDirection,
				soundPos
			);

			// Send spatial positioning
			if (relativePos && typeof relativePos.x === 'number' && typeof relativePos.y === 'number' && typeof relativePos.distance === 'number') {
				appContext.OSCManager.send(appContext.OSCManager.buildAddress(sound, 'x'), relativePos.x);
				appContext.OSCManager.send(appContext.OSCManager.buildAddress(sound, 'y'), relativePos.y);
				appContext.OSCManager.send(appContext.OSCManager.buildAddress(sound, 'distance'), relativePos.distance);
			}

			// Send other parameters
			appContext.OSCManager.send(appContext.OSCManager.buildAddress(sound, 'gain'), sound.gain.gain.value);
			appContext.OSCManager.send(appContext.OSCManager.buildAddress(sound, 'lat'), soundPos.lat);
			appContext.OSCManager.send(appContext.OSCManager.buildAddress(sound, 'lng'), soundPos.lng);

			appContext.OSCManager.sendSoundEchoes(sound, userPos, userDirection);
			break;
		}

		case 'SOUND_ADDED': {
			refreshElementsList();
			WorkspaceManager.updateMenuCounts();
			AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
			break;
		}

		case 'SOUND_REMOVED': {
			refreshElementsList();
			WorkspaceManager.updateMenuCounts();
			closeAllMenus();
			break;
		}


		case 'AUDIO_UPDATE_REQUESTED': {
			if (AppState.audio.isRebuildingChains) break;

			const userPos = GeolocationManager.getUserPosition();
			if (userPos) updateAudio(userPos, Tone.now());
			break;
		}

		case 'USER_POSITION_CHANGED': {
			if (AppState.audio.isRebuildingChains) break;

			const { position } = action.payload;
			updateAudio(position, Tone.now());
			break;
		}

		case 'LAYER_REMOVED': {
			const { layerId } = action.payload;

			const menusToClose = Selectors.getMenus().filter(menuData =>
				menuData.menu.dataset?.layerId === layerId
			);

			menusToClose.forEach(menuData => {
				MenuManager.close(menuData.menu);
			});

			break;
		}
	}
});
refreshElementsList();

// Export for module system (application auto-initializes on import)
export default {
	initialized: true
};