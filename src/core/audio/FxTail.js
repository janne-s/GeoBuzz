import { CONSTANTS } from '../constants.js';

export function fxTailSeconds(fxConfig, extraSeconds = 0) {
	let tail = 0;

	['slot1', 'slot2', 'slot3'].forEach(slotKey => {
		const slot = fxConfig?.[slotKey];
		if (!slot || slot.type === 'none') return;

		const params = slot.params || {};
		let slotTail = 0;

		if (slot.type === 'Reverb') {
			slotTail = (params.decay ?? 1.5) + (params.preDelay ?? 0.01);
		} else if (slot.type === 'Freeverb' || slot.type === 'JCReverb') {
			slotTail = CONSTANTS.ALGORITHMIC_REVERB_TAIL_S;
		} else if (slot.type === 'FeedbackDelay' || slot.type === 'PingPongDelay') {
			const feedback = Math.min(0.99, Math.max(0, params.feedback ?? 0.5));
			const delayTime = params.delayTime ?? 0.25;
			slotTail = feedback > 0
				? delayTime * (Math.log(CONSTANTS.FX_TAIL_FLOOR) / Math.log(feedback))
				: delayTime;
		}

		if (slotTail > tail) tail = slotTail;
	});

	return Math.min(CONSTANTS.FX_BYPASS_MAX_TAIL_S, tail + extraSeconds) + CONSTANTS.FX_BYPASS_MARGIN_S;
}
