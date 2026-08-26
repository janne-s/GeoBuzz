const RUNTIME_ENTRY = 'src/runtime/RuntimeEngine.js';

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.[^'"]*)['"]/g;

function parseImportSpecifiers(source) {
	const specifiers = [];
	let match;

	IMPORT_SPECIFIER.lastIndex = 0;
	while ((match = IMPORT_SPECIFIER.exec(source)) !== null) {
		specifiers.push(match[1]);
	}

	return specifiers;
}

function resolveImportPath(specifier, fromPath) {
	const segments = fromPath.split('/');
	segments.pop();

	for (const segment of specifier.split('/')) {
		if (segment === '.' || segment === '') continue;
		if (segment === '..') segments.pop();
		else segments.push(segment);
	}

	return segments.join('/');
}

export async function collectRuntimeModules(onFile) {
	const visited = new Set();
	const pending = [RUNTIME_ENTRY];

	while (pending.length > 0) {
		const filePath = pending.shift();
		if (visited.has(filePath)) continue;
		visited.add(filePath);

		const response = await fetch(`../${filePath}`);
		if (!response.ok) {
			throw new Error(`${filePath} could not be read (${response.status})`);
		}

		const content = await response.text();
		if (onFile) onFile(filePath, content);

		for (const specifier of parseImportSpecifiers(content)) {
			const resolved = resolveImportPath(specifier, filePath);
			if (!visited.has(resolved)) pending.push(resolved);
		}
	}

	return [...visited].sort();
}
