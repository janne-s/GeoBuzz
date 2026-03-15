export const toRadians = (deg) => deg * Math.PI / 180;

export const toDegrees = (rad) => rad * 180 / Math.PI;

export function deepClone(obj, hash = new WeakMap()) {
	if (obj === null || typeof obj !== 'object') return obj;

	if (obj instanceof Date) return new Date(obj);

	if (hash.has(obj)) {
		return hash.get(obj);
	}

	if (obj instanceof Array) {
		const clonedArr = [];
		hash.set(obj, clonedArr);

		obj.forEach((item, i) => {
			clonedArr[i] = deepClone(item, hash);
		});
		return clonedArr;
	}

	const cloned = {};
	hash.set(obj, cloned);

	for (const key in obj) {
		if (obj.hasOwnProperty(key)) {
			cloned[key] = deepClone(obj[key], hash);
		}
	}
	return cloned;
}

const _timerRegistry = new WeakMap();

export function setTemporaryFlag(obj, flagName, duration) {
	if (!_timerRegistry.has(obj)) {
		_timerRegistry.set(obj, new Map());
	}
	const objectTimers = _timerRegistry.get(obj);

	if (objectTimers.has(flagName)) {
		clearTimeout(objectTimers.get(flagName));
	}

	obj[flagName] = true;
	const timer = setTimeout(() => {
		obj[flagName] = false;
		objectTimers.delete(flagName);
	}, duration);

	objectTimers.set(flagName, timer);
}

export function isCircularPath(path) {
	return path.type === 'circle' || path.type === 'oval';
}

export function decodePolyline(encoded) {
	let len = encoded.length;
	let index = 0;
	let lat = 0;
	let lng = 0;
	let array = [];

	while (index < len) {
		let b;
		let shift = 0;
		let result = 0;
		do {
			b = encoded.charCodeAt(index++) - 63;
			result |= (b & 0x1f) << shift;
			shift += 5;
		} while (b >= 0x20);
		let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
		lat += dlat;
		shift = 0;
		result = 0;
		do {
			b = encoded.charCodeAt(index++) - 63;
			result |= (b & 0x1f) << shift;
			shift += 5;
		} while (b >= 0x20);
		let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
		lng += dlng;
		array.push([lat * 1e-5, lng * 1e-5]);
	}
	return array;
}

export function mapValue(value, inMin, inMax, outMin, outMax) {
	const dividend = outMax - outMin;
	const divisor = inMax - inMin;
	if (divisor === 0) {
		return (outMin + outMax) / 2;
	}
	return (value - inMin) * dividend / divisor + outMin;
}

export function centripetalCatmullRomPoint(p0, p1, p2, p3, t) {
	const sqd = (a, b) => {
		const dlat = b.lat - a.lat, dlng = b.lng - a.lng;
		return dlat * dlat + dlng * dlng;
	};
	const lerp2d = (a, b, f) => ({ lat: a.lat + f * (b.lat - a.lat), lng: a.lng + f * (b.lng - a.lng) });

	const eps = 1e-10;
	const d1 = Math.max(Math.pow(sqd(p0, p1), 0.25), eps);
	const d2 = Math.max(Math.pow(sqd(p1, p2), 0.25), eps);
	const d3 = Math.max(Math.pow(sqd(p2, p3), 0.25), eps);

	const t1 = d1, t2 = d1 + d2, t3 = d1 + d2 + d3;
	const s = t1 + t * d2;

	const A1 = lerp2d(p0, p1, s / t1);
	const A2 = lerp2d(p1, p2, (s - t1) / d2);
	const A3 = lerp2d(p2, p3, (s - t2) / d3);
	const B1 = lerp2d(A1, A2, s / t2);
	const B2 = lerp2d(A2, A3, (s - t1) / (d2 + d3));
	return lerp2d(B1, B2, t);
}
