import { CONSTANTS } from '../constants.js';
import { Selectors } from '../state/selectors.js';
import { isCircularPath } from '../utils/math.js';

let context = null;

export function setContext(ctx) {
	context = ctx;
}

class EchoManagerClass {
	update(sound, userPos) {
		if (!sound.params.reflections?.enabled) {
			this.cleanup(sound);
			return;
		}

		const soundAreaGain = context.Geometry.isPointInShape(userPos, sound) ? context.calcGain(userPos, sound) : 0;

		if (!sound.echoNodes) sound.echoNodes = new Map();

		const allEchoPaths = Selectors.getPaths().filter(p =>
			p.params.echo?.enabled
		);

		if (allEchoPaths.length === 0) {
			this.cleanup(sound);
			return;
		}

		const includedPathIds = new Set(sound.params.reflections.include || []);
		const activePaths = allEchoPaths.filter(p => includedPathIds.has(p.id));

		const activePathIds = includedPathIds;

		for (const [pathId, nodeData] of sound.echoNodes.entries()) {
			if (!activePathIds.has(pathId)) {
				nodeData.delay.dispose();
				nodeData.gain.dispose();
				if (nodeData.panner) nodeData.panner.dispose();
				if (nodeData.ambisonicSource) {
					context.AmbisonicsManager.removeEchoSource(nodeData.ambisonicSource);
				}
				sound.echoNodes.delete(pathId);
			}
		}

		activePaths.forEach(path => {
			const reflectionPoint = this.findClosestPointOnPath(userPos, path);
			const sourcePos = sound.marker.getLatLng();

			const distSourceToWall = context.map.distance(sourcePos, reflectionPoint);
			const distWallToListener = context.map.distance(reflectionPoint, userPos);
			const totalDist = distSourceToWall + distWallToListener;
			const delayTime = totalDist / CONSTANTS.SPEED_OF_SOUND_MS;

			const maxAudibleDistance = CONSTANTS.ECHO_MAX_AUDIBLE_DISTANCE;
			const distanceAttenuation = Math.max(0, 1 - (totalDist / maxAudibleDistance));
			const echoLevel = path.params.echo.level !== undefined ? path.params.echo.level : 0.1;

			const gainValue = distanceAttenuation * echoLevel * soundAreaGain;

			let nodeData = sound.echoNodes.get(path.id);

			if (!nodeData) {
				const delayNode = new Tone.FeedbackDelay({
					delayTime: delayTime,
					maxDelay: CONSTANTS.ECHO_MAX_DELAY,
					feedback: path.params.echo.reflectivity,
					wet: 1.0
				});
				const gainNode = new Tone.Gain(gainValue);

				let panner = null;
				let ambisonicSource = null;

				if (Selectors.getSpatialMode() === 'hrtf') {
					panner = new Tone.Panner3D({
						panningModel: CONSTANTS.PANNER_3D_MODEL,
						distanceModel: CONSTANTS.PANNER_3D_DISTANCE_MODEL,
						refDistance: CONSTANTS.PANNER_3D_REF_DISTANCE,
						maxDistance: CONSTANTS.PANNER_3D_MAX_DISTANCE,
						rolloffFactor: CONSTANTS.PANNER_3D_ROLLOFF_FACTOR
					});
				} else if (Selectors.getSpatialMode() === 'stereo') {
					panner = new Tone.Panner3D({
						panningModel: 'equalpower',
						distanceModel: 'linear',
						refDistance: 1,
						maxDistance: 10000,
						rolloffFactor: 0
					});
				} else if (Selectors.getSpatialMode() === 'ambisonics') {
					ambisonicSource = context.AmbisonicsManager.createEchoSource();
				}

				sound.filter.connect(delayNode);

				let outputGain = new Tone.Gain(gainValue);
				delayNode.connect(outputGain);

				if (ambisonicSource) {
					Tone.connect(outputGain, ambisonicSource.input);
				} else if (panner) {
					outputGain.connect(panner);
					panner.toDestination();
				} else {
					outputGain.toDestination();
				}

				nodeData = {
					delay: delayNode,
					gain: outputGain,
					panner: panner,
					ambisonicSource: ambisonicSource,
					reflectionPoint: reflectionPoint
				};
				sound.echoNodes.set(path.id, nodeData);
			}

			nodeData.delay.delayTime.rampTo(delayTime, 0.1);
			nodeData.delay.feedback.value = Math.max(0, Math.min(0.95, path.params.echo.reflectivity));
			nodeData.gain.gain.rampTo(gainValue, 0.1);

			nodeData.reflectionPoint = reflectionPoint;

			this.updateEchoPannerPosition(nodeData, reflectionPoint, userPos);
		});
	}

	updateEchoPannerPosition(nodeData, reflectionPoint, userPos) {
		if (Selectors.getSpatialMode() === 'hrtf' && nodeData.panner instanceof Tone.Panner3D) {
			const coords = context.calculateRelativePosition(reflectionPoint, userPos, Selectors.getUserDirection());
			nodeData.panner.positionX.value = coords.x;
			nodeData.panner.positionY.value = coords.y;
			nodeData.panner.positionZ.value = 0;
		} else if (Selectors.getSpatialMode() === 'stereo' && nodeData.panner) {
			if (nodeData.panner instanceof Tone.Panner3D) {
				const coords = context.calculateRelativePosition(reflectionPoint, userPos, Selectors.getUserDirection());
				nodeData.panner.positionX.rampTo(coords.x, CONSTANTS.PANNER_RAMP_TIME);
				nodeData.panner.positionY.rampTo(coords.y, CONSTANTS.PANNER_RAMP_TIME);
				nodeData.panner.positionZ.value = 0;
			} else if (nodeData.panner.pan) {
				const panValue = context.calculateBearingPan(userPos, reflectionPoint, Selectors.getUserDirection());
				nodeData.panner.pan.rampTo(panValue, CONSTANTS.PANNER_RAMP_TIME);
			}
		} else if (Selectors.getSpatialMode() === 'ambisonics' && nodeData.ambisonicSource) {
			context.AmbisonicsManager.updateEchoSourcePosition(nodeData.ambisonicSource, reflectionPoint, userPos);
		}
	}

	cleanup(sound) {
		if (sound.echoNodes) {
			for (const [pathId, nodeData] of sound.echoNodes.entries()) {
				nodeData.gain.disconnect();
				nodeData.delay.disconnect();
				if (nodeData.panner) {
					nodeData.panner.disconnect();
					nodeData.panner.dispose();
				}
				if (nodeData.ambisonicSource) {
					context.AmbisonicsManager.removeEchoSource(nodeData.ambisonicSource);
				}
				nodeData.delay.dispose();
				nodeData.gain.dispose();
			}
			sound.echoNodes.clear();
		}
	}

	findClosestPointOnPath(point, path) {
		if (isCircularPath(path)) {
			return L.latLng(path.center.lat, path.center.lng);
		} else {
			let closestPoint = null;
			let minDistance = Infinity;
			const points = path.type === 'polygon' ? [...path.points, path.points[0]] : path.points;

			for (let i = 0; i < points.length - 1; i++) {
				const segmentStart = points[i];
				const segmentEnd = points[i + 1];
				const p = context.Geometry.getClosestPointOnLineSegment(point, segmentStart, segmentEnd);
				const dist = context.map.distance(point, p);

				if (dist < minDistance) {
					minDistance = dist;
					closestPoint = p;
				}
			}
			return closestPoint;
		}
	}
}

export const EchoManager = new EchoManagerClass();
