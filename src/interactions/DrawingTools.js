import { AppState } from '../core/state/StateManager.js';
import { Selectors } from '../core/state/selectors.js';
import { Geometry } from '../core/geospatial/Geometry.js';
import { CONSTANTS } from '../core/constants.js';

let context = null;

export function setContext(ctx) {
	context = ctx;
}

export function startPolygonPathDrawing() {
	cancelPathDrawing();
	context.cancelSoundDrawing();

	AppState.dispatch({
		type: 'DRAWING_MODE_CHANGED',
		payload: { mode: 'polygon' }
	});
	context.map.getContainer().classList.add('drawing-mode');

	showDrawingIndicator('Click to set center.');

	context.map.on('click', addPolygonPathPoint);
}

function addPolygonPathPoint(e) {
	context.L.DomEvent.stopPropagation(e);
	const center = e.latlng;
	const size = CONSTANTS.DEFAULT_POLYGON_SIZE;
	const points = Geometry.createDefaultSquare(center, size);
	context.audioFunctions.createControlPath('polygon', { points: points });
	cancelPathDrawing();
}

export function startOvalPathDrawing() {
	cancelPathDrawing();
	context.cancelSoundDrawing();

	AppState.dispatch({
		type: 'DRAWING_MODE_CHANGED',
		payload: { mode: 'oval' }
	});
	context.map.getContainer().classList.add('drawing-mode');

	showDrawingIndicator('Click to set center.');

	context.map.on('click', addOvalPathPoint);
}

function addOvalPathPoint(e) {
	context.L.DomEvent.stopPropagation(e);
	const center = e.latlng;
	const radius = CONSTANTS.DEFAULT_CIRCLE_RADIUS;
	const radiusY = CONSTANTS.DEFAULT_OVAL_RADIUS_Y;

	context.audioFunctions.createControlPath('oval', {
		center: context.L.latLng(center.lat, center.lng),
		radius: radius,
		radiusY: radiusY
	});

	cancelPathDrawing();
}

export function startLinePathDrawing() {
	cancelPathDrawing();
	context.cancelSoundDrawing();

	AppState.dispatch({
		type: 'DRAWING_MODE_CHANGED',
		payload: { mode: 'line' }
	});
	AppState.drawing.currentPathPoints = [];
	AppState.drawing.tempMarkers = [];
	context.map.getContainer().classList.add('drawing-mode');
	showDrawingIndicator('Click to add points. Shift+click to remove points. Press Enter or click here to finish.', finishLinePath);
	context.map.on('click', handleLinePathDrawingClick);
	context.map.on('dblclick', finishLinePath);
}

function handleLinePathDrawingClick(e) {
	Selectors.getCurrentPathPoints().push(e.latlng);
	redrawTempPath();
}

function redrawTempPath() {
	if (Selectors.getTempPathLine()) context.map.removeLayer(Selectors.getTempPathLine());
	if (Selectors.getTempMarkers()) {
		Selectors.getTempMarkers().forEach(marker => context.map.removeLayer(marker));
	}
	AppState.drawing.tempMarkers = [];

	if (Selectors.getCurrentPathPoints().length >= 2) {
		AppState.drawing.tempPathLine = context.L.polyline(Selectors.getCurrentPathPoints(), { color: '#ff6b6b', weight: 3, dashArray: '5, 5', opacity: 0.7 }).addTo(context.map);
	}

	Selectors.getCurrentPathPoints().forEach(p => {
		const marker = context.L.circleMarker(p, { radius: 5, color: '#ff6b6b', fillColor: '#fff', fillOpacity: 1 }).addTo(context.map);
		Selectors.getTempMarkers().push(marker);
	});
}

export function startCirclePathDrawing() {
	cancelPathDrawing();
	context.cancelSoundDrawing();

	AppState.dispatch({
		type: 'DRAWING_MODE_CHANGED',
		payload: { mode: 'circle' }
	});
	context.map.getContainer().classList.add('drawing-mode');

	showDrawingIndicator('Click to set center.');

	context.map.on('click', addCirclePathPoint);
}

function addCirclePathPoint(e) {
	context.L.DomEvent.stopPropagation(e);
	const center = e.latlng;
	const radius = CONSTANTS.DEFAULT_CIRCLE_RADIUS;

	context.audioFunctions.createControlPath('circle', {
		center: context.L.latLng(center.lat, center.lng),
		radius: radius
	});

	cancelPathDrawing();
}

export function finishPolygonPath() {
	if (Selectors.getCurrentPathPoints().length < 3) {
		alert('A polygon path needs at least 3 points.');
		cancelPathDrawing();
		return;
	}

	const points = Selectors.getCurrentPathPoints().map(p => context.L.latLng(p.lat, p.lng));
	context.audioFunctions.createControlPath('polygon', {
		points: points,
		center: Geometry.calculateCentroid(points)
	});

	cancelPathDrawing();
}

export function finishOvalPath(center, radiusX, radiusY) {
	context.audioFunctions.createControlPath('oval', {
		center: context.L.latLng(center.lat, center.lng),
		radius: radiusX,
		radiusY: radiusY
	});

	cancelPathDrawing();
}

export function finishLinePath() {
	if (Selectors.getCurrentPathPoints().length < 2) {
		alert('A line path needs at least 2 points.');
		cancelPathDrawing();
		return;
	}

	context.audioFunctions.createControlPath('line', {
		points: Selectors.getCurrentPathPoints().map(p => context.L.latLng(p.lat, p.lng))
	});

	cancelPathDrawing();
}

export function finishCirclePath(center, radius) {
	context.audioFunctions.createControlPath('circle', {
		center: context.L.latLng(center.lat, center.lng),
		radius: radius
	});

	cancelPathDrawing();
}

export function cancelPathDrawing() {
	AppState.dispatch({
		type: 'DRAWING_MODE_CHANGED',
		payload: { mode: null }
	});
	context.map.getContainer().classList.remove('drawing-mode');

	if (Selectors.getTempPathLine()) {
		context.map.removeLayer(Selectors.getTempPathLine());
		AppState.drawing.tempPathLine = null;
	}
	if (Selectors.getTempMarkers()) {
		Selectors.getTempMarkers().forEach(marker => {
			try { context.map.removeLayer(marker); } catch (e) {}
		});
		AppState.drawing.tempMarkers = [];
	}

	AppState.drawing.currentPathPoints = [];

	context.map.off('click', handleLinePathDrawingClick);
	context.map.off('click', addCirclePathPoint);
	context.map.off('click', addPolygonPathPoint);
	context.map.off('click', addOvalPathPoint);
	context.map.off('dblclick', finishLinePath);
	context.map.off('dblclick', finishPolygonPath);

	hideDrawingIndicator();
}

export function showDrawingIndicator(text, onClickFinish = null) {
	if (!Selectors.getDrawingIndicator()) {
		AppState.drawing.drawingIndicator = document.createElement('div');
		Selectors.getDrawingIndicator().className = 'drawing-mode-active';
		document.body.appendChild(Selectors.getDrawingIndicator());
	}

	const indicator = Selectors.getDrawingIndicator();
	indicator.textContent = text;

	if (indicator._clickHandler) {
		indicator.removeEventListener('click', indicator._clickHandler);
		indicator._clickHandler = null;
	}

	if (onClickFinish) {
		indicator.classList.add('clickable');
		indicator._clickHandler = (e) => {
			e.stopPropagation();
			onClickFinish();
		};
		indicator.addEventListener('click', indicator._clickHandler);
	} else {
		indicator.classList.remove('clickable');
	}
}

export function hideDrawingIndicator() {
	if (Selectors.getDrawingIndicator()) {
		Selectors.getDrawingIndicator().remove();
		AppState.drawing.drawingIndicator = null;
	}
}
