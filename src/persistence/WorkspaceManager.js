import { LocalBackend } from '../api/LocalBackend.js';
import {
	formatBytes,
	getStorageEstimate,
	markPersistenceWarningShown,
	persistenceWarningShown,
	requestPersistence,
	storageLevel,
	STORAGE_LEVEL_RANK
} from '../api/LocalStorageHealth.js';
import { SettingsManager } from './SettingsManager.js';
import { StorageAdapter } from './StorageAdapter.js';
import { ModalSystem } from '../ui/ModalSystem.js';
import { checkSplashMessage } from '../ui/SplashMessage.js';
import { GeolocationManager } from '../core/geospatial/GeolocationManager.js';

export class WorkspaceManager {
	static context = null;
	static persistenceRequested = false;
	static warnedStorageRank = 0;

	static setContext(context) {
		this.context = context;
	}

	static async initWorkspace() {
		this.context.AppState.workspace.id = null;
		this.context.AppState.workspace.isInitializing = true;

		checkSplashMessage().then(() => GeolocationManager.setupGeolocation());

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
					await this.reportUnusableWorkspace(workspaceParam);
				}
			} catch (error) {
				console.error('Error validating workspace:', error);
				await this.reportUnusableWorkspace(workspaceParam);
			}
		}

		if (this.context.AppState.workspace.id) {
			await LocalBackend.files.preloadAllUrls(this.context.AppState.workspace.id);
		}

		this.updateMenuCounts();

		this.context.AppState.workspace.isInitializing = false;
	}

	static async reportUnusableWorkspace(workspaceParam) {
		await ModalSystem.alert(
			`This link points to a workspace that could not be opened: ${workspaceParam}\n\n` +
			`The link may be incomplete, or the workspace may belong to another browser \u2014 standalone ` +
			`workspaces are stored in this browser only. Nothing has been created. Check the link before you ` +
			`start working \u2014 a new, empty workspace is created as soon as you add something, and this ` +
			`address is replaced then.`,
			'Workspace Not Found',
			{ priority: true }
		);
	}

	static requestPersistentStorage() {
		if (this.persistenceRequested) return;
		this.persistenceRequested = true;

		requestPersistence().then(({ supported, persisted }) => {
			if (persisted || persistenceWarningShown()) return;
			markPersistenceWarningShown();

			const reason = supported
				? 'This browser declined to mark GeoBuzz storage as persistent.'
				: 'This browser cannot mark GeoBuzz storage as persistent.';

			ModalSystem.alert(
				`${reason}\n\nStandalone GeoBuzz keeps the whole Buzz — settings and every sound file — in ` +
				`this browser only. A browser may clear that storage on its own: Safari deletes it after seven ` +
				`days without a visit, and any browser may clear it when disk space runs low. There is no ` +
				`server copy and no warning when it happens.\n\nExport the Buzz to a file whenever you finish ` +
				`working. That file is the only backup.`,
				'Storage May Be Cleared'
			);
		}).catch(error => console.error('Persistence request failed:', error));
	}

	static async checkStorageHealth() {
		const estimate = await getStorageEstimate();
		const level = storageLevel(estimate);
		const rank = STORAGE_LEVEL_RANK[level];

		if (rank === 0) {
			this.warnedStorageRank = 0;
			return;
		}
		if (rank <= this.warnedStorageRank) return;
		this.warnedStorageRank = rank;

		const used = `${formatBytes(estimate.usage)} of ${formatBytes(estimate.quota)} used`;

		await ModalSystem.alert(
			level === 'critical'
				? `Browser storage for GeoBuzz is almost full (${used}). The next save or sound upload will ` +
					`probably fail.\n\nExport the Buzz to a file now, then delete sound files you no longer need ` +
					`from Manage Sound Files.`
				: `Browser storage for GeoBuzz is running low (${used}, ${formatBytes(estimate.remaining)} ` +
					`left).\n\nExport the Buzz to a file as a backup, and delete sound files you no longer need ` +
					`from Manage Sound Files.`,
			'Storage Running Low'
		);
	}

	static async ensureWorkspace() {
		this.requestPersistentStorage();
		if (this.context.AppState.workspace.id) return true;
		if (!await this.createNewWorkspace()) {
			throw new Error('Workspace could not be created or saved. Try again.');
		}
		return true;
	}

	static updateWorkspaceUI() {
		const workspaceUrlInput = document.getElementById('workspaceUrl');
		if (!workspaceUrlInput) return;
		if (this.context.Selectors.getWorkspaceId()) {
			const fullUrl = `${window.location.origin}${window.location.pathname}?workspace=${this.context.Selectors.getWorkspaceId()}`;
			workspaceUrlInput.value = fullUrl;
		} else if (this.context.AppState.workspace.isInitializing) {
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
			if (!result.success || !result.workspaceId) {
				throw new Error(result.error || 'Workspace creation failed');
			}

			this.context.AppState.workspace.id = result.workspaceId;

			const newUrl = new URL(window.location);
			newUrl.searchParams.set('workspace', result.workspaceId);
			window.history.replaceState({}, '', newUrl);
			this.updateWorkspaceUI();

			const settings = SettingsManager.buildSettings();
			await LocalBackend.workspace.save(result.workspaceId, settings);
			return true;
		} catch (error) {
			console.error('Error creating workspace:', error);
			return false;
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
		await this.ensureWorkspace();
		if (!this.context.Selectors.getWorkspaceId()) return;
		const settings = SettingsManager.buildSettings();
		await StorageAdapter.saveToWorkspace(this.context.Selectors.getWorkspaceId(), settings);
		this.checkStorageHealth().catch(error => console.error('Storage check failed:', error));
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
