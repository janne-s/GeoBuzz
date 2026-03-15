import { toRadians, toDegrees } from '../core/utils/math.js';
import { Selectors } from '../core/state/selectors.js';
import { GeolocationManager } from '../core/geospatial/GeolocationManager.js';
import { AppState } from '../core/state/StateManager.js';

export class OSCManager {
	constructor() {
		this.enabled = false;
		this.config = {
			host: 'localhost',
			port: 8081
		};
		this.cache = new Map();
		this.layerManager = null;
		this.map = null;
		this.ws = null;
		this.wsReconnectTimer = null;
	}

	setDependencies(layerManager, map) {
		this.layerManager = layerManager;
		this.map = map;
	}

	connect() {
		this.enabled = true;
		this.cache.clear();

		// If already connected, send full state immediately
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.sendFullState();
		} else {
			// Otherwise establish connection (will send on open)
			this.connectWebSocket();
		}
	}

	disconnect() {
		this.enabled = false;
		this.cache.clear();

		if (this.wsReconnectTimer) {
			clearTimeout(this.wsReconnectTimer);
			this.wsReconnectTimer = null;
		}

		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}

	connectWebSocket() {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			return;
		}

		try {
			const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
			this.ws = new WebSocket(`${protocol}://${this.config.host}:${this.config.port}`);

			this.ws.onopen = () => {
				this.sendFullState();
			};

			this.ws.onerror = (error) => {
				console.error('OSC WebSocket error:', error);
			};

			this.ws.onclose = () => {
				if (this.enabled) {
					this.wsReconnectTimer = setTimeout(() => {
						this.connectWebSocket();
					}, 3000);
				}
			};
		} catch (error) {
			console.error('Failed to create WebSocket:', error);
		}
	}

	async send(address, ...args) {
		if (!this.enabled) return;

		// Don't send if WebSocket is not open
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

		// Cache values - only send when they change
		const cacheKey = `${address}:${args.join(',')}`;
		if (this.cache.get(address) === cacheKey) return;

		const message = {
			address,
			args: args.map(v => ({
				type: typeof v === 'number' ? (Number.isInteger(v) ? 'i' : 'f') : 's',
				value: v
			}))
		};

		try {
			this.ws.send(JSON.stringify(message));
			// Only cache if successfully sent
			this.cache.set(address, cacheKey);
		} catch (err) {
			console.error('OSC WebSocket send error:', err);
		}
	}

	sanitizeName(name) {
		return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^[0-9]/, '_$&');
	}

	buildAddress(sound, param) {
		const soundName = this.sanitizeName(sound.label || 'untitled');

		if (sound.layers && sound.layers.length > 0 && this.layerManager) {
			const firstLayerId = sound.layers[0];
			const layer = this.layerManager.getUserLayer(firstLayerId);
			if (layer) {
				const layerName = this.sanitizeName(layer.name);
				return `/geobuzz/${layerName}/${soundName}/${param}`;
			}
		}
		return `/geobuzz/${soundName}/${param}`;
	}

	sendSoundEchoes(sound, userPos, userDirection) {
		if (!sound.echoNodes || sound.echoNodes.size === 0 || !userPos) return;

		for (const [pathId, nodeData] of sound.echoNodes.entries()) {
			if (!nodeData.reflectionPoint) continue;

			const path = Selectors.getPath(pathId);
			if (!path) continue;

			const echoPos = this.calculateRelativeXY(userPos, userDirection, nodeData.reflectionPoint);
			const echoName = this.sanitizeName(path.label || 'echo');
			const soundName = this.sanitizeName(sound.label || 'untitled');

			const baseAddress = sound.layers && sound.layers.length > 0 && this.layerManager
				? `/geobuzz/${this.sanitizeName(this.layerManager.getUserLayer(sound.layers[0])?.name || 'default')}/${soundName}/echo_${echoName}`
				: `/geobuzz/${soundName}/echo_${echoName}`;

			this.send(`${baseAddress}/x`, echoPos.x);
			this.send(`${baseAddress}/y`, echoPos.y);
			this.send(`${baseAddress}/distance`, echoPos.distance);
			this.send(`${baseAddress}/gain`, nodeData.gain.gain.value);
		}
	}

	sendFullState() {
		const userPos = GeolocationManager.getUserPosition();
		const userDirection = Selectors.getUserDirection();

		// Always send user position if available
		if (userPos) {
			this.send('/geobuzz/user/lat', userPos.lat);
			this.send('/geobuzz/user/lng', userPos.lng);
			this.send('/geobuzz/user/direction', userDirection);
		}

		const sounds = Selectors.getSounds();

		// If user position available, ensure echo nodes are initialized for all sounds
		if (userPos) {
			sounds.forEach(sound => {
				if (sound.params.reflections?.enabled) {
					AppState.dispatch({
						type: 'AUDIO_ECHO_UPDATE_REQUESTED',
						payload: { sound, userPos }
					});
				}
			});
		}

		// Send sound data
		sounds.forEach(sound => {
			const soundPos = sound.marker.getLatLng();

			// Send relative coordinates only if user position is available
			if (userPos) {
				const relativePos = this.calculateRelativeXY(userPos, userDirection, soundPos);
				if (relativePos && typeof relativePos.x === 'number' && typeof relativePos.y === 'number' && typeof relativePos.distance === 'number') {
					this.send(this.buildAddress(sound, 'x'), relativePos.x);
					this.send(this.buildAddress(sound, 'y'), relativePos.y);
					this.send(this.buildAddress(sound, 'distance'), relativePos.distance);
				}
			}

			// Send gain (always, even if user position not available)
			if (sound.gain && sound.gain.gain) {
				this.send(this.buildAddress(sound, 'gain'), sound.gain.gain.value);
			}

			// Send absolute coordinates (always)
			this.send(this.buildAddress(sound, 'lat'), soundPos.lat);
			this.send(this.buildAddress(sound, 'lng'), soundPos.lng);

			// Send echoes (only if user position available)
			if (userPos) {
				this.sendSoundEchoes(sound, userPos, userDirection);
			}
		});
	}

	calculateRelativeXY(userPos, userHeading, soundPos) {
		const lat1 = toRadians(userPos.lat);
		const lat2 = toRadians(soundPos.lat);
		const deltaLng = toRadians(soundPos.lng - userPos.lng);

		const y = Math.sin(deltaLng) * Math.cos(lat2);
		const x = Math.cos(lat1) * Math.sin(lat2) -
			Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);

		const absoluteBearing = (toDegrees(Math.atan2(y, x)) + 360) % 360;

		const relativeBearing = (absoluteBearing - userHeading + 360) % 360;
		const relativeRad = toRadians(relativeBearing);

		// Calculate distance using Haversine formula
		const R = 6371000; // Earth's radius in meters
		const dLat = lat2 - lat1;
		const dLng = deltaLng;
		const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos(lat1) * Math.cos(lat2) *
			Math.sin(dLng / 2) * Math.sin(dLng / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		const distance = R * c;

		const relativeX = distance * Math.sin(relativeRad);
		const relativeY = distance * Math.cos(relativeRad);

		return { x: relativeX, y: relativeY, distance };
	}
}

export const oscManager = new OSCManager();
