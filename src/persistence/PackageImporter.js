import { SettingsManager } from './SettingsManager.js';
import { collectSoundReferences, toSoundBaseName } from './soundReferences.js';
import { ModalSystem } from '../ui/ModalSystem.js';
import { LocalBackend } from '../api/LocalBackend.js';

let context = null;

export function setPackageImporterContext(appContext) {
	context = appContext;
}

const OS_METADATA_FILENAMES = ['thumbs.db', 'desktop.ini'];

function isOperatingSystemMetadata(entryPath) {
	const name = entryPath.split('/').pop();
	return name.startsWith('.') || OS_METADATA_FILENAMES.includes(name.toLowerCase());
}

export const PackageImporter = {
	async import(file) {
		if (typeof JSZip === 'undefined') {
			throw new Error('JSZip library not loaded. Please refresh the page.');
		}

		const zip = await JSZip.loadAsync(file);

		const buzzJsonFile = zip.file('buzz.json');
		if (!buzzJsonFile) {
			throw new Error('Invalid buzz package: buzz.json not found');
		}

		const buzzData = JSON.parse(await buzzJsonFile.async('string'));

		const soundFiles = [];
		const soundsFolder = zip.folder('sounds');
		if (soundsFolder) {
			soundsFolder.forEach((relativePath, file) => {
				if (!file.dir && !isOperatingSystemMetadata(relativePath)) {
					soundFiles.push({
						name: relativePath,
						file: file
					});
				}
			});
		}

		const options = await this.showImportOptionsModal(buzzData, soundFiles);
		if (!options) {
			return null;
		}

		if (options.importMode === 'full' && !await this.confirmMissingSounds(buzzData, soundFiles)) {
			return null;
		}

		await context.WorkspaceManager.ensureWorkspace();

		const result = {
			soundsImported: 0,
			soundsSkipped: 0,
			soundsRenamed: 0,
			elementsImported: 0
		};

		if (soundFiles.length > 0) {
			const soundResult = await this.importSounds(soundFiles, options);
			result.soundsImported = soundResult.imported;
			result.soundsSkipped = soundResult.skipped;
			result.soundsRenamed = soundResult.renamed;

			if (soundResult.renamedFiles && Object.keys(soundResult.renamedFiles).length > 0) {
				this.updateBuzzDataFilenames(buzzData, soundResult.renamedFiles);
			}
		}

		if (options.importMode === 'full') {
			await this.importBuzzData(buzzData, options);
			result.elementsImported = (buzzData.sounds?.length || 0) +
				(buzzData.controlPaths?.length || 0) +
				(buzzData.sequencers?.length || 0);
		}

		return result;
	},

	async showImportOptionsModal(buzzData, soundFiles) {
		const existingCount = context.Selectors.getSoundCount() +
			context.Selectors.getPathCount() +
			context.Selectors.getSequencerCount();

		const existingSounds = await this.getExistingSoundFileNames();
		const hasConflicts = soundFiles.some(sf => existingSounds.includes(sf.name));

		const incomingCount = (buzzData.sounds?.length || 0) +
			(buzzData.controlPaths?.length || 0) +
			(buzzData.sequencers?.length || 0);

		return ModalSystem.showImportOptions({
			title: buzzData.meta?.title || 'Buzz Package',
			soundFileCount: soundFiles.length,
			elementCount: incomingCount,
			hasExistingElements: existingCount > 0,
			hasFileConflicts: hasConflicts
		});
	},

	async confirmMissingSounds(buzzData, soundFiles) {
		const packaged = new Set(soundFiles.map(sf => toSoundBaseName(sf.name)));
		const existing = new Set(await this.getExistingSoundFileNames());

		const missing = collectSoundReferences(buzzData)
			.map(toSoundBaseName)
			.filter(name => !packaged.has(name) && !existing.has(name));

		if (missing.length === 0) {
			return true;
		}

		return ModalSystem.confirm(
			`This package refers to ${missing.length} sound file(s) it does not contain:\n\n${missing.join('\n')}\n\nImport anyway? Elements using them will stay silent until you upload the files.`,
			'Missing Sound Files'
		);
	},

	async getExistingSoundFileNames() {
		const workspaceId = context.Selectors.getWorkspaceId();
		if (!workspaceId) return [];
		const files = await LocalBackend.files.list(workspaceId);
		return files.map(f => f.name);
	},

	async importSounds(soundFiles, options) {
		const result = {
			imported: 0,
			skipped: 0,
			renamed: 0,
			renamedFiles: {}
		};

		if (soundFiles.length === 0) {
			return result;
		}

		const existingSounds = await this.getExistingSoundFileNames();
		const workspaceId = context.Selectors.getWorkspaceId();

		const progressModal = this.showProgressModal('Importing sounds...', soundFiles.length);

		try {
			for (let i = 0; i < soundFiles.length; i++) {
				const soundFile = soundFiles[i];
				let targetName = soundFile.name;
				const hasConflict = existingSounds.includes(targetName);

				progressModal.update(i + 1, targetName);

				if (hasConflict) {
					switch (options.fileConflict) {
						case 'skip':
							result.skipped++;
							continue;
						case 'rename':
							targetName = this.generateUniqueName(targetName, existingSounds);
							break;
						case 'overwrite':
							break;
					}
				}

				try {
					const blob = await soundFile.file.async('blob');
					const file = new File([blob], targetName, { type: this.getMimeType(targetName) });

					const formData = new FormData();
					formData.append('file', file);

					const uploadResult = await LocalBackend.files.upload(workspaceId, formData);
					const savedName = uploadResult.file || uploadResult.filename;
					if (!uploadResult.success || !savedName) {
						throw new Error(uploadResult.error || 'The sound file was not saved');
					}
					targetName = savedName;
					if (savedName !== soundFile.name) {
						result.renamedFiles[soundFile.name] = savedName;
						result.renamed++;
					}
					result.imported++;

					if (!existingSounds.includes(targetName)) {
						existingSounds.push(targetName);
					}
				} catch (error) {
					throw new Error(`Could not import ${targetName}: ${error.message}`);
				}
			}
		} finally {
			progressModal.close();
		}

		return result;
	},

	generateUniqueName(filename, existingNames) {
		const lastDot = filename.lastIndexOf('.');
		const baseName = lastDot > 0 ? filename.slice(0, lastDot) : filename;
		const extension = lastDot > 0 ? filename.slice(lastDot) : '';

		let counter = 1;
		let newName = `${baseName}_${counter}${extension}`;

		while (existingNames.includes(newName)) {
			counter++;
			newName = `${baseName}_${counter}${extension}`;
		}

		return newName;
	},

	getMimeType(filename) {
		const ext = filename.split('.').pop().toLowerCase();
		const mimeTypes = {
			'mp3': 'audio/mpeg',
			'wav': 'audio/wav',
			'ogg': 'audio/ogg',
			'flac': 'audio/flac',
			'm4a': 'audio/mp4',
			'aac': 'audio/aac',
			'webm': 'audio/webm'
		};
		return mimeTypes[ext] || 'audio/mpeg';
	},

	updateBuzzDataFilenames(buzzData, renamedFiles) {
		const updateFilename = (filename) => {
			if (!filename) return filename;
			const baseName = toSoundBaseName(filename);
			if (renamedFiles[baseName]) {
				return filename.startsWith('sounds/')
					? `sounds/${renamedFiles[baseName]}`
					: renamedFiles[baseName];
			}
			return filename;
		};

		if (buzzData.sounds) {
			buzzData.sounds.forEach(sound => {
				if (sound.params?.soundFile) {
					sound.params.soundFile = updateFilename(sound.params.soundFile);
				}
				if (sound.params?.gridSamples) {
					Object.values(sound.params.gridSamples).forEach(sample => {
						if (sample.fileName) {
							sample.fileName = updateFilename(sample.fileName);
						}
					});
				}
			});
		}

		if (buzzData.sequencers) {
			buzzData.sequencers.forEach(sequencer => {
				if (sequencer.tracks) {
					sequencer.tracks.forEach(track => {
						if (track.synthParams?.soundFile) {
							track.synthParams.soundFile = updateFilename(track.synthParams.soundFile);
						}
						if (track.synthParams?.gridSamples) {
							Object.values(track.synthParams.gridSamples).forEach(sample => {
								if (sample.fileName) {
									sample.fileName = updateFilename(sample.fileName);
								}
							});
						}
					});
				}
			});
		}
	},

	async importBuzzData(buzzData, options) {
		this.revertSoundPaths(buzzData);

		if (options.elementMode === 'replace') {
			await SettingsManager.applySettings(buzzData, { isFromFile: true });
		} else {
			await SettingsManager.mergeSettings(buzzData);
		}
	},

	revertSoundPaths(buzzData) {
		const revertPath = (path) => {
			if (!path) return path;
			return path.replace(/^sounds\//, '');
		};

		if (buzzData.sounds) {
			buzzData.sounds.forEach(sound => {
				if (sound.params?.soundFile) {
					sound.params.soundFile = revertPath(sound.params.soundFile);
				}
				if (sound.params?.gridSamples) {
					Object.values(sound.params.gridSamples).forEach(sample => {
						if (sample.fileName) {
							sample.fileName = revertPath(sample.fileName);
						}
					});
				}
			});
		}

		if (buzzData.sequencers) {
			buzzData.sequencers.forEach(sequencer => {
				if (sequencer.tracks) {
					sequencer.tracks.forEach(track => {
						if (track.synthParams?.soundFile) {
							track.synthParams.soundFile = revertPath(track.synthParams.soundFile);
						}
						if (track.synthParams?.gridSamples) {
							Object.values(track.synthParams.gridSamples).forEach(sample => {
								if (sample.fileName) {
									sample.fileName = revertPath(sample.fileName);
								}
							});
						}
					});
				}
			});
		}
	},

	showProgressModal(title, total) {
		const overlay = document.createElement('div');
		overlay.className = 'modal-overlay';

		const modal = document.createElement('div');
		modal.className = 'modal-dialog';

		modal.innerHTML = `
			<div class="modal-header">
				<h3>${title}</h3>
			</div>
			<div class="modal-body">
				<p id="importProgressText">Preparing...</p>
				<div class="progress-bar-container">
					<div id="importProgressBar" class="progress-bar-fill"></div>
				</div>
			</div>
		`;

		document.body.appendChild(overlay);
		document.body.appendChild(modal);

		const progressText = modal.querySelector('#importProgressText');
		const progressBar = modal.querySelector('#importProgressBar');

		return {
			update(current, filename) {
				progressText.textContent = `${current}/${total}: ${filename}`;
				progressBar.style.width = `${(current / total) * 100}%`;
			},
			close() {
				overlay.remove();
				modal.remove();
			}
		};
	}
};

export const packageImporter = PackageImporter;
