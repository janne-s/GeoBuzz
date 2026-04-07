import { createElement, createButton, createSelect, animateSliderReset, makeValueEditable, createDualRangeSlider } from '../domHelpers.js';
import { AppState } from '../../core/state/StateManager.js';
import { Selectors } from '../../core/state/selectors.js';
import { COLORS, CONSTANTS } from '../../core/constants.js';
import { PARAMETER_REGISTRY } from '../../config/parameterRegistry.js';
import { appContext } from '../../core/AppContext.js';

let context = null;

export function setContext(appCtx) {
	context = appCtx;
}

export function createCollapsibleSection(title, icon, content, startExpanded = false) {
	const section = createElement('div', `collapsible-section${startExpanded ? ' expanded' : ''}`);

	const header = createElement('div', 'collapsible-section-header');

	const titleEl = createElement('div', 'collapsible-section-title');
	titleEl.innerHTML = `<i class="fas ${icon}"></i> ${title}`;

	const toggle = createElement('span', 'collapsible-section-toggle');
	toggle.innerHTML = '▶';

	header.appendChild(titleEl);
	header.appendChild(toggle);

	const contentWrapper = createElement('div', 'collapsible-section-content');
	if (typeof content === 'function') {
		contentWrapper.appendChild(content());
	} else {
		contentWrapper.appendChild(content);
	}

	header.onclick = () => {
		section.classList.toggle('expanded');
	};

	section.appendChild(header);
	section.appendChild(contentWrapper);

	return section;
}

export function createColorPicker(currentColor, onChange) {
	const container = createElement('div', 'custom-color-picker');
	const selected = createElement('div', 'color-picker-selected');
	selected.style.backgroundColor = currentColor;

	const hiddenInput = createElement('input');
	hiddenInput.type = 'hidden';
	hiddenInput.value = currentColor;

	const options = createElement('div', 'color-picker-options');

	let closeListener = null;

	const cleanup = () => {
		if (closeListener) {
			document.removeEventListener('click', closeListener);
			closeListener = null;
		}
	};

	const observer = new MutationObserver((mutations) => {
		mutations.forEach((mutation) => {
			mutation.removedNodes.forEach((node) => {
				if (node === container || node.contains(container)) {
					cleanup();
					observer.disconnect();
				}
			});
		});
	});

	if (container.parentElement) {
		observer.observe(container.parentElement, { childList: true, subtree: true });
	}

	setTimeout(() => {
		if (container.parentElement) {
			observer.observe(container.parentElement, { childList: true, subtree: true });
		}
	}, 0);

	closeListener = (e) => {
		if (!container.contains(e.target)) {
			options.style.display = 'none';
			cleanup();
		}
	};

	selected.addEventListener('click', (e) => {
		e.stopPropagation();
		const isCurrentlyVisible = options.style.display === 'block';

		document.querySelectorAll('.color-picker-options').forEach(opt => {
			if (opt !== options) opt.style.display = 'none';
		});

		if (isCurrentlyVisible) {
			options.style.display = 'none';
			cleanup();
		} else {
			options.style.display = 'block';
			document.addEventListener('click', closeListener);
		}
	});

	COLORS.forEach(color => {
		const swatch = createElement('div', 'color-swatch');
		swatch.style.backgroundColor = color;
		if (color === currentColor) swatch.classList.add('selected');
		swatch.dataset.value = color;

		swatch.addEventListener('click', () => {
			selected.style.backgroundColor = color;
			hiddenInput.value = color;
			options.querySelectorAll('.color-swatch').forEach(s => {
				s.classList.remove('selected');
			});
			swatch.classList.add('selected');

			options.style.display = 'none';
			cleanup();

			onChange(color);
		});

		options.appendChild(swatch);
	});

	container.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			selected.click();
		} else if (e.key === 'Escape') {
			options.style.display = 'none';
			cleanup();
		}
	});

	container.appendChild(selected);
	container.appendChild(hiddenInput);
	container.appendChild(options);

	return container;
}

export function createHeaderControls(obj) {
	const headerControls = createElement('div', 'context-menu-header-controls');

	headerControls.appendChild(createSourceTypeDropdown(obj));

	const colorGroup = createElement('div', 'parameter-control');
	const colorLabel = createElement('label');
	colorLabel.textContent = 'Color';
	const colorPicker = createColorPicker(obj.color, (newColor) => {
		obj.color = newColor;
		obj.marker.setIcon(context.ElementFactory.soundIcon(obj.color));
		if (obj.circle) {
			obj.circle.setStyle({
				color: obj.color,
				fillColor: obj.color
			});
		}
		if (obj.polygon) {
			obj.polygon.setStyle({
				color: obj.color,
				fillColor: obj.color
			});
		}
		AppState.dispatch({
			type: 'PARAMETER_CHANGED',
			payload: {
				target: obj,
				paramKey: 'color',
				value: newColor
			}
		});
	});
	colorGroup.appendChild(colorLabel);
	colorGroup.appendChild(colorPicker);
	headerControls.appendChild(colorGroup);

	headerControls.appendChild(createShapeDropdown(obj));
	headerControls.appendChild(createLabelInput(obj));

	return headerControls;
}

export function createParamsContainer() {
	return createElement('div', 'params-container');
}

export function createActionButtons(obj) {
	const fragment = document.createDocumentFragment();

	const deleteBtn = createButton('<i class="fas fa-trash"></i> Delete', () => {
		context.deleteSound(obj);

	}, 'delete-btn');

	const duplicateBtn = createButton('Duplicate', async () => {
		await context.duplicateSound(obj);
		context.closeAllMenus();
	}, 'btn-duplicate');

	fragment.appendChild(deleteBtn);
	fragment.appendChild(duplicateBtn);
	return fragment;
}

export function createSpatialSection(obj) {
	return UIBuilder.collapsibleSection({
		title: 'Spatial',
		icon: 'fa-expand-arrows-alt',
		expanded: false,
		content: () => {
			const contentContainer = document.createDocumentFragment();
			const gridContainer = createElement('div', 'context-menu-header-controls');

			gridContainer.appendChild(createVolumeOriginDropdown(obj, gridContainer));
			gridContainer.appendChild(createIconPlacementDropdown(obj));
			gridContainer.appendChild(createPanningDropdown(obj));
			gridContainer.appendChild(createExitBehaviorDropdown(obj));
			contentContainer.appendChild(gridContainer);

			const conditionalContainer = createElement('div', 'spatial-conditional-controls');
			conditionalContainer.dataset.spatialConditional = 'true';
			renderVolumeOriginControls(obj, conditionalContainer);
			contentContainer.appendChild(conditionalContainer);

			if (obj.shapeType === 'circle') {
				const radiusSection = createElement('div', 'parameter-control');
				const radiusLabel = createElement('label');
				radiusLabel.textContent = 'Radius (m)';
				const radiusInput = createElement('input');
				radiusInput.type = 'number';
				radiusInput.min = 1;
				radiusInput.max = 10000;
				radiusInput.value = Math.round(obj.maxDistance);

				const scalingSection = createElement('div', 'parameter-control');
				const scalingLabel = createElement('label');
				scalingLabel.textContent = 'Scale';
				const scalingSlider = createElement('input');
				scalingSlider.type = 'range';
				scalingSlider.min = 0.1;
				scalingSlider.max = 5;
				scalingSlider.step = 0.1;
				scalingSlider.value = obj.maxDistance / (obj.originalSize || obj.maxDistance);
				const scalingDisplay = createElement('span', 'value-display');
				scalingDisplay.textContent = scalingSlider.value + 'x';

				radiusInput.onchange = () => {
					const newRadius = parseInt(radiusInput.value, 10);
					if (!isNaN(newRadius) && newRadius > 0) {
						obj.maxDistance = newRadius;
						obj.circle.setRadius(newRadius);
						updateCircleVisuals(obj);
						context.updateSpatialAudio(obj);
					}
				};

				scalingSlider.oninput = () => {
					const scale = parseFloat(scalingSlider.value);
					scalingDisplay.textContent = scale.toFixed(1) + 'x';
					const newRadius = Math.round((obj.originalSize || obj.maxDistance) * scale);
					obj.maxDistance = newRadius;
					radiusInput.value = newRadius;
					obj.circle.setRadius(newRadius);
					updateCircleVisuals(obj);
					context.updateSpatialAudio(obj);
				};

				radiusSection.appendChild(radiusLabel);
				radiusSection.appendChild(radiusInput);
				radiusSection.appendChild(createElement('span'));

				scalingSection.appendChild(scalingLabel);
				scalingSection.appendChild(scalingSlider);
				scalingSection.appendChild(scalingDisplay);

				contentContainer.appendChild(radiusSection);
				contentContainer.appendChild(scalingSection);
			} else if (obj.shapeType === 'line') {
				const toleranceSection = createElement('div', 'parameter-control');
				const toleranceLabel = createElement('label');
				toleranceLabel.textContent = 'Tolerance (m)';
				const toleranceSlider = createElement('input');
				toleranceSlider.type = 'range';
				toleranceSlider.min = 1;
				toleranceSlider.max = 500;
				toleranceSlider.step = 1;
				toleranceSlider.value = obj.lineTolerance ?? CONSTANTS.DEFAULT_LINE_TOLERANCE;
				const toleranceDisplay = createElement('span', 'value-display');
				toleranceDisplay.textContent = toleranceSlider.value + 'm';
				const updateSoundTolerance = (val) => {
					obj.lineTolerance = val;
					toleranceDisplay.textContent = val + 'm';
					context.Geometry.updateLineCorridor(obj);
				};
				toleranceSlider.oninput = () => updateSoundTolerance(parseInt(toleranceSlider.value, 10));
				makeValueEditable(toleranceDisplay, toleranceSlider, {
					modalSystem: context.ModalSystem,
					formatValue: (val) => Math.round(val) + 'm',
					onUpdate: (val) => updateSoundTolerance(Math.round(val)),
				});

				toleranceSection.appendChild(toleranceLabel);
				toleranceSection.appendChild(toleranceSlider);
				toleranceSection.appendChild(toleranceDisplay);
				contentContainer.appendChild(toleranceSection);

				const smoothingSection = createElement('div', 'parameter-control');
				const smoothingLabel = createElement('label');
				smoothingLabel.textContent = 'Smoothing';
				const smoothingSlider = createElement('input');
				smoothingSlider.type = 'range';
				smoothingSlider.min = 0;
				smoothingSlider.max = 1;
				smoothingSlider.step = 0.01;
				smoothingSlider.value = obj.smoothing ?? 0;
				const smoothingDisplay = createElement('span', 'value-display');
				smoothingDisplay.textContent = parseFloat(smoothingSlider.value).toFixed(2);

				smoothingSlider.oninput = () => {
					obj.smoothing = parseFloat(smoothingSlider.value);
					smoothingDisplay.textContent = obj.smoothing.toFixed(2);
					context.Geometry.updateLineCorridor(obj);
				};

				smoothingSection.appendChild(smoothingLabel);
				smoothingSection.appendChild(smoothingSlider);
				smoothingSection.appendChild(smoothingDisplay);
				contentContainer.appendChild(smoothingSection);
			}

			const speedGateSlider = createDualRangeSlider({
				label: 'Speed Gate',
				min: 0, max: 10, step: 0.1,
				valueLow: obj.params.speedGateMin ?? 0,
				valueHigh: obj.params.speedGateMax ?? 10,
				unit: ' m/s',
				modalSystem: context.ModalSystem,
				onChange: (low, high) => {
					obj.params.speedGateMin = low;
					obj.params.speedGateMax = high;
					AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
				}
			});
			contentContainer.appendChild(speedGateSlider);

			const holdSection = createElement('div', 'parameter-control');
			const holdLabel = createElement('label');
			holdLabel.textContent = 'Speed Gate Hold';
			const holdSlider = createElement('input');
			holdSlider.type = 'range';
			holdSlider.min = 0;
			holdSlider.max = 10;
			holdSlider.step = 0.1;
			holdSlider.value = obj.params.speedGateHold ?? 0;
			const holdDisplay = createElement('span', 'value-display');
			holdDisplay.textContent = parseFloat(holdSlider.value).toFixed(1) + ' s';
			holdSlider.oninput = () => {
				obj.params.speedGateHold = parseFloat(holdSlider.value);
				holdDisplay.textContent = obj.params.speedGateHold.toFixed(1) + ' s';
				AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
			};
			makeValueEditable(holdDisplay, holdSlider, {
				modalSystem: context.ModalSystem,
				formatValue: (val) => parseFloat(val).toFixed(1) + ' s',
				onUpdate: (val) => {
					obj.params.speedGateHold = val;
					holdSlider.value = val;
					holdDisplay.textContent = val.toFixed(1) + ' s';
					AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
				}
			});
			holdSection.appendChild(holdLabel);
			holdSection.appendChild(holdSlider);
			holdSection.appendChild(holdDisplay);
			contentContainer.appendChild(holdSection);

			return contentContainer;
		}
	});
}

export function createVolumeOriginDropdown(obj, gridContainer) {
	const group = createElement('div', 'parameter-control');
	const label = createElement('label');
	label.textContent = 'Volume Origin';

	const options = [
		{ value: 'icon', label: 'Center Icon' },
		{ value: 'division', label: 'Division' },
		...(obj.shapeType === 'line' ? [{ value: 'centerline', label: 'Centerline' }] : [])
	];

	const select = createSelect(options, obj.volumeOrigin || 'icon', (e) => {
		obj.volumeOrigin = e.target.value;

		const conditionalContainer = gridContainer?.parentElement?.querySelector('[data-spatial-conditional]');
		if (conditionalContainer) {
			renderVolumeOriginControls(obj, conditionalContainer);
		}

		context.Geometry.updateDivisionLineVisual(obj, context.map);
	});

	group.appendChild(label);
	group.appendChild(select);
	group.appendChild(createElement('span'));
	return group;
}

function updateCircleVisuals(obj) {
	if (!obj.circle) return;
	const center = obj.marker.getLatLng();
	if (obj.labelMarker) {
		const newLabelPos = context.Geometry.computeEdgeLatLng(center, obj.maxDistance, 'label');
		obj.labelMarker.setLatLng(newLabelPos);
	}
	if (obj.handle) {
		const newHandlePos = context.Geometry.computeEdgeLatLng(center, obj.maxDistance);
		obj.handle.setLatLng(newHandlePos);
	}
	context.Geometry.updateDivisionLineVisual(obj, context.map);
}

function renderVolumeOriginControls(obj, container) {
	container.innerHTML = '';
	const volumeOrigin = obj.volumeOrigin || 'icon';

	if (volumeOrigin === 'icon') {
		container.appendChild(createVolumeModelDropdown(obj));
	} else if (volumeOrigin === 'division') {
		container.appendChild(createDivisionAngleSlider(obj));
		container.appendChild(createDivisionPositionSlider(obj));
	} else if (volumeOrigin === 'centerline') {
		container.appendChild(createDivisionPositionSlider(obj));
	}

	context.Geometry.updateDivisionLineVisual(obj, context.map);
}

function createDivisionAngleSlider(obj) {
	const group = createElement('div', 'parameter-control');
	const label = createElement('label');
	label.textContent = 'Angle';

	const slider = createElement('input');
	slider.type = 'range';
	slider.min = 0;
	slider.max = 180;
	slider.step = 1;
	slider.value = obj.divisionAngle !== undefined ? obj.divisionAngle : 0;

	const display = createElement('span', 'value-display');
	display.textContent = slider.value + '°';

	const updateAngle = (value) => {
		obj.divisionAngle = value;
		display.textContent = value + '°';
		context.Geometry.updateDivisionLineVisual(obj, context.map);
		context.AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
	};

	slider.oninput = () => updateAngle(parseInt(slider.value, 10));

	slider.addEventListener('dblclick', (e) => {
		e.preventDefault();
		slider.value = 0;
		updateAngle(0);
		animateSliderReset(slider);
	});

	group.appendChild(label);
	group.appendChild(slider);
	group.appendChild(display);
	return group;
}

function createDivisionPositionSlider(obj) {
	const group = createElement('div', 'parameter-control');
	const label = createElement('label');
	label.textContent = 'Position';

	const slider = createElement('input');
	slider.type = 'range';
	slider.min = 0;
	slider.max = 1;
	slider.step = 0.01;
	slider.value = obj.divisionPosition !== undefined ? obj.divisionPosition : 0.5;

	const display = createElement('span', 'value-display');
	display.textContent = Math.round(slider.value * 100) + '%';

	const updatePosition = (value) => {
		obj.divisionPosition = value;
		display.textContent = Math.round(value * 100) + '%';
		context.Geometry.updateDivisionLineVisual(obj, context.map);
		context.AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
	};

	slider.oninput = () => updatePosition(parseFloat(slider.value));

	slider.addEventListener('dblclick', (e) => {
		e.preventDefault();
		slider.value = 0.5;
		updatePosition(0.5);
		animateSliderReset(slider);
	});

	group.appendChild(label);
	group.appendChild(slider);
	group.appendChild(display);
	return group;
}

export function createExitBehaviorDropdown(obj) {
	const group = createElement('div', 'parameter-control');
	const label = createElement('label');
	label.textContent = 'Exit Behavior';

	const options = [
		{ value: 'stop', label: 'Stop at edge' },
		{ value: 'release', label: 'Use release/fade' }
	];

	const select = createSelect(options, obj.params.releaseMode || 'stop', (e) => {
		obj.params.releaseMode = e.target.value;
	});

	group.appendChild(label);
	group.appendChild(select);
	group.appendChild(createElement('span'));
	return group;
}

export function createVolumeModelDropdown(obj) {
	const group = createElement('div', 'parameter-control');
	const label = createElement('label');
	label.textContent = 'Volume Model';

	const options = [
		{ value: 'distance', label: 'Distance Based' },
		{ value: 'raycast', label: 'Ray-Cast Based' }
	];

	const select = createSelect(options, obj.volumeModel, (e) => {
		obj.volumeModel = e.target.value;
		const container = document.querySelector('.params-container');
		const tabBar = document.querySelector('.tab-bar');
		if (container && tabBar) {
			context.showMenuTab(obj, container, 'sound', tabBar);
		}
	});

	group.appendChild(label);
	group.appendChild(select);
	group.appendChild(createElement('span'));
	return group;
}

export function createIconPlacementDropdown(obj) {
	const group = createElement('div', 'parameter-control');
	const label = createElement('label');
	label.textContent = 'Icon Position';

	const options = [
		{ value: 'fixed', label: 'Fixed Center' },
		{ value: 'free', label: 'Free Movement' }
	];

	const select = createSelect(options, obj.iconPlacementMode, (e) => {
		obj.iconPlacementMode = e.target.value;
		if (obj.iconPlacementMode === 'fixed') {
			let centerPos;
			if (obj.shapeType === 'circle' && obj.circle) {
				centerPos = obj.circle.getLatLng();
			} else if (obj.shapeType === 'polygon' && obj.vertices) {
				centerPos = context.Geometry.calculateCentroid(obj.vertices);
			}
			if (centerPos) {
				obj.marker.setLatLng(centerPos);
				obj.userLat = centerPos.lat;
				obj.userLng = centerPos.lng;
			}
		}
	});

	group.appendChild(label);
	group.appendChild(select);
	group.appendChild(createElement('span'));
	return group;
}

export function createMenuStructure(point) {
	const overlay = createElement('div', 'menu-overlay');
	overlay.onclick = context.closeAllMenus;
	document.body.appendChild(overlay);

	const menu = createElement('div', 'context-menu');

	if (Selectors.getMenuCount() > 0) {
		const lastMenuRect = Selectors.getTopMenu().menu.getBoundingClientRect();
		menu.style.left = `${lastMenuRect.left + 30}px`;
		menu.style.top = `${lastMenuRect.top + 30}px`;
	} else if (Selectors.getLastMenuPosition()) {
		menu.style.left = `${Selectors.getLastMenuPosition().x}px`;
		menu.style.top = `${Selectors.getLastMenuPosition().y}px`;
	} else {
		menu.classList.add('centered-context-menu');
	}

	const baseZ = 12000;
	overlay.style.zIndex = baseZ + (Selectors.getMenuCount() * 2);
	menu.style.zIndex = baseZ + (Selectors.getMenuCount() * 2) + 1;

	AppState.dispatch({
		type: 'UI_MENU_OPENED',
		payload: { menu, overlay }
	});

	return { menu, overlay };
}

export function createSourceTypeDropdown(obj) {
	const group = createElement('div', 'parameter-control');
	const label = createElement('label');
	label.textContent = 'Source';

	const options = context.getAvailableSynthTypes(obj.role);
	const select = createSelect(options, obj.type, async (e) => {
		let point = { x: context.innerWidth / 2, y: context.innerHeight / 2 };

		if (Selectors.getMenuCount() > 0) {
			const currentMenu = Selectors.getTopMenu().menu;
			const menuRect = currentMenu.getBoundingClientRect();
			point = { x: menuRect.left, y: menuRect.top };
		}

		await context.changeSoundType(obj, e.target.value);

		context.showSoundMenu(point, obj.marker);
	});

	group.appendChild(label);
	group.appendChild(select);
	group.appendChild(createElement('span'));
	return group;
}

export function createRoleDropdown(obj) {
	return null;
}

export function createShapeDropdown(obj) {
	const group = createElement('div', 'parameter-control');
	const label = createElement('label');
	label.textContent = 'Shape';

	const options = [
		{ value: 'circle', label: 'Circle' },
		{ value: 'polygon', label: 'Polygon' },
		{ value: 'line', label: 'Line' },
		{ value: 'oval', label: 'Oval' }
	];

	const select = createSelect(options, obj.shapeType, (e) => {
		const newShape = e.target.value;
		const currentShape = obj.shapeType;

		if (newShape === currentShape) return;

		if (newShape === 'circle') {
			context.ShapeManager.convertToCircle(obj);
		} else if (newShape === 'polygon') {
			context.ShapeManager.convertToPolygon(obj);
		} else if (newShape === 'line') {
			context.ShapeManager.convertToLine(obj);
		} else if (newShape === 'oval') {
			context.ShapeManager.convertToOval(obj);
		}

		const currentMenu = document.querySelector('.context-menu[data-sound-id="' + obj.id + '"]');
		if (currentMenu) {
			const oldSpatialSection = currentMenu.querySelector('.collapsible-section');
			if (oldSpatialSection) {
				const newSpatialSection = createSpatialSection(obj);
				oldSpatialSection.replaceWith(newSpatialSection);
			}
		}

		AppState.dispatch({ type: 'SOUND_UPDATED', payload: { sound: obj } });
	});

	group.appendChild(label);
	group.appendChild(select);
	group.appendChild(createElement('span'));
	return group;
}

export function createPanningDropdown(obj) {
	const group = createElement('div', 'parameter-control condensed');
	const label = createElement('label');
	label.textContent = 'Panning';

	const options = [
		{ value: 'spatial', label: 'Spatial' },
		{ value: 'manual', label: 'Manual' }
	];

	const selectedValue = obj.useSpatialPanning ? 'spatial' : 'manual';

	const select = createSelect(options, selectedValue, async (e) => {
		obj.useSpatialPanning = e.target.value === 'spatial';
		await context.setSoundPannerType(obj);
		AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });

		updatePanSliderState(obj);
	});

	group.appendChild(label);
	group.appendChild(select);
	return group;
}

function updatePanSliderState(obj) {
	const menu = document.querySelector(`.context-menu[data-sound-id="${obj.id}"]`);
	if (!menu) return;

	const allSliders = menu.querySelectorAll('input[type="range"]');
	for (const slider of allSliders) {
		const controlGroup = slider.closest('.parameter-control');
		if (!controlGroup) continue;

		const label = controlGroup.querySelector('label');
		if (label?.textContent === 'Pan') {
			const isPanDisabled = obj.useSpatialPanning && context.Selectors.getSpatialMode() !== 'off';
			slider.disabled = isPanDisabled;
			controlGroup.classList.toggle('control-disabled', isPanDisabled);
			label.title = isPanDisabled ? 'Pan is disabled when Spatial panning mode is active. Set Panning to Manual to use this control.' : '';
			break;
		}
	}
}

export function createLabelInput(obj) {
	const group = createElement('div', 'parameter-control');
	const label = createElement('label');
	label.textContent = 'Label';

	const input = createElement('input');
	input.type = 'text';
	input.value = obj.label || 'Untitled';

	input.oninput = () => {
		context.updateSoundLabel(obj, input.value || 'Untitled');
	};

	group.appendChild(label);
	group.appendChild(input);
	group.appendChild(createElement('span'));
	return group;
}

export function createTabBar(obj) {
	const tabBar = createElement('div', 'tab-bar');

	let tabs = [
		{ id: 'sound', label: 'Sound' },
		{ id: 'keyboard', label: 'Keys' },
		{ id: 'mod', label: 'Mod' },
		{ id: 'fx', label: 'FX' },
		{ id: 'eq', label: 'EQ' },
		{ id: 'patches', label: 'Patches' },
		{ id: 'layers', label: 'Layers' }
	];

	if (!context.hasKeyboard(obj)) {
		tabs = tabs.filter(tab => tab.id !== 'keyboard');
	}

	tabs.forEach(tab => {
		const btn = createButton(tab.label, () => {
			context.showMenuTab(obj, document.querySelector('.params-container'), tab.id, tabBar);
		}, '', { flex: '1' });
		btn.dataset.tabId = tab.id;
		tabBar.appendChild(btn);
	});

	return tabBar;
}

export function createDeleteButton(obj, menu, overlay) {
	const btn = createElement('button', 'delete-btn');
	btn.innerHTML = '<i class="fas fa-trash"></i> Delete';
	btn.onclick = async () => {
		await context.deleteSound(obj);
	};
	return btn;
}

export function createSwitch(isChecked, onChange) {
	const toggle = document.createElement("label");
	toggle.className = "switch";
	const input = document.createElement("input");
	input.type = "checkbox";
	input.checked = isChecked;
	input.onchange = () => onChange(input.checked);
	const slider = document.createElement("span");
	slider.className = "slider round";
	toggle.appendChild(input);
	toggle.appendChild(slider);
	return toggle;
}

export function createRadioButton(name, value, label, isChecked, onChange) {
	const container = document.createElement("label");
	container.className = "radio-button-container";
	const input = document.createElement("input");
	input.type = "radio";
	input.name = name;
	input.value = value;
	input.checked = isChecked;
	input.onchange = onChange;
	const text = document.createElement("span");
	text.textContent = label;
	container.appendChild(input);
	container.appendChild(text);
	return container;
}

export function addSideMenuCloseButtons() {
	const sideMenus = [
		{ menuId: 'helperMenu', toggleId: 'helperMenuToggle' },
		{ menuId: 'elementsMenu', toggleId: 'elementsMenuToggle' },
		{ menuId: 'controlMenu', toggleId: 'controlMenuToggle' },
		{ menuId: 'sequencingMenu', toggleId: 'sequencingMenuToggle' },
		{ menuId: 'interfaceMenu', toggleId: 'interfaceMenuToggle' },
		{ menuId: 'selectionMenu', toggleId: 'selectionMenuToggle' },
		{ menuId: 'aboutMenu', toggleId: 'aboutMenuToggle' }
	];

	sideMenus.forEach(({ menuId, toggleId }) => {
		const menu = document.getElementById(menuId);
		if (!menu) return;

		const header = menu.querySelector('h3');
		if (!header || header.querySelector('.menu-close-btn')) return;

		header.classList.add('menu-header-with-close');

		const closeBtn = createElement('button', 'menu-close-btn');
		closeBtn.innerHTML = '×';
		closeBtn.onclick = (e) => {
			e.stopPropagation();
			menu.classList.remove('active');
			const toggleBtn = document.getElementById(toggleId);
			if (toggleBtn) toggleBtn.classList.remove('active');
			AppState.ui.menuState.activeSideMenu = null;
			AppState.dispatch({
				type: 'UI_SIDE_MENU_TOGGLED',
				payload: { menu, wasActive: true }
			});
		};
		header.appendChild(closeBtn);
	});
}

export const UIBuilder = {
	collapsibleSection(config) {
		const { title, icon, content, expanded = false, className = '', isActive = () => false } = config;

		const sectionId = title.replace(/\s+/g, '_');
		const wasExpanded = Selectors.getExpandedSections()[sectionId];
		const shouldBeExpanded = wasExpanded !== undefined ? wasExpanded : expanded;

		const section = createElement('div', `collapsible-section ${className}${shouldBeExpanded ? ' expanded' : ''}`);
		const header = this.sectionHeader(title, icon);
		const contentWrapper = this.sectionContent(content);

		const updateActiveState = () => {
			if (header) {
				header.classList.toggle('active', isActive());
			}
		};

		contentWrapper.innerHTML = '';
		contentWrapper.appendChild(typeof content === 'function' ? content(updateActiveState) : content);

		header.onclick = () => {
			const isExpanded = section.classList.toggle('expanded');
			Selectors.getExpandedSections()[sectionId] = isExpanded;
		};

		section.appendChild(header);
		section.appendChild(contentWrapper);

		updateActiveState();
		return section;
	},

	sectionHeader(title, icon) {
		const header = createElement('div', 'collapsible-section-header');
		const titleEl = createElement('div', 'collapsible-section-title');
		titleEl.innerHTML = `<i class="fas ${icon}"></i> ${title}`;
		const toggle = createElement('span', 'collapsible-section-toggle');
		toggle.innerHTML = '▶';

		header.appendChild(titleEl);
		header.appendChild(toggle);
		return header;
	},

	sectionContent(content, updateCallback) {
		const wrapper = createElement('div', 'collapsible-section-content');
		wrapper.appendChild(typeof content === 'function' ? content(updateCallback) : content);
		return wrapper;
	},

	parameterSection(title, icon, params, target, options = {}) {
		const isSectionActive = () => {
			return params.some(paramKey => {
				const def = PARAMETER_REGISTRY[paramKey];
				if (!def) return false;

				const currentValue = context.ParameterManager.getValue(target, paramKey, options);
				return currentValue !== def.defaultValue;
			});
		};

		return this.collapsibleSection({
			title,
			icon,
			content: (updateHeaderCallback) => {
				const container = createElement('div');
				params.forEach(paramKey => {
					const def = PARAMETER_REGISTRY[paramKey];
					if (def) {
						container.appendChild(context.createParameterControl(def, paramKey, target, updateHeaderCallback, options));
					}
				});
				return container;
			},
			expanded: options.expanded || false,
			className: options.className || '',
			isActive: isSectionActive
		});
	}
};
