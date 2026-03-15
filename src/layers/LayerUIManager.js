import { createElement, createButton, createSelect } from '../ui/domHelpers.js';
import { createDraggableHeader, createElementNavigationDropdown } from '../ui/controllers/HeaderBuilder.js';
import { createParameterControl } from '../ui/controllers/ParameterControls.js';
import { UIBuilder, createMenuStructure, createColorPicker } from '../ui/controllers/UIBuilder.js';
import { PARAMETER_REGISTRY } from '../config/parameterRegistry.js';
import { DEFAULT_EQ_STRUCTURE } from '../config/defaults.js';
import { CONSTANTS } from '../core/constants.js';
import { deepClone } from '../core/utils/math.js';
import { waitForNextFrame } from '../core/utils/async.js';
import { FXManager } from '../core/audio/FXManager.js';
import { createLayerFXNodes } from '../core/audio/FXManager.js';

export class LayerUIManager {
	constructor(appContext) {
		this.ctx = appContext;
		this.state = appContext.state;
		this.LayerManager = appContext.LayerManager;
		this.Selectors = appContext.Selectors;
		this.closeAllMenus = appContext.closeAllMenus;
		this.getAvailableFXTypes = appContext.getAvailableFXTypes;
		this.getEffectParameters = appContext.getEffectParameters;
		this.duplicateLayer = appContext.duplicateLayer;
	}

	showLayerFXDialog(layer) {
		this.closeAllMenus();

		const { menu, overlay } = createMenuStructure({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
		menu.addEventListener('click', e => e.stopPropagation());

		const { header, cleanup: headerCleanup } = createDraggableHeader(
			menu,
			`Layer FX: ${layer.name}`,
			createElementNavigationDropdown(layer, 'layer')
		);
		menu.appendChild(header);

		const menuData = this.Selectors.getTopMenu();
		if (menuData && menuData.menu === menu) {
			menuData.headerCleanup = headerCleanup;
			menuData.intervals = [];
			menu._menuData = menuData;
		}

		const colorGroup = createElement('div', 'parameter-control');
		const colorLabel = createElement('label');
		colorLabel.textContent = 'Color';
		const colorPicker = createColorPicker(layer.color, (newColor) => {
			layer.color = newColor;
			this.LayerManager.refreshUserLayersUI();
			this.state.dispatch({
				type: 'PARAMETER_CHANGED',
				payload: {
					target: layer,
					paramKey: 'color',
					value: newColor
				}
			});
		});
		colorGroup.appendChild(colorLabel);
		colorGroup.appendChild(colorPicker);
		colorGroup.appendChild(createElement('span'));
		menu.appendChild(colorGroup);

		menu._currentLayer = layer;
		menu.dataset.layerId = layer.id;

		const tabBar = createElement('div', 'tab-bar');
		const fxTabBtn = createButton('FX', () => this.showLayerFXTab(layer, container, 'fx', tabBar), '', { flex: '1' });
		fxTabBtn.dataset.tabId = 'fx';

		const eqTabBtn = createButton('EQ', () => this.showLayerFXTab(layer, container, 'eq', tabBar), '', { flex: '1' });
		eqTabBtn.dataset.tabId = 'eq';

		const gainTabBtn = createButton('Gain', () => this.showLayerFXTab(layer, container, 'gain', tabBar), '', { flex: '1' });
		gainTabBtn.dataset.tabId = 'gain';

		tabBar.appendChild(fxTabBtn);
		tabBar.appendChild(eqTabBtn);
		tabBar.appendChild(gainTabBtn);
		menu.appendChild(tabBar);

		const container = createElement('div', 'params-container');
		menu.appendChild(container);

		this.showLayerFXTab(layer, container, 'fx', tabBar);

		const closeBtn = createButton('Close', this.closeAllMenus, '', { width: '100%' });
		menu.appendChild(closeBtn);

		const duplicateBtn = createButton('Duplicate Layer', () => {
			this.duplicateLayer(layer);
			this.closeAllMenus();
		}, 'btn-duplicate');
		menu.appendChild(duplicateBtn);

		document.body.appendChild(menu);

		if (menu._menuData) delete menu._menuData;
	}

	showLayerFXTab(layer, container, tabId, tabBar) {
		tabBar.querySelectorAll('button').forEach(btn => btn.classList.toggle('active', btn.dataset.tabId === tabId));
		container.innerHTML = '';

		if (tabId === 'eq') {
			layer.eq = layer.eq || deepClone(DEFAULT_EQ_STRUCTURE);

			const toggleGroup = createElement('div', 'parameter-control');
			const toggleLabel = createElement('label', 'label-eq');
			toggleLabel.textContent = 'Enable EQ';

			const toggleCheckbox = createElement('input');
			toggleCheckbox.type = 'checkbox';
			toggleCheckbox.checked = layer.eq.enabled || false;
			toggleCheckbox.onchange = () => {
				const isEnabled = toggleCheckbox.checked;
				layer.eq.enabled = isEnabled;

				this.state.dispatch({
					type: 'PARAMETER_CHANGED',
					payload: {
						target: layer,
						paramKey: 'eq_enabled',
						value: isEnabled,
						options: {
							isLayerFX: true,
							label: 'Enable EQ'
						}
					}
				});

				this.showLayerFXTab(layer, container, 'eq', tabBar);
			};
			toggleLabel.appendChild(toggleCheckbox);
			toggleGroup.appendChild(toggleLabel);
			container.appendChild(toggleGroup);

			if (!layer.eq.enabled) {
				container.appendChild(createElement('div', 'info-message', { textContent: 'EQ is currently disabled' }));
				return;
			}

			this.createLayerEQNode(layer);

			const bandsSection = UIBuilder.collapsibleSection({
				title: 'EQ Bands',
				icon: 'fa-sliders-h',
				expanded: true,
				isActive: () => layer.eq.low !== 0 || layer.eq.mid !== 0 || layer.eq.high !== 0,
				content: (update) => {
					const content = createElement('div');
					['fx_eq_low', 'fx_eq_mid', 'fx_eq_high'].forEach(key => {
						content.appendChild(createParameterControl(PARAMETER_REGISTRY[key], key, layer, update, { small: true, isLayerFX: true }));
					});
					return content;
				}
			});
			container.appendChild(bandsSection);

			const crossoverSection = UIBuilder.collapsibleSection({
				title: 'Crossover Frequencies',
				icon: 'fa-arrows-alt-h',
				isActive: () => layer.eq.lowFrequency !== CONSTANTS.DEFAULT_EQ_VALUES.lowFrequency || layer.eq.highFrequency !== CONSTANTS.DEFAULT_EQ_VALUES.highFrequency,
				content: (update) => {
					const content = createElement('div');
					['fx_eq_lowFreq', 'fx_eq_highFreq'].forEach(key => {
						content.appendChild(createParameterControl(PARAMETER_REGISTRY[key], key, layer, update, { small: true, isLayerFX: true }));
					});
					return content;
				}
			});
			container.appendChild(crossoverSection);

		} else if (tabId === 'gain') {
			layer.gain = layer.gain ?? CONSTANTS.DEFAULT_LAYER_GAIN;
			container.appendChild(createParameterControl(PARAMETER_REGISTRY['layerGain'], 'layerGain', layer, undefined, { small: true }));

		} else {
			[1, 2, 3].forEach(slotNum => {
				const section = UIBuilder.collapsibleSection({
					title: `FX Slot ${slotNum}`,
					icon: 'fa-sliders-h',
					isActive: () => layer.fx[`slot${slotNum}`]?.type !== 'none',
					content: () => this.createLayerFXSlot(layer, slotNum, container, tabBar)
				});
				container.appendChild(section);
			});
		}
	}

	createLayerFXSlot(layer, slotNum, container, tabBar) {
		const currentFX = layer.fx[`slot${slotNum}`];
		const content = createElement('div');
		const fxOptions = this.getAvailableFXTypes();

		const fxSelect = createSelect(fxOptions, currentFX.type, async (e) => {
			this.changeLayerFX(layer, slotNum, e.target.value);
			await waitForNextFrame();
			this.showLayerFXTab(layer, container, 'fx', tabBar);
			const newSection = container.querySelectorAll('.collapsible-section')[slotNum - 1];
			if (newSection && e.target.value !== 'none') {
				newSection.classList.add('expanded');
			}
		}, { width: '100%', marginBottom: '8px' });

		content.appendChild(fxSelect);

		if (currentFX.type !== 'none') {
			const updateHeader = () => {
				const header = container.querySelectorAll('.collapsible-section-header')[slotNum - 1];
				if (header) header.classList.toggle('active', true);
			};

			content.appendChild(createParameterControl(PARAMETER_REGISTRY['fx_mix'], 'fx_mix', layer, updateHeader, { small: true, slot: `slot${slotNum}`, paramName: 'mix', isMixParameter: true, isLayerFX: true }));

			this.getEffectParameters(currentFX.type).forEach(paramKey => {
				const paramName = paramKey.replace('fx_', '').replace('_long', '');
				content.appendChild(createParameterControl(PARAMETER_REGISTRY[paramKey], paramKey, layer, updateHeader, { small: true, slot: `slot${slotNum}`, paramName: paramName, isLayerFX: true }));
			});
		}
		return content;
	}

	createLayerEQNode(layer) {
		if (!layer.eq) {
			layer.eq = deepClone(DEFAULT_EQ_STRUCTURE);
		}

		if (!layer.fxNodes) {
			createLayerFXNodes(layer);
		}

		if (!layer.fxNodes.eq) {
			layer.fxNodes.eq = new Tone.EQ3({
				low: layer.eq.low !== undefined ? layer.eq.low : CONSTANTS.DEFAULT_EQ_VALUES.low,
				mid: layer.eq.mid !== undefined ? layer.eq.mid : CONSTANTS.DEFAULT_EQ_VALUES.mid,
				high: layer.eq.high !== undefined ? layer.eq.high : CONSTANTS.DEFAULT_EQ_VALUES.high,
				lowFrequency: layer.eq.lowFrequency !== undefined ? layer.eq.lowFrequency : CONSTANTS.DEFAULT_EQ_VALUES.lowFrequency,
				highFrequency: layer.eq.highFrequency !== undefined ? layer.eq.highFrequency : CONSTANTS.DEFAULT_EQ_VALUES.highFrequency
			});

		}

		return layer.fxNodes.eq;
	}

	changeLayerFX(layer, slot, fxType) {
		FXManager.change(layer, slot, fxType, { isLayer: true });
		this.state.dispatch({
			type: 'PARAMETER_CHANGED',
			payload: {
				target: layer,
				paramKey: `fx_slot${slot}`,
				value: fxType
			}
		});
	}
}
