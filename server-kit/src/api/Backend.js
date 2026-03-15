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
			} else if (typeof config.body === 'string') {
				try {
					const bodyObj = JSON.parse(config.body);
					bodyObj.csrf_token = Security.csrfToken;
					config.body = JSON.stringify(bodyObj);
					config.headers = {
						'Content-Type': 'application/json',
						...options.headers
					};
				} catch (e) {
					config.body = Security.addToBody(config.body);
					config.headers = {
						'Content-Type': 'application/x-www-form-urlencoded',
						...options.headers
					};
				}
			} else {
				config.body.csrf_token = Security.csrfToken;
				config.body = JSON.stringify(config.body);
				config.headers = {
					'Content-Type': 'application/json',
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
