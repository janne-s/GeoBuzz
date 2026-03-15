import { LocalBackend } from '../api/LocalBackend.js';
import { SettingsManager } from './SettingsManager.js';
import { StorageAdapter } from './StorageAdapter.js';
import { ModalSystem } from '../ui/ModalSystem.js';

export class WorkspaceManager {
	static context = null;

	static setContext(context) {
		this.context = context;
	}

	static async initWorkspace() {
		this.context.AppState.workspace.id = null;
		this.context.AppState.workspace.isInitializing = true;

		this.context.AppState.setSaveCallback(this.saveWorkspaceSettings.bind(this));

		const urlParams = new URLSearchParams(window.location.search);
		const workspaceParam = urlParams.get('workspace');

		if (workspaceParam) {
			try {
				const result = await LocalBackend.workspace.validate(workspaceParam);

				if (result.success) {
					this.context.AppState.workspace.id = workspaceParam;
					this.context.AppState.workspace.isReady = true;

					await this.loadWorkspaceSettings();
				} else {
					await this.createNewWorkspace();
				}
			} catch (error) {
				console.error('Error validating workspace:', error);
				await this.createNewWorkspace();
			}
		} else {
			await this.createNewWorkspace();
		}

		if (this.context.AppState.workspace.id) {
			await LocalBackend.files.preloadAllUrls(this.context.AppState.workspace.id);
		}

		this.updateMenuCounts();

		this.context.AppState.workspace.isInitializing = false;
	}

	static updateWorkspaceUI() {
		const workspaceUrlInput = document.getElementById('workspaceUrl');
		if (workspaceUrlInput && this.context.Selectors.getWorkspaceId()) {
			const fullUrl = `${window.location.origin}${window.location.pathname}?workspace=${this.context.Selectors.getWorkspaceId()}`;
			workspaceUrlInput.value = fullUrl;
		} else {
			requestAnimationFrame(this.updateWorkspaceUI.bind(this));
		}
	}

	static updateMenuCounts() {
		const layerCount = document.getElementById('layerCount');
		const elementCount = document.getElementById('elementCount');
		const sequencerCount = document.getElementById('sequencerCount');

		if (layerCount) {
			const count = this.context.LayerManager.userLayers.length;
			layerCount.textContent = count;
			layerCount.classList.toggle('hidden', count === 0);
		}
		if (elementCount) {
			const count = this.context.Selectors.getSounds().length + this.context.Selectors.getPaths().length;
			elementCount.textContent = count;
			elementCount.classList.toggle('hidden', count === 0);
		}
		if (sequencerCount) {
			const count = this.context.Selectors.getSequencers().length;
			sequencerCount.textContent = count;
			sequencerCount.classList.toggle('hidden', count === 0);
		}
	}

	static async createNewWorkspace() {
		try {
			const result = await LocalBackend.workspace.create();

			if (result.success) {
				this.context.AppState.workspace.id = result.workspaceId;

				const settings = SettingsManager.buildSettings();
				await LocalBackend.workspace.save(this.context.Selectors.getWorkspaceId(), settings);

				const newUrl = new URL(window.location);
				newUrl.searchParams.set('workspace', this.context.Selectors.getWorkspaceId());
				window.history.replaceState({}, '', newUrl);
			}
		} catch (error) {
			console.error('Error creating workspace:', error);
			this.context.AppState.workspace.id = 'default';
		}
	}

	static async loadWorkspaceSettings() {
		if (!this.context.Selectors.getWorkspaceId()) {
			console.warn('No workspace ID available for auto-load');
			return false;
		}

		try {
			const settings = await LocalBackend.workspace.load(this.context.Selectors.getWorkspaceId());

			const totalElements = (settings.sounds?.length || 0) +
				(settings.controlPaths?.length || 0) +
				(settings.sequencers?.length || 0);

			if (totalElements === 0) {
				if (settings.audioSettings) {
					if (settings.audioSettings.spatialMode) {
						this.context.AppState.audio.spatialMode = settings.audioSettings.spatialMode;
					}
					if (settings.audioSettings.userDirection !== undefined) {
						this.context.AppState.audio.userDirection = settings.audioSettings.userDirection;
						if (this.context.PathEditor && this.context.PathEditor.updateDirectionUI) {
							this.context.PathEditor.updateDirectionUI(this.context.Selectors.getUserDirection());
						}
					}
					if (settings.audioSettings.ambisonics) {
						const amb = settings.audioSettings.ambisonics;
						if (amb.order !== undefined) this.context.CONSTANTS.AMBISONIC_ORDER = amb.order;
						if (amb.gainBoost !== undefined) this.context.CONSTANTS.AMBISONIC_GAIN_BOOST = amb.gainBoost;
						if (amb.rolloff !== undefined) this.context.CONSTANTS.AMBISONIC_ROLLOFF = amb.rolloff;
						if (amb.minDistance !== undefined) this.context.CONSTANTS.AMBISONIC_MIN_DISTANCE = amb.minDistance;
						if (amb.stereoWidth !== undefined) this.context.CONSTANTS.AMBISONIC_STEREO_WIDTH = amb.stereoWidth;
						if (amb.stereoSpread !== undefined) this.context.CONSTANTS.AMBISONIC_STEREO_SPREAD = amb.stereoSpread;
					}
					if (settings.audioSettings.spatialMode === 'ambisonics') {
						await this.context.unlockAudio();
						await this.context.AmbisonicsManager.initialize();
					}
				}
				return false;
			}

			const userConfirmed = await ModalSystem.confirm(`Found ${totalElements} previous elements. Load them?`, 'Load Previous Settings');
			if (userConfirmed) {
				await SettingsManager.applySettings(settings);
				return true;
			}
			return false;
		} catch (error) {
			console.error('Error loading workspace settings:', error);
			return false;
		}
	}

	static async saveWorkspaceSettings() {
		const settings = SettingsManager.buildSettings();
		await StorageAdapter.saveToWorkspace(this.context.Selectors.getWorkspaceId(), settings);
	}

	static async purgeDeletedFileFromSounds(deletedFilename) {
		let changesMade = false;

		for (const sound of this.context.Selectors.getSounds()) {
			let soundNeedsUpdate = false;
			if (sound.type === 'SoundFile' && sound.params.soundFile === deletedFilename) {
				sound.params.soundFile = null;
				soundNeedsUpdate = true;
			} else if (sound.type === 'Sampler') {
				if (sound.params.samplerMode === 'single' && sound.params.soundFile === deletedFilename) {
					sound.params.soundFile = null;
					soundNeedsUpdate = true;
				} else if (sound.params.samplerMode === 'grid' && sound.params.gridSamples) {
					let gridModified = false;
					for (const midiNote in sound.params.gridSamples) {
						if (sound.params.gridSamples[midiNote]?.fileName === deletedFilename) {
							delete sound.params.gridSamples[midiNote];
							gridModified = true;
						}
					}
					if (gridModified) {
						soundNeedsUpdate = true;
					}
				}
			}

			if (soundNeedsUpdate) {
				changesMade = true;
				this.context.AudioNodeManager.stopPlayback(sound);
				await this.context.changeSoundType(sound, sound.type);
			}
		}
	}
}
