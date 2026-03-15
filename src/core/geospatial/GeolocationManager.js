import { CONSTANTS } from '../constants.js';
import { KalmanFilter } from './KalmanFilter.js';

class GeolocationManagerClass {
	constructor() {
		this.status = CONSTANTS.GEOLOCATION_STATUS.INITIAL;
		this.userMarker = null;
		this.followGPS = true;
		this.statusElement = null;
		this.watchId = null;
		this.geoFilter = null;
		this.accuracyDisplayElement = null;
		this.isAccuracyVisible = false;
		this._lastRawPosition = null;
		this._lastFilteredPosition = null;
		this.context = null;
		this._locationReadyPromise = null;
		this._resolveLocationReady = null;
		this._positionUpdateCount = 0;
		this._minSamplesForStability = 3;
		this._maxAccuracyForStability = 30;
	}

	setContext(context) {
		this.context = context;
	}

	init() {
		this.geoFilter = new KalmanFilter();
		this.createStatusElement();
		this.createAccuracyDisplayElement();
		this._positionUpdateCount = 0;
		this._locationReadyPromise = new Promise((resolve) => {
			this._resolveLocationReady = resolve;
		});
		this.setupGeolocation();
	}

	stopWatching() {
		if (this.watchId) {
			navigator.geolocation.clearWatch(this.watchId);

			this.watchId = null;
		}
	}

	createStatusElement() {
		this.statusElement = document.createElement('div');
		this.statusElement.id = 'locationStatus';
		document.body.appendChild(this.statusElement);
	}

	createAccuracyDisplayElement() {
		this.accuracyDisplayElement = document.createElement('div');
		this.accuracyDisplayElement.id = 'accuracyDisplay';
		this.accuracyDisplayElement.className = 'accuracy-display';
		document.body.appendChild(this.accuracyDisplayElement);
	}

	toggleAccuracyDisplay() {
		this.isAccuracyVisible = !this.isAccuracyVisible;
		const element = this.accuracyDisplayElement;

		if (this.isAccuracyVisible) {
			element.style.display = 'block';
			this.updateAccuracyDisplay(this._lastRawPosition, this._lastFilteredPosition);
			requestAnimationFrame(() => {
				element.style.opacity = '1';
				element.style.transform = 'translateX(-50%) translateY(0px)';
			});
		} else {
			element.style.opacity = '0';
			element.style.transform = 'translateX(-50%) translateY(10px)';
			element.addEventListener('transitionend', () => {
				element.style.display = 'none';
			}, { once: true });
		}

		const userMenu = document.querySelector('.context-menu');
		if (userMenu) {
			const toggleBtn = userMenu.querySelector('#toggleAccuracyBtn');
			if (toggleBtn) {
				toggleBtn.innerHTML = `<i class="fas fa-bullseye"></i> ${this.isAccuracyVisible ? 'Hide' : 'Show'} Accuracy`;
			}
		}
	}

	updateAccuracyDisplay(raw, filtered) {
		if (!this.isAccuracyVisible) return;
		if (!raw || !filtered) {
			this.accuracyDisplayElement.innerHTML = 'Awaiting first location fix...';
			return;
		}

		const speed = Math.sqrt(filtered.vx ** 2 + filtered.vy ** 2).toFixed(1);

		this.accuracyDisplayElement.innerHTML = `
			<strong>Raw:</strong> acc: ${raw.accuracy.toFixed(1)}m<br>
			<strong>Filtered:</strong> acc: ${filtered.accuracy.toFixed(1)}m<br>
			<strong>Speed:</strong> ${speed} m/s
		`;
	}

	setStatus(newStatus, message = null) {
		const oldStatus = this.status;
		this.status = newStatus;


		this.updateMarkerAppearance();

		if (message !== null) {
			this.showStatusMessage(message);
		} else {
			this.showDefaultStatusMessage(newStatus);
		}

		this.handleStatusTransition(oldStatus, newStatus);
	}

	updateMarkerAppearance() {
		if (this.userMarker && this.userMarker.getElement()) {
			const iconElement = this.userMarker.getElement().querySelector('.userIcon');
			if (iconElement) {
				const classes = iconElement.className.split(' ').filter(cls =>
					!cls.startsWith('geolocation-status-')
				);
				classes.push(`geolocation-status-${this.status}`);
				iconElement.className = classes.join(' ');
			}
		}
	}

	showStatusMessage(text, duration = CONSTANTS.STATUS_MEDIUM_MS) {
		if (!this.statusElement) return;

		this.statusElement.textContent = text;
		this.statusElement.style.display = 'block';

		requestAnimationFrame(() => {
			this.statusElement.style.opacity = '1';
			this.statusElement.style.transform = 'translateX(-50%) translateY(0px)';
		});

		if (duration > 0) {
			setTimeout(() => this.hideStatusMessage(), duration);
		}
	}

	hideStatusMessage() {
		if (!this.statusElement) return;

		this.statusElement.style.opacity = '0';
		this.statusElement.style.transform = 'translateX(-50%) translateY(-10px)';

		this.statusElement.addEventListener('transitionend', () => {
			this.statusElement.style.display = 'none';
		}, { once: true });
	}

	showDefaultStatusMessage(status) {
		const messages = {
			[CONSTANTS.GEOLOCATION_STATUS.INITIAL]: 'Initializing location...',
			[CONSTANTS.GEOLOCATION_STATUS.SEARCHING]: 'Finding your location...',
			[CONSTANTS.GEOLOCATION_STATUS.ACTIVE]: 'Location tracking active',
			[CONSTANTS.GEOLOCATION_STATUS.ERROR]: 'Location unavailable',
			[CONSTANTS.GEOLOCATION_STATUS.DISABLED]: 'Location access disabled'
		};

		const message = messages[status] || 'Location status unknown';
		const duration = status === CONSTANTS.GEOLOCATION_STATUS.ACTIVE ?
			CONSTANTS.STATUS_MEDIUM_MS : CONSTANTS.STATUS_LONG_MS;

		this.showStatusMessage(message, duration);
	}

	handleStatusTransition(oldStatus, newStatus) {
		if (newStatus === CONSTANTS.GEOLOCATION_STATUS.ACTIVE) {
			this.onLocationAcquired();
		}

		if (newStatus === CONSTANTS.GEOLOCATION_STATUS.ERROR) {
			this.onLocationError();
		}

		if (oldStatus === CONSTANTS.GEOLOCATION_STATUS.ERROR && newStatus === CONSTANTS.GEOLOCATION_STATUS.ACTIVE) {
			this.onLocationRecovered();
		}
	}

	onLocationRecovered() {
		try {
			if (this.userMarker && this.context?.map) {
				const userPos = this.userMarker.getLatLng();
				this.context.map.setView(userPos, CONSTANTS.DEFAULT_USER_ZOOM);
			}
		} catch (error) {
			console.warn('Error setting map view on location recovery:', error);
		}
	}

	onLocationAcquired() {
		try {
			if (this.userMarker && this.context?.map) {
				const userPos = this.userMarker.getLatLng();
				this.context.map.setView(userPos, CONSTANTS.DEFAULT_USER_ZOOM);
			}
		} catch (error) {
			console.warn('Error setting map view on location acquired:', error);
		}
	}

	onLocationError() {
		try {
			console.warn('Geolocation failed, using fallback location');
			if (this.context?.map) {
				const userPos = this.getUserPosition();
				if (!userPos || (userPos.lat === 0 && userPos.lng === 0)) {
					this.context.map.setView([0, 0], CONSTANTS.DEFAULT_FALLBACK_ZOOM);
				}
			}
		} catch (error) {
			console.warn('Error setting fallback map view:', error);
		}
	}

	setupFallback() {
		try {
			if (this.context?.map) {
				this.context.map.setView([0, 0], CONSTANTS.DEFAULT_FALLBACK_ZOOM);
			}
		} catch (error) {
			console.warn('Error setting up fallback map view:', error);
		}
	}

	cleanup() {
		if (this.watchId) {
			navigator.geolocation.clearWatch(this.watchId);
			this.watchId = null;
		}
		if (this.statusElement) {
			this.statusElement.remove();
			this.statusElement = null;
		}
		if (this.accuracyDisplayElement) {
			this.accuracyDisplayElement.remove();
			this.accuracyDisplayElement = null;
		}
	}

	setupGeolocation() {
		if (!navigator.geolocation) {
			this.setStatus(CONSTANTS.GEOLOCATION_STATUS.DISABLED, 'Geolocation not supported by browser');
			this.setupFallback();
			return;
		}

		this.stopWatching();

		this.setStatus(CONSTANTS.GEOLOCATION_STATUS.SEARCHING);

		navigator.geolocation.getCurrentPosition(
			(pos) => this.handlePositionSuccess(pos),
			(error) => this.handlePositionError(error), {
				timeout: CONSTANTS.GEOLOCATION_TIMEOUT_MS,
				maximumAge: CONSTANTS.GEOLOCATION_MAX_AGE_MS
			}
		);

		this.watchId = navigator.geolocation.watchPosition(
			(pos) => this.handlePositionUpdate(pos),
			(error) => this.handlePositionError(error), {
				enableHighAccuracy: true,
				timeout: CONSTANTS.WATCH_POSITION_TIMEOUT_MS,
				maximumAge: 0
			}
		);

	}

	handlePositionSuccess(pos) {
		this.setStatus(CONSTANTS.GEOLOCATION_STATUS.ACTIVE);
		this.handlePositionUpdate(pos);
		this.context?.map.setView(this.userMarker.getLatLng(), CONSTANTS.DEFAULT_USER_ZOOM);
	}

	handlePositionUpdate(pos) {
		const { latitude, longitude, accuracy } = pos.coords;
		const timestamp = pos.timestamp || Date.now();
		const rawPosition = { latitude, longitude, accuracy, timestamp };

		this.geoFilter.update(rawPosition);
		const filtered = this.geoFilter.getFiltered();
		if (!filtered) return;

		this._lastRawPosition = rawPosition;
		this._lastFilteredPosition = filtered;
		this.updateAccuracyDisplay(rawPosition, filtered);

		const filteredLatLng = L.latLng(filtered.lat, filtered.lon);

		if (!this.userMarker) {
			this.createUserMarker(filteredLatLng);
		}

		if (this.status !== CONSTANTS.GEOLOCATION_STATUS.ACTIVE) {
			this.setStatus(CONSTANTS.GEOLOCATION_STATUS.ACTIVE);
		}

		this._positionUpdateCount++;

		if (this._resolveLocationReady) {
			this._resolveLocationReady(filteredLatLng);
			this._resolveLocationReady = null;
		}

		if (this.followGPS) {
			this.userMarker.setLatLng(filteredLatLng);

			const isDeviceOrientationActive = this.context?.DeviceOrientationManager?.getStatus().enabled || false;

			if (pos.coords.heading !== null && !isNaN(pos.coords.heading) && !isDeviceOrientationActive) {
				const newHeading = Math.round(pos.coords.heading);
				if (this.context?.AppState) {
					this.context.AppState.audio.userDirection = newHeading;
				}

				const directionSlider = document.querySelector('.direction-slider');
				if (directionSlider) {
					directionSlider.value = newHeading;
					const arrow = document.querySelector('.direction-arrow');
					const degreeDisplay = document.querySelector('.degree-display');
					if (arrow) arrow.style.transform = `rotate(${newHeading - 45}deg)`;
					if (degreeDisplay) degreeDisplay.textContent = `${newHeading}°`;
				}
			}

			this.context?.audioFunctions.updateAudio?.(this.userMarker.getLatLng());
			this.context?.audioFunctions.resetAreaTracking?.(this.userMarker.getLatLng());
		}
	}

	handlePositionError(error) {
		let status = CONSTANTS.GEOLOCATION_STATUS.ERROR;
		let message = 'Location unavailable';

		switch (error.code) {
			case error.PERMISSION_DENIED:
				status = CONSTANTS.GEOLOCATION_STATUS.DISABLED;
				message = 'Location access denied by user';
				break;
			case error.POSITION_UNAVAILABLE:
				message = 'Location information unavailable';
				break;
			case error.TIMEOUT:
				message = 'Location request timed out';
				break;
		}

		this.setStatus(status, message);
		this.setupFallback();
		if (this._resolveLocationReady) {
			this._resolveLocationReady(null);
			this._resolveLocationReady = null;
		}
	}

	createUserMarker(latlng) {
		const userIcon = L.divIcon({
			html: `<div class="userIcon geolocation-status-${this.status}">
				<i class="fas fa-user icon-white icon-md"></i>
			</div>`,
			className: 'custom-div-icon',
			iconSize: CONSTANTS.USER_ICON_SIZE,
			iconAnchor: CONSTANTS.USER_ICON_ANCHOR
		});

		this.userMarker = L.marker(latlng, {
			icon: userIcon,
			draggable: !this.followGPS,
			pane: 'userMarker'
		}).addTo(this.context.map);

		this.context?.audioFunctions.attachDragHandlers?.(this.userMarker, {
			click: (e) => {
				e.originalEvent.stopPropagation();
				this.context?.audioFunctions.showUserMenu?.(e.containerPoint);
			},
			drag: () => {
				if (!this.followGPS) {
					this.context?.AppState.dispatch({
						type: 'USER_POSITION_CHANGED',
						payload: { position: this.userMarker.getLatLng() }
					});
				}
			},
			dragend: () => {
				if (!this.followGPS) {
					const position = this.userMarker.getLatLng();
					this.context?.AppState.dispatch({
						type: 'USER_POSITION_CHANGED',
						payload: { position }
					});
					this.context?.audioFunctions.resetAreaTracking?.(position);
				}
			}
		});

		return this.userMarker;
	}

	toggleFollowGPS(enabled = null) {
		const wasFollowing = this.followGPS;
		this.followGPS = enabled !== null ? enabled : !this.followGPS;

		if (this.userMarker) {
			if (this.followGPS) {
				this.userMarker.dragging.disable();
				if (navigator.geolocation) {
					navigator.geolocation.getCurrentPosition((pos) => {
						this.handlePositionUpdate(pos);
						if (this.userMarker) {
							this.context?.map.setView(this.userMarker.getLatLng(), CONSTANTS.DEFAULT_USER_ZOOM);
						}
					});
				}
			} else {
				if (this.watchId) {
					navigator.geolocation.clearWatch(this.watchId);
					this.watchId = null;
				}
				this.userMarker.dragging.enable();
				this.context?.audioFunctions.updateAudio?.(this.userMarker.getLatLng());
			}
		}

		return this.followGPS;
	}

	getStatusInfo() {
		return {
			status: this.status,
			followGPS: this.followGPS,
			hasMarker: !!this.userMarker,
			position: this.userMarker ? this.userMarker.getLatLng() : null
		};
	}

	getUserMarker() {
		return this.userMarker;
	}

	getUserPosition() {
		return this.userMarker ? this.userMarker.getLatLng() : null;
	}

	async waitForLocation(timeout = 3000) {
		if (this.userMarker) {
			return this.userMarker.getLatLng();
		}
		const timeoutPromise = new Promise((resolve) => {
			setTimeout(() => {
				if (this._resolveLocationReady) {
					const position = this.userMarker ? this.userMarker.getLatLng() : null;
					this._resolveLocationReady(position);
					this._resolveLocationReady = null;
				}
				resolve(this.userMarker ? this.userMarker.getLatLng() : null);
			}, timeout);
		});
		return Promise.race([this._locationReadyPromise, timeoutPromise]);
	}
}

export const GeolocationManager = new GeolocationManagerClass();
