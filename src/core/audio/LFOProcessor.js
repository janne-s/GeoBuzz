import { CONSTANTS } from '../constants.js';
import { isCircularPath } from '../utils/math.js';
import { isLinearPath } from '../utils/typeChecks.js';
import { generateLFOWaveform, PARAMETER_REGISTRY } from '../../config/parameterRegistry.js';
import { getSmoothedPosition, getSmoothedModulationValue } from './AudioSmoother.js';

let GeolocationManager = null;
let updateSynthParam = null;
let Geometry = null;
let AppState = null;
let Selectors = null;
let getUserMovementSpeed = null;
let getTotalDistanceTraveled = null;
let calculatePathGain = null;
let generateOvalPoints = null;
let getSmoothedPathPoints = null;
let getOffsetPolyline = null;
let map = null;

export function setContext(ctx) {
	GeolocationManager = ctx.GeolocationManager;
	updateSynthParam = ctx.updateSynthParam;
	Geometry = ctx.Geometry;
	AppState = ctx.AppState;
	Selectors = ctx.Selectors;
	getUserMovementSpeed = ctx.getUserMovementSpeed;
	getTotalDistanceTraveled = ctx.getTotalDistanceTraveled;
	calculatePathGain = ctx.calculatePathGain;
	generateOvalPoints = ctx.generateOvalPoints;
	getSmoothedPathPoints = ctx.getSmoothedPathPoints;
	getOffsetPolyline = ctx.getOffsetPolyline;
	map = ctx.map;
}

export function processLFOs(s, now) {
	const t = now;

	const rawUserPos = GeolocationManager.getUserPosition();
	const userPos = getSmoothedPosition() || rawUserPos;
	const userSpeed = getUserMovementSpeed();

	const xFreq = s.params.lfo.x.freq;
	const xRange = s.params.lfo.x.range;
	const yFreq = s.params.lfo.y.freq;
	const yRange = s.params.lfo.y.range;

	const shouldUpdateDOM = domUpdateCounter.frame % 2 === 0;

	if (!s.isDragging) {
		if (!s.params.lfo._phaseOffsets) {
			s.params.lfo._phaseOffsets = { x: 0, y: 0, size: 0 };
		}

		let deltaLat = 0;
		let deltaLng = 0;

		if (xFreq > 0 && xRange > 0) {
			const phase = (t - s.params.lfo._phaseOffsets.x) * xFreq * CONSTANTS.TWO_PI;
			const xOffset = Math.sin(phase) * (xRange / 2);
			deltaLng = xOffset / CONSTANTS.METERS_PER_LNG;
		}

		if (yFreq > 0 && yRange > 0) {
			const phase = (t - s.params.lfo._phaseOffsets.y) * yFreq * CONSTANTS.TWO_PI;
			const yOffset = Math.sin(phase) * (yRange / 2);
			deltaLat = yOffset / CONSTANTS.METERS_PER_LAT;
		}

		if (((xFreq > 0 && xRange > 0) || (yFreq > 0 && yRange > 0)) && shouldUpdateDOM) {
			const newLat = s.userLat + deltaLat;
			const newLng = s.userLng + deltaLng;
			const newLatLng = L.latLng(newLat, newLng);

			s.marker.setLatLng(newLatLng);

			if (s.shapeType === "circle" && s.circle) {
				s.circle.setLatLng(newLatLng);
				if (s.handle) {
					const newEdge = Geometry.computeEdgeLatLng(newLatLng, s.maxDistance);
					s.handle.setLatLng(newEdge);
				}
				if (s.labelMarker) {
					const newLabelPos = Geometry.computeEdgeLatLng(newLatLng, s.maxDistance, 'label');
					s.labelMarker.setLatLng(newLabelPos);
				}
			} else if (s.shapeType === "polygon" && s.polygon && s.vertices) {
				if (!s.originalVertices) {
					s.originalVertices = s.vertices.map(v => ({
						lat: v.lat - s.userLat,
						lng: v.lng - s.userLng
					}));
				}
				s.vertices = s.originalVertices.map(offset =>
					L.latLng(s.userLat + offset.lat + deltaLat, s.userLng + offset.lng + deltaLng)
				);
				s.polygon.setLatLngs(s.vertices);
				if (s.vertexMarkers) {
					for (let i = 0; i < s.vertexMarkers.length; i++) {
						const marker = s.vertexMarkers[i];
						if (marker && s.vertices[i]) {
							marker.setLatLng(s.vertices[i]);
						}
					}
				}
				if (s.labelMarker && s.vertices[0]) {
					s.labelMarker.setLatLng(s.vertices[0]);
				}
			} else if (s.shapeType === "line" && s.polygon && s.linePoints && s.linePoints.length >= 2) {
				if (!s._originalLinePoints) {
					s._originalLinePoints = s.linePoints.map(p => ({
						lat: p.lat - s.userLat,
						lng: p.lng - s.userLng
					}));
				}
				s.linePoints = s._originalLinePoints.map(offset =>
					L.latLng(s.userLat + offset.lat + deltaLat, s.userLng + offset.lng + deltaLng)
				);
				const pts = s.smoothing > 0 ? Geometry.smoothPoints(s.linePoints, s.smoothing) : s.linePoints;
				const corridorPoints = Geometry.generateSoundLineCorridorWithSemicircles(pts, s.lineTolerance);
				s.polygon.setLatLngs(corridorPoints);
				if (s.linePointMarkers && s.linePointMarkers.length > 0) {
					s.linePointMarkers.forEach((marker, i) => {
						if (marker && s.linePoints[i]) marker.setLatLng(s.linePoints[i]);
					});
				}
				if (s.labelMarker && s.linePoints[0]) {
					s.labelMarker.setLatLng(s.linePoints[0]);
				}
			} else if (s.shapeType === "oval" && s.polygon && s.ovalCenter) {
				const newCenter = L.latLng(s.userLat + deltaLat, s.userLng + deltaLng);
				Geometry.updateOvalPosition(s, newCenter);
			}
		}
	}

	const sizeFreq = s.params.lfo.size.freq;
	const sizeRange = s.params.lfo.size.range;
	if (sizeFreq > 0 && sizeRange > 0 && s.shapeType === "circle" && s.circle && shouldUpdateDOM) {
		if (!s.params.lfo._phaseOffsets) {
			s.params.lfo._phaseOffsets = { x: 0, y: 0, size: 0 };
		}
		const phase = (t - s.params.lfo._phaseOffsets.size) * sizeFreq * CONSTANTS.TWO_PI;
		const sizeOffset = Math.sin(phase) * (sizeRange / 2);
		s.maxDistance = Math.max(CONSTANTS.MIN_RADIUS, s.originalSize + sizeOffset);
		s.circle.setRadius(s.maxDistance);

		const center = s.marker.getLatLng();
		if (s.labelMarker) {
			const newLabelPos = Geometry.computeEdgeLatLng(center, s.maxDistance, 'label');
			s.labelMarker.setLatLng(newLabelPos);
		}
		if (s.handle) {
			const newHandlePos = Geometry.computeEdgeLatLng(center, s.maxDistance);
			s.handle.setLatLng(newHandlePos);
		}
	}

	if (!userPos) return;

	const modulationOffsets = new Map();

	const addOffset = (target, offset) => {
		if (isNaN(offset)) return;
		const currentOffset = modulationOffsets.get(target) || 0;
		modulationOffsets.set(target, currentOffset + offset);
	};

	const isInside = Geometry.isPointInShape(userPos, s);
	const isAudible = s.isPlaying || isInside || s.controlledBySequencer;

	if (isAudible) {
		if (s.pathRoles?.modulation && s.pathRoles.modulation.length > 0) {
			processPatchModulation(s, userPos, addOffset);
		}

		if (s.pathRoles?.soundModulation && s.pathRoles.soundModulation.length > 0) {
			processSoundModulation(s, userPos, addOffset);
		}

		const mods = ["mod1", "mod2", "mod3"];
		for (let i = 0; i < mods.length; i++) {
			const mod = mods[i];
			const { target, freq, range, source } = s.params.lfo[mod];
			if (range > 0 || (freq > 0 && source !== 'lfo')) {
				const offset = processInternalModulation(s, mod, target, freq, range, source, t, userPos, userSpeed);
				addOffset(target, offset);
			}
		}

		const fxMods = ["fxMod1", "fxMod2", "fxMod3"];
		for (let i = 0; i < fxMods.length; i++) {
			const mod = fxMods[i];
			if (s.params.lfo[mod]) {
				const { target, freq, range, source } = s.params.lfo[mod];
				if (target && target !== 'none' && (range > 0 || (freq > 0 && source !== 'lfo'))) {
					const offset = processInternalModulation(s, mod, target, freq, range, source, t, userPos, userSpeed);
					processFXModulation(s, target, offset);
				}
			}
		}
	}

	const modulatedParams = new Set(modulationOffsets.keys());

	if (!s._previouslyModulatedParams) {
		s._previouslyModulatedParams = new Set();
	}
	const paramsToReset = new Set([...s._previouslyModulatedParams].filter(p => !modulatedParams.has(p)));

	paramsToReset.forEach(target => {
		const baseValue = s.params.originalValues[target] ?? s.params[target];
		if (baseValue !== undefined) {
			updateSynthParam(s, target, baseValue, { isModulation: true });
			if (target === 'volume') {
				delete s._modulatedVolume;
			}
		}
		s._previouslyModulatedParams.delete(target);
	});

	modulationOffsets.forEach((totalOffset, target) => {
		const def = PARAMETER_REGISTRY[target];
		if (!def) return;

		const baseValue = s.params.originalValues[target] ?? s.params[target];
		if (baseValue === undefined) return;

		let finalValue;

		if (target === 'pitch') {
			const baseFreq = Tone.Frequency(baseValue, "midi").toFrequency();
			finalValue = Tone.Frequency(baseFreq).transpose(totalOffset / 100).toFrequency();
			updateSynthParam(s, 'frequency', finalValue, { isModulation: true });

		} else if (target === 'frequency') {
			finalValue = Math.max(CONSTANTS.FREQUENCY_MIN, baseValue + totalOffset);
			updateSynthParam(s, 'frequency', finalValue, { isModulation: true });

		} else {
			const paramMin = def.min !== undefined ? def.min : 0;
			const paramMax = def.max !== undefined ? def.max : 1;
			finalValue = Math.max(paramMin, Math.min(paramMax, baseValue + totalOffset));
			updateSynthParam(s, target, finalValue, { isModulation: true });
			if (target === 'volume') {
				s._modulatedVolume = finalValue;
			}
		}

		s._previouslyModulatedParams.add(target);
	});
}

const domUpdateCounter = { frame: 0 };

export function processPathLFOs(now) {
	const t = now;
	let pathsChanged = false;

	domUpdateCounter.frame++;
	const shouldUpdateDOM = domUpdateCounter.frame % 2 === 0;

	const paths = Selectors.getPaths();
	for (let i = 0; i < paths.length; i++) {
		const path = paths[i];
		if (path.isDragging || !path.params.lfo) {
			continue;
		}

		const { x, y, size } = path.params.lfo;
		const hasActiveLFO = (x.freq > 0 && x.range > 0) || (y.freq > 0 && y.range > 0) || (size.freq > 0 && size.range > 0);
		if (!hasActiveLFO) {
			continue;
		}

		let needsRedraw = false;

		if ((x.freq > 0 && x.range > 0) || (y.freq > 0 && y.range > 0)) {
			if (!path.params.lfo._phaseOffsets) {
				path.params.lfo._phaseOffsets = { x: 0, y: 0, size: 0 };
			}
			const xPhase = x.freq > 0 ? (t - path.params.lfo._phaseOffsets.x) * x.freq * CONSTANTS.TWO_PI : 0;
			const yPhase = y.freq > 0 ? (t - path.params.lfo._phaseOffsets.y) * y.freq * CONSTANTS.TWO_PI : 0;
			const xOffset = x.freq > 0 ? Math.sin(xPhase) * (x.range / 2) : 0;
			const yOffset = y.freq > 0 ? Math.sin(yPhase) * (y.range / 2) : 0;
			const deltaLng = xOffset / CONSTANTS.METERS_PER_LNG;
			const deltaLat = yOffset / CONSTANTS.METERS_PER_LAT;

			if ((isCircularPath(path)) && path.originalCenter) {
				path.center = L.latLng(path.originalCenter.lat + deltaLat, path.originalCenter.lng + deltaLng);
			} else if ((isLinearPath(path)) && path.originalPoints) {
				path.points = path.originalPoints.map(p => L.latLng(p.lat + deltaLat, p.lng + deltaLng));
			}
			needsRedraw = true;
		}

		if (size.freq > 0 && size.range > 0) {
			if (!path.params.lfo._phaseOffsets) {
				path.params.lfo._phaseOffsets = { x: 0, y: 0, size: 0 };
			}
			const sizePhase = (t - path.params.lfo._phaseOffsets.size) * size.freq * CONSTANTS.TWO_PI;
			const sizeOffset = Math.sin(sizePhase) * (size.range / 2);
			if (path.type === 'circle') {
				path.radius = Math.max(CONSTANTS.MIN_RADIUS, path.originalRadius + sizeOffset);
			} else if (path.type === 'oval') {
				path.radius = Math.max(CONSTANTS.MIN_RADIUS, path.originalRadius + sizeOffset);
				path.radiusY = Math.max(CONSTANTS.MIN_RADIUS, path.originalRadiusY + sizeOffset);
			}
			needsRedraw = true;
		}

		if (needsRedraw) {
			pathsChanged = true;
			if (shouldUpdateDOM) {
				if (isCircularPath(path)) {
					if (path.pathCircle) {
						const points = (path.type === 'circle') ? path.center : generateOvalPoints(path.center, path.radius, path.radiusY, CONSTANTS.OVAL_RESOLUTION);
						if (path.type === 'circle') {
							path.pathCircle.setLatLng(points).setRadius(path.radius);
							if (path.toleranceLayer) path.toleranceLayer.setLatLng(path.center).setRadius(path.radius + path.tolerance);
							if (path.toleranceInner) path.toleranceInner.setLatLng(path.center).setRadius(Math.max(0, path.radius - path.tolerance));
						} else {
							path.pathCircle.setLatLngs(points);
							if (path.toleranceLayer) {
								const outerPoints = generateOvalPoints(path.center, path.radius + path.tolerance, path.radiusY + path.tolerance, CONSTANTS.OVAL_RESOLUTION);
								path.toleranceLayer.setLatLngs(outerPoints);
							}
							if (path.toleranceInner) {
								const innerPoints = generateOvalPoints(path.center, Math.max(0, path.radius - path.tolerance), Math.max(0, path.radiusY - path.tolerance), CONSTANTS.OVAL_RESOLUTION);
								path.toleranceInner.setLatLngs(innerPoints);
							}
						}
					}

					if (path.pointMarkers.length > 0) path.pointMarkers[0].setLatLng(path.center);
					if (path.type === 'circle' && path.pointMarkers.length > 1) {
						path.pointMarkers[1].setLatLng(Geometry.computeEdgeLatLng(path.center, path.radius));
						if (path.labelMarker) path.labelMarker.setLatLng(Geometry.computeEdgeLatLng(path.center, path.radius, 'label'));
					} else if (path.type === 'oval' && path.pointMarkers.length > 2) {
						path.pointMarkers[1].setLatLng(Geometry.computeEdgeLatLng(path.center, path.radius, 'handle'));
						const yEdge = L.latLng(path.center.lat + (path.radiusY / CONSTANTS.METERS_PER_LAT), path.center.lng);
						path.pointMarkers[2].setLatLng(yEdge);
						if (path.labelMarker) path.labelMarker.setLatLng(yEdge);
					}
				} else if (isLinearPath(path)) {
					if (path.pathLine) {
						const isClosed = path.type === 'polygon';
						const smoothed = getSmoothedPathPoints(path.points, path.smoothing, isClosed);
						path.pathLine.setLatLngs(smoothed);
						if (path.toleranceLayer) {
							const outerPoints = getOffsetPolyline(smoothed, path.tolerance, map);
							const innerPoints = getOffsetPolyline(smoothed, -path.tolerance, map).reverse();
							path.toleranceLayer.setLatLngs([...outerPoints, ...innerPoints]);
						}
						if (path.polygon) path.polygon.setLatLngs(path.points);
						if (path.hintLine) {
							const hintPoints = isClosed ? [...path.points, path.points[0]] : path.points;
							path.hintLine.setLatLngs(hintPoints);
						}
					}
					for (let j = 0; j < path.pointMarkers.length; j++) {
						if (path.points[j]) {
							path.pointMarkers[j].setLatLng(path.points[j]);
						}
					}
					if (path.labelMarker && path.points[0]) path.labelMarker.setLatLng(path.points[0]);
				}
			}
		}
	}
	return pathsChanged;
}

function processPatchModulation(s, userPos, addOffset) {

	const patches = s.pathRoles.modulation;
	for (let i = 0; i < patches.length; i++) {
		const patch = patches[i];
		const modulator = AppState.getPath(patch.pathId);
		if (!modulator) continue;

		let modValue = 0;

		if (patch.output === "distance") {
			modValue = calculatePathGain(userPos, modulator);
		} else if (patch.output === "x") {
			const center = modulator.center || Geometry.calculateCentroid(modulator.points);
			const maxRange = modulator.radius || Geometry.calculateMaxPolygonDistance(modulator.points);
			const lngDiff = (userPos.lng - center.lng) * CONSTANTS.METERS_PER_LNG * Math.cos(center.lat * Math.PI / 180);
			const normalized = Math.max(-1, Math.min(1, lngDiff / maxRange));
			modValue = (normalized + 1) / 2;
		} else if (patch.output === "y") {
			const center = modulator.center || Geometry.calculateCentroid(modulator.points);
			const maxRange = modulator.radius || Geometry.calculateMaxPolygonDistance(modulator.points);
			const latDiff = (userPos.lat - center.lat) * CONSTANTS.METERS_PER_LAT;
			const normalized = Math.max(-1, Math.min(1, latDiff / maxRange));
			modValue = (normalized + 1) / 2;
		} else if (patch.output === "gate") {
			modValue = Geometry.isPointInControlPath(userPos, modulator) ? 1 : 0;
		}

		if (patch.invert) {
			modValue = 1 - modValue;
		}

		const target = patch.parameter;
		const def = PARAMETER_REGISTRY[target];
		if (!def) continue;

		const depthPercent = patch.depth / 100;

		if (depthPercent === 0) continue;

		if (target === 'pitch') {
			const baseValue = s.params.originalValues[target] ?? s.params[target];
			const modulatedValue = baseValue + (modValue - 0.5) * CONSTANTS.CENTS_PER_OCTAVE;
			const offset = (modulatedValue - baseValue) * depthPercent;
			addOffset(target, offset);
		} else {
			const paramMin = def.min !== undefined ? def.min : 0;
			const paramMax = def.max !== undefined ? def.max : 1;
			const baseValue = s.params.originalValues[target] ?? s.params[target];
			const modulatedValue = paramMin + modValue * (paramMax - paramMin);
			const offset = (modulatedValue - baseValue) * depthPercent;
			addOffset(target, offset);
		}
	}
}

function processSoundModulation(s, userPos, addOffset) {
	const thisPos = s.marker.getLatLng();
	const patches = s.pathRoles.soundModulation;

	for (let i = 0; i < patches.length; i++) {
		const patch = patches[i];
		const refSound = AppState.getSound(patch.sourceId);
		if (!refSound?.marker) continue;

		const refPos = refSound.marker.getLatLng();
		let modValue = 0;

		if (patch.output === 'proximity') {
			const distToThis = Geometry.calculateDistanceMeters(userPos,thisPos);
			const distToRef = Geometry.calculateDistanceMeters(userPos,refPos);
			const totalDist = distToThis + distToRef;
			modValue = totalDist > 0 ? distToThis / totalDist : 0.5;
		} else if (patch.output === 'distance') {
			const dist = Geometry.calculateDistanceMeters(userPos,refPos);
			const maxDist = refSound.maxDistance || CONSTANTS.DEFAULT_MOD_MAX_DISTANCE;
			const rawValue = 1 - Math.min(1, dist / maxDist);
			modValue = getSmoothedModulationValue(rawValue, s.id, `soundMod_${i}_distance`);
		} else if (patch.output === 'x') {
			const maxRange = refSound.maxDistance || CONSTANTS.DEFAULT_MOD_MAX_DISTANCE;
			const lngDiff = (userPos.lng - refPos.lng) * CONSTANTS.METERS_PER_LNG * Math.cos(refPos.lat * Math.PI / 180);
			const rawValue = Math.max(-1, Math.min(1, lngDiff / maxRange));
			modValue = (getSmoothedModulationValue(rawValue, s.id, `soundMod_${i}_x`) + 1) / 2;
		} else if (patch.output === 'y') {
			const maxRange = refSound.maxDistance || CONSTANTS.DEFAULT_MOD_MAX_DISTANCE;
			const latDiff = (userPos.lat - refPos.lat) * CONSTANTS.METERS_PER_LAT;
			const rawValue = Math.max(-1, Math.min(1, latDiff / maxRange));
			modValue = (getSmoothedModulationValue(rawValue, s.id, `soundMod_${i}_y`) + 1) / 2;
		} else if (patch.output === 'gate') {
			const dist = Geometry.calculateDistanceMeters(userPos,refPos);
			modValue = dist <= (refSound.maxDistance || CONSTANTS.DEFAULT_MOD_MAX_DISTANCE) ? 1 : 0;
		}

		const polarity = patch.polarity !== undefined ? patch.polarity : 1;
		modValue = 0.5 + (modValue - 0.5) * polarity;

		const target = patch.target;
		const def = PARAMETER_REGISTRY[target];
		if (!def) continue;

		const rangePercent = patch.range / 100;
		if (rangePercent === 0) continue;

		let offset;
		if (target === 'pitch') {
			const baseValue = s.params.originalValues[target] ?? s.params[target];
			const modulatedValue = baseValue + (modValue - 0.5) * CONSTANTS.CENTS_PER_OCTAVE;
			offset = (modulatedValue - baseValue) * rangePercent;
		} else {
			const paramMin = def.min !== undefined ? def.min : 0;
			const paramMax = def.max !== undefined ? def.max : 1;
			const baseValue = s.params.originalValues[target] ?? s.params[target];
			const modulatedValue = paramMin + modValue * (paramMax - paramMin);
			offset = (modulatedValue - baseValue) * rangePercent;
		}

		addOffset(target, offset);
	}
}

function processInternalModulation(s, mod, target, freq, range, source, t, userPos, userSpeed) {
	if (!userPos) return 0;

	const waveform = s.params.lfo[mod].waveform || 'sine';
	if (!s.params.lfo[mod].state) {
		s.params.lfo[mod].state = {};
	}
	const modState = s.params.lfo[mod].state;

	let lfoValue = 0;

	if (source === 'speed') {
		const referenceSpeed = s.params.lfo[mod].referenceSpeed || 1.4;
		const normalizedSpeed = userSpeed / referenceSpeed;
		lfoValue = (normalizedSpeed - 1) * freq;

	} else if (source === 'walkableLFO') {
		const cyclesPerMeter = freq;
		const speedThreshold = s.params.lfo[mod].speedThreshold !== undefined ? s.params.lfo[mod].speedThreshold : 0.1;

		if (userSpeed < speedThreshold) {
			lfoValue = 0;
		} else {
			if (modState.walkablePhase === undefined) {
				modState.walkablePhase = 0;
				modState.walkableLastTime = t;
			}

			const deltaTime = t - modState.walkableLastTime;
			modState.walkableLastTime = t;

			const deltaPhase = userSpeed * cyclesPerMeter * deltaTime;
			modState.walkablePhase += deltaPhase;

			lfoValue = generateLFOWaveform(modState.walkablePhase * CONSTANTS.TWO_PI, waveform, modState);
		}

	} else if (source === 'distance') {
		const soundPos = s.marker.getLatLng();
		const distanceMeters = Geometry.calculateDistanceMeters(userPos,soundPos);
		const maxDistance = s.maxDistance || CONSTANTS.DEFAULT_MOD_MAX_DISTANCE;
		const normalized = 1 - (distanceMeters / maxDistance);
		const rawValue = Math.max(-1, Math.min(1, (normalized - 0.5) * 2));
		lfoValue = getSmoothedModulationValue(rawValue, s.id, `${mod}_distance`);

	} else if (source === 'x') {
		const soundPos = s.marker.getLatLng();
		const maxRange = s.maxDistance || CONSTANTS.DEFAULT_MOD_MAX_DISTANCE;
		const lngDiff = (userPos.lng - soundPos.lng) * CONSTANTS.METERS_PER_LNG * Math.cos(soundPos.lat * Math.PI / 180);
		const rawValue = Math.max(-1, Math.min(1, lngDiff / maxRange));
		lfoValue = getSmoothedModulationValue(rawValue, s.id, `${mod}_x`);

	} else if (source === 'y') {
		const soundPos = s.marker.getLatLng();
		const maxRange = s.maxDistance || CONSTANTS.DEFAULT_MOD_MAX_DISTANCE;
		const latDiff = (userPos.lat - soundPos.lat) * CONSTANTS.METERS_PER_LAT;
		const rawValue = Math.max(-1, Math.min(1, latDiff / maxRange));
		lfoValue = getSmoothedModulationValue(rawValue, s.id, `${mod}_y`);

	} else if (!source || source === "lfo") {
		const phase = t * freq * CONSTANTS.TWO_PI;
		lfoValue = generateLFOWaveform(phase, waveform, modState);
	}

	let def = PARAMETER_REGISTRY[target];

	// Handle FX targets (e.g., "slot1.delayTime")
	if (!def && target.includes('.')) {
		const parts = target.split('.');
		if (parts.length === 2) {
			const [slotKey, paramName] = parts;
			if (paramName === 'mix') {
				// Mix uses 0-100 range
				def = { min: 0, max: 100 };
			} else {
				// Look up FX parameter definition
				const fxParamKey = `fx_${paramName}`;
				def = PARAMETER_REGISTRY[fxParamKey];
			}
		}
	}

	if (!def) return 0;

	let totalModulationDepth;
	const rangePercent = range / 100;

	if (target === 'pitch') {
		totalModulationDepth = rangePercent * CONSTANTS.CENTS_PER_OCTAVE;
	} else if (target === 'frequency') {
		const fullRange = CONSTANTS.MODULATION_FREQ_MAX - CONSTANTS.MODULATION_FREQ_MIN;
		totalModulationDepth = rangePercent * fullRange;
	} else {
		const paramMin = def.min !== undefined ? def.min : 0;
		const paramMax = def.max !== undefined ? def.max : 1;
		const fullRange = paramMax - paramMin;
		totalModulationDepth = rangePercent * fullRange;
	}

	return lfoValue * (totalModulationDepth / 2);
}

function processFXModulation(s, target, offset) {
	if (!target || target === 'none' || !offset || isNaN(offset)) return;

	const parts = target.split('.');
	if (parts.length !== 2) return;

	const [slotKey, paramName] = parts;
	const slotNum = parseInt(slotKey.replace('slot', ''));
	if (isNaN(slotNum) || slotNum < 1 || slotNum > 3) return;

	const fxKey = `fx${slotNum}`;
	const fxNode = s[fxKey];
	if (!fxNode) return;

	if (!s.params.fx) return;
	const slotConfig = s.params.fx[slotKey];
	if (!slotConfig || slotConfig.type === 'none') return;

	if (!s._fxOriginalValues) {
		s._fxOriginalValues = {};
	}
	if (!s._fxOriginalValues[slotKey]) {
		s._fxOriginalValues[slotKey] = {};
	}

	if (paramName === 'mix') {
		if (s._fxOriginalValues[slotKey].mix === undefined) {
			s._fxOriginalValues[slotKey].mix = slotConfig.mix !== undefined ? slotConfig.mix : 50;
		}
		const baseValue = s._fxOriginalValues[slotKey].mix;
		const finalValue = Math.max(0, Math.min(100, baseValue + offset));
		if (fxNode.wet) {
			fxNode.wet.value = finalValue / 100;
		}
	} else {
		const normalizedParam = paramName.replace('_long', '');

		if (s._fxOriginalValues[slotKey][normalizedParam] === undefined) {
			if (slotConfig.params && slotConfig.params[normalizedParam] !== undefined) {
				s._fxOriginalValues[slotKey][normalizedParam] = slotConfig.params[normalizedParam];
			} else if (fxNode[normalizedParam] !== undefined) {
				if (typeof fxNode[normalizedParam].value !== 'undefined') {
					s._fxOriginalValues[slotKey][normalizedParam] = fxNode[normalizedParam].value;
				} else {
					s._fxOriginalValues[slotKey][normalizedParam] = fxNode[normalizedParam];
				}
			}
		}

		if (s._fxOriginalValues[slotKey][normalizedParam] !== undefined) {
			const baseValue = s._fxOriginalValues[slotKey][normalizedParam];
			let finalValue = baseValue + offset;

			if (fxNode[normalizedParam] !== undefined) {
				try {
					if (typeof fxNode[normalizedParam].value !== 'undefined') {
						const param = fxNode[normalizedParam];
						if (param.minValue !== undefined && param.maxValue !== undefined) {
							finalValue = Math.max(param.minValue, Math.min(param.maxValue, finalValue));
						}
						param.value = finalValue;
					} else {
						fxNode[normalizedParam] = finalValue;
					}
				} catch (error) {
					console.warn(`Error applying FX modulation to ${slotKey}.${normalizedParam}:`, error);
				}
			}
		}
	}
}
