import { AppState } from '../core/state/StateManager.js';
import { Selectors } from '../core/state/selectors.js';
import { GeolocationManager } from '../core/geospatial/GeolocationManager.js';
import { CONSTANTS } from '../core/constants.js';

export const SimulationController = {
	showControls(mode, options = {}) {
		const simControls = document.getElementById('simulationControls');
		const statusText = document.getElementById('simulationStatusText');
		const goBtn = document.getElementById('calculateRouteBtn');

		if (mode === 'off') {
			simControls.classList.remove('active');
			return;
		}

		simControls.classList.add('active');

		switch (mode) {
			case 'point-to-point-placement':
				statusText.textContent = "Place a target.";
				goBtn.style.display = 'block';
				break;
			case 'point-to-point-ready':
				statusText.textContent = "Drag to adjust, then press Go.";
				goBtn.style.display = 'block';
				break;
			case 'path':
				statusText.innerHTML = `Simulating on path: <strong>${options.pathName || ''}</strong>`;
				goBtn.style.display = 'none';
				break;
		}
	},

	startPlacement(map, placeTargetHandler) {
		AppState.dispatch({ type: 'SIMULATION_PLACEMENT_STARTED' });
		GeolocationManager.toggleFollowGPS(false);
		GeolocationManager.stopWatching();
		this.showControls('point-to-point-placement');

		map.getContainer().classList.add('drawing-mode');

		map.once('click', placeTargetHandler);
	},

	stop(map, placeTargetHandler) {
		Selectors.getSequencers().forEach(seq => {
			if (seq.enabled && seq.releaseOnStop) {
				seq._releaseAllNotes();
			}
		});
		AppState.dispatch({ type: 'SIMULATION_STOPPED' });
		AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
		if (AppState.simulation.animationState.frameId) {
			cancelAnimationFrame(AppState.simulation.animationState.frameId);
			AppState.simulation.animationState.frameId = null;
		}
		if (Selectors.getSimulationTarget()) {
			map.removeLayer(Selectors.getSimulationTarget());
			AppState.simulation.targetMarker = null;
		}
		this.showControls('off');
		map.getContainer().classList.remove('drawing-mode');
		map.off('click', placeTargetHandler);
	},

	placeTargetHandler(e, map) {
		map.getContainer().classList.remove('drawing-mode');
		AppState.dispatch({ type: 'SIMULATION_PLACEMENT_STOPPED' });

		if (Selectors.getSimulationTarget()) {
			map.removeLayer(Selectors.getSimulationTarget());
		}

		AppState.simulation.targetMarker = L.marker(e.latlng, {
			draggable: true,
			icon: L.divIcon({
				html: '<i class="fas fa-flag-checkered icon-danger icon-lg"></i>',
				className: 'custom-div-icon',
				iconSize: CONSTANTS.SIM_TARGET_ICON_SIZE,
				iconAnchor: CONSTANTS.SIM_TARGET_ICON_ANCHOR
			})
		}).addTo(map);

		this.showControls('point-to-point-ready');
	}
};
