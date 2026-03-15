import { LocalBackend } from './LocalBackend.js';

export async function resolveSoundUrl(workspaceId, filename) {
	if (filename.includes('/')) return filename;
	return await LocalBackend.files.resolveUrl(workspaceId, filename) || filename;
}

export function resolveSoundUrlSync(workspaceId, filename) {
	return LocalBackend.files.resolveUrlSync(workspaceId, filename);
}
