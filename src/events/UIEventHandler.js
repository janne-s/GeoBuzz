import { AppState } from '../core/state/StateManager.js';
import { Selectors } from '../core/state/selectors.js';
import { GeolocationManager } from '../core/geospatial/GeolocationManager.js';
import { LayerManager } from '../layers/LayerManager.js';
import { ModalSystem } from '../ui/ModalSystem.js';

let context = null;

export function setUIEventHandlersContext(appContext) {
	context = appContext;
}

export function createUIEventHandlers({
	saveWorkspaceSettings,
	initWorkspace,
	updateWorkspaceUI,
	addSideMenuCloseButtons,
	finishLinePath,
	finishPolygonPath,
	finishSoundLine,
	cancelPathDrawing,
	cancelSoundDrawing,
	saveSettings,
	loadSettings,
	showFileManagerDialog,
	clearAll,
	changeMapStyle,
	updateOSCStatus,
	stopSimulation,
	detachUserFromPath,
	getRouteAndAnimate,
	helperMenu,
	controlMenu,
	Menus
}) {
	return {
		window: {
			beforeunload: () => {
				AppState.workspace.isInitializing = true;

				GeolocationManager.cleanup?.();
				Selectors.getSounds().forEach(context.AudioNodeManager.stopPlayback);

				if (AppState.intervals.oscStatus) {
					clearInterval(AppState.intervals.oscStatus);
					AppState.intervals.oscStatus = null;
				}

				saveWorkspaceSettings();

				if (AppState.intervals.audioUpdate) {
					clearInterval(AppState.intervals.audioUpdate);
					AppState.intervals.audioUpdate = null;
				}

				if (AppState.simulation.animationState.frameId) {
					cancelAnimationFrame(AppState.simulation.animationState.frameId);
					AppState.simulation.animationState.frameId = null;
				}

				if (AppState.simulation.userPathAnimationState.frameId) {
					cancelAnimationFrame(AppState.simulation.userPathAnimationState.frameId);
					AppState.simulation.userPathAnimationState.frameId = null;
				}

				if (Selectors.getSpatialMode() === 'ambisonics') {
					context.AmbisonicsManager.dispose();
				}

			}
		},

		document: {
			DOMContentLoaded: async () => {
				await initWorkspace();
				updateWorkspaceUI();
				addSideMenuCloseButtons();
			},

			click: (e) => {
				if (e.target.closest('.modal-overlay, .modal-dialog, .context-menu')) return;
				if (!Selectors.getActiveSideMenu()) return;

				const soundDialog = document.getElementById('soundDialog');
				const menuEntry = Object.entries(Menus).find(([, { menu }]) => menu === Selectors.getActiveSideMenu());

				if (menuEntry) {
					const [, { toggle, menu }] = menuEntry;
					if (!menu.contains(e.target) && !toggle.contains(e.target) && (!soundDialog || !soundDialog.contains(e.target))) {
						menu.classList.remove('active');
						AppState.ui.menuState.activeSideMenu = null;
					}
				}
			},

			keydown: (e) => {
				const mode = Selectors.getDrawingMode();
				if (e.key === 'Enter') {
					if (mode === 'line' && Selectors.getCurrentPathPoints().length >= 2) {
						finishLinePath();
					} else if (mode === 'polygon' && Selectors.getCurrentPathPoints().length >= 3) {
						finishPolygonPath();
					} else if (mode === 'sound_line' && AppState.drawing.currentSoundPoints?.length >= 2) {
						finishSoundLine();
					}
				} else if (e.key === 'Escape' && mode) {
					if (mode.startsWith('sound_')) {
						cancelSoundDrawing();
					} else {
						cancelPathDrawing();
					}
				}
			}
		},

		'#saveBtn': () => {
			saveSettings();
			helperMenu.classList.remove('active');
		},

		'#loadBtn': () => document.getElementById('loadInput').click(),

		'#manageSoundsBtn': () => {
			showFileManagerDialog();
			helperMenu.classList.remove('active');
		},

		'#clearAllBtn': async () => {
			if (await ModalSystem.confirm('This will delete all elements in the workspace. Continue?', 'Clear All Elements')) {
				clearAll();
				helperMenu.classList.remove('active');
			}
		},

		'#copyWorkspaceBtn': async (e) => {
			e.stopPropagation();
			const urlInput = document.getElementById('workspaceUrl');
			const btn = e.currentTarget;

			try {
				await navigator.clipboard.writeText(urlInput.value);
				const originalHTML = btn.innerHTML;
				btn.innerHTML = '<i class="fas fa-check"></i>';
				setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
			} catch (err) {
				urlInput.select();
				document.execCommand('copy');
			}
		},

		'#addLayerBtn': async (e) => {
			e.stopPropagation();
			e.preventDefault();

			const layerName = await ModalSystem.prompt('Enter layer name:', `Layer ${LayerManager.nextLayerId}`, 'Add New Layer');
			if (layerName && layerName !== 'cancel') LayerManager.addUserLayer(layerName);
		},

		'#layer-sounds': () => LayerManager.toggle('sounds'),
		'#layer-control': () => LayerManager.toggle('control'),

		'#addSequencerBtn': () => {
			const { SequencerUIManager } = context;
			const centerPoint = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
			SequencerUIManager.showSequencerPanel(centerPoint);
			SequencerUIManager.refreshSequencersList();
			controlMenu.classList.remove('active');
		},

		'#addSoundCircleBtn': () => {
			const { startSoundShapeDrawing } = context;
			startSoundShapeDrawing('circle');
			controlMenu.classList.remove('active');
		},

		'#addSoundPolygonBtn': () => {
			const { startSoundShapeDrawing } = context;
			startSoundShapeDrawing('polygon');
			controlMenu.classList.remove('active');
		},

		'#addSoundLineBtn': () => {
			const { startSoundShapeDrawing } = context;
			startSoundShapeDrawing('line');
			controlMenu.classList.remove('active');
		},

		'#addSoundOvalBtn': () => {
			const { startSoundShapeDrawing } = context;
			startSoundShapeDrawing('oval');
			controlMenu.classList.remove('active');
		},

		'#addLinePathBtn': () => {
			const { startLinePathDrawing } = context;
			startLinePathDrawing();
			controlMenu.classList.remove('active');
		},

		'#addCirclePathBtn': () => {
			const { startCirclePathDrawing } = context;
			startCirclePathDrawing();
			controlMenu.classList.remove('active');
		},

		'#addPolygonPathBtn': () => {
			const { startPolygonPathDrawing } = context;
			startPolygonPathDrawing();
			controlMenu.classList.remove('active');
		},

		'#addOvalPathBtn': () => {
			const { startOvalPathDrawing } = context;
			startOvalPathDrawing();
			controlMenu.classList.remove('active');
		},

		'#loadInput:change': loadSettings,

		'#importBuzzZipBtn': () => {
			document.getElementById('importBuzzInput').click();
		},

		'#importBuzzInput:change': async (e) => {
			const file = e.target.files[0];
			if (!file) return;

			try {
				const result = await context.packageImporter.import(file);

				if (result) {
					let message = 'Import complete!\n\n';

					if (result.soundsImported > 0 || result.soundsSkipped > 0 || result.soundsRenamed > 0) {
						message += 'Sounds:\n';
						if (result.soundsImported > 0) message += `• ${result.soundsImported} imported\n`;
						if (result.soundsSkipped > 0) message += `• ${result.soundsSkipped} skipped (existing)\n`;
						if (result.soundsRenamed > 0) message += `• ${result.soundsRenamed} renamed\n`;
					}

					if (result.elementsImported > 0) {
						message += `\nElements: ${result.elementsImported} imported`;
					}

					await ModalSystem.alert(message, 'Import Complete');
				}
			} catch (error) {
				await ModalSystem.alert(`Import failed:\n${error.message}`, 'Import Error');
				console.error('Buzz import error:', error);
			}

			e.target.value = '';
			helperMenu.classList.remove('active');
		},

		'#exportBuzzZipBtn': async () => {
			const title = await ModalSystem.prompt('Buzz Title:', 'Untitled Buzz', 'Export Buzz ZIP');
			if (title === null) {
				helperMenu.classList.remove('active');
				return;
			}

			const author = await ModalSystem.prompt('Author Name:', 'Anonymous', 'Export Buzz ZIP');
			if (author === null) {
				helperMenu.classList.remove('active');
				return;
			}

			const description = await ModalSystem.prompt('Description (optional):', '', 'Export Buzz ZIP');
			if (description === null) {
				helperMenu.classList.remove('active');
				return;
			}

			const meta = {
				title: title || 'Untitled Buzz',
				author: author || 'Anonymous',
				description: description || ''
			};

			try {
				await context.packageExporter.export(meta);

				const filename = meta.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.zip';
				await ModalSystem.alert(
					`Buzz package exported!\n\nFile: ${filename}\n\nContains:\n• buzz.json (your buzz data)\n• index.html (player boilerplate - customize!)\n• player-styles.css (customize!)\n• src/ (GeoBuzz Runtime Engine)\n• README.txt (customization guide)\n\nThe player is a customizable boilerplate.\nSee README.txt for API docs and tips!`,
					'Export Complete'
				);
			} catch (error) {
				if (error.message !== 'Export cancelled') {
					await ModalSystem.alert(
						`Export failed:\n${error.message}`,
						'Export Error'
					);
					console.error('Package export error:', error);
				}
			}

			helperMenu.classList.remove('active');
		},

		'#mapStyleSelect:change': (e) => changeMapStyle(e.target.value),

		'#oscEnableToggle:change': (e) => {
			if (e.target.checked) {
				context.OSCManager.config.host = document.getElementById('oscHost').value;
				context.OSCManager.config.port = parseInt(document.getElementById('oscPort').value);
				context.OSCManager.connect();
			} else {
				context.OSCManager.disconnect();
			}
			updateOSCStatus();
			AppState.dispatch({ type: 'PARAMETER_CHANGED', payload: { paramKey: 'oscEnabled', value: e.target.checked } });
		},

		'#oscHost:input': (e) => {
			const wasEnabled = context.OSCManager.enabled;
			context.OSCManager.config.host = e.target.value;
			if (wasEnabled) {
				context.OSCManager.disconnect();
				context.OSCManager.connect();
			}
			AppState.dispatch({ type: 'PARAMETER_CHANGED', payload: { paramKey: 'oscHost', value: e.target.value } });
		},

		'#oscPort:input': (e) => {
			const wasEnabled = context.OSCManager.enabled;
			context.OSCManager.config.port = parseInt(e.target.value);
			if (wasEnabled) {
				context.OSCManager.disconnect();
				context.OSCManager.connect();
			}
			AppState.dispatch({ type: 'PARAMETER_CHANGED', payload: { paramKey: 'oscPort', value: parseInt(e.target.value) } });
		},

		'#relativePositioningToggle:change': (e) => {
			AppState.dispatch({ type: 'PARAMETER_CHANGED', payload: { paramKey: 'relativePositioning', value: e.target.checked } });
		},

		'#oscTestBtn': () => {
			context.OSCManager.send('/geobuzz/test/ping', 1.0);
		},

		'#cancelSimulationBtn': () => {
			if (Selectors.getUserAttachedPathId()) {
				detachUserFromPath();
			} else {
				stopSimulation();
			}
		},

		'#speedSelect:change': (e) => {
			if (Selectors.isSimulationActive()) {
				const prevSpeedMs = (AppState.simulation.speedKmh * 1000) / 3600;
				const now = performance.now();
				const distanceTravelled = prevSpeedMs * ((now - AppState.simulation.animationState.startTime) / 1000);
				AppState.simulation.speedKmh = parseFloat(e.target.value);
				const newSpeedMs = (AppState.simulation.speedKmh * 1000) / 3600;
				if (newSpeedMs > 0) {
					AppState.simulation.animationState.startTime = now - (distanceTravelled / newSpeedMs) * 1000;
				}
			} else {
				AppState.simulation.speedKmh = parseFloat(e.target.value);
			}
		},

		'#calculateRouteBtn': () => {
			if (Selectors.getSimulationTarget()) {
				getRouteAndAnimate();
			} else {
				const statusText = document.getElementById('simulationStatusText');
				if (statusText) statusText.textContent = 'Please place a target.';
			}
		}
	};
}

export async function unlockAudio() {
	if (!Selectors.isAudioReady()) {
		const success = await context.AudioContextManager.initialize();
		if (success) {
			if (context.AmbisonicsManager && context.AudioContextManager.nativeContext) {
				context.AmbisonicsManager.setAudioContext(context.AudioContextManager.nativeContext);
			}
			if (context.StreamManager && context.AudioContextManager.nativeContext) {
				context.StreamManager.setAudioContext(context.AudioContextManager.nativeContext);
			}
			AppState.dispatch({ type: 'AUDIO_READY' });
		}
	}
}
