import { AppState } from '../core/state/StateManager.js';
import { Selectors } from '../core/state/selectors.js';
import { Geometry } from '../core/geospatial/Geometry.js';
import { CONSTANTS } from '../core/constants.js';
import { isCircularPath } from '../core/utils/math.js';
import { isLinearPath } from '../core/utils/typeChecks.js';
import { calculateBearing } from '../core/audio/audioUtils.js';

export function deleteControlPath(path, options = {}) {
	const { map, refreshList, updateCounts } = options;

	if (path.pathLine) map.removeLayer(path.pathLine);
	if (path.pathCircle) map.removeLayer(path.pathCircle);
	if (path.polygon) map.removeLayer(path.polygon);
	if (path.hintLine) map.removeLayer(path.hintLine);
	if (path.toleranceLayer) map.removeLayer(path.toleranceLayer);
	if (path.toleranceInner) map.removeLayer(path.toleranceInner);
	if (path.labelMarker) map.removeLayer(path.labelMarker);
	path.pointMarkers.forEach(m => map.removeLayer(m));

	path.attachedSounds.forEach(soundId => {
		const sound = AppState.getSound(soundId);
		if (sound && sound.pathRoles?.movement === path.id) {
			sound.pathRoles.movement = null;
			delete sound.pathProgress;
		}
	});

	Selectors.getSounds().forEach(sound => {
		if (sound.pathRoles) {
			if (sound.pathRoles.zones) {
				const idx = sound.pathRoles.zones.indexOf(path.id);
				if (idx !== -1) {
					sound.pathRoles.zones.splice(idx, 1);
				}
			}
			if (sound.pathRoles.modulation) {
				sound.pathRoles.modulation = sound.pathRoles.modulation.filter(
					patch => patch.pathId !== path.id
				);
			}
		}
	});

	AppState.dispatch({ type: 'PATH_REMOVED', payload: { id: path.id } });
	if (refreshList) refreshList();
	if (updateCounts) updateCounts();
	AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
}

export function refreshPathsList(options = {}) {
	const { Selectors, isLinearPath, Geometry, map, showMenu } = options;

	const listContainer = document.getElementById('pathsList');
	if (!listContainer) return;

	listContainer.innerHTML = '';

	if (Selectors.getPaths().length === 0) {
		const emptyMsg = document.createElement('div');
		emptyMsg.textContent = 'No paths yet';
		listContainer.appendChild(emptyMsg);
		return;
	}

	const pathIcons = {
		'line': 'fa-bezier-curve',
		'circle': 'fa-circle-notch',
		'polygon': 'fa-draw-polygon',
		'oval': 'fa-circle'
	};

	Selectors.getPaths().forEach(path => {
		const item = document.createElement('div');
		item.className = `path-list-item`;
		item.style.borderLeftColor = path.color;

		const icon = document.createElement('i');
		icon.className = `fas ${pathIcons[path.type] || 'fa-question'} path-icon`;
		icon.style.color = path.color;
		item.appendChild(icon);

		const label = document.createElement('span');
		label.className = 'path-label-text';
		label.textContent = path.label;
		item.appendChild(label);

		const type = document.createElement('span');
		type.className = 'path-type';
		type.textContent = path.type;
		item.appendChild(type);

		item.onclick = () => {
			const sideMenu = document.querySelector('.side-menu');
			sideMenu.classList.remove('active');

			let pointToShow;
			if (isLinearPath(path)) {
				pointToShow = path.points[0];
			} else if (path.center) {
				pointToShow = path.center;
			} else if (path.points && path.points.length > 0) {
				pointToShow = Geometry.calculateCentroid(path.points);
			} else {
				console.error('Path has no valid position data:', path);
				return;
			}
			const markerPoint = map.latLngToContainerPoint(pointToShow);
			showMenu(markerPoint, path);
		};

		listContainer.appendChild(item);
	});
}

export function animateUserOnPath(currentTime, options = {}) {
	const { GeolocationManager, Selectors, computePathLength, getPointAtDistance, updateAudio, updateDirectionUI, detachUser, calculateBearing, getSmoothedPoints, CONSTANTS } = options;

	if (!Selectors.getUserAttachedPathId()) {
		if (AppState.simulation.userPathAnimationState.frameId) cancelAnimationFrame(AppState.simulation.userPathAnimationState.frameId);
		AppState.simulation.userPathAnimationState.frameId = null;
		return;
	}

	const path = AppState.getPath(Selectors.getUserAttachedPathId());
	const userMarker = GeolocationManager.getUserMarker();

	if (!path || !userMarker) {
		detachUser();
		return;
	}

	const delta = currentTime - AppState.simulation.userPathAnimationState.lastUpdateTime;
	if (delta < CONSTANTS.SIMULATION_UPDATE_INTERVAL_MS) {
		AppState.simulation.userPathAnimationState.frameId = requestAnimationFrame((t) => animateUserOnPath(t, options));
		return;
	}
	AppState.simulation.userPathAnimationState.lastUpdateTime = currentTime;

	const baseSpeedMs = (Selectors.getSimulationSpeed() * 1000) / 3600;
	const effectiveSpeedMs = baseSpeedMs * (path.relativeSpeed ?? 1.0);

	AppState.simulation.currentEffectiveSpeed = effectiveSpeedMs;
	const distanceToMove = effectiveSpeedMs * (delta / 1000);
	const totalPathLength = computePathLength(path);
	const behavior = AppState.simulation.userPathAnimationState.behavior || 'forward';

	if (behavior === 'backward') {
		AppState.simulation.userPathAnimationState.direction = -1;
	} else if (behavior === 'forward') {
		AppState.simulation.userPathAnimationState.direction = 1;
	}

	AppState.simulation.userPathAnimationState.distance += distanceToMove * AppState.simulation.userPathAnimationState.direction;

	if (behavior === 'pingpong') {
		if (AppState.simulation.userPathAnimationState.distance >= totalPathLength) {
			AppState.simulation.userPathAnimationState.distance = totalPathLength;
			AppState.simulation.userPathAnimationState.direction = -1;
		} else if (AppState.simulation.userPathAnimationState.distance <= 0) {
			AppState.simulation.userPathAnimationState.distance = 0;
			AppState.simulation.userPathAnimationState.direction = 1;
		}
	} else {
		if (path.loop) {
			if (AppState.simulation.userPathAnimationState.distance >= totalPathLength) {
				AppState.simulation.userPathAnimationState.distance = 0;
			} else if (AppState.simulation.userPathAnimationState.distance < 0) {
				AppState.simulation.userPathAnimationState.distance = totalPathLength;
			}
		} else if (AppState.simulation.userPathAnimationState.distance >= totalPathLength || AppState.simulation.userPathAnimationState.distance < 0) {
			AppState.simulation.userPathAnimationState.distance = Math.max(0, Math.min(totalPathLength, AppState.simulation.userPathAnimationState.distance));
			const finalPosition = getPointAtDistance(path, AppState.simulation.userPathAnimationState.distance, { getSmoothedPoints, CONSTANTS });
			if (finalPosition) userMarker.setLatLng(finalPosition);
			detachUser();
			return;
		}
	}

	const newPosition = getPointAtDistance(path, AppState.simulation.userPathAnimationState.distance, { getSmoothedPoints, CONSTANTS });
	const lastPosition = userMarker.getLatLng();

	if (newPosition) {
		if (lastPosition && (newPosition.lat !== lastPosition.lat || newPosition.lng !== lastPosition.lng)) {
			AppState.audio.userDirection = Math.round(calculateBearing(lastPosition.lat, lastPosition.lng, newPosition.lat, newPosition.lng));
			updateDirectionUI(Selectors.getUserDirection());
		}
		userMarker.setLatLng(newPosition);
		updateAudio(newPosition);
	}

	AppState.simulation.userPathAnimationState.frameId = requestAnimationFrame((t) => animateUserOnPath(t, options));
}

export function getPointAtDistanceOnControlPath(path, distance, options = {}) {
	const { computePathLength, getSmoothedPoints, getPointAtDistance, isCircularPath, CONSTANTS } = options;

	const totalLength = computePathLength(path);
	if (distance < 0) distance = 0;
	if (distance > totalLength && totalLength > 0) distance %= totalLength;

	if (isCircularPath(path)) {
		const angle = (distance / totalLength) * CONSTANTS.TWO_PI;
		const isOval = path.type === 'oval';
		const radiusX = path.radius;
		const radiusY = isOval ? path.radiusY : path.radius;
		const x = radiusX * Math.cos(angle);
		const y = radiusY * Math.sin(angle);
		const deltaLat = (y / CONSTANTS.EARTH_RADIUS_M) * (180 / Math.PI);
		const deltaLng = (x / CONSTANTS.EARTH_RADIUS_M) * (180 / Math.PI) / Math.cos(path.center.lat * Math.PI / 180);
		return L.latLng(path.center.lat + deltaLat, path.center.lng + deltaLng);
	} else {
		const isClosed = path.type === 'polygon';
		const pts = (path.smoothing && path.smoothing > 0) ?
			getSmoothedPoints(path.points, path.smoothing, isClosed) :
			(isClosed ? [...path.points, path.points[0]] : path.points);
		return getPointAtDistance(pts, distance);
	}
}

export function updateSoundPositionOnPath(sound, path, time, options = {}) {
	const { isLinearPath, isCircularPath, updateOnLine, updateOnCircle } = options;

	if (!sound.pathProgress) {
		sound.pathProgress = {
			distance: 0,
			direction: 1,
			startTime: time
		};
	}

	const elapsed = time - sound.pathProgress.startTime;
	const actualSpeed = sound.motion?.speed ?? 1.0;
	const speed = actualSpeed * (path.relativeSpeed ?? 1.0);

	if (isLinearPath(path)) {
		updateOnLine(sound, path, speed, elapsed);
	} else if (isCircularPath(path)) {
		updateOnCircle(sound, path, speed, elapsed);
	}

	sound.pathProgress.startTime = time;
}

export function updateSoundOnLinePath(sound, path, speed, elapsed, options = {}) {
	const { map, getSmoothedPoints, updateMarkerPosition } = options;

	const isPolygon = path.type === 'polygon';
	const pts = (path.smoothing && path.smoothing > 0) ?
		getSmoothedPoints(path.points, path.smoothing, isPolygon) :
		(isPolygon ? [...path.points, path.points[0]] : path.points);

	let totalLength = 0;
	for (let i = 0; i < pts.length - 1; i++) {
		totalLength += map.distance(pts[i], pts[i + 1]);
	}

	const distanceToMove = speed * elapsed;
	sound.pathProgress.distance += distanceToMove * sound.pathProgress.direction;

	const behavior = sound.motion?.behavior || path.direction || 'forward';

	if (behavior === 'pingpong') {
		if (sound.pathProgress.distance >= totalLength) {
			sound.pathProgress.distance = totalLength;
			sound.pathProgress.direction = -1;
		} else if (sound.pathProgress.distance <= 0) {
			sound.pathProgress.distance = 0;
			sound.pathProgress.direction = 1;
		}
	} else if (behavior === 'backward') {
		sound.pathProgress.direction = -1;
	} else {
		sound.pathProgress.direction = 1;
	}

	if (path.loop) {
		if (sound.pathProgress.distance > totalLength) {
			sound.pathProgress.distance = 0;
		} else if (sound.pathProgress.distance < 0) {
			sound.pathProgress.distance = totalLength;
		}
	} else {
		sound.pathProgress.distance = Math.max(0, Math.min(totalLength, sound.pathProgress.distance));
	}

	let accumulatedDistance = 0;
	let newPosition = null;

	for (let i = 0; i < pts.length - 1; i++) {
		const segmentLength = map.distance(pts[i], pts[i + 1]);

		if (accumulatedDistance + segmentLength >= sound.pathProgress.distance) {
			const segmentProgress = (sound.pathProgress.distance - accumulatedDistance) / segmentLength;
			const lat = pts[i].lat + (pts[i + 1].lat - pts[i].lat) * segmentProgress;
			const lng = pts[i].lng + (pts[i + 1].lng - pts[i].lng) * segmentProgress;
			newPosition = L.latLng(lat, lng);
			break;
		}

		accumulatedDistance += segmentLength;
	}

	if (newPosition) {
		updateMarkerPosition(sound, newPosition);
	}
}

export function updateSoundOnCirclePath(sound, path, speed, elapsed, options = {}) {
	const { updateMarkerPosition, CONSTANTS } = options;

	const isOval = path.type === 'oval';
	const circumference = isOval ?
		Math.PI * (3 * (path.radius + path.radiusY) - Math.sqrt((3 * path.radius + path.radiusY) * (path.radius + 3 * path.radiusY))) :
		CONSTANTS.TWO_PI * path.radius;

	const distanceToMove = speed * elapsed;

	sound.pathProgress.distance += distanceToMove * sound.pathProgress.direction;

	const behavior = sound.motion?.behavior || path.direction || 'forward';
	if (behavior === 'backward') {
		sound.pathProgress.direction = -1;
	} else {
		sound.pathProgress.direction = 1;
	}

	if (path.loop) {
		if (sound.pathProgress.distance > circumference) {
			sound.pathProgress.distance = 0;
		} else if (sound.pathProgress.distance < 0) {
			sound.pathProgress.distance = circumference;
		}
	} else {
		sound.pathProgress.distance = Math.max(0, Math.min(circumference, sound.pathProgress.distance));
	}

	const angle = (sound.pathProgress.distance / circumference) * 2 * Math.PI;

	const earthRadius = CONSTANTS.EARTH_RADIUS_M;
	const radiusToUse = isOval ? path.radius : path.radius;
	const radiusY = isOval ? path.radiusY : path.radius;

	const x = radiusToUse * Math.cos(angle);
	const y = radiusY * Math.sin(angle);

	const deltaLat = (y / earthRadius) * (180 / Math.PI);
	const deltaLng = (x / earthRadius) * (180 / Math.PI) / Math.cos(path.center.lat * Math.PI / 180);

	const newPosition = L.latLng(path.center.lat + deltaLat, path.center.lng + deltaLng);
	updateMarkerPosition(sound, newPosition);
}

export function updateDirectionUI(newHeading) {
	const directionSlider = document.querySelector('.direction-slider');
	if (directionSlider) {
		directionSlider.value = newHeading;
		const arrow = document.querySelector('.direction-arrow');
		const degreeDisplay = document.querySelector('.degree-display');
		if (arrow) arrow.style.transform = `rotate(${newHeading - 45}deg)`;
		if (degreeDisplay) degreeDisplay.textContent = `${newHeading}°`;
	}
}
