import { createElement, createButton } from '../domHelpers.js';
import { createDraggableHeader, createElementNavigationDropdown } from '../controllers/HeaderBuilder.js';
import { createMenuStructure, createHeaderControls, createSpatialSection, createTabBar, createParamsContainer, createActionButtons } from '../controllers/UIBuilder.js';
import { MenuTabs } from '../components/MenuTabsRegistry.js';
import { SYNTH_REGISTRY } from '../../core/audio/SynthRegistry.js';
import { DEFAULT_FX_STRUCTURE, DEFAULT_EQ_STRUCTURE, DEFAULT_LFO_STRUCTURE } from '../../config/defaults.js';
import { deepClone } from '../../core/utils/math.js';
import { waitForNextFrame } from '../../core/utils/async.js';

let AppState, Selectors, MenuManager, ModalSystem, AudioNodeManager, StreamManager, FXManager, GeolocationManager;
let closeAllMenus, destroySound, stopLoopedPlayback, isFileSynth;
let initializeSynthParameters, getSynthCapabilities, updateAudio, autoLoadSoundFile, _applySoundFilePlaybackParams;
let reconnectSoundToLayers, refreshElementsList;

export function setContext(context) {
	AppState = context.AppState;
	Selectors = context.Selectors;
	MenuManager = context.MenuManager;
	ModalSystem = context.ModalSystem;
	AudioNodeManager = context.AudioNodeManager;
	StreamManager = context.StreamManager;
	FXManager = context.FXManager;
	GeolocationManager = context.GeolocationManager;
	closeAllMenus = context.closeAllMenus;
	destroySound = context.destroySound;
	stopLoopedPlayback = context.stopLoopedPlayback;
	isFileSynth = context.isFileSynth;
	initializeSynthParameters = context.initializeSynthParameters;
	getSynthCapabilities = context.getSynthCapabilities;
	updateAudio = context.updateAudio;
	autoLoadSoundFile = context.autoLoadSoundFile;
	_applySoundFilePlaybackParams = context._applySoundFilePlaybackParams;
	reconnectSoundToLayers = context.reconnectSoundToLayers;
	refreshElementsList = context.refreshElementsList;
}

export function showSoundMenu(point, marker, keepMenusOpen = false) {
	if (!keepMenusOpen) {
		closeAllMenus();
	}

	const obj = AppState.getSound(marker._leaflet_id);
	if (!obj) return;

	const menuLayout = [
		{ key: 'headerControls', builder: createHeaderControls },
		{ key: 'spatial', builder: createSpatialSection },
		{ key: 'tabBar', builder: createTabBar },
		{ key: 'paramsContainer', builder: createParamsContainer },
		{ key: 'actionButtons', builder: createActionButtons }
	];

	const { menu, overlay } = createMenuStructure(point);
	menu.dataset.soundId = obj.id;
	if (!keepMenusOpen) {
		overlay.onclick = closeAllMenus;
	} else {
		overlay.onclick = () => MenuManager.closeTop();
	}

	menu.addEventListener('input', () => {
		AppState.dispatch({ type: 'SOUND_UPDATED', payload: { sound: obj } });
	});
	menu.addEventListener('change', () => {
		AppState.dispatch({ type: 'SOUND_UPDATED', payload: { sound: obj } });
	});

	const { header, cleanup: headerCleanup } = createDraggableHeader(
		menu,
		'Sound Settings',
		createElementNavigationDropdown(obj, 'sound')
	);
	menu.appendChild(header);

	const menuData = Selectors.getTopMenu();
	if (menuData && menuData.menu === menu) {
		menuData.headerCleanup = headerCleanup;
		menuData.intervals = [];
		menu._menuData = menuData;
	}

	const elements = {};
	menuLayout.forEach(section => {
		const element = section.builder(obj);
		elements[section.key] = element;
		menu.appendChild(element);
	});

	document.body.appendChild(menu);

	showMenuTab(obj, elements.paramsContainer, Selectors.getCurrentTab(), elements.tabBar);

	if (menu._menuData) delete menu._menuData;
}

export function showMenuTab(obj, container, tabId, tabBar) {
	AppState.ui.menuState.currentTab = tabId;

	tabBar.querySelectorAll('button').forEach(btn => {
		btn.classList.toggle('active', btn.dataset.tabId === tabId);
	});

	container.innerHTML = '';

	if (MenuTabs[tabId]) {
		MenuTabs[tabId].render(obj, container);
	} else {
		console.warn(`Unknown tab: ${tabId}`);
	}
}

export async function changeSoundType(obj, newType) {
	if (!SYNTH_REGISTRY[newType]) {
		console.error(`Unknown synth type: ${newType}`);
		return;
	}

	const oldType = obj.type;

	const preservedData = {
		fx: obj.params.fx ? deepClone(obj.params.fx) : deepClone(DEFAULT_FX_STRUCTURE),
		eq: obj.params.eq ? deepClone(obj.params.eq) : deepClone(DEFAULT_EQ_STRUCTURE),
		reflections: obj.params.reflections ? deepClone(obj.params.reflections) : undefined,
		fileName: obj.params.soundFile || null,
		streamUrl: obj.params.streamUrl || null,
		lfo: obj.params.lfo ? deepClone(obj.params.lfo) : deepClone(DEFAULT_LFO_STRUCTURE),
		samplerMode: obj.params.samplerMode || 'single',
		gridSamples: obj.params.gridSamples ? deepClone(obj.params.gridSamples) : {}
	};

	AudioNodeManager.stopPlayback(obj);
	obj.isReady = false;

	if (oldType === 'StreamPlayer') {
		StreamManager.cleanupStream(obj);
	} else if (oldType === 'SoundFile') {
		stopLoopedPlayback(obj);
	}

	FXManager.disposeAll(obj, { isLayer: false });
	AudioNodeManager.disposeNodes([obj.synth, obj.gain, obj.envelopeGain, obj.filter, obj.panner, obj.loopFadeGain, obj.eq]);
	await waitForNextFrame();

	if (newType === 'NoiseSynth') {
		obj.params.selectedNotes = [];
		obj.params.polyphony = 1;
		if (Selectors.getCurrentTab() === 'keyboard') {
			AppState.ui.menuState.currentTab = 'sound';
		}
	}

	try {
		obj.fx1 = obj.fx2 = obj.fx3 = null;

		const preservedParams = {
			detune: obj.params.detune || 0,
			portamento: obj.params.portamento || 0,
			harmonicity: obj.params.harmonicity || 1,
			pulseWidth: obj.params.pulseWidth || 0.5,
			count: obj.params.count || 3,
			spread: obj.params.spread || 20,
			resonance: obj.params.resonance || 1,
			pan: obj.params.pan || 0
		};

		const newParams = initializeSynthParameters(newType, obj.role, {
			...obj.params,
			...preservedParams,
			fx: preservedData.fx,
			eq: preservedData.eq,
			lfo: preservedData.lfo
		});

		if (newType === 'Sampler') {
			newParams.samplerMode = preservedData.samplerMode;
			newParams.gridSamples = preservedData.gridSamples;
			if (preservedData.samplerMode === 'single') {
				newParams.soundFile = preservedData.fileName;
			}
		}

		obj.params = newParams;

		const { synth, gain, envelopeGain, filter, panner, eq, loopFadeGain } = AudioNodeManager.createAudioChain(newType, obj.params, Selectors.getSpatialMode());

		Object.assign(obj, {
			synth,
			gain,
			envelopeGain,
			filter,
			panner,
			eq,
			loopFadeGain,
			type: newType,
			isPlaying: false,
			_synthType: newType,
			_capabilities: getSynthCapabilities(newType)
		});

		obj.fx1 = obj.fx2 = obj.fx3 = null;

		await FXManager.restoreChain(obj, { isLayer: false });

		obj.label = AppState.getAutoName(newType, obj.role);

		if (newType === 'SoundFile' && preservedData.fileName) {
			await autoLoadSoundFile(obj, preservedData.fileName);
			_applySoundFilePlaybackParams(obj, false);
		} else if (newType === 'Sampler' && preservedData.samplerMode === 'single' && preservedData.fileName) {
			await autoLoadSoundFile(obj, preservedData.fileName);
		} else if (newType === 'Sampler' && preservedData.samplerMode === 'grid' && Object.keys(preservedData.gridSamples).length > 0) {
		await new Promise((resolve) => {
			const checkLoaded = () => {
				if (obj.synth._buffers && obj.synth._buffers._buffers) {
					let allLoaded = true;
					obj.synth._buffers._buffers.forEach(buffer => {
						if (!buffer.loaded) allLoaded = false;
					});
					if (allLoaded) {
						obj.isReady = true;

						resolve();
					} else {
						setTimeout(checkLoaded, 100);
					}
				} else {
					setTimeout(checkLoaded, 100);
				}
			};
			checkLoaded();
		});
		} else if (newType === 'StreamPlayer' && preservedData.streamUrl) {
			obj.params.streamUrl = preservedData.streamUrl;
			await StreamManager.initializeStream(obj);
			obj.isReady = true;
		const userPos = GeolocationManager.getUserPosition();
		if (userPos) {
			obj.wasInsideArea = false;
			await waitForNextFrame();
			updateAudio(userPos);
		}
		} else if (!isFileSynth({ type: newType })) {
			obj.isReady = true;
			const userPos = GeolocationManager.getUserPosition();
			if (userPos) {
				obj.wasInsideArea = false;
				await waitForNextFrame();
				updateAudio(userPos);
			}
		}

		reconnectSoundToLayers(obj);
		refreshElementsList();


	} catch (error) {
		console.error(`Error switching to ${newType}:`, error);
		await changeSoundType(obj, 'Synth');
	}

	AppState.dispatch({
		type: 'SOUND_TYPE_CHANGED',
		payload: {
			sound: obj,
			oldType: oldType,
			newType: newType
		}
	});
}

export function updateSoundLabel(obj, newLabel) {
	obj.label = newLabel;
	if (obj.labelMarker) {
		const newIcon = L.divIcon({
			html: `<div class="sound-label">${newLabel}</div>`,
			className: 'sound-label-marker',
			iconSize: [0, 0],
			iconAnchor: [0, 0]
		});
		obj.labelMarker.setIcon(newIcon);
	}
	refreshElementsList();
}

export function updateSpatialAudio(obj) {
	AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
}

export async function deleteSound(obj) {
	const shouldDelete = await ModalSystem.confirm(
		`Delete sound "${obj.label}"?\n\nThis action cannot be undone.`,
		'Delete Sound'
	);

	if (shouldDelete) {
		destroySound(obj);
		AppState.dispatch({
			type: 'SOUND_REMOVED',
			payload: { sound: obj }
		});
	}
}

export async function ensureAudioContext() {
	if (Tone.context.state !== 'running') {
		try {
			await Tone.context.resume();

		} catch (error) {
			console.warn('Could not resume audio context:', error);
		}
	}
}
