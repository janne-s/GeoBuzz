import { createElement, createButton, makeValueEditable } from '../domHelpers.js';
import { createDraggableHeader, createElementNavigationDropdown } from '../controllers/HeaderBuilder.js';
import { createParameterControl } from '../controllers/ParameterControls.js';
import { UIBuilder, createColorPicker, createMenuStructure } from '../controllers/UIBuilder.js';
import { MenuTabs } from '../components/MenuTabsRegistry.js';
import { CONSTANTS } from '../../core/constants.js';
import { PARAMETER_REGISTRY } from '../../config/parameterRegistry.js';
import { isCircularPath } from '../../core/utils/math.js';
import { isLinearPath } from '../../core/utils/typeChecks.js';

let AppState, Selectors, MenuManager, ModalSystem;
let closeAllMenus, refreshPathsList, renderControlPath, deleteControlPath, duplicatePath, computePathLength;

export function setContext(context) {
	AppState = context.AppState;
	Selectors = context.Selectors;
	MenuManager = context.MenuManager;
	ModalSystem = context.ModalSystem;
	closeAllMenus = context.closeAllMenus;
	refreshPathsList = context.refreshPathsList;
	renderControlPath = context.renderControlPath;
	deleteControlPath = context.deleteControlPath;
	duplicatePath = context.duplicatePath;
	computePathLength = context.computePathLength;
}

export function showPathMenu(point, path) {
	closeAllMenus();

	const { menu, overlay } = createMenuStructure(point);
	overlay.onclick = closeAllMenus;
	menu.addEventListener('click', e => e.stopPropagation());

	menu.addEventListener('input', () => {
		AppState.dispatch({ type: 'PATH_UPDATED', payload: { path } });
	});
	menu.addEventListener('change', () => {
		AppState.dispatch({ type: 'PATH_UPDATED', payload: { path } });
	});

	const { header, cleanup: headerCleanup } = createDraggableHeader(
		menu,
		`Path: ${path.label}`,
		createElementNavigationDropdown(path, 'path')
	);
	menu.appendChild(header);

	const menuData = Selectors.getTopMenu();
	if (menuData && menuData.menu === menu) {
		menuData.headerCleanup = headerCleanup;
		menuData.intervals = [];
		menu._menuData = menuData;
	}

	const tabBar = createElement('div', 'tab-bar');
	const container = createElement('div', 'params-container');

	const tabs = [
		{ id: 'path', label: 'Path' },
		{ id: 'mod', label: 'Mod' },
		{ id: 'layers', label: 'Layers' }
	];

	tabs.forEach(tab => {
		const btn = createButton(tab.label, () => showPathMenuTab(path, container, tab.id, tabBar), '', { flex: 1 });
		btn.dataset.tabId = tab.id;
		tabBar.appendChild(btn);
	});

	menu.appendChild(tabBar);
	menu.appendChild(container);

	showPathMenuTab(path, container, 'path', tabBar);

	document.body.appendChild(menu);

	if (menu._menuData) delete menu._menuData;
}

export function showPathMenuTab(path, container, tabId, tabBar) {
	tabBar.querySelectorAll('button').forEach(btn => btn.classList.toggle('active', btn.dataset.tabId === tabId));
	container.innerHTML = '';

	switch (tabId) {
		case 'path':
			renderPathSettingsTab(path, container);
			break;
		case 'mod':
			renderPathModTab(path, container);
			break;
		case 'layers':
			MenuTabs.layers.render(path, container);
			break;
	}
}

export function renderPathSettingsTab(path, container) {
	const topControls = createElement('div', 'context-menu-header-controls');

	const labelGroup = createElement('div', 'parameter-control');
	const labelLabel = createElement('label');
	labelLabel.textContent = 'Label';
	const labelInput = createElement('input');
	labelInput.type = 'text';
	labelInput.value = path.label;
	labelInput.oninput = () => {
		path.label = labelInput.value;
		if (path.labelMarker) {
			const iconAnchor = (isCircularPath(path)) ? [0, 0] : [0, -15];
			path.labelMarker.setIcon(L.divIcon({
				html: `<div class="path-label">${path.label}</div>`,
				className: 'custom-div-icon',
				iconSize: [0, 0],
				iconAnchor: iconAnchor
			}));
		}
		refreshPathsList();
		const header = container.closest('.context-menu').querySelector('.menu-title');
		if (header) header.textContent = `Path: ${path.label}`;
	};
	labelGroup.append(labelLabel, labelInput, createElement('span'));
	topControls.appendChild(labelGroup);

	const colorGroup = createElement('div', 'parameter-control');
	const colorLabel = createElement('label');
	colorLabel.textContent = 'Color';
	colorGroup.append(
		colorLabel,
		createColorPicker(path.color, (newColor) => {
			path.color = newColor;
			if (path.pathLine) path.pathLine.setStyle({ color: newColor });
			if (path.pathCircle) path.pathCircle.setStyle({ color: newColor });
			if (path.polygon) path.polygon.setStyle({ color: newColor });
			refreshPathsList();
			AppState.dispatch({ type: 'PATH_UPDATED', payload: { path } });
		}),
		createElement('span')
	);
	topControls.appendChild(colorGroup);

	const toleranceGroup = createElement('div', 'parameter-control');
	const toleranceLabel = createElement('label');
	toleranceLabel.textContent = 'Tolerance (m)';
	const toleranceSlider = createElement('input');
	toleranceSlider.type = 'range';
	toleranceSlider.min = '0';
	toleranceSlider.max = '200';
	toleranceSlider.step = '5';
	toleranceSlider.value = path.tolerance || 0;
	const toleranceDisplay = createElement('span', 'value-display');
	toleranceDisplay.textContent = `${path.tolerance || 0}m`;
	const updateTolerance = (val) => {
		path.tolerance = val;
		toleranceDisplay.textContent = `${val}m`;
		renderControlPath(path);
	};
	toleranceSlider.oninput = () => updateTolerance(parseFloat(toleranceSlider.value));
	makeValueEditable(toleranceDisplay, toleranceSlider, {
		modalSystem: ModalSystem,
		formatValue: (val) => `${val}m`,
		onUpdate: updateTolerance,
	});
	toleranceGroup.appendChild(toleranceLabel);
	toleranceGroup.appendChild(toleranceSlider);
	toleranceGroup.appendChild(toleranceDisplay);
	container.appendChild(toleranceGroup);

	container.appendChild(topControls);

	const echoGroup = createElement('div', 'parameter-group');
	const echoLabel = createElement('div', 'parameter-label');
	echoLabel.textContent = 'Echo Effect';
	echoGroup.appendChild(echoLabel);

	if (path.params.echo) {
		const echoSettings = UIBuilder.collapsibleSection({
			title: 'Echo Settings',
			icon: 'fa-assistive-listening-systems',
			expanded: path.params.echo.enabled,
			content: () => {
				const content = createElement('div');

				const enabledGroup = createElement('div', 'parameter-control');
				const enabledLabel = createElement('label');
				enabledLabel.textContent = 'Enabled';
				const enabledCheck = createElement('input');
				enabledCheck.type = 'checkbox';
				enabledCheck.checked = path.params.echo.enabled;
				enabledCheck.onchange = () => {
					path.params.echo.enabled = enabledCheck.checked;
					AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
				};
				enabledGroup.appendChild(enabledLabel);
				enabledGroup.appendChild(enabledCheck);
				content.appendChild(enabledGroup);

				const levelGroup = createElement('div', 'parameter-control');
				const levelLabel = createElement('label');
				levelLabel.textContent = 'Level';
				const levelSlider = createElement('input');
				levelSlider.type = 'range';
				levelSlider.min = 0;
				levelSlider.max = 1;
				levelSlider.step = 0.01;
				levelSlider.value = path.params.echo.level !== undefined ? path.params.echo.level : CONSTANTS.ECHO_LEVEL;
				const levelDisplay = createElement('span', 'value-display');
				levelDisplay.textContent = `${(levelSlider.value * 100).toFixed(0)}%`;
				levelSlider.oninput = () => {
					const value = parseFloat(levelSlider.value);
					path.params.echo.level = value;
					levelDisplay.textContent = `${(value * 100).toFixed(0)}%`;
				};
				levelGroup.append(levelLabel, levelSlider, levelDisplay);
				content.appendChild(levelGroup);

				const reflectGroup = createElement('div', 'parameter-control');
				const reflectLabel = createElement('label');
				reflectLabel.textContent = 'Reflectivity';
				const reflectSlider = createElement('input');
				reflectSlider.type = 'range';
				reflectSlider.min = 0;
				reflectSlider.max = 1;
				reflectSlider.step = 0.01;
				reflectSlider.value = path.params.echo.reflectivity !== undefined ? path.params.echo.reflectivity : CONSTANTS.ECHO_REFLECTIVITY;
				const reflectDisplay = createElement('span', 'value-display');
				reflectDisplay.textContent = `${(reflectSlider.value * 100).toFixed(0)}%`;
				reflectSlider.oninput = () => {
					const value = parseFloat(reflectSlider.value);
					path.params.echo.reflectivity = value;
					reflectDisplay.textContent = `${(value * 100).toFixed(0)}%`;
				};
				reflectGroup.append(reflectLabel, reflectSlider, reflectDisplay);
				content.appendChild(reflectGroup);

				const removeBtn = createButton('Remove Echo Effect', () => {
					delete path.params.echo;
					AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
					AppState.dispatch({ type: 'PATH_UPDATED', payload: { path } });
					const parentContainer = container.closest('.params-container');
					if (parentContainer) {
						parentContainer.innerHTML = '';
						renderPathSettingsTab(path, parentContainer);
					}
				}, 'delete-btn');
				content.appendChild(removeBtn);

				return content;
			}
		});
		echoGroup.appendChild(echoSettings);
	} else {
		const addEchoBtn = createButton('+ Add Echo Effect', () => {
			path.params.echo = {
				enabled: true,
				reflectivity: CONSTANTS.ECHO_REFLECTIVITY,
				level: CONSTANTS.ECHO_LEVEL
			};
			AppState.dispatch({ type: 'PATH_UPDATED', payload: { path } });
			const parentContainer = container.closest('.params-container');
			if (parentContainer) {
				parentContainer.innerHTML = '';
				renderPathSettingsTab(path, parentContainer);
			}
		}, 'btn-add');
		echoGroup.appendChild(addEchoBtn);
	}
	container.appendChild(echoGroup);

	const silencerGroup = createElement('div', 'parameter-group');
	const silencerLabel = createElement('div', 'parameter-label');
	silencerLabel.textContent = 'Silencer Effect';
	silencerGroup.appendChild(silencerLabel);

	if (path.params.silencer) {
		const silencerSettings = UIBuilder.collapsibleSection({
			title: 'Silencer Settings',
			icon: 'fa-volume-mute',
			expanded: true,
			content: () => {
				const content = createElement('div');

				const curveGroup = createElement('div', 'parameter-control');
				const curveLabel = createElement('label');
				curveLabel.textContent = 'Curve';
				const curveSlider = createElement('input');
				curveSlider.type = 'range';
				curveSlider.min = 0;
				curveSlider.max = 2;
				curveSlider.step = 0.01;
				const curveValue = path.params.silencer.curve !== undefined ? path.params.silencer.curve : 1.0;
				curveSlider.value = curveValue;
				const curveDisplay = createElement('span', 'value-display');
				curveDisplay.textContent = curveValue.toFixed(2);
				curveSlider.oninput = () => {
					const value = parseFloat(curveSlider.value);
					path.params.silencer.curve = value;
					curveDisplay.textContent = value.toFixed(2);
					AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
				};
				curveGroup.append(curveLabel, curveSlider, curveDisplay);
				content.appendChild(curveGroup);

				const removeBtn = createButton('Remove Silencer Effect', () => {
					delete path.params.silencer;
					AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
					AppState.dispatch({ type: 'PATH_UPDATED', payload: { path } });
					const parentContainer = container.closest('.params-container');
					if (parentContainer) {
						parentContainer.innerHTML = '';
						renderPathSettingsTab(path, parentContainer);
					}
				}, 'delete-btn');
				content.appendChild(removeBtn);

				return content;
			}
		});
		silencerGroup.appendChild(silencerSettings);
	} else {
		const addSilencerBtn = createButton('+ Add Silencer Effect', () => {
			path.params.silencer = { curve: 1.0 };
			AppState.dispatch({ type: 'PATH_UPDATED', payload: { path } });
			const parentContainer = container.closest('.params-container');
			if (parentContainer) {
				parentContainer.innerHTML = '';
				renderPathSettingsTab(path, parentContainer);
			}
		}, 'btn-add');
		silencerGroup.appendChild(addSilencerBtn);
	}
	container.appendChild(silencerGroup);

	const pathLength = computePathLength(path);
	const infoBox = createElement('div', 'path-info-box');
	infoBox.innerHTML = `<strong>Path length:</strong> ${pathLength.toFixed(1)} meters`;
	container.appendChild(infoBox);

	const relSpeedGroup = createElement('div', 'parameter-control');
	const relSpeedLabel = createElement('label');
	relSpeedLabel.textContent = 'Relative Speed';
	const relSpeedSlider = createElement('input');
	relSpeedSlider.type = 'range';
	relSpeedSlider.min = 0.1;
	relSpeedSlider.max = 3;
	relSpeedSlider.step = 0.1;
	relSpeedSlider.value = path.relativeSpeed ?? 1.0;
	const relSpeedDisplay = createElement('span', 'value-display');
	relSpeedDisplay.textContent = `${(path.relativeSpeed ?? 1.0).toFixed(1)}x`;
	const updateRelSpeed = (val) => {
		path.relativeSpeed = val;
		relSpeedDisplay.textContent = `${val.toFixed(1)}x`;
	};
	relSpeedSlider.oninput = () => updateRelSpeed(parseFloat(relSpeedSlider.value));
	makeValueEditable(relSpeedDisplay, relSpeedSlider, {
		modalSystem: ModalSystem,
		formatValue: (val) => `${val.toFixed(1)}x`,
		onUpdate: updateRelSpeed,
	});
	relSpeedGroup.append(relSpeedLabel, relSpeedSlider, relSpeedDisplay);
	container.appendChild(relSpeedGroup);

	if (isLinearPath(path)) {
		const smoothGroup = createElement('div', 'parameter-control');
		const smoothLabel = createElement('label');
		smoothLabel.textContent = 'Smoothing';
		const smoothSlider = createElement('input');
		smoothSlider.type = 'range';
		smoothSlider.min = 0;
		smoothSlider.max = 1;
		smoothSlider.step = 0.05;
		smoothSlider.value = path.smoothing ?? 0;
		const smoothDisplay = createElement('span', 'value-display');
		smoothDisplay.textContent = `${((path.smoothing ?? 0) * 100).toFixed(0)}%`;
		smoothSlider.oninput = () => {
			path.smoothing = parseFloat(smoothSlider.value);
			smoothDisplay.textContent = `${(path.smoothing * 100).toFixed(0)}%`;
			renderControlPath(path);
		};
		smoothGroup.append(smoothLabel, smoothSlider, smoothDisplay);
		container.appendChild(smoothGroup);
	}

	container.appendChild(createButton('Delete Path', async () => {
		if (await ModalSystem.confirm(`Delete path "${path.label}"?`, 'Delete Path')) {
			deleteControlPath(path);
			closeAllMenus();
		}
	}, 'delete-btn', { width: '100%' }));

	container.appendChild(createButton('Duplicate Path', () => {
		duplicatePath(path);
		closeAllMenus();
	}, 'btn-duplicate'));
}

export function renderPathModTab(path, container) {
	const posSection = UIBuilder.collapsibleSection({
		title: 'Position LFO',
		icon: 'fa-arrows-alt',
		expanded: true,
		content: () => {
			const content = createElement('div');
			['x', 'y'].forEach(axis => {
				const group = createElement('div', 'parameter-group');
				const label = createElement('div', 'parameter-label');
				label.textContent = `${axis.toUpperCase()} Position`;
				group.append(
					label,
					createParameterControl(PARAMETER_REGISTRY[`lfo_${axis}_range`], `lfo_${axis}_range`, path, null, { small: true }),
					createParameterControl(PARAMETER_REGISTRY[`lfo_${axis}_freq`], `lfo_${axis}_freq`, path, null, { small: true })
				);
				content.appendChild(group);
			});
			return content;
		}
	});
	container.appendChild(posSection);

	if (isCircularPath(path)) {
		const sizeSection = UIBuilder.collapsibleSection({
			title: 'Size LFO',
			icon: 'fa-ruler-combined',
			expanded: true,
			content: () => {
				const content = createElement('div');
				const group = createElement('div', 'parameter-group');
				const label = createElement('div', 'parameter-label');
				label.textContent = 'Size/Radius';
				group.append(
					label,
					createParameterControl(PARAMETER_REGISTRY['lfo_size_range'], `lfo_size_range`, path, null, { small: true }),
					createParameterControl(PARAMETER_REGISTRY['lfo_size_freq'], `lfo_size_freq`, path, null, { small: true })
				);
				content.appendChild(group);
				return content;
			}
		});
		container.appendChild(sizeSection);
	}
}
