import { AppState } from '../core/state/StateManager.js';
import { Selectors } from '../core/state/selectors.js';
import { CONSTANTS } from '../core/constants.js';
import { SelectionController } from './SelectionController.js';
import { SettingsManager } from '../persistence/SettingsManager.js';

let context = null;

export function setSelectionActionsContext(appContext) {
	context = appContext;
}

export const SelectionActions = {
	async duplicate() {
		const selectedSounds = Selectors.getSelectedSoundObjects();
		const selectedPaths = Selectors.getSelectedPathObjects();

		const newSoundIds = [];
		const newPathIds = [];

		for (const sound of selectedSounds) {
			const newSound = await context.duplicateSound(sound);
			if (newSound) {
				newSoundIds.push(newSound.id);
			}
		}

		for (const path of selectedPaths) {
			const newPath = context.duplicatePath?.(path);
			if (newPath) {
				newPathIds.push(newPath.id);
			}
		}

		AppState.dispatch({ type: 'SELECTION_CLEAR' });
		AppState.dispatch({
			type: 'SELECTION_SET_ALL',
			payload: { sounds: newSoundIds, paths: newPathIds, sequencers: [] }
		});
		SelectionController.updateVisualIndicators();
		SelectionController.showActionsBar();
		this.startMoveMode();
	},

	async deleteSelected() {
		const counts = Selectors.getSelectionCount();
		const confirmed = await context.ModalSystem.confirm(
			`Delete ${counts.total} selected element${counts.total !== 1 ? 's' : ''}? This cannot be undone.`,
			'Delete Selected'
		);

		if (!confirmed) return;

		const selectedSounds = Selectors.getSelectedSoundObjects();
		const selectedPaths = Selectors.getSelectedPathObjects();

		for (const sound of selectedSounds) {
			context.destroySound(sound);
			AppState.dispatch({
				type: 'SOUND_REMOVED',
				payload: { sound }
			});
		}

		for (const path of selectedPaths) {
			context.deleteControlPath(path);
		}

		SelectionController.clearSelection();
	},

	async save() {
		const selectedSounds = Selectors.getSelectedSoundObjects();
		const selectedPaths = Selectors.getSelectedPathObjects();
		const counts = Selectors.getSelectionCount();

		if (counts.total === 0) {
			context.ModalSystem.alert('No elements selected to save.', 'Save Selection');
			return;
		}

		const relativeToggle = document.getElementById('relativePositioningToggle');
		const relativePositioning = relativeToggle?.checked || false;
		const anchor = relativePositioning ? SettingsManager.getUserPosition() : null;

		if (relativePositioning && !anchor) {
			const proceed = await context.ModalSystem.confirm(
				'Relative positioning is enabled but your location is unavailable. Save with absolute coordinates instead?',
				'Location Unavailable'
			);
			if (!proceed) return;
		}

		const useRelative = relativePositioning && anchor !== null;

		const settings = {
			version: CONSTANTS.SAVE_FORMAT_VERSION,
			relativePositioning: useRelative,
			sounds: selectedSounds.map(s => SettingsManager.serializeSound(s, useRelative, anchor)),
			controlPaths: selectedPaths.map(p => SettingsManager.serializePath(p, useRelative, anchor))
		};

		const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
		const filename = `geobuzz-selection-${timestamp}.json`;
		const dataStr = JSON.stringify(settings, null, 2);
		const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

		const linkElement = document.createElement('a');
		linkElement.setAttribute('href', dataUri);
		linkElement.setAttribute('download', filename);
		linkElement.click();

		context.ModalSystem.alert(
			`Saved ${counts.total} element${counts.total !== 1 ? 's' : ''} to file. Use "Load from File" to import into another workspace.`,
			'Selection Saved'
		);
	},

	startMoveMode() {
		if (!Selectors.hasSelection()) return;

		SelectionController.disableSelectionMode();

		AppState.dispatch({ type: 'SELECTION_MOVE_STARTED' });
		document.getElementById('map').classList.add('selection-move-mode');
		document.getElementById('selectionMoveBtn')?.classList.add('active');

		this.refreshMoveStartPositions();
	},

	refreshMoveStartPositions() {
		const selectedSounds = Selectors.getSelectedSoundObjects();
		const selectedPaths = Selectors.getSelectedPathObjects();

		selectedSounds.forEach(sound => {
			const markerPos = sound.marker.getLatLng();
			sound._moveStartPos = markerPos;
			if (sound.handle) {
				const handlePos = sound.handle.getLatLng();
				sound._moveStartHandleOffset = {
					lat: handlePos.lat - markerPos.lat,
					lng: handlePos.lng - markerPos.lng
				};
			}
			if (sound.shapeType === 'polygon' && sound.vertices) {
				sound._moveStartVertices = sound.vertices.map(v => ({ lat: v.lat, lng: v.lng }));
			}
			if (sound.shapeType === 'line' && sound.linePoints) {
				sound._moveStartLinePoints = sound.linePoints.map(p => ({ lat: p.lat, lng: p.lng }));
			}
			if (sound.shapeType === 'oval' && sound.ovalCenter) {
				sound._moveStartOvalCenter = { lat: sound.ovalCenter.lat, lng: sound.ovalCenter.lng };
			}
			if (sound.labelMarker) {
				const labelPos = sound.labelMarker.getLatLng();
				sound._moveStartLabelPos = { lat: labelPos.lat, lng: labelPos.lng };
			}
		});

		selectedPaths.forEach(path => {
			if (path.points) {
				path._moveStartPoints = path.points.map(p => ({ lat: p.lat, lng: p.lng }));
			}
			if (path.center) {
				path._moveStartCenter = { lat: path.center.lat, lng: path.center.lng };
			}
			if (path.pointMarkers && (path.type === 'circle' || path.type === 'oval')) {
				path._moveStartHandlePositions = path.pointMarkers.map(m => {
					const pos = m.getLatLng();
					return { lat: pos.lat, lng: pos.lng };
				});
			}
			if (path.type === 'oval' && path.pathCircle) {
				const latLngs = path.pathCircle.getLatLngs();
				const pts = Array.isArray(latLngs[0]) ? latLngs[0] : latLngs;
				if (Array.isArray(pts)) {
					path._moveStartOvalPoints = pts.map(p => ({ lat: p.lat, lng: p.lng }));
				}
			}
			if (path.toleranceLayer && path.type !== 'circle') {
				const latLngs = path.toleranceLayer.getLatLngs();
				const pts = Array.isArray(latLngs[0]) ? latLngs[0] : latLngs;
				if (Array.isArray(pts)) {
					path._moveStartTolerancePoints = pts.map(p => ({ lat: p.lat, lng: p.lng }));
				}
			}
			if (path.toleranceInner && path.type !== 'circle') {
				const latLngs = path.toleranceInner.getLatLngs();
				const pts = Array.isArray(latLngs[0]) ? latLngs[0] : latLngs;
				if (Array.isArray(pts)) {
					path._moveStartToleranceInnerPoints = pts.map(p => ({ lat: p.lat, lng: p.lng }));
				}
			}
			if (path.labelMarker) {
				const labelPos = path.labelMarker.getLatLng();
				path._moveStartLabelPos = { lat: labelPos.lat, lng: labelPos.lng };
			}
		});
	},

	endMoveMode() {
		AppState.dispatch({ type: 'SELECTION_MOVE_ENDED' });
		document.getElementById('map').classList.remove('selection-move-mode');
		document.getElementById('selectionMoveBtn')?.classList.remove('active');

		const selectedSounds = Selectors.getSelectedSoundObjects();
		const selectedPaths = Selectors.getSelectedPathObjects();

		selectedSounds.forEach(sound => {
			delete sound._moveStartPos;
			delete sound._moveStartHandleOffset;
			delete sound._moveStartVertices;
			delete sound._moveStartLinePoints;
			delete sound._moveStartOvalCenter;
			delete sound._moveStartLabelPos;
		});

		selectedPaths.forEach(path => {
			delete path._moveStartPoints;
			delete path._moveStartCenter;
			delete path._moveStartLabelPos;
			delete path._moveStartHandlePositions;
			delete path._moveStartOvalPoints;
			delete path._moveStartTolerancePoints;
			delete path._moveStartToleranceInnerPoints;
		});
	},

	moveSelected(deltaLat, deltaLng, excludeId = null) {
		if (!Selectors.isSelectionMoving()) return;

		const selectedSounds = Selectors.getSelectedSoundObjects();
		const selectedPaths = Selectors.getSelectedPathObjects();

		selectedSounds.forEach(sound => {
			if (sound.id === excludeId) return;
			if (sound._moveStartPos) {
				const newPos = L.latLng(
					sound._moveStartPos.lat + deltaLat,
					sound._moveStartPos.lng + deltaLng
				);
				sound.marker.setLatLng(newPos);
				sound.userLat = newPos.lat;
				sound.userLng = newPos.lng;
				if (sound.circle) {
					sound.circle.setLatLng(newPos);
				}
				if (sound.handle) {
					const handleOffset = sound._moveStartHandleOffset || { lat: 0, lng: 0 };
					sound.handle.setLatLng(L.latLng(
						newPos.lat + handleOffset.lat,
						newPos.lng + handleOffset.lng
					));
				}
				if (sound.shapeType === 'polygon' && sound._moveStartVertices) {
					const newVertices = sound._moveStartVertices.map(v =>
						L.latLng(v.lat + deltaLat, v.lng + deltaLng)
					);
					sound.vertices = newVertices;
					if (sound.polygon) {
						sound.polygon.setLatLngs(newVertices);
					}
					if (sound.vertexMarkers) {
						sound.vertexMarkers.forEach((marker, i) => {
							marker.setLatLng(newVertices[i]);
						});
					}
				}
				if (sound.shapeType === 'line' && sound._moveStartLinePoints) {
					const newLinePoints = sound._moveStartLinePoints.map(p =>
						L.latLng(p.lat + deltaLat, p.lng + deltaLng)
					);
					sound.linePoints = newLinePoints;
					if (sound.linePointMarkers) {
						sound.linePointMarkers.forEach((marker, i) => marker.setLatLng(newLinePoints[i]));
					}
					context.Geometry.updateLineCorridor(sound);
				}
				if (sound.shapeType === 'oval' && sound._moveStartOvalCenter) {
					const newCenter = L.latLng(
						sound._moveStartOvalCenter.lat + deltaLat,
						sound._moveStartOvalCenter.lng + deltaLng
					);
					context.Geometry.updateOvalPosition(sound, newCenter);
				}
				if (sound.labelMarker && sound._moveStartLabelPos) {
					sound.labelMarker.setLatLng(L.latLng(
						sound._moveStartLabelPos.lat + deltaLat,
						sound._moveStartLabelPos.lng + deltaLng
					));
				}
			}
		});

		selectedPaths.forEach(path => {
			if (path.id === excludeId) return;
			const isCircleOrOval = path.type === 'circle' || path.type === 'oval';

			if (path._moveStartPoints && !isCircleOrOval) {
				const newPoints = path._moveStartPoints.map(p => L.latLng(p.lat + deltaLat, p.lng + deltaLng));
				path.points = newPoints;
				if (path.pathLine) {
					path.pathLine.setLatLngs(newPoints);
				}
				if (path.polygon) {
					path.polygon.setLatLngs(newPoints);
				}
				if (path.pointMarkers) {
					path.pointMarkers.forEach((marker, i) => {
						marker.setLatLng(newPoints[i]);
					});
				}
				if (path.toleranceLayer && path._moveStartTolerancePoints) {
					const movedPoints = path._moveStartTolerancePoints.map(p => L.latLng(p.lat + deltaLat, p.lng + deltaLng));
					path.toleranceLayer.setLatLngs(movedPoints);
				}
			}
			if (path._moveStartCenter && isCircleOrOval) {
				const newCenter = L.latLng(
					path._moveStartCenter.lat + deltaLat,
					path._moveStartCenter.lng + deltaLng
				);
				path.center = newCenter;
				if (path.pointMarkers?.[0]) {
					path.pointMarkers[0].setLatLng(newCenter);
				}
				if (path.pathCircle) {
					if (path.type === 'circle') {
						path.pathCircle.setLatLng(newCenter);
					} else if (path._moveStartOvalPoints) {
						const movedPoints = path._moveStartOvalPoints.map(p => L.latLng(p.lat + deltaLat, p.lng + deltaLng));
						path.pathCircle.setLatLngs(movedPoints);
					}
				}
				if (path.toleranceLayer) {
					if (path.type === 'circle') {
						path.toleranceLayer.setLatLng(newCenter);
					} else if (path._moveStartTolerancePoints) {
						const movedPoints = path._moveStartTolerancePoints.map(p => L.latLng(p.lat + deltaLat, p.lng + deltaLng));
						path.toleranceLayer.setLatLngs(movedPoints);
					}
				}
				if (path.toleranceInner) {
					if (path.type === 'circle') {
						path.toleranceInner.setLatLng(newCenter);
					} else if (path._moveStartToleranceInnerPoints) {
						const movedPoints = path._moveStartToleranceInnerPoints.map(p => L.latLng(p.lat + deltaLat, p.lng + deltaLng));
						path.toleranceInner.setLatLngs(movedPoints);
					}
				}
				if (path._moveStartHandlePositions && path.pointMarkers) {
					path.pointMarkers.forEach((marker, i) => {
						if (i > 0 && path._moveStartHandlePositions[i]) {
							marker.setLatLng(L.latLng(
								path._moveStartHandlePositions[i].lat + deltaLat,
								path._moveStartHandlePositions[i].lng + deltaLng
							));
						}
					});
				}
			}
			if (path.labelMarker && path._moveStartLabelPos) {
				path.labelMarker.setLatLng(L.latLng(
					path._moveStartLabelPos.lat + deltaLat,
					path._moveStartLabelPos.lng + deltaLng
				));
			}
		});

		AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
	}
};
