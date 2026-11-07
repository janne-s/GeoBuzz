import { Security } from './SecurityManager.js';

const CSRF_REJECTED_STATUS = 403;

function buildConfig(options) {
	const config = {
		method: options.method || 'GET',
		body: options.body,
		headers: {}
	};

	if (!(config.body instanceof FormData)) {
		config.headers['Content-Type'] = 'application/json';
		if (config.body !== undefined && typeof config.body !== 'string') {
			config.body = JSON.stringify(config.body);
		}
	}

	Object.assign(config.headers, options.headers);
	return config;
}

async function send(url, config) {
	if (config.method === 'POST' && Security.csrfToken) {
		config.headers['X-CSRF-Token'] = Security.csrfToken;
	}
	return fetch(url, config);
}

export const Backend = {
	async fetch(url, options = {}) {
		const config = buildConfig(options);
		const response = await send(url, config);

		if (response.status !== CSRF_REJECTED_STATUS || config.method !== 'POST') {
			return response;
		}

		await Security.refresh();
		return send(url, config);
	},

	async call(url, options = {}) {
		try {
			const response = await this.fetch(url, options);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return await response.json();
		} catch (error) {
			console.error(`Backend Error [${url}]:`, error);
			throw error;
		}
	}
};
