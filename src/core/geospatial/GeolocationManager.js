import { CONSTANTS } from '../constants.js';
import { KalmanFilter, gpsSmoothingToFilterOptions } from './KalmanFilter.js';
import { GpsInstabilityTracker } from './GpsInstabilityTracker.js';
import { updateDirectionUI } from '../../paths/PathEditor.js';

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
		this._imprecise = false;
		this._indicatorRotation = null;
		this._fallbackApplied = false;
		this._offeredGoToBuzzWithoutFix = false;
	}

	setContext(context) {
		this.context = context;
	}

	init() {
		this._gpsSmoothingValue = CONSTANTS.GPS_SMOOTHING_DEFAULT;
		this.geoFilter = new KalmanFilter();
		this.createStatusElement();
		this.createAccuracyDisplayElement();
		this._positionUpdateCount = 0;
		this._imprecise = false;
		this._locationReadyPromise = new Promise((resolve) => {
			this._resolveLocationReady = resolve;
		});
	}

	stopWatching() {
		if (this.watchId) {
			navigator.geolocation.clearWatch(this.watchId);

			this.watchId = null;
		}
	}

	setGpsSmoothing(t) {
		this._gpsSmoothingValue = t;
		this.geoFilter.updateOptions(gpsSmoothingToFilterOptions(t));
	}

	getGpsSmoothing() {
		return this._gpsSmoothingValue;
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

	updateDirectionIndicator(heading) {
		if (!this.userMarker || !this.userMarker.getElement()) return;

		const indicator = this.userMarker.getElement().querySelector('.userDirectionIndicator');
		if (!indicator) return;

		if (this._indicatorRotation === null) {
			this._indicatorRotation = heading;
		} else {
			const current = ((this._indicatorRotation % 360) + 360) % 360;
			let delta = heading - current;
			if (delta > 180) delta -= 360;
			else if (delta < -180) delta += 360;
			this._indicatorRotation += delta;
		}

		indicator.style.display = 'block';
		indicator.style.transform = `rotate(${this._indicatorRotation}deg)`;
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
			if (this.followGPS && this.userMarker && this.context?.map) {
				const userPos = this.userMarker.getLatLng();
				this.context.map.setView(userPos, CONSTANTS.DEFAULT_USER_ZOOM);
			}
		} catch (error) {
			console.warn('Error setting map view on location recovery:', error);
		}
	}

	onLocationAcquired() {
		try {
			if (this.followGPS && this.userMarker && this.context?.map) {
				const userPos = this.userMarker.getLatLng();
				this.context.map.setView(userPos, CONSTANTS.DEFAULT_USER_ZOOM);
			}
		} catch (error) {
			console.warn('Error setting map view on location acquired:', error);
		}
	}

	onLocationError() {
		this.setupFallback();
	}

	setupFallback() {
		try {
			if (!this.followGPS || !this.context?.map) return;
			if (this.hasLocationFix()) return;

			if (!this.userMarker) {
				this.createUserMarker(L.latLng(0, 0));
			}

			if (this._fallbackApplied) return;
			this._fallbackApplied = true;

			if (this.context.mapManager?.getContentBounds()) return;
			this.context.map.setView([0, 0], CONSTANTS.DEFAULT_FALLBACK_ZOOM);
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
		this._fallbackApplied = false;
		this._offeredGoToBuzzWithoutFix = false;

		this.setStatus(CONSTANTS.GEOLOCATION_STATUS.SEARCHING);

		navigator.geolocation.getCurrentPosition(
			(pos) => this.handlePositionSuccess(pos),
			(error) => this.handlePositionError(error), {
				enableHighAccuracy: true,
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
		if (this.followGPS) {
			this.context?.map.setView(this.userMarker.getLatLng(), CONSTANTS.DEFAULT_USER_ZOOM);
		}
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
		this.updateAccuracyClass(accuracy);
		GpsInstabilityTracker.update(filtered.accuracy, timestamp);
		this.updateAccuracyDisplay(rawPosition, filtered);

		const filteredLatLng = L.latLng(filtered.lat, filtered.lon);

		if (!this.userMarker) {
			this.createUserMarker(filteredLatLng);
		}

		if (this.status !== CONSTANTS.GEOLOCATION_STATUS.ACTIVE) {
			this.setStatus(CONSTANTS.GEOLOCATION_STATUS.ACTIVE);
		}

		this._positionUpdateCount++;
		if (this._positionUpdateCount === 1 && this.followGPS) {
			this.offerGoToBuzz();
		}

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

				this.updateDirectionIndicator(newHeading);

				updateDirectionUI(newHeading);
			}

			this.context?.audioFunctions.updateAudio?.(this.userMarker.getLatLng());
			this.context?.audioFunctions.startAudioLoop?.();
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
		this.offerGoToBuzz();
		if (this._resolveLocationReady) {
			this._resolveLocationReady(null);
			this._resolveLocationReady = null;
		}
	}

	createUserMarker(latlng) {
		this._indicatorRotation = null;

		const userIcon = L.divIcon({
			html: `<div class="userIcon geolocation-status-${this.status}">
				<i class="fas fa-user icon-white icon-md"></i>
			</div>
			<div class="userDirectionIndicator" style="display: none;"></div>`,
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
					this.context?.audioFunctions.resetSmoothedPosition?.();
					this.context?.audioFunctions.resetSpeedTracking?.();
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
				this.context?.audioFunctions.startAudioLoop?.();
			}
		}

		return this.followGPS;
	}

	goToBuzz() {
		const bounds = this.context?.mapManager?.getContentBounds();
		if (!bounds || !this.context?.map) return false;

		const center = bounds.getCenter();

		if (this.userMarker) {
			this.userMarker.setLatLng(center);
		} else {
			this.createUserMarker(center);
		}

		this.stopWatching();
		this.toggleFollowGPS(false);

		this.context.map.fitBounds(bounds, {
			padding: CONSTANTS.CONTENT_FIT_PADDING,
			maxZoom: CONSTANTS.DEFAULT_USER_ZOOM
		});

		this.context.audioFunctions?.resetSmoothedPosition?.();
		this.context.audioFunctions?.resetSpeedTracking?.();

		this.context.AppState?.dispatch({
			type: 'USER_POSITION_CHANGED',
			payload: { position: center }
		});
		this.context.audioFunctions?.resetAreaTracking?.(center);

		return true;
	}

	hasLocationFix() {
		return this._positionUpdateCount > 0;
	}

	async offerGoToBuzz() {
		const modal = this.context?.ModalSystem;
		const bounds = this.context?.mapManager?.getContentBounds();
		if (!modal || !bounds) return;

		if (!this.hasLocationFix()) {
			const failed = this.status === CONSTANTS.GEOLOCATION_STATUS.ERROR ||
				this.status === CONSTANTS.GEOLOCATION_STATUS.DISABLED;
			if (!failed || this._offeredGoToBuzzWithoutFix) return;

			this._offeredGoToBuzzWithoutFix = true;

			const confirmed = await modal.confirm(
				'Your location could not be found. Go to the Buzz and work there instead?',
				'Go to Buzz'
			);

			if (confirmed) this.goToBuzz();
			return;
		}

		const distance = this.context.Geometry.distance(this.getUserPosition(), bounds.getCenter());
		if (distance < CONSTANTS.REMOTE_BUZZ_DISTANCE_M) return;

		const km = distance / 1000;
		const readable = km < 10 ? km.toFixed(1) : Math.round(km);

		const confirmed = await modal.confirm(
			`This Buzz is about ${readable} km from your current location. Go to it and work there?`,
			'Go to Buzz'
		);

		if (confirmed) this.goToBuzz();
	}

	updateAccuracyClass(accuracy) {
		const imprecise = accuracy > CONSTANTS.GEOLOCATION_ACCURACY_LIMIT_M;
		if (imprecise === this._imprecise) return;

		this._imprecise = imprecise;
		this.showStatusMessage(
			imprecise
				? `Location only accurate to ${Math.round(accuracy)} m`
				: 'Location accuracy recovered',
			CONSTANTS.STATUS_LONG_MS
		);
	}

	getStatusInfo() {
		return {
			status: this.status,
			followGPS: this.followGPS,
			hasMarker: !!this.userMarker,
			position: this.userMarker ? this.userMarker.getLatLng() : null,
			accuracy: this._lastFilteredPosition ? this._lastFilteredPosition.accuracy : null,
			rawAccuracy: this._lastRawPosition ? this._lastRawPosition.accuracy : null,
			imprecise: this._imprecise
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
