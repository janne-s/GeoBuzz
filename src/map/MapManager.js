import { CONSTANTS } from '../core/constants.js';
import { tileLayers } from '../config/registries.js';
import { AppState } from '../core/state/StateManager.js';

export class MapManager {
	constructor() {
		this.map = null;
		this.currentMapStyle = 'Dark';
		this.currentTileLayer = null;
	}

	initialize() {
		this.map = L.map('map', {
			doubleClickZoom: false
		}).setView([0, 0], CONSTANTS.DEFAULT_FALLBACK_ZOOM);

		this.map.createPane('soundArea');
		this.map.createPane('controlPathBack');
		this.map.createPane('controlPathFront');
		this.map.createPane('soundElement');
		this.map.createPane('userMarker');

		this.currentTileLayer = L.tileLayer(tileLayers[this.currentMapStyle].url, {
			attribution: tileLayers[this.currentMapStyle].attribution
		}).addTo(this.map);

		this.populateStyleDropdown();

		return this.map;
	}

	populateStyleDropdown() {
		const mapStyleSelect = document.getElementById('mapStyleSelect');
		if (!mapStyleSelect) return;

		mapStyleSelect.innerHTML = '';

		Object.keys(tileLayers).forEach(layerName => {
			const option = document.createElement('option');
			option.value = layerName;
			option.textContent = layerName;
			option.selected = layerName === this.currentMapStyle;
			mapStyleSelect.appendChild(option);
		});

		mapStyleSelect.addEventListener('change', (e) => {
			this.changeStyle(e.target.value);
		});
	}

	changeStyle(styleName) {
		if (!tileLayers[styleName]) {
			console.error('Map style not found:', styleName);
			return;
		}

		this.map.removeLayer(this.currentTileLayer);

		this.currentMapStyle = styleName;
		this.currentTileLayer = L.tileLayer(tileLayers[styleName].url, {
			attribution: tileLayers[styleName].attribution
		}).addTo(this.map);

		const mapStyleSelect = document.getElementById('mapStyleSelect');
		if (mapStyleSelect) {
			mapStyleSelect.value = styleName;
		}

		AppState.dispatch({
			type: 'PARAMETER_CHANGED',
			payload: { paramKey: 'mapStyle', value: styleName }
		});
	}

	getMap() {
		return this.map;
	}

	getCurrentStyle() {
		return this.currentMapStyle;
	}
}
