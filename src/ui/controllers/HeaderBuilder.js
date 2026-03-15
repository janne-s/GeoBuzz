import { AppState } from '../../core/state/StateManager.js';
import { Selectors } from '../../core/state/selectors.js';
import { createElement } from '../domHelpers.js';
import { appContext } from '../../core/AppContext.js';

let context = null;

export function setContext(appCtx) {
	context = appCtx;
}

export function createCloseButton(onClose) {
	const closeBtn = createElement('button', 'menu-close-btn');
	closeBtn.innerHTML = '×';
	closeBtn.onclick = (e) => {
		e.stopPropagation();
		onClose();
	};
	return closeBtn;
}

export function createDraggableHeader(menu, title = 'Sound Settings', elementNav = null) {
	const header = createElement('div', 'context-menu-header');

	if (elementNav) {
		header.appendChild(elementNav);
	}

	const titleSpan = createElement('span', 'menu-title');
	titleSpan.textContent = title;
	header.appendChild(titleSpan);

	header.titleElement = titleSpan;

	const closeBtn = createCloseButton(() => context.MenuManager.closeTop());
	header.appendChild(closeBtn);

	let startClientX = 0,
		startClientY = 0;
	let startLeft = 0,
		startTop = 0;
	let isDragging = false;

	function onMouseMove(e) {
		if (!isDragging) return;
		const dx = e.clientX - startClientX;
		const dy = e.clientY - startClientY;
		menu.style.left = `${Math.round(startLeft + dx)}px`;
		menu.style.top = `${Math.round(startTop + dy)}px`;
	}

	function onMouseUp() {
		if (!isDragging) return;
		isDragging = false;
		menu.classList.remove('dragging');
		AppState.ui.menuState.isDragging = false;
		const rect = menu.getBoundingClientRect();
		AppState.ui.menuState.lastMenuPosition = { x: rect.left, y: rect.top };
		document.removeEventListener('mousemove', onMouseMove);
		document.removeEventListener('mouseup', onMouseUp);
	}

	header.addEventListener('mousedown', (e) => {
		if (e.target.closest('.menu-close-btn, select, input, .element-nav-dropdown')) return;
		if (context.innerWidth <= 768) return;
		if (e.button !== 0) return;

		e.preventDefault();

		const rect = menu.getBoundingClientRect();
		startClientX = e.clientX;
		startClientY = e.clientY;
		startLeft = rect.left;
		startTop = rect.top;
		menu.style.left = `${startLeft}px`;
		menu.style.top = `${startTop}px`;
		menu.style.transform = 'none';
		menu.classList.remove('centered-context-menu');
		menu.classList.add('dragging');
		AppState.ui.menuState.isDragging = true;
		isDragging = true;

		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
	});

	const cleanup = () => {
		if (isDragging) {
			isDragging = false;
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
		}
	};

	return { header, cleanup };
}

export function createElementNavigationDropdown(currentElement, currentType) {
	const navContainer = createElement('div', 'element-nav-dropdown');

	const select = document.createElement('select');
	select.title = 'Jump to element';

	const createGroup = (label, items, type) => {
		if (items.length === 0) return;

		const sortedItems = [...items].sort((a, b) => {
			const labelA = (a.label || a.name || '').toLowerCase();
			const labelB = (b.label || b.name || '').toLowerCase();
			return labelA.localeCompare(labelB);
		});

		const group = document.createElement('optgroup');
		group.label = label;

		sortedItems.forEach(item => {
			const itemId = type === 'sound' ?
				item.marker?._leaflet_id :
				item.id;
			const option = document.createElement('option');
			option.value = JSON.stringify({ id: itemId, type });
			option.textContent = item.label || item.name;

			if (currentType === type) {
				const currentId = currentType === 'sound' ?
					currentElement?.marker?._leaflet_id :
					currentElement?.id;
				if (currentId === itemId) {
					option.selected = true;
				}
			}

			group.appendChild(option);
		});

		select.appendChild(group);
	};

	createGroup('Sounds', Selectors.getSounds(), 'sound');
	createGroup('Paths', Selectors.getPaths(), 'path');
	createGroup('Sequencers', Selectors.getSequencers(), 'sequencer');
	createGroup('Layers', context.LayerManager.userLayers, 'layer');

	select.onchange = () => {
		if (!select.value) return;
		const { id, type } = JSON.parse(select.value);

		const activeSideMenu = Selectors.getActiveSideMenu();
		if (activeSideMenu) {
			activeSideMenu.classList.remove('active');

			for (const key in context.Menus) {
				if (context.Menus[key].menu === activeSideMenu) {
					context.Menus[key].toggle.classList.remove('active');
					break;
				}
			}

			AppState.dispatch({
				type: 'UI_SIDE_MENU_TOGGLED',
				payload: { menu: activeSideMenu, wasActive: true }
			});
		}

		const currentMenu = Selectors.getTopMenu()?.menu;
		const rect = currentMenu?.getBoundingClientRect();
		const point = rect ? { x: rect.left, y: rect.top } : { x: context.innerWidth / 2, y: context.innerHeight / 2 };

		context.MenuManager.closeTop();

		if (type === 'sound') {
			const sound = AppState.getSound(id);
			if (sound) context.showSoundMenu(point, sound.marker, true);
		} else if (type === 'path') {
			const path = AppState.getPath(id);
			if (path) context.showPathMenu(point, path);
		} else if (type === 'sequencer') {
			const seq = AppState.getSequencer(id);
			if (seq) context.SequencerUIManager.showSequencerPanel(point, seq);
		} else if (type === 'layer') {
			const layer = context.LayerManager.getUserLayer(id);
			if (layer) context.showLayerFXDialog(layer);
		}
	};

	navContainer.appendChild(select);
	return navContainer;
}
