import { AppState } from '../core/state/StateManager.js';
import { Selectors } from '../core/state/selectors.js';
import { CONSTANTS } from '../core/constants.js';
import { SYNTH_REGISTRY } from '../core/audio/SynthRegistry.js';
import { initializeSynthParameters } from '../core/audio/SynthRegistry.js';
import { getUserMovementSpeed } from '../core/audio/AudioEngine.js';
import { destroySound } from '../core/audio/SoundLifecycle.js';
import { setSequencerControl } from '../core/audio/SoundCreation.js';
import { DistanceSequencer } from '../core/audio/DistanceSequencer.js';
import { createElement, createButton, createSelect } from './domHelpers.js';
import { ModalSystem } from './ModalSystem.js';
import { MenuManager } from './controllers/MenuManager.js';
import { createDraggableHeader, createElementNavigationDropdown } from './controllers/HeaderBuilder.js';
import { createMenuStructure } from './controllers/UIBuilder.js';
import { hasKeyboard } from '../core/utils/typeChecks.js';

export class SequencerUIManager {
	constructor(appContext) {
		this.appContext = appContext;
		this._sustainDrag = null;
		this._isPointerDown = false;
		document.addEventListener('mousedown', () => { this._isPointerDown = true; });
		document.addEventListener('mouseup', () => { this._isPointerDown = false; this._sustainDrag = null; });
	}

	showSequencerPanel(point, sequencer = null) {
		this.appContext.closeAllMenus();

		const isNew = !sequencer;
		if (isNew) {
			sequencer = new DistanceSequencer();
			AppState.dispatch({ type: 'SEQUENCER_ADDED', payload: { sequencer } });
		}

		const { menu, overlay } = createMenuStructure(point);
		menu.addEventListener('click', e => e.stopPropagation());

		menu.addEventListener('input', () => {
			AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
		});
		menu.addEventListener('change', () => {
			AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
		});

		const { header, cleanup: headerCleanup } = createDraggableHeader(
			menu,
			'Distance Sequencer',
			createElementNavigationDropdown(sequencer, 'sequencer')
		);
		menu.appendChild(header);

		const menuData = Selectors.getTopMenu();
		if (menuData && menuData.menu === menu) {
			menuData.headerCleanup = headerCleanup;
			menuData.intervals = [];
			menu._menuData = menuData;
		}

		const topControlsContainer = createElement('div', 'context-menu-header-controls');

		const labelGroup = createElement('div', 'parameter-control');
		const labelLabel = createElement('label');
		labelLabel.textContent = 'Label';
		const labelInput = createElement('input');
		labelInput.type = 'text';
		labelInput.value = sequencer.label;
		labelInput.oninput = () => {
			sequencer.label = labelInput.value || sequencer.label;
			this.refreshSequencersList();
			const navSelect = menu.querySelector('.element-nav-dropdown select');
			if (navSelect && navSelect.selectedOptions[0]) {
				navSelect.selectedOptions[0].textContent = sequencer.label;
			}
		};
		labelGroup.appendChild(labelLabel);
		labelGroup.appendChild(labelInput);
		topControlsContainer.appendChild(labelGroup);

		menu.appendChild(topControlsContainer);

		const tabBar = createElement('div', 'tab-bar');
		const tracksTabBtn = createElement('button');
		tracksTabBtn.textContent = 'Tracks';
		tracksTabBtn.classList.add('active');
		const spatialTabBtn = createElement('button');
		spatialTabBtn.textContent = 'Spatial';

		const tracksTabContent = createElement('div', 'tab-content');
		tracksTabContent.classList.add('active');
		const spatialTabContent = createElement('div', 'tab-content');

		tracksTabBtn.onclick = () => {
			tracksTabBtn.classList.add('active');
			spatialTabBtn.classList.remove('active');
			tracksTabContent.classList.add('active');
			spatialTabContent.classList.remove('active');
		};

		spatialTabBtn.onclick = () => {
			spatialTabBtn.classList.add('active');
			tracksTabBtn.classList.remove('active');
			spatialTabContent.classList.add('active');
			tracksTabContent.classList.remove('active');
		};

		tabBar.appendChild(tracksTabBtn);
		tabBar.appendChild(spatialTabBtn);
		menu.appendChild(tabBar);

		const pathListContainer = createElement('div', 'path-checkbox-list');

		const updateAreaStatus = () => {
			const userPos = this.appContext.GeolocationManager.getUserPosition();
			const wasInside = sequencer.insideArea;

			if (userPos && sequencer.activePaths.length > 0) {
				sequencer.insideArea = this.appContext.PathZoneChecker.checkActivePaths(userPos, sequencer.activePaths);
			}

			if (wasInside && !sequencer.insideArea) {
				sequencer._releaseAllNotes();
			}

			const areaStatus = sequencer.activePaths.length === 0 ?
				'Anywhere' :
				(sequencer.insideArea ? 'Inside' : 'Outside');

			const statusDiv = menu.querySelector('.sequencer-status');
			if (statusDiv) {
				statusDiv.innerHTML = `
				<strong>Status:</strong> Step ${sequencer.currentStep + 1}/${sequencer.numSteps}
				<strong>Distance:</strong> ${sequencer.totalDistance.toFixed(1)}m
				<strong>Area:</strong> ${areaStatus}
			`;
			}
		};

		if (Selectors.getPaths().length === 0 && Selectors.getSounds().length === 0) {
			const noPathsMsg = createElement('div', 'info-message');
			noPathsMsg.textContent = 'No spatial elements available';
			pathListContainer.appendChild(noPathsMsg);
		} else {
			Selectors.getPaths().forEach(path => {
				pathListContainer.appendChild(this.createSelectionRow(path, sequencer, 'path', updateAreaStatus));
			});

			Selectors.getSounds().forEach(sound => {
				pathListContainer.appendChild(this.createSelectionRow(sound, sequencer, 'sound', updateAreaStatus));
			});
		}

		spatialTabContent.appendChild(pathListContainer);

		const resumeGroup = createElement('div', 'parameter-control');
		resumeGroup.style.marginTop = '15px';
		const resumeLabel = createElement('label');
		resumeLabel.textContent = 'Resume on Re-enter';
		const resumeToggle = createElement('input');
		resumeToggle.type = 'checkbox';
		resumeToggle.checked = sequencer.resumeOnReenter;
		resumeToggle.onchange = () => {
			sequencer.resumeOnReenter = resumeToggle.checked;
		};
		resumeGroup.appendChild(resumeLabel);
		resumeGroup.appendChild(resumeToggle);
		spatialTabContent.appendChild(resumeGroup);

		const restartGroup = createElement('div', 'parameter-control');
		const restartLabel = createElement('label');
		restartLabel.textContent = 'Restart on Re-enter';
		const restartToggle = createElement('input');
		restartToggle.type = 'checkbox';
		restartToggle.checked = sequencer.restartOnReenter;
		restartToggle.onchange = () => {
			sequencer.restartOnReenter = restartToggle.checked;
		};
		restartGroup.appendChild(restartLabel);
		restartGroup.appendChild(restartToggle);
		spatialTabContent.appendChild(restartGroup);

		const sceneChangeHeader = createElement('div', 'section-header');
		sceneChangeHeader.textContent = 'Scene Changes';
		spatialTabContent.appendChild(sceneChangeHeader);

		const sceneChangeContainer = createElement('div', 'path-checkbox-list');
		spatialTabContent.appendChild(sceneChangeContainer);

		const baseSceneGroup = createElement('div', 'parameter-control');
		const baseSceneLabel = createElement('label');
		baseSceneLabel.textContent = 'Base Scene';
		const baseSceneSelect = createElement('select', 'scene-change-scene-select');
		baseSceneSelect.onchange = (e) => {
			sequencer.baseSceneIndex = parseInt(e.target.value);
			AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
		};
		baseSceneGroup.appendChild(baseSceneLabel);
		baseSceneGroup.appendChild(baseSceneSelect);
		spatialTabContent.appendChild(baseSceneGroup);

		const refreshSceneChangeUI = () => {
			sceneChangeContainer.innerHTML = '';
			const hasSpatialElements = Selectors.getPaths().length > 0 || Selectors.getSounds().length > 0;
			const hasScenes = sequencer.scenes.length > 1;

			if (!hasSpatialElements) {
				const msg = createElement('div', 'info-message');
				msg.textContent = 'No spatial elements available';
				sceneChangeContainer.appendChild(msg);
			} else if (!hasScenes) {
				const msg = createElement('div', 'info-message');
				msg.textContent = 'Add more scenes to use scene changes';
				sceneChangeContainer.appendChild(msg);
			} else {
				Selectors.getPaths().forEach(path => {
					sceneChangeContainer.appendChild(this.createSceneChangeRow(path, sequencer, 'path'));
				});
				Selectors.getSounds().forEach(sound => {
					sceneChangeContainer.appendChild(this.createSceneChangeRow(sound, sequencer, 'sound'));
				});
			}

			baseSceneSelect.innerHTML = '';
			sequencer.scenes.forEach((s, i) => {
				const opt = document.createElement('option');
				opt.value = i;
				opt.textContent = s.name;
				opt.selected = i === sequencer.baseSceneIndex;
				baseSceneSelect.appendChild(opt);
			});
			baseSceneSelect.disabled = !hasScenes;
		};
		refreshSceneChangeUI();

		menu.appendChild(spatialTabContent);
		menu.appendChild(tracksTabContent);

		const row1Container = createElement('div', 'sequencer-controls-row');

		const enableGroup = createElement('div', 'parameter-control');
		const enableLabel = createElement('label');
		enableLabel.textContent = 'Enabled';
		const enableToggle = createElement('input');
		enableToggle.type = 'checkbox';
		enableToggle.checked = sequencer.enabled;
		enableToggle.onchange = () => {
			sequencer.enabled = enableToggle.checked;
			if (!sequencer.enabled) {
				sequencer.reset();
			}
		};
		enableGroup.appendChild(enableLabel);
		enableGroup.appendChild(enableToggle);
		row1Container.appendChild(enableGroup);

		const loopGroup = createElement('div', 'parameter-control');
		const loopLabel = createElement('label');
		loopLabel.textContent = 'Loop';
		const loopToggle = createElement('input');
		loopToggle.type = 'checkbox';
		loopToggle.checked = sequencer.loop;
		loopToggle.onchange = () => {
			sequencer.loop = loopToggle.checked;
		};
		loopGroup.appendChild(loopLabel);
		loopGroup.appendChild(loopToggle);
		row1Container.appendChild(loopGroup);

		const stepsGroup = createElement('div', 'parameter-control');
		const stepsLabel = createElement('label');
		stepsLabel.textContent = 'Steps';
		const stepsInput = createElement('input');
		stepsInput.type = 'number';
		stepsInput.min = CONSTANTS.SEQUENCER_MIN_STEPS;
		stepsInput.max = CONSTANTS.SEQUENCER_MAX_STEPS;
		stepsInput.value = sequencer.numSteps;
		stepsInput.style.width = '60px';
		stepsInput.oninput = () => {
			let newCount = parseInt(stepsInput.value);
			if (isNaN(newCount) || newCount < CONSTANTS.SEQUENCER_MIN_STEPS) {
				newCount = CONSTANTS.SEQUENCER_MIN_STEPS;
				stepsInput.value = newCount;
			}
			if (newCount > CONSTANTS.SEQUENCER_MAX_STEPS) {
				newCount = CONSTANTS.SEQUENCER_MAX_STEPS;
				stepsInput.value = newCount;
			}

			const oldCount = sequencer.numSteps;
			sequencer.numSteps = newCount;

			sequencer.tracks.forEach(track => {
				delete track.numSteps;

				if (newCount > oldCount) {
					for (let i = oldCount; i < newCount; i++) {
						track.steps.push({ notes: [], sustains: [], velocity: 0.8 });
					}
				}

				if (track.currentStep >= newCount) {
					track.currentStep = newCount - 1;
				}
			});

			this.refreshSequencerPanel(menu, sequencer);
		};
		stepsGroup.appendChild(stepsLabel);
		stepsGroup.appendChild(stepsInput);
		row1Container.appendChild(stepsGroup);

		tracksTabContent.appendChild(row1Container);

		const row2Container = createElement('div', 'sequencer-slider-row');

		const lengthLabel = createElement('label');
		lengthLabel.textContent = 'Step Length';
		const lengthSlider = createElement('input');
		lengthSlider.type = 'range';
		lengthSlider.min = 5;
		lengthSlider.max = 100;
		lengthSlider.value = sequencer.stepLength;
		const lengthDisplay = createElement('span', 'value-display');
		lengthDisplay.textContent = `${sequencer.stepLength}m`;
		lengthSlider.oninput = () => {
			sequencer.stepLength = parseInt(lengthSlider.value);
			lengthDisplay.textContent = `${sequencer.stepLength}m`;

			sequencer.tracks.forEach(track => {
				if (track.offsetMode === 'division' && track.offsetFraction !== undefined) {
					track.offset = track.offsetFraction * sequencer.stepLength;
				} else if (track.offsetMode === 'steps' && track.offsetSteps !== undefined) {
					track.offset = track.offsetSteps * sequencer.stepLength;
				}
			});

			this.refreshTracksUI(tracksContainer, sequencer);
		};

		row2Container.appendChild(lengthLabel);
		row2Container.appendChild(lengthSlider);
		row2Container.appendChild(lengthDisplay);

		tracksTabContent.appendChild(row2Container);

		const row3Container = createElement('div', 'sequencer-slider-row');

		const thresholdLabel = createElement('label');
		thresholdLabel.textContent = 'Speed Threshold';
		const thresholdSlider = createElement('input');
		thresholdSlider.type = 'range';
		thresholdSlider.min = 0;
		thresholdSlider.max = 5;
		thresholdSlider.step = 0.1;
		thresholdSlider.value = sequencer.speedThreshold;
		const thresholdDisplay = createElement('span', 'value-display');
		thresholdDisplay.textContent = `${sequencer.speedThreshold.toFixed(1)}m/s`;
		thresholdSlider.oninput = () => {
			const oldThreshold = sequencer.speedThreshold;
			const newThreshold = parseFloat(thresholdSlider.value);
			sequencer.speedThreshold = newThreshold;
			thresholdDisplay.textContent = `${sequencer.speedThreshold.toFixed(1)}m/s`;

			if (newThreshold > oldThreshold && sequencer.releaseOnStop) {
				const currentSpeed = getUserMovementSpeed();
				if (currentSpeed < newThreshold) {
					sequencer._releaseAllNotes();
				}
			}
		};

		row3Container.appendChild(thresholdLabel);
		row3Container.appendChild(thresholdSlider);
		row3Container.appendChild(thresholdDisplay);

		tracksTabContent.appendChild(row3Container);

		const row4Container = createElement('div', 'sequencer-slider-row');

		const releaseGroup = createElement('div', 'parameter-control');
		const releaseLabel = createElement('label');
		releaseLabel.textContent = 'Release on Stop';
		const releaseToggle = createElement('input');
		releaseToggle.type = 'checkbox';
		releaseToggle.checked = sequencer.releaseOnStop;
		releaseToggle.onchange = () => {
			sequencer.releaseOnStop = releaseToggle.checked;

			if (releaseToggle.checked) {
				const currentSpeed = getUserMovementSpeed();
				if (currentSpeed < sequencer.speedThreshold) {
					sequencer._releaseAllNotes();
				}
			}
		};
		releaseGroup.appendChild(releaseLabel);
		releaseGroup.appendChild(releaseToggle);
		row4Container.appendChild(releaseGroup);

		const releaseDelayGroup = createElement('div', 'parameter-control');
		releaseDelayGroup.style.flex = '1';
		releaseDelayGroup.style.marginLeft = '20px';
		const releaseDelayLabel = createElement('label');
		releaseDelayLabel.textContent = 'R. Delay';
		const releaseDelaySlider = createElement('input');
		releaseDelaySlider.type = 'range';
		releaseDelaySlider.min = '0';
		releaseDelaySlider.max = '60';
		releaseDelaySlider.step = '0.5';
		releaseDelaySlider.value = sequencer.releaseDelay;
		releaseDelaySlider.style.flex = '1';
		const releaseDelayDisplay = createElement('span', 'value-display');
		releaseDelayDisplay.textContent = `${sequencer.releaseDelay.toFixed(1)}s`;
		releaseDelaySlider.oninput = () => {
			sequencer.releaseDelay = parseFloat(releaseDelaySlider.value);
			releaseDelayDisplay.textContent = `${sequencer.releaseDelay.toFixed(1)}s`;
		};
		releaseDelayGroup.appendChild(releaseDelayLabel);
		releaseDelayGroup.appendChild(releaseDelaySlider);
		releaseDelayGroup.appendChild(releaseDelayDisplay);
		row4Container.appendChild(releaseDelayGroup);

		tracksTabContent.appendChild(row4Container);

		const tracksHeader = createElement('h3', 'section-title');
		tracksHeader.innerHTML = '<i class="fas fa-bars"></i> Tracks';
		tracksTabContent.appendChild(tracksHeader);

		const tracksContainer = createElement('div', 'tracks-container');
		tracksTabContent.appendChild(tracksContainer);

		this.refreshTracksUI(tracksContainer, sequencer);

		const actionsRow = createElement('div', 'sequencer-actions-row');

		const addTrackBtn = createButton('<i class="fas fa-plus"></i> Add Track', () => {
			sequencer.addTrack();
			this.refreshTracksUI(tracksContainer, sequencer);
		}, 'btn-add');
		actionsRow.appendChild(addTrackBtn);

		const addSceneBtn = createButton('<i class="fas fa-plus"></i> Add Scene', async () => {
			const result = await ModalSystem.show({
				title: 'Add Scene',
				message: 'Create a new scene from:',
				buttons: [
					{ text: 'Copy Current', result: 'copy', primary: true },
					{ text: 'Empty', result: 'empty' },
					{ text: 'Cancel', result: 'cancel' }
				]
			});
			if (result === 'cancel' || result === null) return;
			sequencer.addScene(result === 'copy');
			refreshSceneControls();
			this.refreshTracksUI(tracksContainer, sequencer);
			AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
		}, 'btn-add');
		actionsRow.appendChild(addSceneBtn);

		const sceneDropdown = createSelect(
			sequencer.scenes.map((s, i) => ({ value: String(i), label: s.name })),
			String(sequencer.activeSceneIndex),
			(e) => {
				sequencer.switchScene(parseInt(e.target.value));
				this.refreshTracksUI(tracksContainer, sequencer);
				AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
			}
		);
		sceneDropdown.className = 'scene-dropdown';
		actionsRow.appendChild(sceneDropdown);

		const renameSceneBtn = createButton('<i class="fas fa-pen"></i>', async () => {
			const scene = sequencer.scenes[sequencer.activeSceneIndex];
			const newName = await ModalSystem.prompt('Rename scene:', scene.name, 'Rename Scene');
			if (!newName) return;
			scene.name = newName;
			refreshSceneControls();
			AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
		}, 'btn-icon scene-rename-btn');
		renameSceneBtn.title = 'Rename Scene';
		actionsRow.appendChild(renameSceneBtn);

		const deleteSceneBtn = createButton('<i class="fas fa-trash"></i>', async () => {
			if (await ModalSystem.confirm(`Delete ${sequencer.scenes[sequencer.activeSceneIndex].name}?`, 'Delete Scene')) {
				sequencer.deleteScene(sequencer.activeSceneIndex);
				refreshSceneControls();
				this.refreshTracksUI(tracksContainer, sequencer);
				AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
			}
		}, 'btn-icon scene-delete-btn');
		deleteSceneBtn.title = 'Delete Scene';
		actionsRow.appendChild(deleteSceneBtn);

		const refreshSceneControls = () => {
			const hasMultipleScenes = sequencer.scenes.length > 1;
			sceneDropdown.style.display = hasMultipleScenes ? '' : 'none';
			renameSceneBtn.style.display = hasMultipleScenes ? '' : 'none';
			deleteSceneBtn.style.display = hasMultipleScenes ? '' : 'none';
			sceneDropdown.innerHTML = '';
			sequencer.scenes.forEach((s, i) => {
				const opt = document.createElement('option');
				opt.value = i;
				opt.textContent = s.name;
				opt.selected = i === sequencer.activeSceneIndex;
				sceneDropdown.appendChild(opt);
			});
			refreshSceneChangeUI();
		};
		refreshSceneControls();

		tracksTabContent.appendChild(actionsRow);

		const statusDiv = createElement('div', 'sequencer-status');
		menu.appendChild(statusDiv);

		let lastKnownSceneIndex = sequencer.activeSceneIndex;

		const updateUI = () => {
			const areaStatus = sequencer.activePaths.length === 0 ?
				'Anywhere' :
				(sequencer.insideArea ? 'Inside' : 'Outside');

			statusDiv.innerHTML = `
			<strong>Status:</strong> Step ${sequencer.currentStep + 1}/${sequencer.numSteps}
			<strong>Distance:</strong> ${sequencer.totalDistance.toFixed(1)}m
			<strong>Area:</strong> ${areaStatus}
		`;

			if (sequencer.activeSceneIndex !== lastKnownSceneIndex) {
				lastKnownSceneIndex = sequencer.activeSceneIndex;
				sceneDropdown.value = String(sequencer.activeSceneIndex);
				this.refreshTracksUI(tracksContainer, sequencer);
			}

			sequencer.tracks.forEach((track, trackIndex) => {
				const trackDiv = tracksContainer.children[trackIndex];
				if (!trackDiv) return;

				const dots = trackDiv.querySelectorAll('.step-indicator-dot');
				dots.forEach(dot => {
					const stepIndex = parseInt(dot.dataset.stepIndex);
					if (stepIndex === track.currentStep) {
						dot.classList.add('active');
					} else {
						dot.classList.remove('active');
					}
				});
			});
		};

		const onStateChange = () => updateUI();
		sequencer.addEventListener('stateChange', onStateChange);

		menu._onClose = () => {
			sequencer.removeEventListener('stateChange', onStateChange);
		};

		updateUI();

		const resetBtn = createButton('Reset Sequencer', () => {
			sequencer.reset();
		}, '', { width: '100%' });
		menu.appendChild(resetBtn);

		const deleteBtn = createButton('Delete Sequencer', async () => {
			if (await ModalSystem.confirm('Delete this sequencer?', 'Delete Sequencer')) {
				sequencer.tracks.forEach(track => {
					if (track.instrumentType === 'sound' && track.instrumentId) {
						const sound = AppState.getSoundByPersistentId(track.instrumentId);
						if (sound) {
							const stillControlled = Selectors.getSequencers().some(seq =>
								seq.id !== sequencer.id &&
								seq.tracks.some(t =>
									t.instrumentType === 'sound' &&
									t.instrumentId === track.instrumentId
								)
							);
							if (!stillControlled) {
								setSequencerControl(sound, false);
							}
						}
					}
				});

				sequencer.stop();
				AppState.dispatch({ type: 'SEQUENCER_REMOVED', payload: { id: sequencer.id } });
				this.refreshSequencersList();
				this.appContext.closeAllMenus();
			}
		}, 'delete-btn', { width: '100%' });
		menu.appendChild(deleteBtn);

		const duplicateBtn = createButton('Duplicate Sequencer', () => {
			const newSequencer = new DistanceSequencer({
				...sequencer,
				id: `seq_${Date.now()}`,
				label: `${sequencer.label} (Copy)`,
				tracks: sequencer.tracks.map(track => ({
					...track,
					id: `track_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
					steps: track.steps.map(step => ({ ...step }))
				}))
			});
			AppState.dispatch({ type: 'SEQUENCER_ADDED', payload: { sequencer: newSequencer } });
			this.refreshSequencersList();
			this.appContext.closeAllMenus();
		}, 'btn-duplicate', { width: '100%' });
		menu.appendChild(duplicateBtn);

		document.body.appendChild(menu);

		if (menu._menuData) delete menu._menuData;
	}

	async showSequencerSynthSettings(point, track, sequencer) {
		const liveSoundObj = await sequencer._getSynth(track);
		if (!liveSoundObj) return;

		const { menu, overlay } = createMenuStructure(point);
		overlay.onclick = () => MenuManager.closeTop();

		const originalSoundFile = liveSoundObj.params.soundFile;
		const originalGridSamples = liveSoundObj.params.gridSamples ? JSON.stringify(liveSoundObj.params.gridSamples) : null;

		track.synthParams = liveSoundObj.params;

		menu.addEventListener('input', () => {
			AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
		});
		menu.addEventListener('change', () => {
			AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
		});

		const { header, cleanup: headerCleanup } = createDraggableHeader(menu, `Synth Settings: ${track.synthType}`);
		menu.appendChild(header);

		const tabBar = createElement('div', 'tab-bar');
		let tabs = [
			{ id: 'sound', label: 'Sound' },
			{ id: 'mod', label: 'Mod' },
			{ id: 'keyboard', label: 'Keys' },
			{ id: 'fx', label: 'FX' },
			{ id: 'eq', label: 'EQ' }
		];

		if (!hasKeyboard(liveSoundObj)) {
			tabs = tabs.filter(tab => tab.id !== 'keyboard');
		}

		tabs.forEach(tab => {
			const btn = createButton(tab.label, () => this.appContext.showMenuTab(liveSoundObj, container, tab.id, tabBar), '', { flex: 1 });
			btn.dataset.tabId = tab.id;
			tabBar.appendChild(btn);
		});
		menu.appendChild(tabBar);

		const container = createElement('div', 'params-container');
		menu.appendChild(container);

		this.appContext.showMenuTab(liveSoundObj, container, 'sound', tabBar);

		const menuData = Selectors.getTopMenu();
		if (menuData && menuData.menu === menu) {
			menuData.onClose = async () => {
				const currentSoundFile = liveSoundObj.params.soundFile;
				const currentGridSamples = liveSoundObj.params.gridSamples ? JSON.stringify(liveSoundObj.params.gridSamples) : null;

				const soundFileChanged = originalSoundFile !== currentSoundFile;
				const gridSamplesChanged = originalGridSamples !== currentGridSamples;

				if (soundFileChanged || gridSamplesChanged) {
					if (sequencer._synthPool.has(track.id)) {
						const oldSoundObj = sequencer._synthPool.get(track.id);
						destroySound(oldSoundObj);
						sequencer._synthPool.delete(track.id);
					}
					await sequencer._getSynth(track);
				}
			};
		}

		document.body.appendChild(menu);
	}

	refreshSequencerPanel(menu, sequencer) {
		const tracksContainer = menu.querySelector('.tracks-container');
		if (tracksContainer) {
			this.refreshTracksUI(tracksContainer, sequencer);
		}
	}

	renderTrackGrid(track, trackDiv, sequencer, tracksContainer) {
		trackDiv.querySelectorAll('.piano-roll-wrapper').forEach(el => el.remove());

		const stepsPerRow = 16;
		const trackStepCount = track.numSteps !== undefined ? track.numSteps : sequencer.numSteps;
		const numRows = Math.ceil(trackStepCount / stepsPerRow);
		const noteCount = 12;
		const baseNote = (track.octave + 1) * 12;

		for (let rowIndex = 0; rowIndex < numRows; rowIndex++) {
			const rowStartStep = rowIndex * stepsPerRow;
			const rowEndStep = Math.min(rowStartStep + stepsPerRow, trackStepCount);
			const stepsInRow = rowEndStep - rowStartStep;

			const gridWrapper = createElement('div', 'piano-roll-wrapper');
			const grid = createElement('div', 'piano-roll');
			grid.style.gridTemplateColumns = `repeat(${stepsInRow}, 1fr)`;
			grid.style.gridTemplateRows = `repeat(${noteCount}, 1fr)`;

			for (let noteOffset = noteCount - 1; noteOffset >= 0; noteOffset--) {
				const midiNote = baseNote + noteOffset;
				const isChromatic = [1, 3, 6, 8, 10].includes(noteOffset % 12);

				for (let s = 0; s < stepsInRow; s++) {
					const stepIndex = rowStartStep + s;
					if (!track.steps[stepIndex]) {
						track.steps[stepIndex] = { notes: [], sustains: [], velocities: {} };
					}
					if (!track.steps[stepIndex].velocities) {
						track.steps[stepIndex].velocities = {};
					}

					const hasNote = track.steps[stepIndex].notes.includes(midiNote);
					const hasSustain = track.steps[stepIndex].sustains.includes(midiNote);

					const cell = createElement('div', 'piano-cell');
					if (isChromatic) cell.classList.add('chromatic');
					if (hasNote) {
						cell.classList.add('note');
						const noteVelocity = track.steps[stepIndex].velocities[midiNote] ?? 100;
						const velocityLevel = Math.min(12, Math.floor(noteVelocity / 10));
						cell.setAttribute('data-velocity-level', velocityLevel);
						if (noteVelocity === 0) {
							cell.classList.add('velocity-zero');
						}
					}
					if (hasSustain) {
						cell.classList.add('sustain');
						const noteVelocity = track.steps[stepIndex].velocities[midiNote] ?? 100;
						const velocityLevel = Math.max(0, Math.min(12, Math.floor(noteVelocity / 10)) - 1);
						cell.setAttribute('data-velocity-level', velocityLevel);
						if (noteVelocity === 0) {
							cell.classList.add('velocity-zero');
						}
					}

					cell.addEventListener('mousedown', () => {
					if (track.editMode !== 'sustain') return;
					const hasSustain = track.steps[stepIndex]?.sustains.includes(midiNote);
					const mode = hasSustain ? 'erase' : 'paint';
					this._sustainDrag = { midiNote, originStepIndex: stepIndex, track, trackDiv, sequencer, tracksContainer, didDrag: false, mode };
				});

				cell.addEventListener('mouseenter', () => {
					if (!this._isPointerDown || !this._sustainDrag) return;
					if (this._sustainDrag.midiNote !== midiNote) return;
					if (!this._sustainDrag.didDrag) {
						this._sustainDrag.didDrag = true;
						this._applyDragSustain(this._sustainDrag.originStepIndex);
					}
					this._applyDragSustain(stepIndex);
				});

				cell.onclick = (e) => {
					if (this._sustainDrag?.didDrag) return;
						const currentStep = track.steps[stepIndex];
						if (!currentStep) {
							track.steps[stepIndex] = { notes: [], sustains: [], velocities: {} };
						}
						if (!track.steps[stepIndex].velocities) {
							track.steps[stepIndex].velocities = {};
						}

						if (track.editMode === 'vel') {
							if (track.steps[stepIndex].notes.includes(midiNote)) {
								this.showVelocityEditor(track, trackDiv, stepIndex, midiNote, sequencer, tracksContainer);
							}
							return;
						}

					const currentHasNote = track.steps[stepIndex].notes.includes(midiNote);
						const currentHasSustain = track.steps[stepIndex].sustains.includes(midiNote);

						if (currentHasNote) {
							track.steps[stepIndex].notes = track.steps[stepIndex].notes.filter(n => n !== midiNote);
							delete track.steps[stepIndex].velocities[midiNote];
							this.cleanOrphanedSustains(track, stepIndex, midiNote);
						} else if (currentHasSustain) {
							track.steps[stepIndex].sustains = track.steps[stepIndex].sustains.filter(n => n !== midiNote);
						} else {
							if (track.editMode === 'sustain') {
								if (this.canPlaceSustain(track, stepIndex, midiNote)) {
									track.steps[stepIndex].sustains.push(midiNote);
									if (track.steps[stepIndex].velocities[midiNote] === undefined) {
										track.steps[stepIndex].velocities[midiNote] = 100;
									}
								}
							} else {
								track.steps[stepIndex].notes.push(midiNote);
								track.steps[stepIndex].notes.sort((a, b) => a - b);
								track.steps[stepIndex].velocities[midiNote] = 100;
							}
						}
						AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
						this.renderTrackGrid(track, trackDiv, sequencer, tracksContainer);
					};

					grid.appendChild(cell);
				}
			}

			gridWrapper.appendChild(grid);

			const indicatorRow = createElement('div', 'step-indicator-row');
			indicatorRow.style.gridTemplateColumns = `repeat(${stepsInRow}, 1fr)`;
			for (let s = 0; s < stepsInRow; s++) {
				const stepIndex = rowStartStep + s;
				const dot = createElement('div', 'step-indicator-dot');
				dot.dataset.stepIndex = stepIndex;
				indicatorRow.appendChild(dot);
			}
			gridWrapper.appendChild(indicatorRow);

			trackDiv.appendChild(gridWrapper);
		}

		trackDiv.querySelectorAll('.velocity-panel').forEach(el => el.remove());

		if (track.editMode === 'vel') {
			const velocityPanel = createElement('div', 'velocity-panel');

			const panelLabel = createElement('label');
			panelLabel.textContent = 'Velocity';
			velocityPanel.appendChild(panelLabel);

			const velocitySlider = createElement('input');
			velocitySlider.type = 'range';
			velocitySlider.min = 0;
			velocitySlider.max = 127;
			velocitySlider.value = 0;
			velocitySlider.disabled = true;
			velocitySlider.className = 'velocity-slider';
			velocityPanel.appendChild(velocitySlider);

			const velocityDisplay = createElement('span', 'velocity-value');
			velocityDisplay.textContent = '--';
			velocityPanel.appendChild(velocityDisplay);

			const helpText = createElement('span', 'velocity-help');
			helpText.textContent = 'Select a note to edit velocity';
			velocityPanel.appendChild(helpText);

			trackDiv.appendChild(velocityPanel);
		}
	}

	showVelocityEditor(track, trackDiv, stepIndex, midiNote, sequencer, tracksContainer) {
		const velocityPanel = trackDiv.querySelector('.velocity-panel');
		if (!velocityPanel) return;

		const velocitySlider = velocityPanel.querySelector('.velocity-slider');
		const velocityDisplay = velocityPanel.querySelector('.velocity-value');
		const helpText = velocityPanel.querySelector('.velocity-help');

		const currentVelocity = track.steps[stepIndex].velocities[midiNote] ?? 100;

		velocitySlider.disabled = false;
		velocitySlider.value = currentVelocity;
		velocityDisplay.textContent = currentVelocity;
		helpText.style.display = 'none';

		velocitySlider.oninput = () => {
			const newMidiValue = parseInt(velocitySlider.value);
			track.steps[stepIndex].velocities[midiNote] = newMidiValue;
			velocityDisplay.textContent = newMidiValue;
			this.updateVelocityVisuals(track, trackDiv, stepIndex, midiNote);
		};

		velocitySlider.onchange = () => {
			AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
		};

		velocityDisplay.onclick = async () => {
			const newValue = await ModalSystem.prompt('Enter velocity (0-127):', currentVelocity.toString(), 'Set Velocity');
			if (newValue !== null) {
				const numValue = parseInt(newValue);
				if (!isNaN(numValue) && numValue >= 0 && numValue <= 127) {
					track.steps[stepIndex].velocities[midiNote] = numValue;
					velocitySlider.value = numValue;
					velocityDisplay.textContent = numValue;
					this.updateVelocityVisuals(track, trackDiv, stepIndex, midiNote);
					AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
				}
			}
		};
	}

	updateVelocityVisuals(track, trackDiv, stepIndex, midiNote) {
		const noteVelocity = track.steps[stepIndex].velocities[midiNote] ?? 100;
		const velocityLevel = Math.min(12, Math.floor(noteVelocity / 10));
		const sustainLevel = Math.max(0, velocityLevel - 1);

		const stepsPerRow = 16;
		const noteCount = 12;
		const baseNote = (track.octave + 1) * 12;
		const noteOffset = midiNote - baseNote;
		const trackStepCount = track.numSteps !== undefined ? track.numSteps : track.steps.length;

		const updateCell = (idx) => {
			const rowIdx = Math.floor(idx / stepsPerRow);
			const stepInRow = idx % stepsPerRow;
			const gridWrappers = trackDiv.querySelectorAll('.piano-roll-wrapper');

			if (!gridWrappers[rowIdx]) return null;
			const grid = gridWrappers[rowIdx].querySelector('.piano-roll');
			if (!grid) return null;

			const rowStartStep = rowIdx * stepsPerRow;
			const rowEndStep = Math.min(rowStartStep + stepsPerRow, trackStepCount);
			const stepsInRow = rowEndStep - rowStartStep;

			const cellIndex = (noteCount - 1 - noteOffset) * stepsInRow + stepInRow;
			return grid.children[cellIndex];
		};

		const cell = updateCell(stepIndex);
		if (!cell) return;

		cell.classList.remove('velocity-zero');
		if (noteVelocity === 0) {
			cell.classList.add('velocity-zero');
		}

		const step = track.steps[stepIndex];
		if (!step) return;

		if (step.notes.includes(midiNote)) {
			cell.setAttribute('data-velocity-level', velocityLevel);

			const trackStepCount = track.numSteps !== undefined ? track.numSteps : track.steps.length;
			for (let i = stepIndex + 1; i < trackStepCount; i++) {
				if (!track.steps[i]) break;

				if (track.steps[i].notes.includes(midiNote)) {
					break;
				}

				if (track.steps[i].sustains.includes(midiNote)) {
					track.steps[i].velocities[midiNote] = noteVelocity;

					const sustainCell = updateCell(i);
					if (sustainCell) {
						sustainCell.classList.remove('velocity-zero');
						if (noteVelocity === 0) {
							sustainCell.classList.add('velocity-zero');
						}
						sustainCell.setAttribute('data-velocity-level', sustainLevel);
					}
				} else {
					break;
				}
			}
		} else if (step.sustains.includes(midiNote)) {
			cell.setAttribute('data-velocity-level', sustainLevel);
		}
	}

	refreshTracksUI(container, sequencer) {
		container.innerHTML = '';

		sequencer.tracks.forEach((track, trackIndex) => {
			const trackDiv = createElement('div', 'track-item');

			const trackHeader = createElement('div', 'track-header-compact');

			const trackTitle = createElement('strong', 'track-title');
			trackTitle.textContent = `Track ${trackIndex + 1}`;
			trackHeader.appendChild(trackTitle);

			const instrTypeSelect = createSelect([
				{ value: 'synth', label: 'Synth' },
				{ value: 'sound', label: 'Sound' }
			], track.instrumentType, (e) => {
				const activeNotes = sequencer._activeNotes.get(track.id);
				if (activeNotes && activeNotes.size > 0) {
					activeNotes.forEach(note => {
						sequencer._triggerRelease(track, note);
					});
					sequencer._activeNotes.delete(track.id);
				}

				const oldInstrumentType = track.instrumentType;
				const oldInstrumentId = track.instrumentId;

				track.instrumentType = e.target.value;
				track.instrumentId = null;

				if (oldInstrumentType === 'sound' && oldInstrumentId) {
					const oldSound = AppState.getSoundByPersistentId(oldInstrumentId);
					if (oldSound) {
						const stillControlled = Selectors.getSequencers().some(seq =>
							seq.tracks.some(t =>
								t.instrumentType === 'sound' &&
								t.instrumentId === oldInstrumentId &&
								t.id !== track.id
							)
						);
						if (!stillControlled) {
							setSequencerControl(oldSound, false);
						}
					}
				}

				this.refreshTracksUI(container, sequencer);
				AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
			});

			trackHeader.appendChild(instrTypeSelect);

			if (track.instrumentType === 'synth') {
				const synthOptions = Object.keys(SYNTH_REGISTRY).map(key => ({ value: key, label: key }));
				const synthSelect = createSelect(synthOptions, track.synthType, (e) => {
					const activeNotes = sequencer._activeNotes.get(track.id);
					if (activeNotes && activeNotes.size > 0) {
						activeNotes.forEach(note => {
							sequencer._triggerRelease(track, note);
						});
						sequencer._activeNotes.delete(track.id);
					}

					track.synthType = e.target.value;
					track.synthParams = initializeSynthParameters(track.synthType, 'sound');

					if (sequencer._synthPool.has(track.id)) {
						const oldSoundObj = sequencer._synthPool.get(track.id);
						destroySound(oldSoundObj);
						sequencer._synthPool.delete(track.id);
					}

					this.refreshTracksUI(container, sequencer);
					AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
				});
				trackHeader.appendChild(synthSelect);

				const settingsBtn = createElement('button', 'btn-icon track-synth-settings-btn');
				settingsBtn.innerHTML = '<i class="fas fa-cog"></i>';
				settingsBtn.title = 'Synth Settings';
				settingsBtn.onclick = (e) => {
					const rect = settingsBtn.getBoundingClientRect();
					const point = { x: rect.right + 10, y: rect.top };
					this.showSequencerSynthSettings(point, track, sequencer);
				};
				trackHeader.appendChild(settingsBtn);

			} else if (track.instrumentType === 'sound') {
				const soundOptions = [
					{ value: 'none', label: '- Select -' },
					...Selectors.getSounds().map(s => ({
						value: s.persistentId,
						label: s.label
					}))
				];
				const soundSelect = createSelect(soundOptions, track.instrumentId || 'none', (e) => {
					const activeNotes = sequencer._activeNotes.get(track.id);
					if (activeNotes && activeNotes.size > 0) {
						activeNotes.forEach(note => {
							sequencer._triggerRelease(track, note);
						});
						sequencer._activeNotes.delete(track.id);
					}

					const oldSoundId = track.instrumentId;
					const newSoundId = e.target.value === 'none' ? null : e.target.value;

					if (oldSoundId && oldSoundId !== newSoundId) {
						const oldSound = AppState.getSoundByPersistentId(oldSoundId);
						if (oldSound) {
							const stillControlled = Selectors.getSequencers().some(seq =>
								seq.tracks.some(t =>
									t.instrumentType === 'sound' &&
									t.instrumentId === oldSoundId &&
									t.id !== track.id
								)
							);
							if (!stillControlled) {
								setSequencerControl(oldSound, false);
							}
						}
					}

					if (newSoundId) {
						const sound = AppState.getSoundByPersistentId(newSoundId);
						if (sound) {
							setSequencerControl(sound, true);
						}
					}

					track.instrumentId = newSoundId;
					this.refreshTracksUI(container, sequencer);
					AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
				});
				trackHeader.appendChild(soundSelect);

				const settingsBtn = createElement('button', 'btn-icon track-synth-settings-btn');
				settingsBtn.innerHTML = '<i class="fas fa-cog"></i>';
				settingsBtn.title = track.instrumentId && track.instrumentId !== 'none' ? 'Sound Settings' : 'Select a sound first';

				if (track.instrumentId && track.instrumentId !== 'none') {
					settingsBtn.onclick = (e) => {
						const sound = AppState.getSoundByPersistentId(track.instrumentId);
						if (sound) {
							const rect = settingsBtn.getBoundingClientRect();
							const point = { x: rect.right + 10, y: rect.top };
							this.appContext.showSoundMenu(point, sound.marker, true);
						}
					};
				} else {
					settingsBtn.disabled = true;
				}

				trackHeader.appendChild(settingsBtn);
			}

			const duplicateTrackBtn = createElement('button', 'btn-icon track-duplicate-btn');
			duplicateTrackBtn.innerHTML = '<i class="fas fa-clone"></i>';
			duplicateTrackBtn.title = 'Duplicate Track';
			duplicateTrackBtn.onclick = () => {
				sequencer.duplicateTrack(track.id);
				this.refreshTracksUI(container, sequencer);
				AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
			};
			trackHeader.appendChild(duplicateTrackBtn);

			const deleteTrackBtn = createElement('button', 'btn-icon track-delete-btn');
			deleteTrackBtn.innerHTML = '<i class="fas fa-trash"></i>';
			deleteTrackBtn.title = 'Delete Track';
			deleteTrackBtn.onclick = async () => {
				await sequencer.removeTrack(track.id);
				this.refreshTracksUI(container, sequencer);
				AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
			};
			trackHeader.appendChild(deleteTrackBtn);

			trackDiv.appendChild(trackHeader);

			const trackOffsetGroup = createElement('div', 'parameter-control');
			const trackOffsetLabel = createElement('label');
			trackOffsetLabel.textContent = 'Offset';
			const offsetModeSelect = createElement('select');
			offsetModeSelect.innerHTML = `
			<option value="division">Division</option>
			<option value="steps">Steps</option>
			<option value="meters">Meters</option>
		`;
			offsetModeSelect.value = track.offsetMode || 'division';
			const divisionSelect = createElement('select', 'track-division-select');
			divisionSelect.innerHTML = `
			<option value="0">None (0m)</option>
			<option value="0.5">1/2 step</option>
			<option value="0.25">1/4 step</option>
			<option value="0.75">3/4 step</option>
			<option value="0.125">1/8 step</option>
			<option value="0.375">3/8 step</option>
			<option value="0.625">5/8 step</option>
			<option value="0.875">7/8 step</option>
			<option value="0.333">1/3 step</option>
			<option value="0.666">2/3 step</option>
		`;
			const meterInput = createElement('input');
			meterInput.type = 'number';
			meterInput.min = 0;
			meterInput.max = sequencer.stepLength;
			meterInput.step = 0.1;
			meterInput.value = track.offset || 0;
			const stepsInput = createElement('input');
			stepsInput.type = 'number';
			stepsInput.min = 0;
			stepsInput.step = 1;
			stepsInput.value = track.offsetSteps || 0;
			const meterDisplay = createElement('span', 'offset-meter-display');

			const updateOffsetDisplay = (resetPlayback = false) => {
				if (offsetModeSelect.value === 'division') {
					const fraction = parseFloat(divisionSelect.value);
					track.offsetFraction = fraction;
					const meters = fraction * sequencer.stepLength;
					meterDisplay.textContent = `(${meters.toFixed(1)}m)`;
					track.offset = meters;
					if (resetPlayback) {
						track.currentStep = -1;
					}
					divisionSelect.style.display = 'inline-block';
					stepsInput.style.display = 'none';
					meterInput.style.display = 'none';
				} else if (offsetModeSelect.value === 'steps') {
					const steps = parseInt(stepsInput.value) || 0;
					track.offsetSteps = steps;
					const meters = steps * sequencer.stepLength;
					meterDisplay.textContent = `(~${meters.toFixed(1)}m)`;
					track.offset = meters;
					track.offsetFraction = undefined;
					if (resetPlayback) {
						track.currentStep = -1;
					}
					divisionSelect.style.display = 'none';
					stepsInput.style.display = 'inline-block';
					meterInput.style.display = 'none';
				} else {
					track.offsetFraction = undefined;
					track.offsetSteps = undefined;
					meterDisplay.textContent = '';
					track.offset = parseFloat(meterInput.value);
					if (resetPlayback) {
						track.currentStep = -1;
					}
					divisionSelect.style.display = 'none';
					stepsInput.style.display = 'none';
					meterInput.style.display = 'inline-block';
				}
			};

			if (track.offsetMode === 'division' && track.offsetFraction !== undefined) {
				divisionSelect.value = track.offsetFraction.toString();
			} else {
				const currentFraction = track.offset / sequencer.stepLength;
				divisionSelect.value = currentFraction.toString();
			}

			if (!divisionSelect.value) {
				divisionSelect.value = "0";
			}

			offsetModeSelect.onchange = () => {
				track.offsetMode = offsetModeSelect.value;
				updateOffsetDisplay(true);
			};
			divisionSelect.onchange = () => {
				track.offsetMode = 'division';
				offsetModeSelect.value = 'division';
				updateOffsetDisplay(true);
			};
			stepsInput.oninput = () => {
				track.offsetMode = 'steps';
				offsetModeSelect.value = 'steps';
				updateOffsetDisplay(true);
			};
			meterInput.oninput = () => updateOffsetDisplay(true);
			updateOffsetDisplay(false);

			trackOffsetGroup.appendChild(trackOffsetLabel);
			trackOffsetGroup.appendChild(offsetModeSelect);
			trackOffsetGroup.appendChild(divisionSelect);
			trackOffsetGroup.appendChild(stepsInput);
			trackOffsetGroup.appendChild(meterInput);
			trackOffsetGroup.appendChild(meterDisplay);
			trackDiv.appendChild(trackOffsetGroup);

			const octaveAndModeRow = createElement('div', 'track-octave-mode-row');

			const octaveControls = createElement('div', 'track-octave-controls');

			const octaveDown = createElement('button', 'btn-icon');
			octaveDown.textContent = '⬇';
			octaveDown.onclick = () => {
				if (track.octave > 0) {
					track.octave--;
					this.refreshTracksUI(container, sequencer);
					AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
				}
			};

			const octaveLabel = createElement('span', 'octave-label');
			octaveLabel.textContent = `C${track.octave !== undefined ? track.octave : 4}`;

			const octaveUp = createElement('button', 'btn-icon');
			octaveUp.textContent = '⬆';
			octaveUp.onclick = () => {
				if (track.octave < 8) {
					track.octave++;
					this.refreshTracksUI(container, sequencer);
					AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
				}
			};

			octaveControls.appendChild(octaveDown);
			octaveControls.appendChild(octaveLabel);
			octaveControls.appendChild(octaveUp);
			octaveAndModeRow.appendChild(octaveControls);

			const trackStepsControl = createElement('div', 'track-steps-control');

			const trackStepsInput = createElement('input');
			trackStepsInput.type = 'number';
			trackStepsInput.min = CONSTANTS.SEQUENCER_MIN_STEPS;
			trackStepsInput.max = CONSTANTS.SEQUENCER_MAX_STEPS;
			trackStepsInput.value = track.numSteps !== undefined ? track.numSteps : sequencer.numSteps;
			trackStepsInput.title = 'Track steps (overrides master)';

			trackStepsInput.oninput = () => {
				let newCount = parseInt(trackStepsInput.value);
				if (isNaN(newCount) || newCount < CONSTANTS.SEQUENCER_MIN_STEPS) {
					newCount = CONSTANTS.SEQUENCER_MIN_STEPS;
					trackStepsInput.value = newCount;
				}
				if (newCount > CONSTANTS.SEQUENCER_MAX_STEPS) {
					newCount = CONSTANTS.SEQUENCER_MAX_STEPS;
					trackStepsInput.value = newCount;
				}

				const oldCount = track.numSteps !== undefined ? track.numSteps : sequencer.numSteps;
				track.numSteps = newCount;

				if (newCount > oldCount) {
					for (let i = oldCount; i < newCount; i++) {
						track.steps.push({ notes: [], sustains: [], velocity: 0.8 });
					}
				}

				if (track.currentStep >= track.numSteps) {
					track.currentStep = track.numSteps - 1;
				}

				const currentTrackDiv = trackStepsInput.closest('.track-item');
				if (currentTrackDiv) {
					this.renderTrackGrid(track, currentTrackDiv, sequencer, container);
				}
				AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
			};

			const resetStepsBtn = createElement('button', 'btn-icon-small');
			resetStepsBtn.textContent = '↻';
			resetStepsBtn.title = 'Reset to master';
			resetStepsBtn.onclick = () => {
				delete track.numSteps;
				if (track.steps.length < sequencer.numSteps) {
					for (let i = track.steps.length; i < sequencer.numSteps; i++) {
						track.steps.push({ notes: [], sustains: [], velocity: 0.8 });
					}
				}
				if (track.currentStep >= sequencer.numSteps) {
					track.currentStep = sequencer.numSteps - 1;
				}
				this.refreshTracksUI(container, sequencer);
				AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
			};

			trackStepsControl.appendChild(trackStepsInput);
			trackStepsControl.appendChild(resetStepsBtn);
			octaveAndModeRow.appendChild(trackStepsControl);

			const modeSelector = createElement('div', 'track-mode-selector');

			if (!track.editMode) track.editMode = 'note';

			const noteMode = createElement('div', 'mode-box');
			noteMode.classList.add('note-mode');
			if (track.editMode === 'note') noteMode.classList.add('active');
			const noteLabel = createElement('span');
			noteLabel.textContent = 'Note';
			noteMode.appendChild(noteLabel);
			noteMode.onclick = () => {
				track.editMode = 'note';
				this.refreshTracksUI(container, sequencer);
				AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
			};
			modeSelector.appendChild(noteMode);

			const sustainMode = createElement('div', 'mode-box');
			sustainMode.classList.add('sustain-mode');
			if (track.editMode === 'sustain') sustainMode.classList.add('active');
			const sustainLabel = createElement('span');
			sustainLabel.textContent = 'Sus';
			sustainMode.appendChild(sustainLabel);
			sustainMode.onclick = () => {
				track.editMode = 'sustain';
				this.refreshTracksUI(container, sequencer);
				AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
			};
			modeSelector.appendChild(sustainMode);

			const velMode = createElement('div', 'mode-box');
			velMode.classList.add('vel-mode');
			if (track.editMode === 'vel') velMode.classList.add('active');
			const velLabel = createElement('span');
			velLabel.textContent = 'Vel';
			velMode.appendChild(velLabel);
			velMode.onclick = () => {
				if (track.editMode === 'vel') {
					track.editMode = 'note';
				} else {
					track.editMode = 'vel';
				}
				this.refreshTracksUI(container, sequencer);
				AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
			};
			modeSelector.appendChild(velMode);

			octaveAndModeRow.appendChild(modeSelector);
			trackDiv.appendChild(octaveAndModeRow);

			this.renderTrackGrid(track, trackDiv, sequencer, container);

			container.appendChild(trackDiv);
		});
	}

	createSelectionRow(item, sequencer, type, updateAreaStatus) {
		const existingConfig = sequencer.activePaths.find(
			ap => ap.type === type && ap.id === item.id
		);

		const row = createElement('div', 'path-selection-row');

		const checkbox = createElement('input');
		checkbox.type = 'checkbox';
		checkbox.checked = !!existingConfig;

		const labelSpan = createElement('span', 'path-selection-label');
		labelSpan.textContent = type === 'path' ? item.label : (item.label || item.name);

		const zoneSelect = createElement('select', 'path-zone-select');
		if (type === 'path' && item.type === 'line') {
			zoneSelect.innerHTML = '<option value="corridor">Corridor</option>';
		} else {
			zoneSelect.innerHTML = `
			<option value="interior">Interior</option>
			<option value="corridor">Corridor</option>
			<option value="both">Both</option>
		`;
		}
		zoneSelect.value = existingConfig?.zone || (type === 'path' && item.type === 'line' ? 'corridor' : 'interior');
		zoneSelect.disabled = !existingConfig;

		checkbox.onchange = () => {
			if (checkbox.checked) {
				sequencer.activePaths.push({ type, id: item.id, zone: zoneSelect.value });
				zoneSelect.disabled = false;
			} else {
				sequencer.activePaths = sequencer.activePaths.filter(
					ap => !(ap.type === type && ap.id === item.id)
				);
				zoneSelect.disabled = true;
			}
			updateAreaStatus();
		};

		zoneSelect.onchange = () => {
			const config = sequencer.activePaths.find(ap => ap.type === type && ap.id === item.id);
			if (config) config.zone = zoneSelect.value;
			updateAreaStatus();
		};

		row.appendChild(checkbox);
		row.appendChild(labelSpan);
		row.appendChild(zoneSelect);

		return row;
	}

	createSceneChangeRow(item, sequencer, type) {
		const existingConfig = sequencer.sceneChangePaths.find(
			sc => sc.type === type && sc.id === item.id
		);

		const row = createElement('div', 'scene-change-row');

		const checkbox = createElement('input');
		checkbox.type = 'checkbox';
		checkbox.checked = !!existingConfig;

		const labelSpan = createElement('span', 'path-selection-label');
		labelSpan.textContent = type === 'path' ? item.label : (item.label || item.name);

		const zoneSelect = createElement('select', 'path-zone-select');
		if (type === 'path' && item.type === 'line') {
			zoneSelect.innerHTML = '<option value="corridor">Corridor</option>';
		} else {
			zoneSelect.innerHTML = `
			<option value="interior">Interior</option>
			<option value="corridor">Corridor</option>
			<option value="both">Both</option>
		`;
		}
		zoneSelect.value = existingConfig?.zone || (type === 'path' && item.type === 'line' ? 'corridor' : 'interior');
		zoneSelect.disabled = !existingConfig;

		const sceneSelect = createSelect(
			sequencer.scenes.map((s, i) => ({ value: String(i), label: s.name })),
			String(existingConfig?.sceneIndex ?? 0),
			(e) => {
				const config = sequencer.sceneChangePaths.find(sc => sc.type === type && sc.id === item.id);
				if (config) config.sceneIndex = parseInt(e.target.value);
				AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
			}
		);
		sceneSelect.className = 'scene-change-scene-select';
		sceneSelect.disabled = !existingConfig;

		const updateConfig = () => {
			if (checkbox.checked) {
				sequencer.sceneChangePaths.push({
					type, id: item.id,
					zone: zoneSelect.value,
					sceneIndex: parseInt(sceneSelect.value)
				});
				zoneSelect.disabled = false;
				sceneSelect.disabled = false;
			} else {
				sequencer.sceneChangePaths = sequencer.sceneChangePaths.filter(
					sc => !(sc.type === type && sc.id === item.id)
				);
				sequencer._sceneChangeInsideState.delete(item.id);
				sequencer._sceneChangeEntryOrder = sequencer._sceneChangeEntryOrder.filter(id => id !== item.id);
				zoneSelect.disabled = true;
				sceneSelect.disabled = true;
			}
			AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
		};

		checkbox.onchange = updateConfig;

		zoneSelect.onchange = () => {
			const config = sequencer.sceneChangePaths.find(sc => sc.type === type && sc.id === item.id);
			if (config) config.zone = zoneSelect.value;
			AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
		};

		row.appendChild(checkbox);
		row.appendChild(labelSpan);
		row.appendChild(zoneSelect);
		row.appendChild(sceneSelect);

		return row;
	}

	cleanOrphanedSustains(track, stepIndex, midiNote) {
		for (let i = stepIndex + 1; i < track.steps.length; i++) {
			if (!track.steps[i]) {
				track.steps[i] = { notes: [], sustains: [], velocity: 0.8 };
			}
			const idx = track.steps[i].sustains.indexOf(midiNote);
			if (idx > -1) {
				track.steps[i].sustains.splice(idx, 1);
			} else {
				break;
			}
		}
	}

	_applyDragSustain(stepIndex) {
		const { midiNote, mode, track, trackDiv, sequencer, tracksContainer } = this._sustainDrag;
		if (!track.steps[stepIndex]) {
			track.steps[stepIndex] = { notes: [], sustains: [], velocities: {} };
		}
		const step = track.steps[stepIndex];
		if (mode === 'erase') {
			if (!step.sustains.includes(midiNote)) return;
			step.sustains = step.sustains.filter(n => n !== midiNote);
		} else {
			if (step.notes.includes(midiNote)) return;
			if (step.sustains.includes(midiNote)) return;
			if (!this.canPlaceSustain(track, stepIndex, midiNote)) return;
			step.sustains.push(midiNote);
			if (step.velocities[midiNote] === undefined) step.velocities[midiNote] = 100;
		}
		AppState.dispatch({ type: 'SEQUENCER_UPDATED', payload: { sequencer } });
		this.renderTrackGrid(track, trackDiv, sequencer, tracksContainer);
	}

	canPlaceSustain(track, stepIndex, midiNote) {
		if (stepIndex === 0) return false;

		const prevStep = track.steps[stepIndex - 1];
		if (!prevStep) return false;

		return prevStep.notes.includes(midiNote) || prevStep.sustains.includes(midiNote);
	}

	refreshSequencersList() {
		const list = document.getElementById('sequencersList');
		if (!list) return;

		list.innerHTML = '';

		Selectors.getSequencers().forEach((seq, index) => {
			const item = createElement('div', 'sequencer-list-item');

			const label = createElement('span');
			label.textContent = seq.label;

			const status = createElement('span');
			status.innerHTML = seq.enabled ?
				'<i class="fas fa-check-circle icon-success"></i>' :
				'<i class="fas fa-circle icon-muted"></i>';

			item.appendChild(label);
			item.appendChild(status);

			item.onclick = () => {
				const rect = item.getBoundingClientRect();
				const point = { x: rect.right + 10, y: rect.top };
				this.showSequencerPanel(point, seq);
			};

			list.appendChild(item);
		});

		this.appContext.updateMenuCounts();
	}
}
