import { AppState } from '../core/state/StateManager.js';
import { Selectors } from '../core/state/selectors.js';
import { GeolocationManager } from '../core/geospatial/GeolocationManager.js';
import { Geometry } from '../core/geospatial/Geometry.js';
import { CONSTANTS } from '../core/constants.js';
import { setTemporaryFlag } from '../core/utils/math.js';
import { isLinearPath } from '../core/utils/typeChecks.js';

function triggerEchoUpdatesForPath(path) {
	if (!path.params?.echo?.enabled) return;

	const userPos = GeolocationManager.getUserPosition();
	if (!userPos) return;

	const sounds = Selectors.getSounds();
	for (const sound of sounds) {
		if (sound.params.reflections?.enabled && sound.params.reflections?.include?.includes(path.id)) {
			AppState.dispatch({
				type: 'AUDIO_ECHO_UPDATE_REQUESTED',
				payload: { sound, userPos }
			});
		}
	}
}

export function renderControlPath(path, options = {}) {
	const { map, isLinearPath, renderLineOrPolygon, renderCircle, renderOval } = options;

	if (path.pathLine) map.removeLayer(path.pathLine);
	if (path.pathCircle) map.removeLayer(path.pathCircle);
	if (path.polygon) map.removeLayer(path.polygon);
	if (path.hintLine) map.removeLayer(path.hintLine);
	if (path.toleranceLayer) map.removeLayer(path.toleranceLayer);
	if (path.toleranceInner) map.removeLayer(path.toleranceInner);
	path.pointMarkers.forEach(m => map.removeLayer(m));
	if (path.labelMarker) map.removeLayer(path.labelMarker);

	path.pointMarkers = [];
	path.hintLine = null;
	path.toleranceLayer = null;
	path.toleranceInner = null;

	if (isLinearPath(path)) {
		renderLineOrPolygon(path);
	} else if (path.type === 'circle') {
		renderCircle(path);
	} else if (path.type === 'oval') {
		renderOval(path);
	}
}

export function getOffsetPolyline(points, offsetMeters) {
	return Geometry.getOffsetPolyline(points, offsetMeters);
}

export function renderLineOrPolygonPath(path, options = {}) {
	const { map, getSmoothedPoints, createPathLabel, showMenu, Geometry, Selectors, CONSTANTS, deleteControlPath, ModalSystem } = options;

	if (path.points.length < 2 && path.type !== 'polygon') return;
	if (path.points.length < 3 && path.type === 'polygon') return;

	const renderPoints = path.type === 'polygon' ? [...path.points, path.points[0]] : [...path.points];
	const smoothedPoints = path.smoothing > 0 ?
		getSmoothedPoints(path.points, path.smoothing, path.type === 'polygon') : renderPoints;

	if (path.tolerance > 0) {
		const outerPoints = getOffsetPolyline(smoothedPoints, path.tolerance, map);
		const innerPoints = getOffsetPolyline(smoothedPoints, -path.tolerance, map).reverse();
		const corridorPoints = [...outerPoints, ...innerPoints];

		path.toleranceLayer = L.polygon(corridorPoints, {
			color: path.color,
			weight: 0,
			opacity: 0.1,
			fillOpacity: 0.2,
			pane: 'controlPathBack'
		}).addTo(map);
	}

	path.pathLine = L.polyline(smoothedPoints, {
		color: path.color,
		className: 'control-path-line',
		weight: 3,
		dashArray: '5, 5',
		pane: 'controlPathBack'
	}).addTo(map);

	if (path.type === 'line') {
		path.pathLine.on('click', async (e) => {
			L.DomEvent.stopPropagation(e);

			if (Selectors.getSelectionMode() === 'click') {
				options.SelectionController?.toggleElement(path.id, 'path');
				return;
			}

			if (e.originalEvent.shiftKey) {
				if (await ModalSystem.confirm(`Delete path "${path.label}"?`, 'Delete Path')) {
					deleteControlPath(path);
				}
				return;
			}

			const clickPoint = e.latlng;
			let minDist = Infinity;
			let insertIndex = -1;

			for (let i = 0; i < path.points.length - 1; i++) {
				const start = path.points[i];
				const end = path.points[i + 1];

				const closestPoint = Geometry.getClosestPointOnLineSegment(clickPoint, start, end);
				const dist = map.distance(clickPoint, closestPoint);

				if (dist < minDist) {
					minDist = dist;
					insertIndex = i + 1;
				}
			}

			if (minDist < CONSTANTS.MARKER_CLICK_THRESHOLD) {
				path.points.splice(insertIndex, 0, clickPoint);
				options.renderPath(path);
			}
		});
	}

	if (path.smoothing > 0) {
		path.hintLine = L.polyline(renderPoints, {
			color: path.color,
			className: 'control-path-hint',
			weight: 2,
			opacity: 0.25,
			dashArray: '2, 2'
		}).addTo(map);
	}

	if (path.type === 'polygon') {
		const polygonOpacity = path.smoothing > 0 ? 0.25 : 0.7;
		path.polygon = L.polygon(path.points, {
			color: path.color,
			className: 'control-path-polygon',
			weight: 3,
			dashArray: '5, 5',
			fill: false,
			opacity: polygonOpacity,
			pane: 'controlPathBack'
		}).addTo(map);

		path.polygon.on('click', async (e) => {
			L.DomEvent.stopPropagation(e);

			if (Selectors.getSelectionMode() === 'click') {
				options.SelectionController?.toggleElement(path.id, 'path');
				return;
			}

			if (e.originalEvent.shiftKey) {
				if (await ModalSystem.confirm(`Delete path "${path.label}"?`, 'Delete Path')) {
					deleteControlPath(path);
				}
				return;
			}

			const clickPoint = e.latlng;
			let minDist = Infinity;
			let insertIndex = -1;

			for (let i = 0; i < path.points.length; i++) {
				const start = path.points[i];
				const end = path.points[(i + 1) % path.points.length];

				const closestPoint = Geometry.getClosestPointOnLineSegment(clickPoint, start, end);
				const dist = map.distance(clickPoint, closestPoint);

				if (dist < minDist) {
					minDist = dist;
					insertIndex = i + 1;
				}
			}

			if (minDist < CONSTANTS.MARKER_CLICK_THRESHOLD) {
				path.points.splice(insertIndex, 0, clickPoint);
				options.renderPath(path);
			}
		});
	}

	path.points.forEach((point, index) => {
		const marker = L.marker(point, {
			icon: L.divIcon({
				html: '<div class="path-point"></div>',
				className: 'custom-div-icon',
				iconSize: [10, 10],
				iconAnchor: [5, 5]
			}),
			draggable: true,
			pane: 'controlPathFront'
		}).addTo(map);

		marker.on('dragstart', (e) => {
			e.originalEvent?.stopPropagation();
			path.isDragging = true;
			AppState.dispatch({ type: 'UI_PATH_DRAG_STARTED' });
		});

		marker.on('drag', () => {
			path.points[index] = marker.getLatLng();
			const isClosed = path.type === 'polygon';
			const renderPoints = isClosed ? [...path.points, path.points[0]] : [...path.points];
			const smoothedPoints = path.smoothing > 0 ?
				getSmoothedPoints(path.points, path.smoothing, isClosed) : renderPoints;
			path.pathLine.setLatLngs(smoothedPoints);
			if (path.toleranceLayer) {
				const smoothedPointsDrag = path.smoothing > 0 ?
					getSmoothedPoints(path.points, path.smoothing, path.type === 'polygon') : renderPoints;
				const outerPoints = getOffsetPolyline(smoothedPointsDrag, path.tolerance, map);
				const innerPoints = getOffsetPolyline(smoothedPointsDrag, -path.tolerance, map).reverse();
				path.toleranceLayer.setLatLngs([...outerPoints, ...innerPoints]);
			}
			if (path.hintLine) {
				path.hintLine.setLatLngs(renderPoints);
			}
			if (path.polygon) {
				path.polygon.setLatLngs(path.points);
			}
			if (path.labelMarker) {
				const offset = CONSTANTS.LABEL_OFFSET_M / CONSTANTS.METERS_PER_LAT;
				path.labelMarker.setLatLng(L.latLng(path.points[0].lat - offset, path.points[0].lng));
			}
			AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
		});

		marker.on('dragend', () => {
			path.isDragging = false;
			AppState.dispatch({ type: 'UI_PATH_DRAG_ENDED' });
			path.originalPoints = path.points.map(p => L.latLng(p.lat, p.lng));

			if (path.params?.lfo?._phaseOffsets) {
				const now = Tone.now();
				path.params.lfo._phaseOffsets.x = now;
				path.params.lfo._phaseOffsets.y = now;
			}

			setTemporaryFlag(AppState.ui, 'justDraggedPath', CONSTANTS.DRAG_END_COOLDOWN_MS);
			AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
			triggerEchoUpdatesForPath(path);
		});

		marker.on('click', (e) => {
			e.originalEvent.stopPropagation();
			if (Selectors.getSelectionMode() === 'click') {
				options.SelectionController?.toggleElement(path.id, 'path');
				return;
			}
			const minPoints = path.type === 'polygon' ? 3 : 2;

			if (e.originalEvent.shiftKey && path.points.length > minPoints) {
				path.points.splice(index, 1);
				map.removeLayer(marker);
				path.pointMarkers.splice(path.pointMarkers.indexOf(marker), 1);
				options.renderPath(path);
				return;
			}

			showMenu(e.containerPoint, path);
		});

		path.pointMarkers.push(marker);
	});

	const labelOffset = CONSTANTS.LABEL_OFFSET_M / CONSTANTS.METERS_PER_LAT;
	const labelPos = L.latLng(path.points[0].lat - labelOffset, path.points[0].lng);
	createPathLabel(path, labelPos);
}

export function renderCirclePath(path, options = {}) {
	const { map, addMarkers } = options;

	if (!path.center || !path.radius) return;

	if (path.tolerance > 0) {
		path.toleranceLayer = L.circle(path.center, {
			radius: path.radius + path.tolerance,
			color: path.color,
			weight: 2,
			opacity: 0.2,
			fill: false,
			pane: 'controlPathBack'
		}).addTo(map);

		path.toleranceInner = L.circle(path.center, {
			radius: Math.max(0, path.radius - path.tolerance),
			color: path.color,
			weight: 2,
			opacity: 0.2,
			fill: false,
			pane: 'controlPathBack'
		}).addTo(map);
	}

	path.pathCircle = L.circle(path.center, {
		radius: path.radius,
		color: path.color,
		className: 'control-path-circle',
		weight: 3,
		dashArray: '5, 5',
		fill: false,
		pane: 'controlPathBack'
	}).addTo(map);

	addMarkers(path);
}

export function renderOvalPath(path, options = {}) {
	const { map, generateOvalPoints, addMarkers } = options;

	if (!path.center || !path.radius || !path.radiusY) return;

	if (path.tolerance > 0) {
		const outerPoints = generateOvalPoints(path.center, path.radius + path.tolerance, path.radiusY + path.tolerance, CONSTANTS.OVAL_RESOLUTION);
		path.toleranceLayer = L.polyline(outerPoints, {
			color: path.color,
			weight: 2,
			opacity: 0.2,
			fill: false
		}).addTo(map);

		const innerPoints = generateOvalPoints(path.center, Math.max(0, path.radius - path.tolerance), Math.max(0, path.radiusY - path.tolerance), CONSTANTS.OVAL_RESOLUTION);
		path.toleranceInner = L.polyline(innerPoints, {
			color: path.color,
			weight: 2,
			opacity: 0.2,
			fill: false
		}).addTo(map);
	}

	const points = generateOvalPoints(path.center, path.radius, path.radiusY, CONSTANTS.OVAL_RESOLUTION);
	path.pathCircle = L.polyline(points, {
		color: path.color,
		className: 'control-path-circle',
		weight: 3,
		dashArray: '5, 5'
	}).addTo(map);

	addMarkers(path);
}

export function addCirclePathMarkers(path, options = {}) {
	const { map, Geometry, showMenu, createPathLabel, CONSTANTS, deleteControlPath, ModalSystem } = options;

	const centerMarker = L.marker(path.center, {
		icon: L.divIcon({
			html: '<div class="path-point"></div>',
			className: 'custom-div-icon',
			iconSize: [10, 10],
			iconAnchor: [5, 5]
		}),
		draggable: true,
		pane: 'controlPathFront'
	}).addTo(map);

	centerMarker.on('dragstart', (e) => {
		e.originalEvent?.stopPropagation();
		path.isDragging = true;
		path._dragStartPos = centerMarker.getLatLng();
		AppState.dispatch({ type: 'UI_PATH_DRAG_STARTED' });
	});

	centerMarker.on('drag', () => {
		const currentPos = centerMarker.getLatLng();

		if (Selectors.isSelectionMoving() && Selectors.isElementSelected(path.id, 'path') && path._dragStartPos) {
			const deltaLat = currentPos.lat - path._dragStartPos.lat;
			const deltaLng = currentPos.lng - path._dragStartPos.lng;
			options.SelectionActions?.moveSelected(deltaLat, deltaLng, path.id);
		}

		path.center = currentPos;
		path.pathCircle.setLatLng(path.center);
		if (path.toleranceLayer) path.toleranceLayer.setLatLng(path.center);
		if (path.toleranceInner) path.toleranceInner.setLatLng(path.center);
		const radiusHandle = path.pointMarkers[1];
		if (radiusHandle) radiusHandle.setLatLng(Geometry.computeEdgeLatLng(path.center, path.radius));
		if (path.labelMarker) {
			const edgePos = Geometry.computeEdgeLatLng(path.center, path.radius, 'label');
			const offset = CONSTANTS.LABEL_OFFSET_M / CONSTANTS.METERS_PER_LAT;
			path.labelMarker.setLatLng(L.latLng(edgePos.lat - offset, edgePos.lng));
		}
		AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
	});

	centerMarker.on('dragend', () => {
		path.isDragging = false;
		AppState.dispatch({ type: 'UI_PATH_DRAG_ENDED' });
		path.originalCenter = L.latLng(path.center.lat, path.center.lng);

		if (path.params?.lfo?._phaseOffsets) {
			const now = Tone.now();
			path.params.lfo._phaseOffsets.x = now;
			path.params.lfo._phaseOffsets.y = now;
		}

		if (Selectors.isSelectionMoving()) {
			options.SelectionActions?.refreshMoveStartPositions();
		}

		delete path._dragStartPos;
		setTemporaryFlag(AppState.ui, 'justDraggedPath', CONSTANTS.DRAG_END_COOLDOWN_MS);
		AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
		triggerEchoUpdatesForPath(path);
	});

	centerMarker.on('click', async (e) => {
		e.originalEvent.stopPropagation();
		if (Selectors.getSelectionMode() === 'click') {
			options.SelectionController?.toggleElement(path.id, 'path');
			return;
		}
		if (e.originalEvent.shiftKey) {
			if (await ModalSystem.confirm(`Delete path "${path.label}"?`, 'Delete Path')) {
				deleteControlPath(path);
			}
		} else {
			showMenu(e.containerPoint, path);
		}
	});
	path.pointMarkers.push(centerMarker);

	const edgeLatLng = Geometry.computeEdgeLatLng(path.center, path.radius);
	const radiusHandle = L.marker(edgeLatLng, {
		icon: L.divIcon({
			html: '<div class="radius-handle"></div>',
			className: 'radius-handle-marker',
			iconSize: [12, 12],
			iconAnchor: [6, 6]
		}),
		draggable: true,
		pane: 'controlPathFront'
	}).addTo(map);

	radiusHandle.on('dragstart', (e) => {
		e.originalEvent?.stopPropagation();
		path.isDragging = true;
		AppState.dispatch({ type: 'UI_PATH_DRAG_STARTED' });
	});

	radiusHandle.on('drag', () => {
		const distance = map.distance(path.center, radiusHandle.getLatLng());
		path.radius = Math.max(CONSTANTS.MIN_RADIUS, Math.round(distance));
		path.pathCircle.setRadius(path.radius);
		if (path.toleranceLayer) path.toleranceLayer.setRadius(path.radius + path.tolerance);
		if (path.toleranceInner) path.toleranceInner.setRadius(Math.max(0, path.radius - path.tolerance));
		if (path.labelMarker) {
			const edgePos = Geometry.computeEdgeLatLng(path.center, path.radius, 'label');
			const offset = CONSTANTS.LABEL_OFFSET_M / CONSTANTS.METERS_PER_LAT;
			path.labelMarker.setLatLng(L.latLng(edgePos.lat - offset, edgePos.lng));
		}
		AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
	});

	radiusHandle.on('dragend', () => {
		path.isDragging = false;
		AppState.dispatch({ type: 'UI_PATH_DRAG_ENDED' });
		path.originalRadius = path.radius;

		if (path.params?.lfo?._phaseOffsets) {
			path.params.lfo._phaseOffsets.size = Tone.now();
		}

		setTemporaryFlag(AppState.ui, 'justDraggedPath', CONSTANTS.DRAG_END_COOLDOWN_MS);
		AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
		triggerEchoUpdatesForPath(path);
	});

	path.pointMarkers.push(radiusHandle);

	const labelOffset = CONSTANTS.LABEL_OFFSET_M / CONSTANTS.METERS_PER_LAT;
	const edgePos = Geometry.computeEdgeLatLng(path.center, path.radius, 'label');
	const labelPos = L.latLng(edgePos.lat - labelOffset, edgePos.lng);
	createPathLabel(path, labelPos);
}

export function addOvalPathMarkers(path, options = {}) {
	const { map, Geometry, generateOvalPoints, showMenu, createPathLabel, CONSTANTS, deleteControlPath, ModalSystem } = options;

	const centerMarker = L.marker(path.center, {
		icon: L.divIcon({
			html: '<div class="path-point"></div>',
			className: 'custom-div-icon',
			iconSize: [10, 10],
			iconAnchor: [5, 5]
		}),
		draggable: true,
		pane: 'controlPathFront'
	}).addTo(map);

	centerMarker.on('dragstart', (e) => {
		e.originalEvent?.stopPropagation();
		path.isDragging = true;
		path._dragStartPos = centerMarker.getLatLng();
		AppState.dispatch({ type: 'UI_PATH_DRAG_STARTED' });
	});

	centerMarker.on('drag', () => {
		const currentPos = centerMarker.getLatLng();

		if (Selectors.isSelectionMoving() && Selectors.isElementSelected(path.id, 'path') && path._dragStartPos) {
			const deltaLat = currentPos.lat - path._dragStartPos.lat;
			const deltaLng = currentPos.lng - path._dragStartPos.lng;
			options.SelectionActions?.moveSelected(deltaLat, deltaLng, path.id);
		}

		path.center = currentPos;
		const points = generateOvalPoints(path.center, path.radius, path.radiusY, CONSTANTS.OVAL_RESOLUTION);
		path.pathCircle.setLatLngs(points);
		if (path.toleranceLayer) {
			const outerPoints = generateOvalPoints(path.center, path.radius + path.tolerance, path.radiusY + path.tolerance, CONSTANTS.OVAL_RESOLUTION);
			path.toleranceLayer.setLatLngs(outerPoints);
		}
		if (path.toleranceInner) {
			const innerPoints = generateOvalPoints(path.center, Math.max(0, path.radius - path.tolerance), Math.max(0, path.radiusY - path.tolerance), CONSTANTS.OVAL_RESOLUTION);
			path.toleranceInner.setLatLngs(innerPoints);
		}
		const xHandle = path.pointMarkers[1];
		if (xHandle) xHandle.setLatLng(Geometry.computeEdgeLatLng(path.center, path.radius, 'handle'));
		const yHandle = path.pointMarkers[2];
		if (yHandle) {
			const yEdgeLatLng = L.latLng(
				path.center.lat + (path.radiusY / CONSTANTS.METERS_PER_LAT),
				path.center.lng
			);
			yHandle.setLatLng(yEdgeLatLng);
			if (path.labelMarker) {
				const offset = CONSTANTS.LABEL_OFFSET_M / CONSTANTS.METERS_PER_LAT;
				path.labelMarker.setLatLng(L.latLng(yEdgeLatLng.lat - offset, yEdgeLatLng.lng));
			}
		}
		AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
	});

	centerMarker.on('dragend', () => {
		path.isDragging = false;
		AppState.dispatch({ type: 'UI_PATH_DRAG_ENDED' });
		path.originalCenter = L.latLng(path.center.lat, path.center.lng);

		if (path.params?.lfo?._phaseOffsets) {
			const now = Tone.now();
			path.params.lfo._phaseOffsets.x = now;
			path.params.lfo._phaseOffsets.y = now;
		}

		if (Selectors.isSelectionMoving()) {
			options.SelectionActions?.refreshMoveStartPositions();
		}

		delete path._dragStartPos;
		setTemporaryFlag(AppState.ui, 'justDraggedPath', CONSTANTS.DRAG_END_COOLDOWN_MS);
		AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
		triggerEchoUpdatesForPath(path);
	});

	centerMarker.on('click', async (e) => {
		e.originalEvent.stopPropagation();
		if (Selectors.getSelectionMode() === 'click') {
			options.SelectionController?.toggleElement(path.id, 'path');
			return;
		}
		if (e.originalEvent.shiftKey) {
			if (await ModalSystem.confirm(`Delete path "${path.label}"?`, 'Delete Path')) {
				deleteControlPath(path);
			}
		} else {
			showMenu(e.containerPoint, path);
		}
	});
	path.pointMarkers.push(centerMarker);

	const xHandle = L.marker(Geometry.computeEdgeLatLng(path.center, path.radius, 'handle'), {
		icon: L.divIcon({
			html: '<div class="radius-handle"></div>',
			className: 'radius-handle-marker',
			iconSize: [12, 12],
			iconAnchor: [6, 6]
		}),
		draggable: true,
		pane: 'controlPathFront'
	}).addTo(map);

	xHandle.on('dragstart', (e) => {
		e.originalEvent?.stopPropagation();
		path.isDragging = true;
		AppState.dispatch({ type: 'UI_PATH_DRAG_STARTED' });
	});

	xHandle.on('drag', () => {
		const pos = xHandle.getLatLng();
		const constrainedPos = L.latLng(path.center.lat, pos.lng);
		xHandle.setLatLng(constrainedPos);
		const distance = map.distance(path.center, constrainedPos);
		path.radius = Math.max(10, Math.round(distance));
		const points = generateOvalPoints(path.center, path.radius, path.radiusY, CONSTANTS.OVAL_RESOLUTION);
		path.pathCircle.setLatLngs(points);
		if (path.toleranceLayer) {
			const outerPoints = generateOvalPoints(path.center, path.radius + path.tolerance, path.radiusY + path.tolerance, CONSTANTS.OVAL_RESOLUTION);
			path.toleranceLayer.setLatLngs(outerPoints);
		}
		if (path.toleranceInner) {
			const innerPoints = generateOvalPoints(path.center, Math.max(0, path.radius - path.tolerance), Math.max(0, path.radiusY - path.tolerance), CONSTANTS.OVAL_RESOLUTION);
			path.toleranceInner.setLatLngs(innerPoints);
		}
		AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
	});

	xHandle.on('dragend', () => {
		path.isDragging = false;
		AppState.dispatch({ type: 'UI_PATH_DRAG_ENDED' });
		path.originalRadius = path.radius;

		if (path.params?.lfo?._phaseOffsets) {
			path.params.lfo._phaseOffsets.size = Tone.now();
		}

		setTemporaryFlag(AppState.ui, 'justDraggedPath', CONSTANTS.DRAG_END_COOLDOWN_MS);
		AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
		triggerEchoUpdatesForPath(path);
	});

	path.pointMarkers.push(xHandle);

	const labelOffset = CONSTANTS.LABEL_OFFSET_M / CONSTANTS.METERS_PER_LAT;
	const yEdgeLatLng = L.latLng(
		path.center.lat + (path.radiusY / CONSTANTS.METERS_PER_LAT),
		path.center.lng
	);
	const yHandle = L.marker(yEdgeLatLng, {
		icon: L.divIcon({
			html: '<div class="radius-handle"></div>',
			className: 'radius-handle-marker',
			iconSize: [12, 12],
			iconAnchor: [6, 6]
		}),
		draggable: true,
		pane: 'controlPathFront'
	}).addTo(map);

	yHandle.on('dragstart', (e) => {
		e.originalEvent?.stopPropagation();
		path.isDragging = true;
		AppState.dispatch({ type: 'UI_PATH_DRAG_STARTED' });
	});

	yHandle.on('drag', () => {
		const pos = yHandle.getLatLng();
		const constrainedPos = L.latLng(pos.lat, path.center.lng);
		yHandle.setLatLng(constrainedPos);
		const distance = map.distance(path.center, constrainedPos);
		path.radiusY = Math.max(10, Math.round(distance));
		const points = generateOvalPoints(path.center, path.radius, path.radiusY, CONSTANTS.OVAL_RESOLUTION);
		path.pathCircle.setLatLngs(points);
		if (path.toleranceLayer) {
			const outerPoints = generateOvalPoints(path.center, path.radius + path.tolerance, path.radiusY + path.tolerance, CONSTANTS.OVAL_RESOLUTION);
			path.toleranceLayer.setLatLngs(outerPoints);
		}
		if (path.toleranceInner) {
			const innerPoints = generateOvalPoints(path.center, Math.max(0, path.radius - path.tolerance), Math.max(0, path.radiusY - path.tolerance), CONSTANTS.OVAL_RESOLUTION);
			path.toleranceInner.setLatLngs(innerPoints);
		}
		if (path.labelMarker) {
			path.labelMarker.setLatLng(L.latLng(constrainedPos.lat - labelOffset, constrainedPos.lng));
		}
		AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
	});

	yHandle.on('dragend', () => {
		path.isDragging = false;
		AppState.dispatch({ type: 'UI_PATH_DRAG_ENDED' });
		path.originalRadiusY = path.radiusY;

		if (path.params?.lfo?._phaseOffsets) {
			path.params.lfo._phaseOffsets.size = Tone.now();
		}

		setTemporaryFlag(AppState.ui, 'justDraggedPath', CONSTANTS.DRAG_END_COOLDOWN_MS);
		AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
		triggerEchoUpdatesForPath(path);
	});

	path.pointMarkers.push(yHandle);

	const labelPos = L.latLng(yEdgeLatLng.lat - labelOffset, yEdgeLatLng.lng);
	createPathLabel(path, labelPos);
}

export function updateControlPathPosition(path, deltaLat, deltaLng, options = {}) {
	const { isCircularPath, generateOvalPoints, getSmoothedPoints, getOffsetPolyline, map } = options;

	if (isCircularPath(path)) {
		path.center = L.latLng(path.center.lat + deltaLat, path.center.lng + deltaLng);
	} else {
		path.points = path.points.map(p => L.latLng(p.lat + deltaLat, p.lng + deltaLng));
	}

	if (path.pathCircle) {
		if (path.type === 'circle') {
			path.pathCircle.setLatLng(path.center);
			if (path.toleranceLayer) path.toleranceLayer.setLatLng(path.center);
			if (path.toleranceInner) path.toleranceInner.setLatLng(path.center);
		} else if (path.type === 'oval') {
			const points = generateOvalPoints(path.center, path.radius, path.radiusY, CONSTANTS.OVAL_RESOLUTION);
			path.pathCircle.setLatLngs(points);
			if (path.toleranceLayer) {
				const outerPoints = generateOvalPoints(path.center, path.radius + path.tolerance, path.radiusY + path.tolerance, CONSTANTS.OVAL_RESOLUTION);
				path.toleranceLayer.setLatLngs(outerPoints);
			}
			if (path.toleranceInner) {
				const innerPoints = generateOvalPoints(path.center, Math.max(0, path.radius - path.tolerance), Math.max(0, path.radiusY - path.tolerance), CONSTANTS.OVAL_RESOLUTION);
				path.toleranceInner.setLatLngs(innerPoints);
			}
		}
	} else if (path.pathLine) {
		const isClosed = path.type === 'polygon';
		const renderPoints = isClosed ? [...path.points, path.points[0]] : path.points;
		const smoothedPoints = path.smoothing > 0 ?
			getSmoothedPoints(path.points, path.smoothing, isClosed) : renderPoints;
		path.pathLine.setLatLngs(smoothedPoints);
		if (path.toleranceLayer) {
			const outerPoints = getOffsetPolyline(smoothedPoints, path.tolerance, map);
			const innerPoints = getOffsetPolyline(smoothedPoints, -path.tolerance, map).reverse();
			path.toleranceLayer.setLatLngs([...outerPoints, ...innerPoints]);
		}

		if (path.polygon) {
			path.polygon.setLatLngs(path.points);
		}
		if (path.hintLine) {
			path.hintLine.setLatLngs(renderPoints);
		}
	}

	path.pointMarkers.forEach((marker, i) => {
		const currentPos = marker.getLatLng();
		marker.setLatLng([currentPos.lat + deltaLat, currentPos.lng + deltaLng]);
	});

	if (path.labelMarker) {
		const currentPos = path.labelMarker.getLatLng();
		path.labelMarker.setLatLng([currentPos.lat + deltaLat, currentPos.lng + deltaLng]);
	}
}

export function updatePathVisibility(path, options = {}) {
	const { map, shouldBeVisible } = options;

	const isVisible = shouldBeVisible(path);
	const opacity = isVisible ? 1 : 0.3;

	if (path.pathLine) {
		if (!map.hasLayer(path.pathLine)) map.addLayer(path.pathLine);
		path.pathLine.setStyle({ opacity });
	}
	if (path.pathCircle) {
		if (!map.hasLayer(path.pathCircle)) map.addLayer(path.pathCircle);
		path.pathCircle.setStyle({ opacity });
	}
	if (path.polygon) {
		if (!map.hasLayer(path.polygon)) map.addLayer(path.polygon);
		path.polygon.setStyle({ opacity });
	}
	if (path.hintLine) {
		if (!map.hasLayer(path.hintLine)) map.addLayer(path.hintLine);
		path.hintLine.setStyle({ opacity });
	}
	if (path.toleranceLayer) {
		if (!map.hasLayer(path.toleranceLayer)) map.addLayer(path.toleranceLayer);
		path.toleranceLayer.setStyle({ opacity });
	}
	if (path.toleranceInner) {
		if (!map.hasLayer(path.toleranceInner)) map.addLayer(path.toleranceInner);
		path.toleranceInner.setStyle({ opacity });
	}
	if (path.labelMarker) {
		if (!map.hasLayer(path.labelMarker)) map.addLayer(path.labelMarker);
		const iconEl = path.labelMarker.getElement();
		if (iconEl) iconEl.style.opacity = opacity;
	}
	path.pointMarkers.forEach(marker => {
		if (!map.hasLayer(marker)) map.addLayer(marker);
		const el = marker.getElement();
		if (el) el.style.opacity = opacity;
	});
}

export function shouldPathBeVisible(path, LayerManager) {
	if (!LayerManager.layers.control) return false;

	if (!path.layers || path.layers.length === 0) return true;

	const userLayers = path.layers.filter(layerId =>
		layerId.startsWith('user_') &&
		LayerManager.userLayers.some(layer => layer.id === layerId && layer.visible)
	);

	return userLayers.length > 0;
}
