import { createElement } from '../domHelpers.js';
import { createDraggableHeader } from '../controllers/HeaderBuilder.js';
import { CONSTANTS } from '../../core/constants.js';

let AppState, Selectors, ModalSystem, Backend, WorkspaceManager;
let StreamManager, AudioNodeManager, GeolocationManager;
let changeSoundType, loadServerSoundFile, setupRecording, setupStreamTesting;

export function setContext(context) {
	AppState = context.AppState;
	Selectors = context.Selectors;
	ModalSystem = context.ModalSystem;
	Backend = context.Backend;
	WorkspaceManager = context.WorkspaceManager;
	StreamManager = context.StreamManager;
	AudioNodeManager = context.AudioNodeManager;
	GeolocationManager = context.GeolocationManager;
	changeSoundType = context.changeSoundType;
	loadServerSoundFile = context.loadServerSoundFile;
	setupRecording = context.setupRecording;
	setupStreamTesting = context.setupStreamTesting;
}

export function ensureSoundDialogExists() {
	let soundDialog = document.getElementById("soundDialog");

	if (!soundDialog) {
		soundDialog = document.createElement("div");
		soundDialog.id = "soundDialog";

		const { header, cleanup: headerCleanup } = createDraggableHeader(soundDialog, 'Manage Sound Files');
		soundDialog.appendChild(header);
		soundDialog._headerCleanup = headerCleanup;

		const limitsInfo = document.createElement("div");
		limitsInfo.id = "limitsInfo";
		soundDialog.appendChild(limitsInfo);

		const streamSection = document.createElement("div");
		streamSection.className = "stream-section";

		const streamLabel = document.createElement("h3");
		streamLabel.textContent = "Test Stream";
		streamSection.appendChild(streamLabel);

		const streamControls = document.createElement("div");
		streamControls.id = "streamControls";
		streamControls.innerHTML = `
			<div class="stream-input-row">
				<input type="text" id="streamUrlInput" class="stream-url-input"
					   placeholder="Enter stream URL"
					   value="${CONSTANTS.TEST_STREAM_URL}">
				<button id="testStreamBtn" type="button" class="menu-btn">
					<i class="fas fa-play"></i>
					<span>Start</span>
				</button>
			</div>
			<div id="streamStatus" class="stream-status"></div>
		`;
		streamSection.appendChild(streamControls);
		soundDialog.appendChild(streamSection);

		const recordLabel = document.createElement("h3");
		recordLabel.textContent = "Record Audio";
		soundDialog.appendChild(recordLabel);

		const recordControls = document.createElement("div");
		recordControls.id = "recordControls";
		recordControls.innerHTML = `
			<button id="startRecordBtn" type="button"><i class="fas fa-microphone"></i> Start</button>
			<button id="stopRecordBtn" type="button" disabled><i class="fas fa-stop"></i> Stop</button>
			<div id="recordStatus"></div>
		`;
		soundDialog.appendChild(recordControls);

		const uploadLabel = document.createElement("h3");
		uploadLabel.textContent = "Upload file";
		soundDialog.appendChild(uploadLabel);

		const uploadInput = document.createElement("input");
		uploadInput.type = "file";
		uploadInput.accept = "audio/*";
		soundDialog.appendChild(uploadInput);

		const uploadStatus = document.createElement("div");
		uploadStatus.id = "uploadStatus";
		soundDialog.appendChild(uploadStatus);

		const serverLabel = document.createElement("h3");
		serverLabel.textContent = "Sound files";
		soundDialog.appendChild(serverLabel);

		const serverList = document.createElement("div");
		serverList.id = "serverList";
		soundDialog.appendChild(serverList);

		const closeBtn = document.createElement("button");
		closeBtn.textContent = "Close";
		closeBtn.type = "button";
		closeBtn.onclick = () => {
			const testStreamObj = soundDialog._testStreamObj;
			if (testStreamObj) {
				StreamManager.cleanupStream(testStreamObj);

				if (testStreamObj.gain) testStreamObj.gain.dispose();
				if (testStreamObj.envelopeGain) testStreamObj.envelopeGain.dispose();
				if (testStreamObj.filter) testStreamObj.filter.dispose();
				soundDialog._testStreamObj = null;
			}

			if (soundDialog._headerCleanup) {
				soundDialog._headerCleanup();
			}

			soundDialog.remove();
		};

		soundDialog.appendChild(closeBtn);
		document.body.appendChild(soundDialog);
	}

	return {
		dialog: soundDialog,
		serverList: document.getElementById("serverList"),
		uploadInput: soundDialog.querySelector("input[type=file]"),
		uploadStatus: document.getElementById("uploadStatus"),
		limitsInfo: document.getElementById("limitsInfo")
	};
}

export function showFileManagerDialog(soundObj = null, onFileSelected = null) {
	const { dialog: soundDialog, serverList, uploadInput, uploadStatus, limitsInfo } = ensureSoundDialogExists();

	if (onFileSelected && soundObj) {
		soundObj._gridFileCallback = onFileSelected;
	}

	uploadInput.onchange = async (e) => {
		const file = e.target.files[0];
		if (!file) return;

		uploadStatus.style.display = "block";
		uploadStatus.innerHTML = `
		  <strong>Uploading:</strong> ${file.name} (${formatFileSize(file.size)})<br>
		  <div class="progress-bar-container">
			<div id="uploadProgress" class="progress-bar-fill"></div>
		  </div>
		`;

		try {
			const result = await Backend.files.uploadWithProgress(
				Selectors.getWorkspaceId(),
				file,
				(percentComplete) => {
					const progressBar = document.getElementById('uploadProgress');
					if (progressBar) {
						progressBar.style.width = percentComplete + '%';
					}
				}
			);

			uploadStatus.innerHTML = `<strong>Success!</strong> ${file.name} uploaded`;
			await refreshServerList(soundObj);
			uploadInput.value = '';
			setTimeout(() => {
				uploadStatus.style.display = "none";
			}, CONSTANTS.STATUS_LONG_MS);
		} catch (err) {
			uploadStatus.innerHTML = `<strong>Error:</strong> ${err?.message || 'Upload failed'}`;
			console.error("Upload error:", err);
		}
	};

	async function refreshServerList(soundObj) {
		serverList.textContent = "Loading...";

		try {
			const files = await Backend.files.list(Selectors.getWorkspaceId());

			if (!files.length) {
				serverList.textContent = "No sound files yet.";
				return;
			}

			serverList.innerHTML = "";
			const fragment = document.createDocumentFragment();

			files.forEach(fileInfo => {
				const fname = fileInfo.name;
				const row = document.createElement("div");

				const leftSection = document.createElement("div");

				if (soundObj) {
					const selectBtn = document.createElement("button");
					selectBtn.textContent = "Select";
					selectBtn.onclick = () => {
						if (soundObj._gridFileCallback) {
							const callback = soundObj._gridFileCallback;
							delete soundObj._gridFileCallback;
							callback(fname);
							soundDialog.remove();
							return;
						}
						loadServerSoundFile(fname, soundObj);
						soundDialog.remove();
					};
					leftSection.appendChild(selectBtn);
				} else {
					const downloadBtn = document.createElement("button");
					downloadBtn.textContent = "Download";
					downloadBtn.onclick = async () => {
						try {
							await Backend.files.download(Selectors.getWorkspaceId(), fname);
						} catch (err) {
							alert("Error downloading file: " + err.message);
						}
					};
					leftSection.appendChild(downloadBtn);
				}

				const fileName = createElement("span", "server-list-filename");
				fileName.textContent = fname;
				fileName.title = fname;
				leftSection.appendChild(fileName);

				row.appendChild(leftSection);

				const fileSize = document.createElement("span");
				fileSize.textContent = fileInfo.sizeFormatted || formatFileSize(fileInfo.size);
				row.appendChild(fileSize);

				const deleteBtn = document.createElement("button");
				deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
				deleteBtn.title = "Delete file";
				deleteBtn.onclick = async (e) => {
					e.stopPropagation();
					const shouldDelete = await ModalSystem.confirm(`Are you sure you want to delete "${fname}"?\n\nThis action cannot be undone.`);
					if (shouldDelete) {
						try {
							const result = await Backend.files.delete(Selectors.getWorkspaceId(), fname);
							if (result.success) {
								await WorkspaceManager.purgeDeletedFileFromSounds(fname);
								setTimeout(() => {
									refreshServerList(soundObj);
								}, 500);
							} else {
								alert("Error deleting file: " + result.error);
							}
						} catch (err) {
							alert("Error deleting file: " + err.message);
						}
					}
				};
				row.appendChild(deleteBtn);

				fragment.appendChild(row);
			});

			serverList.appendChild(fragment);
		} catch (err) {
			serverList.textContent = "Error: " + err.message;
			console.error("List error:", err);
		}
	}

	function formatFileSize(bytes) {
		if (bytes === 0) return "0 B";
		const units = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(CONSTANTS.FILE_SIZE_BASE));
		return Math.round(bytes / Math.pow(CONSTANTS.FILE_SIZE_BASE, i) * 100) / 100 + ' ' + units[i];
	}

	soundDialog.style.display = "block";
	setupRecording(soundObj, refreshServerList);
	soundDialog._testStreamObj = setupStreamTesting();
	(async () => {
		limitsInfo.innerHTML = `Storage: browser local (IndexedDB)`;
		refreshServerList(soundObj);
	})();
}

export async function showGridSampleDialog(soundObj, midiNote) {
	const noteName = Tone.Frequency(midiNote, 'midi').toNote();
	const existingSample = soundObj.params.gridSamples[midiNote] || { fileName: null, pitch: 0 };

	const overlay = document.createElement('div');
	overlay.className = 'modal-overlay';

	const modal = document.createElement('div');
	modal.className = 'modal-dialog';
	modal.style.maxWidth = '400px';

	const currentFileName = existingSample.fileName || 'No sample loaded';

	modal.innerHTML = `
		<div class="modal-header">
			<h3>Configure ${noteName}</h3>
		</div>
		<div class="modal-body">
			<div class="parameter-control">
				<label>Sample File</label>
				<div class="file-info-text">${currentFileName}</div>
			</div>
			<div class="parameter-control">
				<label>Pitch Adjustment</label>
				<input type="range" id="gridPitchSlider" class="pitch-slider" min="-12" max="12" step="1" value="${existingSample.pitch || 0}">
				<span id="gridPitchDisplay" class="pitch-display">${existingSample.pitch || 0} st</span>
			</div>
		</div>
		<div class="modal-footer modal-footer-equal">
			<button id="gridLoadBtn" class="btn-primary">Load Sample</button>
			${existingSample.fileName ? '<button id="gridClearBtn" class="btn-secondary">Clear</button>' : ''}
			<button id="gridCancelBtn" class="btn-secondary">Close</button>
		</div>
	`;

	overlay.appendChild(modal);
	document.body.appendChild(overlay);

	const pitchSlider = modal.querySelector('#gridPitchSlider');
	const pitchDisplay = modal.querySelector('#gridPitchDisplay');

	pitchSlider.oninput = () => {
		const value = parseInt(pitchSlider.value);
		pitchDisplay.textContent = `${value > 0 ? '+' : ''}${value} st`;
	};

	return new Promise((resolve) => {
		const cleanup = () => {
			document.body.removeChild(overlay);
		};

		modal.querySelector('#gridLoadBtn').onclick = async () => {
			cleanup();

			const fileSelected = await new Promise((resolveFile) => {
				showFileManagerDialog(soundObj, (selectedFile) => {
					resolveFile(selectedFile);
				});
			});

			if (fileSelected) {
				if (!soundObj.params.gridSamples) soundObj.params.gridSamples = {};
				soundObj.params.gridSamples[midiNote] = {
					fileName: fileSelected,
					pitch: parseInt(pitchSlider.value)
				};

				await changeSoundType(soundObj, 'Sampler');

				resolve(true);
			} else {
				resolve(false);
			}
		};

		const clearBtn = modal.querySelector('#gridClearBtn');
		if (clearBtn) {
			clearBtn.onclick = async () => {
				cleanup();

				if (soundObj.params.gridSamples && soundObj.params.gridSamples[midiNote]) {
					delete soundObj.params.gridSamples[midiNote];
					await changeSoundType(soundObj, 'Sampler');
				}

				resolve(true);
			};
		}

		modal.querySelector('#gridCancelBtn').onclick = () => {
			if (existingSample.fileName && soundObj.params.gridSamples[midiNote]) {
				const newPitch = parseInt(pitchSlider.value);
				if (newPitch !== existingSample.pitch) {
					soundObj.params.gridSamples[midiNote].pitch = newPitch;
				}
			}
			cleanup();
			resolve(false);
		};

		overlay.onclick = (e) => {
			if (e.target === overlay) {
				modal.querySelector('#gridCancelBtn').click();
			}
		};
	});
}
