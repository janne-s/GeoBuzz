/**
 * PackageExporter - Export GeoBuzz Runtime Engine Package
 *
 * Creates a standalone ZIP package with:
 * - buzz.json: Buzz data (from settings.json format)
 * - index.html: Boilerplate player interface (customizable)
 * - player-styles.css: Player styles (customizable)
 * - src/: GeoBuzz Runtime Engine (audio/spatial modules)
 * - README.txt: Documentation and customization guide
 *
 * Architecture: Engine Model
 * - GeoBuzz provides the audio/spatial engine
 * - Player provides customizable user interface
 * - Separation of concerns for easy customization
 */

import { SettingsManager } from './SettingsManager.js';
import { collectRuntimeModules } from './runtimeModules.js';
import { toFileSlug } from '../core/utils/filenames.js';

let context = null;

export function setPackageExporterContext(appContext) {
	context = appContext;
}

export const PackageExporter = {
	/**
	 * Load and process a template file with placeholder replacement
	 * @param {string} templatePath - Path to template file
	 * @param {Object} replacements - Key-value pairs for placeholder replacement
	 * @returns {Promise<string>} Processed template content
	 */
	async loadTemplate(templatePath, replacements = {}) {
		const response = await fetch(templatePath);
		if (!response.ok) {
			throw new Error(`Failed to load template ${templatePath}: ${response.status}`);
		}
		let content = await response.text();

		for (const [key, value] of Object.entries(replacements)) {
			const placeholder = `{{${key}}}`;
			content = content.replaceAll(placeholder, value);
		}

		return content;
	},

	/**
	 * Export complete buzz package as ZIP file
	 * @param {Object} meta - Buzz metadata (title, author, description)
	 * @returns {Promise<void>}
	 */
	async export(meta = {}) {
		try {
			const buzzData = SettingsManager.buildSettings();

			buzzData.meta = {
				title: meta.title || 'Untitled Buzz',
				author: meta.author || 'Anonymous',
				description: meta.description || '',
				created: new Date().toISOString(),
				version: buzzData.version
			};

			if (typeof JSZip === 'undefined') {
				throw new Error('JSZip library not loaded. Please refresh the page.');
			}
			const zip = new JSZip();

			const soundFiles = this.collectSoundFiles(buzzData);

			await this.addSoundFiles(zip, soundFiles);

			this.updateBuzzDataPaths(buzzData);

			zip.file('buzz.json', JSON.stringify(buzzData, null, 2));

			const title = meta.title || 'Untitled Buzz';
			const filename = toFileSlug(title);
			const version = context?.constants?.VERSION || '1.0';

			const htmlContent = await this.loadTemplate('src/persistence/templates/runtime-player.html', {
				TITLE: title,
				SRC_PATH: './src'
			});

			const cssContent = await this.loadTemplate('src/persistence/templates/runtime-player.css', {});

			const readmeContent = await this.loadTemplate('src/persistence/templates/runtime-README.txt', {
				TITLE: title,
				FILENAME: filename,
				VERSION: version
			});

			zip.file('index.html', htmlContent);
			zip.file('player-styles.css', cssContent);
			zip.file('README.txt', readmeContent);

			await this.addSourceFiles(zip);

			const blob = await zip.generateAsync({ type: 'blob' });

			const zipFilename = filename + '.zip';

			if (window.showSaveFilePicker) {
				try {
					const handle = await window.showSaveFilePicker({
						suggestedName: zipFilename,
						types: [{
							description: 'ZIP Archive',
							accept: { 'application/zip': ['.zip'] }
						}]
					});

					const writable = await handle.createWritable();
					await writable.write(blob);
					await writable.close();
				} catch (error) {
					if (error.name === 'AbortError') {
						throw new Error('Export cancelled');
					}
					throw error;
				}
			} else {
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = zipFilename;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			}

		} catch (error) {
			console.error('Package export failed:', error);
			throw error;
		}
	},

	collectSoundFiles(buzzData) {
		const soundFiles = new Set();

		if (buzzData.sounds) {
			buzzData.sounds.forEach(sound => {
				if (sound.type === 'SoundFile' && sound.params?.soundFile) {
					soundFiles.add(sound.params.soundFile);
				}

				if (sound.type === 'Sampler') {
					if (sound.params?.samplerMode === 'single' && sound.params?.soundFile) {
						soundFiles.add(sound.params.soundFile);
					}

					if (sound.params?.samplerMode === 'grid' && sound.params?.gridSamples) {
						Object.values(sound.params.gridSamples).forEach(sample => {
							if (sample.fileName) {
								soundFiles.add(sample.fileName);
							}
						});
					}
				}
			});
		}

		if (buzzData.sequencers) {
			buzzData.sequencers.forEach(sequencer => {
				if (sequencer.tracks) {
					sequencer.tracks.forEach(track => {
						if (track.instrumentType === 'synth' && track.synthParams) {
							if (track.synthType === 'SoundFile' && track.synthParams.soundFile) {
								soundFiles.add(track.synthParams.soundFile);
							}

							if (track.synthType === 'Sampler') {
								if (track.synthParams.samplerMode === 'single' && track.synthParams.soundFile) {
									soundFiles.add(track.synthParams.soundFile);
								}

								if (track.synthParams.samplerMode === 'grid' && track.synthParams.gridSamples) {
									Object.values(track.synthParams.gridSamples).forEach(sample => {
										if (sample.fileName) {
											soundFiles.add(sample.fileName);
										}
									});
								}
							}
						}
					});
				}
			});
		}

		return Array.from(soundFiles);
	},

	async addSoundFiles(zip, soundFiles) {
		if (soundFiles.length === 0) return;

		if (!context?.Selectors?.getWorkspaceId) {
			throw new Error('No workspace is open, so the sound files could not be added.');
		}

		const workspaceId = context.Selectors.getWorkspaceId();
		const missing = [];

		for (const fileName of soundFiles) {
			try {
				const fileUrl = `../workspaces/${workspaceId}/sounds/${fileName}`;
				const fileResponse = await fetch(fileUrl);

				if (fileResponse.ok) {
					const blob = await fileResponse.blob();
					zip.file(`sounds/${fileName}`, blob);
				} else {
					missing.push(fileName);
				}
			} catch (error) {
				console.error(`Error adding sound file ${fileName}:`, error);
				missing.push(fileName);
			}
		}

		if (missing.length > 0) {
			throw new Error(`These sound files are missing from the workspace:\n${missing.join('\n')}`);
		}
	},

	updateBuzzDataPaths(buzzData) {
		if (buzzData.sounds) {
			buzzData.sounds.forEach(sound => {
				if (sound.type === 'SoundFile' && sound.params?.soundFile) {
					if (!sound.params.soundFile.includes('/')) {
						sound.params.soundFile = `sounds/${sound.params.soundFile}`;
					}
				}

				if (sound.type === 'Sampler') {
					if (sound.params?.samplerMode === 'single' && sound.params?.soundFile) {
						if (!sound.params.soundFile.includes('/')) {
							sound.params.soundFile = `sounds/${sound.params.soundFile}`;
						}
					}

					if (sound.params?.samplerMode === 'grid' && sound.params?.gridSamples) {
						Object.values(sound.params.gridSamples).forEach(sample => {
							if (sample.fileName && !sample.fileName.includes('/')) {
								sample.fileName = `sounds/${sample.fileName}`;
							}
						});
					}
				}
			});
		}

		if (buzzData.sequencers) {
			buzzData.sequencers.forEach(sequencer => {
				if (sequencer.tracks) {
					sequencer.tracks.forEach(track => {
						if (track.instrumentType === 'synth' && track.synthParams) {
							if (track.synthType === 'SoundFile' && track.synthParams.soundFile) {
								if (!track.synthParams.soundFile.includes('/')) {
									track.synthParams.soundFile = `sounds/${track.synthParams.soundFile}`;
								}
							}

							if (track.synthType === 'Sampler') {
								if (track.synthParams.samplerMode === 'single' && track.synthParams.soundFile) {
									if (!track.synthParams.soundFile.includes('/')) {
										track.synthParams.soundFile = `sounds/${track.synthParams.soundFile}`;
									}
								}

								if (track.synthParams.samplerMode === 'grid' && track.synthParams.gridSamples) {
									Object.values(track.synthParams.gridSamples).forEach(sample => {
										if (sample.fileName && !sample.fileName.includes('/')) {
											sample.fileName = `sounds/${sample.fileName}`;
										}
									});
								}
							}
						}
					});
				}
			});
		}

		return buzzData;
	},

	/**
	 * Add runtime-only source files to ZIP (excludes editor-only modules)
	 * @param {JSZip} zip - JSZip instance
	 */
	async addSourceFiles(zip) {
		return collectRuntimeModules((filePath, content) => zip.file(filePath, content));
	},

	async getSourceFilesList() {
		return collectRuntimeModules();
	},

	async exportToWorkspace(meta = {}) {
		try {
			const buzzData = SettingsManager.buildSettings();

			buzzData.meta = {
				title: meta.title || 'Untitled Buzz',
				author: meta.author || 'Anonymous',
				description: meta.description || '',
				created: new Date().toISOString(),
				version: buzzData.version
			};

			const soundFiles = this.collectSoundFiles(buzzData);

			this.updateBuzzDataPaths(buzzData);

			const title = meta.title || 'Untitled Buzz';
			const filename = toFileSlug(title);
			const version = context?.constants?.VERSION || '1.0';

			const htmlContent = await this.loadTemplate('src/persistence/templates/runtime-player.html', {
				TITLE: title,
				SRC_PATH: '../../../../src'
			});

			const cssContent = await this.loadTemplate('src/persistence/templates/runtime-player.css', {});

			const readmeContent = await this.loadTemplate('src/persistence/templates/runtime-README.txt', {
				TITLE: title,
				FILENAME: filename,
				VERSION: version
			});

			const csrfResponse = await fetch('api/csrf.php');
			if (!csrfResponse.ok) {
				throw new Error(`CSRF endpoint returned ${csrfResponse.status}: ${csrfResponse.statusText}`);
			}

			const csrfData = JSON.parse(await csrfResponse.text());

			const workspaceId = context?.Selectors?.getWorkspaceId() || 'default';

			const exportPayload = {
				csrf_token: csrfData.token,
				workspaceId,
				buzzName: filename,
				buzzData: JSON.stringify(buzzData, null, 2),
				htmlContent,
				cssContent,
				readmeContent,
				soundFiles
			};

			const response = await fetch(`api/exports/export_to_workspace.php?workspace=${workspaceId}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': csrfData.token
				},
				body: JSON.stringify(exportPayload)
			});

			if (!response.ok) {
				throw new Error(`Export endpoint returned ${response.status}: ${response.statusText}`);
			}

			const result = JSON.parse(await response.text());

			if (!result.success) {
				throw new Error(result.error || 'Export failed');
			}

			return result;

		} catch (error) {
			console.error('Workspace export failed:', error);
			throw error;
		}
	}

};

export const packageExporter = PackageExporter;
