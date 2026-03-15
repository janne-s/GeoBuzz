import { AppState } from './StateManager.js';

export const Selectors = {
	getSounds: () => AppState.data.sounds,
	getSound: (id) => AppState.getSound(id),
	getSoundCount: () => AppState.data.sounds.length,

	getPaths: () => AppState.data.controlPaths,
	getPath: (id) => AppState.getPath(id),
	getPathCount: () => AppState.data.controlPaths.length,
	getModulatorPaths: () => {
		const paths = new Set();
		Selectors.getSounds().forEach(s => {
			if (s.pathRoles?.modulation) {
				s.pathRoles.modulation.forEach(m => paths.add(m.pathId));
			}
		});
		return AppState.data.controlPaths.filter(p => paths.has(p.id));
	},
	getEchoPaths: () => AppState.data.controlPaths.filter(p => p.params.echo?.enabled),
	getSilencerPaths: () => AppState.data.controlPaths.filter(p => p.params.silencer?.enabled),

	getSequencers: () => AppState.data.sequencers,
	getSequencer: (id) => AppState.getSequencer(id),
	getSequencerCount: () => AppState.data.sequencers.length,

	getMenus: () => AppState.ui.menus,
	getTopMenu: () => {
		const menus = AppState.ui.menus;
		return menus.length > 0 ? menus[menus.length - 1] : null;
	},
	hasMenus: () => AppState.ui.menus.length > 0,
	getMenuCount: () => AppState.ui.menus.length,
	getCurrentTab: () => AppState.ui.menuState.currentTab,
	getMenuState: () => AppState.ui.menuState,
	getExpandedSections: () => AppState.ui.menuState.expandedSections,
	getActiveSideMenu: () => AppState.ui.menuState.activeSideMenu,
	getLastMenuPosition: () => AppState.ui.menuState.lastMenuPosition,
	justDraggedMarker: () => AppState.ui.justDraggedMarker,
	isDraggingPath: () => AppState.ui.draggingPath,
	justDraggedPath: () => AppState.ui.justDraggedPath,
	justCreatedPath: () => AppState.ui.justCreatedPath,

	getSpatialMode: () => AppState.audio.spatialMode,
	getUserDirection: () => AppState.audio.userDirection,
	getAmbisonicScene: () => AppState.audio.ambisonics.scene,

	getDrawingMode: () => AppState.drawing.mode,
	getCurrentPathPoints: () => AppState.drawing.currentPathPoints,
	getTempPathLine: () => AppState.drawing.tempPathLine,
	getDrawingIndicator: () => AppState.drawing.drawingIndicator,
	getTempMarkers: () => AppState.drawing.tempMarkers,

	isSimulationActive: () => AppState.simulation.isActive,
	isPlacingTarget: () => AppState.simulation.isPlacingTarget,
	getSimulationTarget: () => AppState.simulation.targetMarker,
	getSimulationRoute: () => AppState.simulation.route,
	getSimulationSpeed: () => AppState.simulation.speedKmh,
	getUserAttachedPathId: () => AppState.simulation.userAttachedPathId,

	getWorkspaceId: () => AppState.workspace.id,
	isAudioReady: () => AppState.workspace.isAudioReady,

	getNextColor: () => AppState.getNextColor(),
	getAutoName: (type, role, shouldIncrement) => AppState.getAutoName(type, role, shouldIncrement),

	getCustomParameterRanges: () => AppState.customization.parameterRanges,
	getCustomRange: (paramKey) => AppState.customization.parameterRanges[paramKey],
	hasCustomRange: (paramKey) => paramKey in AppState.customization.parameterRanges,
	getCustomizedParameters: () => Object.keys(AppState.customization.parameterRanges),

	getSelectedSounds: () => AppState.selection.selectedSounds,
	getSelectedPaths: () => AppState.selection.selectedPaths,
	getSelectedSequencers: () => AppState.selection.selectedSequencers,
	getSelectedSoundObjects: () => AppState.selection.selectedSounds.map(id => AppState.getSound(id)).filter(Boolean),
	getSelectedPathObjects: () => AppState.selection.selectedPaths.map(id => AppState.getPath(id)).filter(Boolean),
	getSelectedSequencerObjects: () => AppState.selection.selectedSequencers.map(id => AppState.getSequencer(id)).filter(Boolean),
	hasSelection: () => AppState.selection.selectedSounds.length > 0 || AppState.selection.selectedPaths.length > 0 || AppState.selection.selectedSequencers.length > 0,
	getSelectionCount: () => ({
		sounds: AppState.selection.selectedSounds.length,
		paths: AppState.selection.selectedPaths.length,
		sequencers: AppState.selection.selectedSequencers.length,
		total: AppState.selection.selectedSounds.length + AppState.selection.selectedPaths.length + AppState.selection.selectedSequencers.length
	}),
	getSelectionMode: () => AppState.selection.mode,
	isSelectionMoving: () => AppState.selection.isMoving,
	getLayerTypePreferences: (layerId) => AppState.selection.layerTypePreferences[layerId] || { sounds: true, paths: true, sequencers: false },
	isElementSelected: (id, type) => {
		if (type === 'sound') return AppState.selection.selectedSounds.includes(id);
		if (type === 'path') return AppState.selection.selectedPaths.includes(id);
		if (type === 'sequencer') return AppState.selection.selectedSequencers.includes(id);
		return false;
	},
	getSelectedLayers: () => AppState.selection.selectedLayers,
	isLayerSelected: (layerId) => AppState.selection.selectedLayers.includes(layerId)
};
