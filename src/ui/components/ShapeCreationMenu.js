import { createElement, createButton } from '../domHelpers.js';
import { AppState } from '../../core/state/StateManager.js';

let context = null;

export function setContext(ctx) {
	context = ctx;
}

const SHAPE_DEFINITIONS = [
	{
		id: 'circle',
		label: 'Circle',
		icon: 'fa-circle-notch',
		description: 'Click to place center'
	},
	{
		id: 'polygon',
		label: 'Polygon',
		icon: 'fa-draw-polygon',
		description: 'Click to place'
	},
	{
		id: 'line',
		label: 'Line',
		icon: 'fa-bezier-curve',
		description: 'Click points, dbl-click to finish'
	},
	{
		id: 'oval',
		label: 'Oval',
		icon: 'fa-circle',
		description: 'Click to place center'
	}
];

export function createShapeCreationMenu() {
	const menu = createElement('div', 'shape-creation-menu');

	const header = createElement('div', 'shape-menu-header');
	const title = createElement('h3');
	title.textContent = 'Create Element';
	header.appendChild(title);

	const closeBtn = createButton('×', () => hideShapeCreationMenu(), 'menu-close-btn');
	header.appendChild(closeBtn);
	menu.appendChild(header);

	const grid = createElement('div', 'shape-grid');

	const soundColumn = createElement('div', 'shape-column sound-column');
	const soundHeader = createElement('h4', 'column-header');
	soundHeader.innerHTML = '<i class="fas fa-volume-up"></i> Sound';
	soundColumn.appendChild(soundHeader);

	SHAPE_DEFINITIONS.forEach(shape => {
		const btn = createShapeButton(shape, 'sound');
		soundColumn.appendChild(btn);
	});

	const pathColumn = createElement('div', 'shape-column path-column');
	const pathHeader = createElement('h4', 'column-header');
	pathHeader.innerHTML = '<i class="fas fa-route"></i> Path';
	pathColumn.appendChild(pathHeader);

	SHAPE_DEFINITIONS.forEach(shape => {
		const btn = createShapeButton(shape, 'path');
		pathColumn.appendChild(btn);
	});

	grid.appendChild(soundColumn);
	grid.appendChild(pathColumn);
	menu.appendChild(grid);

	return menu;
}

function createShapeButton(shape, elementType) {
	const btn = createElement('button', 'shape-btn');
	btn.innerHTML = `
		<i class="fas ${shape.icon}"></i>
		<span class="shape-label">${shape.label}</span>
	`;
	btn.title = shape.description;
	btn.dataset.shape = shape.id;
	btn.dataset.elementType = elementType;

	btn.onclick = () => {
		hideShapeCreationMenu();
		startShapeDrawing(elementType, shape.id);
	};

	return btn;
}

function startShapeDrawing(elementType, shapeId) {
	if (elementType === 'sound') {
		context.startSoundShapeDrawing(shapeId);
	} else {
		switch (shapeId) {
			case 'circle':
				context.startCirclePathDrawing();
				break;
			case 'polygon':
				context.startPolygonPathDrawing();
				break;
			case 'line':
				context.startLinePathDrawing();
				break;
			case 'oval':
				context.startOvalPathDrawing();
				break;
		}
	}
}

export function showShapeCreationMenu(point) {
	let menu = document.getElementById('shapeCreationMenu');

	if (!menu) {
		menu = createShapeCreationMenu();
		menu.id = 'shapeCreationMenu';
		document.body.appendChild(menu);
	}

	if (point) {
		const menuWidth = 300;
		const menuHeight = 280;

		let left = point.x;
		let top = point.y;

		if (left + menuWidth > window.innerWidth) {
			left = window.innerWidth - menuWidth - 10;
		}
		if (top + menuHeight > window.innerHeight) {
			top = window.innerHeight - menuHeight - 10;
		}

		menu.style.left = `${Math.max(10, left)}px`;
		menu.style.top = `${Math.max(10, top)}px`;
	} else {
		menu.style.left = '50%';
		menu.style.top = '50%';
		menu.style.transform = 'translate(-50%, -50%)';
	}

	menu.classList.add('active');

	if (!AppState.ui.menuState) {
		AppState.ui.menuState = {};
	}
	AppState.ui.menuState.shapeMenuVisible = true;
}

export function hideShapeCreationMenu() {
	const menu = document.getElementById('shapeCreationMenu');
	if (menu) {
		menu.classList.remove('active');
		menu.style.transform = '';
	}

	if (AppState.ui.menuState) {
		AppState.ui.menuState.shapeMenuVisible = false;
	}
}

export function toggleShapeCreationMenu(point) {
	const menu = document.getElementById('shapeCreationMenu');
	if (menu && menu.classList.contains('active')) {
		hideShapeCreationMenu();
	} else {
		showShapeCreationMenu(point);
	}
}
