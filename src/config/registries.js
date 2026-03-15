import { CONSTANTS } from '../core/constants.js';
import { Geometry } from '../core/geospatial/Geometry.js';

let context = null;

export function setRegistriesContext(appContext) {
	context = appContext;
}

function calculateCentroid(points) {
	if (!points || points.length === 0) return null;
	let lat = 0, lng = 0;
	points.forEach(p => {
		lat += p.lat;
		lng += p.lng;
	});
	return L.latLng(lat / points.length, lng / points.length);
}

function generateLineCorridorWithSemicircles(points, tolerance) {
	if (!points || points.length < 2) return [];

	const numSemicircleSegments = CONSTANTS.LINE_SEMICIRCLE_SEGMENTS;
	const outerPoints = getOffsetPolyline(points, tolerance);
	const innerPoints = getOffsetPolyline(points, -tolerance).reverse();

	const startSemicircle = generateSemicirclePoints(
		points[0], points[0], points[1], tolerance, numSemicircleSegments, 'start'
	);

	const endSemicircle = generateSemicirclePoints(
		points[points.length - 1], points[points.length - 2], points[points.length - 1],
		tolerance, numSemicircleSegments, 'end'
	);

	return [...outerPoints, ...endSemicircle, ...innerPoints, ...startSemicircle];
}

function getOffsetPolyline(points, offset) {
	return Geometry.getOffsetPolyline(points, offset);
}

function generateSemicirclePoints(center, prevPoint, nextPoint, radius, segments, position) {
	const points = [];
	const cosLat = Math.cos(center.lat * Math.PI / 180);

	let dx, dy;
	if (position === 'start') {
		dx = nextPoint.lng - center.lng;
		dy = nextPoint.lat - center.lat;
	} else {
		dx = center.lng - prevPoint.lng;
		dy = center.lat - prevPoint.lat;
	}

	const lineAngle = Math.atan2(dy, dx);
	const startAngle = position === 'start' ? lineAngle + Math.PI / 2 : lineAngle - Math.PI / 2;
	const direction = 1;

	for (let i = 0; i <= segments; i++) {
		const angle = startAngle + direction * (Math.PI * i / segments);
		const offsetLat = (radius / CONSTANTS.METERS_PER_LAT) * Math.sin(angle);
		const offsetLng = (radius / (CONSTANTS.METERS_PER_LNG * cosLat)) * Math.cos(angle);
		points.push(L.latLng(center.lat + offsetLat, center.lng + offsetLng));
	}

	return points;
}

export const FXParamSets = {
	modulation: ['fx_frequency', 'fx_depth'],
	filter: ['fx_baseFrequency', 'fx_octaves'],
	delay: ['fx_delayTime_long', 'fx_feedback']
};

export const CATEGORY_REGISTRY = {
	oscillator: { label: 'Oscillator', icon: 'fa-wave-square', order: 1 },
	envelope: { label: 'Envelope', icon: 'fa-chart-line', order: 2 },
	filter: { label: 'Filter', icon: 'fa-filter', order: 3 },
	modulation: { label: 'Modulation', icon: 'fa-random', order: 4 },
	playback: { label: 'Playback', icon: 'fa-play', order: 5 },
	motion: { label: 'Motion', icon: 'fa-walking', order: 6 },
	lfo: { label: "LFO", icon: "fa-wave-sine", order: 7 },
	effects: { label: "Effects", icon: "fa-sliders-h", order: 8 },
	stream: { label: 'Stream', icon: 'fa-broadcast-tower', order: 9 },
	common: { label: 'Common', icon: 'fa-cog', order: 10 },
	spatial: { label: "Spatial", icon: "fa-expand-arrows-alt", order: 11 },
	keyboard: { label: "Keyboard", icon: "fa-keyboard", order: 12 },
	sampler: { label: "Sampler", icon: "fa-drum", order: 13 },
	layer: { label: "Layer", icon: "fa-layer-group", order: 14 }
};

export const tileLayers = {
	'OpenStreetMap': {
		url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
	},
	'Dark': {
		url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
	},
	'Dark No Labels': {
		url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
	},
	'Light': {
		url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
	},
	'Light No Labels': {
		url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
	},
	'Satellite': {
		url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
		attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
	},
	'Paper Map': {
		url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
		attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
	}
};

export const SHAPE_REGISTRY = {
	circle: {
		label: 'Circle',
		requiresCenter: true,
		requiresRadius: true,

		serialize(obj, isRelative = false, anchor = null) {
			const data = { radius: obj.maxDistance };
			if (obj.originalSize) data.originalSize = obj.originalSize;
			return data;
		},

		deserialize(data, isRelative = false, anchor = null) {
			const result = { maxDistance: data.radius || data.maxDistance };
			if (data.originalSize !== undefined) result.originalSize = data.originalSize;
			return result;
		},

		createElements(obj, center, radius) {
			const circle = L.circle(center, {
				radius: radius,
				color: obj.color,
				fill: true,
				fillColor: obj.color,
				fillOpacity: 0.03,
				weight: 4,
				opacity: 1.0,
				bubblingMouseEvents: true,
				pane: 'soundArea'
			});

			const handleIcon = L.divIcon({
				className: 'sound-handle',
				html: '<div class="handle-inner"></div>',
				iconSize: [20, 20],
				iconAnchor: [10, 10]
			});

			const handlePos = L.latLng(
				center.lat + (radius / CONSTANTS.METERS_PER_LAT),
				center.lng
			);

			const handle = L.marker(handlePos, {
				icon: handleIcon,
				draggable: true,
				pane: 'soundElement'
			});

			return { circle, handle };
		},

		updatePosition(obj, newPos) {
			if (obj.circle) obj.circle.setLatLng(newPos);
			if (obj.handle && obj.maxDistance) {
				const handlePos = L.latLng(
					newPos.lat + (obj.maxDistance / CONSTANTS.METERS_PER_LAT),
					newPos.lng
				);
				obj.handle.setLatLng(handlePos);
			}
		}
	},

	oval: {
		label: 'Oval',
		requiresCenter: true,
		requiresRadius: true,
		requiresRadiusY: true,

		serialize(obj, isRelative = false, anchor = null) {
			const data = {
				radiusX: obj.radiusX,
				radiusY: obj.radiusY
			};

			if (isRelative && anchor && context.CoordinateTransform) {
				const offset = context.CoordinateTransform.toOffset(obj.ovalCenter.lat, obj.ovalCenter.lng, anchor);
				data.centerOffset = { offsetX: offset.offsetX, offsetY: offset.offsetY };
			} else {
				data.center = { lat: obj.ovalCenter.lat, lng: obj.ovalCenter.lng };
			}

			return data;
		},

		deserialize(data, isRelative = false, anchor = null) {
			let ovalCenter;

			if (isRelative && anchor && data.centerOffset && context.CoordinateTransform) {
				const coord = context.CoordinateTransform.fromOffset(data.centerOffset.offsetX, data.centerOffset.offsetY, anchor);
				ovalCenter = L.latLng(coord.lat, coord.lng);
			} else if (data.center) {
				ovalCenter = L.latLng(data.center.lat, data.center.lng);
			}

			return {
				radiusX: data.radiusX || CONSTANTS.DEFAULT_CIRCLE_RADIUS,
				radiusY: data.radiusY || CONSTANTS.DEFAULT_OVAL_RADIUS_Y,
				ovalCenter
			};
		},

		createElements(obj, center, radiusX, radiusY) {
			const cosLat = Math.cos(center.lat * Math.PI / 180);
			const points = [];
			const numPoints = CONSTANTS.OVAL_RESOLUTION;

			for (let i = 0; i < numPoints; i++) {
				const angle = (i / numPoints) * 2 * Math.PI;
				const dx = radiusX * Math.cos(angle);
				const dy = radiusY * Math.sin(angle);
				const lat = center.lat + (dy / CONSTANTS.METERS_PER_LAT);
				const lng = center.lng + (dx / (CONSTANTS.METERS_PER_LNG * cosLat));
				points.push(L.latLng(lat, lng));
			}

			const polygon = L.polygon(points, {
				color: obj.color,
				fill: true,
				fillColor: obj.color,
				fillOpacity: 0.03,
				weight: 4,
				opacity: 1.0,
				bubblingMouseEvents: true,
				pane: 'soundArea'
			});

			const handleIcon = L.divIcon({
				className: 'sound-handle',
				html: '<div class="handle-inner"></div>',
				iconSize: [20, 20],
				iconAnchor: [10, 10]
			});

			const xHandlePos = L.latLng(center.lat, center.lng + (radiusX / (CONSTANTS.METERS_PER_LNG * cosLat)));
			const xHandle = L.marker(xHandlePos, {
				icon: handleIcon,
				draggable: true,
				pane: 'soundElement'
			});

			const yHandlePos = L.latLng(center.lat + (radiusY / CONSTANTS.METERS_PER_LAT), center.lng);
			const yHandle = L.marker(yHandlePos, {
				icon: handleIcon,
				draggable: true,
				pane: 'soundElement'
			});

			return { polygon, xHandle, yHandle };
		},

		updatePosition(obj, newPos) {
			if (!obj.ovalCenter) return;

			const deltaLat = newPos.lat - obj.ovalCenter.lat;
			const deltaLng = newPos.lng - obj.ovalCenter.lng;
			obj.ovalCenter = newPos;

			const cosLat = Math.cos(newPos.lat * Math.PI / 180);
			const points = [];
			const numPoints = CONSTANTS.OVAL_RESOLUTION;

			for (let i = 0; i < numPoints; i++) {
				const angle = (i / numPoints) * 2 * Math.PI;
				const dx = obj.radiusX * Math.cos(angle);
				const dy = obj.radiusY * Math.sin(angle);
				const lat = newPos.lat + (dy / CONSTANTS.METERS_PER_LAT);
				const lng = newPos.lng + (dx / (CONSTANTS.METERS_PER_LNG * cosLat));
				points.push(L.latLng(lat, lng));
			}

			if (obj.polygon) obj.polygon.setLatLngs(points);

			if (obj.xHandle) {
				const xHandlePos = L.latLng(newPos.lat, newPos.lng + (obj.radiusX / (CONSTANTS.METERS_PER_LNG * cosLat)));
				obj.xHandle.setLatLng(xHandlePos);
			}

			if (obj.yHandle) {
				const yHandlePos = L.latLng(newPos.lat + (obj.radiusY / CONSTANTS.METERS_PER_LAT), newPos.lng);
				obj.yHandle.setLatLng(yHandlePos);
			}
		}
	},

	polygon: {
		label: 'Polygon',
		requiresPoints: true,

		serialize(obj, isRelative = false, anchor = null) {
			const data = {};

			if (!obj.vertices || !Array.isArray(obj.vertices) || obj.vertices.length === 0) {
				console.warn('Polygon sound has no vertices during serialization:', obj.label || 'unknown', obj);
				data.vertices = [];
				return data;
			}

			if (isRelative && anchor && obj.userLat !== undefined && obj.userLng !== undefined) {
				if (context.CoordinateTransform) {
					data.vertices = obj.vertices.map(v => {
						const offset = context.CoordinateTransform.toOffset(v.lat, v.lng, anchor);
						return { offsetX: offset.offsetX, offsetY: offset.offsetY };
					});
				} else {
					data.vertices = obj.vertices;
				}
			} else {
				data.vertices = obj.vertices.map(v => ({ lat: v.lat, lng: v.lng }));
			}

			return data;
		},

		deserialize(data, isRelative = false, anchor = null) {
			let vertices = [];

			// Check for vertexOffsets (relative positioning format)
			const offsetVertices = data.vertexOffsets || data.vertices;

			if (isRelative && anchor && offsetVertices && offsetVertices[0]?.offsetX !== undefined) {
				if (context.CoordinateTransform) {
					vertices = offsetVertices.map(v => {
						const coord = context.CoordinateTransform.fromOffset(v.offsetX, v.offsetY, anchor);
						return L.latLng(coord.lat, coord.lng);
					});
				}
			} else if (data.vertices && Array.isArray(data.vertices)) {
				vertices = data.vertices.map(v => {
					if (v && v.lat !== undefined && v.lng !== undefined) {
						return L.latLng(v.lat, v.lng);
					}
					return null;
				}).filter(v => v !== null);
			}

			return { vertices };
		},

		createElements(obj, points) {
			return {};
		},

		updatePosition(obj, newPos) {
			if (obj.polygon && obj.vertices) {
				const deltaLat = newPos.lat - obj.userLat;
				const deltaLng = newPos.lng - obj.userLng;

				obj.vertices = obj.vertices.map(v => ({
					lat: v.lat + deltaLat,
					lng: v.lng + deltaLng
				}));

				obj.polygon.setLatLngs(obj.vertices);

				if (obj.vertexMarkers) {
					obj.vertexMarkers.forEach((marker, i) => {
						marker.setLatLng(obj.vertices[i]);
					});
				}
			}
		}
	},

	line: {
		label: 'Line',
		requiresPoints: true,

		serialize(obj, isRelative = false, anchor = null) {
			const data = {
				tolerance: obj.lineTolerance || CONSTANTS.DEFAULT_LINE_TOLERANCE,
				smoothing: obj.smoothing || 0
			};

			if (!obj.linePoints || !Array.isArray(obj.linePoints) || obj.linePoints.length === 0) {
				data.linePoints = [];
				return data;
			}

			if (isRelative && anchor && context.CoordinateTransform) {
				data.linePoints = obj.linePoints.map(p => {
					const offset = context.CoordinateTransform.toOffset(p.lat, p.lng, anchor);
					return { offsetX: offset.offsetX, offsetY: offset.offsetY };
				});
			} else {
				data.linePoints = obj.linePoints.map(p => ({ lat: p.lat, lng: p.lng }));
			}

			return data;
		},

		deserialize(data, isRelative = false, anchor = null) {
			let linePoints = [];

			const pointsData = data.linePoints || [];

			if (isRelative && anchor && pointsData.length > 0 && pointsData[0]?.offsetX !== undefined) {
				if (context.CoordinateTransform) {
					linePoints = pointsData.map(p => {
						const coord = context.CoordinateTransform.fromOffset(p.offsetX, p.offsetY, anchor);
						return L.latLng(coord.lat, coord.lng);
					});
				}
			} else if (pointsData.length > 0) {
				linePoints = pointsData.map(p => {
					if (p && p.lat !== undefined && p.lng !== undefined) {
						return L.latLng(p.lat, p.lng);
					}
					return null;
				}).filter(p => p !== null);
			}

			return {
				linePoints,
				lineTolerance: data.tolerance || CONSTANTS.DEFAULT_LINE_TOLERANCE,
				smoothing: data.smoothing || 0
			};
		},

		createElements(obj, points, tolerance) {
			const corridorPoints = generateLineCorridorWithSemicircles(points, tolerance);

			const polygon = L.polygon(corridorPoints, {
				color: obj.color,
				fill: true,
				fillColor: obj.color,
				fillOpacity: 0.03,
				weight: 4,
				opacity: 1.0,
				bubblingMouseEvents: true,
				pane: 'soundArea'
			});

			return { polygon };
		},

		updatePosition(obj, newPos) {
			if (!obj.linePoints || obj.linePoints.length === 0) return;

			const centroid = calculateCentroid(obj.linePoints);
			const deltaLat = newPos.lat - centroid.lat;
			const deltaLng = newPos.lng - centroid.lng;

			obj.linePoints = obj.linePoints.map(p =>
				L.latLng(p.lat + deltaLat, p.lng + deltaLng)
			);

			const corridorPoints = generateLineCorridorWithSemicircles(obj.linePoints, obj.lineTolerance);
			if (obj.polygon) obj.polygon.setLatLngs(corridorPoints);

			if (obj.linePointMarkers && obj.linePointMarkers.length > 0) {
				obj.linePointMarkers.forEach((marker, i) => {
					marker.setLatLng(obj.linePoints[i]);
				});
			}
		}
	}
};
