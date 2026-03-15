import { AppState } from '../core/state/StateManager.js';
import { Selectors } from '../core/state/selectors.js';
import { SelectionController } from './SelectionController.js';

let context = null;
let dragRect = null;
let startPoint = null;
let isActive = false;
let mapRef = null;
let initialSelection = null;

export function setDragSelectHandlerContext(appContext) {
	context = appContext;
}

function isClickOnInteractiveElement(e) {
	const target = e.originalEvent?.target;
	if (!target) return false;

	const interactiveClasses = [
		'leaflet-marker-icon',
		'leaflet-interactive',
		'sound-label',
		'path-label',
		'path-point',
		'soundIcon'
	];

	let el = target;
	while (el && el !== document.body) {
		if (interactiveClasses.some(cls => el.classList?.contains(cls))) {
			return true;
		}
		el = el.parentElement;
	}
	return false;
}

function onMouseDown(e) {
	if (Selectors.getSelectionMode() !== 'drag') return;
	if (e.originalEvent.button !== 0) return;
	if (isClickOnInteractiveElement(e)) return;

	isActive = true;
	startPoint = e.containerPoint;
	initialSelection = {
		sounds: Selectors.getSelectedSounds(),
		paths: Selectors.getSelectedPaths()
	};

	dragRect = document.createElement('div');
	dragRect.className = 'drag-select-rectangle';
	dragRect.style.left = startPoint.x + 'px';
	dragRect.style.top = startPoint.y + 'px';
	dragRect.style.width = '0px';
	dragRect.style.height = '0px';
	document.getElementById('map').appendChild(dragRect);
}

function onMouseMove(e) {
	if (!isActive || !dragRect || !startPoint) return;

	const currentPoint = e.containerPoint;
	const left = Math.min(startPoint.x, currentPoint.x);
	const top = Math.min(startPoint.y, currentPoint.y);
	const width = Math.abs(currentPoint.x - startPoint.x);
	const height = Math.abs(currentPoint.y - startPoint.y);

	dragRect.style.left = left + 'px';
	dragRect.style.top = top + 'px';
	dragRect.style.width = width + 'px';
	dragRect.style.height = height + 'px';

	const bounds = getSelectionBounds(startPoint, currentPoint);
	updateSelectionPreview(bounds);
}

function onMouseUp(e) {
	if (!isActive || !startPoint) return;

	finalizeSelection();
	cleanup();
}

function getSelectionBounds(start, end) {
	const sw = mapRef.containerPointToLatLng(L.point(
		Math.min(start.x, end.x),
		Math.max(start.y, end.y)
	));
	const ne = mapRef.containerPointToLatLng(L.point(
		Math.max(start.x, end.x),
		Math.min(start.y, end.y)
	));
	return L.latLngBounds(sw, ne);
}

function getElementsInBounds(bounds) {
	const sounds = Selectors.getSounds().filter(sound => {
		const pos = sound.marker.getLatLng();
		return bounds.contains(pos);
	}).map(s => s.id);

	const paths = Selectors.getPaths().filter(path => {
		if ((path.type === 'circle' || path.type === 'oval') && path.center) {
			return bounds.contains(path.center);
		} else if (path.points && path.points.length > 0) {
			return path.points.some(p => bounds.contains(p));
		}
		return false;
	}).map(p => p.id);

	return { sounds, paths };
}

function updateSelectionPreview(bounds) {
	if (!initialSelection) return;

	const inBounds = getElementsInBounds(bounds);

	AppState.dispatch({
		type: 'SELECTION_SET_ALL',
		payload: {
			sounds: [...new Set([...initialSelection.sounds, ...inBounds.sounds])],
			paths: [...new Set([...initialSelection.paths, ...inBounds.paths])],
			sequencers: []
		}
	});

	SelectionController.updateVisualIndicators();
}

function finalizeSelection() {
	SelectionController.showActionsBar();
}

function cleanup() {
	isActive = false;
	startPoint = null;
	initialSelection = null;
	if (dragRect) {
		dragRect.remove();
		dragRect = null;
	}
}

export const DragSelectHandler = {
	attach(map) {
		mapRef = map;
		map.on('mousedown', onMouseDown);
		map.on('mousemove', onMouseMove);
		map.on('mouseup', onMouseUp);
	},

	detach(map) {
		if (map) {
			map.off('mousedown', onMouseDown);
			map.off('mousemove', onMouseMove);
			map.off('mouseup', onMouseUp);
		}
		cleanup();
		mapRef = null;
	},

	cleanup
};
