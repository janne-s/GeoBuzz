import { CONSTANTS } from '../constants.js';

export class OrientationKalmanFilter {
	constructor(options = {}) {
		this.options = {
			...CONSTANTS.ORIENTATION_FILTER_DEFAULTS,
			...options
		};

		this.rawHeadings = [];
		this.lastReportedHeading = 0;
		this.lastReportedTime = 0;
		this.isInitialized = false;

		this.x = 0;
		this.v = 0;
		this.P_pos = 1;
		this.P_vel = 1;
	}

	_normalizeAngle(angle) {
		while (angle > 180) angle -= 360;
		while (angle < -180) angle += 360;
		return angle;
	}

	_angleDifference(a, b) {
		let diff = a - b;
		while (diff > 180) diff -= 360;
		while (diff < -180) diff += 360;
		return diff;
	}

	_medianFilter(headings) {
		if (headings.length === 0) return null;
		if (headings.length === 1) return headings[0];

		const reference = headings[0].heading;
		const normalized = headings.map(h => ({
			...h,
			normalized: reference + this._angleDifference(h.heading, reference)
		}));

		const sorted = normalized
			.map(h => h.normalized)
			.sort((a, b) => a - b);

		const mid = Math.floor(sorted.length / 2);
		const medianHeading = sorted[mid];

		let finalHeading = medianHeading;
		while (finalHeading >= 360) finalHeading -= 360;
		while (finalHeading < 0) finalHeading += 360;

		return {
			heading: finalHeading,
			accuracy: headings[mid].accuracy,
			timestamp: headings[mid].timestamp
		};
	}

	_kalmanPredict(dt) {
		this.x = this.x + this.v * dt;
		this.P_pos = this.P_pos + dt * (2 * this.P_vel + dt * this.options.sigmaAcc * this.options.sigmaAcc);
		this.P_vel = this.P_vel + dt * this.options.sigmaAcc * this.options.sigmaAcc;

		while (this.x >= 360) this.x -= 360;
		while (this.x < 0) this.x += 360;
	}

	_kalmanUpdate(measurement) {
		const innovation = this._angleDifference(measurement.heading, this.x);
		const R = measurement.accuracy * measurement.accuracy;

		const K_pos = this.P_pos / (this.P_pos + R);
		const K_vel = this.P_vel / (this.P_pos + R);

		this.x = this.x + K_pos * innovation;
		this.v = this.v + K_vel * innovation;

		this.P_pos = (1 - K_pos) * this.P_pos;
		this.P_vel = this.P_vel - K_vel * this.P_pos;

		while (this.x >= 360) this.x -= 360;
		while (this.x < 0) this.x += 360;
	}

	update(heading) {
		const { value, accuracy, timestamp } = heading;

		if (!this.isInitialized) {
			this.x = value;
			this.v = 0;
			this.lastReportedHeading = value;
			this.lastReportedTime = timestamp;
			this.isInitialized = true;
		}

		const newHeading = { heading: value, accuracy, timestamp };

		const lastHeading = this.rawHeadings.length > 0
			? this.rawHeadings[this.rawHeadings.length - 1]
			: { heading: this.lastReportedHeading, timestamp: this.lastReportedTime };

		const dt = (timestamp - lastHeading.timestamp) / 1000.0;

		if (dt > 0) {
			const angleDiff = Math.abs(this._angleDifference(value, lastHeading.heading));
			const angularSpeed = angleDiff / dt;

			if (angularSpeed > this.options.maxAngularSpeed) {
				console.warn(`Orientation outlier rejected: ${angularSpeed.toFixed(1)} deg/s`);
				return;
			}
		}

		this.rawHeadings.push(newHeading);
		if (this.rawHeadings.length > this.options.windowSize) {
			this.rawHeadings.shift();
		}

		const medianHeading = this._medianFilter(this.rawHeadings);
		if (!medianHeading) return;

		if (dt > 0) {
			this._kalmanPredict(dt);
		}

		this._kalmanUpdate(medianHeading);

		const angleMoved = Math.abs(this._angleDifference(this.x, this.lastReportedHeading));
		const timeHeld = (timestamp - this.lastReportedTime) / 1000.0;

		if (angleMoved > this.options.minMove || timeHeld > this.options.holdTime) {
			this.lastReportedHeading = this.x;
			this.lastReportedTime = timestamp;
		}
	}

	getFiltered() {
		if (!this.isInitialized) return null;

		return {
			heading: Math.round(this.lastReportedHeading),
			angularVelocity: this.v,
			accuracy: Math.sqrt(this.P_pos),
			timestamp: this.lastReportedTime
		};
	}
}
