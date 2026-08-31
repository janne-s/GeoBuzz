import { Selectors } from '../core/state/selectors.js';
import { CONSTANTS } from '../core/constants.js';
import { gaussianRandom, toDegrees, toRadians } from '../core/utils/math.js';
import { KalmanFilter, gpsSmoothingToFilterOptions } from '../core/geospatial/KalmanFilter.js';
import { GpsInstabilityTracker } from '../core/geospatial/GpsInstabilityTracker.js';
import { GeolocationManager } from '../core/geospatial/GeolocationManager.js';
import { resetSpeedTracking } from '../core/audio/AudioEngine.js';

const state = {
	slowEast: 0,
	slowNorth: 0,
	fastEast: 0,
	fastNorth: 0,
	filter: null
};

function advanceOrnsteinUhlenbeck(value, tau, sigma, dt) {
	const decay = Math.exp(-dt / tau);
	return value * decay + sigma * Math.sqrt(1 - decay * decay) * gaussianRandom();
}

export const GpsNoise = {
	reportIntervalMs() {
		return Selectors.getSimulationNoise() > 0
			? CONSTANTS.SIMULATION_DEVICE_UPDATE_INTERVAL_MS
			: CONSTANTS.SIMULATION_UPDATE_INTERVAL_MS;
	},

	reset() {
		state.slowEast = 0;
		state.slowNorth = 0;
		state.fastEast = 0;
		state.fastNorth = 0;
		if (state.filter) {
			state.filter = null;
			GpsInstabilityTracker.reset();
			resetSpeedTracking();
		}
	},

	apply(position, dt) {
		const r68 = Selectors.getSimulationNoise();

		if (!(r68 > 0)) {
			GpsNoise.reset();
			return position;
		}
		if (!position || !(dt > 0)) return position;

		if (!state.filter) state.filter = new KalmanFilter();
		state.filter.updateOptions(gpsSmoothingToFilterOptions(GeolocationManager.getGpsSmoothing()));

		const sigma = r68 * CONSTANTS.SIMULATION_NOISE_R68_TO_SIGMA;
		const slowShare = CONSTANTS.SIMULATION_NOISE_SLOW_VARIANCE_SHARE;
		const slowSigma = sigma * Math.sqrt(slowShare);
		const fastSigma = sigma * Math.sqrt(1 - slowShare);
		const slowTau = CONSTANTS.SIMULATION_NOISE_SLOW_TAU_S;
		const fastTau = CONSTANTS.SIMULATION_NOISE_FAST_TAU_S;

		state.slowEast = advanceOrnsteinUhlenbeck(state.slowEast, slowTau, slowSigma, dt);
		state.slowNorth = advanceOrnsteinUhlenbeck(state.slowNorth, slowTau, slowSigma, dt);
		state.fastEast = advanceOrnsteinUhlenbeck(state.fastEast, fastTau, fastSigma, dt);
		state.fastNorth = advanceOrnsteinUhlenbeck(state.fastNorth, fastTau, fastSigma, dt);

		const east = state.slowEast + state.fastEast;
		const north = state.slowNorth + state.fastNorth;

		const rawPosition = {
			latitude: position.lat + toDegrees(north / CONSTANTS.EARTH_RADIUS_M),
			longitude: position.lng + toDegrees(east / (CONSTANTS.EARTH_RADIUS_M * Math.cos(toRadians(position.lat)))),
			accuracy: Math.max(
				CONSTANTS.SIMULATION_NOISE_ACCURACY_FLOOR_M,
				Math.hypot(east, north) * CONSTANTS.SIMULATION_NOISE_ACCURACY_FACTOR
			),
			timestamp: Date.now()
		};

		state.filter.update(rawPosition);
		const filtered = state.filter.getFiltered();

		if (!filtered || !Number.isFinite(filtered.lat) || !Number.isFinite(filtered.lon)) {
			return L.latLng(rawPosition.latitude, rawPosition.longitude);
		}

		GpsInstabilityTracker.update(filtered.accuracy, rawPosition.timestamp);
		GeolocationManager.updateAccuracyDisplay(rawPosition, filtered);

		return L.latLng(filtered.lat, filtered.lon);
	}
};
