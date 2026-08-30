function soundPath(workspaceId, filename) {
	if (filename.includes('/')) return filename;
	return workspaceId ? `workspaces/${workspaceId}/sounds/${filename}` : `sounds/${filename}`;
}

export async function resolveSoundUrl(workspaceId, filename) {
	return soundPath(workspaceId, filename);
}

export function resolveSoundUrlSync(workspaceId, filename) {
	return soundPath(workspaceId, filename);
}
