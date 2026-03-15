export class SecurityManager {
	constructor() {
		this.csrfToken = 'standalone';
	}

	async init() {}

	addToFormData() {}

	addToBody(body) {
		return body;
	}
}

export const Security = new SecurityManager();
