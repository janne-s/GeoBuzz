import { CONSTANTS } from '../constants.js';
import { deepClone } from './math.js';

export class CoordinateTransform {
	static forEachCoordinate(buzzData, visit) {
		const point = (p) => {
			if (p && typeof p.lat === 'number' && typeof p.lng === 'number') visit(p);
		};

		(buzzData.sounds || []).forEach(sound => {
			point(sound);
			(sound.linePoints || []).forEach(point);
			(sound.vertices || []).forEach(point);
			(sound.points || []).forEach(point);
			point(sound.center);
			point(sound.ovalCenter);
		});

		(buzzData.controlPaths || []).forEach(path => {
			point(path.center);
			(path.points || []).forEach(point);
		});
	}

	static hasStoredOffsets(buzzData) {
		const sounds = buzzData.sounds || [];
		const paths = buzzData.controlPaths || [];
		return sounds.some(s => s.offsetX !== undefined && s.offsetY !== undefined)
			|| paths.some(p => p.pointOffsets || (p.centerOffsetX !== undefined && p.centerOffsetY !== undefined));
	}

	static geometryAnchor(buzzData) {
		let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;

		this.forEachCoordinate(buzzData, (p) => {
			if (p.lat < minLat) minLat = p.lat;
			if (p.lat > maxLat) maxLat = p.lat;
			if (p.lng < minLng) minLng = p.lng;
			if (p.lng > maxLng) maxLng = p.lng;
		});

		if (minLat === Infinity) return null;
		return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
	}

	static anchorBuzzTo(buzzData, anchor) {
		const source = this.geometryAnchor(buzzData);
		if (!source || !anchor) return buzzData;

		const moved = deepClone(buzzData);
		const latShift = anchor.lat - source.lat;
		const lngScale = Math.cos(source.lat * Math.PI / 180) / Math.cos(anchor.lat * Math.PI / 180);

		this.forEachCoordinate(moved, (p) => {
			p.lat = p.lat + latShift;
			p.lng = anchor.lng + (p.lng - source.lng) * lngScale;
		});

		return moved;
	}

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
