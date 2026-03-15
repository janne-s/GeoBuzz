export const ModalSystem = {
	async show(options) {
		const { title = '', message = '', buttons = [], input = false, defaultValue = '' } = options;

		const overlay = document.createElement('div');
		overlay.className = 'modal-overlay';

		const modal = document.createElement('div');
		modal.className = 'modal-dialog';

		modal.innerHTML = `
			<div class="modal-header">
				<h3>${title}</h3>
			</div>
			<div class="modal-body">
				<p>${message}</p>
				${input ? `<input type="text" class="modal-input" value="${defaultValue}" placeholder="Enter value">` : ''}
			</div>
			<div class="modal-footer">
				${buttons.map(btn => `
					<button class="modal-btn ${btn.primary ? 'btn-primary' : 'btn-secondary'}"
							data-result="${btn.result}">
						${btn.text}
					</button>
				`).join('')}
			</div>
		`;

		document.body.appendChild(overlay);
		document.body.appendChild(modal);

		const inputEl = modal.querySelector('.modal-input');
		if (inputEl) {
			requestAnimationFrame(() => inputEl.focus());
			inputEl.select();
		}

		return new Promise((resolve) => {
			const handleClick = (e) => {
				if (e.target.classList.contains('modal-btn')) {
					const result = e.target.dataset.result;
					const inputValue = inputEl ? inputEl.value : null;
					cleanup();
					if (input) {
						resolve(result === 'cancel' ? 'cancel' : inputValue);
					} else {
						resolve(result);
					}
				} else if (e.target === overlay) {
					cleanup();
					resolve(null);
				}
			};

			const handleKeydown = (e) => {
				if (e.key === 'Enter' && inputEl) {
					const confirmBtn = modal.querySelector('.modal-btn[data-result="ok"]');
					if (confirmBtn) {
						cleanup();
						resolve(inputEl.value);
					}
				} else if (e.key === 'Escape') {
					cleanup();
					resolve(input ? 'cancel' : null);
				}
			};

			const cleanup = () => {
				overlay.remove();
				modal.remove();
				document.removeEventListener('click', handleClick);
				document.removeEventListener('keydown', handleKeydown);
			};

			document.addEventListener('click', handleClick);
			document.addEventListener('keydown', handleKeydown);
		});
	},

	async confirm(message, title = 'Confirm') {
		const result = await this.show({
			title,
			message,
			buttons: [
				{ text: 'Cancel', result: false },
				{ text: 'OK', result: true, primary: true }
			]
		});
		return result === 'true';
	},

	async alert(message, title = 'Information') {
		await this.show({
			title,
			message,
			buttons: [{ text: 'OK', result: true, primary: true }]
		});
	},

	async prompt(message, defaultValue = '', title = 'Input') {
		const result = await this.show({
			title,
			message,
			input: true,
			defaultValue,
			buttons: [
				{ text: 'Cancel', result: 'cancel' },
				{ text: 'OK', result: 'ok', primary: true }
			]
		});

		return result === 'cancel' ? null : result;
	},

	async showImportOptions(config) {
		const { title, soundFileCount, elementCount, hasExistingElements, hasFileConflicts } = config;

		const overlay = document.createElement('div');
		overlay.className = 'modal-overlay';

		const modal = document.createElement('div');
		modal.className = 'modal-dialog';

		let sectionsHtml = '';

		sectionsHtml += `
			<div class="import-option-group">
				<label class="import-option-label">Import mode</label>
				<div class="import-radio-group">
					<label class="import-radio">
						<input type="radio" name="importMode" value="full" checked>
						<span>Full Buzz</span>
						<span class="import-radio-desc">${elementCount} elements</span>
					</label>
					<label class="import-radio">
						<input type="radio" name="importMode" value="sounds">
						<span>Sounds Only</span>
						<span class="import-radio-desc">${soundFileCount} files</span>
					</label>
				</div>
			</div>
		`;

		if (soundFileCount > 0 && hasFileConflicts) {
			sectionsHtml += `
				<div class="import-option-group">
					<label class="import-option-label">Sound file conflicts</label>
					<div class="import-radio-group">
						<label class="import-radio">
							<input type="radio" name="fileConflict" value="skip" checked>
							<span>Skip existing</span>
						</label>
						<label class="import-radio">
							<input type="radio" name="fileConflict" value="overwrite">
							<span>Overwrite</span>
						</label>
						<label class="import-radio">
							<input type="radio" name="fileConflict" value="rename">
							<span>Rename incoming</span>
						</label>
					</div>
				</div>
			`;
		}

		const elementsSection = `
			<div class="import-option-group" id="elementModeGroup">
				<label class="import-option-label">Existing elements</label>
				<div class="import-radio-group">
					<label class="import-radio">
						<input type="radio" name="elementMode" value="merge" checked>
						<span>Merge</span>
					</label>
					<label class="import-radio">
						<input type="radio" name="elementMode" value="replace">
						<span>Replace</span>
					</label>
				</div>
			</div>
		`;

		if (hasExistingElements) {
			sectionsHtml += elementsSection;
		}

		modal.innerHTML = `
			<div class="modal-header">
				<h3>Import Buzz</h3>
				<span class="import-title-detail">${title}</span>
			</div>
			<div class="modal-body">
				${sectionsHtml}
			</div>
			<div class="modal-footer">
				<button class="modal-btn btn-secondary" data-result="cancel">Cancel</button>
				<button class="modal-btn btn-primary" data-result="import">Import</button>
			</div>
		`;

		document.body.appendChild(overlay);
		document.body.appendChild(modal);

		const importModeRadios = modal.querySelectorAll('input[name="importMode"]');
		const elementModeGroup = modal.querySelector('#elementModeGroup');

		if (elementModeGroup && hasExistingElements) {
			importModeRadios.forEach(radio => {
				radio.addEventListener('change', () => {
					elementModeGroup.style.display = radio.value === 'full' ? 'block' : 'none';
				});
			});
		}

		return new Promise((resolve) => {
			const handleClick = (e) => {
				if (e.target.classList.contains('modal-btn')) {
					const result = e.target.dataset.result;
					cleanup();

					if (result === 'cancel') {
						resolve(null);
					} else {
						const importMode = modal.querySelector('input[name="importMode"]:checked')?.value || 'full';
						const fileConflict = modal.querySelector('input[name="fileConflict"]:checked')?.value || 'skip';
						const elementMode = modal.querySelector('input[name="elementMode"]:checked')?.value || 'merge';

						resolve({
							importMode,
							fileConflict,
							elementMode
						});
					}
				} else if (e.target === overlay) {
					cleanup();
					resolve(null);
				}
			};

			const handleKeydown = (e) => {
				if (e.key === 'Escape') {
					cleanup();
					resolve(null);
				}
			};

			const cleanup = () => {
				overlay.remove();
				modal.remove();
				document.removeEventListener('click', handleClick);
				document.removeEventListener('keydown', handleKeydown);
			};

			document.addEventListener('click', handleClick);
			document.addEventListener('keydown', handleKeydown);
		});
	}
};
