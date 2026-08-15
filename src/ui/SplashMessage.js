import { ModalSystem } from './ModalSystem.js';

const STORAGE_KEY = 'geobuzz_lastSeenMessage';
const SUPPRESS_KEY = 'geobuzz_suppressSplash';

export async function checkSplashMessage() {
	try {
		const response = await fetch('message.json');
		if (!response.ok) return;
		const { version, title, body } = await response.json();
		if (!body) return;

		const isSuppressed = localStorage.getItem(SUPPRESS_KEY) === 'true';
		const suppressedForCurrentVersion = isSuppressed && localStorage.getItem(STORAGE_KEY) === version;
		if (suppressedForCurrentVersion) return;

		const dontShowAgain = await ModalSystem.alertWithCheckbox(
			body,
			title,
			"Don't show this again",
			{ priority: true }
		);

		if (version) localStorage.setItem(STORAGE_KEY, version);
		localStorage.setItem(SUPPRESS_KEY, dontShowAgain ? 'true' : 'false');
	} catch {
		// no message file or parse error — silent
	}
}
