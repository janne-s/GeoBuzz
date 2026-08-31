import { CONSTANTS } from '../core/constants.js';

export function createMapPanes(map) {
	for (const [name, zIndex] of Object.entries(CONSTANTS.MAP_PANE_Z)) {
		map.createPane(name);
		map.getPane(name).style.zIndex = zIndex;
	}
}
