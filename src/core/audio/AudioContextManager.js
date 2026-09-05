import { CONSTANTS } from '../constants.js';

class AudioContextManagerClass {
	constructor() {
		this.nativeContext = null;
		this.isInitialized = false;
		this.initializationPromise = null;
		this.state = null;
		this.listeners = new Set();
	}

	setupContext() {
		if (this.nativeContext && this.nativeContext.state !== 'closed') return;
		try {
			const AudioContextClass = window.AudioContext || window.webkitAudioContext;
			this.nativeContext = new AudioContextClass({ latencyHint: CONSTANTS.AUDIO_LATENCY_HINT });
			this.state = this.nativeContext.state;
			this.nativeContext.addEventListener('statechange', () => this.handleStateChange());
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

	handleStateChange() {
		const state = this.getState();
		if (state === this.state) return;

		this.state = state;
		this.listeners.forEach(listener => {
			try {
				listener(state);
			} catch (error) {
				console.error('AudioContext state listener failed:', error);
			}
		});
	}

	onStateChange(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	getState() {
		return this.nativeContext ? this.nativeContext.state : null;
	}

	isInterrupted() {
		return this.getState() === 'interrupted';
	}

	isRunning() {
		return this.nativeContext?.state === 'running';
	}

	requestResume() {
		if (this.isRunning()) return;

		if (this.nativeContext && this.nativeContext.state !== 'running') {
			Promise.resolve(this.nativeContext.resume()).catch(() => {});
		}

		if (Tone.context.state !== 'running') {
			Promise.resolve(Tone.start()).catch(() => {});
		}
	}
}

export const AudioContextManager = new AudioContextManagerClass();
AudioContextManager.setupContext();
