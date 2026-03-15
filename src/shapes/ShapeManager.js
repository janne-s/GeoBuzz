import { CONSTANTS } from '../core/constants.js';
import { AppState } from '../core/state/StateManager.js';
import { Selectors } from '../core/state/selectors.js';
import { Geometry } from '../core/geospatial/Geometry.js';
import { CoordinateTransform } from '../core/utils/coordinates.js';
import { SHAPE_REGISTRY } from '../config/registries.js';
import { isTouchDevice } from '../core/utils/typeChecks.js';

let context = null;

export function setShapeManagerContext(appContext) {
	context = appContext;
}

export class ShapeManager {
	static createShapeElements(obj, shapeType, center, radius) {
		const shape = SHAPE_REGISTRY[shapeType];
		if (!shape) return null;

		const elements = shape.createElements(obj, center, radius);
		this.attachToMap(elements);
		this.setupInteractions(obj, elements);

		return elements;
	}

	static updateShapePosition(obj, newPos) {
		const shape = SHAPE_REGISTRY[obj.shapeType];
		if (!shape) return;

		shape.updatePosition(obj, newPos);
	}

	static serializeShape(obj, isRelative = false, anchor = null) {
		const shape = SHAPE_REGISTRY[obj.shapeType];
		return shape ? shape.serialize(obj, isRelative, anchor) : {};
	}

	static deserializeShape(data, shapeType, isRelative = false, anchor = null) {
		const shape = SHAPE_REGISTRY[shapeType];
		return shape ? shape.deserialize(data, isRelative, anchor) : {};
	}

	static attachToMap(elements) {
		Object.values(elements).forEach(element => {
			if (Array.isArray(element)) {
				element.forEach(el => el && el.addTo && el.addTo(context.map));
			} else if (element && element.addTo) {
				element.addTo(context.map);
			}
		});
	}

	static setupInteractions(obj, elements) {
		if (obj.shapeType === 'circle' && elements.handle) {
			context.DragHandlers.attachCircleHandlers(obj);
		} else if (obj.shapeType === 'polygon' && elements.vertexMarkers) {
			elements.vertexMarkers.forEach((marker, index) => {
				context.DragHandlers.attachVertexHandlers(obj, marker, index);
			});
		} else if (obj.shapeType === 'line' && obj.linePointMarkers) {
			obj.linePointMarkers.forEach((marker, index) => {
				context.DragHandlers.attachLinePointHandlers(obj, marker, index);
			});
		} else if (obj.shapeType === 'oval' && (elements.xHandle || elements.yHandle)) {
			context.DragHandlers.attachOvalHandlers(obj);
		}
	}

	static convertToPolygon(obj) {
		const center = obj.marker.getLatLng();
		let size;

		if (obj._originalMaxDistance) {
			size = obj._originalMaxDistance;
		} else if (obj.shapeType === 'circle') {
			size = obj.maxDistance || CONSTANTS.DEFAULT_CIRCLE_RADIUS;
			obj._originalMaxDistance = size;
		} else if (obj.shapeType === 'oval') {
			size = (obj.radiusX + obj.radiusY) / 2;
		} else if (obj.shapeType === 'line' && obj.linePoints) {
			size = Geometry.calculateAverageRadius(obj.linePoints, center);
		} else {
			size = CONSTANTS.DEFAULT_POLYGON_SIZE;
		}

		this.removeAllShapeElements(obj);

		const vertices = Geometry.createDefaultSquare(center, size);

		obj.vertices = vertices;
		obj.shapeType = 'polygon';
		obj.polygon = L.polygon(vertices, {
			color: obj.color,
			fill: true,
			fillColor: obj.color,
			fillOpacity: CONSTANTS.SOUND_AREA_FILL_OPACITY,
			weight: 4,
			opacity: 1.0,
			bubblingMouseEvents: true,
			pane: 'soundArea'
		}).addTo(context.map);

		this.createVertexMarkers(obj);
		this.setupPolygonHoverEffects(obj);

		if (obj.labelMarker && vertices[0]) {
			obj.labelMarker.setLatLng(vertices[0]);
		}

		obj._originalMarkerPos = center;
		obj.userLat = center.lat;
		obj.userLng = center.lng;
		delete obj.originalVertices;
	}

	static convertToCircle(obj) {
		const center = obj.marker.getLatLng();
		let radius;

		if (obj._originalMaxDistance) {
			radius = obj._originalMaxDistance;
		} else if (obj.shapeType === 'polygon' && obj.vertices) {
			radius = Geometry.calculateAverageRadius(obj.vertices, center);
		} else if (obj.shapeType === 'oval') {
			radius = (obj.radiusX + obj.radiusY) / 2;
		} else if (obj.shapeType === 'line' && obj.linePoints) {
			radius = Geometry.calculateAverageRadius(obj.linePoints, center);
		} else {
			radius = CONSTANTS.DEFAULT_CIRCLE_RADIUS;
		}

		this.removeAllShapeElements(obj);

		const { circle, handle } = Geometry.createCircleElements(center, radius, obj.color);
		obj.circle = circle.addTo(context.map);
		obj.handle = handle.addTo(context.map);
		obj.maxDistance = radius;
		obj.originalSize = radius;
		obj.shapeType = 'circle';

		context.DragHandlers.attachCircleHandlers(obj);

		if (obj.labelMarker) {
			const newLabelPos = Geometry.computeEdgeLatLng(center, radius, 'label');
			obj.labelMarker.setLatLng(newLabelPos);
		}
	}

	static convertToLine(obj) {
		const center = obj.marker.getLatLng();
		let size;

		if (obj._originalMaxDistance) {
			size = obj._originalMaxDistance;
		} else if (obj.shapeType === 'circle') {
			size = obj.maxDistance || CONSTANTS.DEFAULT_CIRCLE_RADIUS;
		} else if (obj.shapeType === 'polygon' && obj.vertices) {
			size = Geometry.calculateAverageRadius(obj.vertices, center);
		} else if (obj.shapeType === 'oval') {
			size = obj.radiusX || CONSTANTS.DEFAULT_CIRCLE_RADIUS;
		} else {
			size = CONSTANTS.DEFAULT_CIRCLE_RADIUS;
		}

		this.removeAllShapeElements(obj);

		const cosLat = Math.cos(center.lat * Math.PI / 180);
		const offsetLng = size / (CONSTANTS.METERS_PER_LNG * cosLat);

		obj.linePoints = [
			L.latLng(center.lat, center.lng - offsetLng),
			L.latLng(center.lat, center.lng + offsetLng)
		];
		obj.lineTolerance = CONSTANTS.DEFAULT_LINE_TOLERANCE;
		obj.smoothing = obj.smoothing || 0;
		obj.shapeType = 'line';

		const { polygon } = Geometry.createLineElements(obj.linePoints, obj.lineTolerance, obj.color, obj.smoothing);
		obj.polygon = polygon.addTo(context.map);

		this.createLinePointMarkers(obj);
		this.setupLineClickEffects(obj);

		if (obj.labelMarker) {
			obj.labelMarker.setLatLng(obj.linePoints[0]);
		}

		obj.userLat = center.lat;
		obj.userLng = center.lng;
	}

	static convertToOval(obj) {
		const center = obj.marker.getLatLng();
		let radiusX, radiusY;

		if (obj.shapeType === 'circle') {
			radiusX = obj.maxDistance || CONSTANTS.DEFAULT_CIRCLE_RADIUS;
			radiusY = radiusX * CONSTANTS.DEFAULT_OVAL_ASPECT_RATIO;
		} else if (obj.shapeType === 'polygon' && obj.vertices) {
			radiusX = Geometry.calculateAverageRadius(obj.vertices, center);
			radiusY = radiusX * CONSTANTS.DEFAULT_OVAL_ASPECT_RATIO;
		} else if (obj.shapeType === 'line' && obj.linePoints) {
			radiusX = Geometry.calculateAverageRadius(obj.linePoints, center);
			radiusY = radiusX * CONSTANTS.DEFAULT_OVAL_ASPECT_RATIO;
		} else {
			radiusX = CONSTANTS.DEFAULT_CIRCLE_RADIUS;
			radiusY = CONSTANTS.DEFAULT_OVAL_RADIUS_Y;
		}

		this.removeAllShapeElements(obj);

		obj.ovalCenter = center;
		obj.radiusX = radiusX;
		obj.radiusY = radiusY;
		obj.shapeType = 'oval';

		const { polygon, xHandle, yHandle } = SHAPE_REGISTRY.oval.createElements(obj, center, radiusX, radiusY);
		obj.polygon = polygon.addTo(context.map);
		obj.xHandle = xHandle.addTo(context.map);
		obj.yHandle = yHandle.addTo(context.map);

		context.DragHandlers.attachOvalHandlers(obj);

		if (obj.labelMarker) {
			const labelPos = L.latLng(center.lat + (radiusY / CONSTANTS.METERS_PER_LAT), center.lng);
			obj.labelMarker.setLatLng(labelPos);
		}

		obj.userLat = center.lat;
		obj.userLng = center.lng;
	}

	static createVertexMarkers(obj) {
		if (obj.vertexMarkers) {
			obj.vertexMarkers.forEach(marker => context.map.removeLayer(marker));
		}

		obj.vertexMarkers = [];

		obj.vertices.forEach((vertex, index) => {
			const marker = L.marker(vertex, {
				icon: context.ElementFactory.vertexIcon(),
				draggable: true,
				pane: 'soundElement'
			});
			context.DragHandlers.attachVertexHandlers(obj, marker, index);
			obj.vertexMarkers.push(marker.addTo(context.map));
		});
	}

	static setupPolygonHoverEffects(obj) {
		if (!obj.polygon) return;

		obj.polygon.on('click', (e) => {
			L.DomEvent.stopPropagation(e);

			if (Selectors.getSelectionMode() === 'click') {
				context.SelectionController?.toggleElement(obj.id, 'sound');
				return;
			}

			const clickPoint = e.latlng;
			let bestSegment = 0;
			let minDist = Infinity;

			for (let i = 0; i < obj.vertices.length; i++) {
				const start = obj.vertices[i];
				const end = obj.vertices[(i + 1) % obj.vertices.length];

				const closestPoint = Geometry.getClosestPointOnLineSegment(clickPoint, start, end);
				const dist = context.map.distance(clickPoint, closestPoint);

				if (dist < minDist) {
					minDist = dist;
					bestSegment = i;
				}
			}

			const threshold = isTouchDevice() ? CONSTANTS.POLYGON_VERTEX_CLICK_THRESHOLD_TOUCH : CONSTANTS.MARKER_CLICK_THRESHOLD;

			if (minDist < threshold) {
				obj.vertices.splice(bestSegment + 1, 0, clickPoint);
				obj.polygon.setLatLngs(obj.vertices);

				this.createVertexMarkers(obj);
				Geometry.updatePolygonCentroid(obj);
				if (obj.originalVertices) {
					obj.originalVertices = obj.vertices.map(v => ({
						lat: v.lat - obj.userLat,
						lng: v.lng - obj.userLng
					}));
				}
				AppState.dispatch({ type: 'SOUND_UPDATED', payload: { sound: obj } });
			}
		});
	}

	static removePolygonElements(obj) {
		if (obj.polygon) {
			context.map.removeLayer(obj.polygon);
			obj.polygon = null;
		}

		if (obj.vertexMarkers) {
			obj.vertexMarkers.forEach(marker => context.map.removeLayer(marker));
			obj.vertexMarkers = [];
		}

		obj.vertices = null;
	}

	static removeAllShapeElements(obj) {
		if (obj.circle) {
			context.map.removeLayer(obj.circle);
			obj.circle = null;
		}
		if (obj.handle) {
			context.map.removeLayer(obj.handle);
			obj.handle = null;
		}
		if (obj.polygon) {
			context.map.removeLayer(obj.polygon);
			obj.polygon = null;
		}
		if (obj.vertexMarkers) {
			obj.vertexMarkers.forEach(marker => context.map.removeLayer(marker));
			obj.vertexMarkers = [];
		}
		if (obj.linePointMarkers) {
			obj.linePointMarkers.forEach(marker => context.map.removeLayer(marker));
			obj.linePointMarkers = [];
		}
		if (obj.xHandle) {
			context.map.removeLayer(obj.xHandle);
			obj.xHandle = null;
		}
		if (obj.yHandle) {
			context.map.removeLayer(obj.yHandle);
			obj.yHandle = null;
		}

		obj.vertices = null;
		obj.linePoints = null;
		obj.ovalCenter = null;
	}

	static createLinePointMarkers(obj) {
		if (obj.linePointMarkers) {
			obj.linePointMarkers.forEach(marker => context.map.removeLayer(marker));
		}

		obj.linePointMarkers = [];

		obj.linePoints.forEach((point, index) => {
			const marker = L.marker(point, {
				icon: context.ElementFactory.vertexIcon(),
				draggable: true,
				pane: 'soundElement'
			});
			context.DragHandlers.attachLinePointHandlers(obj, marker, index);
			obj.linePointMarkers.push(marker.addTo(context.map));
		});
	}

	static setupLineClickEffects(obj) {
		if (!obj.polygon) return;

		obj.polygon.on('click', (e) => {
			L.DomEvent.stopPropagation(e);

			if (Selectors.getSelectionMode() === 'click') {
				context.SelectionController?.toggleElement(obj.id, 'sound');
				return;
			}

			const clickPoint = e.latlng;
			let bestSegment = 0;
			let minDist = Infinity;

			for (let i = 0; i < obj.linePoints.length - 1; i++) {
				const start = obj.linePoints[i];
				const end = obj.linePoints[i + 1];

				const closestPoint = Geometry.getClosestPointOnLineSegment(clickPoint, start, end);
				const dist = context.map.distance(clickPoint, closestPoint);

				if (dist < minDist) {
					minDist = dist;
					bestSegment = i;
				}
			}

			const threshold = isTouchDevice() ? CONSTANTS.POLYGON_VERTEX_CLICK_THRESHOLD_TOUCH : CONSTANTS.MARKER_CLICK_THRESHOLD;

			if (minDist < threshold + obj.lineTolerance) {
				obj.linePoints.splice(bestSegment + 1, 0, clickPoint);

				Geometry.updateLineCorridor(obj);
				this.createLinePointMarkers(obj);

				AppState.dispatch({ type: 'SOUND_UPDATED', payload: { sound: obj } });
			}
		});
	}

	static createOvalHandles(obj) {
		if (obj.xHandle) context.map.removeLayer(obj.xHandle);
		if (obj.yHandle) context.map.removeLayer(obj.yHandle);

		const center = obj.ovalCenter;
		const cosLat = Math.cos(center.lat * Math.PI / 180);

		const handleIcon = L.divIcon({
			className: 'sound-handle',
			html: '<div class="handle-inner"></div>',
			iconSize: [20, 20],
			iconAnchor: [10, 10]
		});

		const xHandlePos = L.latLng(center.lat, center.lng + (obj.radiusX / (CONSTANTS.METERS_PER_LNG * cosLat)));
		obj.xHandle = L.marker(xHandlePos, {
			icon: handleIcon,
			draggable: true,
			pane: 'soundElement'
		}).addTo(context.map);

		const yHandlePos = L.latLng(center.lat + (obj.radiusY / CONSTANTS.METERS_PER_LAT), center.lng);
		obj.yHandle = L.marker(yHandlePos, {
			icon: handleIcon,
			draggable: true,
			pane: 'soundElement'
		}).addTo(context.map);

		context.DragHandlers.attachOvalHandlers(obj);
	}
}
