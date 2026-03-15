import { AppState } from '../core/state/StateManager.js';
import { Selectors } from '../core/state/selectors.js';
import { GeolocationManager } from '../core/geospatial/GeolocationManager.js';
import { updateAudio } from '../core/audio/AudioEngine.js';
import { toRadians, toDegrees, decodePolyline } from '../core/utils/math.js';
import { CONSTANTS } from '../core/constants.js';

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
		const profile = 'foot';

		const url = `https://router.project-osrm.org/route/v1/${profile}/${startPoint.lng},${startPoint.lat};${endPoint.lng},${endPoint.lat}?overview=full&geometries=polyline`;

		try {
			const response = await fetch(url);
			const data = await response.json();

			if (data.code !== 'Ok' || data.routes.length === 0) {
				throw new Error('No route found.');
			}

			const route = data.routes[0];
			const decodedPoints = decodePolyline(route.geometry).map(p => L.latLng(p[0], p[1]));

			AppState.simulation.route.points = decodedPoints;
			AppState.simulation.route.totalDistance = route.distance;

			AppState.dispatch({ type: 'SIMULATION_STARTED' });
			AppState.simulation.animationState.startTime = performance.now();
			AppState.simulation.animationState.lastUpdateTime = AppState.simulation.animationState.startTime;
			AppState.simulation.animationState.frameId = requestAnimationFrame((t) => this.animateMovement(t, stopSimulation));

		} catch (error) {
			console.error('Routing error:', error);
			document.getElementById('simulationStatusText').textContent = 'Could not find a route.';
		}
	}
};
