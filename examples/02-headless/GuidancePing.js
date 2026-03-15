export class GuidancePing {
    constructor() {
        this.enabled = false;
        this.baseFrequency = 880;
        this.maxDelay = 0.12;
        this.maxDetune = 15;
        this.alignment = 0;
        this.gainLeft = null;
        this.gainRight = null;
        this.panLeft = null;
        this.panRight = null;
        this.nextPingTime = 0;
        this.animationId = null;
    }

    async init() {
        this.gainLeft = new Tone.Gain(0).toDestination();
        this.gainRight = new Tone.Gain(0).toDestination();
        this.panLeft = new Tone.Panner(-1).connect(this.gainLeft);
        this.panRight = new Tone.Panner(1).connect(this.gainRight);
    }

    start() {
        if (this.enabled) return;
        this.enabled = true;
        this.nextPingTime = Tone.now() + 0.5;
        this.loop();
    }

    stop() {
        this.enabled = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    setAlignment(value) {
        this.alignment = Math.max(-1, Math.min(1, value));
    }

    loop() {
        if (!this.enabled) return;

        const now = Tone.now();
        if (now >= this.nextPingTime) {
            this.triggerPing();
            this.nextPingTime = now + (this.alignment > 0.8 ? 1.0 : 1.5);
        }

        this.animationId = requestAnimationFrame(() => this.loop());
    }

    triggerPing() {
        const now = Tone.now();
        const t = (this.alignment + 1) / 2;

        const delay = this.maxDelay * (1 - t);
        const detune = this.maxDetune * (1 - t);
        const gain = 0.15 + 0.35 * t;

        this.ping(this.panLeft, this.gainLeft, this.baseFrequency - detune, now, gain);
        this.ping(this.panRight, this.gainRight, this.baseFrequency + detune, now + delay, gain);
    }

    ping(panner, gainNode, frequency, time, amplitude) {
        const osc = new Tone.Oscillator({ frequency, type: 'sine' }).connect(panner);

        gainNode.gain.setValueAtTime(0, time);
        gainNode.gain.linearRampToValueAtTime(amplitude, time + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.09);

        osc.start(time);
        osc.stop(time + 0.1);
        osc.onstop = () => osc.dispose();
    }

    dispose() {
        this.stop();
        this.gainLeft?.dispose();
        this.gainRight?.dispose();
        this.panLeft?.dispose();
        this.panRight?.dispose();
    }
}
