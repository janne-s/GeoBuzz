import { CONSTANTS } from '../core/constants.js';
import { deepClone } from '../core/utils/math.js';

export const DEFAULT_LFO_STRUCTURE = {
	x: { freq: 0, range: 0, maxRange: 200 },
	y: { freq: 0, range: 0, maxRange: 200 },
	size: { freq: 0, range: 0, maxRange: 200 },
	mod1: { target: "pitch", freq: 0, range: 0, source: "lfo", waveform: "sine", referenceSpeed: 1.4, instabilityReactivity: 0.5, state: {} },
	mod2: { target: "filterFreq", freq: 0, range: 0, source: "lfo", waveform: "sine", referenceSpeed: 1.4, instabilityReactivity: 0.5, state: {} },
	mod3: { target: "volume", freq: 0, range: 0, source: "lfo", waveform: "sine", referenceSpeed: 1.4, instabilityReactivity: 0.5, state: {} },
	fxMod1: { target: "none", freq: 0, range: 0, source: "lfo", waveform: "sine", referenceSpeed: 1.4, instabilityReactivity: 0.5, state: {} },
	fxMod2: { target: "none", freq: 0, range: 0, source: "lfo", waveform: "sine", referenceSpeed: 1.4, instabilityReactivity: 0.5, state: {} },
	fxMod3: { target: "none", freq: 0, range: 0, source: "lfo", waveform: "sine", referenceSpeed: 1.4, instabilityReactivity: 0.5, state: {} }
};

export const DEFAULT_FX_STRUCTURE = {
	slot1: { type: "none", params: {}, mix: 50 },
	slot2: { type: "none", params: {}, mix: 50 },
	slot3: { type: "none", params: {}, mix: 50 }
};

export const DEFAULT_EQ_STRUCTURE = deepClone(CONSTANTS.DEFAULT_EQ_VALUES);

export const DEFAULT_SEQUENCER_CONFIG = {
	numSteps: CONSTANTS.SEQUENCER_DEFAULT_STEPS,
	stepLength: CONSTANTS.SEQUENCER_DEFAULT_LENGTH,
	speedThreshold: CONSTANTS.SEQUENCER_SPEED_THRESHOLD,
	releaseOnStop: true,
	loop: true,
	resumeOnReenter: false,
	restartOnReenter: false
};

export const DEFAULT_CONTROL_PATH_CONFIG = {
	type: 'line',
	color: null,
	smoothing: 0,
	params: {
		gain: { enabled: false, curve: [], interpolation: 'linear' },
		volume: { enabled: false, curve: [], interpolation: 'linear' },
		pan: { enabled: false, curve: [], interpolation: 'linear' },
		filterFreq: { enabled: false, curve: [], interpolation: 'linear' },
		echo: { enabled: false },
		silencer: { enabled: false }
	}
};

export const DEFAULT_MARKER_CONFIG = {
	iconSize: CONSTANTS.SOUND_ICON_SIZE,
	iconAnchor: CONSTANTS.SOUND_ICON_ANCHOR,
	draggable: true
};
