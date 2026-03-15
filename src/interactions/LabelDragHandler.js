import { AppState } from '../core/state/StateManager.js';
import { Selectors } from '../core/state/selectors.js';
import { Geometry } from '../core/geospatial/Geometry.js';
import { CONSTANTS } from '../core/constants.js';
import { setTemporaryFlag } from '../core/utils/math.js';
import { attachDragHandlers } from './attachDragHandlers.js';

let context = null;

export function setContext(ctx) {
	context = ctx;
}

export const LabelDragHandler = {
	attachTo(labelMarker, element, type) {
		labelMarker.options.interactive = true;
		labelMarker.options.draggable = true;

		attachDragHandlers(labelMarker, {
			start: (e) => {
				e.originalEvent?.stopPropagation();
				element._labelDragStart = labelMarker.getLatLng();
				element._labelDragOrigin = labelMarker.getLatLng();
				element._elementStartPos = type === 'sound' ?
					element.marker.getLatLng() :
					(element.center || element.points[0]);

				element.isDragging = true;

				if (type === 'path') {
					AppState.dispatch({ type: 'UI_PATH_DRAG_STARTED' });
				} else if (type === 'sound') {
					AppState.dispatch({ type: 'UI_MARKER_DRAG_STARTED' });
				}
			},
			drag: () => this.handleDrag(labelMarker, element, type),
			end: () => {
				element.isDragging = false;

				if (type === 'path') {
					AppState.dispatch({ type: 'UI_PATH_DRAG_ENDED' });
					setTemporaryFlag(AppState.ui, 'justDraggedPath', CONSTANTS.DRAG_END_COOLDOWN_MS);
				} else if (type === 'sound') {
					AppState.dispatch({ type: 'UI_MARKER_DRAG_ENDED' });
					setTemporaryFlag(AppState.ui, 'justDraggedMarker', CONSTANTS.DRAG_END_COOLDOWN_MS);
				}

				if (type === 'sound' && element.params?.lfo) {
					const now = Tone.now();
					if (!element.params.lfo._phaseOffsets) {
						element.params.lfo._phaseOffsets = { x: 0, y: 0, size: 0 };
					}
					element.params.lfo._phaseOffsets.x = now;
					element.params.lfo._phaseOffsets.y = now;
				}

				if (type === 'path') {
					if (element.type === 'circle' || element.type === 'oval') {
						element.originalCenter = L.latLng(element.center.lat, element.center.lng);
					} else {
						element.originalPoints = element.points.map(p => L.latLng(p.lat, p.lng));
					}

					if (element.params?.lfo?._phaseOffsets) {
						const now = Tone.now();
						element.params.lfo._phaseOffsets.x = now;
						element.params.lfo._phaseOffsets.y = now;
					}
				}

				if (Selectors.isSelectionMoving()) {
					context.SelectionActions?.refreshMoveStartPositions();
				}

				delete element._labelDragStart;
				delete element._labelDragOrigin;
				delete element._elementStartPos;
			}
		});
	},

	handleDrag(labelMarker, element, type) {
		const labelPos = labelMarker.getLatLng();

		if (type === 'path' && Selectors.isSelectionMoving() && Selectors.isElementSelected(element.id, 'path') && element._labelDragOrigin) {
			const deltaLat = labelPos.lat - element._labelDragOrigin.lat;
			const deltaLng = labelPos.lng - element._labelDragOrigin.lng;
			context.SelectionActions?.moveSelected(deltaLat, deltaLng, element.id);
			this.dragPath(element, labelPos.lat - element._labelDragStart.lat, labelPos.lng - element._labelDragStart.lng);
			element._labelDragStart = labelPos;
			return;
		}

		const deltaLat = labelPos.lat - element._labelDragStart.lat;
		const deltaLng = labelPos.lng - element._labelDragStart.lng;

		if (type === 'sound') {
			this.dragSound(element, deltaLat, deltaLng);
		} else if (type === 'path') {
			this.dragPath(element, deltaLat, deltaLng);
		}

		element._labelDragStart = labelPos;
	},

	dragSound(sound, deltaLat, deltaLng) {
		const newMarkerPos = L.latLng(
			sound.marker.getLatLng().lat + deltaLat,
			sound.marker.getLatLng().lng + deltaLng
		);
		sound.marker.setLatLng(newMarkerPos);
		sound.userLat = newMarkerPos.lat;
		sound.userLng = newMarkerPos.lng;

		if (sound.shapeType === 'circle') {
			const newCircleCenter = L.latLng(
				sound.circle.getLatLng().lat + deltaLat,
				sound.circle.getLatLng().lng + deltaLng
			);
			sound.circle.setLatLng(newCircleCenter);
			sound.handle.setLatLng(Geometry.computeEdgeLatLng(newCircleCenter, sound.maxDistance));
		} else if (sound.shapeType === 'polygon') {
			sound.vertices = sound.vertices.map(v =>
				L.latLng(v.lat + deltaLat, v.lng + deltaLng)
			);
			sound.polygon.setLatLngs(sound.vertices);
			sound.vertexMarkers.forEach((marker, i) => marker.setLatLng(sound.vertices[i]));
		} else if (sound.shapeType === 'line') {
			Geometry.updateLinePosition(sound, deltaLat, deltaLng);
		} else if (sound.shapeType === 'oval') {
			const newCenter = L.latLng(sound.ovalCenter.lat + deltaLat, sound.ovalCenter.lng + deltaLng);
			Geometry.updateOvalPosition(sound, newCenter);
		}

		Geometry.updateDivisionLineVisual(sound, context.map);
		AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
	},

	dragPath(path, deltaLat, deltaLng) {
		context.updateControlPathPosition(path, deltaLat, deltaLng);
	}
};
