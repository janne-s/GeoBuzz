export class StreamManager {
	constructor() {
		this.activeStreams = new Set();
		this._audioContext = null;
	}

	get audioContext() {
		return this._audioContext;
	}

	setAudioContext(context) {
		this._audioContext = context;
	}

	async initializeStream(obj) {
		if (!obj.params.streamUrl || obj.streamStatus === 'loading' || obj.streamStatus === 'ready') {
			return false;
		}

		obj.streamStatus = 'loading';

		if (obj.mediaSource) {
			try {
				obj.mediaSource.disconnect();
			} catch (e) {
				console.warn('Error disconnecting previous media source:', e);
			}
			obj.mediaSource = null;
		}
		if (obj.mediaElement) {
			obj.mediaElement.pause();
			obj.mediaElement.removeAttribute('src');
			obj.mediaElement = null;
		}

		const audioElement = new Audio();
		audioElement.crossOrigin = "anonymous";
		obj.mediaElement = audioElement;

		try {
			await new Promise((resolve, reject) => {
				const onLoaded = () => {
					audioElement.removeEventListener('canplaythrough', onLoaded);
					audioElement.removeEventListener('error', reject);
					resolve();
				};
				audioElement.addEventListener('canplaythrough', onLoaded);
				audioElement.addEventListener('error', (e) => reject(e));
				audioElement.src = obj.params.streamUrl;
				audioElement.load();
			});

			obj.mediaSource = this.audioContext.createMediaElementSource(audioElement);
			obj.streamLoaded = true;
			obj.synth.loaded = true;
			obj.streamStatus = 'ready';
			obj.isReady = true;
			this.activeStreams.add(obj);

			const connected = this.connectStreamAudioChain(obj);
			if (!connected) {
				console.error('Failed to connect stream audio chain');
				obj.streamStatus = 'error';
				return false;
			}

			return true;

		} catch (error) {
			console.error(`Stream failed to load: ${obj.params.streamUrl}`, error);
			obj.streamStatus = 'error';
			return false;
		}
	}

	async playStream(obj) {
		if (obj.type !== "StreamPlayer" || !obj.mediaElement || obj.streamStatus !== 'ready' || obj.isPlaying) {
			return false;
		}

		try {
			await obj.mediaElement.play();
			obj.isPlaying = true;
			obj.streamStatus = 'playing';
			return true;
		} catch (error) {
			console.error(`Error playing stream:`, error);
			obj.streamStatus = 'error';
			return false;
		}
	}

	stopStream(obj) {
		if (obj.type !== "StreamPlayer" || !obj.mediaElement || !obj.isPlaying) return;

		try {
			obj.mediaElement.pause();
			obj.isPlaying = false;
			obj.streamStatus = 'ready';

		} catch (error) {
			console.error(`Error stopping stream:`, error);
			obj.streamStatus = 'error';
		}
	}

	applyStreamEnvelope(obj) {
		if (obj.type !== "StreamPlayer") return;

		const fadeIn = obj.params.fadeIn || 0.1;
		const now = Tone.now();

		obj.envelopeGain.gain.cancelScheduledValues(now);
		obj.envelopeGain.gain.setValueAtTime(0, now);
		obj.envelopeGain.gain.linearRampToValueAtTime(1.0, now + fadeIn);
	}

	async updateStreamUrl(obj, newUrl) {
		if (obj.type !== "StreamPlayer") return false;

		this.stopStream(obj);
		obj.params.streamUrl = newUrl;
		return await this.initializeStream(obj);
	}

	cleanupStream(obj) {
		if (obj.isPlaying && obj.mediaElement) {
			try {
				obj.mediaElement.pause();
			} catch (e) {
				console.warn('Error pausing media element:', e);
			}
		}

		if (obj.mediaSource) {
			try {
				obj.mediaSource.disconnect();
			} catch (e) {
				console.warn('Error disconnecting media source:', e);
			}
			obj.mediaSource = null;
		}

		if (obj.mediaElement) {
			obj.mediaElement.pause();
			obj.mediaElement.oncanplaythrough = null;
			obj.mediaElement.onloadeddata = null;
			obj.mediaElement.onerror = null;
			obj.mediaElement.removeAttribute('src');
			obj.mediaElement.load();
			obj.mediaElement = null;
		}

		obj.streamLoaded = false;
		obj.synth.loaded = false;
		obj.streamStatus = 'stopped';
		obj.isPlaying = false;
		obj.isReady = false;
		this.activeStreams.delete(obj);
	}

	cleanupAllStreams() {
		this.activeStreams.forEach(obj => {
			this.cleanupStream(obj);
		});
		this.activeStreams.clear();
	}

	connectStreamAudioChain(obj) {
		if (!obj.mediaSource || !obj.filter) {
			console.error('Cannot connect stream audio chain: missing mediaSource or filter node');
			return false;
		}
		try {
			Tone.connect(obj.mediaSource, obj.filter);
			return true;
		} catch (error) {
			console.error('Error connecting stream audio chain:', error);
			return false;
		}
	}

	async testStreamUrl(url) {
		try {
			const audio = new Audio();
			audio.crossOrigin = 'anonymous';
			audio.preload = 'auto';

			return new Promise((resolve) => {
				const timeout = setTimeout(() => {
					resolve({ success: false, error: 'timeout' });
				}, 10000);

				audio.addEventListener('canplaythrough', () => {
					clearTimeout(timeout);
					resolve({ success: true, type: 'canplaythrough' });
				});

				audio.addEventListener('loadeddata', () => {
					clearTimeout(timeout);
					resolve({ success: true, type: 'loadeddata' });
				});

				audio.addEventListener('error', (e) => {
					clearTimeout(timeout);
					resolve({ success: false, error: audio.error, event: e });
				});

				audio.src = url;
				audio.load();
			});

		} catch (error) {
			console.error('Stream test error:', error);
			return { success: false, error: error.message };
		}
	}
}
