import { COLORS, CONSTANTS } from '../core/constants.js';
import { AppState } from '../core/state/StateManager.js';
import { Selectors } from '../core/state/selectors.js';
import { deepClone } from '../core/utils/math.js';
import { DEFAULT_FX_STRUCTURE, DEFAULT_EQ_STRUCTURE } from '../config/defaults.js';

let context = null;

export function setLayerManagerContext(appContext) {
	context = appContext;
}

class LayerManagerClass {
	constructor() {
		this._userLayersMap = new Map();
		this.layers = {
			sounds: true,
			control: true
		};

		this.userLayers = [];
		this.nextLayerId = 1;
	}

	getUserLayer(id) {
		return this._userLayersMap.get(id);
	}

	setVisibility(layerName, visible) {
		this.layers[layerName] = visible;
		this.updateAllElements();
		this.updateUI();
	}

	toggle(layerName) {
		this.setVisibility(layerName, !this.layers[layerName]);
	}

	shouldShowElement(element) {
		if (!this.checkDefaultLayers(element)) return false;
		return this.checkUserLayers(element);
	}

	checkDefaultLayers(element) {
		return !(
			(element.role === 'sound' && !this.layers.sounds) ||
			(element.role === 'control' && !this.layers.modulators)
		);
	}

	checkUserLayers(element) {
		const elementLayers = element.layers || [];
		const anySoloed = this.userLayers.some(l => l.soloed);

		if (elementLayers.length === 0) {
			return !anySoloed;
		}

		const hasVisibleUserLayer = elementLayers.some(layerId => {
			const userLayer = this.getUserLayer(layerId);
			if (!userLayer || !userLayer.visible) return false;

			if (anySoloed) {
				return userLayer.soloed;
			} else {
				return !userLayer.muted;
			}
		});

		return hasVisibleUserLayer;
	}

	toggleElementVisibility(element, shouldShow) {
		const elements = this.getAllElementVisuals(element);

		elements.forEach(el => {
			if (el && el.getElement) {
				const domEl = el.getElement();
				if (domEl) {
					if (shouldShow) {
						domEl.classList.remove('dimmed-layer');
						domEl.style.display = '';
						if (el === element.handle) {
							domEl.classList.remove('handle-dimmed');
							domEl.classList.add('handle-visible');
						}
					} else {
						domEl.classList.add('dimmed-layer');
						if (el === element.handle) {
							domEl.classList.remove('handle-visible');
							domEl.classList.add('handle-dimmed');
						}
					}
				}
			}
		});
	}

	toggleElementInteractivity(element, shouldEnable) {
		if (element.marker) {
			if (shouldEnable) {
				element.marker.dragging.enable();
				if (element.handle && element.handle.dragging) {
					element.handle.dragging.enable();
				}
				element.vertexMarkers.forEach(vm => {
					if (vm && vm.dragging) vm.dragging.enable();
				});
			} else {
				element.marker.dragging.disable();
				if (element.handle && element.handle.dragging) {
					element.handle.dragging.disable();
				}
				element.vertexMarkers.forEach(vm => {
					if (vm && vm.dragging) vm.dragging.disable();
				});
			}
		}
	}

	getAllElementVisuals(element) {
		const elements = [element.marker, element.labelMarker];
		if (element.circle) elements.push(element.circle);
		if (element.polygon) elements.push(element.polygon);
		if (element.handle) elements.push(element.handle);
		if (element.vertexMarkers && element.vertexMarkers.length > 0) {
			element.vertexMarkers.forEach(vm => elements.push(vm));
		}
		return elements.filter(el => el !== null && el !== undefined);
	}

	updateAllElements() {
		Selectors.getSounds().forEach(sound => {
			const shouldShow = this.shouldShowElement(sound);
			this.toggleElementVisibility(sound, shouldShow);
			this.toggleElementInteractivity(sound, shouldShow);
		});
		Selectors.getPaths().forEach(path => {
			context.updatePathVisibility(path);
		});
	}

	addUserLayer(name = `Layer ${this.nextLayerId}`, color = COLORS[this.userLayers.length % COLORS.length]) {
		const layer = {
			id: `user_${this.nextLayerId++}`,
			name,
			color,
			visible: true,
			muted: false,
			soloed: false,
			fx: deepClone(DEFAULT_FX_STRUCTURE),
			eq: deepClone(DEFAULT_EQ_STRUCTURE),
			gain: CONSTANTS.DEFAULT_LAYER_GAIN
		};

		this.userLayers.push(layer);
		this._userLayersMap.set(layer.id, layer);
		this.refreshUserLayersUI();
		AppState.dispatch({ type: 'LAYER_ADDED', payload: { layer } });
		return layer;
	}

	removeUserLayer(layerId) {
		const removedLayer = this.getUserLayer(layerId);

		const layerMenu = Selectors.getMenus().find(menuData => menuData.menu.dataset?.layerId === layerId);
		if (layerMenu) {
			context.closeAllMenus();
		}

		AppState.dispatch({
			type: 'LAYER_REMOVED',
			payload: { layerId }
		});

		Selectors.getSounds().forEach(sound => {
			if (sound.layers && sound.layers.includes(layerId)) {
				sound.layers = sound.layers.filter(id => id !== layerId);
				if (sound._layerMixer) {
					sound._layerMixer.dispose();
					delete sound._layerMixer;
				}
				if (Selectors.getSpatialMode() === 'ambisonics' && sound.ambisonicSource) {
					context.AmbisonicsManager.removeSource(sound);
					context.AmbisonicsManager.createSource(sound);
				}
			}
		});

		Selectors.getSounds().forEach(sound => {
			if (sound.layers) {
				context.reconnectSoundToLayers(sound);
			}
		});

		if (removedLayer && removedLayer.fxNodes) {
			Object.values(removedLayer.fxNodes).forEach(node => {
				if (node && node.dispose) node.dispose();
			});
		}

		this.userLayers = this.userLayers.filter(layer => layer.id !== layerId);
		this._userLayersMap.delete(layerId);
		this.refreshUserLayersUI();
	}

	toggleUserLayer(layerId) {
		const layer = this.getUserLayer(layerId);
		if (layer) {
			layer.visible = !layer.visible;
			this.refreshUserLayersUI();
			this.updateAllElements();
		}
	}

	toggleUserLayerMute(layerId) {
		const layer = this.getUserLayer(layerId);
		if (layer && layer.fxNodes) {
			layer.muted = !layer.muted;
			layer.fxNodes.gain.gain.rampTo(layer.muted ? 0 : layer.gain, CONSTANTS.LAYER_SWITCH_RAMP_TIME);
			this.refreshUserLayersUI();
		}
	}

	toggleUserLayerSolo(layerId) {
		const layer = this.getUserLayer(layerId);
		if (layer) {
			layer.soloed = !layer.soloed;

			const anySoloed = this.userLayers.some(l => l.soloed);

			this.userLayers.forEach(l => {
				if (l.fxNodes) {
					if (anySoloed) {
						l.fxNodes.gain.gain.rampTo(l.soloed ? l.gain : 0, CONSTANTS.LAYER_SWITCH_RAMP_TIME);
					} else {
						l.fxNodes.gain.gain.rampTo(l.muted ? 0 : l.gain, CONSTANTS.LAYER_SWITCH_RAMP_TIME);
					}
				}
			});

			Selectors.getSounds().forEach(sound => {
				if (sound.layers) {
					context.reconnectSoundToLayers(sound);
				}
			});

			this.refreshUserLayersUI();
			this.updateAllElements();
			AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
		}
	}

	updateUI() {
		document.querySelectorAll('.layer-btn').forEach(btn => {
			const layerName = btn.dataset.layer;
			btn.classList.toggle('active', this.layers[layerName]);
		});

		this.refreshUserLayersUI();
	}

	refreshUserLayersUI() {
		const container = document.getElementById('userLayersList');
		if (!container) return;

		container.innerHTML = '';

		this.userLayers.forEach(layer => {
			const item = document.createElement('div');
			item.className = 'user-layer-item';

			const colorEl = document.createElement('div');
			colorEl.className = 'user-layer-color';
			colorEl.style.background = layer.color;
			item.appendChild(colorEl);

			const nameEl = document.createElement('span');
			nameEl.className = 'user-layer-name';
			nameEl.textContent = layer.name;
			nameEl.title = layer.name;
			nameEl.style.cursor = 'pointer';
			nameEl.onclick = async (e) => {
				e.stopPropagation();
				if (typeof context?.ModalSystem?.prompt === 'function') {
					const newName = await context.ModalSystem.prompt(
						'Enter new layer name:',
						layer.name,
						'Rename Layer'
					);
					if (newName && newName !== 'cancel') {
						layer.name = newName;
						this.refreshUserLayersUI();
					}
				}
			};
			item.appendChild(nameEl);

			const soloBtn = document.createElement('button');
			soloBtn.className = `user-layer-solo ${layer.soloed ? 'active' : ''}`;
			soloBtn.textContent = 'S';
			soloBtn.title = layer.soloed ? 'Unsolo layer' : 'Solo layer';
			soloBtn.onclick = (e) => {
				e.stopPropagation();
				this.toggleUserLayerSolo(layer.id);
			};
			item.appendChild(soloBtn);

			const muteBtn = document.createElement('button');
			muteBtn.className = `user-layer-mute ${layer.muted ? 'active' : ''}`;
			muteBtn.textContent = 'M';
			muteBtn.title = layer.muted ? 'Unmute layer' : 'Mute layer';
			muteBtn.onclick = (e) => {
				e.stopPropagation();
				this.toggleUserLayerMute(layer.id);
			};
			item.appendChild(muteBtn);

			const fxBtn = document.createElement('button');
			fxBtn.className = 'user-layer-fx';
			fxBtn.innerHTML = '<i class="fas fa-sliders-h"></i>';
			fxBtn.title = 'Layer effects';
			fxBtn.onclick = (e) => {
				e.stopPropagation();
				context.showLayerFXDialog(layer);
			};
			item.appendChild(fxBtn);

			const toggleBtn = document.createElement('button');
			toggleBtn.className = `user-layer-toggle ${layer.visible ? 'active' : ''}`;
			toggleBtn.innerHTML = '<i class="fas fa-eye"></i>';
			toggleBtn.title = layer.visible ? 'Hide layer' : 'Show layer';
			toggleBtn.onclick = (e) => {
				e.stopPropagation();
				this.toggleUserLayer(layer.id);
			};
			item.appendChild(toggleBtn);

			const actionsEl = document.createElement('div');
			actionsEl.className = 'user-layer-actions';

			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'user-layer-action';
			deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
			deleteBtn.title = 'Delete layer';
			deleteBtn.onclick = async (e) => {
				e.stopPropagation();
				if (typeof context?.ModalSystem?.confirm === 'function') {
					const shouldDelete = await context.ModalSystem.confirm(
						`Delete layer "${layer.name}"? Elements will remain but be unassigned from this layer.`,
						'Delete Layer'
					);
					if (shouldDelete) {
						this.removeUserLayer(layer.id);
					}
				}
			};
			actionsEl.appendChild(deleteBtn);

			item.appendChild(actionsEl);
			container.appendChild(item);
		});

		context.updateMenuCounts();
	}

	shouldSoundPlayBasedOnLayers(sound) {
		const soundUserLayers = (sound.layers || []).filter(layerId =>
			this._userLayersMap.has(layerId)
		);

		const anySoloed = this.userLayers.some(l => l.soloed);

		if (soundUserLayers.length === 0) {
			return !anySoloed;
		}

		if (anySoloed) {
			const isOnSoloedLayer = soundUserLayers.some(layerId => {
				const layer = this.getUserLayer(layerId);
				return layer && layer.soloed;
			});
			return isOnSoloedLayer;
		} else {
			const isOnMutedLayer = soundUserLayers.every(layerId => {
				const layer = this.getUserLayer(layerId);
				return layer && layer.muted;
			});
			return !isOnMutedLayer;
		}
	}

	cleanupOrphanedLayerAssignments() {
		Selectors.getSounds().forEach(sound => {
			if (sound.layers) {
				sound.layers = sound.layers.filter(layerId =>
					this._userLayersMap.has(layerId)
				);
			}
		});
	}
}

export const LayerManager = new LayerManagerClass();
