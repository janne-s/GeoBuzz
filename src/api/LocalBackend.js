const DB_NAME = 'geobuzz';
const DB_VERSION = 1;
const STORES = {
	workspaces: 'workspaces',
	files: 'files'
};

function openDB() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = (e) => {
			const db = e.target.result;
			if (!db.objectStoreNames.contains(STORES.workspaces)) {
				db.createObjectStore(STORES.workspaces);
			}
			if (!db.objectStoreNames.contains(STORES.files)) {
				db.createObjectStore(STORES.files);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function tx(storeName, mode = 'readonly') {
	return openDB().then(db => {
		const transaction = db.transaction(storeName, mode);
		const store = transaction.objectStore(storeName);
		return { store, complete: () => new Promise((resolve, reject) => {
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		})};
	});
}

function request(idbRequest) {
	return new Promise((resolve, reject) => {
		idbRequest.onsuccess = () => resolve(idbRequest.result);
		idbRequest.onerror = () => reject(idbRequest.error);
	});
}

function generateId() {
	return crypto.randomUUID();
}

function fileKey(workspaceId, filename) {
	return `${workspaceId}/${filename}`;
}

const blobUrlCache = new Map();

export const LocalBackend = {
	workspace: {
		async validate(id) {
			const { store } = await tx(STORES.workspaces);
			const data = await request(store.get(id));
			return { success: data !== undefined };
		},

		async create() {
			const id = generateId();
			const { store, complete } = await tx(STORES.workspaces, 'readwrite');
			store.put({}, id);
			await complete();
			return { success: true, workspaceId: id };
		},

		async load(id) {
			const { store } = await tx(STORES.workspaces);
			const data = await request(store.get(id));
			return data || {};
		},

		async save(id, settings) {
			const { store, complete } = await tx(STORES.workspaces, 'readwrite');
			store.put(settings, id);
			await complete();
			return { success: true };
		}
	},

	files: {
		async upload(workspaceId, formData) {
			if (!workspaceId) {
				throw new Error('No workspace available');
			}
			const file = formData.get('file');
			if (!file) {
				throw new Error('No file provided');
			}
			const blob = new Blob([await file.arrayBuffer()], { type: file.type });
			const key = fileKey(workspaceId, file.name);
			const { store, complete } = await tx(STORES.files, 'readwrite');
			store.put({ blob, name: file.name, size: file.size, type: file.type }, key);
			await complete();
			blobUrlCache.set(key, URL.createObjectURL(blob));
			return { success: true, filename: file.name };
		},

		async uploadWithProgress(workspaceId, file, onProgress) {
			const formData = new FormData();
			formData.append('file', file);
			if (onProgress) onProgress(50);
			const result = await this.upload(workspaceId, formData);
			if (onProgress) onProgress(100);
			return result;
		},

		async list(workspaceId) {
			const prefix = workspaceId + '/';
			const { store } = await tx(STORES.files);
			const allKeys = await request(store.getAllKeys());
			const matchingKeys = allKeys.filter(k => k.startsWith(prefix));
			const files = [];
			for (const key of matchingKeys) {
				const entry = await request(store.get(key));
				if (entry) {
					files.push({ name: entry.name, size: entry.size, sizeFormatted: formatBytes(entry.size) });
				}
			}
			return files;
		},

		async delete(workspaceId, filename) {
			const key = fileKey(workspaceId, filename);
			const cached = blobUrlCache.get(key);
			if (cached) {
				URL.revokeObjectURL(cached);
				blobUrlCache.delete(key);
			}
			const { store, complete } = await tx(STORES.files, 'readwrite');
			store.delete(key);
			await complete();
			return { success: true };
		},

		async download(workspaceId, filename) {
			const url = await this.resolveUrl(workspaceId, filename);
			if (!url) throw new Error('File not found');
			const link = document.createElement('a');
			link.href = url;
			link.download = filename;
			link.click();
		},

		async resolveUrl(workspaceId, filename) {
			const key = fileKey(workspaceId, filename);
			if (blobUrlCache.has(key)) return blobUrlCache.get(key);
			const { store } = await tx(STORES.files);
			const entry = await request(store.get(key));
			if (!entry) return null;
			const url = URL.createObjectURL(entry.blob);
			blobUrlCache.set(key, url);
			return url;
		},

		async getBlob(workspaceId, filename) {
			const key = fileKey(workspaceId, filename);
			const { store } = await tx(STORES.files);
			const entry = await request(store.get(key));
			return entry ? entry.blob : null;
		},

		resolveUrlSync(workspaceId, filename) {
			if (filename.includes('/')) return filename;
			const key = fileKey(workspaceId, filename);
			return blobUrlCache.get(key) || filename;
		},

		async preloadAllUrls(workspaceId) {
			const prefix = workspaceId + '/';
			const { store } = await tx(STORES.files);
			const allKeys = await request(store.getAllKeys());
			const matchingKeys = allKeys.filter(k => k.startsWith(prefix));
			for (const key of matchingKeys) {
				if (blobUrlCache.has(key)) continue;
				const entry = await request(store.get(key));
				if (entry) {
					blobUrlCache.set(key, URL.createObjectURL(entry.blob));
				}
			}
		}
	}
};

export const LocalSecurity = {
	csrfToken: 'standalone',
	async init() {},
	addToFormData() {},
	addToBody(body) { return body; }
};

function formatBytes(bytes) {
	if (bytes === 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + units[i];
}
