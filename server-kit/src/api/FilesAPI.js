import { Backend } from './Backend.js';
import { Security } from './SecurityManager.js';

export const FilesAPI = {
	/**
	 * List files in a workspace
	 * @param {string} workspaceId - Workspace ID
	 * @returns {Promise<Object>} List of files
	 */
	async list(workspaceId) {
		return Backend.call(`api/files/list_sounds.php?workspace=${workspaceId}`);
	},

	/**
	 * Upload a file (simple version)
	 * @param {string} workspaceId - Workspace ID
	 * @param {FormData} formData - Form data with file
	 * @returns {Promise<Object>} Upload result
	 */
	async upload(workspaceId, formData) {
		return Backend.call(`api/files/upload_sound.php?workspace=${workspaceId}`, {
			method: 'POST',
			body: formData
		});
	},

	/**
	 * Delete a file
	 * @param {string} workspaceId - Workspace ID
	 * @param {string} filename - Filename to delete
	 * @returns {Promise<Object>} Delete result
	 */
	async delete(workspaceId, filename) {
		return Backend.call(`api/files/delete_sound.php?workspace=${workspaceId}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: `filename=${encodeURIComponent(filename)}&csrf_token=${encodeURIComponent(Security.csrfToken)}`
		});
	},

	/**
	 * Get maximum upload file size
	 * @param {string} workspaceId - Workspace ID
	 * @returns {Promise<Object>} Max size info
	 */
	async getMaxSize(workspaceId) {
		return Backend.call(`api/files/upload_sound.php?action=maxsize&workspace=${workspaceId}`);
	},

	/**
	 * Upload a file with progress tracking
	 * @param {string} workspaceId - Workspace ID
	 * @param {File} file - File to upload
	 * @param {Function} onProgress - Progress callback (0-100)
	 * @returns {Promise<Object>} Upload result
	 */
	async uploadWithProgress(workspaceId, file, onProgress) {
		const fd = new FormData();
		fd.append("file", file);
		Security.addToFormData(fd);

		const response = await fetch(`api/files/upload_sound.php?workspace=${workspaceId}`, {
			method: 'POST',
			body: fd
		});

		if (!response.ok) {
			throw new Error(`Server returned ${response.status}: ${response.statusText}`);
		}

		const contentLength = response.headers.get('content-length');
		if (!contentLength || !onProgress) {
			return await response.json();
		}

		const total = parseInt(contentLength, 10);
		let loaded = 0;

		const reader = response.body.getReader();
		const chunks = [];

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			chunks.push(value);
			loaded += value.length;
			onProgress((loaded / total) * 100);
		}

		const blob = new Blob(chunks);
		const text = await blob.text();
		const result = JSON.parse(text);

		if (!result.success) {
			throw new Error(result.error || "Upload failed");
		}

		return result;
	},

	async download(workspaceId, filename) {
		const response = await fetch(`workspaces/${workspaceId}/sounds/${filename}`);

		if (!response.ok) {
			throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
		}

		const blob = await response.blob();
		const url = URL.createObjectURL(blob);

		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();

		URL.revokeObjectURL(url);
	},

	async listExports(workspaceId) {
		return Backend.call(`api/exports/list_exports.php?workspace=${workspaceId}`);
	},

	async deleteExport(workspaceId, exportName) {
		return Backend.call(`api/exports/delete_export.php?workspace=${workspaceId}&name=${encodeURIComponent(exportName)}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-CSRF-Token': Security.csrfToken
			}
		});
	}
};
