import { CONSTANTS } from '../constants.js';
import { toRadians, centripetalCatmullRomPoint } from '../utils/math.js';
import { calculateBearing } from '../audio/audioUtils.js';

let _map = null;

const GEOMETRY_ZOOM = 20;
const proj = ll => { const p = _map.project(ll, GEOMETRY_ZOOM); return { lat: p.y, lng: p.x }; };
const unproj = m => _map.unproject(L.point(m.lng, m.lat), GEOMETRY_ZOOM);
const metersToPixels = (meters, centerLat) => meters / (CONSTANTS.EARTH_CIRCUMFERENCE_M * Math.cos(centerLat * Math.PI / 180) / (256 * Math.pow(2, GEOMETRY_ZOOM)));

export const Geometry = {
	EARTH_RADIUS_M: CONSTANTS.EARTH_RADIUS_M,
	METERS_PER_LAT: CONSTANTS.METERS_PER_LAT,
	METERS_PER_LNG: CONSTANTS.METERS_PER_LNG,

	setMap(mapInstance) {
		_map = mapInstance;
	},

	distance(latlng1, latlng2) {
		return _map ? _map.distance(latlng1, latlng2) : this.calculateDistanceMeters(latlng1, latlng2);
	},

	calculateDistanceMeters(pos1, pos2) {
		const deltaLat = (pos2.lat - pos1.lat) * CONSTANTS.METERS_PER_LAT;
		const deltaLng = (pos2.lng - pos1.lng) * CONSTANTS.METERS_PER_LNG * Math.cos(pos1.lat * Math.PI / 180);
		return Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng);
	},

	isPointInShape(point, obj) {
		if (obj.shapeType === "circle") {
			const distance = _map.distance(point, obj.circle.getLatLng());
			return distance < obj.circle.getRadius();
		} else if (obj.shapeType === "polygon") {
			return this.isPointInPolygon(point, obj.vertices);
		} else if (obj.shapeType === "line") {
			const pts = obj.smoothing > 0 ? this.smoothPoints(obj.linePoints, obj.smoothing) : obj.linePoints;
			return this.isPointInLineCorridor(point, pts, obj.lineTolerance);
		} else if (obj.shapeType === "oval") {
			return this.isPointInOval(point, obj.ovalCenter, obj.radiusX, obj.radiusY);
		}
		return false;
	},

	isPointInLineCorridor(point, linePoints, tolerance) {
		if (!linePoints || linePoints.length < 2) return false;

		for (let i = 0; i < linePoints.length - 1; i++) {
			const closestPoint = this.getClosestPointOnLineSegment(point, linePoints[i], linePoints[i + 1]);
			const distMeters = _map ? _map.distance(point, closestPoint) : this.calculateDistanceMeters(point, closestPoint);
			if (distMeters <= tolerance) return true;
		}

		const startDist = _map ? _map.distance(point, linePoints[0]) : this.calculateDistanceMeters(point, linePoints[0]);
		if (startDist <= tolerance) return true;

		const endDist = _map ? _map.distance(point, linePoints[linePoints.length - 1]) : this.calculateDistanceMeters(point, linePoints[linePoints.length - 1]);
		if (endDist <= tolerance) return true;

		return false;
	},

	isPointInOval(point, center, radiusX, radiusY) {
		if (!center) return false;
		const dx = (point.lng - center.lng) * CONSTANTS.METERS_PER_LNG * Math.cos(center.lat * Math.PI / 180);
		const dy = (point.lat - center.lat) * CONSTANTS.METERS_PER_LAT;
		return ((dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY)) <= 1;
	},

	isPointInControlPath(point, path) {
		if (path.type === 'circle') {
			const distance = _map.distance(point, path.center);
			return distance <= path.radius;
		} else if (path.type === 'oval') {
			const a = path.radius;
			const b = path.radiusY;
			const dx = (point.lng - path.center.lng) * CONSTANTS.METERS_PER_LNG * Math.cos(path.center.lat * Math.PI / 180);
			const dy = (point.lat - path.center.lat) * CONSTANTS.METERS_PER_LAT;
			return ((dx * dx) / (a * a) + (dy * dy) / (b * b)) <= 1;
		} else if (path.type === 'polygon' && path.points) {
			return Geometry.isPointInPolygon(point, path.points);
		} else if (path.type === 'line' && path.points) {
			for (let i = 0; i < path.points.length - 1; i++) {
				const dist = Geometry.distanceToLineSegment(point, path.points[i], path.points[i + 1]);
				if (dist * CONSTANTS.METERS_PER_LNG <= CONSTANTS.LINE_PATH_BUFFER_M) return true;
			}
			return false;
		}
		return false;
	},

	getDistanceToCircleBoundary(iconPos, userPos, circle) {
		const circleCenter = circle.getLatLng();
		const radius = circle.getRadius();

		const distIcon = _map.distance(circleCenter, iconPos);
		const bearingIcon = toRadians(calculateBearing(circleCenter.lat, circleCenter.lng, iconPos.lat, iconPos.lng));
		const iconX = distIcon * Math.sin(bearingIcon);
		const iconY = distIcon * Math.cos(bearingIcon);

		const distUser = _map.distance(iconPos, userPos);
		if (distUser < 0.1) {
			return radius - distIcon;
		}

		const bearingRay = toRadians(calculateBearing(iconPos.lat, iconPos.lng, userPos.lat, userPos.lng));
		const rayDx = Math.sin(bearingRay);
		const rayDy = Math.cos(bearingRay);

		const a = 1;
		const b = 2 * (iconX * rayDx + iconY * rayDy);
		const c = iconX * iconX + iconY * iconY - radius * radius;

		const discriminant = b * b - 4 * a * c;

		if (discriminant < 0) {
			return Infinity;
		}

		const sqrtDisc = Math.sqrt(discriminant);
		const t1 = (-b - sqrtDisc) / 2;
		const t2 = (-b + sqrtDisc) / 2;

		if (t1 > 0) return t1;
		if (t2 > 0) return t2;

		return Infinity;
	},

	raySegmentIntersection(rayOrigin, rayDir, segStart, segEnd) {
		const v1 = { x: rayOrigin.lng, y: rayOrigin.lat };
		const v2 = { x: rayOrigin.lng + rayDir.lng, y: rayOrigin.lat + rayDir.lat };
		const v3 = { x: segStart.lng, y: segStart.lat };
		const v4 = { x: segEnd.lng, y: segEnd.lat };

		const den = (v1.x - v2.x) * (v3.y - v4.y) - (v1.y - v2.y) * (v3.x - v4.x);
		if (den === 0) return null;

		const t = ((v1.x - v3.x) * (v3.y - v4.y) - (v1.y - v3.y) * (v3.x - v4.x)) / den;
		const u = -((v1.x - v2.x) * (v1.y - v3.y) - (v1.y - v2.y) * (v1.x - v3.x)) / den;

		if (t > 0 && u >= 0 && u <= 1) {
			return L.latLng(v1.y + t * (v2.y - v1.y), v1.x + t * (v2.x - v1.x));
		}
		return null;
	},

	getRaycastVolume(userPos, obj) {
		const iconPos = obj.marker.getLatLng();
		const listenerDist = _map.distance(iconPos, userPos);

		const minRadius = obj.params.minRadius || 0;
		if (listenerDist <= minRadius) return 1.0;

		if (listenerDist < 0.1) return 1.0;

		let nearestIntersectionDist = Infinity;

		if (obj.shapeType === 'polygon' && obj.vertices) {
			const dir = {
				lat: userPos.lat - iconPos.lat,
				lng: userPos.lng - iconPos.lng
			};
			const mag = Math.sqrt(dir.lat * dir.lat + dir.lng * dir.lng);
			dir.lat /= mag;
			dir.lng /= mag;

			for (let i = 0; i < obj.vertices.length; i++) {
				const start = obj.vertices[i];
				const end = obj.vertices[(i + 1) % obj.vertices.length];
				const intersection = this.raySegmentIntersection(iconPos, dir, start, end);
				if (intersection) {
					const dist = _map.distance(iconPos, intersection);
					if (dist < nearestIntersectionDist) {
						nearestIntersectionDist = dist;
					}
				}
			}
		} else if (obj.shapeType === 'circle' && obj.circle) {
			nearestIntersectionDist = this.getDistanceToCircleBoundary(iconPos, userPos, obj.circle);
		} else if (obj.shapeType === 'line' && obj.linePoints) {
			nearestIntersectionDist = this.getDistanceToLineBoundary(iconPos, userPos, obj.linePoints, obj.lineTolerance);
		} else if (obj.shapeType === 'oval' && obj.ovalCenter) {
			nearestIntersectionDist = this.getDistanceToOvalBoundary(iconPos, userPos, obj.ovalCenter, obj.radiusX, obj.radiusY);
		}

		if (nearestIntersectionDist === Infinity) return 0.0;

		const edgeMargin = obj.params.edgeMargin || 0;
		const effectiveDistToEdge = Math.max(0.1, nearestIntersectionDist - minRadius - edgeMargin);
		const fraction = Math.max(0, Math.min(1, (listenerDist - minRadius) / effectiveDistToEdge));
		const gamma = obj.params.gamma || 1.0;

		return (1.0 - fraction) ** gamma;
	},

	getDistanceToLineBoundary(iconPos, userPos, linePoints, tolerance) {
		const dir = {
			lat: userPos.lat - iconPos.lat,
			lng: userPos.lng - iconPos.lng
		};
		const mag = Math.sqrt(dir.lat * dir.lat + dir.lng * dir.lng);
		if (mag < 1e-10) return tolerance;

		dir.lat /= mag;
		dir.lng /= mag;

		const corridorPoints = this.generateSoundLineCorridorWithSemicircles(linePoints, tolerance);
		let nearestDist = Infinity;

		for (let i = 0; i < corridorPoints.length; i++) {
			const start = corridorPoints[i];
			const end = corridorPoints[(i + 1) % corridorPoints.length];
			const intersection = this.raySegmentIntersection(iconPos, dir, start, end);
			if (intersection) {
				const dist = _map.distance(iconPos, intersection);
				if (dist < nearestDist) {
					nearestDist = dist;
				}
			}
		}

		return nearestDist;
	},

	getDistanceToOvalBoundary(iconPos, userPos, center, radiusX, radiusY) {
		const dir = {
			lat: userPos.lat - iconPos.lat,
			lng: userPos.lng - iconPos.lng
		};
		const mag = Math.sqrt(dir.lat * dir.lat + dir.lng * dir.lng);
		if (mag < 1e-10) return Math.min(radiusX, radiusY);

		dir.lat /= mag;
		dir.lng /= mag;

		const cosLat = Math.cos(center.lat * Math.PI / 180);
		const aLat = radiusY / CONSTANTS.METERS_PER_LAT;
		const aLng = radiusX / (CONSTANTS.METERS_PER_LNG * cosLat);

		const ox = iconPos.lng - center.lng;
		const oy = iconPos.lat - center.lat;
		const a = (dir.lng * dir.lng) / (aLng * aLng) + (dir.lat * dir.lat) / (aLat * aLat);
		const b = 2 * ((ox * dir.lng) / (aLng * aLng) + (oy * dir.lat) / (aLat * aLat));
		const c = (ox * ox) / (aLng * aLng) + (oy * oy) / (aLat * aLat) - 1;

		const discriminant = b * b - 4 * a * c;
		if (discriminant < 0) return Math.min(radiusX, radiusY);

		const sqrtD = Math.sqrt(discriminant);
		const t1 = (-b - sqrtD) / (2 * a);
		const t2 = (-b + sqrtD) / (2 * a);

		let t = t1 > 0 ? t1 : (t2 > 0 ? t2 : null);
		if (t === null) return Math.min(radiusX, radiusY);

		const intersection = L.latLng(iconPos.lat + dir.lat * t, iconPos.lng + dir.lng * t);
		return _map.distance(iconPos, intersection);
	},

	updatePolygonCentroid(obj) {
		if (obj.shapeType === 'polygon' && obj.iconPlacementMode === 'fixed' && obj.vertices && obj.marker) {
			const centroid = this.calculateCentroid(obj.vertices);
			obj.marker.setLatLng(centroid);
			obj.userLat = centroid.lat;
			obj.userLng = centroid.lng;
		}
	},

	distanceToLineSegment(point, lineStart, lineEnd) {
		const A = point.lat - lineStart.lat;
		const B = point.lng - lineStart.lng;
		const C = lineEnd.lat - lineStart.lat;
		const D = lineEnd.lng - lineStart.lng;

		const dot = A * C + B * D;
		const lenSq = C * C + D * D;
		let param = -1;

		if (lenSq !== 0) param = dot / lenSq;

		let xx, yy;

		if (param < 0) {
			xx = lineStart.lat;
			yy = lineStart.lng;
		} else if (param > 1) {
			xx = lineEnd.lat;
			yy = lineEnd.lng;
		} else {
			xx = lineStart.lat + param * C;
			yy = lineStart.lng + param * D;
		}

		const dx = point.lat - xx;
		const dy = point.lng - yy;
		return Math.sqrt(dx * dx + dy * dy);
	},

	getClosestPointOnLineSegment(point, lineStart, lineEnd) {
		const A = point.lat - lineStart.lat;
		const B = point.lng - lineStart.lng;
		const C = lineEnd.lat - lineStart.lat;
		const D = lineEnd.lng - lineStart.lng;

		const dot = A * C + B * D;
		const lenSq = C * C + D * D;
		let param = -1;

		if (lenSq !== 0) param = dot / lenSq;

		let xx, yy;

		if (param < 0) {
			xx = lineStart.lat;
			yy = lineStart.lng;
		} else if (param > 1) {
			xx = lineEnd.lat;
			yy = lineEnd.lng;
		} else {
			xx = lineStart.lat + param * C;
			yy = lineStart.lng + param * D;
		}

		return L.latLng(xx, yy);
	},

	isPointInPolygon(point, vertices) {
		let inside = false;
		const x = point.lat,
			y = point.lng;

		for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
			const xi = vertices[i].lat,
				yi = vertices[i].lng;
			const xj = vertices[j].lat,
				yj = vertices[j].lng;

			if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
				inside = !inside;
			}
		}
		return inside;
	},

	calculateCentroid(vertices) {
		let lat = 0,
			lng = 0;
		vertices.forEach(v => {
			lat += v.lat;
			lng += v.lng;
		});
		return L.latLng(lat / vertices.length, lng / vertices.length);
	},

	computeEdgeLatLng(center, radius, type = 'handle') {
		const earthRadius = this.EARTH_RADIUS_M;

		const lat = center.lat !== undefined ? center.lat : center[0];
		const lng = center.lng !== undefined ? center.lng : center[1];

		let deltaLat = 0,
			deltaLng = 0;

		if (type === 'label') {
			deltaLat = (radius / earthRadius) * (180 / Math.PI);
		} else {
			deltaLng = (radius / earthRadius) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);
		}

		return L.latLng(lat + deltaLat, lng + deltaLng);
	},

	createDefaultSquare(center, size) {
		const earthRadius = this.EARTH_RADIUS_M;
		const lat = center.lat;
		const lng = center.lng;

		const deltaLat = (size / earthRadius) * (180 / Math.PI);
		const deltaLng = (size / earthRadius) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);

		return [
			L.latLng(lat + deltaLat, lng - deltaLng),
			L.latLng(lat + deltaLat, lng + deltaLng),
			L.latLng(lat - deltaLat, lng + deltaLng),
			L.latLng(lat - deltaLat, lng - deltaLng)
		];
	},

	calculateAverageRadius(vertices, center) {
		if (!vertices || vertices.length === 0) return CONSTANTS.DEFAULT_CIRCLE_RADIUS;

		const distances = vertices.map(v => _map.distance(center, v));
		return distances.reduce((a, b) => a + b, 0) / distances.length;
	},

	calculateMaxDistanceToPolygonBoundary(vertices, focalPoint) {
		let maxDistance = 0;

		vertices.forEach(v => {
			const d = _map.distance(focalPoint, v);
			if (d > maxDistance) maxDistance = d;
		});

		for (let i = 0; i < vertices.length; i++) {
			const start = vertices[i];
			const end = vertices[(i + 1) % vertices.length];

			const closestPoint = this.getClosestPointOnLineSegment(focalPoint, start, end);
			const d = _map.distance(focalPoint, closestPoint);

			if (d > maxDistance) maxDistance = d;
		}

		return Math.max(maxDistance, 1);
	},

	calculateMaxPolygonDistance(vertices) {
		let maxDistance = 0;
		const center = this.calculateCentroid(vertices);

		vertices.forEach(v => {
			const d = _map.distance(center, v);
			if (d > maxDistance) maxDistance = d;
		});

		return maxDistance;
	},

	findInsertionIndex(clickPoint, vertices) {
		let minDistance = Infinity;
		let insertIndex = 1;

		for (let i = 0; i < vertices.length; i++) {
			const current = vertices[i];
			const next = vertices[(i + 1) % vertices.length];
			const distance = this.distanceToLineSegment(clickPoint, current, next);

			if (distance < minDistance) {
				minDistance = distance;
				insertIndex = i + 1;
			}
		}

		return insertIndex;
	},

	distanceToPolygon(point, vertices) {
		let minDistance = Infinity;

		for (let i = 0; i < vertices.length; i++) {
			const start = vertices[i];
			const end = vertices[(i + 1) % vertices.length];
			const distance = this.distanceToLineSegment(point, start, end);

			if (distance < minDistance) {
				minDistance = distance;
			}
		}

		return minDistance;
	},

	generateOvalPoints(center, radiusX, radiusY, numPoints = CONSTANTS.OVAL_RESOLUTION) {
		const points = [];
		const cosLat = Math.cos(center.lat * Math.PI / 180);

		for (let i = 0; i < numPoints; i++) {
			const angle = (i / numPoints) * 2 * Math.PI;
			const dx = radiusX * Math.cos(angle);
			const dy = radiusY * Math.sin(angle);
			const lat = center.lat + (dy / CONSTANTS.METERS_PER_LAT);
			const lng = center.lng + (dx / (CONSTANTS.METERS_PER_LNG * cosLat));
			points.push(L.latLng(lat, lng));
		}

		return points;
	},

	smoothPoints(points, smoothing) {
		if (!points || points.length < 2 || smoothing <= 0) return points;

		const subdivisions = Math.floor(smoothing * 16);
		if (subdivisions === 0) return points;

		const projected = points.map(proj);
		const n = projected.length;
		const ext = [projected[0], ...projected, projected[n - 1]];
		const result = [];

		for (let i = 0; i < n - 1; i++) {
			const P0 = ext[i], P1 = ext[i + 1], P2 = ext[i + 2], P3 = ext[i + 3];
			const dx = P2.lng - P1.lng, dy = P2.lat - P1.lat;
			if (Math.sqrt(dx * dx + dy * dy) < 0.0001) continue;
			if (i === 0) result.push(unproj(P1));
			for (let j = 1; j <= subdivisions; j++) {
				result.push(unproj(centripetalCatmullRomPoint(P0, P1, P2, P3, j / subdivisions)));
			}
		}

		return result;
	},

	generateSoundLineCorridorWithSemicircles(points, tolerance, numSemicircleSegments = CONSTANTS.LINE_SEMICIRCLE_SEGMENTS) {
		if (!points || points.length < 2) return [];

		const outerPoints = this.getOffsetPolyline(points, tolerance);
		const innerPoints = this.getOffsetPolyline(points, -tolerance).reverse();

		const startSemicircle = this.generateSemicirclePoints(
			points[0],
			points[0],
			points[1],
			tolerance,
			numSemicircleSegments,
			'start'
		);

		const endSemicircle = this.generateSemicirclePoints(
			points[points.length - 1],
			points[points.length - 2],
			points[points.length - 1],
			tolerance,
			numSemicircleSegments,
			'end'
		);

		return [...outerPoints, ...endSemicircle, ...innerPoints, ...startSemicircle];
	},

	getOffsetPolyline(points, offsetMeters) {
		if (points.length < 2) return [];

		const MITER_LIMIT = 4;
		const centerLat = points[Math.floor(points.length / 2)].lat;
		const offset = metersToPixels(offsetMeters, centerLat);
		const pts = points.map(proj);

		const segPerp = (a, b) => {
			const dx = b.lng - a.lng, dy = b.lat - a.lat;
			const len = Math.sqrt(dx * dx + dy * dy);
			if (len < 1e-10) return null;
			return { lat: -dx / len, lng: dy / len };
		};

		const place = (p, perp, scale) => ({
			lat: p.lat + offset * perp.lat * scale,
			lng: p.lng + offset * perp.lng * scale
		});

		const offsetPts = [];
		for (let i = 0; i < pts.length; i++) {
			const pt = pts[i];
			if (i === 0) {
				const perp = segPerp(pts[0], pts[1]);
				offsetPts.push(perp ? place(pt, perp, 1) : { lat: pt.lat, lng: pt.lng });
			} else if (i === pts.length - 1) {
				const perp = segPerp(pts[i - 1], pts[i]);
				offsetPts.push(perp ? place(pt, perp, 1) : { lat: pt.lat, lng: pt.lng });
			} else {
				const perp1 = segPerp(pts[i - 1], pts[i]);
				const perp2 = segPerp(pts[i], pts[i + 1]);
				if (!perp1 || !perp2) {
					const perp = perp1 || perp2;
					offsetPts.push(perp ? place(pt, perp, 1) : { lat: pt.lat, lng: pt.lng });
				} else {
					const avgLat = (perp1.lat + perp2.lat) / 2;
					const avgLng = (perp1.lng + perp2.lng) / 2;
					const avgLenSq = avgLat * avgLat + avgLng * avgLng;
					if (avgLenSq < 1 / (MITER_LIMIT * MITER_LIMIT)) {
						offsetPts.push(place(pt, perp1, 1));
					} else {
						offsetPts.push(place(pt, { lat: avgLat, lng: avgLng }, 1 / avgLenSq));
					}
				}
			}
		}
		return offsetPts.map(unproj);
	},

	generateSemicirclePoints(center, prevPoint, nextPoint, radius, segments, position) {
		const c = proj(center);
		const radiusPx = metersToPixels(radius, center.lat);

		let dx, dy;
		if (position === 'start') {
			const n = proj(nextPoint);
			dx = n.lng - c.lng;
			dy = n.lat - c.lat;
		} else {
			const p = proj(prevPoint);
			dx = c.lng - p.lng;
			dy = c.lat - p.lat;
		}

		const lineAngle = Math.atan2(dy, dx);
		const startAngle = position === 'start' ? lineAngle + Math.PI / 2 : lineAngle - Math.PI / 2;

		const points = [];
		for (let i = 0; i <= segments; i++) {
			const angle = startAngle + Math.PI * i / segments;
			points.push(unproj({ lat: c.lat + radiusPx * Math.sin(angle), lng: c.lng + radiusPx * Math.cos(angle) }));
		}

		return points;
	},

	createOvalElements(center, radiusX, radiusY, color) {
		const points = this.generateOvalPoints(center, radiusX, radiusY);
		return {
			polygon: L.polygon(points, {
				color,
				fill: true,
				fillColor: color,
				fillOpacity: CONSTANTS.SOUND_AREA_FILL_OPACITY,
				weight: 4,
				opacity: 1.0,
				bubblingMouseEvents: true,
				pane: 'soundArea'
			}),
			points
		};
	},

	createLineElements(linePoints, tolerance, color, smoothing = 0) {
		const pts = smoothing > 0 ? this.smoothPoints(linePoints, smoothing) : linePoints;
		const corridorPoints = this.generateSoundLineCorridorWithSemicircles(pts, tolerance);
		return {
			polygon: L.polygon(corridorPoints, {
				color,
				fill: true,
				fillColor: color,
				fillOpacity: CONSTANTS.SOUND_AREA_FILL_OPACITY,
				weight: 4,
				opacity: 1.0,
				bubblingMouseEvents: true,
				pane: 'soundArea'
			}),
			corridorPoints
		};
	},

	createCircleElements(center, radius, color) {
		return {
			circle: L.circle(center, {
				radius,
				color,
				fill: true,
				fillColor: color,
				fillOpacity: CONSTANTS.SOUND_AREA_FILL_OPACITY,
				weight: 2,
				pane: 'soundArea'
			}),
			handle: this.createCircleHandle(center, radius)
		};
	},

	createCircleHandle(center, radius) {
		const edgeLatLng = this.computeEdgeLatLng(center, radius);
		const handleIcon = L.divIcon({
			html: '<div class="radius-handle"></div>',
			className: 'radius-handle-marker',
			iconSize: CONSTANTS.RADIUS_HANDLE_SIZE,
			iconAnchor: CONSTANTS.RADIUS_HANDLE_ANCHOR
		});

		return L.marker(edgeLatLng, {
			draggable: true,
			icon: handleIcon,
			opacity: 0.8,
			pane: 'soundElement'
		});
	},

	createPolygonElements(center, radius, color) {
		const vertices = this.createDefaultSquare(center, radius);
		return {
			polygon: L.polygon(vertices, {
				color,
				fill: true,
				fillColor: color,
				fillOpacity: CONSTANTS.SOUND_AREA_FILL_OPACITY,
				weight: 4,
				opacity: 1.0,
				bubblingMouseEvents: true,
				pane: 'soundArea'
			}),
			vertices
		};
	},

	updateCirclePosition(circle, handle, labelMarker, newPos, radius) {
		if (circle) circle.setLatLng(newPos);
		if (handle) handle.setLatLng(this.computeEdgeLatLng(newPos, radius));
		if (labelMarker) labelMarker.setLatLng(this.computeEdgeLatLng(newPos, radius, 'label'));
	},

	updatePolygonPosition(polygon, vertices, vertexMarkers, labelMarker, deltaLat, deltaLng) {
		const newVertices = vertices.map(v =>
			L.latLng(v.lat + deltaLat, v.lng + deltaLng)
		);

		if (polygon) polygon.setLatLngs(newVertices);
		if (vertexMarkers && vertexMarkers.length > 0) {
			vertexMarkers.forEach((marker, i) => marker.setLatLng(newVertices[i]));
		}
		if (labelMarker && newVertices[0]) labelMarker.setLatLng(newVertices[0]);

		return newVertices;
	},

	updateLinePosition(obj, deltaLat, deltaLng) {
		const newPoints = obj.linePoints.map(p =>
			L.latLng(p.lat + deltaLat, p.lng + deltaLng)
		);
		obj.linePoints = newPoints;

		const pts = obj.smoothing > 0 ? this.smoothPoints(newPoints, obj.smoothing) : newPoints;
		const corridorPoints = this.generateSoundLineCorridorWithSemicircles(pts, obj.lineTolerance);
		if (obj.polygon) obj.polygon.setLatLngs(corridorPoints);

		if (obj.linePointMarkers && obj.linePointMarkers.length > 0) {
			obj.linePointMarkers.forEach((marker, i) => marker.setLatLng(newPoints[i]));
		}

		if (obj.labelMarker) {
			obj.labelMarker.setLatLng(newPoints[0]);
		}
	},

	updateOvalPosition(obj, newCenter) {
		obj.ovalCenter = newCenter;

		const points = this.generateOvalPoints(newCenter, obj.radiusX, obj.radiusY);
		if (obj.polygon) obj.polygon.setLatLngs(points);

		if (obj.xHandle) {
			const xHandlePos = this.computeOvalHandlePosition(newCenter, obj.radiusX, obj.radiusY, 'x');
			obj.xHandle.setLatLng(xHandlePos);
		}

		if (obj.yHandle) {
			const yHandlePos = this.computeOvalHandlePosition(newCenter, obj.radiusX, obj.radiusY, 'y');
			obj.yHandle.setLatLng(yHandlePos);
		}

		if (obj.labelMarker) {
			const labelPos = L.latLng(
				newCenter.lat + (obj.radiusY / CONSTANTS.METERS_PER_LAT),
				newCenter.lng
			);
			obj.labelMarker.setLatLng(labelPos);
		}
	},

	computeOvalHandlePosition(center, radiusX, radiusY, axis) {
		const cosLat = Math.cos(center.lat * Math.PI / 180);
		if (axis === 'x') {
			return L.latLng(center.lat, center.lng + (radiusX / (CONSTANTS.METERS_PER_LNG * cosLat)));
		} else {
			return L.latLng(center.lat + (radiusY / CONSTANTS.METERS_PER_LAT), center.lng);
		}
	},

	resizeOval(obj, axis, newRadius) {
		const minRadius = CONSTANTS.MIN_RADIUS;
		newRadius = Math.max(minRadius, Math.round(newRadius));

		if (axis === 'x') {
			obj.radiusX = newRadius;
		} else {
			obj.radiusY = newRadius;
		}

		const points = this.generateOvalPoints(obj.ovalCenter, obj.radiusX, obj.radiusY);
		if (obj.polygon) obj.polygon.setLatLngs(points);

		if (obj.xHandle) {
			obj.xHandle.setLatLng(this.computeOvalHandlePosition(obj.ovalCenter, obj.radiusX, obj.radiusY, 'x'));
		}
		if (obj.yHandle) {
			obj.yHandle.setLatLng(this.computeOvalHandlePosition(obj.ovalCenter, obj.radiusX, obj.radiusY, 'y'));
		}

		if (obj.labelMarker) {
			const labelPos = L.latLng(
				obj.ovalCenter.lat + (obj.radiusY / CONSTANTS.METERS_PER_LAT),
				obj.ovalCenter.lng
			);
			obj.labelMarker.setLatLng(labelPos);
		}
	},

	updateLineCorridor(obj) {
		const pts = obj.smoothing > 0 ? this.smoothPoints(obj.linePoints, obj.smoothing) : obj.linePoints;
		const corridorPoints = this.generateSoundLineCorridorWithSemicircles(pts, obj.lineTolerance);
		if (obj.polygon) obj.polygon.setLatLngs(corridorPoints);
	},

	resizeCircle(obj, newRadius) {
		obj.maxDistance = Math.max(CONSTANTS.MIN_RADIUS, Math.round(newRadius));
		obj.originalSize = obj.maxDistance;
		obj.circle.setRadius(obj.maxDistance);

		const center = obj.marker.getLatLng();
		const newLabelPos = Geometry.computeEdgeLatLng(center, obj.maxDistance, 'label');
		obj.labelMarker.setLatLng(newLabelPos);

		if (obj.handle) {
			const newHandlePos = Geometry.computeEdgeLatLng(center, obj.maxDistance);
			obj.handle.setLatLng(newHandlePos);
		}

		return obj.maxDistance;
	},

	updatePolygonLabelPosition(obj) {
		if (obj.vertices && obj.vertices[0] && obj.labelMarker) {
			obj.labelMarker.setLatLng(obj.vertices[0]);
		}
	},

	getBoundingBox(obj) {
		if (obj.shapeType === 'circle' && obj.circle) {
			const center = obj.circle.getLatLng();
			const radius = obj.circle.getRadius();
			const deltaLat = (radius / this.EARTH_RADIUS_M) * (180 / Math.PI);
			const deltaLng = deltaLat / Math.cos(center.lat * Math.PI / 180);
			return {
				minLat: center.lat - deltaLat,
				maxLat: center.lat + deltaLat,
				minLng: center.lng - deltaLng,
				maxLng: center.lng + deltaLng
			};
		} else if (obj.shapeType === 'oval' && obj.ovalCenter) {
			const cosLat = Math.cos(obj.ovalCenter.lat * Math.PI / 180);
			const deltaLat = obj.radiusY / CONSTANTS.METERS_PER_LAT;
			const deltaLng = obj.radiusX / (CONSTANTS.METERS_PER_LNG * cosLat);
			return {
				minLat: obj.ovalCenter.lat - deltaLat,
				maxLat: obj.ovalCenter.lat + deltaLat,
				minLng: obj.ovalCenter.lng - deltaLng,
				maxLng: obj.ovalCenter.lng + deltaLng
			};
		} else if (obj.shapeType === 'line' && obj.linePoints && obj.linePoints.length >= 2) {
			const tLat = (obj.lineTolerance || CONSTANTS.DEFAULT_LINE_TOLERANCE) / CONSTANTS.METERS_PER_LAT;
			const cosLat = Math.cos(obj.linePoints[0].lat * Math.PI / 180);
			const tLng = (obj.lineTolerance || CONSTANTS.DEFAULT_LINE_TOLERANCE) / (CONSTANTS.METERS_PER_LNG * cosLat);
			let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
			obj.linePoints.forEach(p => {
				if (p.lat - tLat < minLat) minLat = p.lat - tLat;
				if (p.lat + tLat > maxLat) maxLat = p.lat + tLat;
				if (p.lng - tLng < minLng) minLng = p.lng - tLng;
				if (p.lng + tLng > maxLng) maxLng = p.lng + tLng;
			});
			return { minLat, maxLat, minLng, maxLng };
		} else if (obj.shapeType === 'polygon' && obj.vertices) {
			let minLat = Infinity, maxLat = -Infinity;
			let minLng = Infinity, maxLng = -Infinity;
			obj.vertices.forEach(p => {
				if (p.lat < minLat) minLat = p.lat;
				if (p.lat > maxLat) maxLat = p.lat;
				if (p.lng < minLng) minLng = p.lng;
				if (p.lng > maxLng) maxLng = p.lng;
			});
			return { minLat, maxLat, minLng, maxLng };
		}
		return null;
	},

	calculateDivisionLine(obj, angleDeg, position = 0.5) {
		const bounds = this.getBoundingBox(obj);
		if (!bounds) return null;

		const centerLat = (bounds.minLat + bounds.maxLat) / 2;
		const centerLng = (bounds.minLng + bounds.maxLng) / 2;

		const halfHeight = (bounds.maxLat - bounds.minLat) / 2;
		const halfWidth = (bounds.maxLng - bounds.minLng) / 2;

		const angleRad = (angleDeg * Math.PI) / 180;
		const perpAngleRad = angleRad + Math.PI / 2;

		const offsetAmount = (position - 0.5) * 2;
		const offsetLat = Math.sin(perpAngleRad) * halfHeight * offsetAmount;
		const offsetLng = Math.cos(perpAngleRad) * halfWidth * offsetAmount;

		const lineCenterLat = centerLat + offsetLat;
		const lineCenterLng = centerLng + offsetLng;

		const lineCenter = L.latLng(lineCenterLat, lineCenterLng);
		const dir = { lat: Math.sin(angleRad), lng: Math.cos(angleRad) };

		return this.clipLineToShape(obj, lineCenter, dir);
	},

	clipLineToShape(obj, lineCenter, dir) {
		const margin = 1.08;

		if (obj.shapeType === 'oval' && obj.ovalCenter) {
			const center = obj.ovalCenter;
			const cosLat = Math.cos(center.lat * Math.PI / 180);
			const aLng = obj.radiusX / (CONSTANTS.METERS_PER_LNG * cosLat);
			const aLat = obj.radiusY / CONSTANTS.METERS_PER_LAT;

			const ox = lineCenter.lng - center.lng;
			const oy = lineCenter.lat - center.lat;
			const a = dir.lng * dir.lng / (aLng * aLng) + dir.lat * dir.lat / (aLat * aLat);
			const b = 2 * (ox * dir.lng / (aLng * aLng) + oy * dir.lat / (aLat * aLat));
			const c = ox * ox / (aLng * aLng) + oy * oy / (aLat * aLat) - 1;

			const discriminant = b * b - 4 * a * c;
			if (discriminant < 0) {
				const extent = Math.max(aLat, aLng) * margin;
				return {
					start: L.latLng(lineCenter.lat - dir.lat * extent, lineCenter.lng - dir.lng * extent),
					end: L.latLng(lineCenter.lat + dir.lat * extent, lineCenter.lng + dir.lng * extent)
				};
			}

			const sqrtD = Math.sqrt(discriminant);
			const t1 = (-b - sqrtD) / (2 * a);
			const t2 = (-b + sqrtD) / (2 * a);

			return {
				start: L.latLng(lineCenter.lat + dir.lat * t1 * margin, lineCenter.lng + dir.lng * t1 * margin),
				end: L.latLng(lineCenter.lat + dir.lat * t2 * margin, lineCenter.lng + dir.lng * t2 * margin)
			};
		}

		if (obj.shapeType === 'circle' && obj.circle) {
			const center = obj.circle.getLatLng();
			const radius = obj.circle.getRadius();
			const radiusLat = (radius / this.EARTH_RADIUS_M) * (180 / Math.PI);
			const radiusLng = radiusLat / Math.cos(center.lat * Math.PI / 180);

			const dx = lineCenter.lng - center.lng;
			const dy = lineCenter.lat - center.lat;
			const a = dir.lng * dir.lng / (radiusLng * radiusLng) + dir.lat * dir.lat / (radiusLat * radiusLat);
			const b = 2 * (dx * dir.lng / (radiusLng * radiusLng) + dy * dir.lat / (radiusLat * radiusLat));
			const c = dx * dx / (radiusLng * radiusLng) + dy * dy / (radiusLat * radiusLat) - 1;

			const discriminant = b * b - 4 * a * c;
			if (discriminant < 0) {
				const extent = Math.max(radiusLat, radiusLng) * margin;
				return {
					start: L.latLng(lineCenter.lat - dir.lat * extent, lineCenter.lng - dir.lng * extent),
					end: L.latLng(lineCenter.lat + dir.lat * extent, lineCenter.lng + dir.lng * extent)
				};
			}

			const sqrtD = Math.sqrt(discriminant);
			const t1 = (-b - sqrtD) / (2 * a);
			const t2 = (-b + sqrtD) / (2 * a);

			return {
				start: L.latLng(lineCenter.lat + dir.lat * t1 * margin, lineCenter.lng + dir.lng * t1 * margin),
				end: L.latLng(lineCenter.lat + dir.lat * t2 * margin, lineCenter.lng + dir.lng * t2 * margin)
			};
		}

		if (obj.shapeType === 'line' && obj.linePoints && obj.linePoints.length >= 2) {
			const pts = obj.smoothing > 0 ? this.smoothPoints(obj.linePoints, obj.smoothing) : obj.linePoints;
			const corridorPoints = this.generateSoundLineCorridorWithSemicircles(pts, obj.lineTolerance);
			const intersections = [];
			const extent = 0.01;

			for (let i = 0; i < corridorPoints.length; i++) {
				const v1 = corridorPoints[i];
				const v2 = corridorPoints[(i + 1) % corridorPoints.length];
				const result = this.lineLineIntersection(
					lineCenter, { lat: lineCenter.lat + dir.lat * extent, lng: lineCenter.lng + dir.lng * extent },
					v1, v2
				);
				if (result) intersections.push(result);
			}

			if (intersections.length >= 2) {
				intersections.sort((a, b) => {
					const tA = dir.lng !== 0 ? (a.lng - lineCenter.lng) / dir.lng : (a.lat - lineCenter.lat) / dir.lat;
					const tB = dir.lng !== 0 ? (b.lng - lineCenter.lng) / dir.lng : (b.lat - lineCenter.lat) / dir.lat;
					return tA - tB;
				});

				const first = intersections[0];
				const last = intersections[intersections.length - 1];
				const midLat = (first.lat + last.lat) / 2;
				const midLng = (first.lng + last.lng) / 2;
				const halfLen = Math.sqrt((last.lat - first.lat) ** 2 + (last.lng - first.lng) ** 2) / 2;

				return {
					start: L.latLng(midLat - dir.lat * halfLen * margin, midLng - dir.lng * halfLen * margin),
					end: L.latLng(midLat + dir.lat * halfLen * margin, midLng + dir.lng * halfLen * margin)
				};
			}
		}

		if (obj.shapeType === 'polygon' && obj.vertices && obj.vertices.length >= 3) {
			const intersections = [];
			const extent = 0.01;

			for (let i = 0; i < obj.vertices.length; i++) {
				const v1 = obj.vertices[i];
				const v2 = obj.vertices[(i + 1) % obj.vertices.length];
				const result = this.lineLineIntersection(
					lineCenter, { lat: lineCenter.lat + dir.lat * extent, lng: lineCenter.lng + dir.lng * extent },
					v1, v2
				);
				if (result) intersections.push(result);
			}

			if (intersections.length >= 2) {
				intersections.sort((a, b) => {
					const tA = dir.lng !== 0 ? (a.lng - lineCenter.lng) / dir.lng : (a.lat - lineCenter.lat) / dir.lat;
					const tB = dir.lng !== 0 ? (b.lng - lineCenter.lng) / dir.lng : (b.lat - lineCenter.lat) / dir.lat;
					return tA - tB;
				});

				const first = intersections[0];
				const last = intersections[intersections.length - 1];
				const midLat = (first.lat + last.lat) / 2;
				const midLng = (first.lng + last.lng) / 2;
				const halfLen = Math.sqrt((last.lat - first.lat) ** 2 + (last.lng - first.lng) ** 2) / 2;

				return {
					start: L.latLng(midLat - dir.lat * halfLen * margin, midLng - dir.lng * halfLen * margin),
					end: L.latLng(midLat + dir.lat * halfLen * margin, midLng + dir.lng * halfLen * margin)
				};
			}
		}

		const bounds = this.getBoundingBox(obj);
		const fallbackExtent = bounds
			? Math.max(bounds.maxLat - bounds.minLat, bounds.maxLng - bounds.minLng) * 1.5
			: 0.001;
		return {
			start: L.latLng(lineCenter.lat - dir.lat * fallbackExtent, lineCenter.lng - dir.lng * fallbackExtent),
			end: L.latLng(lineCenter.lat + dir.lat * fallbackExtent, lineCenter.lng + dir.lng * fallbackExtent)
		};
	},

	lineLineIntersection(p1, p2, p3, p4) {
		const d1 = { lat: p2.lat - p1.lat, lng: p2.lng - p1.lng };
		const d2 = { lat: p4.lat - p3.lat, lng: p4.lng - p3.lng };

		const cross = d1.lng * d2.lat - d1.lat * d2.lng;
		if (Math.abs(cross) < 1e-12) return null;

		const d3 = { lat: p3.lat - p1.lat, lng: p3.lng - p1.lng };
		const u = (d3.lng * d2.lat - d3.lat * d2.lng) / cross;
		const v = (d3.lng * d1.lat - d3.lat * d1.lng) / cross;

		if (v >= 0 && v <= 1) {
			return L.latLng(p1.lat + u * d1.lat, p1.lng + u * d1.lng);
		}
		return null;
	},

	calculatePrincipalAxis(obj, position = 0.5) {
		const offsetAmount = (position - 0.5) * 2;

		if (obj.shapeType === 'circle' && obj.circle) {
			const center = obj.circle.getLatLng();
			const radius = obj.circle.getRadius();
			const deltaLat = (radius / this.EARTH_RADIUS_M) * (180 / Math.PI);
			const shiftedLat = center.lat + offsetAmount * deltaLat;
			const lineCenter = L.latLng(shiftedLat, center.lng);
			const dir = { lat: 0, lng: 1 };
			return this.clipLineToShape(obj, lineCenter, dir);
		}

		if (obj.shapeType === 'oval' && obj.ovalCenter) {
			const center = obj.ovalCenter;
			const deltaLat = obj.radiusY / CONSTANTS.METERS_PER_LAT;
			const shiftedLat = center.lat + offsetAmount * deltaLat;
			const lineCenter = L.latLng(shiftedLat, center.lng);
			const dir = { lat: 0, lng: 1 };
			return this.clipLineToShape(obj, lineCenter, dir);
		}

		if (!obj.vertices || obj.vertices.length < 3) return null;

		const centroid = this.calculateCentroid(obj.vertices);
		let maxDist = 0;
		let farthestVertex = null;

		obj.vertices.forEach(v => {
			const d = this.calculateDistanceMeters(centroid, v);
			if (d > maxDist) {
				maxDist = d;
				farthestVertex = v;
			}
		});

		if (!farthestVertex) return null;

		const dx = farthestVertex.lng - centroid.lng;
		const dy = farthestVertex.lat - centroid.lat;
		const len = Math.sqrt(dx * dx + dy * dy);
		const perpDir = { lat: -dx / len, lng: dy / len };

		const offsetLat = offsetAmount * dy;
		const offsetLng = offsetAmount * dx;

		const shiftedCentroid = L.latLng(centroid.lat - offsetLng, centroid.lng + offsetLat);

		return this.clipLineToShape(obj, shiftedCentroid, perpDir);
	},

	getDistanceToLine(point, lineStart, lineEnd) {
		const A = point.lat - lineStart.lat;
		const B = point.lng - lineStart.lng;
		const C = lineEnd.lat - lineStart.lat;
		const D = lineEnd.lng - lineStart.lng;

		const dot = A * C + B * D;
		const lenSq = C * C + D * D;
		let param = lenSq !== 0 ? dot / lenSq : -1;

		let closestLat, closestLng;
		if (param < 0) {
			closestLat = lineStart.lat;
			closestLng = lineStart.lng;
		} else if (param > 1) {
			closestLat = lineEnd.lat;
			closestLng = lineEnd.lng;
		} else {
			closestLat = lineStart.lat + param * C;
			closestLng = lineStart.lng + param * D;
		}

		return _map ? _map.distance(point, L.latLng(closestLat, closestLng)) : this.calculateDistanceMeters(point, { lat: closestLat, lng: closestLng });
	},

	getClosestPointOnLine(point, lineStart, lineEnd) {
		const A = point.lat - lineStart.lat;
		const B = point.lng - lineStart.lng;
		const C = lineEnd.lat - lineStart.lat;
		const D = lineEnd.lng - lineStart.lng;

		const dot = A * C + B * D;
		const lenSq = C * C + D * D;
		const param = lenSq !== 0 ? dot / lenSq : 0;

		return L.latLng(
			lineStart.lat + param * C,
			lineStart.lng + param * D
		);
	},

	getRaycastMaxDistance(obj, line, userPos) {
		if (!line) return 1;

		const closestOnLine = this.getClosestPointOnLine(userPos, line.start, line.end);
		const dx = userPos.lng - closestOnLine.lng;
		const dy = userPos.lat - closestOnLine.lat;
		const len = Math.sqrt(dx * dx + dy * dy);

		if (len < 1e-10) return 1;

		const rayDir = { lat: dy / len, lng: dx / len };

		if (obj.shapeType === 'circle' && obj.circle) {
			const center = obj.circle.getLatLng();
			const radius = obj.circle.getRadius();
			const radiusLat = (radius / this.EARTH_RADIUS_M) * (180 / Math.PI);
			const radiusLng = radiusLat / Math.cos(center.lat * Math.PI / 180);

			const ox = closestOnLine.lng - center.lng;
			const oy = closestOnLine.lat - center.lat;
			const a = rayDir.lng * rayDir.lng / (radiusLng * radiusLng) + rayDir.lat * rayDir.lat / (radiusLat * radiusLat);
			const b = 2 * (ox * rayDir.lng / (radiusLng * radiusLng) + oy * rayDir.lat / (radiusLat * radiusLat));
			const c = ox * ox / (radiusLng * radiusLng) + oy * oy / (radiusLat * radiusLat) - 1;

			const discriminant = b * b - 4 * a * c;
			if (discriminant < 0) return 1;

			const sqrtD = Math.sqrt(discriminant);
			const t = (-b + sqrtD) / (2 * a);

			if (t > 0) {
				const intersection = L.latLng(closestOnLine.lat + rayDir.lat * t, closestOnLine.lng + rayDir.lng * t);
				return _map ? _map.distance(closestOnLine, intersection) : this.calculateDistanceMeters(closestOnLine, intersection);
			}
		} else if (obj.shapeType === 'oval' && obj.ovalCenter) {
			const center = obj.ovalCenter;
			const cosLat = Math.cos(center.lat * Math.PI / 180);
			const aLng = obj.radiusX / (CONSTANTS.METERS_PER_LNG * cosLat);
			const aLat = obj.radiusY / CONSTANTS.METERS_PER_LAT;

			const ox = closestOnLine.lng - center.lng;
			const oy = closestOnLine.lat - center.lat;
			const a = rayDir.lng * rayDir.lng / (aLng * aLng) + rayDir.lat * rayDir.lat / (aLat * aLat);
			const b = 2 * (ox * rayDir.lng / (aLng * aLng) + oy * rayDir.lat / (aLat * aLat));
			const c = ox * ox / (aLng * aLng) + oy * oy / (aLat * aLat) - 1;

			const discriminant = b * b - 4 * a * c;
			if (discriminant < 0) return 1;

			const sqrtD = Math.sqrt(discriminant);
			const t = (-b + sqrtD) / (2 * a);

			if (t > 0) {
				const intersection = L.latLng(closestOnLine.lat + rayDir.lat * t, closestOnLine.lng + rayDir.lng * t);
				return _map ? _map.distance(closestOnLine, intersection) : this.calculateDistanceMeters(closestOnLine, intersection);
			}
		} else if (obj.vertices && obj.vertices.length >= 3) {
			let nearestDist = Infinity;

			for (let i = 0; i < obj.vertices.length; i++) {
				const start = obj.vertices[i];
				const end = obj.vertices[(i + 1) % obj.vertices.length];
				const intersection = this.raySegmentIntersection(closestOnLine, rayDir, start, end);
				if (intersection) {
					const dist = _map ? _map.distance(closestOnLine, intersection) : this.calculateDistanceMeters(closestOnLine, intersection);
					if (dist < nearestDist) nearestDist = dist;
				}
			}

			if (nearestDist < Infinity) return nearestDist;
		}

		return 1;
	},

	getDivisionVolume(userPos, obj) {
		const isCenterline = obj.volumeOrigin === 'centerline';
		const angleDeg = obj.divisionAngle !== undefined ? obj.divisionAngle : 0;
		const position = obj.divisionPosition !== undefined ? obj.divisionPosition : 0.5;

		if (isCenterline && obj.shapeType === 'line' && obj.linePoints) {
			let minDist = Infinity;
			for (let i = 0; i < obj.linePoints.length - 1; i++) {
				const d = this.getDistanceToLine(userPos, obj.linePoints[i], obj.linePoints[i + 1]);
				if (d < minDist) minDist = d;
			}
			const norm = Math.min(minDist / Math.max(obj.lineTolerance, 1), 1);
			const curveStrength = obj.params?.curveStrength !== undefined ? obj.params.curveStrength : 1;
			const curveVal = (1 - norm) ** 2;
			return (1 - curveStrength) * 1 + curveStrength * curveVal;
		}

		const line = isCenterline
			? this.calculatePrincipalAxis(obj, position)
			: this.calculateDivisionLine(obj, angleDeg, position);

		if (!line) return 1;

		const distToLine = this.getDistanceToLine(userPos, line.start, line.end);
		const maxDist = this.getRaycastMaxDistance(obj, line, userPos);
		const norm = distToLine / Math.max(maxDist, 1);
		const curveStrength = obj.params?.curveStrength !== undefined ? obj.params.curveStrength : 1;
		const curveVal = (1 - Math.min(norm, 1)) ** 2;

		return (1 - curveStrength) * 1 + curveStrength * curveVal;
	},

	updateDivisionLineVisual(obj, map) {
		const volumeOrigin = obj.volumeOrigin || 'icon';

		if (volumeOrigin === 'icon') {
			this.removeDivisionLineVisual(obj, map);
			return;
		}

		if (volumeOrigin === 'centerline' && obj.shapeType === 'line' && obj.linePoints) {
			const pts = obj.smoothing > 0 ? this.smoothPoints(obj.linePoints, obj.smoothing) : obj.linePoints;
			if (obj._divisionLine) {
				obj._divisionLine.setLatLngs(pts);
			} else {
				obj._divisionLine = L.polyline(pts, {
					color: obj.color || '#666',
					weight: 2,
					opacity: 0.6,
					dashArray: '6, 4',
					pane: 'soundArea'
				}).addTo(map);
			}
			return;
		}

		const isCenterline = volumeOrigin === 'centerline';
		const angleDeg = obj.divisionAngle !== undefined ? obj.divisionAngle : 0;
		const position = obj.divisionPosition !== undefined ? obj.divisionPosition : 0.5;

		let line = isCenterline
			? this.calculatePrincipalAxis(obj, position)
			: this.calculateDivisionLine(obj, angleDeg, position);

		if (!line) {
			this.removeDivisionLineVisual(obj, map);
			return;
		}

		// Ensure minimum line length (30% of shape size) at extreme positions
		const bounds = this.getBoundingBox(obj);
		if (bounds) {
			const shapeSize = Math.max(bounds.maxLat - bounds.minLat, bounds.maxLng - bounds.minLng);
			const minLength = shapeSize * 0.30;
			const dx = line.end.lng - line.start.lng;
			const dy = line.end.lat - line.start.lat;
			const currentLength = Math.sqrt(dx * dx + dy * dy);

			if (currentLength < minLength && currentLength > 0) {
				const midLat = (line.start.lat + line.end.lat) / 2;
				const midLng = (line.start.lng + line.end.lng) / 2;
				const dirLat = dy / currentLength;
				const dirLng = dx / currentLength;
				line = {
					start: L.latLng(midLat - dirLat * minLength / 2, midLng - dirLng * minLength / 2),
					end: L.latLng(midLat + dirLat * minLength / 2, midLng + dirLng * minLength / 2)
				};
			}
		}

		const lineCoords = [line.start, line.end];

		if (obj._divisionLine) {
			obj._divisionLine.setLatLngs(lineCoords);
		} else {
			obj._divisionLine = L.polyline(lineCoords, {
				color: obj.color || '#666',
				weight: 2,
				opacity: 0.6,
				dashArray: '6, 4',
				pane: 'soundArea'
			}).addTo(map);
		}
	},

	removeDivisionLineVisual(obj, map) {
		if (obj._divisionLine) {
			map.removeLayer(obj._divisionLine);
			obj._divisionLine = null;
		}
	}
};
