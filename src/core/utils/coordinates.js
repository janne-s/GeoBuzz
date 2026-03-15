import { CONSTANTS } from '../constants.js';

export class CoordinateTransform {
	static toOffset(lat, lng, anchor) {
		return {
			offsetY: (lat - anchor.lat) * CONSTANTS.METERS_PER_LAT,
			offsetX: (lng - anchor.lng) * CONSTANTS.METERS_PER_LNG * Math.cos(anchor.lat * Math.PI / 180)
		};
	}

	static fromOffset(offsetX, offsetY, anchor) {
		return {
			lat: anchor.lat + (offsetY / CONSTANTS.METERS_PER_LAT),
			lng: anchor.lng + (offsetX / (CONSTANTS.METERS_PER_LNG * Math.cos(anchor.lat * Math.PI / 180)))
		};
	}

	static pointToOffset(point, anchor) {
		return this.toOffset(point.lat, point.lng, anchor);
	}

	static pointFromOffset(offset, anchor) {
		return this.fromOffset(offset.offsetX, offset.offsetY, anchor);
	}

	static pointsToOffsets(points, anchor) {
		return points.map(p => this.pointToOffset(p, anchor));
	}

	static pointsFromOffsets(offsets, anchor) {
		return offsets.map(o => this.pointFromOffset(o, anchor));
	}
}
