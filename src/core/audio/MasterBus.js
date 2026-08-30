import { CONSTANTS } from '../constants.js';
import { AudioContextManager } from './AudioContextManager.js';
import { debounce } from '../utils/debounce.js';

const STORAGE_KEY = 'geobuzz_masterMonitor';

function toDb(linear) {
	if (!(linear > 0)) return CONSTANTS.MASTER_METER_FLOOR_DB;
	const db = 20 * Math.log10(linear);
	return db < CONSTANTS.MASTER_METER_FLOOR_DB ? CONSTANTS.MASTER_METER_FLOOR_DB : db;
}

function dbToGain(db) {
	return Math.pow(10, db / 20);
}

function clamp(value, min, max) {
	return value < min ? min : (value > max ? max : value);
}

function createChannelState() {
	return {
		peakDb: CONSTANTS.MASTER_METER_FLOOR_DB,
		rmsDb: CONSTANTS.MASTER_METER_FLOOR_DB,
		holdDb: CONSTANTS.MASTER_METER_FLOOR_DB,
		holdUntil: 0
	};
}

class MasterBusClass {
	constructor() {
		this.enabled = false;
		this.context = null;
		this.input = null;
		this.volume = null;
		this.meterTap = null;
		this.splitter = null;
		this.analysers = null;
		this.buffers = null;
		this.channels = [createChannelState(), createChannelState()];
		this.volumeDb = CONSTANTS.MASTER_VOLUME_DEFAULT_DB;
		this.muted = false;
		this.lastSampleTime = 0;
		this.clipUntil = 0;
		this.sessionMinRmsDb = null;
		this.sessionMaxRmsDb = null;
		this.sessionPeakDb = null;
		this._persist = debounce(() => this._write(), CONSTANTS.MASTER_MONITOR_PERSIST_MS);
		this._restore();
	}

	enable() {
		this.enabled = true;
		return this.attach();
	}

	attach() {
		if (!this.enabled) return false;
		const ctx = AudioContextManager.nativeContext;
		if (!ctx || typeof Tone === 'undefined') return false;
		if (this.input && this.context === ctx) return true;

		this.context = ctx;

		this.input = ctx.createGain();
		this.volume = ctx.createGain();
		this.volume.gain.value = this._targetGain();
		this.input.connect(this.volume);
		this.volume.connect(ctx.destination);

		this.meterTap = ctx.createGain();
		this.meterTap.channelCount = 2;
		this.meterTap.channelCountMode = 'explicit';
		this.meterTap.channelInterpretation = 'speakers';
		this.input.connect(this.meterTap);

		this.splitter = ctx.createChannelSplitter(2);
		this.meterTap.connect(this.splitter);

		this.analysers = [ctx.createAnalyser(), ctx.createAnalyser()];
		this.analysers.forEach((analyser, index) => {
			analyser.fftSize = CONSTANTS.MASTER_METER_FFT_SIZE;
			this.splitter.connect(analyser, index);
		});
		this.buffers = this.analysers.map(analyser => new Float32Array(analyser.fftSize));

		const destination = Tone.getDestination();
		try {
			destination.disconnect();
			Tone.connect(destination, this.input);
		} catch (e) {
			console.warn('Master bus could not be inserted, monitoring disabled:', e);
			this._teardown();
			try {
				Tone.connect(destination, ctx.destination);
			} catch (restoreError) {
				console.error('Master output could not be restored:', restoreError);
			}
			return false;
		}

		return true;
	}

	_teardown() {
		[this.input, this.volume, this.meterTap, this.splitter].forEach(node => {
			if (node) node.disconnect();
		});
		this.input = null;
		this.volume = null;
		this.meterTap = null;
		this.splitter = null;
		this.analysers = null;
		this.buffers = null;
		this.context = null;
		this.enabled = false;
	}

	connectSource(node) {
		if (!node) return;
		if (this.attach()) {
			node.connect(this.input);
			return;
		}
		if (typeof Tone !== 'undefined') {
			Tone.connect(node, Tone.getDestination());
		}
	}

	getVolumeDb() {
		return this.volumeDb;
	}

	setVolumeDb(db) {
		this.volumeDb = clamp(db, CONSTANTS.MASTER_VOLUME_MIN_DB, CONSTANTS.MASTER_VOLUME_MAX_DB);
		this._rampToTarget();
		this._persist();
	}

	isMuted() {
		return this.muted;
	}

	setMuted(muted) {
		this.muted = !!muted;
		this._rampToTarget();
		this._persist();
	}

	resetRange() {
		this.sessionMinRmsDb = null;
		this.sessionMaxRmsDb = null;
		this.sessionPeakDb = null;
	}

	update() {
		const now = performance.now() / 1000;

		if (!this.attach()) {
			this.lastSampleTime = now;
			return this._reading(false);
		}

		const dt = this.lastSampleTime
			? Math.min(now - this.lastSampleTime, CONSTANTS.MASTER_METER_MAX_FRAME_TIME)
			: 0;
		this.lastSampleTime = now;

		let blockPeak = 0;
		let blockRmsDb = CONSTANTS.MASTER_METER_FLOOR_DB;

		for (let index = 0; index < this.analysers.length; index++) {
			const buffer = this.buffers[index];
			this.analysers[index].getFloatTimeDomainData(buffer);

			let peak = 0;
			let sumSquares = 0;
			for (let i = 0; i < buffer.length; i++) {
				const sample = buffer[i];
				const magnitude = sample < 0 ? -sample : sample;
				if (magnitude > peak) peak = magnitude;
				sumSquares += sample * sample;
			}
			if (peak > blockPeak) blockPeak = peak;

			const channel = this.channels[index];
			const peakDb = toDb(peak);
			const rmsDb = toDb(Math.sqrt(sumSquares / buffer.length));
			if (rmsDb > blockRmsDb) blockRmsDb = rmsDb;

			if (peakDb >= channel.peakDb) {
				channel.peakDb = peakDb;
			} else {
				channel.peakDb = Math.max(
					peakDb,
					channel.peakDb - CONSTANTS.MASTER_METER_PEAK_DECAY_DB_PER_SEC * dt
				);
			}

			const coefficient = dt > 0
				? 1 - Math.exp(-dt / CONSTANTS.MASTER_METER_RMS_TIME_CONSTANT)
				: 1;
			channel.rmsDb += (rmsDb - channel.rmsDb) * coefficient;

			if (channel.peakDb >= channel.holdDb) {
				channel.holdDb = channel.peakDb;
				channel.holdUntil = now + CONSTANTS.MASTER_METER_HOLD_TIME;
			} else if (now > channel.holdUntil) {
				channel.holdDb = Math.max(
					channel.peakDb,
					channel.holdDb - CONSTANTS.MASTER_METER_HOLD_DECAY_DB_PER_SEC * dt
				);
			}
		}

		if (blockPeak >= CONSTANTS.MASTER_METER_CLIP_THRESHOLD) {
			this.clipUntil = now + CONSTANTS.MASTER_METER_CLIP_HOLD_TIME;
		}

		const peakDb = Math.max(this.channels[0].peakDb, this.channels[1].peakDb);
		const rmsDb = Math.max(this.channels[0].rmsDb, this.channels[1].rmsDb);

		if (this.sessionMinRmsDb === null || blockRmsDb < this.sessionMinRmsDb) this.sessionMinRmsDb = blockRmsDb;
		if (this.sessionMaxRmsDb === null || blockRmsDb > this.sessionMaxRmsDb) this.sessionMaxRmsDb = blockRmsDb;

		const blockPeakDb = toDb(blockPeak);
		if (this.sessionPeakDb === null || blockPeakDb > this.sessionPeakDb) this.sessionPeakDb = blockPeakDb;

		return this._reading(now < this.clipUntil);
	}

	_targetGain() {
		return this.muted ? 0 : dbToGain(this.volumeDb);
	}

	_rampToTarget() {
		if (!this.volume || !this.context) return;
		const now = this.context.currentTime;
		const param = this.volume.gain;
		param.cancelScheduledValues(now);
		param.setValueAtTime(param.value, now);
		param.linearRampToValueAtTime(this._targetGain(), now + CONSTANTS.MASTER_VOLUME_RAMP_TIME);
	}

	_reading(clipping) {
		const peakDb = Math.max(this.channels[0].peakDb, this.channels[1].peakDb);
		const rmsDb = Math.max(this.channels[0].rmsDb, this.channels[1].rmsDb);
		return {
			channels: this.channels,
			peakDb,
			rmsDb,
			crestDb: peakDb - rmsDb,
			clipping,
			sessionMinRmsDb: this.sessionMinRmsDb,
			sessionMaxRmsDb: this.sessionMaxRmsDb,
			sessionPeakDb: this.sessionPeakDb
		};
	}

	_restore() {
		try {
			const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
			if (!stored) return;
			if (typeof stored.volumeDb === 'number') {
				this.volumeDb = clamp(stored.volumeDb, CONSTANTS.MASTER_VOLUME_MIN_DB, CONSTANTS.MASTER_VOLUME_MAX_DB);
			}
			if (typeof stored.muted === 'boolean') {
				this.muted = stored.muted;
			}
		} catch (e) {
			this.volumeDb = CONSTANTS.MASTER_VOLUME_DEFAULT_DB;
			this.muted = false;
		}
	}

	_write() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({
				volumeDb: this.volumeDb,
				muted: this.muted
			}));
		} catch (e) {
			console.warn('Master monitor settings could not be saved:', e);
		}
	}
}

export const MasterBus = new MasterBusClass();
