import { ModalSystem } from './ModalSystem.js';

const STORAGE_KEY = 'geobuzz_lastSeenMessage';

export async function checkSplashMessage() {
	try {
		const response = await fetch('message.json');
		if (!response.ok) return;
		const { version, title, body } = await response.json();
		if (!version || localStorage.getItem(STORAGE_KEY) === version) return;
		await ModalSystem.alert(body, title, { priority: true });
		localStorage.setItem(STORAGE_KEY, version);
	} catch {
	}
}
