export const ActionTypes = {
	UI_MENU_OPENED: 'UI_MENU_OPENED',
	UI_MENU_CLOSED_TOP: 'UI_MENU_CLOSED_TOP',
	UI_SIDE_MENU_TOGGLED: 'UI_SIDE_MENU_TOGGLED',
	UI_MARKER_DRAG_STARTED: 'UI_MARKER_DRAG_STARTED',
	UI_MARKER_DRAG_ENDED: 'UI_MARKER_DRAG_ENDED',
	UI_PATH_DRAG_STARTED: 'UI_PATH_DRAG_STARTED',
	UI_PATH_DRAG_ENDED: 'UI_PATH_DRAG_ENDED',

	SOUND_ADDED: 'SOUND_ADDED',
	SOUND_REMOVED: 'SOUND_REMOVED',
	SOUND_UPDATED: 'SOUND_UPDATED',
	SOUND_TYPE_CHANGED: 'SOUND_TYPE_CHANGED',
	SOUND_NOTE_SELECTED: 'SOUND_NOTE_SELECTED',
	SOUND_NOTE_DESELECTED: 'SOUND_NOTE_DESELECTED',
	SOUND_NOTES_CLEARED: 'SOUND_NOTES_CLEARED',
	SOUND_GRID_CLEARED: 'SOUND_GRID_CLEARED',

	PATH_ADDED: 'PATH_ADDED',
	PATH_REMOVED: 'PATH_REMOVED',
	PATH_UPDATED: 'PATH_UPDATED',

	SEQUENCER_ADDED: 'SEQUENCER_ADDED',
	SEQUENCER_REMOVED: 'SEQUENCER_REMOVED',
	SEQUENCER_UPDATED: 'SEQUENCER_UPDATED',

	LAYER_ADDED: 'LAYER_ADDED',
	LAYER_REMOVED: 'LAYER_REMOVED',

	PARAMETER_CHANGED: 'PARAMETER_CHANGED',

	AUDIO_MODE_CHANGED: 'AUDIO_MODE_CHANGED',
	AUDIO_SPATIAL_MODE_CHANGED: 'AUDIO_SPATIAL_MODE_CHANGED',
	AUDIO_SMOOTHING_CHANGED: 'AUDIO_SMOOTHING_CHANGED',
	AUDIO_READY: 'AUDIO_READY',

	DRAWING_MODE_CHANGED: 'DRAWING_MODE_CHANGED',

	SIMULATION_STARTED: 'SIMULATION_STARTED',
	SIMULATION_STOPPED: 'SIMULATION_STOPPED',
	SIMULATION_PLACEMENT_STARTED: 'SIMULATION_PLACEMENT_STARTED',
	SIMULATION_PLACEMENT_STOPPED: 'SIMULATION_PLACEMENT_STOPPED',

	PARAMETER_RANGE_CUSTOMIZED: 'PARAMETER_RANGE_CUSTOMIZED',
	PARAMETER_RANGE_RESET: 'PARAMETER_RANGE_RESET',
	ALL_PARAMETER_RANGES_RESET: 'ALL_PARAMETER_RANGES_RESET'
};

export const Actions = {
	openMenu: (menuId) => ({
		type: ActionTypes.UI_MENU_OPENED,
		payload: menuId
	}),

	closeTopMenu: () => ({
		type: ActionTypes.UI_MENU_CLOSED_TOP
	}),

	toggleSideMenu: (menu, wasActive) => ({
		type: ActionTypes.UI_SIDE_MENU_TOGGLED,
		payload: { menu, wasActive }
	}),

	startMarkerDrag: () => ({
		type: ActionTypes.UI_MARKER_DRAG_STARTED
	}),

	endMarkerDrag: () => ({
		type: ActionTypes.UI_MARKER_DRAG_ENDED
	}),

	startPathDrag: () => ({
		type: ActionTypes.UI_PATH_DRAG_STARTED
	}),

	endPathDrag: () => ({
		type: ActionTypes.UI_PATH_DRAG_ENDED
	}),

	addSound: (sound) => ({
		type: ActionTypes.SOUND_ADDED,
		payload: { sound }
	}),

	removeSound: (sound) => ({
		type: ActionTypes.SOUND_REMOVED,
		payload: { sound }
	}),

	updateSound: (sound) => ({
		type: ActionTypes.SOUND_UPDATED,
		payload: { sound }
	}),

	changeSoundType: (soundId, newType) => ({
		type: ActionTypes.SOUND_TYPE_CHANGED,
		payload: { soundId, newType }
	}),

	selectNote: (soundId, note) => ({
		type: ActionTypes.SOUND_NOTE_SELECTED,
		payload: { soundId, note }
	}),

	deselectNote: (soundId, note) => ({
		type: ActionTypes.SOUND_NOTE_DESELECTED,
		payload: { soundId, note }
	}),

	clearNotes: (soundId) => ({
		type: ActionTypes.SOUND_NOTES_CLEARED,
		payload: { soundId }
	}),

	clearGrid: (soundId) => ({
		type: ActionTypes.SOUND_GRID_CLEARED,
		payload: { soundId }
	}),

	addPath: (path) => ({
		type: ActionTypes.PATH_ADDED,
		payload: { path }
	}),

	removePath: (pathId) => ({
		type: ActionTypes.PATH_REMOVED,
		payload: { id: pathId }
	}),

	updatePath: (path) => ({
		type: ActionTypes.PATH_UPDATED,
		payload: { path }
	}),

	addSequencer: (sequencer) => ({
		type: ActionTypes.SEQUENCER_ADDED,
		payload: { sequencer }
	}),

	removeSequencer: (sequencerId) => ({
		type: ActionTypes.SEQUENCER_REMOVED,
		payload: { id: sequencerId }
	}),

	updateSequencer: (sequencer) => ({
		type: ActionTypes.SEQUENCER_UPDATED,
		payload: { sequencer }
	}),

	addLayer: (layer) => ({
		type: ActionTypes.LAYER_ADDED,
		payload: { layer }
	}),

	removeLayer: (layerId) => ({
		type: ActionTypes.LAYER_REMOVED,
		payload: { id: layerId }
	}),

	changeParameter: (entityId, paramName, value) => ({
		type: ActionTypes.PARAMETER_CHANGED,
		payload: { entityId, paramName, value }
	}),

	changeAudioMode: (mode) => ({
		type: ActionTypes.AUDIO_MODE_CHANGED,
		payload: { mode }
	}),

	changeSpatialMode: (mode) => ({
		type: ActionTypes.AUDIO_SPATIAL_MODE_CHANGED,
		payload: { mode }
	}),

	audioReady: () => ({
		type: ActionTypes.AUDIO_READY
	}),

	changeDrawingMode: (mode) => ({
		type: ActionTypes.DRAWING_MODE_CHANGED,
		payload: { mode }
	}),

	startSimulation: () => ({
		type: ActionTypes.SIMULATION_STARTED
	}),

	stopSimulation: () => ({
		type: ActionTypes.SIMULATION_STOPPED
	}),

	startSimulationPlacement: () => ({
		type: ActionTypes.SIMULATION_PLACEMENT_STARTED
	}),

	stopSimulationPlacement: () => ({
		type: ActionTypes.SIMULATION_PLACEMENT_STOPPED
	}),

	customizeParameterRange: (paramKey, customRange) => ({
		type: ActionTypes.PARAMETER_RANGE_CUSTOMIZED,
		payload: { paramKey, customRange }
	}),

	resetParameterRange: (paramKey) => ({
		type: ActionTypes.PARAMETER_RANGE_RESET,
		payload: { paramKey }
	}),

	resetAllParameterRanges: () => ({
		type: ActionTypes.ALL_PARAMETER_RANGES_RESET
	})
};
