import { LayerManager } from '../../layers/LayerManager.js';

export const AudioChainManager = {
	connect(nodes, destination) {
		for (let i = 0; i < nodes.length - 1; i++) {
			if (nodes[i] && nodes[i + 1]) {
				try {
					nodes[i].connect(nodes[i + 1]);
				} catch (e) {
					console.warn(`Failed to connect node ${i} to ${i + 1}:`, e);
				}
			}
		}
	},

	disconnect(node) {
		if (node) {
			try {
				node.disconnect();
			} catch (e) {
				console.warn('Disconnect error:', e);
			}
		}
	},

	buildChain(source, effects, eq, gain) {
		const activeNodes = [source];

		effects.forEach(fx => {
			if (fx && fx.node && fx.type && fx.type !== 'none') {
				activeNodes.push(fx.node);
			}
		});

		if (eq && eq.node && eq.enabled) {
			activeNodes.push(eq.node);
		}

		if (gain) {
			activeNodes.push(gain);
		}

		return activeNodes;
	},

	rebuild(target, context = {}) {
		if (context.isLayer) {
			try {

				[target.input, target.fx1, target.fx2, target.fx3, target.eq]
				.forEach(node => this.disconnect(node));

				const layer = LayerManager.userLayers.find(l => l.fxNodes === target);

				const effects = [
					{ node: target.fx1, type: layer?.fx?.slot1?.type },
					{ node: target.fx2, type: layer?.fx?.slot2?.type },
					{ node: target.fx3, type: layer?.fx?.slot3?.type }
				];

				const eq = {
					node: target.eq,
					enabled: layer?.eq?.enabled
				};

				const chain = this.buildChain(target.input, effects, eq, target.gain);
				this.connect(chain);

				target.gain.connect(target.output);


			} catch (error) {
				console.error('Error rebuilding layer FX chain:', error);
				try {
					target.input.disconnect();
					target.input.connect(target.gain);
					target.gain.disconnect();
					target.gain.connect(target.output);
				} catch (e) {
					console.error('Fallback connection failed:', e);
				}
			}

		} else {
			try {
				[target.envelopeGain, target.fx1, target.fx2, target.fx3, target.eq]
				.forEach(node => this.disconnect(node));

				const effects = [
					{ node: target.fx1, type: target.params.fx?.slot1?.type },
					{ node: target.fx2, type: target.params.fx?.slot2?.type },
					{ node: target.fx3, type: target.params.fx?.slot3?.type }
				];

				const eq = { node: target.eq, enabled: target.params.eq?.enabled };
				const chain = this.buildChain(target.envelopeGain, effects, eq, target.gain);

				this.connect(chain);

			} catch (error) {
				console.error('Error rebuilding sound FX chain:', error);
				try {
					target.envelopeGain.disconnect();
					target.envelopeGain.connect(target.gain);
				} catch (e) {
					console.error('Fallback connection failed:', e);
				}
			}
		}
	}
};

export function updateFXChain(obj) {
	AudioChainManager.rebuild(obj);
}

export async function updateLayerFXChain(layer) {
	const { createLayerFXNodes } = await import('./FXManager.js');
	if (!layer.fxNodes) {
		createLayerFXNodes(layer);
	}
	AudioChainManager.rebuild(layer.fxNodes, { isLayer: true });
}
