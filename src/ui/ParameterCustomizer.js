import { PARAMETER_REGISTRY } from '../config/parameterRegistry.js';
import { getParameterMeta, setCustomRange, resetParameter, resetAllParameters, validateRange } from '../config/ParameterRangeManager.js';
import { Selectors } from '../core/state/selectors.js';
import { debounce } from '../core/utils/debounce.js';
import { AppState } from '../core/state/StateManager.js';
import { ActionTypes } from '../core/state/actions.js';

const CATEGORY_ORDER = [
	'oscillator',
	'envelope',
	'filter',
	'modulation',
	'lfo',
	'spatial',
	'playback',
	'motion',
	'effect',
	'common'
];

const CATEGORY_LABELS = {
	oscillator: 'Oscillator',
	envelope: 'Envelope',
	filter: 'Filter',
	modulation: 'Modulation',
	lfo: 'LFO',
	spatial: 'Spatial',
	playback: 'Playback',
	motion: 'Motion',
	effect: 'Effects',
	common: 'Common'
};

const EFFECT_SUBCATEGORIES = {
	'fx_eq': 'EQ',
	'fx_delayTime': 'Delay/Echo',
	'fx_feedback': 'Delay/Echo',
	'fx_decay': 'Reverb',
	'fx_preDelay': 'Reverb',
	'fx_frequency': 'Modulation',
	'fx_depth': 'Modulation',
	'fx_baseFrequency': 'Filter',
	'fx_octaves': 'Filter',
	'fx_Q': 'Filter',
	'fx_sensitivity': 'Filter',
	'fx_mix': 'General'
};

const LFO_SUBCATEGORIES = {
	'lfo_x_': 'Position Modulation',
	'lfo_y_': 'Position Modulation',
	'lfo_size_': 'Position Modulation',
	'lfo_mod1_': 'Sound Parameter Modulation',
	'lfo_mod2_': 'Sound Parameter Modulation',
	'lfo_mod3_': 'Sound Parameter Modulation',
	'lfo_fxMod1_': 'Effect Parameter Modulation',
	'lfo_fxMod2_': 'Effect Parameter Modulation',
	'lfo_fxMod3_': 'Effect Parameter Modulation'
};

const PARAMETER_DESCRIPTIONS = {
	pitch: 'MIDI note number that determines the fundamental frequency',
	frequency: 'Direct frequency control in Hertz, alternative to pitch control',
	detune: 'Fine-tuning adjustment in cents (100 cents = 1 semitone)',
	portamento: 'Glide time between pitch changes for smooth transitions',
	pulseWidth: 'Pulse wave duty cycle, affects timbre when using pulse or PWM waveform',
	count: 'Number of detuned oscillator voices for a richer, chorus-like sound',
	spread: 'Detuning amount between voices in cents when count > 1',
	partialCount: 'Number of harmonic partials for additive synthesis',
	partialCurve: 'Distribution shape of harmonic partials (inverse, semi-inverse, or flat)',

	attack: 'Time for sound to reach full volume after trigger',
	decay: 'Time to fall from peak to sustain level',
	sustain: 'Volume level maintained while sound is held',
	release: 'Time for sound to fade out after release',

	filterFreq: 'Cutoff frequency for the filter in Hertz',
	resonance: 'Filter emphasis at cutoff frequency (Q factor)',

	harmonicity: 'Frequency ratio between carrier and modulator for FM synthesis',
	modIndex: 'FM modulation intensity, affects timbral complexity',
	modAttack: 'Attack time for FM modulator envelope',
	modRelease: 'Release time for FM modulator envelope',
	modPartialCount: 'Number of harmonic partials for FM modulator',
	modPartialCurve: 'Distribution shape of modulator harmonic partials',

	speed: 'Playback rate multiplier for sample-based sounds',
	speedLockScale: 'Blend amount between fixed and movement-based playback rate (0 = fixed, 1 = fully locked)',
	speedLockReference: 'User movement speed that corresponds to 1x playback rate',
	speedAdvance: 'When enabled, playback only advances when user is moving',
	speedAdvanceThreshold: 'Minimum movement speed required to advance playback',
	resumePlayback: 'Continue playback from last position when re-entering zone',
	grainSize: 'Duration of each grain in granular time-stretching mode',
	overlap: 'Grain overlap time for smooth granular synthesis',
	grainDetune: 'Pitch shift in cents when using granular playback mode',
	loopStart: 'Starting point for loop region in seconds',
	loopEnd: 'Ending point for loop region in seconds',
	fadeIn: 'Fade-in duration when sound starts playing',
	fadeOut: 'Fade-out duration when sound stops playing',
	loopFadeIn: 'Crossfade duration at loop start point',
	loopFadeOut: 'Crossfade duration at loop end point',

	lfo_x_range: 'Maximum distance the element can move horizontally from its center',
	lfo_x_freq: 'Speed of horizontal position oscillation in cycles per second',
	lfo_x_maxRange: 'Upper limit for horizontal movement range',
	lfo_y_range: 'Maximum distance the element can move vertically from its center',
	lfo_y_freq: 'Speed of vertical position oscillation in cycles per second',
	lfo_y_maxRange: 'Upper limit for vertical movement range',
	lfo_size_range: 'Maximum distance the element can move in depth from its center',
	lfo_size_freq: 'Speed of depth position oscillation in cycles per second',
	lfo_size_maxRange: 'Upper limit for depth movement range',

	lfo_mod1_range: 'Modulation depth as percentage for first parameter slot',
	lfo_mod1_freq: 'Modulation speed in cycles per second for first parameter',
	lfo_mod1_referenceSpeed: 'User movement speed for 100% modulation depth on first parameter',
	lfo_mod1_speedThreshold: 'Minimum movement speed to activate first parameter modulation',
	lfo_mod2_range: 'Modulation depth as percentage for second parameter slot',
	lfo_mod2_freq: 'Modulation speed in cycles per second for second parameter',
	lfo_mod2_referenceSpeed: 'User movement speed for 100% modulation depth on second parameter',
	lfo_mod2_speedThreshold: 'Minimum movement speed to activate second parameter modulation',
	lfo_mod3_range: 'Modulation depth as percentage for third parameter slot',
	lfo_mod3_freq: 'Modulation speed in cycles per second for third parameter',
	lfo_mod3_referenceSpeed: 'User movement speed for 100% modulation depth on third parameter',
	lfo_mod3_speedThreshold: 'Minimum movement speed to activate third parameter modulation',

	lfo_fxMod1_range: 'Modulation depth as percentage for first effect parameter slot',
	lfo_fxMod1_freq: 'Modulation speed in cycles per second for first effect parameter',
	lfo_fxMod1_referenceSpeed: 'User movement speed for 100% modulation on first effect parameter',
	lfo_fxMod1_speedThreshold: 'Minimum movement speed to activate first effect modulation',
	lfo_fxMod2_range: 'Modulation depth as percentage for second effect parameter slot',
	lfo_fxMod2_freq: 'Modulation speed in cycles per second for second effect parameter',
	lfo_fxMod2_referenceSpeed: 'User movement speed for 100% modulation on second effect parameter',
	lfo_fxMod2_speedThreshold: 'Minimum movement speed to activate second effect modulation',
	lfo_fxMod3_range: 'Modulation depth as percentage for third effect parameter slot',
	lfo_fxMod3_freq: 'Modulation speed in cycles per second for third effect parameter',
	lfo_fxMod3_referenceSpeed: 'User movement speed for 100% modulation on third effect parameter',
	lfo_fxMod3_speedThreshold: 'Minimum movement speed to activate third effect modulation',

	gamma: 'Volume falloff curve with distance (higher = steeper falloff)',
	edgeMargin: 'Distance from zone edge where volume starts fading out',
	minRadius: 'Inner radius where volume reaches maximum before falloff begins',
	speedGate: 'Minimum movement speed required for sound to play',

	fx_eq_low: 'Low frequency band gain in decibels (below low/mid crossover)',
	fx_eq_mid: 'Mid frequency band gain in decibels (between crossovers)',
	fx_eq_high: 'High frequency band gain in decibels (above mid/high crossover)',
	fx_eq_lowFreq: 'Crossover frequency between low and mid bands',
	fx_eq_highFreq: 'Crossover frequency between mid and high bands',

	fx_delayTime: 'Short delay time in milliseconds for slapback and comb effects',
	fx_delayTime_long: 'Longer delay time in seconds for echo effects',
	fx_feedback: 'Amount of delayed signal fed back to create repeating echoes',

	fx_decay: 'Reverb tail length in seconds before complete fadeout',
	fx_preDelay: 'Time before reverb onset, simulates room size perception',

	fx_frequency: 'LFO rate for modulation effects like chorus, flanger, phaser',
	fx_depth: 'Intensity of modulation effect, from subtle to extreme',
	fx_baseFrequency: 'Center frequency for auto-wah and filter modulation effects',
	fx_octaves: 'Filter sweep range in octaves for envelope follower effects',
	fx_Q: 'Filter resonance for auto-wah and swept filter effects',
	fx_sensitivity: 'Input threshold for envelope follower and dynamic effects',
	fx_mix: 'Dry/wet balance between original and processed signal',

	volume: 'Overall output level for this sound element',
	pan: 'Stereo position from full left (-1) to full right (1)',
	curveStrength: 'Intensity of volume curve along path (0 = flat, 1 = full curve)',
	polyphony: 'Maximum simultaneous voices for this element'
};

function getEffectSubcategory(paramKey) {
	for (const [prefix, subcategory] of Object.entries(EFFECT_SUBCATEGORIES)) {
		if (paramKey.startsWith(prefix)) {
			return subcategory;
		}
	}
	return 'Other';
}

function getLFOSubcategory(paramKey) {
	for (const [prefix, subcategory] of Object.entries(LFO_SUBCATEGORIES)) {
		if (paramKey.startsWith(prefix)) {
			return subcategory;
		}
	}
	return null;
}

export class ParameterCustomizer {
	constructor() {
		this.overlay = null;
		this.modal = null;
		this.searchQuery = '';
		this.showOnlyCustomized = false;
		this.collapsedCategories = new Set(CATEGORY_ORDER);
		this.debouncedHandlers = new Map();
		this.unsubscribe = null;
	}

	show() {
		this.createModal();
		this.attachEventListeners();
		this.unsubscribe = AppState.subscribe((action) => {
			if (action.type === ActionTypes.PARAMETER_RANGE_CUSTOMIZED ||
				action.type === ActionTypes.PARAMETER_RANGE_RESET ||
				action.type === ActionTypes.ALL_PARAMETER_RANGES_RESET) {
				this.updateParameterList();
			}
		});
	}

	createModal() {
		this.overlay = document.createElement('div');
		this.overlay.className = 'modal-overlay';

		this.modal = document.createElement('div');
		this.modal.className = 'parameter-customizer-modal';

		this.modal.innerHTML = `
			<div class="parameter-customizer-header">
				<h2>Customize Parameters</h2>
				<button class="close-btn" data-action="close">×</button>
			</div>
			<div class="parameter-customizer-controls">
				<input type="text" class="search-input" placeholder="Search parameters..." data-action="search">
				<label class="filter-toggle">
					<input type="checkbox" data-action="toggle-customized">
					Show only customized
				</label>
			</div>
			<div class="parameter-list"></div>
			<div class="parameter-customizer-footer">
				<button class="btn-secondary" data-action="reset-all">Reset All</button>
				<button class="btn-primary" data-action="close">Done</button>
			</div>
		`;

		document.body.appendChild(this.overlay);
		document.body.appendChild(this.modal);

		this.updateParameterList();
	}

	updateParameterList() {
		const listContainer = this.modal.querySelector('.parameter-list');
		const parametersGrouped = this.getGroupedParameters();

		listContainer.innerHTML = '';

		CATEGORY_ORDER.forEach(category => {
			const params = parametersGrouped[category];
			if (!params || params.length === 0) return;

			const section = this.createCategorySection(category, params);
			listContainer.appendChild(section);
		});
	}

	getGroupedParameters() {
		const grouped = {};
		const customizedParams = new Set(Selectors.getCustomizedParameters());

		Object.keys(PARAMETER_REGISTRY).forEach(paramKey => {
			const param = PARAMETER_REGISTRY[paramKey];

			if (param.type !== 'range' && param.type !== 'number') return;
			if (!param.ui) return;

			if (this.showOnlyCustomized && !customizedParams.has(paramKey)) return;

			if (this.searchQuery) {
				const query = this.searchQuery.toLowerCase();
				const label = param.label.toLowerCase();
				const key = paramKey.toLowerCase();
				if (!label.includes(query) && !key.includes(query)) return;
			}

			const category = param.category || 'other';
			if (!grouped[category]) grouped[category] = [];

			let subcategory = null;
			if (category === 'effect') {
				subcategory = getEffectSubcategory(paramKey);
			} else if (category === 'lfo') {
				subcategory = getLFOSubcategory(paramKey);
			}
			grouped[category].push({ key: paramKey, param, subcategory });
		});

		return grouped;
	}

	createCategorySection(category, params) {
		const section = document.createElement('div');
		section.className = 'parameter-category';

		const isCollapsed = this.showOnlyCustomized ? false : this.collapsedCategories.has(category);

		const header = document.createElement('div');
		header.className = 'category-header';
		header.innerHTML = `
			<span class="category-toggle ${isCollapsed ? 'collapsed' : ''}" data-category="${category}">
				${isCollapsed ? '▶' : '▼'}
			</span>
			<span class="category-title">${CATEGORY_LABELS[category] || category}</span>
		`;
		section.appendChild(header);

		if (!isCollapsed) {
			const paramsContainer = document.createElement('div');
			paramsContainer.className = 'category-params';

			if (category === 'effect') {
				const bySubcategory = {};
				params.forEach(({ key, param, subcategory }) => {
					if (!bySubcategory[subcategory]) bySubcategory[subcategory] = [];
					bySubcategory[subcategory].push({ key, param });
				});

				const subcategoryOrder = ['EQ', 'Delay/Echo', 'Reverb', 'Modulation', 'Filter', 'General', 'Other'];
				subcategoryOrder.forEach(subcat => {
					if (!bySubcategory[subcat]) return;

					const subcatHeader = document.createElement('div');
					subcatHeader.className = 'subcategory-header';
					subcatHeader.textContent = subcat;
					paramsContainer.appendChild(subcatHeader);

					bySubcategory[subcat].forEach(({ key, param }) => {
						const row = this.createParameterRow(key, param);
						paramsContainer.appendChild(row);
					});
				});
			} else if (category === 'lfo') {
				const bySubcategory = {};
				params.forEach(({ key, param, subcategory }) => {
					if (!bySubcategory[subcategory]) bySubcategory[subcategory] = [];
					bySubcategory[subcategory].push({ key, param });
				});

				const subcategoryOrder = ['Position Modulation', 'Sound Parameter Modulation', 'Effect Parameter Modulation'];
				subcategoryOrder.forEach(subcat => {
					if (!bySubcategory[subcat]) return;

					const subcatHeader = document.createElement('div');
					subcatHeader.className = 'subcategory-header';
					subcatHeader.textContent = subcat;
					paramsContainer.appendChild(subcatHeader);

					bySubcategory[subcat].forEach(({ key, param }) => {
						const row = this.createParameterRow(key, param);
						paramsContainer.appendChild(row);
					});
				});
			} else {
				params.forEach(({ key, param }) => {
					const row = this.createParameterRow(key, param);
					paramsContainer.appendChild(row);
				});
			}

			section.appendChild(paramsContainer);
		}

		return section;
	}

	createParameterRow(paramKey, param) {
		const row = document.createElement('div');
		row.className = 'parameter-row';
		row.dataset.paramKey = paramKey;

		const meta = getParameterMeta(paramKey);
		const customRange = Selectors.getCustomRange(paramKey);
		const isCustomized = !!customRange;

		const defaultMin = param.min;
		const defaultMax = param.max;
		const defaultStep = param.step;

		const currentMin = meta.min;
		const currentMax = meta.max;
		const currentStep = meta.step;

		const displayLabel = param.label + (param.unit ? param.unit : '');
		const description = PARAMETER_DESCRIPTIONS[paramKey];

		row.innerHTML = `
			<div class="param-label ${isCustomized ? 'customized' : ''}">
				${displayLabel}
				${isCustomized ? '<span class="customized-badge">●</span>' : ''}
			</div>
			${description ? `<div class="param-description">${description}</div>` : ''}
			<div class="param-defaults">
				<span class="default-label">Default:</span>
				<span class="default-values">
					${defaultMin} to ${defaultMax}, step ${defaultStep}
				</span>
			</div>
			<div class="param-inputs">
				<div class="input-group">
					<label>Min</label>
					<input type="number" step="any" data-field="min" data-param="${paramKey}" value="${currentMin}">
				</div>
				<div class="input-group">
					<label>Max</label>
					<input type="number" step="any" data-field="max" data-param="${paramKey}" value="${currentMax}">
				</div>
				<div class="input-group">
					<label>Step</label>
					<input type="number" step="any" data-field="step" data-param="${paramKey}" value="${currentStep}">
				</div>
				${isCustomized ? '<button class="reset-btn" data-action="reset" data-param="' + paramKey + '">Reset</button>' : ''}
			</div>
			<div class="param-error" data-error="${paramKey}"></div>
		`;

		return row;
	}

	attachEventListeners() {
		const handleClose = () => this.close();

		const handleSearch = (e) => {
			this.searchQuery = e.target.value;
			this.updateParameterList();
		};

		const handleToggleCustomized = (e) => {
			this.showOnlyCustomized = e.target.checked;
			this.updateParameterList();
		};

		const handleCategoryToggle = (e) => {
			const category = e.target.dataset.category;
			if (!category) return;

			if (this.collapsedCategories.has(category)) {
				this.collapsedCategories.delete(category);
			} else {
				this.collapsedCategories.add(category);
			}
			this.updateParameterList();
		};

		const handleResetAll = async () => {
			resetAllParameters();
		};

		const handleReset = (e) => {
			const paramKey = e.target.dataset.param;
			if (paramKey) {
				resetParameter(paramKey);
			}
		};

		const handleInputChange = (e) => {
			const paramKey = e.target.dataset.param;
			const field = e.target.dataset.field;

			if (!paramKey || !field) return;

			if (!this.debouncedHandlers.has(paramKey)) {
				this.debouncedHandlers.set(paramKey, debounce(() => {
					this.updateParameter(paramKey);
				}, 300));
			}

			this.debouncedHandlers.get(paramKey)();
		};

		const handleKeydown = (e) => {
			if (e.key === 'Escape') {
				this.close();
			}
		};

		const handleOverlayClick = (e) => {
			if (e.target === this.overlay) {
				this.close();
			}
		};

		this.modal.addEventListener('click', (e) => {
			const action = e.target.dataset.action;
			if (action === 'close') handleClose();
			else if (action === 'reset-all') handleResetAll();
			else if (action === 'reset') handleReset(e);
			else if (e.target.classList.contains('category-toggle')) handleCategoryToggle(e);
		});

		this.modal.addEventListener('input', (e) => {
			const action = e.target.dataset.action;
			if (action === 'search') handleSearch(e);
			else if (action === 'toggle-customized') handleToggleCustomized(e);
			else if (e.target.dataset.param) handleInputChange(e);
		});

		this.overlay.addEventListener('click', handleOverlayClick);
		document.addEventListener('keydown', handleKeydown);

		this._cleanup = () => {
			document.removeEventListener('keydown', handleKeydown);
		};
	}

	updateParameter(paramKey) {
		const row = this.modal.querySelector(`[data-param-key="${paramKey}"]`);
		if (!row) return;

		const minInput = row.querySelector('[data-field="min"]');
		const maxInput = row.querySelector('[data-field="max"]');
		const stepInput = row.querySelector('[data-field="step"]');
		const errorDiv = row.querySelector(`[data-error="${paramKey}"]`);

		const min = parseFloat(minInput.value);
		const max = parseFloat(maxInput.value);
		const step = parseFloat(stepInput.value);

		const param = PARAMETER_REGISTRY[paramKey];
		const customRange = {};

		if (min !== param.min) customRange.min = min;
		if (max !== param.max) customRange.max = max;
		if (step !== param.step) customRange.step = step;

		const effectiveMin = customRange.min !== undefined ? customRange.min : param.min;
		const effectiveMax = customRange.max !== undefined ? customRange.max : param.max;
		const effectiveStep = customRange.step !== undefined ? customRange.step : param.step;

		const validation = validateRange(effectiveMin, effectiveMax, effectiveStep);

		if (!validation.valid) {
			errorDiv.textContent = validation.errors.join(', ');
			errorDiv.style.display = 'block';
			return;
		}

		errorDiv.textContent = '';
		errorDiv.style.display = 'none';

		if (Object.keys(customRange).length > 0) {
			const result = setCustomRange(paramKey, customRange);
			if (!result.success && result.errors) {
				errorDiv.textContent = result.errors.join(', ');
				errorDiv.style.display = 'block';
			}
		} else {
			resetParameter(paramKey);
		}
	}

	close() {
		if (this._cleanup) this._cleanup();
		if (this.unsubscribe) this.unsubscribe();
		if (this.overlay) this.overlay.remove();
		if (this.modal) this.modal.remove();
	}
}
