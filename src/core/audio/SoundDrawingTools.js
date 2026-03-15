import { AppState } from '../state/StateManager.js';
import { Selectors } from '../state/selectors.js';
import { Geometry } from '../geospatial/Geometry.js';
import { CONSTANTS } from '../constants.js';
import { showDrawingIndicator, hideDrawingIndicator } from '../../interactions/DrawingTools.js';

let context = null;

export function setContext(ctx) {
	context = ctx;
}

export function startSoundShapeDrawing(shapeType) {
	cancelSoundDrawing();
	context.cancelPathDrawing();

	const mode = `sound_${shapeType}`;

	AppState.dispatch({
		type: 'DRAWING_MODE_CHANGED',
		payload: { mode }
	});

	context.map.getContainer().classList.add('drawing-mode');

	if (shapeType === 'circle' || shapeType === 'polygon' || shapeType === 'oval') {
		showDrawingIndicator('Click to place sound.');
		context.map.on('click', handleSingleClickPlacement);
	} else if (shapeType === 'line') {
		AppState.drawing.currentSoundPoints = [];
		AppState.drawing.tempSoundMarkers = [];
		AppState.drawing.pendingSoundColor = AppState.getNextColor();
		showDrawingIndicator('Click to add points. Press Enter or click here to finish.', finishSoundLine);
		context.map.on('click', handleLineDrawingClick);
		context.map.on('dblclick', finishSoundLine);
	}
}

function handleSingleClickPlacement(e) {
	context.L.DomEvent.stopPropagation(e);
	const mode = Selectors.getDrawingMode();
	const latlng = e.latlng;

	if (mode === 'sound_circle') {
		context.audioFunctions.addSound(latlng, { shapeType: 'circle' });
	} else if (mode === 'sound_polygon') {
		context.audioFunctions.addSound(latlng, { shapeType: 'polygon' });
	} else if (mode === 'sound_oval') {
		context.audioFunctions.addSoundOval(latlng);
	}

	cancelSoundDrawing();
}

function handleLineDrawingClick(e) {
	context.L.DomEvent.stopPropagation(e);

	if (!AppState.drawing.currentSoundPoints) {
		AppState.drawing.currentSoundPoints = [];
	}
	AppState.drawing.currentSoundPoints.push(e.latlng);
	redrawTempSoundLine();
}

function redrawTempSoundLine() {
	if (AppState.drawing.tempSoundLine) {
		context.map.removeLayer(AppState.drawing.tempSoundLine);
	}
	if (AppState.drawing.tempSoundMarkers) {
		AppState.drawing.tempSoundMarkers.forEach(marker => context.map.removeLayer(marker));
	}
	AppState.drawing.tempSoundMarkers = [];

	const points = AppState.drawing.currentSoundPoints;

	if (points.length >= 2) {
		AppState.drawing.tempSoundLine = context.L.polyline(points, {
			color: AppState.drawing.pendingSoundColor,
			weight: 3,
			dashArray: '5, 5',
			opacity: 0.7
		}).addTo(context.map);
	}

	points.forEach(p => {
		const marker = context.L.circleMarker(p, {
			radius: 5,
			color: '#ff6b6b',
			fillColor: '#fff',
			fillOpacity: 1
		}).addTo(context.map);
		AppState.drawing.tempSoundMarkers.push(marker);
	});
}

export function finishSoundLine() {
	const points = AppState.drawing.currentSoundPoints;

	if (!points || points.length < 2) {
		alert('A line sound needs at least 2 points.');
		cancelSoundDrawing();
		return;
	}

	context.audioFunctions.addSoundLine(points, { color: AppState.drawing.pendingSoundColor });
	cancelSoundDrawing();
}

export function cancelSoundDrawing() {
	AppState.dispatch({
		type: 'DRAWING_MODE_CHANGED',
		payload: { mode: null }
	});

	context.map.getContainer().classList.remove('drawing-mode');

	if (AppState.drawing.tempSoundLine) {
		context.map.removeLayer(AppState.drawing.tempSoundLine);
		AppState.drawing.tempSoundLine = null;
	}

	if (AppState.drawing.tempSoundMarkers) {
		AppState.drawing.tempSoundMarkers.forEach(marker => {
			try { context.map.removeLayer(marker); } catch (e) {}
		});
		AppState.drawing.tempSoundMarkers = [];
	}

	AppState.drawing.currentSoundPoints = [];
	AppState.drawing.pendingSoundColor = null;

	context.map.off('click', handleSingleClickPlacement);
	context.map.off('click', handleLineDrawingClick);
	context.map.off('dblclick', finishSoundLine);

	hideDrawingIndicator();
}
