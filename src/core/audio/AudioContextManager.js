class AudioContextManagerClass {
	constructor() {
		this.nativeContext = null;
		this.isInitialized = false;
		this.initializationPromise = null;
	}

	setupContext() {
		if (this.nativeContext && this.nativeContext.state !== 'closed') return;
		try {
			const AudioContextClass = window.AudioContext || window.webkitAudioContext;
			this.nativeContext = new AudioContextClass();
			Tone.setContext(new Tone.Context(this.nativeContext));
		} catch (error) {
			console.error("Failed to create AudioContext:", error);
		}
	}

	async initialize() {
		if (this.nativeContext && this.nativeContext.state === 'closed') {
			this.isInitialized = false;
			this.initializationPromise = null;
		}

		if (this.isInitialized && this.nativeContext && this.nativeContext.state === 'running') {
			return true;
		}

		if (this.initializationPromise) {
			return this.initializationPromise;
		}

		this.initializationPromise = (async () => {
			if (!this.nativeContext) {
				this.setupContext();
			}

			try {
				await Tone.start();

				if (this.nativeContext && this.nativeContext.state === 'closed') {
					this.setupContext();
				}

				this.isInitialized = true;
				return true;
			} catch (error) {
				console.error("Failed to start AudioContext:", error);
				return false;
			} finally {
				this.initializationPromise = null;
			}
		})();

		return this.initializationPromise;
	}
}

export const AudioContextManager = new AudioContextManagerClass();
AudioContextManager.setupContext();
