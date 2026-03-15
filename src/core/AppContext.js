export class AppContext {
	constructor() {
		this.map = null;
		this.mapManager = null;
		this.Selectors = null;
		this.Actions = null;
		this.CONSTANTS = null;
		this.DragHandlers = null;
		this.CoordinateTransform = null;
		this.PathEditor = null;
		this.PARAMETER_REGISTRY = null;
		this.DistanceSequencer = null;
		this.PathZoneChecker = null;
		this.SequencerUIManager = null;
		this.CATEGORY_REGISTRY = null;
		this.SHAPE_REGISTRY = null;
		this.SYNTH_REGISTRY = null;
		this.FX_REGISTRY = null;
		this.FXParamSets = null;
		this.tileLayers = null;
		this.UIBuilder = null;
		this.Menus = null;
		this.AudioContextManager = null;
		this.L = null;
		this.NoteManager = null;
		this.OSCManager = null;
		this.AmbisonicsManager = null;
		this.PolyphonyManager = null;
		this.StreamManager = null;
		this.FXManager = null;
		this.EchoManager = null;
		this.ParameterManager = null;
		this.AudioChainManager = null;
		this.GeolocationManager = null;
		this.DeviceOrientationManager = null;
		this.ElementFactory = null;
		this.ShapeManager = null;
		this.Geometry = null;
		this.AppState = null;
		this.Security = null;
		this.Backend = null;
		this.LayerManager = null;
		this.MenuManager = null;
		this.ModalSystem = null;
		this.AudioNodeManager = null;
		this.WorkspaceManager = null;
		this.isFileSynth = null;
		this.hasKeyboard = null;
		this.getParametersForSynth = null;
		this.getAvailableSynthTypes = null;
		this.getAvailableFXTypes = null;
		this.getSynthCapabilities = null;
		this.initializeSynthParameters = null;
		this.changeSoundType = null;
		this.showMenuTab = null;
		this.showFileManagerDialog = null;
		this.showGridSampleDialog = null;
		this.showSoundMenu = null;
		this.showPathMenu = null;
		this.changeFX = null;
		this.changeLayerFX = null;
		this.getEffectParameters = null;
		this.getAvailableModulationTargets = null;
		this._handleSoundFileModeChange = null;
		this.computePathLength = null;
		this.updatePathVisibility = null;
		this.deleteSound = null;
		this.duplicateSound = null;
		this.duplicateLayer = null;
		this.updateSpatialAudio = null;
		this.setSpatialMode = null;
		this.setSoundPannerType = null;
		this.updateSoundLabel = null;
		this.createParameterControl = null;
		this.unlockAudio = null;
		this.ensureAudioContext = null;
		this.addEventHandlers = null;
		this.restoreFXChain = null;
		this.autoLoadSoundFile = null;
		this._applySoundFilePlaybackParams = null;
		this.processLFOs = null;
		this.processPathLFOs = null;
		this.createLayerEQNode = null;
		this.createLayerFXNodes = null;
		this.getUserMovementSpeed = null;
		this.calculatePathGain = null;
		this.generateOvalPoints = null;
		this.getSmoothedPathPoints = null;
		this.getOffsetPolyline = null;
		this.calcGain = null;
		this.calculateRelativePosition = null;
		this.calculateBearingPan = null;
		this.createFullSoundInstance = null;
		this._upgradeSynthToPolyphonic = null;
		this.midiToNoteName = null;
		this.waitForNextFrame = null;
		this.updateSynthParam = null;
		this.updateAudio = null;
		this.updateLayerFXChain = null;
		this.updateSoundPositionOnPath = null;
		this.destroySound = null;
		this.startLoopedPlayback = null;
		this.stopLoopedPlayback = null;
		this.startSimulationPlacement = null;
		this.attachUserToPath = null;
		this.detachUserFromPath = null;
		this.setupRecording = null;
		this.setupStreamTesting = null;
		this.loadServerSoundFile = null;

		this.fxStructures = {
			fx: null,
			eq: null
		};
		this.audioFunctions = {
			updateAudio: null,
			resetAreaTracking: null,
			showUserMenu: null,
			attachDragHandlers: null,
			destroySound: null,
			startLoopedPlayback: null,
			stopLoopedPlayback: null,
			upgradeSynthToPolyphonic: null,
			triggerPlayback: null,
			reconnectSoundToLayers: null,
			loadSound: null,
			createControlPath: null,
			createLayerFXNodes: null,
			showSequencerPanel: null,
			refreshSequencersList: null,
			refreshElementsList: null,
			closeAllMenus: null,
			refreshPathsList: null,
			saveWorkspaceSettings: null
		};
		this.simulationFunctions = {
			stopSimulation: null,
			detachUserFromPath: null
		};
		this.SelectionController = null;
		this.SelectionActions = null;
		this.utils = {
			deepClone: null
		};
	}

	initialize(config) {
		if (config.core) Object.assign(this, config.core);
		if (config.fxStructures) Object.assign(this.fxStructures, config.fxStructures);
		if (config.audioFunctions) Object.assign(this.audioFunctions, config.audioFunctions);
		if (config.soundFunctions) Object.assign(this, config.soundFunctions);
		if (config.pathFunctions) Object.assign(this, config.pathFunctions);
		if (config.sequencerFunctions) Object.assign(this, config.sequencerFunctions);
		if (config.layerFunctions) Object.assign(this, config.layerFunctions);
		if (config.simulationFunctions) Object.assign(this.simulationFunctions, config.simulationFunctions);
		if (config.workspaceFunctions) Object.assign(this, config.workspaceFunctions);
		if (config.mapFunctions) Object.assign(this, config.mapFunctions);
		if (config.utils) Object.assign(this.utils, config.utils);
		if (config.validation) Object.assign(this, config.validation);
		if (config.api) Object.assign(this, config.api);
		if (config.defaults) Object.assign(this, config.defaults);

		if (config.managers) Object.assign(this, config.managers);
		if (config.functions) Object.assign(this, config.functions);
		if (config.typeChecks) Object.assign(this, config.typeChecks);
		if (config.uiFunctions) Object.assign(this, config.uiFunctions);
		if (config.audioHelpers) Object.assign(this, config.audioHelpers);
		if (config.spatialFunctions) Object.assign(this, config.spatialFunctions);
		if (config.registries) Object.assign(this, config.registries);
		if (config.security) Object.assign(this, config.security);
		if (config.ui) Object.assign(this, config.ui);
		if (config.persistence) Object.assign(this, config.persistence);
		if (config.events) Object.assign(this, config.events);
		if (config.interactions) Object.assign(this, config.interactions);
		if (config.menuTabs) this.menuTabs = config.menuTabs;
		if (config.selection) {
			this.SelectionController = config.selection.controller;
			this.SelectionActions = config.selection.actions;
		}
	}

	setDependency(key, value) {
		if (key.includes('.')) {
			const [parent, child] = key.split('.');
			if (this[parent]) {
				this[parent][child] = value;
			}
		} else {
			this[key] = value;
		}
	}

	get(key) {
		if (key.includes('.')) {
			const [parent, child] = key.split('.');
			return this[parent]?.[child];
		}
		return this[key];
	}
}

export const appContext = new AppContext();
