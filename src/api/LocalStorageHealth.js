const PERSISTENCE_WARNED_KEY = 'geobuzz_persistenceWarned';

const LOW_RATIO = 0.8;
const CRITICAL_RATIO = 0.95;
const LOW_REMAINING_BYTES = 50 * 1024 * 1024;

export function formatBytes(bytes) {
	if (!bytes) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB'];
	const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + units[i];
}

export function isQuotaError(error) {
	if (!error) return false;
	return error.name === 'QuotaExceededError' ||
		error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
		error.code === 22;
}

export function quotaError(action) {
	const error = new Error(
		`There is not enough browser storage left to ${action}. Standalone GeoBuzz keeps the whole Buzz — ` +
		`settings and every sound file — in this browser. Export the Buzz to a file now, then delete sounds ` +
		`you no longer need or free up disk space.`
	);
	error.name = 'StorageFullError';
	return error;
}

export async function requestPersistence() {
	if (!navigator.storage?.persist) return { supported: false, persisted: false };
	try {
		if (navigator.storage.persisted && await navigator.storage.persisted()) {
			return { supported: true, persisted: true };
		}
		return { supported: true, persisted: await navigator.storage.persist() };
	} catch {
		return { supported: false, persisted: false };
	}
}

export async function getStorageEstimate() {
	if (!navigator.storage?.estimate) return null;
	try {
		const { usage, quota } = await navigator.storage.estimate();
		if (!quota) return null;
		const used = usage || 0;
		return { usage: used, quota, remaining: quota - used, ratio: used / quota };
	} catch {
		return null;
	}
}

export const STORAGE_LEVEL_RANK = { unknown: 0, ok: 0, low: 1, critical: 2 };

export function storageLevel(estimate) {
	if (!estimate) return 'unknown';
	if (estimate.ratio >= CRITICAL_RATIO) return 'critical';
	if (estimate.ratio >= LOW_RATIO || estimate.remaining <= LOW_REMAINING_BYTES) return 'low';
	return 'ok';
}

export function persistenceWarningShown() {
	try {
		return localStorage.getItem(PERSISTENCE_WARNED_KEY) === 'true';
	} catch {
		return true;
	}
}

export function markPersistenceWarningShown() {
	try {
		localStorage.setItem(PERSISTENCE_WARNED_KEY, 'true');
	} catch {
		return;
	}
}
