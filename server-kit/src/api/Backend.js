import { Security } from './SecurityManager.js';

export const Backend = {
	/**
	 * Make an API call with automatic CSRF token injection
	 * @param {string} url - The endpoint URL
	 * @param {Object} options - Fetch options
	 * @returns {Promise<Object>} JSON response
	 */
	async call(url, options = {}) {
		const isFormData = options.body instanceof FormData;

		const config = {
			method: options.method || 'GET',
			body: options.body
		};

		if (config.method === 'POST' && Security.csrfToken && config.body) {
			if (isFormData) {
				Security.addToFormData(config.body);
			} else {
				if (typeof config.body !== 'string') {
					config.body = JSON.stringify(config.body);
				}
				config.headers = {
					'Content-Type': 'application/json',
					'X-CSRF-Token': Security.csrfToken,
					...options.headers
				};
			}
		} else if (!isFormData) {
			config.headers = {
				'Content-Type': 'application/json',
				...options.headers
			};
		}

		try {
			const response = await fetch(url, config);

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
