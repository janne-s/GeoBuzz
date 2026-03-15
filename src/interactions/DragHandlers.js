import { AppState } from '../core/state/StateManager.js';
import { Selectors } from '../core/state/selectors.js';
import { Geometry } from '../core/geospatial/Geometry.js';
import { ShapeManager } from '../shapes/ShapeManager.js';
import { CONSTANTS } from '../core/constants.js';
import { setTemporaryFlag } from '../core/utils/math.js';
import { attachDragHandlers } from './attachDragHandlers.js';
import { deleteSound } from '../ui/menus/SoundMenuManager.js';

let context = null;

export function setDragHandlersContext(appContext) {
	context = appContext;
}

export const DragHandlers = {
	attachMarkerHandlers(obj) {
		attachDragHandlers(obj.marker, {
			click: (e) => {
				const selectionMode = Selectors.getSelectionMode();
				if (selectionMode === 'click') {
					context.SelectionController?.toggleElement(obj.id, 'sound');
					return;
				}
				if (e.originalEvent.shiftKey) {
					deleteSound(obj);
				} else if (context && context.showSoundMenu) {
					context.showSoundMenu(e.containerPoint, obj.marker);
				}
			},
			start: (e) => {
				AppState.dispatch({ type: 'UI_MARKER_DRAG_STARTED' });
				obj.isDragging = true;
				obj._lastValidMarkerPos = e.target.getLatLng();
				obj._dragStartPos = e.target.getLatLng();
			},
			end: () => {
				AppState.dispatch({ type: 'UI_MARKER_DRAG_ENDED' });
				setTemporaryFlag(AppState.ui, 'justDraggedMarker', CONSTANTS.DRAG_END_COOLDOWN_MS);
				obj.isDragging = false;

				if (obj.params?.lfo) {
					const now = Tone.now();
					if (!obj.params.lfo._phaseOffsets) {
						obj.params.lfo._phaseOffsets = { x: 0, y: 0, size: 0 };
					}
					obj.params.lfo._phaseOffsets.x = now;
					obj.params.lfo._phaseOffsets.y = now;
				}

				if (obj.shapeType === 'polygon' && obj.originalVertices) {
					obj.originalVertices = obj.vertices.map(v => ({
						lat: v.lat - obj.userLat,
						lng: v.lng - obj.userLng
					}));
				}

				if (obj.shapeType === 'line' && obj.originalLinePoints) {
					obj.originalLinePoints = obj.linePoints.map(p => ({
						lat: p.lat - obj.userLat,
						lng: p.lng - obj.userLng
					}));
				}

				if (Selectors.isSelectionMoving()) {
					context.SelectionActions?.refreshMoveStartPositions();
				}

				delete obj._lastValidMarkerPos;
				delete obj._dragStartPos;
				AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
			},
			drag: () => {
				if (Selectors.isSelectionMoving() && Selectors.isElementSelected(obj.id, 'sound') && obj._dragStartPos) {
					const currentPos = obj.marker.getLatLng();
					const deltaLat = currentPos.lat - obj._dragStartPos.lat;
					const deltaLng = currentPos.lng - obj._dragStartPos.lng;
					context.SelectionActions?.moveSelected(deltaLat, deltaLng, obj.id);
				}
				this.handleMarkerDrag(obj);
				AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
			}
		});
	},

	attachCircleHandlers(obj) {
		attachDragHandlers(obj.handle, {
			drag: () => this.handleCircleResize(obj),
			end: () => {
				setTemporaryFlag(AppState.ui, 'justDraggedMarker', CONSTANTS.DRAG_END_COOLDOWN_MS);
				if (obj.params?.lfo?._phaseOffsets) {
					obj.params.lfo._phaseOffsets.size = Tone.now();
				}
				AppState.dispatch({ type: 'SOUND_UPDATED', payload: { sound: obj } });
			}
		});
	},

	attachVertexHandlers(obj, marker, index) {
		let clickTimer, isDragging = false;

		attachDragHandlers(marker, {
			mouseDown: () => {
				isDragging = false;
				clickTimer = setTimeout(() => isDragging = true, CONSTANTS.LONG_PRESS_DELAY);
			},
			start: () => {
				if (clickTimer) clearTimeout(clickTimer);
				isDragging = true;
			},
			drag: () => {
				obj.vertices[index] = marker.getLatLng();
				obj.polygon.setLatLngs(obj.vertices);
				if (obj.iconPlacementMode === 'fixed') {
					const centroid = Geometry.calculateCentroid(obj.vertices);
					obj.marker.setLatLng(centroid);
				}
				if (index === 0 && obj.labelMarker) {
					obj.labelMarker.setLatLng(obj.vertices[0]);
				}
				Geometry.updateDivisionLineVisual(obj, context.map);
				AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
			},
			end: () => {
				if (clickTimer) clearTimeout(clickTimer);
				obj.isDragging = false;
				if (obj.originalVertices) {
					obj.originalVertices = obj.vertices.map(v => ({
						lat: v.lat - obj.userLat,
						lng: v.lng - obj.userLng
					}));
				}
				AppState.dispatch({ type: 'SOUND_UPDATED', payload: { sound: obj } });
			},
			click: (e) => this.handleVertexClick(e, obj, index, isDragging)
		});
	},

	handleMarkerDrag(obj) {
		const newPos = obj.marker.getLatLng();

		if (obj.iconPlacementMode === 'fixed') {
			if (obj.shapeType === "circle") {
				Geometry.updateCirclePosition(obj.circle, obj.handle, obj.labelMarker, newPos, obj.maxDistance);
			} else if (obj.shapeType === "polygon") {
				const deltaLat = newPos.lat - obj._lastValidMarkerPos.lat;
				const deltaLng = newPos.lng - obj._lastValidMarkerPos.lng;
				obj.vertices = Geometry.updatePolygonPosition(
					obj.polygon, obj.vertices, obj.vertexMarkers, obj.labelMarker, deltaLat, deltaLng
				);
				obj._lastValidMarkerPos = newPos;
			} else if (obj.shapeType === "line") {
				const deltaLat = newPos.lat - obj._lastValidMarkerPos.lat;
				const deltaLng = newPos.lng - obj._lastValidMarkerPos.lng;
				Geometry.updateLinePosition(obj, deltaLat, deltaLng);
				obj._lastValidMarkerPos = newPos;
			} else if (obj.shapeType === "oval") {
				Geometry.updateOvalPosition(obj, newPos);
			}
		} else if (obj.iconPlacementMode === 'free') {
			if (obj.shapeType === 'circle' && obj.circle) {
				const center = obj.circle.getLatLng();
				const radius = obj.circle.getRadius();
				const distance = context.map.distance(center, newPos);
				if (distance > radius) {
					const L = window.L;
					const fromCenterToPos = L.point(newPos.lng, newPos.lat).subtract(L.point(center.lng, center.lat));
					const scaled = fromCenterToPos.multiplyBy(radius / distance);
					const snappedPos = L.latLng(center.lat + (scaled.y / CONSTANTS.METERS_PER_LAT), center.lng + (scaled.x / (CONSTANTS.METERS_PER_LNG * Math.cos(center.lat * Math.PI / 180))));
					obj.marker.setLatLng(snappedPos);
				}
			} else if (obj.shapeType === 'polygon' && obj.vertices) {
				if (!Geometry.isPointInPolygon(newPos, obj.vertices)) {
					obj.marker.setLatLng(obj._lastValidMarkerPos);
				}
			} else if (obj.shapeType === 'line' && obj.linePoints) {
				if (!Geometry.isPointInLineCorridor(newPos, obj.linePoints, obj.lineTolerance)) {
					obj.marker.setLatLng(obj._lastValidMarkerPos);
				}
			} else if (obj.shapeType === 'oval' && obj.ovalCenter) {
				if (!Geometry.isPointInOval(newPos, obj.ovalCenter, obj.radiusX, obj.radiusY)) {
					obj.marker.setLatLng(obj._lastValidMarkerPos);
				}
			}
			obj._lastValidMarkerPos = obj.marker.getLatLng();
		}

		if (obj.isDragging) {
			const finalPos = obj.marker.getLatLng();
			obj.userLat = finalPos.lat;
			obj.userLng = finalPos.lng;
		}

		Geometry.updateDivisionLineVisual(obj, context.map);
	},

	handleCircleResize(obj) {
		const distance = context.map.distance(obj.circle.getLatLng(), obj.handle.getLatLng());
		obj.maxDistance = Math.max(CONSTANTS.MIN_RADIUS, Math.round(distance));
		obj.originalSize = obj.maxDistance;
		obj.circle.setRadius(obj.maxDistance);

		const newLabelPos = Geometry.computeEdgeLatLng(
			obj.marker.getLatLng(), obj.maxDistance, 'label'
		);
		obj.labelMarker.setLatLng(newLabelPos);

		if (Selectors.getSpatialMode() === 'ambisonics') {
			const AmbisonicsManager = context.AmbisonicsManager;
			if (AmbisonicsManager) {
				AmbisonicsManager.updateSourceMaxDistance(obj);
			}
		}

		if (obj.params?.lfo?._phaseOffsets) {
			obj.params.lfo._phaseOffsets.size = Tone.now();
		}

		Geometry.updateDivisionLineVisual(obj, context.map);
		AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
	},

	handleVertexClick(e, obj, index, wasDragging) {
		e.originalEvent.stopPropagation();

		if (!wasDragging && obj.vertices.length > 3) {
			obj.vertices.splice(index, 1);
			obj.polygon.setLatLngs(obj.vertices);
			ShapeManager.createVertexMarkers(obj);
			Geometry.updatePolygonCentroid(obj);
			if (obj.originalVertices) {
				obj.originalVertices = obj.vertices.map(v => ({
					lat: v.lat - obj.userLat,
					lng: v.lng - obj.userLng
				}));
			}
			AppState.dispatch({ type: 'SOUND_UPDATED', payload: { sound: obj } });
		}
	},

	attachLinePointHandlers(obj, marker, index) {
		let clickTimer, isDragging = false;

		attachDragHandlers(marker, {
			mouseDown: () => {
				isDragging = false;
				clickTimer = setTimeout(() => isDragging = true, CONSTANTS.LONG_PRESS_DELAY);
			},
			start: () => {
				if (clickTimer) clearTimeout(clickTimer);
				isDragging = true;
			},
			drag: () => {
				obj.linePoints[index] = marker.getLatLng();
				Geometry.updateLineCorridor(obj);

				if (obj.iconPlacementMode === 'fixed') {
					const centroid = Geometry.calculateCentroid(obj.linePoints);
					obj.marker.setLatLng(centroid);
					obj.userLat = centroid.lat;
					obj.userLng = centroid.lng;
				}

				if (index === 0 && obj.labelMarker) {
					obj.labelMarker.setLatLng(obj.linePoints[0]);
				}

				Geometry.updateDivisionLineVisual(obj, context.map);
				AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
			},
			end: () => {
				if (clickTimer) clearTimeout(clickTimer);
				obj.isDragging = false;
				AppState.dispatch({ type: 'SOUND_UPDATED', payload: { sound: obj } });
			},
			click: (e) => this.handleLinePointClick(e, obj, index, isDragging)
		});
	},

	handleLinePointClick(e, obj, index, wasDragging) {
		e.originalEvent.stopPropagation();

		if (!wasDragging && obj.linePoints.length > 2) {
			obj.linePoints.splice(index, 1);
			Geometry.updateLineCorridor(obj);
			Geometry.updateDivisionLineVisual(obj, context.map);
			ShapeManager.createLinePointMarkers(obj);

			if (obj.iconPlacementMode === 'fixed') {
				const centroid = Geometry.calculateCentroid(obj.linePoints);
				obj.marker.setLatLng(centroid);
				obj.userLat = centroid.lat;
				obj.userLng = centroid.lng;
			}

			AppState.dispatch({ type: 'SOUND_UPDATED', payload: { sound: obj } });
		}
	},

	attachOvalHandlers(obj) {
		if (obj.xHandle) {
			attachDragHandlers(obj.xHandle, {
				drag: () => this.handleOvalXResize(obj),
				end: () => {
					setTemporaryFlag(AppState.ui, 'justDraggedMarker', CONSTANTS.DRAG_END_COOLDOWN_MS);
					AppState.dispatch({ type: 'SOUND_UPDATED', payload: { sound: obj } });
				}
			});
		}

		if (obj.yHandle) {
			attachDragHandlers(obj.yHandle, {
				drag: () => this.handleOvalYResize(obj),
				end: () => {
					setTemporaryFlag(AppState.ui, 'justDraggedMarker', CONSTANTS.DRAG_END_COOLDOWN_MS);
					AppState.dispatch({ type: 'SOUND_UPDATED', payload: { sound: obj } });
				}
			});
		}
	},

	handleOvalXResize(obj) {
		const center = obj.ovalCenter;
		const handlePos = obj.xHandle.getLatLng();

		const cosLat = Math.cos(center.lat * Math.PI / 180);
		const dLng = handlePos.lng - center.lng;
		const newRadiusX = Math.abs(dLng * CONSTANTS.METERS_PER_LNG * cosLat);

		Geometry.resizeOval(obj, 'x', Math.max(CONSTANTS.MIN_RADIUS, newRadiusX));

		obj.xHandle.setLatLng(L.latLng(center.lat, center.lng + (obj.radiusX / (CONSTANTS.METERS_PER_LNG * cosLat))));

		Geometry.updateDivisionLineVisual(obj, context.map);
		AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
	},

	handleOvalYResize(obj) {
		const center = obj.ovalCenter;
		const handlePos = obj.yHandle.getLatLng();

		const dLat = handlePos.lat - center.lat;
		const newRadiusY = Math.abs(dLat * CONSTANTS.METERS_PER_LAT);

		Geometry.resizeOval(obj, 'y', Math.max(CONSTANTS.MIN_RADIUS, newRadiusY));

		obj.yHandle.setLatLng(L.latLng(center.lat + (obj.radiusY / CONSTANTS.METERS_PER_LAT), center.lng));

		Geometry.updateDivisionLineVisual(obj, context.map);
		AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
	}
};
