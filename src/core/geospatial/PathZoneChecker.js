import { CONSTANTS } from '../constants.js';
import { Geometry } from './Geometry.js';
import { AppState } from '../state/StateManager.js';

export const PathZoneChecker = {
	isPointInZone(userPos, path, zone) {
		const tolerance = path.tolerance || 0;

		if (zone === 'both') {
			return this.isPointInInterior(userPos, path) || this.isPointInCorridor(userPos, path, tolerance);
		} else if (zone === 'interior') {
			return this.isPointInInterior(userPos, path);
		} else if (zone === 'corridor') {
			return this.isPointInCorridor(userPos, path, tolerance);
		}
		return false;
	},

	isPointInInterior(userPos, path) {
		if (path.type === 'line') return false;

		if (path.type === 'circle') {
			const distance = Geometry.distance(userPos, path.center);
			return distance < path.radius;
		} else if (path.type === 'oval') {
			const a = path.radius;
			const b = path.radiusY;
			const dx = (userPos.lng - path.center.lng) * CONSTANTS.METERS_PER_LNG * Math.cos(path.center.lat * Math.PI / 180);
			const dy = (userPos.lat - path.center.lat) * CONSTANTS.METERS_PER_LAT;
			return ((dx * dx) / (a * a) + (dy * dy) / (b * b)) < 1;
		} else if (path.type === 'polygon' && path.points) {
			return Geometry.isPointInPolygon(userPos, path.points);
		}
		return false;
	},

	isPointInCorridor(userPos, path, tolerance) {
		if (tolerance <= 0) return false;
		if (path.type === 'line' && path.points) {
			for (let i = 0; i < path.points.length - 1; i++) {
				const p1 = path.points[i];
				const p2 = path.points[i + 1];

				const dx = p2.lng - p1.lng;
				const dy = p2.lat - p1.lat;
				const lengthSquared = dx * dx + dy * dy;

				if (lengthSquared === 0) continue;

				const t = ((userPos.lng - p1.lng) * dx + (userPos.lat - p1.lat) * dy) / lengthSquared;

				if (t < 0 || t > 1) continue;

				const projectedPoint = {
					lat: p1.lat + t * dy,
					lng: p1.lng + t * dx
				};

				const dist = Geometry.distance(userPos, projectedPoint);
				if (dist <= tolerance) return true;
			}
			return false;
		} else if (path.type === 'circle') {
			const distance = Geometry.distance(userPos, path.center);
			const isOutside = distance > path.radius;
			const isWithinCorridor = distance <= (path.radius + tolerance);
			return isOutside && isWithinCorridor;
		} else if (path.type === 'oval') {
			const a = path.radius;
			const b = path.radiusY;
			const dx = (userPos.lng - path.center.lng) * CONSTANTS.METERS_PER_LNG * Math.cos(path.center.lat * Math.PI / 180);
			const dy = (userPos.lat - path.center.lat) * CONSTANTS.METERS_PER_LAT;
			const normalizedDist = Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b));
			const actualDist = normalizedDist * Math.min(a, b);
			const boundaryDist = actualDist - Math.min(a, b);
			return boundaryDist > 0 && boundaryDist <= tolerance;
		} else if (path.type === 'polygon' && path.points) {
			const isInside = Geometry.isPointInPolygon(userPos, path.points);
			if (isInside) return false;
			const points = [...path.points, path.points[0]];
			for (let i = 0; i < points.length - 1; i++) {
				const dist = Geometry.distance(userPos, Geometry.getClosestPointOnLineSegment(userPos, points[i], points[i + 1]));
				if (dist <= tolerance) return true;
			}
			return false;
		}
		return false;
	},

	checkIndividualPaths(userPos, pathConfigs) {
		const results = new Map();
		if (!pathConfigs || pathConfigs.length === 0) return results;

		for (const config of pathConfigs) {
			let shape;
			if (config.type === 'path') {
				shape = AppState.getPath(config.id);
			} else if (config.type === 'sound') {
				shape = AppState.getSound(config.id);
			}
			if (!shape) continue;
			const zone = config.zone || 'interior';
			results.set(config.id, this.isPointInZone(userPos, shape, zone));
		}
		return results;
	},

	checkActivePaths(userPos, activePaths) {
		if (!activePaths || activePaths.length === 0) return true;

		for (const activeConfig of activePaths) {
			let shape, zone;

			if (activeConfig.type === 'path') {
				const path = AppState.getPath(activeConfig.id);
				if (!path) continue;
				shape = path;
				zone = activeConfig.zone || 'interior';
			} else if (activeConfig.type === 'sound') {
				const sound = AppState.getSound(activeConfig.id);
				if (!sound) continue;
				shape = sound;
				zone = activeConfig.zone || 'interior';
			} else {
				continue;
			}


			const isInside = this.isPointInZone(userPos, shape, zone);
			if (isInside) return true;
		}

		return false;
	}
};
