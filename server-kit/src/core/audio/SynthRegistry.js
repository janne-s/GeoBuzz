import { CONSTANTS } from '../constants.js';
import { Selectors } from '../state/selectors.js';
import { AudioNodeManager } from './AudioNodeManager.js';
import { deepClone } from '../utils/math.js';
import { DEFAULT_LFO_STRUCTURE, DEFAULT_FX_STRUCTURE, DEFAULT_EQ_STRUCTURE } from '../../config/defaults.js';
import { FXParamSets } from '../../config/registries.js';
import { PARAMETER_REGISTRY } from '../../config/parameterRegistry.js';

export function getBaseWaveformPartials(waveform, partialCount) {
	const partials = [];

	if (waveform === 'sine') {
		partials.push(1);
		for (let i = 2; i <= partialCount; i++) partials.push(0);
	} else if (waveform === 'square') {
		for (let i = 1; i <= partialCount; i++) {
			partials.push(i % 2 === 1 ? 1 / i : 0);
		}
	} else if (waveform === 'sawtooth') {
		for (let i = 1; i <= partialCount; i++) {
			partials.push(1 / i);
		}
	} else if (waveform === 'triangle') {
		for (let i = 1; i <= partialCount; i++) {
			partials.push(i % 2 === 1 ? Math.pow(-1, (i - 1) / 2) / (i * i) : 0);
		}
	} else {
		for (let i = 1; i <= partialCount; i++) partials.push(i === 1 ? 1 : 0);
	}

	return partials;
}

export function calculatePartials(count, curve, baseWaveform = null) {
	if (count === 1) {
		return baseWaveform ? getBaseWaveformPartials(baseWaveform, 1) : [1];
	}

	const base = baseWaveform ? getBaseWaveformPartials(baseWaveform, count) : new Array(count).fill(0);
	base[0] = 1;

	for (let i = 2; i <= count; i++) {
		let amplitude;
		if (curve === 0) {
			amplitude = 1 / i;
		} else if (curve > 0) {
			const flatWeight = Math.min(curve, 1);
			amplitude = (1 - flatWeight) * (1 / i) + flatWeight;
		} else {
			const invPower = 1 + Math.abs(curve);
			amplitude = 1 / Math.pow(i, invPower);
		}
		base[i - 1] += amplitude;
	}

	return base;
}

export function createOscillatorConfig(params, waveformDefault = "sine") {
	const waveform = params.waveform || waveformDefault;
	const partialCount = params.partialCount || 1;
	const partialCurve = params.partialCurve ?? -0.5;

	const partials = calculatePartials(partialCount, partialCurve, partialCount > 1 ? waveform : null);
	const oscillatorType = partialCount > 1 ? 'custom' : waveform;

	const config = {
		type: oscillatorType,
		width: params.pulseWidth || 0.5,
		detune: params.detune || 0
	};

	if (partialCount > 1) config.partials = partials;

	return config;
}

export function createModulationConfig(params, waveformDefault = "square") {
	const modWaveform = params.modWaveform || waveformDefault;
	const modPartialCount = params.modPartialCount || 1;
	const modPartialCurve = params.modPartialCurve ?? -0.5;

	const modPartials = calculatePartials(modPartialCount, modPartialCurve, modPartialCount > 1 ? modWaveform : null);
	const modType = modPartialCount > 1 ? 'custom' : modWaveform;

	const config = { type: modType };
	if (modPartialCount > 1) config.partials = modPartials;

	return config;
}

const VALID_FAT_WAVEFORMS = ['sine', 'square', 'sawtooth', 'triangle'];

function sanitizeFatWaveform(waveform) {
	return VALID_FAT_WAVEFORMS.includes(waveform) ? waveform : 'sawtooth';
}

const SynthTemplates = {
	basic: {
		categories: ['oscillator', 'envelope', 'filter'],
		icon: 'fa-wave-square'
	},
	modulated: {
		categories: ['oscillator', 'envelope', 'modulation', 'filter'],
		icon: 'fa-broadcast-tower'
	},
	sample: {
		categories: ['playback'],
		isSampleBased: true,
		icon: 'fa-file-audio'
	}
};

export const SYNTH_REGISTRY = {
	Synth: {
		label: "Basic Synth",
		...SynthTemplates.basic,
		supportsPolyphony: true,
		factory: (params) => {
			const baseOptions = {
				oscillator: createOscillatorConfig(params),
				envelope: AudioNodeManager.getEnvelopeParams(params),
				portamento: params.portamento || 0,
				volume: CONSTANTS.DEFAULT_SYNTH_VOLUME_DB
			};
			if (params.polyphony > 1) {
				return new Tone.PolySynth(Tone.Synth, {
					...baseOptions,
					maxPolyphony: params.polyphony
				});
			}
			return new Tone.Synth(baseOptions);
		},
		parameters: ['pitch', 'frequency', 'waveform', 'pulseWidth', 'detune', 'portamento', 'partialCount', 'partialCurve', 'attack', 'decay', 'sustain', 'release', 'filterFreq', 'filterType', 'resonance', 'pan', 'polyphony', 'speedGate']
	},

	AMSynth: {
		label: "AM Synth",
		...SynthTemplates.modulated,
		icon: 'fa-satellite-dish',
		supportsPolyphony: true,
		factory: (params) => {
			const baseOptions = {
				oscillator: createOscillatorConfig(params),
				envelope: AudioNodeManager.getEnvelopeParams(params),
				modulation: createModulationConfig(params),
				harmonicity: params.harmonicity || 1,
				modulationEnvelope: AudioNodeManager.getModulationEnvelopeParams(params),
				portamento: params.portamento || 0,
				volume: CONSTANTS.DEFAULT_SYNTH_VOLUME_DB
			};
			if (params.polyphony > 1) {
				return new Tone.PolySynth(Tone.AMSynth, {
					...baseOptions,
					maxPolyphony: params.polyphony
				});
			}
			return new Tone.AMSynth(baseOptions);
		},
		parameters: ['pitch', 'frequency', 'waveform', 'pulseWidth', 'modWaveform', 'harmonicity',
			'detune', 'portamento', 'partialCount', 'partialCurve', 'modPartialCount', 'modPartialCurve', 'attack', 'decay', 'sustain', 'release', 'modAttack', 'modRelease', 'filterFreq', 'filterType', 'resonance', 'pan', 'polyphony', 'speedGate'
		]
	},

	FMSynth: {
		label: "FM Synth",
		...SynthTemplates.modulated,
		supportsPolyphony: true,
		factory: (params) => {
			const baseOptions = {
				oscillator: createOscillatorConfig(params),
				envelope: AudioNodeManager.getEnvelopeParams(params),
				modulation: createModulationConfig(params),
				modulationIndex: params.modIndex || 10,
				harmonicity: params.harmonicity || 1,
				modulationEnvelope: AudioNodeManager.getModulationEnvelopeParams(params),
				portamento: params.portamento || 0,
				volume: CONSTANTS.DEFAULT_SYNTH_VOLUME_DB
			};
			if (params.polyphony > 1) {
				return new Tone.PolySynth(Tone.FMSynth, {
					...baseOptions,
					maxPolyphony: params.polyphony
				});
			}
			return new Tone.FMSynth(baseOptions);
		},
		parameters: ['pitch', 'frequency', 'waveform', 'pulseWidth', 'modWaveform', 'modIndex', 'harmonicity', 'detune', 'portamento', 'partialCount', 'partialCurve', 'modPartialCount', 'modPartialCurve', 'attack', 'decay', 'sustain', 'release', 'modAttack', 'modRelease', 'filterFreq', 'filterType', 'resonance', 'pan', 'polyphony', 'speedGate']
	},

	FatOscillator: {
		label: "Fat Oscillator",
		...SynthTemplates.basic,
		icon: 'fa-layer-group',
		supportsPolyphony: true,
		factory: (params) => {
			const waveform = sanitizeFatWaveform(params.waveform || 'sawtooth');
			const baseOptions = {
				oscillator: {
					type: 'fat' + waveform,
					count: params.count || 3,
					spread: params.spread || 20,
					width: params.pulseWidth || 0.5,
					detune: params.detune || 0
				},
				envelope: AudioNodeManager.getEnvelopeParams(params),
				portamento: params.portamento || 0,
				volume: CONSTANTS.DEFAULT_SYNTH_VOLUME_DB
			};
			if (params.polyphony > 1) {
				return new Tone.PolySynth(Tone.Synth, {
					...baseOptions,
					maxPolyphony: params.polyphony
				});
			}
			return new Tone.Synth(baseOptions);
		},
		parameters: ['pitch', 'frequency', 'waveform', 'pulseWidth', 'count', 'spread',
			'detune', 'portamento', 'attack', 'decay', 'sustain', 'release',
			'filterFreq', 'filterType', 'resonance', 'pan', 'polyphony', 'speedGate'
		]
	},

	NoiseSynth: {
		label: "Noise Synth",
		...SynthTemplates.basic,
		icon: 'fa-water',
		supportsPolyphony: false,
		factory: (params) => {
			const baseOptions = {
				noise: { type: params.noiseType || 'white' },
				envelope: AudioNodeManager.getEnvelopeParams(params),
				volume: CONSTANTS.DEFAULT_SYNTH_VOLUME_DB
			};
			return new Tone.NoiseSynth(baseOptions);
		},
		parameters: ['noiseType', 'attack', 'decay', 'sustain', 'release',
			'filterFreq', 'filterType', 'resonance', 'pan', 'speedGate'
		]
	},

	SoundFile: {
		label: "Sound File",
		...SynthTemplates.sample,
		isStereo: true,
		factory: (params) => {
			if (params.playbackMode === 'granular') {
				return new Tone.GrainPlayer({
					loop: params.loop || false,
					playbackRate: params.speed || 1.0,
					grainSize: params.grainSize || 0.1,
					overlap: params.overlap || 0.05,
					detune: params.grainDetune || 0,
					reverse: params.reverse || false,
					volume: CONSTANTS.DEFAULT_SYNTH_VOLUME_DB
				});
			} else {
				return new Tone.Player({
					loop: params.loop || false,
					playbackRate: params.speed || 1.0,
					reverse: params.reverse || false,
					fadeIn: params.fadeIn || 0,
					fadeOut: params.fadeOut || 0.1,
					volume: CONSTANTS.DEFAULT_SYNTH_VOLUME_DB
				});
			}
		},
		parameters: [
			'speed', 'speedLockScale', 'speedLockReference', 'fadeIn', 'fadeOut', 'loop', 'loopStart', 'loopEnd', 'loopFadeIn', 'loopFadeOut', 'reverse', 'playbackMode', 'timeStretchMode', 'grainSize', 'overlap', 'grainDetune', 'speedAdvance', 'speedAdvanceThreshold', 'speedGate', 'filterFreq', 'filterType', 'resonance', 'pan', 'resumePlayback'
		]
	},

	StreamPlayer: {
		label: "Stream Player",
		...SynthTemplates.sample,
		icon: 'fa-broadcast-tower',
		isStreamBased: true,
		isStereo: true,
		factory: (params) => ({
			loaded: false,
			state: 'stopped',
			buffer: null,
			playbackRate: params.speed || 1.0,
			loop: false,
			volume: CONSTANTS.DEFAULT_SYNTH_VOLUME_DB,
			start: () => {},
			stop: () => {},
			dispose: () => {},
			triggerAttack: () => {},
			triggerRelease: () => {},
			connect: function() { return this; },
			toDestination: function() { return this; }
		}),
		parameters: ['streamUrl', 'fadeIn', 'fadeOut', 'pan', 'speedGate']
	},

	Sampler: {
		label: "Sampler",
		...SynthTemplates.sample,
		icon: 'fa-drum',
		supportsPolyphony: true,
		isStereo: true,
		factory: (params) => {
			const samplerConfig = {
				attack: params.attack || 0.05,
				release: params.release || 1,
				volume: CONSTANTS.DEFAULT_SYNTH_VOLUME_DB
			};

			if (params.samplerMode === 'grid' && params.gridSamples && Object.keys(params.gridSamples).length > 0) {
				const urls = {};
				Object.entries(params.gridSamples).forEach(([midiNote, data]) => {
					if (data && data.fileName) {
						const noteName = Tone.Frequency(parseInt(midiNote), 'midi').toNote();
						urls[noteName] = data.fileName.includes('/')
							? data.fileName
							: `workspaces/${Selectors.getWorkspaceId()}/sounds/${data.fileName}`;
					}
				});
				samplerConfig.urls = urls;

				samplerConfig.onload = () => {

				};
			} else {
				samplerConfig.urls = {};
			}

			const sampler = new Tone.Sampler(samplerConfig);
			sampler.maxPolyphony = params.polyphony || 4;
			return sampler;
		},
		parameters: ['attack', 'release', 'loop', 'filterFreq', 'filterType', 'resonance', 'pan', 'polyphony', 'speedGate', 'samplerMode', 'gridSamples', 'soundFile']
	}
};

export function getSynthCapabilities(synthType) {
	const def = SYNTH_REGISTRY[synthType];
	return def ? {
		hasOscillator: def.categories?.includes('oscillator') || false,
		hasFilter: def.categories?.includes('filter') || false,
		hasEnvelope: def.categories?.includes('envelope') || false,
		hasModulation: def.categories?.includes('modulation') || false,
		isSampleBased: def.isSampleBased || false
	} : {};
}

export function getParametersForSynth(synthType, role = 'sound') {
	const synthDef = SYNTH_REGISTRY[synthType];
	if (!synthDef) return [];

	let parameters = [...synthDef.parameters, 'volume', 'curveStrength'];

	if (role === 'modulator') {
		parameters = parameters.filter(p => !['volume', 'pitch', 'curveStrength'].includes(p));
	}

	return parameters;
}

export function getAvailableSynthTypes(role = 'sound') {
	return Object.entries(SYNTH_REGISTRY)
		.filter(([type, def]) => role !== 'modulator' || !def.audioOnly)
		.map(([type, def]) => ({ value: type, label: def.label }));
}

export function initializeSynthParameters(synthType, role, existingParams = {}) {
	const synthDef = SYNTH_REGISTRY[synthType];
	const defaultParams = { ...CONSTANTS.DEFAULT_SOUND };

	if (synthDef) {
		synthDef.parameters.forEach(param => {
			const def = PARAMETER_REGISTRY[param];
			if (def && defaultParams[param] === undefined) {
				defaultParams[param] = def.defaultValue !== undefined ? def.defaultValue :
					(def.min || (def.type === 'checkbox' ? false : 0));
			}
		});
	}

	if (synthType === "SoundFile" && defaultParams.speed === undefined) {
		defaultParams.speed = 1.0;
	}

	const result = {
		...defaultParams,
		...existingParams,
		lfo: existingParams.lfo || deepClone(DEFAULT_LFO_STRUCTURE),
		fx: existingParams.fx || deepClone(DEFAULT_FX_STRUCTURE),
		eq: existingParams.eq || deepClone(DEFAULT_EQ_STRUCTURE),
		originalValues: existingParams.originalValues || {}
	};

	if (!result.eq.low && result.eq.low !== 0) result.eq.low = CONSTANTS.DEFAULT_EQ_VALUES.low;
	if (!result.eq.mid && result.eq.mid !== 0) result.eq.mid = CONSTANTS.DEFAULT_EQ_VALUES.mid;
	if (!result.eq.high && result.eq.high !== 0) result.eq.high = CONSTANTS.DEFAULT_EQ_VALUES.high;
	if (!result.eq.lowFrequency) result.eq.lowFrequency = CONSTANTS.DEFAULT_EQ_VALUES.lowFrequency;
	if (!result.eq.highFrequency) result.eq.highFrequency = CONSTANTS.DEFAULT_EQ_VALUES.highFrequency;

	return result;
}

export const FX_REGISTRY = {
	AutoFilter: {
		label: "Auto Filter",
		parameters: ['fx_frequency', ...FXParamSets.filter, 'fx_depth'],
		needsStart: true,
		factory: (params) => {
			const fx = new Tone.AutoFilter({
				frequency: params.frequency || 1,
				baseFrequency: params.baseFrequency || 200,
				octaves: params.octaves || 2.6,
				depth: params.depth || 1
			});
			fx.start();
			return fx;
		}
	},

	AutoPanner: {
		label: "Auto Panner",
		parameters: FXParamSets.modulation,
		needsStart: true,
		factory: (params) => {
			const fx = new Tone.AutoPanner({
				frequency: params.frequency || 1,
				depth: params.depth || 1
			});
			fx.start();
			return fx;
		}
	},

	AutoWah: {
		label: "Auto Wah",
		parameters: [...FXParamSets.filter, 'fx_sensitivity', 'fx_Q'],
		factory: (params) => new Tone.AutoWah({
			baseFrequency: params.baseFrequency || 100,
			octaves: params.octaves || 6,
			sensitivity: params.sensitivity || 0,
			Q: params.Q || 2
		})
	},

	Chorus: {
		label: "Chorus",
		parameters: ['fx_frequency', 'fx_delayTime', 'fx_depth'],
		needsStart: true,
		factory: (params) => {
			const fx = new Tone.Chorus({
				frequency: params.frequency || 1.5,
				delayTime: params.delayTime || 3.5,
				depth: params.depth || 0.7,
				spread: params.spread || 180
			});
			fx.start();
			return fx;
		}
	},

	FeedbackDelay: {
		label: "Feedback Delay",
		parameters: FXParamSets.delay,
		factory: (params) => new Tone.FeedbackDelay({
			delayTime: params.delayTime || 0.25,
			feedback: params.feedback || 0.5
		})
	},

	Phaser: {
		label: "Phaser",
		parameters: ['fx_frequency', 'fx_octaves', 'fx_baseFrequency'],
		factory: (params) => new Tone.Phaser({
			frequency: params.frequency || 0.5,
			octaves: params.octaves || 3,
			baseFrequency: params.baseFrequency || 350
		})
	},

	PingPongDelay: {
		label: "Ping Pong Delay",
		parameters: FXParamSets.delay,
		factory: (params) => new Tone.PingPongDelay({
			delayTime: params.delayTime || 0.25,
			feedback: params.feedback || 0.5
		})
	},

	Reverb: {
		label: "Reverb",
		parameters: ['fx_decay', 'fx_preDelay'],
		factory: (params) => new Tone.Reverb({
			decay: params.decay || 1.5,
			preDelay: params.preDelay || 0.01
		})
	},

	Tremolo: {
		label: "Tremolo",
		parameters: FXParamSets.modulation,
		needsStart: true,
		factory: (params) => {
			const fx = new Tone.Tremolo({
				frequency: params.frequency || 10,
				depth: params.depth || 0.5
			});
			fx.start();
			return fx;
		}
	}
};

export function getAvailableFXTypes() {
	return [
		{ value: 'none', label: 'None' },
		...Object.entries(FX_REGISTRY)
			.map(([type, def]) => ({ value: type, label: def.label }))
	];
}

export function getAvailableFXModulationTargets(fxConfig) {
	const targets = [{ value: 'none', label: 'None' }];

	if (!fxConfig) return targets;

	['slot1', 'slot2', 'slot3'].forEach(slotKey => {
		const slot = fxConfig[slotKey];
		if (slot && slot.type !== 'none') {
			const fxDef = FX_REGISTRY[slot.type];
			if (fxDef && fxDef.parameters) {
				// Add mix parameter first
				targets.push({
					value: `${slotKey}.mix`,
					label: `${fxDef.label} (${slotKey}) - Mix`
				});

				// Add each effect parameter
				fxDef.parameters.forEach(param => {
					// Remove 'fx_' prefix and normalize parameter name
					const cleanParam = param.replace('fx_', '').replace('_long', '');
					// Capitalize first letter for label
					const paramLabel = cleanParam.charAt(0).toUpperCase() + cleanParam.slice(1);
					targets.push({
						value: `${slotKey}.${cleanParam}`,
						label: `${fxDef.label} (${slotKey}) - ${paramLabel}`
					});
				});
			}
		}
	});

	return targets;
}
