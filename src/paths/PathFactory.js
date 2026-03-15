import { AppState } from '../core/state/StateManager.js';
import { Selectors } from '../core/state/selectors.js';
import { Geometry } from '../core/geospatial/Geometry.js';
import { PATH_COLORS, CONSTANTS } from '../core/constants.js';
import { setTemporaryFlag, deepClone, centripetalCatmullRomPoint } from '../core/utils/math.js';
import { DEFAULT_LFO_STRUCTURE } from '../config/defaults.js';

export function createControlPath(type, data = {}, options = {}) {
	const { renderPath, refreshList, updateCounts } = options;
	const pathId = `path_${AppState.drawing.pathCount++}`;
	const color = data.color || PATH_COLORS[Selectors.getPaths().length % PATH_COLORS.length];

	let center = data.center || null;
	if (!center && type === 'polygon' && data.points && data.points.length >= 3) {
		center = Geometry.calculateCentroid(data.points);
	}

	const path = {
		id: pathId,
		type: type,
		label: data.label || `Path ${AppState.drawing.pathCount}`,
		isDragging: false,
		layers: data.layers || [],
		color: color,
		points: data.points || [],
		center: center,
		radius: data.radius || CONSTANTS.DEFAULT_CIRCLE_RADIUS,
		radiusY: data.radiusY || (type === 'oval' ? CONSTANTS.DEFAULT_OVAL_RADIUS_Y : null),
		originalPoints: data.points ? data.points.map(p => L.latLng(p.lat, p.lng)) : [],
		originalCenter: center ? L.latLng(center.lat, center.lng) : null,
		originalRadius: data.radius || CONSTANTS.DEFAULT_CIRCLE_RADIUS,
		originalRadiusY: data.radiusY || (type === 'oval' ? CONSTANTS.DEFAULT_OVAL_RADIUS_Y : null),
		speed: data.speed || 1.0,
		relativeSpeed: data.relativeSpeed || 1.0,
		smoothing: data.smoothing || 0,
		tolerance: data.tolerance || 0,
		direction: data.direction || 'forward',
		loop: data.loop !== undefined ? data.loop : true,
		visible: true,
		pathLine: null,
		pathCircle: null,
		pointMarkers: [],
		labelMarker: null,
		attachedSounds: [],
		params: {
			lfo: data.params?.lfo || deepClone(DEFAULT_LFO_STRUCTURE),
			echo: data.params?.echo || undefined,
			silencer: data.params?.silencer || undefined
		}
	};

	if (renderPath) renderPath(path);
	AppState.dispatch({ type: 'PATH_ADDED', payload: { path } });
	if (refreshList) refreshList();
	if (updateCounts) updateCounts();

	setTemporaryFlag(AppState.ui, 'justCreatedPath', CONSTANTS.DRAG_END_COOLDOWN_MS);

	return path;
}

export function createAndAttachPathLabel(path, position, options = {}) {
	const { map, showMenu, isCircularPath, LabelDragHandler, Selectors, SelectionController, deleteControlPath, ModalSystem } = options;

	if (path.labelMarker) {
		map.removeLayer(path.labelMarker);
	}

	const labelIcon = L.divIcon({
		html: `<div class="path-label">${path.label}</div>`,
		className: 'custom-div-icon',
		iconSize: [0, 0],
		iconAnchor: [0, 0]
	});

	path.labelMarker = L.marker(position, {
		icon: labelIcon,
		interactive: true,
		draggable: true
	}).addTo(map);

	path.labelMarker.on('click', async (e) => {
		L.DomEvent.stopPropagation(e);
		if (Selectors.justDraggedMarker() || Selectors.justDraggedPath()) return;
		if (Selectors.getSelectionMode() === 'click') {
			SelectionController?.toggleElement(path.id, 'path');
			return;
		}
		if (e.originalEvent.shiftKey && deleteControlPath && ModalSystem) {
			if (await ModalSystem.confirm(`Delete path "${path.label}"?`, 'Delete Path')) {
				deleteControlPath(path);
			}
			return;
		}
		showMenu(e.containerPoint, path);
	});

	LabelDragHandler.attachTo(path.labelMarker, path, 'path');
}

export function getSmoothedPathPoints(points, smoothing = 0, isClosed = false) {
	if (!points || points.length < (isClosed ? 3 : 2) || smoothing <= 0) {
		return isClosed ? [...points, points[0]] : points;
	}

	const n = points.length;
	const newPts = [];
	const alpha = Math.min(1, smoothing);
	const samplesPerSegment = 10;
	const loopEnd = isClosed ? n : n - 1;

	for (let i = 0; i < loopEnd; i++) {
		const p0 = isClosed ? points[(i - 1 + n) % n] : (i > 0 ? points[i - 1] : points[i]);
		const p1 = points[i];
		const p2 = isClosed ? points[(i + 1) % n] : points[i + 1];
		const p3 = isClosed ? points[(i + 2) % n] : (i < n - 2 ? points[i + 2] : p2);

		if (i === 0 && !isClosed) {
			newPts.push(p1);
		}

		for (let j = 1; j <= samplesPerSegment; j++) {
			const t = j / samplesPerSegment;
			const pt = centripetalCatmullRomPoint(p0, p1, p2, p3, t);

			const originalLat = p1.lat + (p2.lat - p1.lat) * t;
			const originalLng = p1.lng + (p2.lng - p1.lng) * t;

			newPts.push(L.latLng(
				(1 - alpha) * originalLat + alpha * pt.lat,
				(1 - alpha) * originalLng + alpha * pt.lng
			));
		}
	}

	if (isClosed && newPts.length > 0) {
		newPts.push(newPts[0]);
	}

	return newPts;
}

export function computePathLength(path, map) {
	if (!path) return 0;

	if (path.type === 'circle') {
		return CONSTANTS.TWO_PI * path.radius;
	} else if (path.type === 'oval') {
		const a = Math.max(path.radius, path.radiusY);
		const b = Math.min(path.radius, path.radiusY);
		return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
	} else if (path.type === 'polygon') {
		const pts = (path.smoothing && path.smoothing > 0) ?
			getSmoothedPathPoints(path.points, path.smoothing, true) : [...path.points, path.points[0]];
		let total = 0;
		for (let i = 0; i < pts.length - 1; i++) {
			total += map.distance(pts[i], pts[i + 1]);
		}
		return total;
	} else {
		const pts = (path.smoothing && path.smoothing > 0) ?
			getSmoothedPathPoints(path.points, path.smoothing) : path.points;
		let total = 0;
		for (let i = 0; i < pts.length - 1; i++) {
			total += map.distance(pts[i], pts[i + 1]);
		}
		return total;
	}
}

export function generateOvalPoints(center, radiusX, radiusY, numPoints) {
	const points = [];
	const earthRadius = CONSTANTS.EARTH_RADIUS_M;

	for (let i = 0; i <= numPoints; i++) {
		const angle = (i / numPoints) * CONSTANTS.TWO_PI;
		const x = radiusX * Math.cos(angle);
		const y = radiusY * Math.sin(angle);

		const deltaLat = (y / earthRadius) * (180 / Math.PI);
		const deltaLng = (x / earthRadius) * (180 / Math.PI) / Math.cos(center.lat * Math.PI / 180);

		points.push(L.latLng(center.lat + deltaLat, center.lng + deltaLng));
	}

	return points;
}

export function duplicatePath(originalPath, createPath) {
	const offset = 0.001;
	const newPoints = originalPath.points
		? originalPath.points.map(p => L.latLng(p.lat + offset, p.lng + offset))
		: null;
	const newData = {
		label: `${originalPath.label} Copy`,
		color: originalPath.color,
		type: originalPath.type,
		points: newPoints,
		center: originalPath.center ? L.latLng(originalPath.center.lat + offset, originalPath.center.lng + offset) : null,
		radius: originalPath.radius,
		radiusY: originalPath.radiusY,
		relativeSpeed: originalPath.relativeSpeed,
		smoothing: originalPath.smoothing,
		loop: originalPath.loop,
		direction: originalPath.direction,
		params: {
			lfo: deepClone(originalPath.params.lfo),
			echo: originalPath.params.echo ? deepClone(originalPath.params.echo) : undefined,
			silencer: originalPath.params?.silencer || undefined
		}
	};
	return createPath(originalPath.type, newData);
}

export function attachUserToPath(pathId, options = {}) {
	const { GeolocationManager, showSimulationControls, stopSimulation, Selectors, animateUserOnPath } = options;

	AppState.simulation.userAttachedPathId = pathId;
	const path = AppState.getPath(pathId);
	if (!path) return;

	GeolocationManager.toggleFollowGPS(false);
	GeolocationManager.stopWatching();

	if (Selectors.isSimulationActive()) {
		stopSimulation();
	}

	if (AppState.simulation.animationState.frameId) {
		cancelAnimationFrame(AppState.simulation.animationState.frameId);
		AppState.simulation.animationState.frameId = null;
	}

	showSimulationControls('path', { pathName: path.label });

	AppState.simulation.userPathAnimationState = {
		frameId: null,
		startTime: performance.now(),
		lastUpdateTime: performance.now(),
		distance: 0,
		direction: 1,
		behavior: 'forward'
	};

	if (AppState.simulation.userPathAnimationState.frameId) {
		cancelAnimationFrame(AppState.simulation.userPathAnimationState.frameId);
	}
	AppState.simulation.userPathAnimationState.frameId = requestAnimationFrame(animateUserOnPath);
}

export function detachUserFromPath(showSimulationControls) {
	if (AppState.simulation.userPathAnimationState.frameId) {
		cancelAnimationFrame(AppState.simulation.userPathAnimationState.frameId);
		AppState.simulation.userPathAnimationState.frameId = null;
	}
	AppState.simulation.userAttachedPathId = null;
	AppState.simulation.currentEffectiveSpeed = 0;
	showSimulationControls('off');
}
