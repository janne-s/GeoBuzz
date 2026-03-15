import { CONSTANTS } from '../constants.js';
import { OrientationKalmanFilter } from './OrientationKalmanFilter.js';

class DeviceOrientationManagerClass {
	constructor() {
		this.enabled = false;
		this.available = false;
		this.permission = 'prompt';
		this.orientationFilter = null;
		this.context = null;
		this._handleOrientation = this._handleOrientation.bind(this);
		this._lastRawHeading = null;
		this._lastFilteredHeading = null;
	}

	setContext(context) {
		this.context = context;
	}

	init() {
		this.orientationFilter = new OrientationKalmanFilter();
		this.checkAvailability();
	}

	checkAvailability() {
		if (window.DeviceOrientationEvent) {
			this.available = true;

			if (typeof DeviceOrientationEvent.requestPermission === 'function') {
				this.permission = 'prompt';
			} else {
				this.permission = 'granted';
			}
		} else {
			this.available = false;
			this.permission = 'denied';
		}
	}

	async requestPermission() {
		if (!this.available) {
			throw new Error('Device orientation not available on this device');
		}

		if (typeof DeviceOrientationEvent.requestPermission === 'function') {
			try {
				const response = await DeviceOrientationEvent.requestPermission();
				this.permission = response;
				return response === 'granted';
			} catch (error) {
				console.error('Permission request failed:', error);
				this.permission = 'denied';
				return false;
			}
		}

		return true;
	}

	async start() {
		if (!this.available) {
			console.warn('Device orientation not available');
			return false;
		}

		if (this.permission === 'prompt') {
			const granted = await this.requestPermission();
			if (!granted) {
				console.warn('Device orientation permission denied');
				return false;
			}
		}

		if (this.permission !== 'granted') {
			console.warn('Device orientation permission not granted');
			return false;
		}

		this.orientationFilter = new OrientationKalmanFilter();
		this.enabled = true;

		if (window.DeviceOrientationEvent && 'absolute' in DeviceOrientationEvent.prototype) {
			window.addEventListener('deviceorientationabsolute', this._handleOrientation, true);
		} else {
			window.addEventListener('deviceorientation', this._handleOrientation, true);
		}

		return true;
	}

	stop() {
		this.enabled = false;

		if (window.DeviceOrientationEvent && 'absolute' in DeviceOrientationEvent.prototype) {
			window.removeEventListener('deviceorientationabsolute', this._handleOrientation, true);
		} else {
			window.removeEventListener('deviceorientation', this._handleOrientation, true);
		}
	}

	_handleOrientation(event) {
		if (!this.enabled) return;

		let heading = null;
		let accuracy = CONSTANTS.ORIENTATION_DEFAULT_ACCURACY;

		if (event.webkitCompassHeading !== undefined) {
			heading = event.webkitCompassHeading;
			accuracy = event.webkitCompassAccuracy || accuracy;
		} else if (event.alpha !== null) {
			if (event.absolute) {
				heading = 360 - event.alpha;
			} else {
				heading = 360 - event.alpha;
			}
		}

		if (heading === null) return;

		while (heading >= 360) heading -= 360;
		while (heading < 0) heading += 360;

		const timestamp = event.timeStamp || Date.now();
		const rawHeading = { value: heading, accuracy, timestamp };

		this.orientationFilter.update(rawHeading);
		const filtered = this.orientationFilter.getFiltered();

		if (!filtered) return;

		this._lastRawHeading = rawHeading;
		this._lastFilteredHeading = filtered;

		if (this.context?.AppState) {
			this.context.AppState.audio.userDirection = filtered.heading;

			const directionSlider = document.querySelector('.direction-slider');
			if (directionSlider) {
				directionSlider.value = filtered.heading;
				const arrow = document.querySelector('.direction-arrow');
				const degreeDisplay = document.querySelector('.degree-display');
				if (arrow) arrow.style.transform = `rotate(${filtered.heading - 45}deg)`;
				if (degreeDisplay) degreeDisplay.textContent = `${filtered.heading}°`;
			}

			if (this.context.AppState.dispatch) {
				this.context.AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
			}
		}
	}

	getStatus() {
		return {
			enabled: this.enabled,
			available: this.available,
			permission: this.permission,
			currentHeading: this._lastFilteredHeading?.heading ?? null
		};
	}

	cleanup() {
		this.stop();
		this.orientationFilter = null;
	}
}

export const DeviceOrientationManager = new DeviceOrientationManagerClass();
