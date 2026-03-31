import { AppState } from '../core/state/StateManager.js';
import { Selectors } from '../core/state/selectors.js';
import { GeolocationManager } from '../core/geospatial/GeolocationManager.js';
import { updateAudio } from '../core/audio/AudioEngine.js';
import { toRadians, toDegrees } from '../core/utils/math.js';
import { CONSTANTS } from '../core/constants.js';
import { Geometry } from '../core/geospatial/Geometry.js';

let roadGraph = null;
let graphBBox = null;

function createBBox(lat, lng, radiusMeters) {
	const dLat = radiusMeters / 110540;
	const dLng = radiusMeters / (111320 * Math.cos(lat * Math.PI / 180));
	return {
		south: lat - dLat,
		north: lat + dLat,
		west: lng - dLng,
		east: lng + dLng
	};
}

function isInsideBBox(lat, lng, bbox) {
	return lat >= bbox.south && lat <= bbox.north && lng >= bbox.west && lng <= bbox.east;
}

async function loadRoadNetwork(centerLat, centerLng) {
	const radius = 1200;
	const bbox = createBBox(centerLat, centerLng, radius);

	const query = `[out:json][timeout:20];way["highway"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});(._;>;);out body;`;

	const statusText = document.getElementById('simulationStatusText');
	let data;
	for (let attempt = 0; attempt < 2; attempt++) {
		const response = await fetch('https://overpass-api.de/api/interpreter', {
			method: 'POST',
			body: query
		});
		if (response.ok) {
			data = await response.json();
			break;
		}
		if (attempt === 0) {
			if (statusText) statusText.textContent = 'Retrying road data...';
		} else {
			throw new Error(`Overpass API ${response.status}`);
		}
	}

	const nodes = {};
	const graph = {};

	for (const el of data.elements) {
		if (el.type === 'node') {
			nodes[el.id] = [el.lat, el.lon];
		}
	}

	for (const el of data.elements) {
		if (el.type === 'way') {
			for (let i = 0; i < el.nodes.length - 1; i++) {
				const a = el.nodes[i];
				const b = el.nodes[i + 1];
				if (!nodes[a] || !nodes[b]) continue;

				const dist = Geometry.distance(L.latLng(...nodes[a]), L.latLng(...nodes[b]));

				graph[a] = graph[a] || [];
				graph[b] = graph[b] || [];
				graph[a].push({ node: b, weight: dist });
				graph[b].push({ node: a, weight: dist });
			}
		}
	}

	roadGraph = { nodes, graph };
	graphBBox = bbox;
}

function findNearestNode(lat, lng) {
	let bestId = null;
	let bestDist = Infinity;

	for (const id in roadGraph.nodes) {
		const [nLat, nLng] = roadGraph.nodes[id];
		const d = Math.hypot(nLat - lat, nLng - lng);
		if (d < bestDist) {
			bestDist = d;
			bestId = id;
		}
	}

	return bestId;
}

function dijkstra(start, end) {
	const dist = {};
	const prev = {};
	const queue = new Set(Object.keys(roadGraph.graph));

	for (const node of queue) dist[node] = Infinity;
	dist[start] = 0;

	while (queue.size) {
		let u = null;
		let min = Infinity;

		for (const n of queue) {
			if (dist[n] < min) {
				min = dist[n];
				u = n;
			}
		}

		if (!u || u === end) break;
		queue.delete(u);

		for (const edge of roadGraph.graph[u] || []) {
			const alt = dist[u] + edge.weight;
			if (alt < dist[edge.node]) {
				dist[edge.node] = alt;
				prev[edge.node] = u;
			}
		}
	}

	const path = [];
	let u = end;
	while (u) {
		path.unshift(u);
		u = prev[u];
	}

	return { path, distance: dist[end] };
}

function straightLineFallback(startLat, startLng, endLat, endLng) {
	const start = L.latLng(startLat, startLng);
	const end = L.latLng(endLat, endLng);
	return {
		points: [start, end],
		totalDistance: Geometry.distance(start, end)
	};
}

export const RouteAnimator = {
	getPointAtDistance(routePoints, distance) {
		if (!routePoints || routePoints.length === 0) return null;

		let distanceCovered = 0;
		for (let i = 0; i < routePoints.length - 1; i++) {
			const start = routePoints[i];
			const end = routePoints[i + 1];
			const segmentDistance = start.distanceTo(end);

			if (distanceCovered + segmentDistance >= distance) {
				const distanceIntoSegment = distance - distanceCovered;
				const ratio = distanceIntoSegment / segmentDistance;
				return L.latLng(
					start.lat + (end.lat - start.lat) * ratio,
					start.lng + (end.lng - start.lng) * ratio
				);
			}
			distanceCovered += segmentDistance;
		}
		return routePoints[routePoints.length - 1];
	},

	calculateBearing(lat1, lon1, lat2, lon2) {
		const lat1Rad = toRadians(lat1);
		const lat2Rad = toRadians(lat2);
		const deltaLonRad = toRadians(lon2 - lon1);

		const y = Math.sin(deltaLonRad) * Math.cos(lat2Rad);
		const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
			Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLonRad);

		const bearingRad = Math.atan2(y, x);
		const bearingDeg = toDegrees(bearingRad);

		return (bearingDeg + 360) % 360;
	},

	animateMovement(currentTime, stopSimulation) {
		if (!Selectors.isSimulationActive()) return;

		const delta = currentTime - AppState.simulation.animationState.lastUpdateTime;
		if (delta < CONSTANTS.SIMULATION_UPDATE_INTERVAL_MS) {
			AppState.simulation.animationState.frameId = requestAnimationFrame((t) => this.animateMovement(t, stopSimulation));
			return;
		}
		AppState.simulation.animationState.lastUpdateTime = currentTime;

		const speedMs = (Selectors.getSimulationSpeed() * 1000) / 3600;
		const elapsedTime = (currentTime - AppState.simulation.animationState.startTime) / 1000;
		const distanceTravelled = speedMs * elapsedTime;

		const userMarker = GeolocationManager.getUserMarker();
		if (distanceTravelled >= Selectors.getSimulationRoute().totalDistance) {
			const finalPos = Selectors.getSimulationRoute().points[Selectors.getSimulationRoute().points.length - 1];
			userMarker.setLatLng(finalPos);
			updateAudio(finalPos, Tone.now());

			Selectors.getSequencers().forEach(seq => {
				if (seq.enabled) {
					seq.updatePosition(finalPos.lat, finalPos.lng);
				}
			});

			stopSimulation();
		} else {
			const newPosition = this.getPointAtDistance(Selectors.getSimulationRoute().points, distanceTravelled);
			const lastPosition = AppState.simulation.animationState.lastPosition || userMarker.getLatLng();

			if (newPosition && lastPosition && (newPosition.lat !== lastPosition.lat || newPosition.lng !== lastPosition.lng)) {
				const newHeading = Math.round(this.calculateBearing(lastPosition.lat, lastPosition.lng, newPosition.lat, newPosition.lng));
				AppState.audio.userDirection = newHeading;

				const directionSlider = document.querySelector('.direction-slider');
				if (directionSlider) {
					directionSlider.value = newHeading;
					const arrow = document.querySelector('.direction-arrow');
					const degreeDisplay = document.querySelector('.degree-display');
					if (arrow) arrow.style.transform = `rotate(${newHeading - 45}deg)`;
					if (degreeDisplay) degreeDisplay.textContent = `${newHeading}°`;
				}
			}
			AppState.simulation.animationState.lastPosition = newPosition;

			userMarker.setLatLng(newPosition);
			updateAudio(newPosition, Tone.now());

			Selectors.getSequencers().forEach(seq => {
				if (seq.enabled) {
					seq.updatePosition(newPosition.lat, newPosition.lng);
				}
			});

			AppState.simulation.animationState.frameId = requestAnimationFrame((t) => this.animateMovement(t, stopSimulation));
		}
	},

	async getRouteAndAnimate(stopSimulation) {
		if (AppState.simulation.animationState.frameId) {
			cancelAnimationFrame(AppState.simulation.animationState.frameId);
		}

		AppState.simulation.animationState.lastPosition = null;

		const startPoint = GeolocationManager.getUserPosition();
		const endPoint = Selectors.getSimulationTarget().getLatLng();

		try {
			const needsLoad = !roadGraph || !graphBBox ||
				!isInsideBBox(startPoint.lat, startPoint.lng, graphBBox) ||
				!isInsideBBox(endPoint.lat, endPoint.lng, graphBBox);

			if (needsLoad) {
				const centerLat = (startPoint.lat + endPoint.lat) / 2;
				const centerLng = (startPoint.lng + endPoint.lng) / 2;
				await loadRoadNetwork(centerLat, centerLng);
			}

			const startNode = findNearestNode(startPoint.lat, startPoint.lng);
			const endNode = findNearestNode(endPoint.lat, endPoint.lng);
			const result = dijkstra(startNode, endNode);

			if (!result.path.length || result.distance === Infinity) {
				throw new Error('No route found in road graph.');
			}

			const latLngPoints = result.path.map(id => {
				const [lat, lng] = roadGraph.nodes[id];
				return L.latLng(lat, lng);
			});

			AppState.simulation.route.points = latLngPoints;
			AppState.simulation.route.totalDistance = result.distance;

			AppState.dispatch({ type: 'SIMULATION_STARTED' });
			AppState.simulation.animationState.startTime = performance.now();
			AppState.simulation.animationState.lastUpdateTime = AppState.simulation.animationState.startTime;
			AppState.simulation.animationState.frameId = requestAnimationFrame((t) => this.animateMovement(t, stopSimulation));

		} catch (error) {
			console.error('Routing error:', error);

			const statusText = document.getElementById('simulationStatusText');
			if (statusText) statusText.textContent = 'Road data unavailable, using straight line.';

			const fallback = straightLineFallback(startPoint.lat, startPoint.lng, endPoint.lat, endPoint.lng);
			AppState.simulation.route.points = fallback.points;
			AppState.simulation.route.totalDistance = fallback.totalDistance;

			AppState.dispatch({ type: 'SIMULATION_STARTED' });
			AppState.simulation.animationState.startTime = performance.now();
			AppState.simulation.animationState.lastUpdateTime = AppState.simulation.animationState.startTime;
			AppState.simulation.animationState.frameId = requestAnimationFrame((t) => this.animateMovement(t, stopSimulation));
		}
	}
};
