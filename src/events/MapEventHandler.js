import { Selectors } from '../core/state/selectors.js';
import { LayerManager } from '../layers/LayerManager.js';
import { CONSTANTS } from '../core/constants.js';
import { Geometry } from '../core/geospatial/Geometry.js';

let _lastTapTime = 0;

export function mapClickHandler(e, { map, addSound, renderControlPath }) {
	const now = Date.now();
	const isDoubleTap = (now - _lastTapTime) < CONSTANTS.DOUBLE_TAP_MS;
	_lastTapTime = isDoubleTap ? 0 : now;
	if (!isDoubleTap) return;

	if (Selectors.getDrawingMode()) return;
	if (Selectors.justCreatedPath() || Selectors.justDraggedPath()) {
		return;
	}

	if (Selectors.isPlacingTarget() ||
		Selectors.getDrawingMode() ||
		Selectors.getMenuCount() > 0 ||
		Selectors.getActiveSideMenu() ||
		document.querySelector('#soundDialog') ||
		document.querySelector('.menu-overlay') ||
		Selectors.isDraggingPath() ||
		Selectors.justDraggedPath() ||
		Selectors.justDraggedMarker()) {
		return;
	}

	let handled = false;
	const clickPoint = e.latlng;

	for (const sound of Selectors.getSounds()) {
		if (handled) break;
		if (sound.vertexMarkers) {
			for (const vertexMarker of sound.vertexMarkers) {
				if (vertexMarker && map.distance(clickPoint, vertexMarker.getLatLng()) < CONSTANTS.MARKER_CLICK_THRESHOLD) {
					handled = true;
					break;
				}
			}
		}
	}

	if (handled) return;

	for (const path of Selectors.getPaths()) {
		if (handled) break;

		if (path.type === 'polygon' && path.points.length >= 3) {
			const pathPoints = path.points;
			let minDist = Infinity;
			let insertIndex = -1;

			for (let i = 0; i < pathPoints.length; i++) {
				const start = pathPoints[i];
				const end = pathPoints[(i + 1) % pathPoints.length];

				const closestPoint = Geometry.getClosestPointOnLineSegment(clickPoint, start, end);
				const dist = map.distance(clickPoint, closestPoint);

				if (dist < minDist) {
					minDist = dist;
					insertIndex = i + 1;
				}
			}

			if (minDist < CONSTANTS.MARKER_CLICK_THRESHOLD) {
				path.points.splice(insertIndex, 0, clickPoint);
				renderControlPath(path);
				handled = true;
			}
		}
	}

	if (handled) return;

	for (const sound of Selectors.getSounds()) {
		if (handled) break;
		if (sound.marker && map.distance(clickPoint, sound.marker.getLatLng()) < CONSTANTS.MARKER_CLICK_THRESHOLD) {
			handled = true;
		}
	}

	if (!handled) {
		addSound(e.latlng);
	}
}
