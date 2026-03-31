// API Layer
import { Security, SecurityManager } from './api/SecurityManager.js';
import { Backend } from './api/Backend.js';
import { WorkspaceAPI } from './api/WorkspaceAPI.js';
import { FilesAPI } from './api/FilesAPI.js';

// Core imports
import { CONSTANTS, COLORS, PATH_COLORS } from './core/constants.js';
import { AppState, StateManager } from './core/state/StateManager.js';
import { Selectors } from './core/state/selectors.js';
import { Actions, ActionTypes } from './core/state/actions.js';
import { toRadians, toDegrees, deepClone, setTemporaryFlag, isCircularPath, mapValue } from './core/utils/math.js';
import { debounce, throttle } from './core/utils/debounce.js';
import { isValidLatLon, isValidMarker, isValidSound, isValidControlPath, isValidSequencer, clampNumber } from './core/utils/validation.js';
import { CoordinateTransform } from './core/utils/coordinates.js';
import { isFileSynth, hasKeyboard, isGranularMode, isLinearPath } from './core/utils/typeChecks.js';
import { delay, waitForNextFrame } from './core/utils/async.js';
import { midiToNoteName } from './core/utils/audioHelpers.js';
import { createElement, createButton, createSelect } from './ui/domHelpers.js';
import { CATEGORY_REGISTRY, tileLayers, SHAPE_REGISTRY, FXParamSets } from './config/registries.js';
import { DEFAULT_LFO_STRUCTURE, DEFAULT_FX_STRUCTURE, DEFAULT_EQ_STRUCTURE, DEFAULT_SEQUENCER_CONFIG, DEFAULT_CONTROL_PATH_CONFIG, DEFAULT_MARKER_CONFIG } from './config/defaults.js';
import { AudioNodeManager, PolyphonyManager } from './core/audio/AudioNodeManager.js';
import { StreamManager } from './core/audio/StreamManager.js';
import { AmbisonicsManager } from './core/audio/AmbisonicsManager.js';
import { SYNTH_REGISTRY, FX_REGISTRY, getSynthCapabilities, getParametersForSynth, getAvailableSynthTypes, initializeSynthParameters } from './core/audio/SynthRegistry.js';
import { DistanceSequencer } from './core/audio/DistanceSequencer.js';
import { EchoManager } from './core/audio/EchoManager.js';
import { calculateBearing, calcGain, calculatePathGain, calculateRelativePosition, calculateBearingPan } from './core/audio/audioUtils.js';
import { destroySound, startLoopedPlayback, stopLoopedPlayback, upgradeSynthToPolyphonic, triggerPlayback } from './core/audio/SoundLifecycle.js';
import { updateSynthParam, updatePartials } from './core/audio/ParameterUpdater.js';
import { createSoundObject, createFullSoundInstance, addSound, loadSound } from './core/audio/SoundCreation.js';
import { updateAudio, audioUpdateLoop, getUserMovementSpeed, getTotalDistanceTraveled, resetTotalDistance, startAudioLoop, stopAudioLoop } from './core/audio/AudioEngine.js';
import { processLFOs, processPathLFOs } from './core/audio/LFOProcessor.js';
import { FXManager, createEffect, createLayerFXNodes } from './core/audio/FXManager.js';
import { AudioChainManager, updateFXChain, updateLayerFXChain } from './core/audio/AudioChainManager.js';
import { PARAMETER_REGISTRY, generateLFOWaveform } from './config/parameterRegistry.js';
import { Geometry } from './core/geospatial/Geometry.js';
import { PathZoneChecker } from './core/geospatial/PathZoneChecker.js';
import { KalmanFilter } from './core/geospatial/KalmanFilter.js';
import { GeolocationManager } from './core/geospatial/GeolocationManager.js';
import { DeviceOrientationManager } from './core/geospatial/DeviceOrientationManager.js';
import { OSCManager } from './debug/OSCManager.js';
import { ModalSystem } from './ui/ModalSystem.js';
import { MenuManager } from './ui/controllers/MenuManager.js';
import { createDraggableHeader, createElementNavigationDropdown, createCloseButton } from './ui/controllers/HeaderBuilder.js';
import { createParameterControl, updateFrequencyModeIndicators, updateNodeParameter } from './ui/controllers/ParameterControls.js';
import { UIBuilder, createCollapsibleSection, createColorPicker, createHeaderControls, createParamsContainer, createActionButtons, createSpatialSection, createExitBehaviorDropdown, createVolumeModelDropdown, createIconPlacementDropdown, createMenuStructure, createSourceTypeDropdown, createRoleDropdown, createShapeDropdown, createPanningDropdown, createLabelInput, createTabBar, createDeleteButton, createSwitch, createRadioButton, addSideMenuCloseButtons } from './ui/controllers/UIBuilder.js';
import { MapManager } from './map/MapManager.js';
import { ShapeManager } from './shapes/ShapeManager.js';
import { LayerManager } from './layers/LayerManager.js';
import { DragHandlers } from './interactions/DragHandlers.js';
import { LabelDragHandler } from './interactions/LabelDragHandler.js';
import { attachDragHandlers } from './interactions/attachDragHandlers.js';
import { startPolygonPathDrawing, startOvalPathDrawing, startLinePathDrawing, startCirclePathDrawing, finishPolygonPath, finishOvalPath, finishLinePath, finishCirclePath, cancelPathDrawing, showDrawingIndicator, hideDrawingIndicator } from './interactions/DrawingTools.js';
import * as PathFactory from './paths/PathFactory.js';
import * as PathRenderer from './paths/PathRenderer.js';
import * as PathEditor from './paths/PathEditor.js';
import { SimulationController } from './simulation/SimulationController.js';
import { RouteAnimator } from './simulation/RouteAnimator.js';
import { SettingsManager } from './persistence/SettingsManager.js';
import { StorageAdapter } from './persistence/StorageAdapter.js';
import { PackageExporter } from './persistence/PackageExporter.js';
import { PackageImporter } from './persistence/PackageImporter.js';
import { EventBus } from './events/EventBus.js';
import { mapClickHandler } from './events/MapEventHandler.js';
import { createUIEventHandlers, unlockAudio } from './events/UIEventHandler.js';
import { MenuTabs } from './ui/components/MenuTabsRegistry.js';

// Application Bootstrap (auto-initializes on import)
import Application from './core/Application.js';
import { appContext } from './core/AppContext.js';

export const GeoBuzz = {
	version: '1.0.0-modular',

	context: appContext,

	api: {
		Security,
		SecurityManager,
		Backend,
		WorkspaceAPI,
		FilesAPI
	},

	state: {
		AppState,
		Selectors,
		Actions,
		ActionTypes
	},

	constants: {
		CONSTANTS,
		COLORS,
		PATH_COLORS
	},

	utils: {
		toRadians,
		toDegrees,
		deepClone,
		setTemporaryFlag,
		isCircularPath,
		mapValue,
		debounce,
		throttle,
		isValidLatLon,
		isValidMarker,
		isValidSound,
		isValidControlPath,
		isValidSequencer,
		clampNumber,
		CoordinateTransform,
		isFileSynth,
		hasKeyboard,
		isGranularMode,
		isLinearPath,
		delay,
		waitForNextFrame,
		midiToNoteName,
		createElement,
		createButton,
		createSelect
	},

	config: {
		CATEGORY_REGISTRY,
		tileLayers,
		SHAPE_REGISTRY,
		FXParamSets,
		DEFAULT_LFO_STRUCTURE,
		DEFAULT_FX_STRUCTURE,
		DEFAULT_EQ_STRUCTURE,
		DEFAULT_SEQUENCER_CONFIG,
		DEFAULT_CONTROL_PATH_CONFIG,
		DEFAULT_MARKER_CONFIG,
		PARAMETER_REGISTRY,
		generateLFOWaveform
	},

	audio: {
		AudioNodeManager,
		PolyphonyManager,
		StreamManager: new StreamManager(),
		AmbisonicsManager: new AmbisonicsManager(),
		SYNTH_REGISTRY,
		FX_REGISTRY,
		getSynthCapabilities,
		getParametersForSynth,
		getAvailableSynthTypes,
		initializeSynthParameters,
		DistanceSequencer,
		EchoManager,
		calculateBearing,
		calcGain,
		calculatePathGain,
		calculateRelativePosition,
		calculateBearingPan,
		destroySound,
		startLoopedPlayback,
		stopLoopedPlayback,
		upgradeSynthToPolyphonic,
		triggerPlayback,
		updateSynthParam,
		updatePartials,
		createSoundObject,
		createFullSoundInstance,
		addSound,
		loadSound,
		updateAudio,
		audioUpdateLoop,
		getUserMovementSpeed,
		getTotalDistanceTraveled,
		resetTotalDistance,
		startAudioLoop,
		stopAudioLoop,
		processLFOs,
		processPathLFOs,
		FXManager,
		AudioChainManager,
		createEffect,
		createLayerFXNodes,
		updateFXChain,
		updateLayerFXChain
	},

	geospatial: {
		Geometry,
		PathZoneChecker,
		KalmanFilter,
		GeolocationManager,
		DeviceOrientationManager
	},

	debug: {
		OSCManager: new OSCManager()
	},

	ui: {
		ModalSystem,
		MenuManager,
		MenuTabs,
		createDraggableHeader,
		createElementNavigationDropdown,
		createCloseButton,
		createParameterControl,
		updateFrequencyModeIndicators,
		updateNodeParameter,
		UIBuilder,
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
		addSideMenuCloseButtons
	},

	map: {
		MapManager: new MapManager()
	},

	shapes: {
		ShapeManager
	},

	layers: {
		LayerManager
	},

	interactions: {
		DragHandlers,
		LabelDragHandler,
		attachDragHandlers,
		startPolygonPathDrawing,
		startOvalPathDrawing,
		startLinePathDrawing,
		startCirclePathDrawing,
		finishPolygonPath,
		finishOvalPath,
		finishLinePath,
		finishCirclePath,
		cancelPathDrawing,
		showDrawingIndicator,
		hideDrawingIndicator
	},

	paths: {
		factory: PathFactory,
		renderer: PathRenderer,
		editor: PathEditor
	},

	simulation: {
		controller: SimulationController,
		animator: RouteAnimator
	},

	persistence: {
		SettingsManager,
		StorageAdapter,
		PackageExporter,
		PackageImporter
	},

	events: {
		EventBus,
		mapClickHandler,
		createUIEventHandlers,
		unlockAudio
	},

	initialized: true,

	getState() {
		return AppState.data;
	},

	dispatch(action) {
		return AppState.dispatch(action);
	},

	subscribe(callback) {
		return AppState.subscribe(callback);
	}
};

// Export GeoBuzz to window for external access
if (typeof window !== 'undefined') {
	window.GeoBuzz = GeoBuzz;
}

export default GeoBuzz;
