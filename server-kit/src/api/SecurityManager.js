export class SecurityManager {
	constructor() {
		this.csrfToken = null;
	}

	async init() {
		try {
			const response = await fetch('api/csrf.php');
			const data = await response.json();
			this.csrfToken = data.token;
		} catch (error) {
			console.error('Failed to load CSRF token:', error);
		}
	}

	addToFormData(formData) {
		if (this.csrfToken) {
			formData.append('csrf_token', this.csrfToken);
		}
	}

	addToBody(body) {
		return body + `&csrf_token=${encodeURIComponent(this.csrfToken)}`;
	}
}

export const Security = new SecurityManager();
