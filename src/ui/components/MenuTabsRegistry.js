import { createElement, createButton, createSelect } from '../domHelpers.js';
import { createCollapsibleSection } from '../controllers/UIBuilder.js';
import { AppState } from '../../core/state/StateManager.js';
import { Selectors } from '../../core/state/selectors.js';
import { CONSTANTS } from '../../core/constants.js';
import { appContext } from '../../core/AppContext.js';

let context = null;

export function setContext(appCtx) {
	context = appCtx;
}

export const MenuTabs = {
	sound: {
		render(obj, container) {
			if (obj.type === 'StreamPlayer') {
				container.appendChild(this.createStreamSection(obj));
			}

			if (context.isFileSynth(obj) && obj.type !== 'StreamPlayer') {
				container.appendChild(this.createFileSection(obj));
			}

			if (obj.type !== 'StreamPlayer') {
				const allParameters = context.getParametersForSynth(obj.type, obj.role);
				const byCategory = this.groupByCategory(allParameters);

				Object.entries(byCategory).forEach(([cat, params]) => {
					if (cat === 'motion' || cat === 'spatial' || cat === 'sampler') {
						return;
					}
					const categoryDef = context.CATEGORY_REGISTRY[cat];
					if (obj.type === 'StreamPlayer' && cat === 'playback') {
						return;
					}
					if (categoryDef && params.length > 0) {
						container.appendChild(
							context.UIBuilder.parameterSection(
								categoryDef.label,
								categoryDef.icon,
								params.map(p => p.key),
								obj, { small: true, updateNode: true }
							)
						);
					}
				});
			}

			if (obj.volumeModel === 'raycast') {
				container.appendChild(
					context.UIBuilder.parameterSection(
						'Ray-Cast Settings',
						'fa-ruler-combined',
						['gamma', 'edgeMargin', 'minRadius'],
						obj, { small: true, updateNode: false, expanded: true }
					)
				);
			}
		},

		createStreamSection(obj) {
			return createCollapsibleSection(
				'Stream Control',
				'fa-broadcast-tower',
				() => {
					const content = createElement('div');

					const statusEl = createElement('div', 'stream-status-display');
					const updateStatus = () => {
						const status = obj.streamStatus || 'stopped';
						const statusText = {
							'stopped': 'Not loaded',
							'loading': 'Loading...',
							'ready': 'Ready (will play in area)',
							'playing': 'Playing',
							'error': 'Error'
						} [status] || 'Unknown';

						statusEl.textContent = `Status: ${statusText}`;
						statusEl.className = `stream-status-display ${status}`;
					};
					updateStatus();
					content.appendChild(statusEl);

					const urlControl = context.createParameterControl(
						context.PARAMETER_REGISTRY['streamUrl'],
						'streamUrl',
						obj, { small: true, updateNode: false }
					);
					content.appendChild(urlControl);

					const helpText = createElement('div', 'help-text');
					helpText.textContent = 'Stream will play automatically when you enter the sound area';
					content.appendChild(helpText);

					const statusInterval = setInterval(() => {
						if (document.contains(statusEl)) {
							updateStatus();
						} else {
							clearInterval(statusInterval);
						}
					}, 1000);

					const menuData = Selectors.getTopMenu();
					if (menuData) {
						if (!menuData.intervals) menuData.intervals = [];
						menuData.intervals.push(statusInterval);
					} else {
						console.warn("Could not find menu data to register interval.");
					}

					content.dataset.statusIntervalId = statusInterval;

					return content;
				},
				true
			);
		},

		groupByCategory(parameters) {
			return parameters.reduce((acc, paramKey) => {
				const def = context.PARAMETER_REGISTRY[paramKey];
				if (def) {
					const cat = def.category || 'other';
					if (!acc[cat]) acc[cat] = [];
					acc[cat].push({ key: paramKey, def: def });
				}
				return acc;
			}, {});
		},

		renderParameters(params, obj) {
			const content = createElement('div');
			params.forEach(({ key, def }) => {
				content.appendChild(context.createParameterControl(def, key, obj, undefined, { small: true, updateNode: true }));
			});
			return content;
		},

		createFileSection(obj) {
			return createCollapsibleSection(
				'Audio File',
				'fa-file-audio',
				() => {
					const content = createElement('div');

					if (obj.type === 'Sampler') {
						const modeControl = createElement('div', 'parameter-control');
						const modeLabel = createElement('label');
						modeLabel.textContent = 'Mode';

						const modeSelect = createSelect([
							{ value: 'single', label: 'Single' },
							{ value: 'grid', label: 'Grid' }
						], obj.params.samplerMode || 'single', async (e) => {
							const newMode = e.target.value;
							const oldMode = obj.params.samplerMode;

							if (oldMode !== newMode) {
								if (newMode === 'grid' && obj.params.soundFile) {
									const confirm = await context.ModalSystem.confirm(
										'Switching to Grid mode will clear the current sample. Continue?',
										'Switch Mode'
									);
									if (!confirm) {
										modeSelect.value = oldMode;
										return;
									}
								} else if (newMode === 'single' && Object.keys(obj.params.gridSamples || {}).length > 0) {
									const confirm = await context.ModalSystem.confirm(
										'Switching to Single mode will clear all grid samples. Continue?',
										'Switch Mode'
									);
									if (!confirm) {
										modeSelect.value = oldMode;
										return;
									}
								}

								obj.params.samplerMode = newMode;

								if (newMode === 'single') {
									obj.params.gridSamples = {};
								} else {
									obj.params.soundFile = null;
								}

								await context.changeSoundType(obj, 'Sampler');

								const parentContainer = content.closest('.params-container');
								const tabBar = parentContainer?.previousElementSibling;
								if (parentContainer && tabBar) {
									context.showMenuTab(obj, parentContainer, 'sound', tabBar);
								}
							}
						});

						modeControl.appendChild(modeLabel);
						modeControl.appendChild(modeSelect);
						modeControl.appendChild(createElement('span'));
						content.appendChild(modeControl);

						if (obj.params.samplerMode === 'grid') {
							const infoText = createElement('div', 'help-text');
							infoText.textContent = 'Use the Keyboard tab to assign samples to individual keys.';
							content.appendChild(infoText);

							const sampleCount = Object.keys(obj.params.gridSamples || {}).length;
							const statusEl = createElement('div', 'help-text');
							statusEl.textContent = `${sampleCount} sample${sampleCount !== 1 ? 's' : ''} loaded`;
							statusEl.style.fontWeight = 'bold';
							content.appendChild(statusEl);
						} else {
							const statusEl = createElement('div', 'help-text');
							if (obj.params.soundFile) {
								statusEl.textContent = obj.synth.loaded ?
									`Loaded: ${obj.params.soundFile} (${(obj.soundDuration || 0).toFixed(1)}s)` :
									`Not loaded: ${obj.params.soundFile}`;
							} else {
								statusEl.textContent = 'No file loaded';
							}
							content.appendChild(statusEl);

							const loadBtn = createButton(
								'Load or record file',
								() => context.showFileManagerDialog(obj),
								'', { width: '100%' }
							);
							content.appendChild(loadBtn);
						}
					} else {
						const statusEl = createElement('div', 'help-text');
						if (obj.params.soundFile) {
							statusEl.textContent = obj.synth.loaded ?
								`Loaded: ${obj.params.soundFile} (${(obj.soundDuration || 0).toFixed(1)}s)` :
								`Not loaded: ${obj.params.soundFile}`;
						} else {
							statusEl.textContent = 'No file loaded';
						}
						content.appendChild(statusEl);

						const loadBtn = createButton(
							'Load or record file',
							() => context.showFileManagerDialog(obj),
							'', { width: '100%' }
						);
						content.appendChild(loadBtn);
					}

					return content;
				},
				true
			);
		}
	},

	keyboard: {
		render(obj, container) {
			container.innerHTML = '';

			if (!obj.params.selectedNotes) {
				obj.params.selectedNotes = [];
			}
			if (!obj.params.keyboardOctave) obj.params.keyboardOctave = 4;

			const keyboardSection = createElement('div', 'keyboard-section');

			const octaveControl = createElement('div', 'keyboard-octave-control');
			const octaveLabel = createElement('span', 'keyboard-octave-label');
			octaveLabel.textContent = 'Octave:';

			const octaveDown = createButton('◀', () => {
				if (obj.params.keyboardOctave > 0) {
					obj.params.keyboardOctave--;
					MenuTabs.keyboard.render(obj, container);
				}
			}, 'keyboard-octave-btn');

			const octaveDisplay = createElement('span', 'octave-display');
			octaveDisplay.textContent = obj.params.keyboardOctave;

			const octaveUp = createButton('▶', () => {
				if (obj.params.keyboardOctave < 8) {
					obj.params.keyboardOctave++;
					MenuTabs.keyboard.render(obj, container);
				}
			}, 'keyboard-octave-btn');

			octaveControl.appendChild(octaveLabel);
			octaveControl.appendChild(octaveDown);
			octaveControl.appendChild(octaveDisplay);
			octaveControl.appendChild(octaveUp);
			keyboardSection.appendChild(octaveControl);

			const isGridMode = obj.type === 'Sampler' && obj.params.samplerMode === 'grid';

			if (isGridMode) {
				if (obj.params.gridEditMode === undefined) obj.params.gridEditMode = true;

				const gridInfoText = createElement('div', 'help-text');
				gridInfoText.classList.add('grid-mode-info');

				if (obj.params.gridEditMode) {
					gridInfoText.textContent = 'Edit Mode: Click keys to assign samples. Keys with samples are highlighted.';
				} else {
					gridInfoText.textContent = 'Play Mode: Click keys to test samples.';
				}
				keyboardSection.appendChild(gridInfoText);

				const modeToggle = createElement('div', 'grid-mode-toggle');

				const editBtn = createButton('Edit Samples', () => {
					obj.params.gridEditMode = true;
					MenuTabs.keyboard.render(obj, container);
				}, obj.params.gridEditMode ? 'btn-primary' : 'btn-secondary');
				editBtn.style.flex = '1';
				editBtn.style.margin = '0';

				const playBtn = createButton('Play/Test', () => {
					obj.params.gridEditMode = false;
					MenuTabs.keyboard.render(obj, container);
				}, !obj.params.gridEditMode ? 'btn-primary' : 'btn-secondary');
				playBtn.style.flex = '1';
				playBtn.style.margin = '0';

				modeToggle.appendChild(editBtn);
				modeToggle.appendChild(playBtn);
				keyboardSection.appendChild(modeToggle);
			}

			const keyboard = createElement('div', 'piano-keyboard');
			const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
			const octaves = 2;

			for (let oct = 0; oct < octaves; oct++) {
				const currentOctave = obj.params.keyboardOctave + oct;
				notes.forEach((note, idx) => {
					const midiNote = (currentOctave + 1) * 12 + idx;
					const isBlackKey = note.includes('#');
					const isSelected = obj.params.selectedNotes.includes(midiNote);
					const hasGridSample = isGridMode && obj.params.gridSamples && obj.params.gridSamples[midiNote];

					const key = createElement('div', `piano-key ${isBlackKey ? 'black-key' : 'white-key'}${isSelected ? ' selected' : ''}${hasGridSample ? ' has-sample' : ''}`);
					key.dataset.note = midiNote;

					const label = createElement('span', 'key-label');
					label.textContent = note + currentOctave;
					key.appendChild(label);

					if (isGridMode && hasGridSample) {
						const indicator = createElement('span', 'grid-sample-indicator');
						indicator.innerHTML = '●';
						key.appendChild(indicator);
					}

					key.onclick = async (e) => {
						e.stopPropagation();

						if (isGridMode) {
							if (obj.params.gridEditMode) {
								const updated = await context.showGridSampleDialog(obj, midiNote);
								if (updated) {
									MenuTabs.keyboard.render(obj, container);

									const soundTabContent = document.querySelector('.params-container');
									const tabBar = soundTabContent?.previousElementSibling;
									if (soundTabContent && tabBar) {
										const currentTab = Selectors.getCurrentTab();
										if (currentTab === 'sound') {
											context.showMenuTab(obj, soundTabContent, 'sound', tabBar);
										}
									}
								}
							} else {
								const isCurrentlySelected = obj.params.selectedNotes.includes(midiNote);
								AppState.dispatch({
									type: isCurrentlySelected ? 'SOUND_NOTE_DESELECTED' : 'SOUND_NOTE_SELECTED',
									payload: {
										soundId: obj.id,
										note: midiNote,
										isGridSampler: obj.type === 'Sampler' && obj.params.samplerMode === 'grid'
									}
								});
								MenuTabs.keyboard.render(obj, container);
							}
						} else {
							const isCurrentlySelected = obj.params.selectedNotes.includes(midiNote);
							AppState.dispatch({
								type: isCurrentlySelected ? 'SOUND_NOTE_DESELECTED' : 'SOUND_NOTE_SELECTED',
								payload: {
									soundId: obj.id,
									note: midiNote,
									isGridSampler: obj.type === 'Sampler' && obj.params.samplerMode === 'grid'
								}
							});
							MenuTabs.keyboard.render(obj, container);
						}
					};

					keyboard.appendChild(key);
				});
			}

			keyboardSection.appendChild(keyboard);

			if (!isGridMode) {
				const clearBtn = createButton('Clear Selection', () => {
					if (obj.isPlaying && obj.params.selectedNotes.length > 0) {
						context.PolyphonyManager.triggerPolyphonic(obj.synth, obj.params.selectedNotes, false, obj);
					}
					AppState.dispatch({
						type: 'SOUND_NOTES_CLEARED',
						payload: { soundId: obj.id }
					});
					AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
					MenuTabs.keyboard.render(obj, container);
				}, 'keyboard-clear-btn');
				keyboardSection.appendChild(clearBtn);
			} else {
				const clearAllBtn = createButton('Clear All Samples', async () => {
					const confirm = await context.ModalSystem.confirm(
						'Remove all samples from the grid?',
						'Clear Grid'
					);
					if (confirm) {
						AppState.dispatch({
							type: 'SOUND_GRID_CLEARED',
							payload: { soundId: obj.id }
						});
						MenuTabs.keyboard.render(obj, container);
					}
				}, 'keyboard-clear-btn');
				keyboardSection.appendChild(clearAllBtn);
			}

			container.appendChild(keyboardSection);
		}
	},

	eq: {
		render(obj, container) {
			const eqParams = obj.params.eq || (obj.params.eq = context.deepClone(context.DEFAULT_EQ_STRUCTURE));

			const toggleGroup = createElement('div', 'parameter-control');
			const toggleLabel = createElement('label', 'label-eq');
			toggleLabel.textContent = 'Enable EQ';

			const toggleCheckbox = createElement('input');
			toggleCheckbox.type = 'checkbox';
			toggleCheckbox.checked = eqParams.enabled || false;
			toggleCheckbox.onchange = () => {
				const isEnabled = toggleCheckbox.checked;
				eqParams.enabled = isEnabled;

				AppState.dispatch({
					type: 'PARAMETER_CHANGED',
					payload: {
						target: obj,
						paramKey: 'eq_enabled',
						value: isEnabled,
						options: { label: 'Enable EQ' }
					}
				});

				const parentContainer = container.closest('.params-container');
				const tabBar = parentContainer?.previousElementSibling;
				if (parentContainer && tabBar) {
					context.showMenuTab(obj, parentContainer, 'eq', tabBar);
				}
			};
			toggleLabel.appendChild(toggleCheckbox);
			toggleGroup.appendChild(toggleLabel);
			container.appendChild(toggleGroup);

			if (!eqParams.enabled) {
				container.appendChild(createElement('div', 'info-message', { textContent: 'EQ is currently disabled' }));
				return;
			}

			const bandsSection = context.UIBuilder.collapsibleSection({
				title: 'EQ Bands',
				icon: 'fa-sliders-h',
				expanded: true,
				isActive: () => eqParams.low !== 0 || eqParams.mid !== 0 || eqParams.high !== 0,
				content: (update) => {
					const content = createElement('div');
					['fx_eq_low', 'fx_eq_mid', 'fx_eq_high'].forEach(key => {
						content.appendChild(context.createParameterControl(context.PARAMETER_REGISTRY[key], key, obj, update, { small: true, updateNode: true }));
					});
					return content;
				}
			});
			container.appendChild(bandsSection);

			const crossoverSection = context.UIBuilder.collapsibleSection({
				title: 'Crossover Frequencies',
				icon: 'fa-arrows-alt-h',
				isActive: () => eqParams.lowFrequency !== CONSTANTS.DEFAULT_EQ_VALUES.lowFrequency || eqParams.highFrequency !== CONSTANTS.DEFAULT_EQ_VALUES.highFrequency,
				content: (update) => {
					const content = createElement('div');
					['fx_eq_lowFreq', 'fx_eq_highFreq'].forEach(key => {
						content.appendChild(context.createParameterControl(context.PARAMETER_REGISTRY[key], key, obj, update, { small: true, updateNode: true }));
					});
					return content;
				}
			});
			container.appendChild(crossoverSection);
		},
	},

	fx: {
		render(obj, container) {
			[1, 2, 3].forEach(slotNum => {
				const isSlotActive = () => obj.params.fx[`slot${slotNum}`]?.type !== 'none';

				const section = context.UIBuilder.collapsibleSection({
					title: `FX Slot ${slotNum}`,
					icon: 'fa-sliders-h',
					isActive: isSlotActive,
					content: () => this.renderFXControls(slotNum, obj.params.fx[`slot${slotNum}`], obj, container)
				});

				container.appendChild(section);
			});
		},

		createFXSlot(slotNum, obj, container) {
			const currentFX = obj.params.fx[`slot${slotNum}`];
			return createCollapsibleSection(
				`FX Slot ${slotNum}`,
				'fa-sliders-h',
				() => this.renderFXControls(slotNum, currentFX, obj, container),
				false
			);
		},

		renderFXControls(slotNum, currentFX, obj, container) {
			const content = createElement('div');

			const fxOptions = context.getAvailableFXTypes();
			const fxSelect = createSelect(fxOptions, currentFX.type, async (e) => {
				context.changeFX(obj, slotNum, e.target.value);
				await context.waitForNextFrame();
				const parentContainer = container.closest('.params-container');
				if (parentContainer) {
					parentContainer.innerHTML = '';
					this.render(obj, parentContainer);
					const slots = parentContainer.querySelectorAll('.collapsible-section');
					if (slots[slotNum - 1] && e.target.value !== 'none') {
						slots[slotNum - 1].classList.add('expanded');
					}
				}
			}, { width: '100%', marginBottom: '8px' });
			content.appendChild(fxSelect);

			if (currentFX.type !== 'none') {
				content.appendChild(context.createParameterControl(
					context.PARAMETER_REGISTRY['fx_mix'],
					'fx_mix',
					obj, undefined, {
						small: true,
						slot: `slot${slotNum}`,
						paramName: 'mix',
						isMixParameter: true,
						isLayerFX: false
					}
				));

				const effectParams = context.getEffectParameters(currentFX.type);
				effectParams.forEach(paramKey => {
					const paramName = paramKey.replace('fx_', '').replace('_long', '');
					content.appendChild(context.createParameterControl(
						context.PARAMETER_REGISTRY[paramKey],
						paramKey,
						obj, undefined, {
							small: true,
							slot: `slot${slotNum}`,
							paramName: paramName,
							isLayerFX: false
						}
					));
				});
			}

			return content;
		}
	},

	mod: {
		render(obj, container) {
			const isPositionLFOActive = () => {
				const lfo = obj.params.lfo;
				return (lfo.x.range > 0 && lfo.x.freq > 0) ||
					(lfo.y.range > 0 && lfo.y.freq > 0) ||
					(lfo.size.range > 0 && lfo.size.freq > 0);
			};

			const isParameterModulationActive = () => {
				const lfo = obj.params.lfo;
				return (lfo.mod1.range > 0 && lfo.mod1.freq > 0) ||
					(lfo.mod2.range > 0 && lfo.mod2.freq > 0) ||
					(lfo.mod3.range > 0 && lfo.mod3.freq > 0);
			};

			const isFXModulationActive = () => {
				const lfo = obj.params.lfo;
				return (lfo.fxMod1 && lfo.fxMod1.range > 0 && lfo.fxMod1.freq > 0) ||
					(lfo.fxMod2 && lfo.fxMod2.range > 0 && lfo.fxMod2.freq > 0) ||
					(lfo.fxMod3 && lfo.fxMod3.range > 0 && lfo.fxMod3.freq > 0);
			};

			const allParameters = context.getParametersForSynth(obj.type, obj.role);
			const motionParams = allParameters.filter(pKey => {
				const def = context.PARAMETER_REGISTRY[pKey];
				return def && def.category === 'motion';
			});

			if (motionParams.length > 0) {
				const isMotionActive = () => {
					return motionParams.some(pKey => {
						const def = context.PARAMETER_REGISTRY[pKey];
						const val = context.ParameterManager.getValue(obj, pKey);
						return val !== def.defaultValue;
					});
				};

				const motionSection = context.UIBuilder.collapsibleSection({
					title: 'Motion & Playback',
					icon: 'fa-walking',
					isActive: isMotionActive,
					content: (update) => {
						const content = createElement('div');

						const resampleControls = createElement('div');
						const granularControls = createElement('div');
						const commonControls = createElement('div');

						motionParams.forEach(pKey => {
							const control = context.createParameterControl(context.PARAMETER_REGISTRY[pKey], pKey, obj, update, { small: true });
							if (['fadeIn', 'fadeOut', 'loopFadeIn', 'loopFadeOut'].includes(pKey)) {
								resampleControls.appendChild(control);
							} else if (['timeStretchMode', 'grainSize', 'overlap', 'grainDetune'].includes(pKey)) {
								granularControls.appendChild(control);
							} else if (pKey === 'playbackMode') {
								const select = control.querySelector('select');
								if (select) {
									select.onchange = async (e) => {
										await context._handleSoundFileModeChange(obj, e.target.value);
										const parentContainer = content.closest('.params-container');
										const tabBar = parentContainer?.previousElementSibling;
										if (parentContainer && tabBar) {
											context.showMenuTab(obj, parentContainer, 'mod', tabBar);
										}
									};
								}
								content.appendChild(control);
							} else {
								commonControls.appendChild(control);
							}
						});

						resampleControls.style.display = obj.params.playbackMode === 'granular' ? 'none' : 'block';
						granularControls.style.display = obj.params.playbackMode === 'granular' ? 'block' : 'none';

						content.appendChild(resampleControls);
						content.appendChild(granularControls);
						content.appendChild(commonControls);

						return content;
					}
				});
				container.appendChild(motionSection);

				if (obj.type === 'Granular') {
					const isGranularActive = () => {
						const p = obj.params;
						return p.timeStretchMode !== 'adaptive' || p.grainSize !== 0.1 || p.overlap !== 0.05 || p.grainDetune !== 0;
					};

					const granularSection = context.UIBuilder.collapsibleSection({
						title: 'Time-Stretching',
						icon: 'fa-ruler-horizontal',
						isActive: isGranularActive,
						content: (update) => {
							const content = createElement('div');

							const modeControl = context.createParameterControl(context.PARAMETER_REGISTRY['timeStretchMode'], 'timeStretchMode', obj, update);
							content.appendChild(modeControl);

							const manualControls = createElement('div');
							manualControls.style.display = obj.params.timeStretchMode === 'manual' ? 'block' : 'none';
							manualControls.appendChild(context.createParameterControl(context.PARAMETER_REGISTRY['grainSize'], 'grainSize', obj, update, { small: true }));
							manualControls.appendChild(context.createParameterControl(context.PARAMETER_REGISTRY['overlap'], 'overlap', obj, update, { small: true }));
							content.appendChild(manualControls);

							content.appendChild(context.createParameterControl(context.PARAMETER_REGISTRY['grainDetune'], 'grainDetune', obj, update, { small: true }));

							const select = modeControl.querySelector('select');
							if (select) {
								select.onchange = (e) => {
									obj.params.timeStretchMode = e.target.value;
									manualControls.style.display = e.target.value === 'manual' ? 'block' : 'none';
									update();
								};
							}
							return content;
						}
					});
					container.appendChild(granularSection);
				}
			}

		if (obj.marker) {
			const posSection = context.UIBuilder.collapsibleSection({
				title: 'Position & Size LFO',
				icon: 'fa-arrows-alt',
				content: () => {
					const content = createElement('div');
					const updateHeader = () => posSection.querySelector('.collapsible-section-header').classList.toggle('active', isPositionLFOActive());

					['x', 'y', 'size'].forEach(axis => {
						const group = createElement('div', 'parameter-group');
						const label = createElement('div', 'parameter-label');
						label.textContent = axis === 'size' ? 'Size' : `${axis.toUpperCase()} Position`;
						group.appendChild(label);

						group.appendChild(context.createParameterControl(context.PARAMETER_REGISTRY[`lfo_${axis}_range`], `lfo_${axis}_range`, obj, updateHeader, { small: true }));
						group.appendChild(context.createParameterControl(context.PARAMETER_REGISTRY[`lfo_${axis}_freq`], `lfo_${axis}_freq`, obj, updateHeader, { small: true }));

						content.appendChild(group);
					});
					return content;
				}
			});
			posSection.querySelector('.collapsible-section-header').classList.toggle('active', isPositionLFOActive());
			container.appendChild(posSection);
		}

		const modSection = context.UIBuilder.collapsibleSection({
			title: 'Parameter Modulation',
			icon: 'fa-sliders-h',
			content: () => {
				const content = createElement('div');
				const updateHeader = () => modSection.querySelector('.collapsible-section-header').classList.toggle('active', isParameterModulationActive());

				['mod1', 'mod2', 'mod3'].forEach((mod, index) => {
					content.appendChild(this.createModGroup(mod, index + 1, obj, updateHeader));
				});
				return content;
			}
		});
		modSection.querySelector('.collapsible-section-header').classList.toggle('active', isParameterModulationActive());
		container.appendChild(modSection);

		const fxModSection = context.UIBuilder.collapsibleSection({
			title: 'Effects Modulation',
			icon: 'fa-magic',
			content: () => {
				const content = createElement('div');
				const updateHeader = () => fxModSection.querySelector('.collapsible-section-header').classList.toggle('active', isFXModulationActive());

				['fxMod1', 'fxMod2', 'fxMod3'].forEach((mod, index) => {
					content.appendChild(this.createFXModGroup(mod, index + 1, obj, updateHeader));
				});
				return content;
			}
		});
		fxModSection.querySelector('.collapsible-section-header').classList.toggle('active', isFXModulationActive());
		container.appendChild(fxModSection);
		},

		createModGroup(mod, index, obj, onUpdate) {
			const group = createElement('div', 'parameter-group');
			const label = createElement('div', 'parameter-label');
			label.textContent = `Mod ${index}`;
			group.appendChild(label);

			const dropdownsContainer = createElement('div', 'modulation-dropdowns');

			const isSequencerSynth = !obj.marker;
			const sourceOptions = isSequencerSynth ? [
				{ value: 'lfo', label: 'LFO' },
				{ value: 'walkableLFO', label: 'Walkable LFO' },
				{ value: 'speed', label: 'Speed' },
				{ value: 'stepPosition', label: 'Step Position' },
				{ value: 'randomStep', label: 'Random' }
			] : [
				{ value: 'lfo', label: 'LFO' },
				{ value: 'walkableLFO', label: 'Walkable LFO' },
				{ value: 'speed', label: 'Speed' },
				{ value: 'distance', label: 'Distance' },
				{ value: 'x', label: 'X position' },
				{ value: 'y', label: 'Y position' }
			];
			const sourceSelect = createSelect(sourceOptions, obj.params.lfo[mod].source, (e) => {
				obj.params.lfo[mod].source = e.target.value;
				updateControlsVisibility();
				if (onUpdate) onUpdate();
			});
			dropdownsContainer.appendChild(sourceSelect);

			const availableTargets = context.getAvailableModulationTargets(obj.type, obj.role);
			const targetOptions = availableTargets.map(t => ({ value: t, label: context.PARAMETER_REGISTRY[t]?.label || t }));
			const targetSelect = createSelect(targetOptions, obj.params.lfo[mod].target, (e) => {
				obj.params.lfo[mod].target = e.target.value;
				if (onUpdate) onUpdate();
			});
			dropdownsContainer.appendChild(targetSelect);

			const waveformOptions = [
				{ value: 'sine', label: 'Sine' },
				{ value: 'triangle', label: 'Triangle' },
				{ value: 'sawup', label: 'Saw Up' },
				{ value: 'sawdown', label: 'Saw Down' },
				{ value: 'square', label: 'Square' },
				{ value: 'random', label: 'S&H' },
				{ value: 'randomEdgy', label: 'S&H Hard' }
			];
			const waveformSelect = createSelect(
				waveformOptions,
				obj.params.lfo[mod].waveform || 'sine',
				(e) => {
					obj.params.lfo[mod].waveform = e.target.value;
					if (onUpdate) onUpdate();
				}
			);
			dropdownsContainer.appendChild(waveformSelect);

			group.appendChild(dropdownsContainer);

			group.appendChild(context.createParameterControl(context.PARAMETER_REGISTRY[`lfo_${mod}_range`], `lfo_${mod}_range`, obj, onUpdate, { small: true }));

			const freqControl = context.createParameterControl(context.PARAMETER_REGISTRY[`lfo_${mod}_freq`], `lfo_${mod}_freq`, obj, onUpdate, { small: true });
			const freqLabel = freqControl.querySelector('label');
			const freqInput = freqControl.querySelector('input[type="range"]');
			const freqDisplay = freqControl.querySelector('.value-display');

			const originalFreqInput = freqInput.oninput;
			freqInput.oninput = () => {
				originalFreqInput();
				updateFreqDisplay();
			};

			group.appendChild(freqControl);

			const referenceSpeedControl = context.createParameterControl(context.PARAMETER_REGISTRY[`lfo_${mod}_referenceSpeed`], `lfo_${mod}_referenceSpeed`, obj, onUpdate, { small: true });
			group.appendChild(referenceSpeedControl);

			const speedThresholdControl = context.createParameterControl(context.PARAMETER_REGISTRY[`lfo_${mod}_speedThreshold`], `lfo_${mod}_speedThreshold`, obj, onUpdate, { small: true });
			group.appendChild(speedThresholdControl);

			const updateFreqDisplay = () => {
				const source = obj.params.lfo[mod].source;
				const val = obj.params.lfo[mod].freq;

				if (source === 'speed') {
					freqDisplay.textContent = val.toFixed(2);
				} else if (source === 'stepPosition') {
					freqDisplay.textContent = val > 0 ? '+' : (val < 0 ? '' : '±') + val.toFixed(2);
				} else if (source === 'randomStep') {
					freqDisplay.textContent = Math.round(val * 100).toString();
				} else if (source === 'walkableLFO') {
					freqDisplay.textContent = val.toFixed(2) + ' c/m';
				} else {
					freqDisplay.textContent = val.toFixed(2) + ' Hz';
				}
			};

			const updateControlsVisibility = () => {
				const source = obj.params.lfo[mod].source;
				const isLFO = !source || source === 'lfo';
				const isWalkableLFO = source === 'walkableLFO';
				const isSpeed = source === 'speed';
				const isStepPosition = source === 'stepPosition';
				const isRandomStep = source === 'randomStep';

				waveformSelect.style.display = (isLFO || isWalkableLFO) ? '' : 'none';
				referenceSpeedControl.style.display = isSpeed ? '' : 'none';
				speedThresholdControl.style.display = isWalkableLFO ? '' : 'none';

				if (isSpeed) {
					freqLabel.textContent = 'Lock to User Speed';
					freqInput.max = '1';
					freqInput.min = '0';
					if (parseFloat(freqInput.value) > 1) {
						freqInput.value = '1';
						obj.params.lfo[mod].freq = 1;
					}
				} else if (isStepPosition) {
					freqLabel.textContent = 'Direction';
					freqInput.max = '1';
					freqInput.min = '-1';
					freqInput.step = '0.01';
					if (obj.params.lfo[mod].freq === undefined || obj.params.lfo[mod].freq > 1 || obj.params.lfo[mod].freq < -1) {
						freqInput.value = '1';
						obj.params.lfo[mod].freq = 1;
					}
				} else if (isRandomStep) {
					freqLabel.textContent = 'Seed';
					freqInput.max = '1';
					freqInput.min = '0';
					freqInput.step = '0.01';
				} else if (isWalkableLFO) {
					freqLabel.textContent = 'Cycles/m';
					freqInput.max = '10';
					freqInput.min = '0';
					freqInput.step = '0.1';
				} else {
					freqLabel.textContent = 'Freq';
					freqInput.max = '2';
					freqInput.min = '0';
					freqInput.step = '0.01';
				}

				updateFreqDisplay();
			};

			updateControlsVisibility();

			return group;
		},

		createFXModGroup(mod, index, obj, onUpdate) {
			const group = createElement('div', 'parameter-group');
			const label = createElement('div', 'parameter-label');
			label.textContent = `FX Mod ${index}`;
			group.appendChild(label);

			const dropdownsContainer = createElement('div', 'modulation-dropdowns');

			const isSequencerSynth = !obj.marker;
			const sourceOptions = isSequencerSynth ? [
				{ value: 'lfo', label: 'LFO' },
				{ value: 'walkableLFO', label: 'Walkable LFO' },
				{ value: 'speed', label: 'Speed' },
				{ value: 'stepPosition', label: 'Step Position' },
				{ value: 'randomStep', label: 'Random' }
			] : [
				{ value: 'lfo', label: 'LFO' },
				{ value: 'walkableLFO', label: 'Walkable LFO' },
				{ value: 'speed', label: 'Speed' },
				{ value: 'distance', label: 'Distance' },
				{ value: 'x', label: 'X position' },
				{ value: 'y', label: 'Y position' }
			];
			const sourceSelect = createSelect(sourceOptions, obj.params.lfo[mod].source, (e) => {
				obj.params.lfo[mod].source = e.target.value;
				updateControlsVisibility();
				if (onUpdate) onUpdate();
			});
			dropdownsContainer.appendChild(sourceSelect);

			const targetOptions = context.getAvailableFXModulationTargets(obj.params.fx);
			const targetSelect = createSelect(targetOptions, obj.params.lfo[mod].target, (e) => {
				obj.params.lfo[mod].target = e.target.value;
				if (onUpdate) onUpdate();
			});
			dropdownsContainer.appendChild(targetSelect);

			const waveformOptions = [
				{ value: 'sine', label: 'Sine' },
				{ value: 'triangle', label: 'Triangle' },
				{ value: 'sawup', label: 'Saw Up' },
				{ value: 'sawdown', label: 'Saw Down' },
				{ value: 'square', label: 'Square' },
				{ value: 'random', label: 'S&H' },
				{ value: 'randomEdgy', label: 'S&H Hard' }
			];
			const waveformSelect = createSelect(
				waveformOptions,
				obj.params.lfo[mod].waveform || 'sine',
				(e) => {
					obj.params.lfo[mod].waveform = e.target.value;
					if (onUpdate) onUpdate();
				}
			);
			dropdownsContainer.appendChild(waveformSelect);

			group.appendChild(dropdownsContainer);

			group.appendChild(context.createParameterControl(context.PARAMETER_REGISTRY[`lfo_${mod}_range`], `lfo_${mod}_range`, obj, onUpdate, { small: true }));

			const freqControl = context.createParameterControl(context.PARAMETER_REGISTRY[`lfo_${mod}_freq`], `lfo_${mod}_freq`, obj, onUpdate, { small: true });
			const freqLabel = freqControl.querySelector('label');
			const freqInput = freqControl.querySelector('input[type="range"]');
			const freqDisplay = freqControl.querySelector('.value-display');

			const originalFreqInput = freqInput.oninput;
			freqInput.oninput = () => {
				originalFreqInput();
				updateFreqDisplay();
			};

			group.appendChild(freqControl);

			const referenceSpeedControl = context.createParameterControl(context.PARAMETER_REGISTRY[`lfo_${mod}_referenceSpeed`], `lfo_${mod}_referenceSpeed`, obj, onUpdate, { small: true });
			group.appendChild(referenceSpeedControl);

			const speedThresholdControl = context.createParameterControl(context.PARAMETER_REGISTRY[`lfo_${mod}_speedThreshold`], `lfo_${mod}_speedThreshold`, obj, onUpdate, { small: true });
			group.appendChild(speedThresholdControl);

			const updateFreqDisplay = () => {
				const source = obj.params.lfo[mod].source;
				const val = obj.params.lfo[mod].freq;

				if (source === 'speed') {
					freqDisplay.textContent = val.toFixed(2);
				} else if (source === 'stepPosition') {
					freqDisplay.textContent = val > 0 ? '+' : (val < 0 ? '' : '±') + val.toFixed(2);
				} else if (source === 'randomStep') {
					freqDisplay.textContent = Math.round(val * 100).toString();
				} else if (source === 'walkableLFO') {
					freqDisplay.textContent = val.toFixed(2) + ' c/m';
				} else {
					freqDisplay.textContent = val.toFixed(2) + ' Hz';
				}
			};

			const updateControlsVisibility = () => {
				const source = obj.params.lfo[mod].source;
				const isLFO = !source || source === 'lfo';
				const isWalkableLFO = source === 'walkableLFO';
				const isSpeed = source === 'speed';
				const isStepPosition = source === 'stepPosition';
				const isRandomStep = source === 'randomStep';

				waveformSelect.style.display = (isLFO || isWalkableLFO) ? '' : 'none';
				referenceSpeedControl.style.display = isSpeed ? '' : 'none';
				speedThresholdControl.style.display = isWalkableLFO ? '' : 'none';

				if (isSpeed) {
					freqLabel.textContent = 'Lock to User Speed';
					freqInput.max = '1';
					freqInput.min = '0';
					if (parseFloat(freqInput.value) > 1) {
						freqInput.value = '1';
						obj.params.lfo[mod].freq = 1;
					}
				} else if (isStepPosition) {
					freqLabel.textContent = 'Direction';
					freqInput.max = '1';
					freqInput.min = '-1';
					freqInput.step = '0.01';
					if (obj.params.lfo[mod].freq === undefined || obj.params.lfo[mod].freq > 1 || obj.params.lfo[mod].freq < -1) {
						freqInput.value = '1';
						obj.params.lfo[mod].freq = 1;
					}
				} else if (isRandomStep) {
					freqLabel.textContent = 'Seed';
					freqInput.max = '1';
					freqInput.min = '0';
					freqInput.step = '0.01';
				} else if (isWalkableLFO) {
					freqLabel.textContent = 'Cycles/m';
					freqInput.max = '10';
					freqInput.min = '0';
					freqInput.step = '0.1';
				} else {
					freqLabel.textContent = 'Freq';
					freqInput.max = '2';
					freqInput.min = '0';
					freqInput.step = '0.01';
				}

				updateFreqDisplay();
			};

			updateControlsVisibility();

			return group;
		}
	},

	patches: {
		render(obj, container) {
			if (!obj.pathRoles) {
				obj.pathRoles = { movement: null, zones: [], modulation: [], soundModulation: [] };
			}
			if (!obj.pathRoles.soundModulation) {
				obj.pathRoles.soundModulation = [];
			}

			const hasPaths = Selectors.getPaths().length > 0;
			const hasOtherSounds = Selectors.getSounds().filter(s => s.id !== obj.id).length > 0;

			if (!hasPaths && !hasOtherSounds) {
				const info = createElement('div', 'info-message');
				info.textContent = 'No control paths or other sounds available.';
				container.appendChild(info);
				return;
			}

			if (hasPaths) {
				container.appendChild(this.createMovementSection(obj));
				container.appendChild(this.createZonesSection(obj));
				container.appendChild(this.createModulationSection(obj, container));
			}
			if (hasOtherSounds) {
				container.appendChild(this.createSoundRelativeSection(obj, container));
			}
			if (hasPaths) {
				container.appendChild(this.createReflectionsSection(obj, container));
			}
		},

		createMovementSection(obj) {
			return context.UIBuilder.collapsibleSection({
				title: 'Movement Path',
				icon: 'fa-route',
				expanded: !!obj.pathRoles.movement,
				content: () => {
					const content = createElement('div');
					const pathOptions = [
						{ value: 'none', label: '- None -' },
						...Selectors.getPaths().map(p => ({ value: p.id, label: p.label }))
					];

					const pathSelect = createSelect(pathOptions, obj.pathRoles.movement || 'none', (e) => {
						const oldPathId = obj.pathRoles.movement;
						const newPathId = e.target.value === 'none' ? null : e.target.value;

						if (oldPathId) {
							const oldPath = AppState.getPath(oldPathId);
							if (oldPath) {
								const index = oldPath.attachedSounds.indexOf(obj.marker._leaflet_id);
								if (index > -1) {
									oldPath.attachedSounds.splice(index, 1);
								}
							}
						}

						obj.pathRoles.movement = newPathId;

						if (newPathId) {
							const newPath = AppState.getPath(newPathId);
							if (!newPath) {
								console.error('Path not found:', newPathId);
								obj.pathRoles.movement = null;
							} else {
								if (!newPath.attachedSounds.includes(obj.marker._leaflet_id)) {
									newPath.attachedSounds.push(obj.marker._leaflet_id);
								}
								if (!obj.motion) {
									obj.motion = {
										speed: 1.0,
										behavior: 'forward'
									};
								}
								delete obj.pathProgress;
							}
						} else {
							delete obj.pathProgress;
						}

						AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });

						if (context.startAudioLoop && newPathId) {
							context.startAudioLoop();
						}

						const parentContainer = document.querySelector('.params-container');
						if (parentContainer) {
							parentContainer.innerHTML = '';
							MenuTabs.patches.render(obj, parentContainer);
						}
					});
					pathSelect.className = 'patch-select';
					content.appendChild(pathSelect);

					if (obj.pathRoles.movement) {
						content.appendChild(this.createMotionControls(obj));
					}
					return content;
				}
			});
		},

		createMotionControls(obj) {
			const motionGroup = createElement('div', 'parameter-group');
			const motionLabel = createElement('div', 'parameter-label');
			motionLabel.textContent = 'Path Motion';
			motionGroup.appendChild(motionLabel);

			const speedGroup = createElement('div', 'parameter-control');
			const speedLabel = createElement('label');
			speedLabel.textContent = 'Speed (m/s)';
			const speedSlider = createElement('input');
			speedSlider.type = 'range';
			speedSlider.min = 0.1;
			speedSlider.max = 50;
			speedSlider.step = 0.1;
			speedSlider.value = obj.motion?.speed ?? 1.0;
			const speedDisplay = createElement('span', 'value-display');
			speedDisplay.textContent = `${(obj.motion?.speed ?? 1.0).toFixed(1)} m/s`;
			speedSlider.oninput = () => {
				if (!obj.motion) obj.motion = {};
				obj.motion.speed = parseFloat(speedSlider.value);
				speedDisplay.textContent = `${obj.motion.speed.toFixed(1)} m/s`;
			};
			speedGroup.appendChild(speedLabel);
			speedGroup.appendChild(speedSlider);
			speedGroup.appendChild(speedDisplay);
			motionGroup.appendChild(speedGroup);

			const timeGroup = createElement('div', 'parameter-control');
			const timeLabel = createElement('label');
			timeLabel.textContent = 'Roundtrip (s)';
			const timeInput = createElement('input');
			timeInput.type = 'number';
			timeInput.min = 1;
			timeInput.max = 3600;
			timeInput.step = 1;
			const currentPath = AppState.getPath(obj.pathRoles.movement);
			const currentLength = context.computePathLength(currentPath);
			timeInput.value = Math.max(1, Math.round(currentLength / (obj.motion?.speed ?? 1.0)));
			const timeUnit = createElement('span', 'value-display');
			timeUnit.textContent = 'seconds';
			timeInput.onchange = () => {
				const desired = parseFloat(timeInput.value);
				if (!obj.motion) obj.motion = {};
				if (desired > 0) {
					const len = context.computePathLength(AppState.getPath(obj.pathRoles.movement));
					obj.motion.speed = len / desired;
					speedSlider.value = obj.motion.speed;
					speedDisplay.textContent = `${obj.motion.speed.toFixed(1)} m/s`;
				}
			};
			timeGroup.appendChild(timeLabel);
			timeGroup.appendChild(timeInput);
			timeGroup.appendChild(timeUnit);
			motionGroup.appendChild(timeGroup);

			const behaviorGroup = createElement('div', 'parameter-control');
			const behaviorLabel = createElement('label');
			behaviorLabel.textContent = 'Behavior';
			const behaviorOptions = [
				{ value: 'forward', label: 'Forward' },
				{ value: 'backward', label: 'Backward' },
				{ value: 'pingpong', label: 'Ping-Pong' }
			];
			const behaviorSelect = createSelect(behaviorOptions, obj.motion?.behavior || 'forward', (e) => {
				if (!obj.motion) obj.motion = {};
				obj.motion.behavior = e.target.value;
			});
			behaviorGroup.appendChild(behaviorLabel);
			behaviorGroup.appendChild(behaviorSelect);
			motionGroup.appendChild(behaviorGroup);

			return motionGroup;
		},

		createZonesSection(obj) {
			return context.UIBuilder.collapsibleSection({
				title: 'Zone Boundaries',
				icon: 'fa-draw-polygon',
				expanded: obj.pathRoles.zones.length > 0,
				content: () => {
					const content = createElement('div', 'path-assignments-list');
					Selectors.getPaths().forEach(path => {
						const item = createElement('div', 'path-role-item');
						const checkbox = createElement('input');
						checkbox.type = 'checkbox';
						checkbox.checked = obj.pathRoles.zones.includes(path.id);
						checkbox.onchange = () => {
							if (checkbox.checked) {
								if (!obj.pathRoles.zones.includes(path.id)) {
									obj.pathRoles.zones.push(path.id);
								}
							} else {
								const idx = obj.pathRoles.zones.indexOf(path.id);
								if (idx !== -1) obj.pathRoles.zones.splice(idx, 1);
							}
						};
						const label = createElement('label');
						label.textContent = path.label;
						label.onclick = () => {
							checkbox.checked = !checkbox.checked;
							checkbox.onchange();
						};
						item.appendChild(checkbox);
						item.appendChild(label);
						content.appendChild(item);
					});
					return content;
				}
			});
		},

		createModulationSection(obj, container) {
			return context.UIBuilder.collapsibleSection({
				title: 'Modulation Patches',
				icon: 'fa-random',
				expanded: obj.pathRoles.modulation.length > 0,
				content: () => {
					const content = createElement('div');
					const paths = Selectors.getPaths();

					if (paths.length === 0) {
						const info = createElement('div', 'info-message');
						info.textContent = 'No paths available for modulation.';
						content.appendChild(info);
						return content;
					}

					const addPatchBtn = createButton('+ Add Patch', () => {
						obj.pathRoles.modulation.push({
							pathId: paths[0].id,
							parameter: 'pitch',
							output: 'distance',
							depth: 50,
							invert: false
						});
						container.innerHTML = '';
						MenuTabs.patches.render(obj, container);
					}, 'btn-add');
					content.appendChild(addPatchBtn);

					obj.pathRoles.modulation.forEach((patch, index) => {
						content.appendChild(this.createPatchItem(patch, index, obj, paths, container));
					});
					return content;
				}
			});
		},

		createPatchItem(patch, index, obj, paths, container) {
			const patchDiv = createElement('div', 'patch-item');
			const patchTitle = createElement('div', 'patch-title');
			patchTitle.textContent = `Patch ${index + 1}`;
			patchDiv.appendChild(patchTitle);

			const pathOptions = paths.map(p => ({
				value: p.id,
				label: p.label
			}));
			const pathSelect = createSelect(pathOptions, patch.pathId, (e) => {
				patch.pathId = e.target.value;
			});
			pathSelect.className = 'patch-select';
			patchDiv.appendChild(pathSelect);

			const outputOptions = [
				{ value: 'distance', label: 'Distance from center' },
				{ value: 'x', label: 'X position (E-W)' },
				{ value: 'y', label: 'Y position (N-S)' },
				{ value: 'gate', label: 'Gate (in/out)' }
			];
			const outputSelect = createSelect(outputOptions, patch.output, (e) => {
				patch.output = e.target.value;
			});
			outputSelect.className = 'patch-select';
			patchDiv.appendChild(outputSelect);

			const availableTargets = context.getAvailableModulationTargets(obj.type, obj.role);
			const paramOptions = availableTargets.map(t => ({
				value: t,
				label: context.PARAMETER_REGISTRY[t]?.label || t
			}));
			const paramSelect = createSelect(paramOptions, patch.parameter, (e) => {
				patch.parameter = e.target.value;
			});
			paramSelect.className = 'patch-select';
			patchDiv.appendChild(paramSelect);

			const depthGroup = createElement('div', 'parameter-control');
			const depthLabel = createElement('label');
			depthLabel.textContent = 'Depth';
			depthGroup.appendChild(depthLabel);
			const depthSlider = createElement('input');
			depthSlider.type = 'range';
			depthSlider.min = 0;
			depthSlider.max = 100;
			depthSlider.value = patch.depth;
			const depthDisplay = createElement('span', 'value-display');
			depthDisplay.textContent = patch.depth + '%';
			depthSlider.oninput = () => {
				patch.depth = parseFloat(depthSlider.value);
				depthDisplay.textContent = patch.depth + '%';
			};
			depthGroup.appendChild(depthSlider);
			depthGroup.appendChild(depthDisplay);
			patchDiv.appendChild(depthGroup);

			const invertGroup = createElement('div', 'parameter-control');
			const invertLabel = createElement('label');
			invertLabel.textContent = 'Invert';
			invertGroup.appendChild(invertLabel);
			const invertCheck = createElement('input');
			invertCheck.type = 'checkbox';
			invertCheck.checked = patch.invert || false;
			invertCheck.onchange = () => {
				patch.invert = invertCheck.checked;
			};
			invertGroup.appendChild(invertCheck);
			patchDiv.appendChild(invertGroup);

			const removeBtn = createButton('Remove', () => {
				obj.pathRoles.modulation.splice(index, 1);

				const param = patch.parameter;
				if (obj.params.originalValues && obj.params.originalValues[param] !== undefined) {
					context.updateSynthParam(obj, param, obj.params.originalValues[param]);
				}

				AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });

				container.innerHTML = '';
				this.render(obj, container);
			}, 'delete-btn');
			patchDiv.appendChild(removeBtn);

			return patchDiv;
		},

		createSoundRelativeSection(obj, container) {
			return context.UIBuilder.collapsibleSection({
				title: 'Sound Relative',
				icon: 'fa-link',
				expanded: obj.pathRoles.soundModulation.length > 0,
				content: () => {
					const content = createElement('div');
					const otherSounds = Selectors.getSounds().filter(s => s.id !== obj.id);

					if (otherSounds.length === 0) {
						const info = createElement('div', 'info-message');
						info.textContent = 'No other sounds available.';
						content.appendChild(info);
						return content;
					}

					const addBtn = createButton('+ Add Reference', () => {
						obj.pathRoles.soundModulation.push({
							sourceId: otherSounds[0].id,
							output: 'proximity',
							target: 'filterFreq',
							range: 50,
							polarity: 1
						});
						container.innerHTML = '';
						MenuTabs.patches.render(obj, container);
					}, 'btn-add');
					content.appendChild(addBtn);

					obj.pathRoles.soundModulation.forEach((patch, index) => {
						content.appendChild(this.createSoundPatchItem(patch, index, obj, otherSounds, container));
					});

					return content;
				}
			});
		},

		createSoundPatchItem(patch, index, obj, otherSounds, container) {
			const patchDiv = createElement('div', 'patch-item');
			const patchTitle = createElement('div', 'patch-title');
			patchTitle.textContent = `Reference ${index + 1}`;
			patchDiv.appendChild(patchTitle);

			const soundOptions = otherSounds.map(s => ({
				value: String(s.id),
				label: s.label
			}));
			const soundSelect = createSelect(soundOptions, String(patch.sourceId), (e) => {
				const val = e.target.value;
				patch.sourceId = isNaN(parseInt(val)) ? val : parseInt(val);
			});
			soundSelect.className = 'patch-select';
			patchDiv.appendChild(soundSelect);

			const outputOptions = [
				{ value: 'proximity', label: 'Proximity (relative)' },
				{ value: 'distance', label: 'Distance' },
				{ value: 'x', label: 'X position (E-W)' },
				{ value: 'y', label: 'Y position (N-S)' },
				{ value: 'gate', label: 'Gate (in/out)' }
			];
			const outputSelect = createSelect(outputOptions, patch.output, (e) => {
				patch.output = e.target.value;
			});
			outputSelect.className = 'patch-select';
			patchDiv.appendChild(outputSelect);

			const availableTargets = context.getAvailableModulationTargets(obj.type, obj.role);
			const paramOptions = availableTargets.map(t => ({
				value: t,
				label: context.PARAMETER_REGISTRY[t]?.label || t
			}));
			const paramSelect = createSelect(paramOptions, patch.target, (e) => {
				patch.target = e.target.value;
			});
			paramSelect.className = 'patch-select';
			patchDiv.appendChild(paramSelect);

			const rangeGroup = createElement('div', 'parameter-control');
			const rangeLabel = createElement('label');
			rangeLabel.textContent = 'Range';
			rangeGroup.appendChild(rangeLabel);
			const rangeSlider = createElement('input');
			rangeSlider.type = 'range';
			rangeSlider.min = 0;
			rangeSlider.max = 100;
			rangeSlider.value = patch.range;
			const rangeDisplay = createElement('span', 'value-display');
			rangeDisplay.textContent = patch.range + '%';
			rangeSlider.oninput = () => {
				patch.range = parseFloat(rangeSlider.value);
				rangeDisplay.textContent = patch.range + '%';
			};
			rangeGroup.appendChild(rangeSlider);
			rangeGroup.appendChild(rangeDisplay);
			patchDiv.appendChild(rangeGroup);

			const polarityGroup = createElement('div', 'parameter-control');
			const polarityLabel = createElement('label');
			polarityLabel.textContent = 'Polarity';
			polarityGroup.appendChild(polarityLabel);
			const polaritySlider = createElement('input');
			polaritySlider.type = 'range';
			polaritySlider.min = -1;
			polaritySlider.max = 1;
			polaritySlider.step = 0.1;
			polaritySlider.value = patch.polarity !== undefined ? patch.polarity : 1;
			const polarityDisplay = createElement('span', 'value-display');
			const formatPolarity = (val) => val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1);
			polarityDisplay.textContent = formatPolarity(parseFloat(polaritySlider.value));
			polaritySlider.oninput = () => {
				patch.polarity = parseFloat(polaritySlider.value);
				polarityDisplay.textContent = formatPolarity(patch.polarity);
			};
			polarityGroup.appendChild(polaritySlider);
			polarityGroup.appendChild(polarityDisplay);
			patchDiv.appendChild(polarityGroup);

			const removeBtn = createButton('Remove', () => {
				obj.pathRoles.soundModulation.splice(index, 1);
				AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
				container.innerHTML = '';
				this.render(obj, container);
			}, 'delete-btn');
			patchDiv.appendChild(removeBtn);

			return patchDiv;
		},

		createReflectionsSection(obj, container) {
			const isReflectionsActive = () => {
				const reflections = obj.params.reflections;
				if (!reflections || !reflections.enabled) return false;
				const echoPaths = Selectors.getPaths().filter(p => p.params.echo?.enabled);
				return echoPaths.length > 0;
			};

			return context.UIBuilder.collapsibleSection({
				title: 'Reflections (Spatial Delay)',
				icon: 'fa-assistive-listening-systems',
				expanded: false,
				isActive: isReflectionsActive,
				content: () => {
					const content = createElement('div');
					const echoPaths = Selectors.getPaths().filter(p => p.params.echo?.enabled);

					if (!obj.params.reflections) {
						obj.params.reflections = { enabled: false, include: [] };
					}

					const masterToggleGroup = createElement('div', 'parameter-control');
					const masterLabel = createElement('label');
					masterLabel.textContent = 'Enable Reflections';
					const masterCheck = createElement('input');
					masterCheck.type = 'checkbox';
					masterCheck.checked = obj.params.reflections.enabled || false;
					masterCheck.onchange = () => {
						obj.params.reflections.enabled = masterCheck.checked;
						container.innerHTML = '';
						MenuTabs.patches.render(obj, container);
					};
					masterLabel.appendChild(masterCheck);
					masterToggleGroup.appendChild(masterLabel);
					content.appendChild(masterToggleGroup);

					if (!obj.params.reflections.enabled) {
						content.appendChild(createElement('div', 'info-message', { textContent: 'Reflections are disabled for this sound.' }));
						return content;
					}

					if (echoPaths.length === 0) {
						content.appendChild(createElement('div', 'info-message', { textContent: 'No echo paths available. Add echo effect to paths first.' }));
						return content;
					}

					const listHeader = createElement('div', 'fx-slot-title');
					listHeader.textContent = 'Reflect From:';
					content.appendChild(listHeader);

					const pathList = createElement('div', 'layer-list');
					echoPaths.forEach(path => {
						const isIncluded = obj.params.reflections.include.includes(path.id);
						const item = this.createPathCheckbox(path, isIncluded, obj, (checked) => {
							if (checked) {
								if (!obj.params.reflections.include.includes(path.id)) {
									obj.params.reflections.include.push(path.id);
								}
							} else {
								obj.params.reflections.include = obj.params.reflections.include.filter(id => id !== path.id);
							}
							AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
						});
						pathList.appendChild(item);
					});
					content.appendChild(pathList);

					return content;
				}
			});
		},

		createPathCheckbox(path, isChecked, sound, onChange) {
			const group = createElement('div', 'parameter-control');
			const checkbox = createElement('input');
			checkbox.type = 'checkbox';
			checkbox.checked = isChecked;
			checkbox.onchange = () => onChange(checkbox.checked);

			const labelEl = createElement('label', 'layer-item');
			labelEl.style.cursor = 'pointer';

			const colorIndicator = createElement('div', 'layer-color-indicator');
			colorIndicator.style.background = path.color;
			labelEl.appendChild(colorIndicator);
			labelEl.appendChild(checkbox);

			const labelText = createElement('span');
			labelText.textContent = path.label;
			labelEl.appendChild(labelText);

			const soundPos = sound.marker.getLatLng();
			const reflectionPoint = context.EchoManager.findClosestPointOnPath(soundPos, path);
			const distSourceToWall = context.map.distance(soundPos, reflectionPoint);
			const delayTime = (distSourceToWall * 2) / CONSTANTS.SPEED_OF_SOUND_MS;

			const distInfo = createElement('span', 'value-display');
			distInfo.textContent = `${distSourceToWall.toFixed(1)}m (${(delayTime * 1000).toFixed(0)}ms)`;
			labelEl.appendChild(distInfo);

			group.appendChild(labelEl);
			return group;
		}
	},

	layers: {
		render(obj, container) {
			const layersGroup = createElement('div', 'parameter-group');
			const layersLabel = createElement('div', 'parameter-label');
			layersLabel.textContent = 'Assign to Layers';
			layersGroup.appendChild(layersLabel);

			const defaultLayersGroup = createElement('div');
			const defaultLabel = createElement('div', 'fx-slot-title');
			defaultLabel.textContent = 'Default Layers:';
			defaultLayersGroup.appendChild(defaultLabel);

			if (obj.role === 'sound') {
				defaultLayersGroup.appendChild(this.createLayerCheckbox(
					'sounds', 'Sounds Layer', true, false, null, obj
				));
			}

			if (obj.role === 'modulator') {
				defaultLayersGroup.appendChild(this.createLayerCheckbox(
					'modulators', 'Modulators Layer', true, false, null, obj
				));
			}

			if (obj.type === 'line' || obj.type === 'circle' || obj.type === 'polygon' || obj.type === 'oval') {
				const controlCheckbox = this.createLayerCheckbox(
					'control', 'Control Layer', true, false, null, obj
				);
				defaultLayersGroup.appendChild(controlCheckbox);
			}
			layersGroup.appendChild(defaultLayersGroup);

			if (context.LayerManager.userLayers.length > 0) {
				const userLayersGroup = createElement('div');
				const userLabel = createElement('div', 'fx-slot-title');
				userLabel.textContent = 'User Layers:';
				userLayersGroup.appendChild(userLabel);

				context.LayerManager.userLayers.forEach(layer => {
					const isAssigned = obj.layers.includes(layer.id);
					userLayersGroup.appendChild(this.createLayerCheckbox(
						layer.id, layer.name, isAssigned, true, layer.color, obj
					));
				});

				layersGroup.appendChild(userLayersGroup);
			} else {
				const noLayersMsg = createElement('div', 'info-message');
				noLayersMsg.textContent = 'No user layers created yet. Use the Layer Management panel to create layers.';
				layersGroup.appendChild(noLayersMsg);
			}

			container.appendChild(layersGroup);
		},

		createLayerCheckbox(layerId, label, checked, enabled, color, obj) {
			const group = createElement('div', 'parameter-control');

			const checkbox = createElement('input');
			checkbox.type = 'checkbox';
			checkbox.checked = checked;
			checkbox.disabled = !enabled;

			checkbox.onchange = async () => {
				if (layerId === 'sounds' || layerId === 'modulators' || layerId === 'sequencing' || layerId === 'control') {
					return;
				}

				try {
					let currentGain;
					if (obj.gain) {
						currentGain = obj.gain.gain.value;
						await obj.gain.gain.rampTo(0, CONSTANTS.LAYER_SWITCH_RAMP_TIME);
					}

					if (checkbox.checked) {
						if (!obj.layers.includes(layerId)) {
							obj.layers.push(layerId);
						}
					} else {
						obj.layers = obj.layers.filter(id => id !== layerId);
					}

					const layer = context.LayerManager.getUserLayer(layerId);
					if (layer && !layer.fxNodes) {

						context.createLayerFXNodes(layer);
					}

					if (obj.gain) {
						context.reconnectSoundToLayers(obj);
						context.LayerManager.updateAllElements();
						await obj.gain.gain.rampTo(currentGain, CONSTANTS.LAYER_SWITCH_RAMP_TIME);

						AppState.dispatch({ type: 'AUDIO_UPDATE_REQUESTED' });
					} else {
						context.updatePathVisibility(obj);
					}

				} catch (error) {
					console.error('Error updating layer assignment:', error);
					if (obj.gain) {
						obj.gain.gain.rampTo(obj.params.volume, CONSTANTS.ERROR_RECOVERY_RAMP_TIME);
					}
				}
			};

			const labelEl = createElement('label', 'layer-item');
			labelEl.style.cursor = enabled ? 'pointer' : 'default';

			if (color) {
				const colorIndicator = createElement('div', 'layer-color-indicator');
				colorIndicator.style.background = color;
				labelEl.appendChild(colorIndicator);
			}

			labelEl.appendChild(checkbox);

			const labelText = createElement('span');
			labelText.textContent = label;
			if (!enabled) {
				labelText.style.color = '#999';
				labelText.style.fontStyle = 'italic';
			}
			labelEl.appendChild(labelText);

			group.appendChild(labelEl);
			return group;
		}
	}
};
