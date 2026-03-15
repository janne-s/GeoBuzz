import { FX_REGISTRY } from './SynthRegistry.js';
import { DEFAULT_EQ_STRUCTURE } from '../../config/defaults.js';
import { CONSTANTS } from '../constants.js';
import { delay, waitForNextFrame } from '../utils/async.js';
import { deepClone } from '../utils/math.js';
import { AudioNodeManager } from './AudioNodeManager.js';

export function createEffect(type, params = {}) {
	try {
		const fxDef = FX_REGISTRY[type];
		if (!fxDef) {
			console.warn(`Unknown effect type: ${type}`);
			return null;
		}

		const effect = fxDef.factory(params);

		if (!effect) {
			console.error(`Failed to create effect: ${type}`);
			return null;
		}

		if (effect.wet) {
			const mixValue = params.mix !== undefined ? params.mix : 50;
			effect.wet.value = mixValue / 100;

			if (effect.dry !== undefined) {
				effect.dry.value = 1 - (mixValue / 100);
			}
		}

		return effect;

	} catch (error) {
		console.error(`Error creating effect ${type}:`, error);
		return null;
	}
}

export function createLayerFXNodes(layer) {
	if (!layer.fxNodes) {
		layer.fxNodes = {
			input: new Tone.Gain(1),
			fx1: null,
			fx2: null,
			fx3: null,
			eq: null,
			gain: new Tone.Gain(layer.gain || CONSTANTS.DEFAULT_LAYER_GAIN),
			output: new Tone.Gain(1).toDestination()
		};

		layer.fxNodes.input.connect(layer.fxNodes.gain);
		layer.fxNodes.gain.connect(layer.fxNodes.output);

	}
	return layer.fxNodes;
}

export const FXManager = {
	change(target, slot, fxType, context = { isLayer: false }) {
		const slotKey = `slot${slot}`;
		const fxKey = `fx${slot}`;

		this.disposeSlot(target, fxKey, context);

		this.updateConfig(target, slotKey, fxType, context);

		if (fxType !== "none") {
			this.createEffect(target, slot, fxType, context);
		}

		this.updateChain(target, context);
	},

	disposeSlot(target, fxKey, context) {
		const node = context.isLayer ? target.fxNodes?.[fxKey] : target[fxKey];
		if (node) {
			try {
				node.disconnect();
				if (node.dispose) node.dispose();
			} catch (e) {
				console.warn('Error disposing effect:', e);
			}
		}

		if (context.isLayer) {
			if (target.fxNodes) target.fxNodes[fxKey] = null;
		} else {
			target[fxKey] = null;
		}
	},

	updateConfig(target, slotKey, fxType, context) {
		const config = context.isLayer ? target.fx : target.params.fx;
		if (!config[slotKey]) config[slotKey] = { type: 'none', params: {}, mix: 50 };
		config[slotKey].type = fxType;
	},

	createEffect(target, slot, fxType, context) {
		const slotKey = `slot${slot}`;
		const fxKey = `fx${slot}`;
		const config = context.isLayer ? target.fx : target.params.fx;

		const effectParams = { ...config[slotKey].params, mix: config[slotKey].mix || 50 };
		const newFX = createEffect(fxType, effectParams);

		if (newFX) {
			if (context.isLayer) {
				if (!target.fxNodes) {
					createLayerFXNodes(target);
				}
				target.fxNodes[fxKey] = newFX;
			} else {
				target[fxKey] = newFX;
			}

			if (newFX.wet) newFX.wet.value = effectParams.mix / 100;
		}
	},

	async updateChain(target, context) {
		if (context.isLayer) {
			const { updateLayerFXChain } = await import('./AudioChainManager.js');
			await updateLayerFXChain(target);
		} else {
			AudioNodeManager.updateFXChain(target);
		}
	},

	async restoreChain(target, context = { isLayer: false }) {
		const config = context.isLayer ? target.fx : target.params.fx;

		if (!config) return;


		for (const [slotKey, slotNum] of [
				['slot1', 1],
				['slot2', 2],
				['slot3', 3]
			]) {
			const slotData = config[slotKey];

			if (slotData && slotData.type !== 'none') {


				this.change(target, slotNum, slotData.type, context);

				await delay(50);

				const fxKey = `fx${slotNum}`;
				const node = context.isLayer ? target.fxNodes?.[fxKey] : target[fxKey];

				if (node && slotData.params) {
					this.restoreParameters(node, slotData.params);
				}

				if (node && node.wet && slotData.mix !== undefined) {
					node.wet.value = slotData.mix / 100;
				}

				await delay(20);
			}
		}

		await waitForNextFrame();
		this.updateChain(target, context);

	},

	restoreParameters(node, params) {
		Object.entries(params).forEach(([param, value]) => {
			const paramName = this.normalizeParamName(param);
			if (node[paramName] !== undefined) {
				try {
					if (typeof node[paramName].value !== 'undefined') {
						node[paramName].value = value;
					} else {
						node[paramName] = value;
					}
				} catch (error) {
					console.warn(`Error setting parameter ${paramName}:`, error);
				}
			}
		});
	},

	normalizeParamName(paramKey) {
		return paramKey.replace('fx_', '').replace('_long', '');
	},

	disposeAll(target, context = { isLayer: false }) {
		[1, 2, 3].forEach(slot => {
			const fxKey = `fx${slot}`;
			this.disposeSlot(target, fxKey, context);
		});
	}
};
