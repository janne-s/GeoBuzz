import { StorageAdapter } from './StorageAdapter.js';
import { CONSTANTS } from '../core/constants.js';
import { validateRange } from '../config/ParameterRangeManager.js';
import { getSettings as getAudioSmootherSettings, applySettings as applyAudioSmootherSettings } from '../core/audio/AudioSmoother.js';
import { ModalSystem } from '../ui/ModalSystem.js';

export class SettingsManager {
	static context = null;

	static setContext(context) {
		this.context = context;
	}

	static buildSettings() {
		const relativePositioning = document.getElementById('relativePositioningToggle').checked;
		const anchor = relativePositioning ? this.getUserPosition() : null;

		if (relativePositioning && !anchor) {
			console.warn('Relative positioning is on, but user location is unavailable. Saving absolute coordinates as a fallback.');
		}

		return {
			version: CONSTANTS.SAVE_FORMAT_VERSION,
			relativePositioning: relativePositioning,
			mapStyle: this.context.mapManager.getCurrentStyle(),
			colorIndex: this.context.AppState.ui.colorIndex,

			audioSettings: {
				spatialMode: this.context.Selectors.getSpatialMode(),
				userDirection: this.context.Selectors.getUserDirection(),
				useDeviceOrientation: this.context.DeviceOrientationManager?.getStatus().enabled || false,
				ambisonics: {
					order: this.context.CONSTANTS.AMBISONIC_ORDER,
					gainBoost: this.context.CONSTANTS.AMBISONIC_GAIN_BOOST,
					rolloff: this.context.CONSTANTS.AMBISONIC_ROLLOFF,
					minDistance: this.context.CONSTANTS.AMBISONIC_MIN_DISTANCE,
					stereoWidth: this.context.CONSTANTS.AMBISONIC_STEREO_WIDTH,
					stereoSpread: this.context.CONSTANTS.AMBISONIC_STEREO_SPREAD
				},
				smoothing: getAudioSmootherSettings(),
				gpsSmoothing: this.context.GeolocationManager?.getGpsSmoothing() ?? CONSTANTS.GPS_SMOOTHING_DEFAULT
			},

			oscSettings: {
				enabled: this.context.OSCManager.enabled,
				host: this.context.OSCManager.config.host,
				port: this.context.OSCManager.config.port
			},

			defaultLayerStates: {
				sounds: this.context.LayerManager.layers.sounds,
				control: this.context.LayerManager.layers.control
			},

			customParameterRanges: this.context.Selectors.getCustomParameterRanges(),

			userLayers: this.serializeUserLayers(),
			sounds: this.context.Selectors.getSounds().map(s => this.serializeSound(s, relativePositioning, anchor)),
			controlPaths: this.context.Selectors.getPaths().map(p => this.serializePath(p, relativePositioning, anchor)),
			sequencers: this.context.Selectors.getSequencers().map(seq => ({
				id: seq.id,
				label: seq.label,
				enabled: seq.enabled,
				numSteps: seq.numSteps,
				stepLength: seq.stepLength,
				speedThreshold: seq.speedThreshold,
				releaseOnStop: seq.releaseOnStop,
				loop: seq.loop,
				resumeOnReenter: seq.resumeOnReenter,
				restartOnReenter: seq.restartOnReenter,
				releaseDelay: seq.releaseDelay,
				muted: seq.muted,
				soloed: seq.soloed,
				activePaths: seq.activePaths,
				sceneChangePaths: seq.sceneChangePaths,
				baseSceneIndex: seq.baseSceneIndex,
				assignedPath: seq.assignedPath,
				scenes: seq.scenes,
				activeSceneIndex: seq.activeSceneIndex,
				tracks: seq.tracks.map(track => ({
					id: track.id,
					instrumentType: track.instrumentType,
					instrumentId: track.instrumentId,
					synthType: track.synthType,
					synthParams: track.synthParams ? this.context.utils.deepClone(track.synthParams) : undefined,
					octave: track.octave,
					numSteps: track.numSteps,
					steps: track.steps,
					sceneSteps: track.sceneSteps,
					paramTarget: track.paramTarget,
					editMode: track.editMode,
					offsetMode: track.offsetMode,
					offsetFraction: track.offsetFraction,
					offsetSteps: track.offsetSteps,
					offset: track.offset,
					muted: track.muted,
					soloed: track.soloed
				}))
			}))
		};
	}

	static serializeSound(sound, isRelative = false, anchor = null) {
		const serialized = {
			persistentId: sound.persistentId,
			type: sound.type,
			role: sound.role,
			label: sound.label,
			color: sound.color,
			shapeType: sound.shapeType,
			maxDistance: sound.maxDistance,
			layers: sound.layers,
			frequencyMode: sound.frequencyMode,
			modulationSources: sound.modulationSources,
			motion: sound.motion,
			lastTouchedParam: sound.lastTouchedParam,
			iconPlacementMode: sound.iconPlacementMode,
			volumeOrigin: sound.volumeOrigin,
			volumeModel: sound.volumeModel,
			divisionAngle: sound.divisionAngle,
			divisionPosition: sound.divisionPosition,
			useSpatialPanning: sound.useSpatialPanning,
			controlledBySequencer: sound.controlledBySequencer || false,
			params: {},
			pathRoles: {
				movement: sound.pathRoles?.movement || null,
				zones: sound.pathRoles?.zones || [],
				modulation: sound.pathRoles?.modulation || [],
				soundModulation: sound.pathRoles?.soundModulation || []
			},
		};

		if (isRelative && anchor) {
			const offset = this.context.CoordinateTransform.toOffset(sound.userLat, sound.userLng, anchor);
			serialized.offsetX = offset.offsetX;
			serialized.offsetY = offset.offsetY;
		} else {
			serialized.lat = sound.userLat;
			serialized.lng = sound.userLng;
		}

		if (sound.shapeType) {
			Object.assign(serialized, this.context.ShapeManager.serializeShape(sound, isRelative, anchor));
		}

		if (sound.params && typeof sound.params === 'object') {
			Object.keys(this.context.PARAMETER_REGISTRY).forEach(paramKey => {
				const def = this.context.PARAMETER_REGISTRY[paramKey];
				if (def.serialize && !paramKey.startsWith('fx_') && !paramKey.startsWith('lfo_')) {
					if (sound.params.hasOwnProperty(paramKey)) {
						serialized.params[paramKey] = sound.params[paramKey];
					}
				}
			});
		}

		serialized.lfo = this.context.utils.deepClone(sound.params.lfo);
		serialized.fx = this.context.utils.deepClone(sound.params.fx);
		serialized.eq = this.context.utils.deepClone(sound.params.eq);
		serialized.reflections = sound.params.reflections ?
			this.context.utils.deepClone(sound.params.reflections) : undefined;

		if (sound.type === 'SoundFile' && sound.params.soundFile) {
			serialized.params.soundFile = sound.params.soundFile;
		}
		if (sound.type === 'Sampler') {
			serialized.params.samplerMode = sound.params.samplerMode || 'single';

			if (sound.params.samplerMode === 'single' && sound.params.soundFile) {
				serialized.params.soundFile = sound.params.soundFile;
			}

			if (sound.params.samplerMode === 'grid' && sound.params.gridSamples) {
				serialized.params.gridSamples = this.context.utils.deepClone(sound.params.gridSamples);
			}
		}
		if (sound.type === 'StreamPlayer' && sound.params.streamUrl) {
			serialized.params.streamUrl = sound.params.streamUrl;
		}

		return serialized;
	}

	static serializePath(path, isRelative = false, anchor = null) {
		const serialized = {
			id: path.id,
			type: path.type,
			label: path.label,
			color: path.color,
			layers: path.layers || [],
			radius: path.radius,
			radiusY: path.radiusY,
			relativeSpeed: path.relativeSpeed ?? 1.0,
			smoothing: path.smoothing ?? 0,
			tolerance: path.tolerance || 0,
			loop: path.loop !== undefined ? path.loop : true,
			direction: path.direction || 'forward',
			params: path.params
		};

		if (isRelative && anchor) {
			if (path.points && path.points.length > 0) {
				serialized.pointOffsets = this.context.CoordinateTransform.pointsToOffsets(path.points, anchor);
			}
			if (path.center) {
				const offset = this.context.CoordinateTransform.pointToOffset(path.center, anchor);
				serialized.centerOffsetX = offset.offsetX;
				serialized.centerOffsetY = offset.offsetY;
			}
		} else {
			serialized.points = path.points ? path.points.map(pt => ({ lat: pt.lat, lng: pt.lng })) : [];
			serialized.center = path.center ? { lat: path.center.lat, lng: path.center.lng } : null;
		}

		return serialized;
	}

	static getUserPosition() {
		const pos = this.context.GeolocationManager.getStatusInfo().position;
		return pos ? { lat: pos.lat, lng: pos.lng } : null;
	}

	static serializeUserLayers() {
		return this.context.LayerManager.userLayers.map(layer => ({
			id: layer.id,
			name: layer.name,
			color: layer.color,
			visible: layer.visible,
			muted: layer.muted || false,
			soloed: layer.soloed || false,
			fx: layer.fx || this.context.utils.deepClone(this.context.fxStructures.fx),
			eq: layer.eq || this.context.utils.deepClone(this.context.fxStructures.eq),
			gain: layer.gain !== undefined ? layer.gain : this.context.CONSTANTS.DEFAULT_LAYER_GAIN
		}));
	}

	static async applySettings(settings, options = {}) {
		this.clearAll();

		if (settings.customParameterRanges) {
			Object.entries(settings.customParameterRanges).forEach(([paramKey, customRange]) => {
				const param = this.context.PARAMETER_REGISTRY[paramKey];
				if (!param) {
					console.warn(`Parameter ${paramKey} not found in registry, skipping customization`);
					return;
				}

				const effectiveMin = customRange.min !== undefined ? customRange.min : param.min;
				const effectiveMax = customRange.max !== undefined ? customRange.max : param.max;
				const effectiveStep = customRange.step !== undefined ? customRange.step : param.step;

				const validation = validateRange(effectiveMin, effectiveMax, effectiveStep);
				if (!validation.valid) {
					console.warn(`Invalid custom range for ${paramKey}:`, validation.errors.join(', '));
					return;
				}

				this.context.AppState.customization.parameterRanges[paramKey] = customRange;
			});
		}

		if (settings.audioSettings?.spatialMode) {
			this.context.AppState.audio.spatialMode = settings.audioSettings.spatialMode;
		}

		if (settings.audioSettings?.userDirection !== undefined) {
			this.context.AppState.audio.userDirection = settings.audioSettings.userDirection;
			if (this.context.PathEditor && this.context.PathEditor.updateDirectionUI) {
				this.context.PathEditor.updateDirectionUI(this.context.Selectors.getUserDirection());
			}
		}

		if (settings.audioSettings?.useDeviceOrientation && this.context.DeviceOrientationManager) {
			await this.context.DeviceOrientationManager.start();
		}

		if (settings.audioSettings?.ambisonics) {
			const amb = settings.audioSettings.ambisonics;
			if (amb.order !== undefined) this.context.CONSTANTS.AMBISONIC_ORDER = amb.order;
			if (amb.gainBoost !== undefined) this.context.CONSTANTS.AMBISONIC_GAIN_BOOST = amb.gainBoost;
			if (amb.rolloff !== undefined) this.context.CONSTANTS.AMBISONIC_ROLLOFF = amb.rolloff;
			if (amb.minDistance !== undefined) this.context.CONSTANTS.AMBISONIC_MIN_DISTANCE = amb.minDistance;
			if (amb.stereoWidth !== undefined) this.context.CONSTANTS.AMBISONIC_STEREO_WIDTH = amb.stereoWidth;
			if (amb.stereoSpread !== undefined) this.context.CONSTANTS.AMBISONIC_STEREO_SPREAD = amb.stereoSpread;
		}

		if (settings.audioSettings?.smoothing) {
			applyAudioSmootherSettings(settings.audioSettings.smoothing);
		}

		if (settings.audioSettings?.gpsSmoothing !== undefined) {
			this.context.GeolocationManager?.setGpsSmoothing(settings.audioSettings.gpsSmoothing);
		}

		if (settings.oscSettings) {
			if (settings.oscSettings.host !== undefined) this.context.OSCManager.config.host = settings.oscSettings.host;
			if (settings.oscSettings.port !== undefined) this.context.OSCManager.config.port = settings.oscSettings.port;

			const oscHostInput = document.getElementById('oscHost');
			const oscPortInput = document.getElementById('oscPort');
			const oscEnableToggle = document.getElementById('oscEnableToggle');

			if (oscHostInput) oscHostInput.value = this.context.OSCManager.config.host;
			if (oscPortInput) oscPortInput.value = this.context.OSCManager.config.port;
			if (oscEnableToggle && settings.oscSettings.enabled) {
				oscEnableToggle.checked = true;
				this.context.OSCManager.connect();
			}
		}

		const relativePositioningToggle = document.getElementById('relativePositioningToggle');
		if (relativePositioningToggle) {
			relativePositioningToggle.checked = settings.relativePositioning || false;
		}

		if (settings.mapStyle) {
			this.context.mapManager.changeStyle(settings.mapStyle);
		}

		if (settings.colorIndex !== undefined) {
			this.context.AppState.ui.colorIndex = settings.colorIndex;
		}

		if (settings.defaultLayerStates) {
			this.context.LayerManager.layers.sounds = settings.defaultLayerStates.sounds ?? true;
			this.context.LayerManager.layers.control = settings.defaultLayerStates.control ?? true;
		}

		if (settings.userLayers) {
			await this.restoreUserLayers(settings.userLayers);
		}

		if (settings.relativePositioning) {
			await this.context.GeolocationManager.waitForLocation();
		}

		if (settings.controlPaths) {
			this.restoreControlPaths(settings.controlPaths, settings.relativePositioning || false);
		}

		if (settings.sounds) {
			await this.restoreSounds(settings.sounds, settings.relativePositioning || false);
		}

		if (settings.sequencers) {
			this.restoreSequencers(settings.sequencers);
		}

		if (settings.audioSettings?.spatialMode === 'ambisonics') {
			await this.context.AmbisonicsManager.initialize();

			for (const sound of this.context.Selectors.getSounds()) {
				if (sound.useSpatialPanning) {
					const source = await this.context.AmbisonicsManager.createSource(sound);
					if (source) {
						sound.ambisonicSource = source;
						this.context.audioFunctions.reconnectSoundToLayers(sound);
					}
				}
			}
		}

		this.finalizeRestore();
	}

	static async restoreUserLayers(userLayers) {
		this.context.LayerManager.userLayers = userLayers.map(layer => ({
			id: layer.id,
			name: layer.name,
			color: layer.color,
			visible: layer.visible,
			muted: layer.muted || false,
			soloed: layer.soloed || false,
			fx: layer.fx || this.context.utils.deepClone(this.context.fxStructures.fx),
			eq: layer.eq || this.context.utils.deepClone(this.context.fxStructures.eq),
			gain: layer.gain !== undefined ? layer.gain : this.context.CONSTANTS.DEFAULT_LAYER_GAIN
		}));

		const maxId = Math.max(...this.context.LayerManager.userLayers.map(l => parseInt(l.id.replace('user_', ''))));
		this.context.LayerManager.nextLayerId = isFinite(maxId) ? maxId + 1 : 1;

		for (const layer of this.context.LayerManager.userLayers) {
			this.context.LayerManager._userLayersMap.set(layer.id, layer);
			this.context.audioFunctions.createLayerFXNodes(layer);
			if (layer.fxNodes.gain) {
				layer.fxNodes.gain.gain.value = layer.gain;
			}

			await this.context.FXManager.restoreChain(layer, { isLayer: true });

			if (layer.eq?.enabled) {
				this.context.audioFunctions.createLayerEQNode(layer);
			}
		}

		this.context.LayerManager.refreshUserLayersUI();
	}

	static restoreControlPaths(controlPaths, isRelative = false) {
		let anchor = null;
		if (isRelative) {
			anchor = this.getUserPosition();
			if (!anchor) {
				alert('Cannot place relative layout: Your location is unavailable. Elements will be placed at map center (0,0).');
				anchor = { lat: 0, lng: 0 };
			}
		}

		controlPaths.forEach(p => {
			let points = [];
			let center = null;

			if (isRelative && anchor && p.pointOffsets) {
				const coords = this.context.CoordinateTransform.pointsFromOffsets(p.pointOffsets, anchor);
				points = coords.map(c => L.latLng(c.lat, c.lng));
			} else if (p.points) {
				points = p.points.map(pt => L.latLng(pt.lat, pt.lng));
			}

			if (isRelative && anchor && p.centerOffsetX !== undefined && p.centerOffsetY !== undefined) {
				const coord = this.context.CoordinateTransform.fromOffset(p.centerOffsetX, p.centerOffsetY, anchor);
				center = L.latLng(coord.lat, coord.lng);
			} else if (p.center) {
				center = L.latLng(p.center.lat, p.center.lng);
			}

			const data = {
				label: p.label,
				color: p.color,
				type: p.type,
				layers: p.layers || [],
				points: points,
				center: center,
				radius: p.radius,
				radiusY: p.radiusY,
				relativeSpeed: p.relativeSpeed ?? 1.0,
				smoothing: p.smoothing ?? 0,
				tolerance: p.tolerance,
				loop: p.loop !== undefined ? p.loop : true,
				direction: p.direction || 'forward',
				params: p.params
			};

			const path = this.context.audioFunctions.createControlPath(p.type, data);
			if (path) {
				path.id = p.id;
			}
		});

		this.context.AppState.rebuildIndexes();
	}

	static restoreSequencers(sequencersData) {
		this.context.Selectors.getSounds().forEach(sound => {
			sound.controlledBySequencer = false;
		});

		this.context.AppState.data.sequencers = sequencersData.map(data => new this.context.DistanceSequencer(data));
		this.context.AppState.rebuildIndexes();
		this.context.audioFunctions.refreshSequencersList();
	}

	static async restoreSounds(soundsData, isRelative = false) {
		let anchor = null;
		if (isRelative) {
			anchor = this.getUserPosition();
			if (!anchor) {
				alert('Cannot place relative layout: Your location is unavailable. Elements will be placed at map center (0,0).');
				anchor = { lat: 0, lng: 0 };
			}
		}

		const soundFilesToLoad = [];

		const restorePromises = soundsData.map(async (s) => {
			const soundToLoad = { ...s };

			if (isRelative && anchor && soundToLoad.offsetX !== undefined && soundToLoad.offsetY !== undefined) {
				const pos = this.context.CoordinateTransform.fromOffset(soundToLoad.offsetX, soundToLoad.offsetY, anchor);
				soundToLoad.lat = pos.lat;
				soundToLoad.lng = pos.lng;

				if (soundToLoad.centerOffsetX !== undefined && soundToLoad.centerOffsetY !== undefined) {
					soundToLoad.center = this.context.CoordinateTransform.fromOffset(soundToLoad.centerOffsetX, soundToLoad.centerOffsetY, anchor);
				}

				if (soundToLoad.vertexOffsets) {
					soundToLoad.vertices = this.context.CoordinateTransform.pointsFromOffsets(soundToLoad.vertexOffsets, anchor);
				} else if (soundToLoad.vertices && Array.isArray(soundToLoad.vertices) && soundToLoad.vertices.length > 0) {
					if (soundToLoad.vertices[0]?.offsetX !== undefined && soundToLoad.vertices[0]?.offsetY !== undefined) {
						soundToLoad.vertices = soundToLoad.vertices.map(v => {
							const coord = this.context.CoordinateTransform.fromOffset(v.offsetX, v.offsetY, anchor);
							return { lat: coord.lat, lng: coord.lng };
						});
					}
				}

				if (soundToLoad.linePoints && Array.isArray(soundToLoad.linePoints) && soundToLoad.linePoints.length > 0) {
					if (soundToLoad.linePoints[0]?.offsetX !== undefined) {
						soundToLoad.linePoints = soundToLoad.linePoints.map(p => {
							const coord = this.context.CoordinateTransform.fromOffset(p.offsetX, p.offsetY, anchor);
							return { lat: coord.lat, lng: coord.lng };
						});
					}
				}

				if (soundToLoad.centerOffset) {
					soundToLoad.center = this.context.CoordinateTransform.fromOffset(soundToLoad.centerOffset.offsetX, soundToLoad.centerOffset.offsetY, anchor);
				}
			}

			const sound = await this.context.audioFunctions.loadSound(soundToLoad, { deferFileLoading: true });

			if (!sound) return;

			sound.layers = s.layers || [];
			sound.frequencyMode = s.frequencyMode || false;
			sound.pathRoles = s.pathRoles || { movement: null, zones: [], modulation: [], soundModulation: [] };
			sound.motion = s.motion || null;
			sound.lastTouchedParam = s.lastTouchedParam || 'pitch';
			sound.iconPlacementMode = s.iconPlacementMode || 'fixed';
			sound.volumeOrigin = s.volumeOrigin || 'icon';
			sound.volumeModel = s.volumeModel || 'distance';
			sound.divisionAngle = s.divisionAngle !== undefined ? s.divisionAngle : (s.volumeAxis === 'y' ? 90 : 0);
			sound.divisionPosition = s.divisionPosition !== undefined ? s.divisionPosition : 0.5;
			sound.useSpatialPanning = s.useSpatialPanning !== undefined ? s.useSpatialPanning : true;

			this.context.Geometry.updateDivisionLineVisual(sound, this.context.map);

			if (sound.iconPlacementMode === 'fixed' && sound.shapeType === 'polygon' && sound.vertices && sound.marker) {
				const centroid = this.context.Geometry.calculateCentroid(sound.vertices);
				sound.marker.setLatLng(centroid);
				sound.userLat = centroid.lat;
				sound.userLng = centroid.lng;
			}

			if ((sound.type === 'SoundFile' || sound.type === 'Sampler') && sound.params?.soundFile) {
				soundFilesToLoad.push({ sound, filename: sound.params.soundFile });
			} else if (sound.type === 'StreamPlayer' && sound.params?.streamUrl) {
				soundFilesToLoad.push({ sound, isStream: true });
			}

			return sound;
		});

		await Promise.all(restorePromises);

		if (soundFilesToLoad.length > 0) {
			Promise.all(
				soundFilesToLoad.map(({ sound, filename, isStream }) => {
					if (isStream) {
						return this.context.StreamManager.initializeStream(sound).catch(error => {
							console.warn(`Failed to initialize stream:`, error);
						});
					}
					return this.context.autoLoadSoundFile(sound, filename).then(() => {
						if (sound.type === 'SoundFile' && this.context._applySoundFilePlaybackParams) {
							this.context._applySoundFilePlaybackParams(sound, false);
						}
					}).catch(error => {
						console.warn(`Failed to load sound file ${filename}:`, error);
					});
				})
			);
		}

		this.context.Selectors.getSounds().forEach(sound => {
			const typeCounterMap = {
				'Synth': 'synth',
				'AMSynth': 'amSynth',
				'FMSynth': 'fmSynth',
				'FatOscillator': 'fatOscillator',
				'NoiseSynth': 'noiseSynth',
				'SoundFile': 'soundFile',
				'StreamPlayer': 'streamPlayer',
				'Sampler': 'sampler'
			};

			const counterKey = typeCounterMap[sound.type];
			if (counterKey) {
				const match = sound.label.match(/#(\d+)/);
				if (match) {
					const num = parseInt(match[1]);
					if (num > this.context.AppState.counters[counterKey]) {
						this.context.AppState.counters[counterKey] = num;
					}
				}
			}
		});
	}

	static finalizeRestore() {
		this.context.LayerManager.updateUI();

		this.context.audioFunctions.refreshElementsList();

		if (this.context.SelectionController) {
			this.context.SelectionController.refreshLayersList();
		}

		const userPos = this.context.GeolocationManager.getUserPosition();
		if (userPos) {
			this.context.audioFunctions.updateAudio(userPos);
			this.context.audioFunctions.resetAreaTracking(userPos);
		}

		// Send full OSC state if OSC is enabled
		if (this.context.OSCManager.enabled) {
			this.context.OSCManager.sendFullState();
		}
	}

	static clearAll() {
		this.context.cancelPathDrawing();
		this.context.cancelSoundDrawing();
		this.context.simulationFunctions.stopSimulation();
		this.context.simulationFunctions.detachUserFromPath();
		this.context.closeAllMenus();
		document.querySelectorAll('.side-menu').forEach(menu => menu.classList.remove('active'));
		this.context.AppState.dispatch({
			type: 'UI_SIDE_MENU_TOGGLED',
			payload: { menu: null, wasActive: true }
		});

		this.context.Selectors.getSounds().forEach(sound => this.context.audioFunctions.destroySound(sound));
		this.context.Selectors.getSounds().length = 0;

		if (this.context.Selectors.getSpatialMode() === 'ambisonics') {
			this.context.AmbisonicsManager.dispose();
		}

		this.context.Selectors.getPaths().forEach(p => {
			if (p.pathLine) this.context.map.removeLayer(p.pathLine);
			if (p.pathCircle) this.context.map.removeLayer(p.pathCircle);
			if (p.polygon) this.context.map.removeLayer(p.polygon);
			if (p.hintLine) this.context.map.removeLayer(p.hintLine);
			if (p.toleranceLayer) this.context.map.removeLayer(p.toleranceLayer);
			if (p.toleranceInner) this.context.map.removeLayer(p.toleranceInner);
			if (p.labelMarker) this.context.map.removeLayer(p.labelMarker);
			p.pointMarkers.forEach(m => this.context.map.removeLayer(m));

			p.attachedSounds.forEach(soundId => {
				const sound = this.context.AppState.getSound(soundId);
				if (sound && sound.pathRoles?.movement === p.id) {
					sound.pathRoles.movement = null;
					delete sound.pathProgress;
				}
			});
		});

		this.context.Selectors.getPaths().length = 0;
		this.context.Selectors.getSequencers().length = 0;
		this.context.AppState.rebuildIndexes();
		this.context.AppState.drawing.pathCount = 0;
		this.context.audioFunctions.refreshPathsList();
		this.context.audioFunctions.refreshSequencersList();

		this.context.LayerManager.userLayers.forEach(layer => {
			if (layer.fxNodes) {
				Object.values(layer.fxNodes).forEach(node => {
					if (node?.dispose) node.dispose();
				});
			}
		});
		this.context.LayerManager.userLayers = [];
		this.context.LayerManager.nextLayerId = 1;
		this.context.LayerManager.refreshUserLayersUI();

		this.context.AppState.resetCounters();

		this.context.audioFunctions.refreshElementsList();

		this.context.audioFunctions.saveWorkspaceSettings();
	}

	static saveSettings() {
		const settings = this.buildSettings();
		StorageAdapter.exportToFile(settings);
	}

	static async loadSettings(event) {
		const file = event.target.files[0];

		try {
			const settings = await StorageAdapter.importFromFile(file);
			if (!settings) {
				event.target.value = '';
				return;
			}

			const existingCount = this.context.Selectors.getSoundCount() +
				this.context.Selectors.getPathCount() +
				this.context.Selectors.getSequencerCount();

			if (existingCount === 0) {
				await this.applySettings(settings, { isFromFile: true });
			} else {
				const result = await this.showMergeModal(existingCount);
				if (result === 'replace') {
					await this.applySettings(settings, { isFromFile: true });
				} else if (result === 'merge') {
					await this.mergeSettings(settings);
				}
			}
			event.target.value = '';
		} catch (error) {
			alert(error.message);
		}
	}

	static async showMergeModal(existingCount) {
		return ModalSystem.show({
			title: 'Load Settings',
			message: `The workspace has ${existingCount} existing element${existingCount !== 1 ? 's' : ''}. How would you like to load the settings?`,
			buttons: [
				{ text: 'Cancel', result: 'cancel' },
				{ text: 'Merge', result: 'merge' },
				{ text: 'Replace', result: 'replace', primary: true }
			]
		});
	}

	static async mergeSettings(settings) {
		if (settings.customParameterRanges) {
			const existingRanges = this.context.AppState.customization.parameterRanges;
			Object.entries(settings.customParameterRanges).forEach(([paramKey, customRange]) => {
				if (existingRanges[paramKey]) return;

				const param = this.context.PARAMETER_REGISTRY[paramKey];
				if (!param) return;

				const effectiveMin = customRange.min !== undefined ? customRange.min : param.min;
				const effectiveMax = customRange.max !== undefined ? customRange.max : param.max;
				const effectiveStep = customRange.step !== undefined ? customRange.step : param.step;

				const validation = validateRange(effectiveMin, effectiveMax, effectiveStep);
				if (!validation.valid) return;

				existingRanges[paramKey] = customRange;
			});
		}

		if (settings.userLayers) {
			await this.mergeUserLayers(settings.userLayers);
		}

		if (settings.relativePositioning) {
			await this.context.GeolocationManager.waitForLocation();
		}

		const existingPathIds = new Set(this.context.Selectors.getPaths().map(p => p.id));
		if (settings.controlPaths) {
			const newPaths = settings.controlPaths.filter(p => !existingPathIds.has(p.id));
			if (newPaths.length > 0) {
				this.restoreControlPaths(newPaths, settings.relativePositioning || false);
			}
		}

		const existingPersistentIds = new Set(this.context.Selectors.getSounds().map(s => s.persistentId));
		if (settings.sounds) {
			const newSounds = settings.sounds.filter(s => !existingPersistentIds.has(s.persistentId));
			if (newSounds.length > 0) {
				await this.restoreSounds(newSounds, settings.relativePositioning || false);
			}
		}

		const existingSeqIds = new Set(this.context.Selectors.getSequencers().map(seq => seq.id));
		if (settings.sequencers) {
			const newSequencers = settings.sequencers.filter(seq => !existingSeqIds.has(seq.id));
			if (newSequencers.length > 0) {
				this.mergeSequencers(newSequencers);
			}
		}

		this.finalizeRestore();
	}

	static async mergeUserLayers(userLayers) {
		const existingIds = new Set(this.context.LayerManager.userLayers.map(l => l.id));

		for (const layer of userLayers) {
			if (existingIds.has(layer.id)) continue;

			const newLayer = {
				id: layer.id,
				name: layer.name,
				color: layer.color,
				visible: layer.visible,
				muted: layer.muted || false,
				soloed: layer.soloed || false,
				fx: layer.fx || this.context.utils.deepClone(this.context.fxStructures.fx),
				eq: layer.eq || this.context.utils.deepClone(this.context.fxStructures.eq),
				gain: layer.gain !== undefined ? layer.gain : this.context.CONSTANTS.DEFAULT_LAYER_GAIN
			};

			this.context.LayerManager.userLayers.push(newLayer);
			this.context.LayerManager._userLayersMap.set(newLayer.id, newLayer);
			this.context.audioFunctions.createLayerFXNodes(newLayer);
			if (newLayer.fxNodes?.gain) {
				newLayer.fxNodes.gain.gain.value = newLayer.gain;
			}
			await this.context.FXManager.restoreChain(newLayer, { isLayer: true });
			if (newLayer.eq?.enabled) {
				this.context.audioFunctions.createLayerEQNode(newLayer);
			}
		}

		const allIds = this.context.LayerManager.userLayers.map(l => parseInt(l.id.replace('user_', '')));
		const maxId = Math.max(...allIds);
		this.context.LayerManager.nextLayerId = isFinite(maxId) ? maxId + 1 : 1;

		this.context.LayerManager.refreshUserLayersUI();
	}

	static mergeSequencers(sequencersData) {
		const newSequencers = sequencersData.map(data => new this.context.DistanceSequencer(data));
		this.context.AppState.data.sequencers.push(...newSequencers);
		this.context.AppState.rebuildIndexes();
		this.context.audioFunctions.refreshSequencersList();
	}
}
