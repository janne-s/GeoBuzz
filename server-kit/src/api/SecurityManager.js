export class SecurityManager {
	constructor() {
		this.csrfToken = null;
		this.pendingRefresh = null;
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

	refresh() {
		if (!this.pendingRefresh) {
			this.pendingRefresh = this.init().finally(() => {
				this.pendingRefresh = null;
			});
		}
		return this.pendingRefresh;
	}
}

export const Security = new SecurityManager();
