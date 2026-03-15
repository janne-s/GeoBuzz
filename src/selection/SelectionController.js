import { AppState } from '../core/state/StateManager.js';
import { Selectors } from '../core/state/selectors.js';
import { LayerManager } from '../layers/LayerManager.js';
import { DragSelectHandler } from './DragSelectHandler.js';

let context = null;

export function setSelectionControllerContext(appContext) {
	context = appContext;
}

export const SelectionController = {
	showActionsBar() {
		const bar = document.getElementById('selectionActionsBar');
		const statusText = document.getElementById('selectionStatusText');

		if (!Selectors.hasSelection()) {
			bar.classList.remove('active');
			return;
		}

		const counts = Selectors.getSelectionCount();
		const parts = [];
		if (counts.sounds > 0) parts.push(`${counts.sounds} sound${counts.sounds !== 1 ? 's' : ''}`);
		if (counts.paths > 0) parts.push(`${counts.paths} path${counts.paths !== 1 ? 's' : ''}`);
		if (counts.sequencers > 0) parts.push(`${counts.sequencers} sequencer${counts.sequencers !== 1 ? 's' : ''}`);

		statusText.textContent = parts.join(', ') + ' selected';
		bar.classList.add('active');
	},

	hideActionsBar() {
		const bar = document.getElementById('selectionActionsBar');
		bar.classList.remove('active');
	},

	toggleElement(id, type) {
		if (Selectors.isElementSelected(id, type)) {
			AppState.dispatch({ type: 'SELECTION_REMOVE', payload: { id, elementType: type } });
		} else {
			AppState.dispatch({ type: 'SELECTION_ADD', payload: { id, elementType: type } });
		}
		this.updateVisualIndicators();
		this.showActionsBar();
	},

	selectAll() {
		const sounds = Selectors.getSounds().map(s => s.id);
		const paths = Selectors.getPaths().map(p => p.id);
		AppState.dispatch({
			type: 'SELECTION_SET_ALL',
			payload: { sounds, paths, sequencers: [] }
		});
		this.updateVisualIndicators();
		this.showActionsBar();
	},

	clearSelection() {
		AppState.dispatch({ type: 'SELECTION_CLEAR' });
		this.updateVisualIndicators();
		this.hideActionsBar();
		this.disableSelectionMode();
	},

	selectByLayer(layerId) {
		const prefs = Selectors.getLayerTypePreferences(layerId);
		const sounds = prefs.sounds
			? Selectors.getSounds().filter(s => s.layers?.includes(layerId)).map(s => s.id)
			: [];
		const paths = prefs.paths
			? Selectors.getPaths().filter(p => p.layers?.includes(layerId)).map(p => p.id)
			: [];
		const sequencers = prefs.sequencers
			? Selectors.getSequencers().filter(seq => seq.layers?.includes(layerId)).map(seq => seq.id)
			: [];

		const currentSounds = Selectors.getSelectedSounds();
		const currentPaths = Selectors.getSelectedPaths();
		const currentSequencers = Selectors.getSelectedSequencers();

		const isSelected = Selectors.isLayerSelected(layerId);

		if (isSelected) {
			AppState.dispatch({
				type: 'SELECTION_SET_ALL',
				payload: {
					sounds: currentSounds.filter(id => !sounds.includes(id)),
					paths: currentPaths.filter(id => !paths.includes(id)),
					sequencers: currentSequencers.filter(id => !sequencers.includes(id))
				}
			});
		} else {
			AppState.dispatch({
				type: 'SELECTION_SET_ALL',
				payload: {
					sounds: [...new Set([...currentSounds, ...sounds])],
					paths: [...new Set([...currentPaths, ...paths])],
					sequencers: [...new Set([...currentSequencers, ...sequencers])]
				}
			});
		}

		AppState.dispatch({ type: 'SELECTION_LAYER_TOGGLE', payload: { layerId } });
		this.updateVisualIndicators();
		this.showActionsBar();
	},

	setLayerTypePreferences(layerId, types) {
		AppState.dispatch({
			type: 'SELECTION_LAYER_PREFS_SET',
			payload: { layerId, types }
		});
	},

	enableSelectMode() {
		const wasDragMode = Selectors.getSelectionMode() === 'drag';
		AppState.dispatch({ type: 'SELECTION_MODE_CHANGED', payload: { mode: 'click' } });
		document.getElementById('map').classList.add('selection-mode-active');
		document.getElementById('map').classList.remove('drag-select-mode');
		document.getElementById('selectClickBtn')?.classList.add('active');
		document.getElementById('selectDragBtn')?.classList.remove('active');
		if (wasDragMode && context?.map) {
			DragSelectHandler.detach(context.map);
			context.map.dragging.enable();
		}
	},

	enableDragSelectMode() {
		AppState.dispatch({ type: 'SELECTION_MODE_CHANGED', payload: { mode: 'drag' } });
		document.getElementById('map').classList.add('drag-select-mode');
		document.getElementById('map').classList.remove('selection-mode-active');
		document.getElementById('selectDragBtn')?.classList.add('active');
		document.getElementById('selectClickBtn')?.classList.remove('active');
		if (context?.map) {
			context.map.dragging.disable();
			context.map.doubleClickZoom.disable();
		}
	},

	disableSelectionMode() {
		const wasDragMode = Selectors.getSelectionMode() === 'drag';
		AppState.dispatch({ type: 'SELECTION_MODE_CHANGED', payload: { mode: null } });
		document.getElementById('map').classList.remove('selection-mode-active', 'drag-select-mode');
		document.getElementById('selectClickBtn')?.classList.remove('active');
		document.getElementById('selectDragBtn')?.classList.remove('active');
		if (wasDragMode && context?.map) {
			DragSelectHandler.detach(context.map);
			context.map.dragging.enable();
		}
	},

	updateVisualIndicators() {
		Selectors.getSounds().forEach(sound => {
			const el = sound.marker?.getElement();
			if (el) {
				el.classList.toggle('sound-selected', Selectors.isElementSelected(sound.id, 'sound'));
			}
		});

		Selectors.getPaths().forEach(path => {
			const isSelected = Selectors.isElementSelected(path.id, 'path');
			const isCircleOrOval = path.type === 'circle' || path.type === 'oval';

			if (path.pathLine) {
				const el = path.pathLine.getElement?.();
				if (el) {
					el.classList.toggle('path-selected', isSelected);
				}
			}
			if (path.pathCircle) {
				const el = path.pathCircle.getElement?.();
				if (el) {
					el.classList.toggle('path-selected', isSelected);
				}
			}
			if (path.polygon) {
				const el = path.polygon.getElement?.();
				if (el) {
					el.classList.toggle('path-selected', isSelected);
				}
			}
			if (!isCircleOrOval && path.labelMarker) {
				const el = path.labelMarker.getElement?.();
				if (el) {
					el.classList.toggle('path-selected', isSelected);
				}
			}
			if (isCircleOrOval && path.pointMarkers?.[0]) {
				const el = path.pointMarkers[0].getElement?.();
				if (el) {
					el.classList.toggle('path-selected', isSelected);
				}
			}
		});

		this.updateLayerSelectionIndicators();
	},

	updateLayerSelectionIndicators() {
		const container = document.getElementById('selectionLayersList');
		if (!container) return;

		container.querySelectorAll('.selection-layer-item').forEach(item => {
			const layerId = item.dataset.layerId;
			if (layerId) {
				item.classList.toggle('layer-selected', Selectors.isLayerSelected(layerId));
			}
		});
	},

	refreshLayersList() {
		const container = document.getElementById('selectionLayersList');
		if (!container) return;

		container.innerHTML = '';

		const layersWithElements = (LayerManager.userLayers || []).filter(layer => {
			const hasSounds = Selectors.getSounds().some(s => s.layers?.includes(layer.id));
			const hasPaths = Selectors.getPaths().some(p => p.layers?.includes(layer.id));
			const hasSequencers = Selectors.getSequencers().some(seq => seq.layers?.includes(layer.id));
			return hasSounds || hasPaths || hasSequencers;
		});

		if (layersWithElements.length === 0) {
			const emptyMsg = document.createElement('p');
			emptyMsg.className = 'help-text';
			emptyMsg.textContent = 'No layers with elements.';
			container.appendChild(emptyMsg);
			return;
		}

		layersWithElements.forEach(layer => {
			const prefs = Selectors.getLayerTypePreferences(layer.id);
			const isSelected = Selectors.isLayerSelected(layer.id);

			const item = document.createElement('div');
			item.className = 'selection-layer-item';
			item.dataset.layerId = layer.id;
			if (isSelected) {
				item.classList.add('layer-selected');
			}

			const header = document.createElement('div');
			header.className = 'selection-layer-header';

			const colorEl = document.createElement('div');
			colorEl.className = 'selection-layer-color';
			colorEl.style.background = layer.color;

			const nameEl = document.createElement('span');
			nameEl.className = 'selection-layer-name';
			nameEl.textContent = layer.name;

			const expandEl = document.createElement('span');
			expandEl.className = 'selection-layer-expand';
			expandEl.textContent = '▶';

			header.appendChild(colorEl);
			header.appendChild(nameEl);
			header.appendChild(expandEl);

			header.onclick = (e) => {
				if (e.target === expandEl || e.target.closest('.selection-layer-expand')) {
					item.classList.toggle('expanded');
				} else {
					this.selectByLayer(layer.id);
				}
			};

			const typesContainer = document.createElement('div');
			typesContainer.className = 'selection-layer-types';

			['sounds', 'paths', 'sequencers'].forEach(type => {
				const label = document.createElement('label');
				label.className = 'selection-type-checkbox';

				const checkbox = document.createElement('input');
				checkbox.type = 'checkbox';
				checkbox.checked = prefs[type];
				checkbox.onchange = () => {
					const newPrefs = { ...Selectors.getLayerTypePreferences(layer.id), [type]: checkbox.checked };
					this.setLayerTypePreferences(layer.id, newPrefs);

					// Get elements of this type from this layer
					let elementsOfType = [];
					if (type === 'sounds') {
						elementsOfType = Selectors.getSounds().filter(s => s.layers?.includes(layer.id)).map(s => s.id);
					} else if (type === 'paths') {
						elementsOfType = Selectors.getPaths().filter(p => p.layers?.includes(layer.id)).map(p => p.id);
					} else if (type === 'sequencers') {
						elementsOfType = Selectors.getSequencers().filter(seq => seq.layers?.includes(layer.id)).map(seq => seq.id);
					}

					const currentSounds = Selectors.getSelectedSounds();
					const currentPaths = Selectors.getSelectedPaths();
					const currentSequencers = Selectors.getSelectedSequencers();

					if (checkbox.checked) {
						// Add these elements to selection
						AppState.dispatch({
							type: 'SELECTION_SET_ALL',
							payload: {
								sounds: type === 'sounds' ? [...new Set([...currentSounds, ...elementsOfType])] : currentSounds,
								paths: type === 'paths' ? [...new Set([...currentPaths, ...elementsOfType])] : currentPaths,
								sequencers: type === 'sequencers' ? [...new Set([...currentSequencers, ...elementsOfType])] : currentSequencers
							}
						});
					} else {
						// Remove these elements from selection
						AppState.dispatch({
							type: 'SELECTION_SET_ALL',
							payload: {
								sounds: type === 'sounds' ? currentSounds.filter(id => !elementsOfType.includes(id)) : currentSounds,
								paths: type === 'paths' ? currentPaths.filter(id => !elementsOfType.includes(id)) : currentPaths,
								sequencers: type === 'sequencers' ? currentSequencers.filter(id => !elementsOfType.includes(id)) : currentSequencers
							}
						});
					}

					this.updateVisualIndicators();
					this.showActionsBar();
				};

				const text = document.createElement('span');
				text.textContent = type.charAt(0).toUpperCase() + type.slice(1);

				label.appendChild(checkbox);
				label.appendChild(text);
				typesContainer.appendChild(label);
			});

			item.appendChild(header);
			item.appendChild(typesContainer);
			container.appendChild(item);
		});
	}
};
