import { CONSTANTS } from '../constants.js';
import { Selectors } from '../state/selectors.js';
import { isCircularPath } from '../utils/math.js';
import { pathContributes } from './audioUtils.js';
import { feedbackDelayTailSeconds } from './FxTail.js';

let context = null;

export function setContext(ctx) {
	context = ctx;
}

class EchoManagerClass {
	update(sound, userPos, silencingGain = 1, elementGain = 1) {
		if (!sound.params.reflections?.enabled) {
			this.cleanup(sound);
			return;
		}

		const soundAreaGain = context.calcGain(userPos, sound);
		const audible = soundAreaGain * silencingGain * elementGain > 0;

		if (audible) this._wakeTaps(sound);

		if (!sound.echoNodes) sound.echoNodes = new Map();

		const echoPaths = Selectors.getEchoPaths();

		if (echoPaths.length === 0) {
			this.cleanup(sound);
			return;
		}

		const includedPathIds = sound.params.reflections.include || [];

		for (const [pathId, nodeData] of sound.echoNodes.entries()) {
			if (!includedPathIds.includes(pathId)) {
				nodeData.delay.dispose();
				nodeData.gain.dispose();
				if (nodeData.panner) nodeData.panner.dispose();
				if (nodeData.ambisonicSource) {
					context.AmbisonicsManager.removeEchoSource(nodeData.ambisonicSource);
				}
				sound.echoNodes.delete(pathId);
			}
		}

		for (let i = 0; i < echoPaths.length; i++) {
			const path = echoPaths[i];
			if (!includedPathIds.includes(path.id)) continue;

			const reflectionPoint = this.findClosestPointOnPath(userPos, path);
			const sourcePos = sound.marker.getLatLng();

			const distSourceToWall = context.map.distance(sourcePos, reflectionPoint);
			const distWallToListener = context.map.distance(reflectionPoint, userPos);
			const totalDist = distSourceToWall + distWallToListener;

			let nodeData = sound.echoNodes.get(path.id);
			const followedDist = this.followDistance(nodeData, totalDist, path.params.echo.inertia);
			const delayTime = followedDist / CONSTANTS.SPEED_OF_SOUND_MS;

			const maxAudibleDistance = CONSTANTS.ECHO_MAX_AUDIBLE_DISTANCE;
			const distanceAttenuation = Math.max(0, 1 - (followedDist / maxAudibleDistance));
			const echoLevel = path.params.echo.level !== undefined ? path.params.echo.level : 0.1;

			const pathGain = pathContributes(path, 'echo') ? 1 : 0;
			const gainValue = distanceAttenuation * echoLevel * soundAreaGain * silencingGain * elementGain * pathGain;

			if (!nodeData) {
				const delayNode = new Tone.FeedbackDelay({
					delayTime: delayTime,
					maxDelay: CONSTANTS.ECHO_MAX_DELAY,
					feedback: path.params.echo.reflectivity,
					wet: 1.0
				});
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

				if (sound._echoBypassed) this._disconnectTap(nodeData);
			}

			nodeData.smoothedDist = followedDist;
			nodeData.smoothedAt = performance.now() / 1000;

			nodeData.delay.delayTime.rampTo(delayTime, 0.1);
			nodeData.delay.feedback.value = Math.max(0, Math.min(0.95, path.params.echo.reflectivity));
			nodeData.gain.gain.rampTo(gainValue, 0.1);

			nodeData.reflectionPoint = reflectionPoint;

			this.updateEchoPannerPosition(nodeData, reflectionPoint, userPos);
		}

		if (!audible) this._scheduleTapBypass(sound);
	}

	_disconnectTap(nodeData) {
		const output = nodeData.ambisonicSource ? nodeData.gain : (nodeData.panner || nodeData.gain);
		if (output && !output.disposed) output.disconnect();
	}

	_connectTap(nodeData) {
		if (nodeData.ambisonicSource) {
			Tone.connect(nodeData.gain, nodeData.ambisonicSource.input);
		} else if (nodeData.panner) {
			nodeData.panner.toDestination();
		} else {
			nodeData.gain.toDestination();
		}
	}

	_tapTailSeconds(sound) {
		let tail = 0;
		sound.echoNodes.forEach(nodeData => {
			if (!nodeData.delay || nodeData.delay.disposed) return;
			const slotTail = feedbackDelayTailSeconds(nodeData.delay.delayTime.value, nodeData.delay.feedback.value);
			if (slotTail > tail) tail = slotTail;
		});
		return Math.min(CONSTANTS.FX_BYPASS_MAX_TAIL_S, tail) + CONSTANTS.FX_BYPASS_MARGIN_S;
	}

	_wakeTaps(sound) {
		if (sound._echoBypassTimeout) {
			clearTimeout(sound._echoBypassTimeout);
			sound._echoBypassTimeout = null;
		}
		if (!sound._echoBypassed) return;

		sound._echoBypassed = false;
		if (!sound.echoNodes) return;
		sound.echoNodes.forEach(nodeData => {
			if (nodeData.gain && !nodeData.gain.disposed) this._connectTap(nodeData);
		});
	}

	_scheduleTapBypass(sound) {
		if (sound._echoBypassed || sound._echoBypassTimeout) return;
		if (!sound.echoNodes || sound.echoNodes.size === 0) return;

		sound._echoBypassTimeout = setTimeout(() => {
			sound._echoBypassTimeout = null;
			if (!sound.echoNodes || sound.echoNodes.size === 0) return;

			sound.echoNodes.forEach(nodeData => this._disconnectTap(nodeData));
			sound._echoBypassed = true;
		}, this._tapTailSeconds(sound) * 1000);
	}

	_clearTapBypass(sound) {
		if (sound._echoBypassTimeout) {
			clearTimeout(sound._echoBypassTimeout);
			sound._echoBypassTimeout = null;
		}
		sound._echoBypassed = false;
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
		this._clearTapBypass(sound);
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

	followDistance(nodeData, distance, inertia) {
		const tau = inertia !== undefined ? inertia : CONSTANTS.ECHO_INERTIA;
		if (!nodeData || tau <= 0 || nodeData.smoothedDist === undefined) return distance;

		const dt = performance.now() / 1000 - nodeData.smoothedAt;
		if (!(dt > 0)) return nodeData.smoothedDist;

		const alpha = 1 - Math.exp(-dt / tau);
		return nodeData.smoothedDist + (distance - nodeData.smoothedDist) * alpha;
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
