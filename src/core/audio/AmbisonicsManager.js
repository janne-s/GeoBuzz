import { CONSTANTS } from '../constants.js';
import { Selectors } from '../state/selectors.js';

export class AmbisonicsManager {
	constructor() {
		this.audioContext = null;
		this.scene = null;
		this.decoder = null;
		this.sources = new Map();
		this.stereoSources = new Map();
		this.outputGain = null;
		this._unlockAudioFn = null;
		this._getGeolocationFn = null;
		this._appStateRef = null;
		this._reconnectSoundFn = null;
		this._geometryRef = null;
	}

	setDependencies({ unlockAudio, getGeolocation, appState, reconnectSound, geometry }) {
		this._unlockAudioFn = unlockAudio;
		this._getGeolocationFn = getGeolocation;
		this._appStateRef = appState;
		this._reconnectSoundFn = reconnectSound;
		this._geometryRef = geometry;
	}

	setAudioContext(context) {
		this.audioContext = context;
	}

	async initialize() {
		if (this.scene) return;

		if (this._unlockAudioFn) {
			await this._unlockAudioFn();
		}

		if (!this.audioContext) {
			console.error('Cannot initialize Ambisonics: Native AudioContext is not available.');
			return;
		}

		try {
			this.scene = new ResonanceAudio(this.audioContext, {
				ambisonicOrder: CONSTANTS.AMBISONIC_ORDER
			});

			await this.scene.isReady;

			this.outputGain = this.audioContext.createGain();
			this.outputGain.gain.value = CONSTANTS.AMBISONIC_GAIN_BOOST;
			this.scene.output.connect(this.outputGain);
			this.outputGain.connect(this.audioContext.destination);

			if (this._appStateRef && this._appStateRef.audio && this._appStateRef.audio.ambisonics) {
				this._appStateRef.audio.ambisonics.scene = this.scene;
			}

		} catch (err) {
			console.error('❌ Resonance Audio initialization failed!', err);
			this.scene = null;
		}
	}

	async createSource(soundObj, appStateDispatch) {
		if (!this.scene) await this.initialize();
		if (!this.scene) return null;

		const stereoSource = this.createStereoAmbisonicSource(soundObj);
		this.stereoSources.set(soundObj.id, stereoSource);

		if (appStateDispatch) {
			appStateDispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
		}

		return stereoSource;
	}

	createStereoAmbisonicSource(soundObj) {
		const inputGain = this.audioContext.createGain();

		const splitter = this.audioContext.createChannelSplitter(2);

		const leftSource = this.scene.createSource();
		const rightSource = this.scene.createSource();

		const maxDistance = this.calculateMaxDistance(soundObj);
		[leftSource, rightSource].forEach(source => {
			source.setMinDistance(CONSTANTS.AMBISONIC_MIN_DISTANCE);
			source.setMaxDistance(maxDistance);
			source.setRolloff(CONSTANTS.AMBISONIC_ROLLOFF);
		});

		inputGain.connect(splitter);

		splitter.connect(leftSource.input, 0);

		try {
			splitter.connect(rightSource.input, 1);
		} catch (e) {
			splitter.connect(rightSource.input, 0);
		}

		return {
			input: inputGain,
			splitter,
			leftSource,
			rightSource,
			stereoWidth: CONSTANTS.AMBISONIC_STEREO_WIDTH,
			stereoSpread: CONSTANTS.AMBISONIC_STEREO_SPREAD
		};
	}

	updateAllStereoParameters(getSoundFn) {
		const userPos = this._getGeolocationFn ? this._getGeolocationFn() : null;
		this.stereoSources.forEach((stereoSource, soundId) => {
			const soundObj = getSoundFn ? getSoundFn(soundId) : null;
			if (soundObj) {
				stereoSource.stereoWidth = CONSTANTS.AMBISONIC_STEREO_WIDTH;
				stereoSource.stereoSpread = CONSTANTS.AMBISONIC_STEREO_SPREAD;
				if (userPos) {
					this.updateSourcePosition(soundObj, userPos);
				}
			}
		});
	}

	updateSourcePosition(soundObj, userPos) {
		const stereoSource = this.stereoSources.get(soundObj.id);
		if (!stereoSource) return;

		const soundPos = soundObj.marker.getLatLng();
		const baseCoords = this.latLngToXYZ(soundPos, userPos, Selectors.getUserDirection());

		const stereoWidth = stereoSource.stereoWidth || 1.0;
		const spread = stereoSource.stereoSpread * stereoWidth;

		const sourceAngle = Math.atan2(baseCoords.z, baseCoords.x);
		const perpAngle = sourceAngle + Math.PI / 2;

		const leftX = baseCoords.x + spread * 0.5 * Math.cos(perpAngle);
		const leftZ = baseCoords.z + spread * 0.5 * Math.sin(perpAngle);

		const rightX = baseCoords.x - spread * 0.5 * Math.cos(perpAngle);
		const rightZ = baseCoords.z - spread * 0.5 * Math.sin(perpAngle);

		stereoSource.leftSource.setPosition(leftX, 0, leftZ);
		stereoSource.rightSource.setPosition(rightX, 0, rightZ);
	}

	setStereoWidth(soundObj, width, appStateDispatch) {
		const stereoSource = this.stereoSources.get(soundObj.id);
		if (stereoSource) {
			stereoSource.stereoWidth = Math.max(0, Math.min(2, width));
			if (appStateDispatch) {
				appStateDispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
			}
		}
	}

	updateGain(newValue) {
		if (this.outputGain) {
			this.outputGain.gain.linearRampToValueAtTime(
				newValue,
				this.audioContext.currentTime + 0.1
			);
		}
	}

	updateSourceMaxDistance(soundObj) {
		const stereoSource = this.stereoSources.get(soundObj.id);
		if (!stereoSource) return;

		const maxDistance = this.calculateMaxDistance(soundObj);
		stereoSource.leftSource.setMaxDistance(maxDistance);
		stereoSource.rightSource.setMaxDistance(maxDistance);
	}

	calculateMaxDistance(soundObj) {
		if (soundObj.shapeType === 'circle') {
			return soundObj.circle ? soundObj.circle.getRadius() : 100;
		} else if (soundObj.shapeType === 'polygon' && soundObj.vertices && this._geometryRef) {
			const iconPos = soundObj.marker.getLatLng();
			return this._geometryRef.calculateMaxDistanceToPolygonBoundary(soundObj.vertices, iconPos);
		}
		return 100;
	}

	latLngToXYZ(soundPos, listenerPos, listenerDirection) {
		const x = (soundPos.lng - listenerPos.lng) * CONSTANTS.METERS_PER_LNG * Math.cos(listenerPos.lat * Math.PI / 180);
		const z = (soundPos.lat - listenerPos.lat) * CONSTANTS.METERS_PER_LAT;

		return { x, y: 0, z };
	}

	updateListener(position, direction) {
		if (!this.scene) return;
		this.scene.setListenerPosition(0, 0, 0);

		const angleRad = direction * Math.PI / 180;
		const forwardX = Math.sin(angleRad);
		const forwardZ = -Math.cos(angleRad);

		this.scene.setListenerOrientation(forwardX, 0, forwardZ, 0, 1, 0);
	}

	updateAllSourcePositions(userPos) {
		Selectors.getSounds().forEach(soundObj => {
			if (soundObj.useSpatialPanning && this.stereoSources.has(soundObj.id)) {
				this.updateSourcePosition(soundObj, userPos);
			}
		});
	}

	updateAllSourcesRolloff(getSoundFn) {
		this.stereoSources.forEach((stereoSource, soundId) => {
			const soundObj = getSoundFn ? getSoundFn(soundId) : null;
			if (soundObj) {
				const maxDistance = this.calculateMaxDistance(soundObj);
				[stereoSource.leftSource, stereoSource.rightSource].forEach(source => {
					source.setRolloff(CONSTANTS.AMBISONIC_ROLLOFF);
					source.setMaxDistance(maxDistance);
				});
			}
		});
	}

	updateAllSourcesDistances(getSoundFn) {
		this.stereoSources.forEach((stereoSource, soundId) => {
			const soundObj = getSoundFn ? getSoundFn(soundId) : null;
			if (soundObj) {
				const maxDistance = this.calculateMaxDistance(soundObj);
				[stereoSource.leftSource, stereoSource.rightSource].forEach(source => {
					source.setMinDistance(CONSTANTS.AMBISONIC_MIN_DISTANCE);
					source.setMaxDistance(maxDistance);
				});
			}
		});
	}

	removeSource(soundObj) {
		const stereoSource = this.stereoSources.get(soundObj.id);
		if (stereoSource) {
			try {
				if (stereoSource.input) stereoSource.input.disconnect();
				if (stereoSource.splitter) stereoSource.splitter.disconnect();
				if (stereoSource.leftSource?.input) stereoSource.leftSource.input.disconnect();
				if (stereoSource.rightSource?.input) stereoSource.rightSource.input.disconnect();
			} catch (e) {
				console.warn('Error disconnecting ambisonic source:', e);
			}
			this.stereoSources.delete(soundObj.id);
			if (this.sources.has(soundObj.id)) {
				this.sources.delete(soundObj.id);
			}
		}
	}

	dispose() {
		this.stereoSources.forEach((stereoSource) => {
			try {
				if (stereoSource.input) stereoSource.input.disconnect();
				if (stereoSource.splitter) stereoSource.splitter.disconnect();
				if (stereoSource.leftSource?.input) stereoSource.leftSource.input.disconnect();
				if (stereoSource.rightSource?.input) stereoSource.rightSource.input.disconnect();
			} catch (e) {
				console.warn('Error during disposal:', e);
			}
		});
		this.stereoSources.clear();
		this.sources.clear();

		if (this.outputGain) {
			this.outputGain.disconnect();
			this.outputGain = null;
		}

		if (this.scene) {
			this.scene.output.disconnect();
			this.scene = null;
		}
	}

	async reinitialize(getSoundFn) {
		const sourcesInfo = Array.from(this.stereoSources.entries()).map(([id, source]) => ({
			id,
			soundObj: getSoundFn ? getSoundFn(id) : null,
			stereoWidth: source.stereoWidth
		}));

		this.dispose();
		await this.initialize();

		for (const info of sourcesInfo) {
			if (info.soundObj) {
				const newSource = await this.createSource(info.soundObj);
				if (newSource && this._reconnectSoundFn) {
					info.soundObj.ambisonicSource = newSource;
					newSource.stereoWidth = info.stereoWidth;
					this._reconnectSoundFn(info.soundObj);
				}
			}
		}

		const userPos = this._getGeolocationFn ? this._getGeolocationFn() : null;
		if (userPos) {
			this.updateListener(userPos, Selectors.getUserDirection());
			this.updateAllSourcePositions(userPos);
		}
	}

	getGain() {
		return this.outputGain ? this.outputGain.gain.value : CONSTANTS.AMBISONIC_GAIN_BOOST;
	}

	createEchoSource() {
		if (!this.scene) return null;

		try {
			const source = this.scene.createSource();

			const inputGain = this.audioContext.createGain();
			inputGain.gain.value = 1.0;

			inputGain.connect(source.input);

			source.setMinDistance(CONSTANTS.AMBISONIC_MIN_DISTANCE);
			source.setMaxDistance(CONSTANTS.ECHO_MAX_AUDIBLE_DISTANCE);
			source.setRolloff(CONSTANTS.AMBISONIC_ROLLOFF);

			return {
				source: source,
				input: inputGain
			};
		} catch (err) {
			console.error('Failed to create ambisonic echo source:', err);
			return null;
		}
	}

	updateEchoSourcePosition(echoData, reflectionPoint, userPos) {
		if (!echoData || !echoData.source || !this.scene) return;

		const dx = (reflectionPoint.lng - userPos.lng) * CONSTANTS.METERS_PER_LNG * Math.cos(userPos.lat * Math.PI / 180);
		const dz = (reflectionPoint.lat - userPos.lat) * CONSTANTS.METERS_PER_LAT;

		const angle = Selectors.getUserDirection() * Math.PI / 180;
		const rotatedX = dx * Math.cos(angle) + dz * Math.sin(angle);
		const rotatedZ = -dx * Math.sin(angle) + dz * Math.cos(angle);

		echoData.source.setPosition(rotatedX, 0, rotatedZ);
	}

	removeEchoSource(echoData) {
		if (echoData) {
			try {
				if (echoData.input) {
					echoData.input.disconnect();
				}
			} catch (e) {
				console.warn('Error disconnecting echo source:', e);
			}
		}
	}
}
