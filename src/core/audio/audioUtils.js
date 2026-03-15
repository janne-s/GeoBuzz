import { CONSTANTS } from '../constants.js';
import { toRadians, toDegrees } from '../utils/math.js';

let context = null;

export function setContext(ctx) {
	context = ctx;
}

export function calculateBearing(lat1, lon1, lat2, lon2) {
	const lat1Rad = toRadians(lat1);
	const lat2Rad = toRadians(lat2);
	const deltaLonRad = toRadians(lon2 - lon1);

	const y = Math.sin(deltaLonRad) * Math.cos(lat2Rad);
	const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
		Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLonRad);

	const bearingRad = Math.atan2(y, x);
	const bearingDeg = toDegrees(bearingRad);

	return (bearingDeg + 360) % 360;
}

export function calcGain(userPos, obj) {
	if (!context.Geometry.isPointInShape(userPos, obj)) return 0;

	let volumeScalar;
	const volumeOrigin = obj.volumeOrigin || 'icon';

	if (volumeOrigin === 'division' || volumeOrigin === 'centerline') {
		volumeScalar = context.Geometry.getDivisionVolume(userPos, obj);
	} else if (obj.volumeModel === 'raycast') {
		volumeScalar = context.Geometry.getRaycastVolume(userPos, obj);
	} else {
		const iconPos = obj.marker.getLatLng();
		const d = context.map.distance(userPos, iconPos);
		let maxD;

		if (obj.shapeType === "circle") {
			maxD = context.Geometry.getDistanceToCircleBoundary(iconPos, userPos, obj.circle);
		} else if (obj.shapeType === "line") {
			maxD = context.Geometry.getDistanceToLineBoundary(iconPos, userPos, obj.linePoints, obj.lineTolerance);
		} else if (obj.shapeType === "oval") {
			maxD = context.Geometry.getDistanceToOvalBoundary(iconPos, userPos, obj.ovalCenter, obj.radiusX, obj.radiusY);
		} else {
			maxD = context.Geometry.calculateMaxDistanceToPolygonBoundary(obj.vertices, iconPos);
		}

		const norm = d / Math.max(maxD, 1);
		const curveVal = (1 - norm) ** 2;
		const cs = obj.params.curveStrength !== undefined ? obj.params.curveStrength : 1;
		volumeScalar = (1 - cs) + cs * curveVal;
	}

	const volume = obj._modulatedVolume !== undefined ? obj._modulatedVolume : obj.params.volume;
	return volumeScalar * volume;
}

export function calculatePathGain(userPos, path) {
	let rawGain = 1;

	if (path.type === 'circle') {
		const distance = context.map.distance(userPos, path.center);
		const normalized = Math.min(1, distance / path.radius);
		rawGain = 1 - normalized;
	} else if (path.type === 'oval') {
		const a = path.radius;
		const b = path.radiusY;
		const dx = (userPos.lng - path.center.lng) * CONSTANTS.METERS_PER_LNG * Math.cos(path.center.lat * Math.PI / 180);
		const dy = (userPos.lat - path.center.lat) * CONSTANTS.METERS_PER_LAT;
		const normalized = Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b));
		rawGain = Math.max(0, 1 - normalized);
	} else if (path.type === 'polygon') {
		const centroid = context.Geometry.calculateCentroid(path.points);
		const maxDist = context.Geometry.calculateMaxPolygonDistance(path.points);
		const distance = context.map.distance(userPos, centroid);
		const normalized = Math.min(1, distance / maxDist);
		rawGain = 1 - normalized;
	}

	if (path.params.silencer) {
		const curve = path.params.silencer.curve !== undefined ? path.params.silencer.curve : 1.0;
		const exponent = 0.01 + curve * 0.99;
		return Math.pow(rawGain, exponent);
	}

	return rawGain;
}

export function calculateRelativePosition(soundPos, userPos, userDirection) {
	const deltaLat = soundPos.lat - userPos.lat;
	const deltaLng = soundPos.lng - userPos.lng;

	const y = deltaLat * CONSTANTS.METERS_PER_LAT;
	const x = deltaLng * CONSTANTS.METERS_PER_LNG * Math.cos(userPos.lat * Math.PI / 180);

	const angleRad = userDirection * (Math.PI / 180);
	const cosAngle = Math.cos(angleRad);
	const sinAngle = Math.sin(angleRad);

	const rotatedX = x * cosAngle - y * sinAngle;
	const rotatedY = x * sinAngle + y * cosAngle;

	return { x: rotatedX, y: rotatedY, z: 0 };
}

export function calculateBearingPan(userPos, soundPos, userDirection) {
	const lat1 = userPos.lat * Math.PI / 180;
	const lat2 = soundPos.lat * Math.PI / 180;
	const deltaLng = (soundPos.lng - userPos.lng) * Math.PI / 180;

	const y = Math.sin(deltaLng) * Math.cos(lat2);
	const x = Math.cos(lat1) * Math.sin(lat2) -
		Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);

	let absoluteBearing = Math.atan2(y, x) * 180 / Math.PI;
	absoluteBearing = (absoluteBearing + 360) % 360;

	let relativeBearing = (absoluteBearing - userDirection + 360) % 360;
	return Math.sin(relativeBearing * Math.PI / 180);
}
