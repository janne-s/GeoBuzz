import { Backend } from './Backend.js';

export const WorkspaceAPI = {
	/**
	 * Validate a workspace ID
	 * @param {string} id - Workspace ID
	 * @returns {Promise<Object>} Validation result
	 */
	async validate(id) {
		return Backend.call(`api/workspace.php?action=validate&id=${id}`);
	},

	/**
	 * Create a new workspace
	 * @returns {Promise<Object>} New workspace data
	 */
	async create() {
		return Backend.call('api/workspace.php?action=create');
	},

	/**
	 * Load workspace data
	 * @param {string} id - Workspace ID
	 * @returns {Promise<Object>} Workspace data
	 */
	async load(id) {
		return Backend.call(`api/workspace.php?action=load&id=${id}`);
	},

	/**
	 * Save workspace settings
	 * @param {string} id - Workspace ID
	 * @param {Object} settings - Settings to save
	 * @returns {Promise<Object>} Save result
	 */
	async save(id, settings) {
		return Backend.call(`api/workspace.php?action=save&id=${id}`, {
			method: 'POST',
			body: JSON.stringify(settings)
		});
	}
};
