import { AppState } from '../../core/state/StateManager.js';
import { Selectors } from '../../core/state/selectors.js';
import { SelectionController } from '../../selection/SelectionController.js';
import { SelectionActions } from '../../selection/SelectionActions.js';
import { DragSelectHandler } from '../../selection/DragSelectHandler.js';

let context = null;

export function setSelectionUIBuilderContext(appContext) {
	context = appContext;
}

export const SelectionUIBuilder = {
	initialize(map) {
		this.map = map;
		this.setupMenuButtons();
		this.setupActionBarButtons();

		AppState.subscribe((action) => {
			const layerActions = ['LAYER_ADDED', 'LAYER_REMOVED', 'LAYER_UPDATED'];
			const elementActions = ['SOUND_ADDED', 'SOUND_REMOVED', 'SOUND_UPDATED', 'PATH_ADDED', 'PATH_REMOVED', 'PATH_UPDATED', 'SEQUENCER_ADDED', 'SEQUENCER_REMOVED'];
			if (layerActions.includes(action.type) || elementActions.includes(action.type)) {
				SelectionController.refreshLayersList();
			}
		});

		SelectionController.refreshLayersList();
	},

	setupMenuButtons() {
		const selectClickBtn = document.getElementById('selectClickBtn');
		const selectDragBtn = document.getElementById('selectDragBtn');
		const selectAllBtn = document.getElementById('selectAllBtn');
		const selectNoneBtn = document.getElementById('selectNoneBtn');

		selectClickBtn?.addEventListener('click', () => {
			if (Selectors.getSelectionMode() === 'click') {
				SelectionController.disableSelectionMode();
			} else {
				SelectionController.enableSelectMode();
				DragSelectHandler.detach(this.map);
			}
		});

		selectDragBtn?.addEventListener('click', () => {
			if (Selectors.getSelectionMode() === 'drag') {
				SelectionController.disableSelectionMode();
				DragSelectHandler.detach(this.map);
			} else {
				SelectionController.enableDragSelectMode();
				DragSelectHandler.attach(this.map);
			}
		});

		selectAllBtn?.addEventListener('click', () => {
			SelectionController.selectAll();
		});

		selectNoneBtn?.addEventListener('click', () => {
			SelectionController.clearSelection();
		});
	},

	setupActionBarButtons() {
		const saveBtn = document.getElementById('selectionSaveBtn');
		const duplicateBtn = document.getElementById('selectionDuplicateBtn');
		const deleteBtn = document.getElementById('selectionDeleteBtn');
		const moveBtn = document.getElementById('selectionMoveBtn');
		const clearBtn = document.getElementById('selectionClearBtn');

		saveBtn?.addEventListener('click', () => SelectionActions.save());
		duplicateBtn?.addEventListener('click', () => SelectionActions.duplicate());
		deleteBtn?.addEventListener('click', () => SelectionActions.deleteSelected());

		moveBtn?.addEventListener('click', () => {
			if (Selectors.isSelectionMoving()) {
				SelectionActions.endMoveMode();
			} else {
				SelectionActions.startMoveMode();
			}
		});

		clearBtn?.addEventListener('click', () => SelectionController.clearSelection());
	}
};
