import { AppState } from '../core/state/StateManager.js';
import { Selectors } from '../core/state/selectors.js';
import { CONSTANTS } from '../core/constants.js';

export function simulationSpeedMs(dt) {
	const baseMs = (Selectors.getSimulationSpeed() * 1000) / 3600 * Selectors.getSimulationSpeedScale();
	const variability = Selectors.getSimulationVariability();
	let speedMs = baseMs;

	if (variability <= 0) {
		AppState.simulation.animationState.speedOffset = 0;
	} else {
		const reversion = Math.min(1, CONSTANTS.SIMULATION_VARIABILITY_REVERSION * dt);
		const step = (Math.random() * 2 - 1) * variability * reversion;
		let offset = AppState.simulation.animationState.speedOffset * (1 - reversion) + step;
		offset = Math.max(-1, Math.min(1, offset));
		AppState.simulation.animationState.speedOffset = offset;
		speedMs = Math.max(baseMs * CONSTANTS.SIMULATION_MIN_SPEED_FACTOR, baseMs * (1 + offset));
	}

	AppState.simulation.animationState.currentSpeedMs = speedMs;
	return speedMs;
}
