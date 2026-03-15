import { AppState } from '../../core/state/StateManager.js';
import { Selectors } from '../../core/state/selectors.js';
import { createElement } from '../domHelpers.js';
import { createDraggableHeader, createElementNavigationDropdown } from './HeaderBuilder.js';

class MenuManagerClass {
	create(options) {
		const { point, title, content, keepOpen, onBeforeClose } = options;

		if (!keepOpen) {
			this.closeAll();
		}

		const overlay = createElement('div', 'menu-overlay');
		document.body.appendChild(overlay);

		const menu = createElement('div', 'context-menu');

		if (Selectors.getMenuCount() > 0) {
			const lastMenuRect = Selectors.getTopMenu().menu.getBoundingClientRect();
			menu.style.left = `${lastMenuRect.left + 30}px`;
			menu.style.top = `${lastMenuRect.top + 30}px`;
		} else if (Selectors.getLastMenuPosition()) {
			menu.style.left = `${Selectors.getLastMenuPosition().x}px`;
			menu.style.top = `${Selectors.getLastMenuPosition().y}px`;
		} else {
			menu.classList.add('centered-context-menu');
		}

		const baseZ = 12000;
		overlay.style.zIndex = baseZ + (Selectors.getMenuCount() * 2);
		menu.style.zIndex = baseZ + (Selectors.getMenuCount() * 2) + 1;

		const { header, cleanup: headerCleanup } = createDraggableHeader(menu, title, createElementNavigationDropdown(null, 'sound'));

		const menuData = {
			menu,
			overlay,
			onBeforeClose,
			headerCleanup,
			intervals: [],
			onClose: null
		};
		menu._menuData = menuData;

		menu.appendChild(header);
		menu.appendChild(content);

		delete menu._menuData;

		document.body.appendChild(menu);

		AppState.dispatch({
			type: 'UI_MENU_OPENED',
			payload: menuData
		});

		overlay.onclick = keepOpen ? this.closeTop : this.closeAll;
		header.querySelector('.menu-close-btn').onclick = keepOpen ? this.closeTop : this.closeAll;
	}

	closeTop() {
		if (Selectors.getMenuCount() === 0) return;
		const menuData = Selectors.getTopMenu();
		const { menu, overlay, onBeforeClose, headerCleanup, onClose, intervals } = menuData;

		AppState.dispatch({ type: 'UI_MENU_CLOSED_TOP' });

		if (onBeforeClose) {
			onBeforeClose();
		}

		if (typeof headerCleanup === 'function') {
			headerCleanup();
		}

		if (typeof onClose === 'function') {
			onClose();
		}

		if (intervals) {
			intervals.forEach(id => clearInterval(id));
		}

		if (menu) {
			menu.remove();
		}

		if (overlay) overlay.remove();
	}

	closeAll() {
		while (Selectors.getMenuCount() > 0) {
			MenuManager.closeTop();
		}
	}

	close(menu) {
		const index = Selectors.getMenus().findIndex(m => m.menu === menu);
		if (index === -1) return;

		const menuData = Selectors.getMenus()[index];
		const { overlay, onBeforeClose, headerCleanup, onClose, intervals } = menuData;

		if (onBeforeClose) onBeforeClose();
		if (typeof headerCleanup === 'function') headerCleanup();
		if (typeof onClose === 'function') onClose();
		if (intervals) intervals.forEach(id => clearInterval(id));

		if (menu) menu.remove();
		if (overlay) overlay.remove();

		Selectors.getMenus().splice(index, 1);
		AppState.dispatch({ type: 'UI_MENU_CLOSED', payload: { index } });
	}
}

export const MenuManager = new MenuManagerClass();

MenuManager.closeTop = MenuManager.closeTop.bind(MenuManager);
MenuManager.closeAll = MenuManager.closeAll.bind(MenuManager);
