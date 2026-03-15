import { CONSTANTS } from '../constants.js';

export class StateManager {
	constructor() {
		this.data = {
			sounds: [],
			controlPaths: [],
			sequencers: []
		};

		this._soundsMap = new Map();
		this._pathsMap = new Map();
		this._sequencersMap = new Map();
		this._subscribers = [];

		this.workspace = {
			id: null,
			isAudioReady: false,
			isInitializing: false,
			mediaRecorder: null,
			audioChunks: [],
			lastSavedState: null
		};

		this.ui = {
			menus: [],
			colorIndex: 0,
			menuState: {
				currentTab: 'sound',
				dragOffset: { x: 0, y: 0 },
				isDragging: false,
				lastMenuPosition: null,
				expandedSections: {},
				activeSideMenu: null
			},
			isDraggingMarker: false,
			justDraggedMarker: false,
			draggingPath: false,
			justDraggedPath: false,
			justCreatedPath: false
		};

		this.audio = {
			spatialMode: 'off',
			userDirection: 0,
			isRebuildingChains: false,
			ambisonics: {
				scene: null,
				decoder: null,
				sources: new Map()
			}
		};

		this.drawing = {
			mode: null,
			currentPathPoints: [],
			tempPathLine: null,
			drawingIndicator: null,
			pathCount: 0,
			tempMarkers: [],
			currentSoundPoints: [],
			tempSoundLine: null,
			tempSoundMarkers: [],
			pendingSoundColor: null
		};

		this.simulation = {
			isActive: false,
			isPlacingTarget: false,
			targetMarker: null,
			route: {
				points: [],
				totalDistance: 0
			},
			speedKmh: 5,
			animationState: {
				startTime: 0,
				frameId: null,
				lastUpdateTime: 0
			},
			userAttachedPathId: null,
			userPathAnimationState: {
				frameId: null,
				startTime: 0,
				distance: 0,
				direction: 1,
				behavior: 'forward'
			}
		};

		this.intervals = {
			oscStatus: null,
			autosave: null,
			audioUpdate: null
		};

		this.counters = {
			synth: 0,
			amSynth: 0,
			fmSynth: 0,
			fatOscillator: 0,
			noiseSynth: 0,
			soundFile: 0,
			streamPlayer: 0,
			modulator: 0,
			silencer: 0,
			sampler: 0
		};

		this.customization = {
			parameterRanges: {}
		};

		this.selection = {
			selectedSounds: [],
			selectedPaths: [],
			selectedSequencers: [],
			selectedLayers: [],
			mode: null,
			isMoving: false,
			layerTypePreferences: {}
		};

		this._saveWorkspaceCallback = null;
	}

	setSaveCallback(callback) {
		this._saveWorkspaceCallback = callback;
	}

	dispatch(action) {
		this._handleAction(action);
		this._notifySubscribers(action);

		if (this._shouldTriggerSave(action.type)) {
			this._debouncedSave();
		}
	}

	_shouldTriggerSave(actionType) {
		const saveActions = [
			'PARAMETER_CHANGED',
			'SOUND_ADDED',
			'SOUND_REMOVED',
			'SOUND_UPDATED',
			'SOUND_TYPE_CHANGED',
			'SOUND_NOTE_SELECTED',
			'SOUND_NOTE_DESELECTED',
			'SOUND_NOTES_CLEARED',
			'SOUND_GRID_CLEARED',
			'PATH_ADDED',
			'PATH_REMOVED',
			'PATH_UPDATED',
			'SEQUENCER_ADDED',
			'SEQUENCER_REMOVED',
			'SEQUENCER_UPDATED',
			'LAYER_ADDED',
			'LAYER_REMOVED',
			'UI_MARKER_DRAG_ENDED',
			'UI_PATH_DRAG_ENDED',
			'AUDIO_SPATIAL_MODE_CHANGED',
			'AUDIO_SMOOTHING_CHANGED',
			'PARAMETER_RANGE_CUSTOMIZED',
			'PARAMETER_RANGE_RESET',
			'ALL_PARAMETER_RANGES_RESET'
		];
		return saveActions.includes(actionType);
	}

	_debouncedSave = (() => {
		let timeoutId = null;
		return () => {
			if (timeoutId) clearTimeout(timeoutId);
			timeoutId = setTimeout(() => {
				if (this._saveWorkspaceCallback) {
					this._saveWorkspaceCallback();
				}
			}, 1000);
		};
	})();

	subscribe(callback) {
		this._subscribers.push(callback);
		return () => {
			this._subscribers = this._subscribers.filter(cb => cb !== callback);
		};
	}

	_handleAction(action) {
		switch (action.type) {
			case 'UI_MENU_OPENED':
				this.ui.menus.push(action.payload);
				break;

			case 'UI_MENU_CLOSED_TOP':
				this.ui.menus.pop();
				break;

			case 'UI_SIDE_MENU_TOGGLED':
				if (action.payload.wasActive) {
					this.ui.menuState.activeSideMenu = null;
				} else {
					this.ui.menuState.activeSideMenu = action.payload.menu;
				}
				break;

			case 'SOUND_NOTE_SELECTED':
				const sound = this.getSound(action.payload.soundId);
				if (sound) {
					sound.params.selectedNotes.push(action.payload.note);
					sound.frequencyMode = false;
					sound.lastTouchedParam = 'keyboard';
				}
				break;

			case 'SOUND_NOTE_DESELECTED':
				const snd = this.getSound(action.payload.soundId);
				if (snd) {
					snd.params.selectedNotes = snd.params.selectedNotes.filter(
						n => n !== action.payload.note
					);
					snd.lastTouchedParam = 'keyboard';
				}
				break;

			case 'SOUND_NOTES_CLEARED':
				const s = this.getSound(action.payload.soundId);
				if (s) {
					s.params.selectedNotes = [];
				}
				break;

			case 'SOUND_GRID_CLEARED':
				const snd2 = this.getSound(action.payload.soundId);
				if (snd2) {
					snd2.params.gridSamples = {};
				}
				break;

			case 'DRAWING_MODE_CHANGED':
				this.drawing.mode = action.payload.mode;
				break;

			case 'SIMULATION_STARTED':
				this.simulation.isActive = true;
				break;

			case 'SIMULATION_STOPPED':
				this.simulation.isActive = false;
				this.simulation.isPlacingTarget = false;
				break;

			case 'SIMULATION_PLACEMENT_STARTED':
				this.simulation.isPlacingTarget = true;
				break;

			case 'SIMULATION_PLACEMENT_STOPPED':
				this.simulation.isPlacingTarget = false;
				break;

			case 'UI_MARKER_DRAG_STARTED':
				this.ui.isDraggingMarker = true;
				break;

			case 'UI_MARKER_DRAG_ENDED':
				this.ui.isDraggingMarker = false;
				break;

			case 'UI_PATH_DRAG_STARTED':
				this.ui.draggingPath = true;
				break;

			case 'UI_PATH_DRAG_ENDED':
				this.ui.draggingPath = false;
				break;

			case 'AUDIO_MODE_CHANGED':
				this.audio.spatialMode = action.payload.mode;
				break;

			case 'AUDIO_READY':
				this.workspace.isAudioReady = true;
				break;

			case 'SOUND_ADDED':
				this.data.sounds.push(action.payload.sound);
				this._soundsMap.set(action.payload.sound.id, action.payload.sound);
				break;

			case 'SOUND_REMOVED':
				const removedSound = this._soundsMap.get(action.payload.sound.id);
				if (removedSound) {
					const idx = this.data.sounds.indexOf(removedSound);
					if (idx !== -1) this.data.sounds.splice(idx, 1);
					this._soundsMap.delete(action.payload.sound.id);
				}
				break;

			case 'PATH_ADDED':
				this.data.controlPaths.push(action.payload.path);
				this._pathsMap.set(action.payload.path.id, action.payload.path);
				break;

			case 'PATH_REMOVED':
				const removedPath = this._pathsMap.get(action.payload.id);
				if (removedPath) {
					const idx = this.data.controlPaths.indexOf(removedPath);
					if (idx !== -1) this.data.controlPaths.splice(idx, 1);
					this._pathsMap.delete(action.payload.id);
				}
				break;

			case 'SEQUENCER_ADDED':
				this.data.sequencers.push(action.payload.sequencer);
				this._sequencersMap.set(action.payload.sequencer.id, action.payload.sequencer);
				break;

			case 'SEQUENCER_REMOVED':
				const removedSeq = this._sequencersMap.get(action.payload.id);
				if (removedSeq) {
					const idx = this.data.sequencers.indexOf(removedSeq);
					if (idx !== -1) this.data.sequencers.splice(idx, 1);
					this._sequencersMap.delete(action.payload.id);
				}
				break;

			case 'PARAMETER_RANGE_CUSTOMIZED':
				const { paramKey, customRange } = action.payload;
				if (Object.keys(customRange).length === 0) {
					delete this.customization.parameterRanges[paramKey];
				} else {
					this.customization.parameterRanges[paramKey] = { ...customRange };
				}
				break;

			case 'PARAMETER_RANGE_RESET':
				delete this.customization.parameterRanges[action.payload.paramKey];
				break;

			case 'ALL_PARAMETER_RANGES_RESET':
				this.customization.parameterRanges = {};
				break;

			case 'SELECTION_ADD':
				if (action.payload.elementType === 'sound') {
					if (!this.selection.selectedSounds.includes(action.payload.id)) {
						this.selection.selectedSounds.push(action.payload.id);
					}
				} else if (action.payload.elementType === 'path') {
					if (!this.selection.selectedPaths.includes(action.payload.id)) {
						this.selection.selectedPaths.push(action.payload.id);
					}
				} else if (action.payload.elementType === 'sequencer') {
					if (!this.selection.selectedSequencers.includes(action.payload.id)) {
						this.selection.selectedSequencers.push(action.payload.id);
					}
				}
				break;

			case 'SELECTION_REMOVE':
				if (action.payload.elementType === 'sound') {
					this.selection.selectedSounds = this.selection.selectedSounds.filter(id => id !== action.payload.id);
				} else if (action.payload.elementType === 'path') {
					this.selection.selectedPaths = this.selection.selectedPaths.filter(id => id !== action.payload.id);
				} else if (action.payload.elementType === 'sequencer') {
					this.selection.selectedSequencers = this.selection.selectedSequencers.filter(id => id !== action.payload.id);
				}
				break;

			case 'SELECTION_CLEAR':
				this.selection.selectedSounds = [];
				this.selection.selectedPaths = [];
				this.selection.selectedSequencers = [];
				this.selection.selectedLayers = [];
				break;

			case 'SELECTION_SET_ALL':
				this.selection.selectedSounds = action.payload.sounds || [];
				this.selection.selectedPaths = action.payload.paths || [];
				this.selection.selectedSequencers = action.payload.sequencers || [];
				break;

			case 'SELECTION_MODE_CHANGED':
				this.selection.mode = action.payload.mode;
				break;

			case 'SELECTION_MOVE_STARTED':
				this.selection.isMoving = true;
				break;

			case 'SELECTION_MOVE_ENDED':
				this.selection.isMoving = false;
				break;

			case 'SELECTION_LAYER_PREFS_SET':
				this.selection.layerTypePreferences[action.payload.layerId] = action.payload.types;
				break;

			case 'SELECTION_LAYER_TOGGLE':
				const layerId = action.payload.layerId;
				const idx = this.selection.selectedLayers.indexOf(layerId);
				if (idx === -1) {
					this.selection.selectedLayers.push(layerId);
				} else {
					this.selection.selectedLayers.splice(idx, 1);
				}
				break;
		}
	}

	_notifySubscribers(action) {
		this._subscribers.forEach(cb => cb(action));
	}

	getSound(id) {
		return this._soundsMap.get(id);
	}

	getSoundByPersistentId(persistentId) {
		return this.data.sounds.find(s => s.persistentId === persistentId);
	}

	getPath(id) {
		return this._pathsMap.get(id);
	}

	getSequencer(id) {
		return this._sequencersMap.get(id);
	}

	rebuildIndexes() {
		this._soundsMap.clear();
		this._pathsMap.clear();
		this._sequencersMap.clear();
		this.data.sounds.forEach(s => this._soundsMap.set(s.id, s));
		this.data.controlPaths.forEach(p => this._pathsMap.set(p.id, p));
		this.data.sequencers.forEach(seq => this._sequencersMap.set(seq.id, seq));
	}

	getAutoName(type, role, shouldIncrement = false) {
		switch (type) {
			case "Synth":
				if (shouldIncrement) this.counters.synth++;
				return `Synth #${this.counters.synth + (shouldIncrement ? 0 : 1)}`;
			case "AMSynth":
				if (shouldIncrement) this.counters.amSynth++;
				return `AM Synth #${this.counters.amSynth + (shouldIncrement ? 0 : 1)}`;
			case "FMSynth":
				if (shouldIncrement) this.counters.fmSynth++;
				return `FM Synth #${this.counters.fmSynth + (shouldIncrement ? 0 : 1)}`;
			case "FatOscillator":
				if (shouldIncrement) this.counters.fatOscillator++;
				return `Fat Osc #${this.counters.fatOscillator + (shouldIncrement ? 0 : 1)}`;
			case "NoiseSynth":
				if (shouldIncrement) this.counters.noiseSynth++;
				return `Noise #${this.counters.noiseSynth + (shouldIncrement ? 0 : 1)}`;
			case "SoundFile":
				if (shouldIncrement) this.counters.soundFile++;
				return `Sound File #${this.counters.soundFile + (shouldIncrement ? 0 : 1)}`;
			case "StreamPlayer":
				if (shouldIncrement) this.counters.streamPlayer++;
				return `Stream #${this.counters.streamPlayer + (shouldIncrement ? 0 : 1)}`;
			case "Sampler":
				if (shouldIncrement) this.counters.sampler++;
				return `Sampler #${this.counters.sampler + (shouldIncrement ? 0 : 1)}`;
			default:
				return "Untitled";
		}
	}

	resetCounters() {
		for (let key in this.counters) {
			this.counters[key] = 0;
		}
		this.drawing.pathCount = 0;
		this.drawing.sequencerCount = 0;
	}

	getNextColor() {
		const color = CONSTANTS.ELEMENT_COLORS[this.ui.colorIndex % CONSTANTS.ELEMENT_COLORS.length];
		this.ui.colorIndex++;
		return color;
	}
}

export const AppState = new StateManager();
