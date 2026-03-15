import { LocalBackend } from '../api/LocalBackend.js';

let context = null;

export function setStorageAdapterContext(appContext) {
	context = appContext;
}

export const StorageAdapter = {
	exportToFile(settings) {
		const dataStr = JSON.stringify(settings, null, 2);
		const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
		const exportFileDefaultName = `geobuzz-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;

		const linkElement = document.createElement('a');
		linkElement.setAttribute('href', dataUri);
		linkElement.setAttribute('download', exportFileDefaultName);
		linkElement.click();
	},

	async importFromFile(file) {
		if (!file) return null;

		try {
			const text = await file.text();
			return JSON.parse(text);
		} catch (error) {
			console.error('Error loading settings:', error);
			throw new Error('Error loading settings file. Please check the file format.');
		}
	},

	async saveToWorkspace(workspaceId, settings) {
		if (!workspaceId || context.AppState.workspace.isInitializing) {
			return;
		}

		try {
			await LocalBackend.workspace.save(workspaceId, settings);
		} catch (error) {
			console.error('Error saving workspace:', error);
			throw error;
		}
	}
};
