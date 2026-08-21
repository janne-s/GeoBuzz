export async function resolveSoundUrl(workspaceId, filename) {
	if (filename.includes('/')) return filename;
	return `workspaces/${workspaceId}/sounds/${filename}`;
}

export function resolveSoundUrlSync(workspaceId, filename) {
	if (filename.includes('/')) return filename;
	return `workspaces/${workspaceId}/sounds/${filename}`;
}
