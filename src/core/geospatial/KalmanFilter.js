import { CONSTANTS } from '../constants.js';

export class KalmanFilter {
	constructor(options = {}) {
		this.options = {
			...CONSTANTS.GEOLOCATION_FILTER_DEFAULTS,
			...options
		};

		this.origin = { lat: null, lon: null };
		this.rawPositions = [];
		this.lastReportedPosition = null;
		this.lastReportedTime = 0;
		this.isInitialized = false;

		this.x = [0, 0, 0, 0];
		this.P = [
			[1, 0, 0, 0],
			[0, 1, 0, 0],
			[0, 0, 1, 0],
			[0, 0, 0, 1]
		];
	}

	updateOptions(options) {
		Object.assign(this.options, options);
	}

	_latLonToXY(lat, lon) {
		const R = CONSTANTS.EARTH_RADIUS_M;
		const x = R * (lon - this.origin.lon) * Math.PI / 180 * Math.cos(this.origin.lat * Math.PI / 180);
		const y = R * (lat - this.origin.lat) * Math.PI / 180;
		return { x, y };
	}

	_xyToLatLon(x, y) {
		const R = CONSTANTS.EARTH_RADIUS_M;
		const dLat = y / R;
		const dLon = x / (R * Math.cos(this.origin.lat * Math.PI / 180));
		const lat = this.origin.lat + dLat * 180 / Math.PI;
		const lon = this.origin.lon + dLon * 180 / Math.PI;
		return { lat, lon };
	}

	_medianFilter(positions) {
		if (positions.length === 0) return null;
		if (positions.length === 1) return positions[0];

		const sortedX = positions.map(p => p.x).sort((a, b) => a - b);
		const sortedY = positions.map(p => p.y).sort((a, b) => a - b);
		const sortedAcc = positions.map(p => p.accuracy).sort((a, b) => a - b);

		const mid = Math.floor(positions.length / 2);

		return {
			x: sortedX[mid],
			y: sortedY[mid],
			accuracy: sortedAcc[mid],
			timestamp: positions[mid].timestamp
		};
	}

	_kalmanPredict(dt, currentSigmaAcc) {
		const F = [
			[1, 0, dt, 0],
			[0, 1, 0, dt],
			[0, 0, 1, 0],
			[0, 0, 0, 1]
		];

		const G = [
			[0.5 * dt * dt, 0],
			[0, 0.5 * dt * dt],
			[dt, 0],
			[0, dt]
		];

		const Q = [
			[G[0][0], G[0][1]],
			[G[1][0], G[1][1]],
			[G[2][0], G[2][1]],
			[G[3][0], G[3][1]]
		].map(row => row.map(val => val * currentSigmaAcc * currentSigmaAcc));

		const x_prime = [
			F[0][0] * this.x[0] + F[0][2] * this.x[2],
			F[1][1] * this.x[1] + F[1][3] * this.x[3],
			this.x[2],
			this.x[3]
		];

		const P_prime = [
			[0, 0, 0, 0],
			[0, 0, 0, 0],
			[0, 0, 0, 0],
			[0, 0, 0, 0]
		];
		for (let i = 0; i < 4; i++) {
			for (let j = 0; j < 4; j++) {
				let sum = 0;
				for (let k = 0; k < 4; k++) {
					sum += F[i][k] * this.P[k][j];
				}
				P_prime[i][j] = sum;
			}
		}
		for (let i = 0; i < 4; i++) {
			for (let j = 0; j < 4; j++) {
				let sum = 0;
				for (let k = 0; k < 4; k++) {
					sum += P_prime[i][k] * F[j][k];
				}
				this.P[i][j] = sum + Q[i][j];
			}
		}

		this.x = x_prime;
	}

	_kalmanUpdate(measurement) {
		const H = [
			[1, 0, 0, 0],
			[0, 1, 0, 0]
		];

		const R = [
			[measurement.accuracy * measurement.accuracy, 0],
			[0, measurement.accuracy * measurement.accuracy]
		];

		const y = [
			measurement.x - this.x[0],
			measurement.y - this.x[1]
		];

		const S = [
			[this.P[0][0] + R[0][0], this.P[0][1]],
			[this.P[1][0], this.P[1][1] + R[1][1]]
		];

		const S_inv_det = 1 / (S[0][0] * S[1][1] - S[0][1] * S[1][0]);
		const S_inv = [
			[S[1][1] * S_inv_det, -S[0][1] * S_inv_det],
			[-S[1][0] * S_inv_det, S[0][0] * S_inv_det]
		];

		const K = [
			[this.P[0][0] * S_inv[0][0] + this.P[0][1] * S_inv[1][0], this.P[0][0] * S_inv[0][1] + this.P[0][1] * S_inv[1][1]],
			[this.P[1][0] * S_inv[0][0] + this.P[1][1] * S_inv[1][0], this.P[1][0] * S_inv[0][1] + this.P[1][1] * S_inv[1][1]],
			[this.P[2][0] * S_inv[0][0] + this.P[2][1] * S_inv[1][0], this.P[2][0] * S_inv[0][1] + this.P[2][1] * S_inv[1][1]],
			[this.P[3][0] * S_inv[0][0] + this.P[3][1] * S_inv[1][0], this.P[3][0] * S_inv[0][1] + this.P[3][1] * S_inv[1][1]]
		];

		this.x[0] += K[0][0] * y[0] + K[0][1] * y[1];
		this.x[1] += K[1][0] * y[0] + K[1][1] * y[1];
		this.x[2] += K[2][0] * y[0] + K[2][1] * y[1];
		this.x[3] += K[3][0] * y[0] + K[3][1] * y[1];

		const I_KH = [
			[1 - K[0][0], -K[0][1]],
			[-K[1][0], 1 - K[1][1]],
			[-K[2][0], -K[2][1]],
			[-K[3][0], -K[3][1]]
		];

		const P_new = JSON.parse(JSON.stringify(this.P));
		for (let i = 0; i < 4; i++) {
			for (let j = 0; j < 4; j++) {
				this.P[i][j] = I_KH[i][0] * P_new[0][j] + I_KH[i][1] * P_new[1][j];
			}
		}
	}

	update(position) {
		const { latitude, longitude, accuracy, timestamp } = position;

		if (!this.isInitialized) {
			this.origin.lat = latitude;
			this.origin.lon = longitude;
			const { x, y } = this._latLonToXY(latitude, longitude);
			this.x = [x, y, 0, 0];
			this.lastReportedPosition = { x, y, accuracy, timestamp };
			this.lastReportedTime = timestamp;
			this.isInitialized = true;
		}

		const { x, y } = this._latLonToXY(latitude, longitude);
		const newPosition = { x, y, accuracy, timestamp };

		const lastPos = this.rawPositions.length > 0 ? this.rawPositions[this.rawPositions.length - 1] : this.lastReportedPosition;
		const dt = (timestamp - lastPos.timestamp) / 1000.0;
		if (dt > 0) {
			const dist = Math.sqrt(Math.pow(x - lastPos.x, 2) + Math.pow(y - lastPos.y, 2));
			const speed = dist / dt;
			if (speed > this.options.maxSpeed) {
				console.warn(`Outlier rejected: speed ${speed.toFixed(1)} m/s`);
				return;
			}
		}

		this.rawPositions.push(newPosition);
		if (this.rawPositions.length > this.options.windowSize) {
			this.rawPositions.shift();
		}

		const medianPosition = this._medianFilter(this.rawPositions);
		if (!medianPosition) return;

		const speed = Math.sqrt(this.x[2] * this.x[2] + this.x[3] * this.x[3]);
		const adaptiveSigma = this.options.sigmaAcc * (1 + speed / 10);

		this._kalmanPredict(dt, adaptiveSigma);
		this._kalmanUpdate(medianPosition);

		const distMoved = Math.sqrt(Math.pow(this.x[0] - this.lastReportedPosition.x, 2) + Math.pow(this.x[1] - this.lastReportedPosition.y, 2));
		const timeHeld = (timestamp - this.lastReportedTime) / 1000.0;

		if (distMoved > this.options.minMove || timeHeld > this.options.holdTime) {
			this.lastReportedPosition = {
				x: this.x[0],
				y: this.x[1],
				accuracy: Math.sqrt(this.P[0][0] + this.P[1][1]),
				timestamp: timestamp
			};
			this.lastReportedTime = timestamp;
		}
	}

	getFiltered() {
		if (!this.isInitialized) return null;

		const { lat, lon } = this._xyToLatLon(this.lastReportedPosition.x, this.lastReportedPosition.y);
		return {
			lat: lat,
			lon: lon,
			vx: this.x[2],
			vy: this.x[3],
			accuracy: this.lastReportedPosition.accuracy,
			timestamp: this.lastReportedPosition.timestamp
		};
	}
}
