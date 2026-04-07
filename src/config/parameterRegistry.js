import { CONSTANTS } from '../core/constants.js';

export function generateLFOWaveform(phase, waveform, modState) {
	const normalizedPhase = (phase / CONSTANTS.TWO_PI) % 1;

	switch (waveform) {
		case 'sine':
			return Math.sin(phase);
		case 'triangle':
			return 2 * Math.abs(2 * (normalizedPhase - Math.floor(normalizedPhase + 0.5))) - 1;
		case 'sawup':
			return 2 * (normalizedPhase - Math.floor(normalizedPhase + 0.5));
		case 'sawdown':
			return -2 * (normalizedPhase - Math.floor(normalizedPhase + 0.5));
		case 'square':
			return normalizedPhase < 0.5 ? 1 : -1;
		case 'random':
			const currentCycle = Math.floor(phase / CONSTANTS.TWO_PI);
			if (!modState.lastCycle || modState.lastCycle !== currentCycle) {
				modState.lastCycle = currentCycle;
				modState.prevValue = modState.heldValue !== undefined ? modState.heldValue : 0;
				modState.heldValue = Math.random() * 2 - 1;
			}
			const prevValue = modState.prevValue !== undefined ? modState.prevValue : modState.heldValue;
			return prevValue + (modState.heldValue - prevValue) * normalizedPhase;
		case 'randomEdgy':
			const cycle = Math.floor(phase / CONSTANTS.TWO_PI);
			if (!modState.lastCycle || modState.lastCycle !== cycle) {
				modState.lastCycle = cycle;
				modState.heldValue = Math.random() * 2 - 1;
			}
			return modState.heldValue;
		default:
			return Math.sin(phase);
	}
}

function generateLFOParams(axis, category) {
	return {
		[`lfo_${axis}_range`]: {
			label: 'Range',
			type: 'range',
			min: 0,
			max: CONSTANTS.LFO_MAX_RANGE,
			step: CONSTANTS.LFO_RANGE_STEP,
			defaultValue: 0,
			unit: ' m',
			category,
			serialize: true,
			ui: true
		},
		[`lfo_${axis}_freq`]: {
			label: 'Freq',
			type: 'range',
			min: 0,
			max: 2,
			step: 0.01,
			defaultValue: 0,
			unit: ' Hz',
			category,
			serialize: true,
			ui: true
		},
		[`lfo_${axis}_maxRange`]: {
			label: 'Max Range',
			type: 'range',
			min: CONSTANTS.LFO_MIN_RANGE,
			max: CONSTANTS.LFO_MAX_RANGE,
			step: CONSTANTS.LFO_RANGE_STEP,
			defaultValue: CONSTANTS.DEFAULT_LFO_MAX_RANGE,
			unit: ' m',
			category,
			serialize: true,
			ui: true
		}
	};
}

function generateModParams(mod, category) {
	return {
		[`lfo_${mod}_range`]: {
			label: 'Range',
			type: 'range',
			min: CONSTANTS.MOD_PARAM_MIN,
			max: CONSTANTS.MOD_PARAM_MAX,
			step: CONSTANTS.MOD_PARAM_STEP,
			defaultValue: 0,
			unit: ' %',
			category,
			serialize: true,
			ui: true
		},
		[`lfo_${mod}_freq`]: {
			label: 'Freq',
			type: 'range',
			min: CONSTANTS.LFO_FREQ_MIN,
			max: CONSTANTS.LFO_FREQ_MAX,
			step: CONSTANTS.LFO_FREQ_STEP,
			defaultValue: 0,
			unit: ' Hz',
			category,
			serialize: true,
			ui: true
		},
		[`lfo_${mod}_referenceSpeed`]: {
			label: 'Reference Speed',
			type: 'range',
			min: CONSTANTS.REFERENCE_SPEED_MIN,
			max: CONSTANTS.REFERENCE_SPEED_MAX,
			step: CONSTANTS.REFERENCE_SPEED_STEP,
			defaultValue: CONSTANTS.REFERENCE_SPEED_DEFAULT,
			unit: ' m/s',
			category,
			serialize: true,
			ui: true
		},
		[`lfo_${mod}_speedThreshold`]: {
			label: 'Speed Threshold',
			type: 'range',
			min: 0,
			max: CONSTANTS.REFERENCE_SPEED_MAX,
			step: 0.01,
			defaultValue: 0.1,
			unit: ' m/s',
			category,
			serialize: true,
			ui: true
		},
		[`lfo_${mod}_instabilityReactivity`]: {
			label: 'Reactivity',
			type: 'range',
			min: 0,
			max: 1,
			step: 0.01,
			defaultValue: CONSTANTS.GPS_INSTABILITY_REACTIVITY_DEFAULT,
			unit: '',
			category,
			serialize: true,
			ui: true
		}
	};
}

function generateFXParams() {
	return {
		fx_frequency: { label: 'Speed', type: 'range', min: 0.1, max: 10, step: 0.1, defaultValue: 1, unit: ' Hz', category: 'effect', serialize: true, ui: true },
		fx_depth: { label: 'Depth', type: 'range', min: 0, max: 1, step: 0.01, defaultValue: 0.5, unit: '', category: 'effect', serialize: true, ui: true },
		fx_baseFrequency: { label: 'Base Freq', type: 'range', min: 100, max: 2000, step: 10, defaultValue: 200, unit: ' Hz', category: 'effect', serialize: true, ui: true },
		fx_octaves: { label: 'Octaves', type: 'range', min: 0.5, max: 8, step: 0.1, defaultValue: 2.6, unit: '', category: 'effect', serialize: true, ui: true },
		fx_sensitivity: { label: 'Sensitivity', type: 'range', min: -40, max: 0, step: 1, defaultValue: 0, unit: ' dB', category: 'effect', serialize: true, ui: true, allowNegativeMin: true },
		fx_Q: { label: 'Q', type: 'range', min: 1, max: 10, step: 0.1, defaultValue: 2, unit: '', category: 'effect', serialize: true, ui: true },
		fx_delayTime: { label: 'Delay', type: 'range', min: 2, max: 20, step: 0.1, defaultValue: 3.5, unit: ' ms', category: 'effect', serialize: true, ui: true },
		fx_delayTime_long: { label: 'Time', type: 'range', min: 0.01, max: 1, step: 0.01, defaultValue: 0.25, unit: ' s', category: 'effect', serialize: true, ui: true, showDistance: true },
		fx_feedback: { label: 'Feedback', type: 'range', min: 0, max: 0.95, step: 0.01, defaultValue: 0.5, unit: '', category: 'effect', serialize: true, ui: true },
		fx_decay: { label: 'Decay', type: 'range', min: 0.1, max: 10, step: 0.1, defaultValue: 1.5, unit: ' s', category: 'effect', serialize: true, ui: true },
		fx_preDelay: { label: 'Pre-Delay', type: 'range', min: 0, max: 0.1, step: 0.001, defaultValue: 0.01, unit: ' s', category: 'effect', serialize: true, ui: true },
		fx_mix: { label: 'Mix', type: 'range', min: 0, max: 100, step: 1, defaultValue: 50, unit: ' %', category: 'effect', serialize: true, ui: true }
	};
}

function generateEQParams() {
	return {
		fx_eq_low: { label: 'Low', type: 'range', min: -24, max: 24, step: 0.5, defaultValue: 0, unit: ' dB', category: 'effect', serialize: true, ui: true, audioParam: 'low', allowNegativeMin: true },
		fx_eq_mid: { label: 'Mid', type: 'range', min: -24, max: 24, step: 0.5, defaultValue: 0, unit: ' dB', category: 'effect', serialize: true, ui: true, audioParam: 'mid', allowNegativeMin: true },
		fx_eq_high: { label: 'High', type: 'range', min: -24, max: 24, step: 0.5, defaultValue: 0, unit: ' dB', category: 'effect', serialize: true, ui: true, audioParam: 'high', allowNegativeMin: true },
		fx_eq_lowFreq: { label: 'Low/Mid Crossover', type: 'range', min: 100, max: 1000, step: 10, defaultValue: 400, unit: ' Hz', category: 'effect', serialize: true, ui: true, audioParam: 'lowFrequency' },
		fx_eq_highFreq: { label: 'Mid/High Crossover', type: 'range', min: 1000, max: 10000, step: 100, defaultValue: 2500, unit: ' Hz', category: 'effect', serialize: true, ui: true, audioParam: 'highFrequency' }
	};
}

export const PARAMETER_REGISTRY = {
	pitch: {
		label: 'Pitch',
		type: 'range',
		min: CONSTANTS.PITCH_MIN,
		max: CONSTANTS.PITCH_MAX,
		step: 1,
		defaultValue: 60,
		unit: '',
		category: 'oscillator',
		audioNode: 'oscillator.frequency',
		serialize: true,
		ui: true,
	},
	frequency: {
		label: 'Frequency',
		type: 'number',
		min: CONSTANTS.FREQUENCY_MIN,
		max: CONSTANTS.FREQUENCY_MAX,
		step: 1,
		defaultValue: 440,
		unit: ' Hz',
		category: 'oscillator',
		audioNode: 'oscillator.frequency',
		serialize: true,
		ui: true
	},
	detune: {
		label: 'Detune',
		type: 'range',
		min: CONSTANTS.DETUNE_MIN,
		max: CONSTANTS.DETUNE_MAX,
		step: 1,
		defaultValue: 0,
		unit: ' cents',
		category: 'oscillator',
		audioNode: 'oscillator.detune',
		serialize: true,
		ui: true,
		allowNegativeMin: true
	},
	portamento: {
		label: 'Portamento',
		type: 'range',
		min: CONSTANTS.PORTAMENTO_MIN,
		max: CONSTANTS.PORTAMENTO_MAX,
		step: CONSTANTS.PORTAMENTO_STEP,
		defaultValue: 0,
		unit: ' s',
		category: 'oscillator',
		audioNode: 'oscillator.portamento',
		serialize: true,
		ui: true
	},
	pulseWidth: {
		label: 'Pulse Width',
		type: 'range',
		min: CONSTANTS.PULSE_WIDTH_MIN,
		max: CONSTANTS.PULSE_WIDTH_MAX,
		step: CONSTANTS.PULSE_WIDTH_STEP,
		defaultValue: 0.5,
		unit: '',
		category: 'oscillator',
		audioNode: 'oscillator.width',
		serialize: true,
		ui: true
	},
	waveform: {
		label: 'Waveform',
		type: 'select',
		options: [
			{ value: 'sine', label: 'Sine' },
			{ value: 'square', label: 'Square' },
			{ value: 'sawtooth', label: 'Sawtooth' },
			{ value: 'triangle', label: 'Triangle' },
			{ value: 'pulse', label: 'Pulse' },
			{ value: 'pwm', label: 'PWM' }
		],
		defaultValue: 'sine',
		category: 'oscillator',
		audioNode: 'oscillator.type',
		serialize: true,
		ui: true
	},

	noiseType: {
		label: 'Noise Type',
		type: 'select',
		options: [
			{ value: 'white', label: 'White' },
			{ value: 'pink', label: 'Pink' },
			{ value: 'brown', label: 'Brown' }
		],
		defaultValue: 'white',
		category: 'oscillator',
		audioNode: 'noise.type',
		serialize: true,
		ui: true
	},

	attack: {
		label: 'Attack',
		type: 'range',
		min: CONSTANTS.ENVELOPE_TIME_MIN,
		max: CONSTANTS.ENVELOPE_TIME_MAX,
		step: CONSTANTS.ENVELOPE_TIME_STEP,
		defaultValue: 0.1,
		unit: ' s',
		category: 'envelope',
		audioNode: 'envelope.attack',
		serialize: true,
		ui: true
	},
	decay: {
		label: 'Decay',
		type: 'range',
		min: CONSTANTS.ENVELOPE_TIME_MIN,
		max: CONSTANTS.ENVELOPE_TIME_MAX,
		step: CONSTANTS.ENVELOPE_TIME_STEP,
		defaultValue: 0.2,
		unit: ' s',
		category: 'envelope',
		audioNode: 'envelope.decay',
		serialize: true,
		ui: true
	},
	sustain: {
		label: 'Sustain',
		type: 'range',
		min: CONSTANTS.SUSTAIN_MIN,
		max: CONSTANTS.SUSTAIN_MAX,
		step: CONSTANTS.VOLUME_STEP,
		defaultValue: 0.3,
		unit: '',
		category: 'envelope',
		audioNode: 'envelope.sustain',
		serialize: true,
		ui: true
	},
	release: {
		label: 'Release',
		type: 'range',
		min: CONSTANTS.RELEASE_MIN,
		max: CONSTANTS.RELEASE_MAX,
		step: CONSTANTS.RELEASE_STEP,
		defaultValue: 0.5,
		unit: ' s',
		category: 'envelope',
		audioNode: 'envelope.release',
		serialize: true,
		ui: true
	},

	filterFreq: {
		label: 'Filter Freq',
		type: 'range',
		min: CONSTANTS.FILTER_MIN,
		max: CONSTANTS.FILTER_MAX,
		step: CONSTANTS.FILTER_RANGE_STEP,
		defaultValue: 1000,
		unit: ' Hz',
		category: 'filter',
		audioNode: 'filter.frequency',
		serialize: true,
		ui: true
	},

	filterType: {
		label: 'Filter Type',
		type: 'select',
		options: [
			{ value: 'lowpass', label: 'Lowpass' },
			{ value: 'highpass', label: 'Highpass' },
			{ value: 'bandpass', label: 'Bandpass' },
			{ value: 'allpass', label: 'Allpass' }
		],
		defaultValue: 'lowpass',
		category: 'filter',
		audioNode: 'filter.type',
		serialize: true,
		ui: true
	},
	resonance: {
		label: 'Resonance',
		type: 'range',
		min: CONSTANTS.RESONANCE_MIN,
		max: CONSTANTS.RESONANCE_MAX,
		step: CONSTANTS.RESONANCE_STEP,
		defaultValue: 1,
		unit: ' Q',
		category: 'filter',
		audioNode: 'filter.Q',
		serialize: true,
		ui: true
	},

	harmonicity: {
		label: 'Harmonicity',
		type: 'range',
		min: CONSTANTS.HARMONICITY_MIN,
		max: CONSTANTS.HARMONICITY_MAX,
		step: CONSTANTS.HARMONICITY_STEP,
		defaultValue: 1,
		unit: '',
		category: 'modulation',
		audioNode: 'modulator.harmonicity',
		serialize: true,
		ui: true
	},
	modIndex: {
		label: 'Mod Index',
		type: 'range',
		min: CONSTANTS.MOD_INDEX_MIN,
		max: CONSTANTS.MOD_INDEX_MAX,
		step: 1,
		defaultValue: 10,
		unit: '',
		category: 'modulation',
		audioNode: 'modulator.modulationIndex',
		serialize: true,
		ui: true
	},
	modWaveform: {
		label: 'Mod Waveform',
		type: 'select',
		options: [
			{ value: 'sine', label: 'Sine' },
			{ value: 'square', label: 'Square' },
			{ value: 'sawtooth', label: 'Sawtooth' },
			{ value: 'triangle', label: 'Triangle' }
		],
		defaultValue: 'square',
		category: 'modulation',
		audioNode: 'modulator.type',
		serialize: true,
		ui: true
	},
	modAttack: {
		label: 'Mod Attack',
		type: 'range',
		min: 0.01,
		max: 2,
		step: 0.01,
		defaultValue: 0.5,
		unit: ' s',
		category: 'modulation',
		audioNode: 'modulator.envelope.attack',
		serialize: true,
		ui: true
	},
	modRelease: {
		label: 'Mod Release',
		type: 'range',
		min: 0,
		max: 2,
		step: 0.01,
		defaultValue: 0.5,
		unit: ' s',
		category: 'modulation',
		audioNode: 'modulator.envelope.release',
		serialize: true,
		ui: true
	},

	count: {
		label: 'Voice Count',
		type: 'range',
		min: 1,
		max: 10,
		step: 1,
		defaultValue: 3,
		unit: '',
		category: 'oscillator',
		audioNode: 'oscillator.count',
		serialize: true,
		ui: true
	},
	spread: {
		label: 'Spread',
		type: 'range',
		min: 0,
		max: 100,
		step: 1,
		defaultValue: 20,
		unit: ' cents',
		category: 'oscillator',
		audioNode: 'oscillator.spread',
		serialize: true,
		ui: true
	},

	speed: {
		label: 'Speed',
		type: 'range',
		min: 0.1,
		max: 4,
		step: 0.1,
		defaultValue: 1.0,
		unit: '',
		category: 'playback',
		audioNode: 'buffer.playbackRate',
		serialize: true,
		ui: true
	},
	speedLockScale: {
		label: 'Lock to User Speed',
		type: 'range',
		min: 0,
		max: 1,
		step: 0.01,
		defaultValue: 0,
		unit: '',
		category: 'motion',
		serialize: true,
		ui: true
	},
	speedLockReference: {
		label: 'Reference Speed',
		type: 'range',
		min: 0.5,
		max: 15,
		step: 0.1,
		defaultValue: 1.4,
		unit: ' m/s',
		category: 'motion',
		serialize: true,
		ui: true
	},
	loop: {
		label: 'Loop',
		type: 'checkbox',
		defaultValue: false,
		category: 'playback',
		audioNode: 'buffer.loop',
		serialize: true,
		ui: true
	},
	loopStart: {
		label: 'Loop Start',
		type: 'range',
		min: 0,
		max: 10,
		step: 0.01,
		display: v => `${v.toFixed(2)}s`,
		defaultValue: 0,
		unit: ' s',
		category: 'playback',
		serialize: true,
		ui: true,
		dynamicMax: true
	},
	loopEnd: {
		label: 'Loop End',
		type: 'range',
		min: 0,
		max: 10,
		step: 0.01,
		display: v => `${v.toFixed(2)}s`,
		defaultValue: 0,
		unit: ' s',
		category: 'playback',
		serialize: true,
		ui: true,
		dynamicMax: true
	},
	reverse: {
		label: 'Reverse',
		type: 'checkbox',
		defaultValue: false,
		category: 'playback',
		serialize: true,
		ui: true
	},
	speedAdvance: {
		label: 'Advance only on Move',
		type: 'checkbox',
		defaultValue: false,
		category: 'motion',
		serialize: true,
		ui: true
	},
	speedAdvanceThreshold: {
		label: 'Move Trigger',
		type: 'range',
		min: 0.1,
		max: 5,
		step: 0.1,
		defaultValue: 0.2,
		unit: ' m/s',
		category: 'motion',
		serialize: true,
		ui: true
	},
	resumePlayback: {
		label: 'Resume on Re-enter',
		type: 'checkbox',
		defaultValue: false,
		category: 'motion',
		serialize: true,
		ui: true
	},
	fadeIn: {
		label: 'Fade In',
		type: 'range',
		min: 0,
		max: 5,
		step: 0.1,
		defaultValue: 0,
		unit: ' s',
		category: 'playback',
		serialize: true,
		ui: true,
		dynamicMax: true
	},
	fadeOut: {
		label: 'Fade Out',
		type: 'range',
		min: 0,
		max: 5,
		step: 0.1,
		defaultValue: 0,
		unit: ' s',
		category: 'playback',
		serialize: true,
		ui: true,
		dynamicMax: true
	},

	loopFadeIn: {
		label: 'Loop Fade In',
		type: 'range',
		min: 0.01,
		max: 2,
		step: 0.01,
		defaultValue: 0.01,
		unit: ' s',
		category: 'playback',
		serialize: true,
		ui: true
	},
	loopFadeOut: {
		label: 'Loop Fade Out',
		type: 'range',
		min: 0.01,
		max: 2,
		step: 0.01,
		defaultValue: 0.01,
		unit: ' s',
		category: 'playback',
		serialize: true,
		ui: true
	},
	playbackMode: {
		label: 'Playback Mode',
		type: 'select',
		options: [
			{ value: 'resample', label: 'Resample (Pitch Shift)' },
			{ value: 'granular', label: 'Granular (Time-Stretch)' }
		],
		defaultValue: 'resample',
		category: 'motion',
		serialize: true,
		ui: true
	},
	timeStretchMode: {
		label: 'Time-Stretch Mode',
		type: 'select',
		options: [
			{ value: 'adaptive', label: 'Adaptive' },
			{ value: 'manual', label: 'Manual' }
		],
		defaultValue: 'adaptive',
		category: 'motion',
		serialize: true,
		ui: true
	},
	grainSize: {
		label: 'Grain Size',
		type: 'range',
		min: 0.01,
		max: 0.5,
		step: 0.005,
		defaultValue: 0.1,
		unit: ' s',
		category: 'motion',
		serialize: true,
		ui: true
	},
	overlap: {
		label: 'Overlap',
		type: 'range',
		min: 0.01,
		max: 0.2,
		step: 0.005,
		defaultValue: 0.05,
		unit: ' s',
		category: 'motion',
		serialize: true,
		ui: true
	},
	grainDetune: {
		label: 'Pitch Shift',
		type: 'range',
		min: -2400,
		max: 2400,
		step: 10,
		defaultValue: 0,
		unit: ' cents',
		category: 'motion',
		serialize: true,
		ui: true,
		allowNegativeMin: true
	},
	streamUrl: {
		label: 'Stream URL',
		type: 'text',
		defaultValue: '',
		category: 'stream',
		serialize: true,
		ui: true
	},
	volume: {
		label: 'Volume',
		type: 'range',
		min: CONSTANTS.VOLUME_MIN,
		max: CONSTANTS.VOLUME_MAX,
		step: CONSTANTS.VOLUME_STEP,
		defaultValue: 0.8,
		unit: '',
		category: 'common',
		audioNode: 'gain.gain',
		serialize: true,
		ui: true
	},
	pan: {
		label: 'Pan',
		type: 'range',
		min: CONSTANTS.PAN_MIN,
		max: CONSTANTS.PAN_MAX,
		step: CONSTANTS.PAN_STEP,
		defaultValue: 0,
		unit: '',
		category: 'common',
		audioNode: 'panner.pan',
		serialize: true,
		ui: true,
		allowNegativeMin: true
	},
	curveStrength: {
		label: 'Curve Strength',
		type: 'range',
		min: 0,
		max: 1,
		step: 0.01,
		defaultValue: 1.0,
		unit: '',
		category: 'common',
		serialize: true,
		ui: true
	},
	releaseMode: {
		label: 'Release Mode',
		type: 'select',
		options: [
			{ value: 'stop', label: 'Stop' },
			{ value: 'release', label: 'Release' }
		],
		defaultValue: 'stop',
		category: 'common',
		serialize: true,
		ui: true
	},

	polyphony: {
		label: 'Polyphony',
		type: 'range',
		min: 1,
		max: 16,
		step: 1,
		defaultValue: 1,
		unit: ' voices',
		category: 'common',
		serialize: true,
		ui: true
	},

	gamma: {
		label: 'Gamma',
		type: 'range',
		min: 0.1,
		max: 4.0,
		step: 0.1,
		defaultValue: 1.0,
		unit: '',
		category: 'spatial',
		serialize: true,
		ui: true
	},
	edgeMargin: {
		label: 'Edge Margin',
		type: 'range',
		min: 0,
		max: 100,
		step: 1,
		defaultValue: 0,
		unit: ' m',
		category: 'spatial',
		serialize: true,
		ui: true
	},
	minRadius: {
		label: 'Min Radius',
		type: 'range',
		min: 0,
		max: 100,
		step: 1,
		defaultValue: 0,
		unit: ' m',
		category: 'spatial',
		serialize: true,
		ui: true
	},
	speedGateMin: {
		label: 'Speed Gate Min',
		type: 'range',
		min: 0,
		max: 10,
		step: 0.1,
		defaultValue: 0,
		unit: ' m/s',
		category: 'spatial',
		serialize: true,
		ui: false
	},
	speedGateMax: {
		label: 'Speed Gate Max',
		type: 'range',
		min: 0,
		max: 10,
		step: 0.1,
		defaultValue: 10,
		unit: ' m/s',
		category: 'spatial',
		serialize: true,
		ui: false
	},
	speedGateHold: {
		label: 'Speed Gate Hold',
		type: 'range',
		min: 0,
		max: 10,
		step: 0.1,
		defaultValue: 0,
		unit: ' s',
		category: 'spatial',
		serialize: true,
		ui: false
	},

	selectedNotes: {
		label: 'Selected Notes',
		type: 'custom',
		defaultValue: [60],
		category: 'keyboard',
		serialize: true,
		ui: false
	},
	keyboardOctave: {
		label: 'Octave',
		type: 'number',
		defaultValue: 4,
		min: 0,
		max: 8,
		category: 'keyboard',
		serialize: true,
		ui: false
	},
	samplerMode: {
		label: 'Sampler Mode',
		type: 'select',
		options: [
			{ value: 'single', label: 'Single' },
			{ value: 'grid', label: 'Grid' }
		],
		defaultValue: 'single',
		category: 'sampler',
		serialize: true,
		ui: false
	},

	gridSamples: {
		label: 'Grid Samples',
		type: 'custom',
		defaultValue: {},
		category: 'sampler',
		serialize: true,
		ui: false
	},
	partialCount: {
		label: 'Partial Count',
		type: 'range',
		min: 1,
		max: 32,
		step: 1,
		defaultValue: 1,
		unit: '',
		category: 'oscillator',
		serialize: true,
		ui: true
	},
	partialCurve: {
		label: 'Partial Curve',
		type: 'range',
		min: -2,
		max: 2,
		step: 0.1,
		defaultValue: -0.5,
		unit: '',
		category: 'oscillator',
		serialize: true,
		ui: true,
		allowNegativeMin: true,
		formatDisplay: (val) => {
			if (val < -0.1) return 'Inverse';
			if (val > 0.1) return 'Flat→';
			return 'Semi-Inv';
		}
	},
	modPartialCount: {
		label: 'Mod Partial Count',
		type: 'range',
		min: 1,
		max: 32,
		step: 1,
		defaultValue: 1,
		unit: '',
		category: 'modulation',
		serialize: true,
		ui: true
	},
	modPartialCurve: {
		label: 'Mod Partial Curve',
		type: 'range',
		min: -2,
		max: 2,
		step: 0.1,
		defaultValue: -0.5,
		unit: '',
		category: 'modulation',
		serialize: true,
		ui: true,
		allowNegativeMin: true,
		formatDisplay: (val) => {
			if (val < -0.1) return 'Inverse';
			if (val > 0.1) return 'Flat→';
			return 'Semi-Inv';
		}
	},

	...generateLFOParams('x', 'lfo'),
	...generateLFOParams('y', 'lfo'),
	...generateLFOParams('size', 'lfo'),
	...generateModParams('mod1', 'lfo'),
	...generateModParams('mod2', 'lfo'),
	...generateModParams('mod3', 'lfo'),
	...generateModParams('fxMod1', 'lfo'),
	...generateModParams('fxMod2', 'lfo'),
	...generateModParams('fxMod3', 'lfo'),

	layerGain: {
		label: 'Layer Volume',
		type: 'range',
		min: 0,
		max: 2,
		step: 0.01,
		defaultValue: CONSTANTS.DEFAULT_LAYER_GAIN,
		unit: '%',
		category: 'layer',
		serialize: true,
		ui: true,
		formatDisplay: (value) => (value * 100).toFixed(0) + '%'
	},

	...generateFXParams(),
	...generateEQParams()
};
