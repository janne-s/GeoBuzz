import { CONSTANTS } from '../constants.js';

class GpsInstabilityTrackerClass {
	constructor() {
		this.slowBaseline = null;
		this.instabilitySmoothed = 0;
		this.signedSmoothed = 0;
		this.lastUpdateTime = null;
		this.reactivity = CONSTANTS.GPS_INSTABILITY_REACTIVITY_DEFAULT;
		this.config = { ...CONSTANTS.GPS_INSTABILITY_CONFIG };
	}

	update(filteredAccuracy, timestamp) {
		const now = timestamp || Date.now();

		if (this.lastUpdateTime === null) {
			this.lastUpdateTime = now;
			this.slowBaseline = filteredAccuracy;
			return;
		}

		const dt = (now - this.lastUpdateTime) / 1000;
		this.lastUpdateTime = now;

		if (dt <= 0) return;

		const alphaBaseline = dt / (this.config.baselineTimeConstant + dt);
		this.slowBaseline += (filteredAccuracy - this.slowBaseline) * alphaBaseline;
		this.slowBaseline = Math.max(this.slowBaseline, 1);

		const signedDeviation = (filteredAccuracy - this.slowBaseline) / this.slowBaseline;
		const relative = Math.min(Math.abs(signedDeviation), 1.0);

		const alphaInstability = dt / (this.config.instabilityTimeConstant + dt);
		this.instabilitySmoothed += (relative - this.instabilitySmoothed) * alphaInstability;

		const sign = signedDeviation >= 0 ? 1 : -1;
		const signedTarget = relative * sign;
		this.signedSmoothed += (signedTarget - this.signedSmoothed) * alphaInstability;
	}

	getSignedValue() {
		const magnitude = Math.pow(this.instabilitySmoothed, this.config.shapeExponent);
		const sign = this.signedSmoothed >= 0 ? 1 : -1;
		return magnitude * sign * this.reactivity;
	}

	setReactivity(t) {
		this.reactivity = t;
		this.config.baselineTimeConstant = 120 - 105 * t;
		this.config.instabilityTimeConstant = 4.0 - 3.5 * t;
		this.config.shapeExponent = 2.0 - 1.2 * t;
	}

	reset() {
		this.slowBaseline = null;
		this.instabilitySmoothed = 0;
		this.signedSmoothed = 0;
		this.lastUpdateTime = null;
		this.reactivity = CONSTANTS.GPS_INSTABILITY_REACTIVITY_DEFAULT;
		this.config = { ...CONSTANTS.GPS_INSTABILITY_CONFIG };
	}
}

export const GpsInstabilityTracker = new GpsInstabilityTrackerClass();
