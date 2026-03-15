/**
 * GeoBuzz Runtime Engine
 *
 * Lightweight runtime engine for playing GeoBuzz compositions.
 * Provides audio/spatial capabilities without editor UI.
 *
 * Architecture:
 * - Imports only core audio/spatial modules
 * - No Application.js or UI managers
 * - Exposes simple API for loading and playing buzz files
 * - Designed for custom player interfaces
 */

import { AppState } from '../core/state/StateManager.js';
import { Selectors } from '../core/state/selectors.js';
import { GeolocationManager } from '../core/geospatial/GeolocationManager.js';
import { AmbisonicsManager } from '../core/audio/AmbisonicsManager.js';
import { AudioNodeManager, PolyphonyManager } from '../core/audio/AudioNodeManager.js';
import { AudioContextManager } from '../core/audio/AudioContextManager.js';
import { StreamManager } from '../core/audio/StreamManager.js';
import { FXManager } from '../core/audio/FXManager.js';
import { EchoManager, setContext as setEchoManagerContext } from '../core/audio/EchoManager.js';
import { LayerManager } from '../layers/LayerManager.js';
import { CoordinateTransform } from '../core/utils/coordinates.js';
import { Geometry } from '../core/geospatial/Geometry.js';
import { PathZoneChecker } from '../core/geospatial/PathZoneChecker.js';
import { startAudioLoop, setContext as setAudioEngineContext, updateAudio, getUserMovementSpeed } from '../core/audio/AudioEngine.js';
import { calcGain, calculatePathGain, calculateRelativePosition, calculateBearingPan, setContext as setAudioUtilsContext } from '../core/audio/audioUtils.js';
import { applySettings as applyAudioSmootherSettings, setContext as setAudioSmootherContext } from '../core/audio/AudioSmoother.js';
import { processLFOs, processPathLFOs, setContext as setLFOProcessorContext } from '../core/audio/LFOProcessor.js';
import { updateSynthParam, setContext as setParameterUpdaterContext } from '../core/audio/ParameterUpdater.js';
import { setContext as setDistanceSequencerContext } from '../core/audio/DistanceSequencer.js';
import { createFullSoundInstance, setContext as setSoundCreationContext } from '../core/audio/SoundCreation.js';
import { destroySound, startLoopedPlayback, stopLoopedPlayback, upgradeSynthToPolyphonic, setContext as setSoundLifecycleContext } from '../core/audio/SoundLifecycle.js';
import { DEFAULT_LFO_STRUCTURE, DEFAULT_FX_STRUCTURE, DEFAULT_EQ_STRUCTURE } from '../config/defaults.js';
import { PARAMETER_REGISTRY } from '../config/parameterRegistry.js';
import { deepClone, isCircularPath } from '../core/utils/math.js';
import { isLinearPath } from '../core/utils/typeChecks.js';
import {
	updateSoundPositionOnPath as pathEditorUpdateSoundPositionOnPath,
	updateSoundOnLinePath as pathEditorUpdateSoundOnLinePath,
	updateSoundOnCirclePath as pathEditorUpdateSoundOnCirclePath
} from '../paths/PathEditor.js';
import { getSmoothedPathPoints, generateOvalPoints } from '../paths/PathFactory.js';
import { getOffsetPolyline } from '../paths/PathRenderer.js';
import { CONSTANTS } from '../core/constants.js';
import { SHAPE_REGISTRY, setRegistriesContext } from '../config/registries.js';

let engineContext = null;

function resetAreaTracking(userPos) {
	if (!userPos) {
		userPos = GeolocationManager.getUserPosition();
		if (!userPos) return;
	}

	Selectors.getSounds().forEach(s => {
		if (s.type === "SoundFile" && !s.params.loop) {
			const targetGain = calcGain(userPos, s);
			const isInRange = targetGain > 0;

			if (!isInRange && s.wasInsideArea) {
				s.wasInsideArea = false;
			}
		}
	});
}

function updateSoundMarkerPosition(sound, newPosition) {
	const oldPosition = sound.shapeType === 'polygon' ? sound.marker.getLatLng() : null;
	const currentMarkerPos = sound.marker.getLatLng();

	if (currentMarkerPos.lat === newPosition.lat && currentMarkerPos.lng === newPosition.lng) {
		return;
	}

	sound.marker.setLatLng(newPosition);
	sound.userLat = newPosition.lat;
	sound.userLng = newPosition.lng;

	if (sound.leafletMarker) {
		sound.leafletMarker.setLatLng(newPosition);
	}

	if (sound.shapeType === 'circle') {
		Geometry.updateCirclePosition(sound.circle, sound.handle, sound.labelMarker, newPosition, sound.maxDistance);
	} else if (sound.shapeType === 'polygon') {
		if (!sound._originalMarkerPos) {
			sound._originalMarkerPos = oldPosition || newPosition;
		}
		const deltaLat = newPosition.lat - sound._originalMarkerPos.lat;
		const deltaLng = newPosition.lng - sound._originalMarkerPos.lng;
		sound.vertices = Geometry.updatePolygonPosition(
			sound.polygon, sound.vertices, sound.vertexMarkers, sound.labelMarker, deltaLat, deltaLng
		);
		sound._originalMarkerPos = newPosition;
	} else if (sound.shapeType === 'line' && sound.linePoints && sound.polygon) {
		if (!sound._originalMarkerPos) {
			sound._originalMarkerPos = oldPosition || newPosition;
		}
		const deltaLat = newPosition.lat - sound._originalMarkerPos.lat;
		const deltaLng = newPosition.lng - sound._originalMarkerPos.lng;
		Geometry.updateLinePosition(sound, deltaLat, deltaLng);
		sound._originalMarkerPos = newPosition;
	} else if (sound.shapeType === 'oval' && sound.ovalCenter && sound.polygon) {
		Geometry.updateOvalPosition(sound, newPosition);
	}
}

function updateSoundOnLinePath(sound, path, speed, elapsed) {
	return pathEditorUpdateSoundOnLinePath(sound, path, speed, elapsed, {
		map: engineContext.map,
		getSmoothedPoints: getSmoothedPathPoints,
		updateMarkerPosition: updateSoundMarkerPosition
	});
}

function updateSoundOnCirclePath(sound, path, speed, elapsed) {
	return pathEditorUpdateSoundOnCirclePath(sound, path, speed, elapsed, {
		updateMarkerPosition: updateSoundMarkerPosition,
		CONSTANTS
	});
}

function updateSoundPositionOnPath(sound, path, time) {

	return pathEditorUpdateSoundPositionOnPath(sound, path, time, {
		isLinearPath,
		isCircularPath,
		updateOnLine: updateSoundOnLinePath,
		updateOnCircle: updateSoundOnCirclePath
	});
}

const ambisonicsManager = new AmbisonicsManager();
const streamManager = new StreamManager();

export class RuntimeEngine {
	constructor() {
		this.initialized = false;
		this.map = null;
		this.audioLoopActive = false;
		this.audioLoopFrameId = null;
		this.isPlaying = false;
		this.audioInitialized = false;
		this.pendingBuzzData = null;
	}

	/**
	 * Initialize the runtime engine
	 * @param {Object} options - Configuration options
	 * @param {HTMLElement} options.mapContainer - Map container element
	 * @param {Object} options.mapConfig - Leaflet map configuration
	 * @returns {Promise<void>}
	 */
	async initialize(options = {}) {
		if (this.initialized) {
			console.warn('RuntimeEngine already initialized');
			return;
		}

		try {
			const mapContainer = options.mapContainer || document.getElementById('map');
			if (!mapContainer) {
				throw new Error('Map container not found');
			}

			if (this.map) {
				this.map.remove();
				this.map = null;
			}

			if (window.map && window.map instanceof L.Map && window.map.getContainer() === mapContainer) {
				window.map.remove();
				window.map = null;
			}

			if (mapContainer._leaflet_id !== undefined) {

				mapContainer.innerHTML = '';
				mapContainer.className = '';

				Object.keys(mapContainer.dataset).forEach(key => {
					delete mapContainer.dataset[key];
				});

				mapContainer.removeAttribute('style');

				delete mapContainer._leaflet_id;

				mapContainer['_leaflet_id'] = undefined;
			}

			await new Promise(resolve => setTimeout(resolve, 10));

			const mapConfig = {
				center: [0, 0],
				zoom: 2,
				zoomControl: true,
				preferCanvas: true,
				renderer: L.canvas({ padding: 0.5 }),
				...options.mapConfig
			};

			this.map = L.map(mapContainer, mapConfig);

			Geometry.setMap(this.map);

			const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '© OpenStreetMap contributors'
			}).addTo(this.map);

			this.map.createPane('soundArea');
			this.map.getPane('soundArea').style.zIndex = CONSTANTS.MAP_PANE_Z.SOUND_AREA;
			this.map.createPane('controlPathBack');
			this.map.getPane('controlPathBack').style.zIndex = CONSTANTS.MAP_PANE_Z.CONTROL_PATH_BACK;
			this.map.createPane('controlPathFront');
			this.map.getPane('controlPathFront').style.zIndex = CONSTANTS.MAP_PANE_Z.CONTROL_PATH_FRONT;
			this.map.createPane('soundElement');
			this.map.getPane('soundElement').style.zIndex = CONSTANTS.MAP_PANE_Z.SOUND_ELEMENT;
			this.map.createPane('userMarker');
			this.map.getPane('userMarker').style.zIndex = CONSTANTS.MAP_PANE_Z.USER_MARKER;

			AudioContextManager.initialize();

			if (AudioContextManager.nativeContext) {
				ambisonicsManager.setAudioContext(AudioContextManager.nativeContext);
				streamManager.setAudioContext(AudioContextManager.nativeContext);
			}
			const self = this;

			engineContext = {
				map: this.map,
				AmbisonicsManager: ambisonicsManager,
				PolyphonyManager,
				StreamManager: streamManager,
				AudioNodeManager,
				FXManager,
				EchoManager,
				NoteManager: PolyphonyManager,
				LayerManager,
				GeolocationManager,
				CoordinateTransform,
				Geometry,
				PathZoneChecker,
				AppState,
				Selectors,
				selectors: Selectors,
				PARAMETER_REGISTRY,
				updateSoundPositionOnPath,
				processLFOs,
				processPathLFOs,
				updateSynthParam,
				getUserMovementSpeed,
				calcGain,
				calculatePathGain,
				calculateRelativePosition,
				calculateBearingPan,
				createFullSoundInstance,
				getSmoothedPathPoints,
				generateOvalPoints,
				getOffsetPolyline,
				destroySound,
				startLoopedPlayback,
				stopLoopedPlayback,
				_upgradeSynthToPolyphonic: upgradeSynthToPolyphonic,
				autoLoadSoundFile: (sound, filename) => this.loadSoundFile(sound, filename),
				_applySoundFilePlaybackParams: (sound, shouldRestart = false) => {
					if ((sound.type !== "SoundFile" && sound.type !== "Granular") || !sound.synth) {
						return;
					}
					const isGranular = sound.type === "Granular";
					sound.synth.set({
						loop: sound.params.loop || false,
						playbackRate: sound.params.speed,
						reverse: sound.params.reverse,
						loopStart: sound.params.loopStart,
						loopEnd: sound.params.loopEnd
					});
					if (isGranular) {
						sound.synth.detune = sound.params.grainDetune || 0;
						if (sound.params.timeStretchMode === 'manual') {
							sound.synth.grainSize = sound.params.grainSize || 0.1;
							sound.synth.overlap = sound.params.overlap || 0.05;
						}
					} else {
						sound.synth.fadeIn = sound.params.fadeIn;
						sound.synth.fadeOut = sound.params.fadeOut;
					}
					if (shouldRestart && sound.isPlaying && sound.params.loop) {
						if (sound._restartTimeout) {
							cancelAnimationFrame(sound._restartTimeout);
						}
						sound._restartTimeout = requestAnimationFrame(async () => {
							stopLoopedPlayback(sound);
							await new Promise(resolve => requestAnimationFrame(resolve));
							startLoopedPlayback(sound);
						});
					}
				},
				restoreFXChain: async (obj) => {
					await FXManager.restoreChain(obj, { isLayer: false });
				},
				reconnectSoundToLayers: (sound) => {
					this.reconnectSoundToLayers(sound);
				},
				audioFunctions: {
					updateAudio: (userPos) => { if (self.isPlaying) updateAudio(userPos); },
					resetAreaTracking,
					attachDragHandlers: () => {
					},
					showUserMenu: () => {}
				}
			};

			setAudioEngineContext(engineContext);
			setAudioUtilsContext(engineContext);
			setLFOProcessorContext(engineContext);
			setParameterUpdaterContext(engineContext);
			setDistanceSequencerContext(engineContext);
			setSoundCreationContext(engineContext);
			setSoundLifecycleContext(engineContext);
			setRegistriesContext(engineContext);
			setAudioSmootherContext(engineContext);
			setEchoManagerContext(engineContext);
			GeolocationManager.setContext(engineContext);
			GeolocationManager.init();

			AppState.subscribe((action) => {
				switch (action.type) {
					case 'STREAM_PLAYBACK_UPDATE': {
						const { sound, effectiveGain } = action.payload;
						if (effectiveGain > 0 && !sound.isPlaying) {
							if (sound.params.streamUrl && sound.streamStatus === 'stopped') {
								streamManager.initializeStream(sound).then(() => {
									if (sound.streamStatus === 'ready') {
										streamManager.playStream(sound);
									}
								});
							} else if (sound.streamStatus === 'ready') {
								streamManager.playStream(sound);
							}
						} else if (effectiveGain === 0 && sound.isPlaying) {
							streamManager.stopStream(sound);
						}
						sound.gain.gain.rampTo(effectiveGain, 0.1);
						break;
					}
					case 'AUDIO_ECHO_UPDATE_REQUESTED': {
						const { sound, userPos } = action.payload;
						EchoManager.update(sound, userPos);
						break;
					}
				}
			});

			document.addEventListener('visibilitychange', () => {
				this.handleVisibilityChange();
			});

			this.initialized = true;

		} catch (error) {
			console.error('Failed to initialize Runtime Engine:', error);
			throw error;
		}
	}

	/**
	 * Load and play a buzz from JSON data
	 * @param {Object} buzzData - Buzz JSON data
	 * @returns {Promise<void>}
	 */
	async loadBuzz(buzzData) {
		if (!this.initialized) {
			throw new Error('Engine not initialized. Call initialize() first.');
		}

		try {
			this.pendingBuzzData = buzzData;

			if (buzzData.audioSettings?.spatialMode) {
				AppState.audio.spatialMode = buzzData.audioSettings.spatialMode;
			}

			if (buzzData.audioSettings?.ambisonics) {
				const amb = buzzData.audioSettings.ambisonics;
				if (amb.order !== undefined) CONSTANTS.AMBISONIC_ORDER = amb.order;
				if (amb.gainBoost !== undefined) CONSTANTS.AMBISONIC_GAIN_BOOST = amb.gainBoost;
				if (amb.rolloff !== undefined) CONSTANTS.AMBISONIC_ROLLOFF = amb.rolloff;
				if (amb.minDistance !== undefined) CONSTANTS.AMBISONIC_MIN_DISTANCE = amb.minDistance;
				if (amb.stereoWidth !== undefined) CONSTANTS.AMBISONIC_STEREO_WIDTH = amb.stereoWidth;
				if (amb.stereoSpread !== undefined) CONSTANTS.AMBISONIC_STEREO_SPREAD = amb.stereoSpread;
			}

			if (buzzData.audioSettings?.smoothing) {
				applyAudioSmootherSettings(buzzData.audioSettings.smoothing);
			}

			if (buzzData.defaultLayerStates) {
				LayerManager.layers.sounds = buzzData.defaultLayerStates.sounds ?? true;
				LayerManager.layers.control = buzzData.defaultLayerStates.control ?? true;
			}

			if (buzzData.relativePositioning) {
				await GeolocationManager.waitForLocation();
			}

			if (buzzData.controlPaths) {
				await this.loadControlPaths(buzzData.controlPaths, buzzData.relativePositioning || false);
			}

			if (buzzData.sounds) {
				await this.loadSoundVisuals(buzzData.sounds, buzzData.relativePositioning || false);
			}

			if (!GeolocationManager.getUserPosition()) {
				const mapCenter = this.map.getCenter();
				GeolocationManager.createUserMarker(mapCenter);
			}

			this.startAudioLoop();

		} catch (error) {
			console.error('Failed to load buzz:', error);
			throw error;
		}
	}

	async initializeAudio() {
		if (this.audioInitialized) return;

		const buzzData = this.pendingBuzzData;
		if (!buzzData) return;

		if (buzzData.audioSettings?.spatialMode === 'ambisonics') {
			await ambisonicsManager.initialize();
		}

		if (buzzData.userLayers) {
			await this.loadUserLayers(buzzData.userLayers);
		}

		if (buzzData.sounds) {
			await this.initializeSoundAudio(buzzData.sounds);
		}

		if (buzzData.sequencers) {
			await this.loadSequencers(buzzData.sequencers);
		}

		this.audioInitialized = true;
		this.startAudioLoop();
	}

	async loadUserLayers(userLayers) {
		LayerManager.userLayers = userLayers.map(layer => ({
			id: layer.id,
			name: layer.name,
			color: layer.color,
			visible: layer.visible,
			muted: layer.muted || false,
			soloed: layer.soloed || false,
			fx: layer.fx || deepClone(DEFAULT_FX_STRUCTURE),
			eq: layer.eq || deepClone(DEFAULT_EQ_STRUCTURE),
			gain: layer.gain !== undefined ? layer.gain : CONSTANTS.DEFAULT_LAYER_GAIN
		}));

		const maxId = Math.max(...LayerManager.userLayers.map(l => parseInt(l.id.replace('user_', ''))));
		LayerManager.nextLayerId = isFinite(maxId) ? maxId + 1 : 1;

		for (const layer of LayerManager.userLayers) {
			LayerManager._userLayersMap.set(layer.id, layer);

			if (!layer.fxNodes) {
				layer.fxNodes = {
					input: new Tone.Gain(1),
					fx1: null,
					fx2: null,
					fx3: null,
					eq: null,
					gain: new Tone.Gain(layer.gain || CONSTANTS.DEFAULT_LAYER_GAIN),
					output: new Tone.Gain(1).toDestination()
				};

				layer.fxNodes.input.connect(layer.fxNodes.gain);
				layer.fxNodes.gain.connect(layer.fxNodes.output);
			}

			if (layer.fxNodes.gain) {
				layer.fxNodes.gain.gain.value = layer.gain;
			}

			await FXManager.restoreChain(layer, { isLayer: true });

			if (layer.eq?.enabled) {
				if (!layer.fxNodes.eq) {
					layer.fxNodes.eq = new Tone.EQ3({
						low: layer.eq.low !== undefined ? layer.eq.low : CONSTANTS.DEFAULT_EQ_VALUES.low,
						mid: layer.eq.mid !== undefined ? layer.eq.mid : CONSTANTS.DEFAULT_EQ_VALUES.mid,
						high: layer.eq.high !== undefined ? layer.eq.high : CONSTANTS.DEFAULT_EQ_VALUES.high,
						lowFrequency: layer.eq.lowFrequency !== undefined ? layer.eq.lowFrequency : CONSTANTS.DEFAULT_EQ_VALUES.lowFrequency,
						highFrequency: layer.eq.highFrequency !== undefined ? layer.eq.highFrequency : CONSTANTS.DEFAULT_EQ_VALUES.highFrequency
					});
				}
			}
		}
	}

	async loadControlPaths(controlPaths, isRelative = false) {
		let anchor = null;
		if (isRelative) {
			anchor = GeolocationManager.getStatusInfo().position;
			if (!anchor) {
				console.warn('Cannot place relative layout: User location unavailable. Using map center (0,0).');
				anchor = { lat: 0, lng: 0 };
			}
		}

		controlPaths.forEach(p => {
			let points = [];
			let center = null;

			if (isRelative && anchor && p.pointOffsets) {
				const coords = CoordinateTransform.pointsFromOffsets(p.pointOffsets, anchor);
				points = coords.map(c => L.latLng(c.lat, c.lng));
			} else if (p.points) {
				points = p.points.map(pt => L.latLng(pt.lat, pt.lng));
			}

			if (isRelative && anchor && p.centerOffsetX !== undefined && p.centerOffsetY !== undefined) {
				const coord = CoordinateTransform.fromOffset(p.centerOffsetX, p.centerOffsetY, anchor);
				center = L.latLng(coord.lat, coord.lng);
			} else if (p.center) {
				center = L.latLng(p.center.lat, p.center.lng);
			}

			const path = {
				id: p.id,
				type: p.type,
				label: p.label,
				color: p.color,
				layers: p.layers || [],
				points: points,
				center: center,
				radius: p.radius,
				radiusY: p.radiusY,
				relativeSpeed: p.relativeSpeed ?? 1.0,
				smoothing: p.smoothing ?? 0,
				tolerance: p.tolerance || 0,
				loop: p.loop !== undefined ? p.loop : true,
				direction: p.direction || 'forward',
				params: p.params,
				originalPoints: points.map(pt => L.latLng(pt.lat, pt.lng)),
				originalCenter: center ? L.latLng(center.lat, center.lng) : null,
				originalRadius: p.radius,
				originalRadiusY: p.radiusY,
				speed: 1.0,
				visible: true,
				pathLine: null,
				pathCircle: null,
				polygon: null,
				pointMarkers: [],
				labelMarker: null,
				attachedSounds: []
			};

			AppState.data.controlPaths.push(path);
		});

		AppState.rebuildIndexes();
	}

	async loadSoundFile(sound, filename) {
		if (!filename || (sound.type !== 'SoundFile' && sound.type !== 'Sampler')) {
			return;
		}

		if (sound.type === 'Sampler' && sound.params.samplerMode === 'grid') {
			return;
		}

		sound.isReady = false;

		return new Promise(async (resolve, reject) => {
			try {
				const fileUrl = filename;

				if (!sound.synth || sound.synth.disposed) {
					return reject(new Error("Synth not available or disposed"));
				}

				const onload = () => {
					let duration = 0;
					if (sound.synth.buffer && sound.synth.buffer.duration) {
						duration = sound.synth.buffer.duration;
					} else if (sound.synth.get && sound.synth.get('C4') && sound.synth.get('C4').duration) {
						duration = sound.synth.get('C4').duration;
					}
					if (sound.type !== 'Sampler' || !sound.soundDuration) {
						sound.soundDuration = duration;
					}
					sound.wasInsideArea = false;
					sound.isPlaying = false;
					sound.isReady = true;
					resolve();
				};

				if (sound.type === 'Sampler') {
					if (!sound.synth.connected) {
						sound.synth.connect(sound.filter);
					}
					const buffer = new Tone.Buffer(fileUrl, () => {
						sound.soundDuration = buffer.duration;
						sound.synth.add('C4', buffer);
						onload();
					}, reject);
				} else if (sound.type === 'SoundFile') {
					if (sound.params.playbackMode === 'granular') {
						const buffer = new Tone.Buffer(fileUrl, () => {
							sound.synth.buffer = buffer;
							onload();
						}, reject);
					} else {
						await sound.synth.load(fileUrl);
						onload();
					}
				}

			} catch (error) {
				console.error(`Error loading sound file ${filename}:`, error);
				sound.params.soundFile = filename;
				reject(error);
			}
		});
	}

	reconnectSoundToLayers(sound) {
		sound.gain.disconnect();

		const assignedLayers = sound.layers.filter(layerId =>
			LayerManager._userLayersMap.has(layerId)
		);

		const anySoloed = LayerManager.userLayers.some(l => l.soloed);

		if (anySoloed && assignedLayers.length === 0) {
			return;
		}

		if (Selectors.getSpatialMode() === 'ambisonics' && sound.ambisonicSource) {
			sound.gain.connect(sound.ambisonicSource.input);
			return;
		}

		if (assignedLayers.length > 0) {
			assignedLayers.forEach(layerId => {
				const layer = LayerManager.getUserLayer(layerId);
				if (layer && layer.fxNodes) {
					if (!layer.fxNodes.input) {
						layer.fxNodes = {
							input: new Tone.Gain(1),
							fx1: null,
							fx2: null,
							fx3: null,
							eq: null,
							gain: new Tone.Gain(layer.gain || CONSTANTS.DEFAULT_LAYER_GAIN),
							output: new Tone.Gain(1).toDestination()
						};
						layer.fxNodes.input.connect(layer.fxNodes.gain);
						layer.fxNodes.gain.connect(layer.fxNodes.output);
					}
					sound.gain.connect(layer.fxNodes.input);
				}
			});
		} else {
			sound.gain.toDestination();
		}
	}

	async loadSoundVisuals(sounds, isRelative = false) {
		let anchor = null;
		if (isRelative) {
			anchor = GeolocationManager.getStatusInfo().position;
			if (!anchor) {
				console.warn('Cannot place relative layout: User location unavailable. Using map center (0,0).');
				anchor = { lat: 0, lng: 0 };
			}
		}

		const createPromises = sounds.map(async (soundData) => {
			try {
				const sound = await this.createSound(soundData, isRelative, anchor, true);
				if (sound) {
					sound.persistentId = soundData.persistentId;
					sound.controlledBySequencer = soundData.controlledBySequencer || false;
					sound.layers = soundData.layers || [];
					sound.frequencyMode = soundData.frequencyMode || false;
					sound.pathRoles = soundData.pathRoles || { movement: null, zones: [], modulation: [], soundModulation: [] };
					if (!sound.pathRoles.soundModulation) {
						sound.pathRoles.soundModulation = [];
					}
					sound.motion = soundData.motion || null;
					sound.lastTouchedParam = soundData.lastTouchedParam || 'pitch';
					sound.iconPlacementMode = soundData.iconPlacementMode || 'fixed';
					sound.volumeOrigin = soundData.volumeOrigin || 'icon';
					sound.volumeModel = soundData.volumeModel || 'distance';
					sound.divisionAngle = soundData.divisionAngle !== undefined ? soundData.divisionAngle : 0;
					sound.divisionPosition = soundData.divisionPosition !== undefined ? soundData.divisionPosition : 0.5;
					sound.useSpatialPanning = soundData.useSpatialPanning !== undefined ? soundData.useSpatialPanning : true;
					sound._soundData = soundData;

					if (sound.iconPlacementMode === 'fixed' && sound.shapeType === 'polygon' && sound.vertices && sound.marker) {
						const centroid = Geometry.calculateCentroid(sound.vertices);
						sound.marker.setLatLng(centroid);
						sound.userLat = centroid.lat;
						sound.userLng = centroid.lng;
						if (sound.leafletMarker) {
							sound.leafletMarker.setLatLng(centroid);
						}
					}
				}
			} catch (error) {
				console.warn(`Failed to create sound visual:`, error);
			}
		});

		await Promise.all(createPromises);
	}

	async initializeSoundAudio(sounds) {
		const soundFilesToLoad = [];

		for (const sound of Selectors.getSounds()) {
			const soundData = sound._soundData;
			if (!soundData) continue;

			const { synth, gain, envelopeGain, filter, panner, loopFadeGain, eq } =
				AudioNodeManager.createAudioChain(sound.type, sound.params, Selectors.getSpatialMode());

			sound.synth = synth;
			sound.gain = gain;
			sound.envelopeGain = envelopeGain;
			sound.filter = filter;
			sound.panner = panner;
			sound.loopFadeGain = loopFadeGain;
			sound.eq = eq;
			sound.isReady = sound.type !== 'SoundFile' && sound.type !== 'StreamPlayer' && sound.type !== 'Sampler';

			if (soundData.params?.fx) {
				await FXManager.restoreChain(sound, { isLayer: false });
			}

			if (soundData.params?.eq?.enabled) {
				AudioNodeManager.ensureEQNode(sound);
			}

			AudioNodeManager.updateFXChain(sound);

			if (Selectors.getSpatialMode() === 'ambisonics' && sound.useSpatialPanning !== false) {
				const source = await ambisonicsManager.createSource(sound);
				if (source) {
					sound.ambisonicSource = source;
					sound.filter.disconnect();
					sound.filter.connect(sound.envelopeGain);
					sound.envelopeGain.disconnect();
					sound.envelopeGain.connect(sound.gain);
					sound.gain.disconnect();
					sound.gain.connect(source.input);
				}
			}

			if (sound.type === 'StreamPlayer' && soundData.params?.streamUrl) {
				await streamManager.initializeStream(sound);
			}

			this.reconnectSoundToLayers(sound);

			if ((sound.type === 'SoundFile' || sound.type === 'Sampler') && soundData.params?.soundFile) {
				soundFilesToLoad.push({ sound, filename: soundData.params.soundFile });
			}

			delete sound._soundData;
		}

		if (soundFilesToLoad.length > 0) {
			await Promise.all(
				soundFilesToLoad.map(({ sound, filename }) =>
					this.loadSoundFile(sound, filename).catch(error => {
						console.warn(`Failed to load sound file ${filename}:`, error);
					})
				)
			);
		}
	}

	async createSound(soundData, isRelative = false, anchor = null, visualOnly = false) {
		let lat = soundData.lat;
		let lng = soundData.lng;

		if (isRelative && anchor && soundData.offsetX !== undefined && soundData.offsetY !== undefined) {
			const pos = CoordinateTransform.fromOffset(soundData.offsetX, soundData.offsetY, anchor);
			lat = pos.lat;
			lng = pos.lng;
		}

		if (lat === undefined || lat === null || isNaN(lat)) lat = 0;
		if (lng === undefined || lng === null || isNaN(lng)) lng = 0;

		let deserializedVertices = null;
		if (soundData.shapeType === 'polygon' && SHAPE_REGISTRY.polygon) {
			const shapeData = SHAPE_REGISTRY.polygon.deserialize(soundData, isRelative, anchor);
			deserializedVertices = shapeData.vertices;
		}

		let deserializedLineData = null;
		if (soundData.shapeType === 'line' && SHAPE_REGISTRY.line) {
			deserializedLineData = SHAPE_REGISTRY.line.deserialize(soundData, isRelative, anchor);
		}

		let deserializedOvalData = null;
		if (soundData.shapeType === 'oval' && SHAPE_REGISTRY.oval) {
			deserializedOvalData = SHAPE_REGISTRY.oval.deserialize(soundData, isRelative, anchor);
		}

		if (!soundData.params.lfo) {
			soundData.params.lfo = soundData.lfo || deepClone(DEFAULT_LFO_STRUCTURE);
		}
		if (!soundData.params.fx && soundData.fx) {
			soundData.params.fx = soundData.fx;
		}
		if (!soundData.params.eq && soundData.eq) {
			soundData.params.eq = soundData.eq;
		}
		if (!soundData.params.reflections) {
			soundData.params.reflections = soundData.reflections || { enabled: false, include: [] };
		}

		const synthType = soundData.type || 'Synth';
		let markerPosition = L.latLng(lat, lng);
		const marker = {
			getLatLng: () => markerPosition,
			setLatLng: (newLatLng) => {
				markerPosition = L.latLng(newLatLng.lat, newLatLng.lng);
			}
		};

		const sound = {
			id: `sound_${Date.now()}_${Math.random()}`,
			type: synthType,
			role: soundData.role || 'sound',
			label: soundData.label,
			color: soundData.color,
			shapeType: soundData.shapeType || 'circle',
			maxDistance: soundData.maxDistance,
			userLat: lat,
			userLng: lng,
			originalLat: lat,
			originalLng: lng,
			originalSize: soundData.originalSize || soundData.maxDistance || CONSTANTS.DEFAULT_CIRCLE_RADIUS,
			synth: null,
			gain: null,
			envelopeGain: null,
			filter: null,
			panner: null,
			loopFadeGain: null,
			eq: null,
			params: soundData.params,
			isReady: false,
			isPlaying: false,
			useSpatialPanning: soundData.useSpatialPanning !== false,
			echoNodes: new Map(),
			isDragging: false,
			envelopeTimeoutId: null,
			releaseTimeoutId: null,
			playbackPosition: 0,
			_playbackStartTime: 0,
			_stoppedManually: false,
			modulationSources: [],
			marker: marker,
			circle: null,
			polygon: null,
			handle: null,
			vertices: deserializedVertices || null,
			center: soundData.center || null,
			vertexMarkers: [],
			labelMarker: null,
			linePoints: deserializedLineData?.linePoints || null,
			lineTolerance: deserializedLineData?.lineTolerance || null,
			smoothing: deserializedLineData?.smoothing || 0,
			ovalCenter: deserializedOvalData?.ovalCenter || null,
			radiusX: deserializedOvalData?.radiusX || null,
			radiusY: deserializedOvalData?.radiusY || null
		};

		const shapeColor = soundData.color || '#3388ff';
		const shapeStyle = { color: shapeColor, fillColor: shapeColor, fillOpacity: 0.2, weight: 2, pane: 'soundArea' };

		if (soundData.shapeType === 'polygon' && deserializedVertices && Array.isArray(deserializedVertices)) {
			sound.vertices = deserializedVertices;
			if (sound.vertices.length > 0) {
				sound.polygon = L.polygon(sound.vertices, shapeStyle).addTo(this.map);
			}
		} else if (soundData.shapeType === 'line' && sound.linePoints && sound.linePoints.length >= 2) {
			const pts = sound.smoothing > 0 ? Geometry.smoothPoints(sound.linePoints, sound.smoothing) : sound.linePoints;
			const corridorPoints = Geometry.generateSoundLineCorridorWithSemicircles(pts, sound.lineTolerance);
			sound.polygon = L.polygon(corridorPoints, shapeStyle).addTo(this.map);
		} else if (soundData.shapeType === 'oval' && sound.ovalCenter) {
			const ovalPoints = Geometry.generateOvalPoints(sound.ovalCenter, sound.radiusX, sound.radiusY);
			sound.polygon = L.polygon(ovalPoints, shapeStyle).addTo(this.map);
		} else if (soundData.shapeType === 'circle' && soundData.maxDistance) {
			sound.circle = L.circle(markerPosition, { ...shapeStyle, radius: soundData.maxDistance }).addTo(this.map);
		}

		const leafletMarker = L.circleMarker(markerPosition, {
			radius: 8,
			color: soundData.color || '#3388ff',
			fillColor: soundData.color || '#3388ff',
			fillOpacity: 0.8,
			weight: 2,
			pane: 'soundElement'
		}).addTo(this.map);

		if (soundData.label) {
			leafletMarker.bindTooltip(soundData.label, { permanent: false, direction: 'top' });
		}

		sound.leafletMarker = leafletMarker;

		if (!sound.params.originalValues) {
			sound.params.originalValues = {};
			const paramsToStore = ['pitch', 'frequency', 'volume', 'detune', 'harmonicity', 'modulationIndex',
				'portamento', 'spread', 'count', 'oscillatorType', 'envelope', 'filterFrequency', 'filterQ',
				'filterType', 'playbackRate', 'reverse', 'attack', 'decay', 'sustain', 'release'];
			paramsToStore.forEach(param => {
				if (sound.params[param] !== undefined) {
					sound.params.originalValues[param] = sound.params[param];
				}
			});
		}

		AppState.data.sounds.push(sound);
		return sound;
	}

	async loadSequencers(sequencers) {
		Selectors.getSounds().forEach(sound => {
			sound.controlledBySequencer = false;
		});

		const { DistanceSequencer } = await import('../core/audio/DistanceSequencer.js');
		AppState.data.sequencers = sequencers.map(data => new DistanceSequencer(data));
		AppState.rebuildIndexes();
	}

	audioUpdateLoop() {
		if (!this.audioLoopActive || AppState.workspace.isInitializing) {
			return;
		}

		const now = performance.now() / 1000;
		let positionsMayHaveChanged = false;

		if (engineContext.processPathLFOs) {
			positionsMayHaveChanged = engineContext.processPathLFOs(now);
		}

		Selectors.getSounds().forEach(s => {
			if (s.pathRoles?.movement) {
				const path = AppState.getPath(s.pathRoles.movement);
				if (path && updateSoundPositionOnPath) {
					updateSoundPositionOnPath(s, path, now);
					positionsMayHaveChanged = true;
				}
			}

			if (engineContext.processLFOs && s.params?.lfo) {
				try {
					engineContext.processLFOs(s, now);

					if (s.marker && s.leafletMarker) {
						const markerPos = s.marker.getLatLng();
						s.leafletMarker.setLatLng(markerPos);
					}
				} catch (error) {
					console.error('[RuntimeEngine] Error processing LFOs for sound:', s.id, error);
					console.error('LFO config:', s.params.lfo);
					console.error('Stack:', error.stack);
				}
			}

			const lfo = s.params?.lfo;
			if (lfo && ((lfo.x?.freq > 0 && lfo.x?.range > 0) ||
			           (lfo.y?.freq > 0 && lfo.y?.range > 0) ||
			           (lfo.size?.freq > 0 && lfo.size?.range > 0))) {
				positionsMayHaveChanged = true;
			}
		});

		if (this.isPlaying && Tone.context.state === 'running') {
			const userPos = GeolocationManager.getUserPosition();
			if (userPos) {
				updateAudio(userPos);
			}
		}

		this.audioLoopFrameId = requestAnimationFrame(() => this.audioUpdateLoop());
	}

	startAudioLoop() {
		if (this.audioLoopActive) {
			return;
		}

		this.audioLoopActive = true;
		this.audioUpdateLoop();
	}

	stopAudioLoop() {
		this.audioLoopActive = false;

		if (this.audioLoopFrameId) {
			cancelAnimationFrame(this.audioLoopFrameId);
			this.audioLoopFrameId = null;
		}
	}

	handleVisibilityChange() {
		if (document.hidden) {
			this.pauseForBackground();
		} else {
			this.resumeFromBackground();
		}
	}

	pauseForBackground() {
		Selectors.getSounds().forEach(sound => {
			if (sound.isPlaying) {
				if (sound.type === 'StreamPlayer') {
					streamManager.stopStream(sound);
				} else {
					PolyphonyManager.release(sound);
				}
				sound.isPlaying = false;
			}
			sound.wasInsideArea = false;
		});
		this.stopAudioLoop();
	}

	async resumeFromBackground() {
		if (Tone.context.state === 'suspended') {
			await Tone.context.resume();
		}
		if (!this.audioLoopActive) {
			this.startAudioLoop();
		}
		AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
	}

	async start() {
		if (!this.initialized) {
			throw new Error('Engine not initialized');
		}

		try {
			if (AudioContextManager.nativeContext && AudioContextManager.nativeContext.state === 'suspended') {
				await AudioContextManager.nativeContext.resume();
			}

			if (Tone.context.state !== 'running') {
				await Tone.start();
				await Tone.context.resume();
			}

			await this.initializeAudio();

			this.isPlaying = true;

			let userPos = GeolocationManager.getUserPosition();

			if (!userPos) {
				const mapCenter = this.map.getCenter();
				GeolocationManager.createUserMarker(mapCenter);
				userPos = GeolocationManager.getUserPosition();
			}

			if (userPos) {
				updateAudio(userPos);
			}

		} catch (error) {
			console.error('Failed to start audio:', error);
			throw error;
		}
	}

	stop() {
		if (!this.initialized) {
			return;
		}

		this.isPlaying = false;

		Selectors.getSounds().forEach(sound => {
			if (sound.type === 'SoundFile' && sound.params.loop) {
				stopLoopedPlayback(sound);
			} else if (sound.isPlaying) {
				if (sound.type === 'StreamPlayer') {
					streamManager.stopStream(sound);
				} else if (sound.type === 'SoundFile') {
					if (sound.synth && sound.synth.state === 'started') {
						sound.synth.stop();
					}
					sound.isPlaying = false;
				} else {
					PolyphonyManager.release(sound);
					sound.isPlaying = false;
				}
			}
			sound.wasInsideArea = false;
		});

		Selectors.getSequencers().forEach(sequencer => {
			if (sequencer.enabled) {
				sequencer._releaseAllNotes();
			}
		});
	}

	dispose() {
		if (!this.initialized) {
			return;
		}

		this.stop();
		this.stopAudioLoop();

		if (Selectors.getSpatialMode() === 'ambisonics') {
			ambisonicsManager.dispose();
		}

		if (Tone.context?.state !== 'closed') {
			Tone.context.close();
		}

		this.initialized = false;
	}

	getState() {
		return AppState.data;
	}

	getContext() {
		return engineContext;
	}
}

export const runtimeEngine = new RuntimeEngine();

if (typeof window !== 'undefined') {
	window.GeoBuzzEngine = runtimeEngine;
}

export default runtimeEngine;
