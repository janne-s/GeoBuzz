import { CONSTANTS } from '../constants.js';
import { AppState } from '../state/StateManager.js';
import { Selectors } from '../state/selectors.js';
import { Geometry } from '../geospatial/Geometry.js';
import { AudioNodeManager } from './AudioNodeManager.js';
import { StreamManager } from './StreamManager.js';
import { getSynthCapabilities, initializeSynthParameters } from './SynthRegistry.js';
import { deepClone } from '../utils/math.js';
import { isFileSynth } from '../utils/typeChecks.js';
import { DEFAULT_LFO_STRUCTURE, DEFAULT_FX_STRUCTURE, DEFAULT_EQ_STRUCTURE } from '../../config/defaults.js';

let context = null;

export function setContext(ctx) {
	context = ctx;
}

export function createSoundObject(baseData = {}) {
	const synthType = baseData.type || "Synth";
	const role = baseData.role || "sound";

	const defaults = {
		marker: null,
		circle: null,
		polygon: null,
		handle: null,
		vertices: null,
		vertexMarkers: [],
		linePoints: null,
		linePointMarkers: [],
		lineTolerance: CONSTANTS.DEFAULT_LINE_TOLERANCE,
		smoothing: 0,
		ovalCenter: null,
		radiusX: CONSTANTS.DEFAULT_CIRCLE_RADIUS,
		radiusY: CONSTANTS.DEFAULT_OVAL_RADIUS_Y,
		xHandle: null,
		yHandle: null,
		labelMarker: null,
		layers: [],
		synth: null,
		gain: null,
		envelopeGain: null,
		filter: null,
		fx1: null,
		fx2: null,
		fx3: null,
		isReady: !isFileSynth({ type: synthType }),
		type: synthType,
		shapeType: "circle",
		volumeOrigin: "icon",
		volumeModel: "distance",
		divisionAngle: 0,
		divisionPosition: 0.5,
		iconPlacementMode: "fixed",
		useSpatialPanning: true,
		maxDistance: CONSTANTS.DEFAULT_CIRCLE_RADIUS,
		echoNodes: new Map(),
		isPlaying: false,
		frequencyMode: false,
		color: baseData.color,
		isDragging: false,
		envelopeTimeoutId: null,
		releaseTimeoutId: null,
		playbackPosition: 0,
		_playbackStartTime: 0,
		_stoppedManually: false,
		modulationSources: [],
		originalLat: baseData.latlng?.lat || 0,
		originalLng: baseData.latlng?.lng || 0,
		originalSize: baseData.originalSize || baseData.maxDistance || CONSTANTS.DEFAULT_CIRCLE_RADIUS,
		userLat: baseData.latlng?.lat || 0,
		userLng: baseData.latlng?.lng || 0,
		label: baseData.label || AppState.getAutoName(synthType, 'sound', false),
		_synthType: synthType,
		_capabilities: getSynthCapabilities(synthType),
		controlledBySequencer: false
	};

	const result = { ...defaults, ...baseData };

	result.params = initializeSynthParameters(synthType, role, baseData.params);

	if (synthType === 'StreamPlayer') {
		result.streamStatus = result.streamStatus || 'stopped';
		result.streamLoaded = result.streamLoaded || false;
	}

	return result;
}

export async function createFullSoundInstance(data, options = { onMap: true }) {
	const unlockAudio = context.unlockAudio;
	const ElementFactory = context.ElementFactory;
	const ShapeManager = context.ShapeManager;
	const addEventHandlers = context.addEventHandlers;
	const restoreFXChain = context.restoreFXChain;
	const reconnectSoundToLayers = context.reconnectSoundToLayers;

	if (options.onMap && !data.latlng && (data.lat === undefined || data.lng === undefined)) {
		console.error("Cannot create map object without latlng.", data);
		return null;
	}

	const obj = createSoundObject(data);
	const { synth, gain, envelopeGain, filter, panner, loopFadeGain, eq } = AudioNodeManager.createAudioChain(obj.type, obj.params, Selectors.getSpatialMode());
	Object.assign(obj, { synth, gain, envelopeGain, filter, panner, loopFadeGain, eq });

	if (options.onMap && context.map && context.L && ElementFactory) {
		const latlng = data.latlng || context.L.latLng(data.lat, data.lng);
		obj.userLat = latlng.lat;
		obj.userLng = latlng.lng;

		obj.marker = context.L.marker(latlng, {
			draggable: true,
			icon: ElementFactory.soundIcon(obj.color),
			pane: 'soundElement'
		}).addTo(context.map);

		if (!obj.shapeType || obj.shapeType === "circle") {
			const circleCenter = obj.center ? context.L.latLng(obj.center.lat, obj.center.lng) : latlng;
			const { circle, handle } = Geometry.createCircleElements(circleCenter, obj.maxDistance, obj.color);
			obj.circle = circle.addTo(context.map);
			obj.handle = handle.addTo(context.map);
		} else if (obj.shapeType === "polygon") {
			const { polygon } = Geometry.createPolygonElements(latlng, obj.maxDistance, obj.color);
			obj.polygon = polygon.addTo(context.map);
			if (obj.vertices && Array.isArray(obj.vertices) && obj.vertices.length > 0) {
				obj.polygon.setLatLngs(obj.vertices);
			}
		} else if (obj.shapeType === "line") {
			if (obj.linePoints && Array.isArray(obj.linePoints) && obj.linePoints.length >= 2) {
				const { polygon } = Geometry.createLineElements(obj.linePoints, obj.lineTolerance, obj.color, obj.smoothing);
				obj.polygon = polygon.addTo(context.map);
			}
		} else if (obj.shapeType === "oval") {
			if (obj.ovalCenter) {
				const { polygon, xHandle, yHandle } = context.SHAPE_REGISTRY.oval.createElements(
					obj, obj.ovalCenter, obj.radiusX, obj.radiusY
				);
				obj.polygon = polygon.addTo(context.map);
				obj.xHandle = xHandle.addTo(context.map);
				obj.yHandle = yHandle.addTo(context.map);
			}
		}

		let labelAnchor, labelPos;
		if (obj.shapeType === "circle") {
			labelAnchor = obj.center ? context.L.latLng(obj.center.lat, obj.center.lng) : latlng;
			labelPos = Geometry.computeEdgeLatLng(labelAnchor, obj.maxDistance, 'label');
		} else if (obj.shapeType === "polygon") {
			labelAnchor = obj.vertices && obj.vertices[0] ? obj.vertices[0] : latlng;
			labelPos = labelAnchor;
		} else if (obj.shapeType === "line") {
			labelPos = obj.linePoints[0];
		} else if (obj.shapeType === "oval") {
			labelPos = context.L.latLng(
				obj.ovalCenter.lat + (obj.radiusY / CONSTANTS.METERS_PER_LAT),
				obj.ovalCenter.lng
			);
		} else {
			labelPos = latlng;
		}
		obj.labelMarker = context.L.marker(labelPos, {
			icon: ElementFactory.labelIcon(obj.label),
			interactive: true,
			draggable: true,
			pane: 'soundElement'
		}).addTo(context.map);

		if (addEventHandlers) addEventHandlers(obj);

		if (obj.shapeType === "polygon" && ShapeManager) {
			ShapeManager.createVertexMarkers(obj);
			ShapeManager.setupPolygonHoverEffects(obj);
		} else if (obj.shapeType === "line" && ShapeManager) {
			ShapeManager.createLinePointMarkers(obj);
			ShapeManager.setupLineClickEffects(obj);
		} else if (obj.shapeType === "oval" && context.DragHandlers) {
			context.DragHandlers.attachOvalHandlers(obj);
		}
	}

	if (restoreFXChain) await restoreFXChain(obj);
	if (obj.params.eq?.enabled) {
		AudioNodeManager.ensureEQNode(obj);
	}
	if (reconnectSoundToLayers) reconnectSoundToLayers(obj);
	AudioNodeManager.updateFXChain(obj);

	if (Selectors.getSpatialMode() === 'ambisonics' && obj.useSpatialPanning && context.AmbisonicsManager) {
		const source = await context.AmbisonicsManager.createSource(obj);
		if (source) {
			obj.ambisonicSource = source;
			obj.filter.disconnect();
			obj.filter.connect(obj.envelopeGain);
			obj.envelopeGain.disconnect();
			obj.envelopeGain.connect(obj.gain);
			obj.gain.disconnect();
			obj.gain.connect(source.input);
		}
	}

	return obj;
}

function generateUUID() {
	return `sound_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export function setSequencerControl(sound, controlled) {
	if (!sound) return;

	const wasControlled = sound.controlledBySequencer;
	sound.controlledBySequencer = controlled;

	if (!wasControlled && controlled) {
		const NoteManager = context.NoteManager;
		const stopLoopedPlayback = context.stopLoopedPlayback;

		if (sound.type === 'SoundFile') {
			if (sound._loopActive && stopLoopedPlayback) {
				stopLoopedPlayback(sound);
			} else if (sound.synth && sound.synth.state === 'started') {
				sound.synth.stop();
			}
		} else if (sound.synth && NoteManager) {
			NoteManager.release(sound);
		}

		if (sound.envelopeGain) {
			const now = Tone.now();
			sound.envelopeGain.gain.cancelScheduledValues(now);
			sound.envelopeGain.gain.setValueAtTime(0, now);
		}

		const neutralEnvelope = { attack: CONSTANTS.SEQUENCER_INTERNAL_ATTACK, decay: 0, sustain: 1 };
		if (sound.synth instanceof Tone.PolySynth) {
			sound._savedEnvelope = { ...sound.synth.get().envelope };
			sound.synth.set({ envelope: neutralEnvelope });
		} else if (sound.synth?.envelope) {
			sound._savedEnvelope = {
				attack: sound.synth.envelope.attack,
				decay: sound.synth.envelope.decay,
				sustain: sound.synth.envelope.sustain
			};
			Object.assign(sound.synth.envelope, neutralEnvelope);
		}
		if (sound.type === 'Sampler' && sound.synth) {
			sound._savedSamplerAttack = sound.synth.attack;
			sound.synth.attack = CONSTANTS.SEQUENCER_INTERNAL_ATTACK;
		}

		if (sound.synth && !sound.synth.disposed) {
			if (sound.synth instanceof Tone.PolySynth) {
				sound.synth.releaseAll();
			} else if (sound.synth instanceof Tone.Sampler && sound.synth._activeNotes) {
				sound.synth._activeNotes.forEach(note => {
					sound.synth.triggerRelease(note);
				});
				sound.synth._activeNotes.clear();
			}
		}

		sound.isPlaying = false;
		sound.wasInsideArea = false;
	} else if (wasControlled && !controlled) {
		sound.wasInsideArea = false;
		sound.isPlaying = false;

		if (sound._savedEnvelope) {
			if (sound.synth instanceof Tone.PolySynth) {
				sound.synth.set({ envelope: sound._savedEnvelope });
			} else if (sound.synth?.envelope) {
				Object.assign(sound.synth.envelope, sound._savedEnvelope);
			}
			delete sound._savedEnvelope;
		}
		if (sound._savedSamplerAttack !== undefined && sound.synth) {
			sound.synth.attack = sound._savedSamplerAttack;
			delete sound._savedSamplerAttack;
		}

		const GeolocationManager = context.GeolocationManager;
		const NoteManager = context.NoteManager;
		const Geometry = context.Geometry;

		if (GeolocationManager && NoteManager && Geometry) {
			const userPos = GeolocationManager.getUserPosition();
			if (userPos) {
				const isInside = Geometry.isPointInShape(userPos, sound);

				if (isInside) {
					if (sound.type === 'SoundFile' && sound.synth && sound.synth.loaded) {
						const startLoopedPlayback = context.startLoopedPlayback;
						if (sound.params.loop && startLoopedPlayback) {
							startLoopedPlayback(sound);
						} else if (!sound.params.speedAdvance) {
							let offset = 0;
							if (sound.params.resumePlayback && sound.playbackPosition > 0) {
								if (sound.playbackPosition >= sound.soundDuration) sound.playbackPosition = 0;
								offset = sound.playbackPosition;
							}
							sound.synth.start(undefined, offset);
							sound.isPlaying = true;
							sound._playbackStartTime = Tone.now();
						}
					} else if (sound.type !== 'SoundFile') {
						NoteManager.trigger(sound);
					}
					sound.wasInsideArea = true;
				}
			}
		}
	}
}

async function _buildAndInitializeSound(data) {
	const obj = await createFullSoundInstance(data, { onMap: true });

	if (!obj) return null;

	if (!obj.marker) {
		console.error('Sound object created without marker:', obj);
		return null;
	}

	obj.id = obj.marker._leaflet_id;
	obj.persistentId = data.persistentId || generateUUID();
	AppState.dispatch({
		type: 'SOUND_ADDED',
		payload: { sound: obj }
	});

	return obj;
}

export async function addSound(latlng, options = {}) {
	const updateSoundLabel = context.updateSoundLabel;

	const color = AppState.getNextColor();
	const synthType = "Synth";
	const role = "sound";
	const label = AppState.getAutoName(synthType, role, true);
	const shapeType = options.shapeType || "circle";

	const soundData = {
		latlng,
		type: synthType,
		role: role,
		color: color,
		label: label,
		shapeType: shapeType,
		maxDistance: CONSTANTS.DEFAULT_CIRCLE_RADIUS,
		originalSize: CONSTANTS.DEFAULT_CIRCLE_RADIUS,
		params: initializeSynthParameters(synthType, role),
		frequencyMode: options.frequencyMode || false,
		lastTouchedParam: options.lastTouchedParam || 'pitch',
	};

	if (shapeType === 'polygon') {
		soundData.vertices = Geometry.createDefaultSquare(latlng, CONSTANTS.DEFAULT_POLYGON_SIZE);
	}

	const soundObject = await _buildAndInitializeSound(soundData);
	if (updateSoundLabel) updateSoundLabel(soundObject, label);

	return soundObject;
}

export async function addSoundLine(points, options = {}) {
	const updateSoundLabel = context.updateSoundLabel;

	if (!points || points.length < 2) {
		console.error('Line sound requires at least 2 points');
		return null;
	}

	const color = options.color || AppState.getNextColor();
	const synthType = "Synth";
	const role = "sound";
	const label = AppState.getAutoName(synthType, role, true);

	const linePoints = points.map(p => context.L.latLng(p.lat, p.lng));
	const centroid = Geometry.calculateCentroid(linePoints);

	const soundData = {
		latlng: centroid,
		type: synthType,
		role: role,
		color: color,
		label: label,
		shapeType: "line",
		linePoints: linePoints,
		lineTolerance: options.tolerance || CONSTANTS.DEFAULT_LINE_TOLERANCE,
		params: initializeSynthParameters(synthType, role),
		frequencyMode: options.frequencyMode || false,
		lastTouchedParam: options.lastTouchedParam || 'pitch',
	};

	const soundObject = await _buildAndInitializeSound(soundData);
	if (updateSoundLabel) updateSoundLabel(soundObject, label);

	return soundObject;
}

export async function addSoundOval(latlng, options = {}) {
	const updateSoundLabel = context.updateSoundLabel;

	const color = AppState.getNextColor();
	const synthType = "Synth";
	const role = "sound";
	const label = AppState.getAutoName(synthType, role, true);

	const soundData = {
		latlng,
		type: synthType,
		role: role,
		color: color,
		label: label,
		shapeType: "oval",
		ovalCenter: latlng,
		radiusX: options.radiusX || CONSTANTS.DEFAULT_CIRCLE_RADIUS,
		radiusY: options.radiusY || CONSTANTS.DEFAULT_OVAL_RADIUS_Y,
		params: initializeSynthParameters(synthType, role),
		frequencyMode: options.frequencyMode || false,
		lastTouchedParam: options.lastTouchedParam || 'pitch',
	};

	const soundObject = await _buildAndInitializeSound(soundData);
	if (updateSoundLabel) updateSoundLabel(soundObject, label);

	return soundObject;
}

export async function loadSound(soundData, options = {}) {
	const ShapeManager = context.ShapeManager;
	const autoLoadSoundFile = context.autoLoadSoundFile;
	const restoreFXChain = context.restoreFXChain;
	const _applySoundFilePlaybackParams = context._applySoundFilePlaybackParams;
	const deferFileLoading = options.deferFileLoading || false;

	if (!soundData || soundData.lat === undefined || soundData.lng === undefined) {
		console.error('Invalid sound data:', soundData);
		return null;
	}

	const data = {
		persistentId: soundData.persistentId,
		params: {},
		userLat: soundData.lat,
		userLng: soundData.lng,
		lat: soundData.lat,
		lng: soundData.lng,
		maxDistance: soundData.maxDistance || CONSTANTS.DEFAULT_CIRCLE_RADIUS,
		originalSize: soundData.originalSize || soundData.maxDistance || CONSTANTS.DEFAULT_CIRCLE_RADIUS,
		type: soundData.type || "Synth",
		role: soundData.role || "sound",
		label: soundData.label,
		color: soundData.color,
		shapeType: soundData.shapeType || "circle",
		layers: soundData.layers || [],
		frequencyMode: soundData.frequencyMode || false,
		lastTouchedParam: soundData.lastTouchedParam || 'pitch',
		pathRoles: soundData.pathRoles || {
			movement: soundData.attachedToPath || null,
			zones: [],
			modulation: (soundData.modulationSources || []).map(ms => ({
				pathId: ms.modulatorId,
				parameter: ms.parameter,
				output: ms.output,
				depth: ms.depth,
				invert: ms.invert
			})),
			soundModulation: []
		},
		motion: soundData.motion || null
	};

	if (soundData.vertices && Array.isArray(soundData.vertices)) {
		data.vertices = soundData.vertices.map(v => {
			if (v && (v.lat !== undefined && v.lng !== undefined)) {
				return context.L.latLng(v.lat, v.lng);
			}
			return null;
		}).filter(v => v !== null);
	}

	if (data.lat === undefined || data.lng === undefined) {
		console.error('Sound data missing lat/lng:', soundData);
		data.lat = 0;
		data.lng = 0;
		data.userLat = 0;
		data.userLng = 0;
	}

	if (soundData.params) {
		Object.keys(soundData.params).forEach(paramKey => {
			data.params[paramKey] = soundData.params[paramKey];
		});
	}

	data.params.lfo = soundData.lfo || deepClone(DEFAULT_LFO_STRUCTURE);
	data.params.fx = soundData.fx || deepClone(DEFAULT_FX_STRUCTURE);
	data.params.eq = soundData.eq || deepClone(DEFAULT_EQ_STRUCTURE);
	data.params.reflections = soundData.reflections || { enabled: false, include: [] };

	if (soundData.shapeType && ShapeManager) {
		const shapeData = ShapeManager.deserializeShape(soundData, soundData.shapeType);
		Object.assign(data, shapeData);
		if (soundData.shapeType === 'polygon' && (!shapeData.vertices || shapeData.vertices.length === 0)) {
			console.warn('Polygon sound has no vertices after deserialization:', soundData);
		}
		if (soundData.shapeType === 'line' && (!shapeData.linePoints || shapeData.linePoints.length < 2)) {
			console.warn('Line sound has insufficient points after deserialization:', soundData);
		}
		if (soundData.shapeType === 'oval' && !shapeData.ovalCenter) {
			data.ovalCenter = context.L.latLng(data.lat, data.lng);
		}
	}

	const obj = await _buildAndInitializeSound(data);

	if (!obj) return null;

	if (!deferFileLoading) {
		if ((obj.type === "SoundFile" || obj.type === "Sampler") && obj.params.soundFile && autoLoadSoundFile) {
			await autoLoadSoundFile(obj, obj.params.soundFile);
			if (obj.type === "SoundFile" && _applySoundFilePlaybackParams) {
				_applySoundFilePlaybackParams(obj, false);
			}
		} else if (obj.type === "StreamPlayer" && obj.params.streamUrl) {
			await context.StreamManager.initializeStream(obj);
		}
	}

	if (obj.params.fx && (obj.params.fx.slot1?.type !== "none" || obj.params.fx.slot2?.type !== "none" || obj.params.fx.slot3?.type !== "none") && restoreFXChain) {
		await restoreFXChain(obj);
	}

	if (obj.params.eq && obj.params.eq.enabled) {
		AudioNodeManager.ensureEQNode(obj);
		AudioNodeManager.updateFXChain(obj);
	}

	AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });

	return obj;
}
