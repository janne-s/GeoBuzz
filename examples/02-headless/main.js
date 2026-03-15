import { CompassView } from './CompassView.js';
import { SoundList } from './SoundList.js';
import { GuidancePing } from './GuidancePing.js';

const METERS_PER_LAT = 111320;
const DEG_TO_RAD = Math.PI / 180;

function metersPerLng(lat) {
    return METERS_PER_LAT * Math.cos(lat * DEG_TO_RAD);
}

function calculateDistance(from, to) {
    const dLat = (to.lat - from.lat) * METERS_PER_LAT;
    const dLng = (to.lng - from.lng) * metersPerLng(from.lat);
    return Math.sqrt(dLat * dLat + dLng * dLng);
}

function calculateBearing(from, to) {
    const lat1 = from.lat * DEG_TO_RAD;
    const lat2 = to.lat * DEG_TO_RAD;
    const dLng = (to.lng - from.lng) * DEG_TO_RAD;

    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

    return (Math.atan2(y, x) / DEG_TO_RAD + 360) % 360;
}

class HeadlessApp {
    constructor() {
        this.sounds = [];
        this.userPos = null;
        this.userHeading = 0;
        this.targetSound = null;
        this.isPlaying = false;
        this.relativeMode = false;
        this.anchorSet = false;
        this.orientationGranted = false;
        this.watchId = null;
        this.synths = new Map();
        this.compassView = new CompassView();
        this.soundList = new SoundList(document.getElementById('sound-list'));
        this.guidancePing = new GuidancePing();
        this.pingEnabled = false;
    }

    async init() {
        this.soundList.onSelect = (sound) => this.selectTarget(sound);
        await this.loadBuzz();
        this.setupControls();
        this.setupOrientation();
        await this.requestGeolocation();
        this.updateLoop();
    }

    async loadBuzz() {
        const response = await fetch('./buzz.json');
        const data = await response.json();
        this.relativeMode = data.relativePositioning;

        this.sounds = data.sounds.map((s, i) => ({
            id: s.persistentId || `sound_${i}`,
            label: s.label,
            color: s.color,
            offsetX: s.offsetX || 0,
            offsetY: s.offsetY || 0,
            lat: this.relativeMode ? null : s.lat,
            lng: this.relativeMode ? null : s.lng,
            maxDistance: s.maxDistance || 50,
            params: s.params
        }));

        this.soundList.setSounds(this.sounds);
        if (this.sounds.length > 0) {
            this.selectTarget(this.sounds[0]);
        }
    }

    selectTarget(sound) {
        this.targetSound = sound;
        this.soundList.setSelected(sound.id);
        this.compassView.setTarget(sound);
    }

    setupControls() {
        const playBtn = document.getElementById('play-btn');
        const pingToggle = document.getElementById('ping-toggle');

        playBtn.addEventListener('click', async () => {
            if (this.isPlaying) {
                this.stop();
                playBtn.textContent = 'Start';
                playBtn.classList.remove('playing');
            } else {
                await this.start();
                playBtn.textContent = 'Stop';
                playBtn.classList.add('playing');
            }
        });

        pingToggle.addEventListener('click', () => {
            this.pingEnabled = !this.pingEnabled;
            pingToggle.classList.toggle('active', this.pingEnabled);
            if (this.isPlaying) {
                this.pingEnabled ? this.guidancePing.start() : this.guidancePing.stop();
            }
        });
    }

    setupOrientation() {
        const handler = (e) => {
            if (e.webkitCompassHeading !== undefined) {
                this.userHeading = e.webkitCompassHeading;
            } else if (e.alpha !== null) {
                this.userHeading = (360 - e.alpha) % 360;
            }
        };

        if (!window.DeviceOrientationEvent) return;

        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            document.getElementById('play-btn').addEventListener('click', async () => {
                if (this.orientationGranted) return;
                try {
                    const permission = await DeviceOrientationEvent.requestPermission();
                    if (permission === 'granted') {
                        window.addEventListener('deviceorientationabsolute', handler, true);
                        window.addEventListener('deviceorientation', handler, true);
                        this.orientationGranted = true;
                    }
                } catch {}
            }, { once: true });
        } else {
            window.addEventListener('deviceorientationabsolute', handler, true);
            window.addEventListener('deviceorientation', handler, true);
        }
    }

    async requestGeolocation() {
        if (!navigator.geolocation) {
            this.setStatus('Geolocation not available');
            return;
        }

        this.setStatus('Finding location...');

        return new Promise((resolve) => {
            this.watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    this.userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    if (this.relativeMode && !this.anchorSet) {
                        this.setAnchor(this.userPos);
                    }
                    this.setStatus('');
                    resolve();
                },
                (err) => {
                    this.setStatus('Location error: ' + err.message);
                    resolve();
                },
                { enableHighAccuracy: true, maximumAge: 0 }
            );
        });
    }

    setAnchor(anchor) {
        this.anchorSet = true;
        const mPerLng = metersPerLng(anchor.lat);
        this.sounds.forEach(s => {
            s.lat = anchor.lat + s.offsetY / METERS_PER_LAT;
            s.lng = anchor.lng + s.offsetX / mPerLng;
        });
    }

    setStatus(message) {
        document.getElementById('status').textContent = message;
    }

    async start() {
        await Tone.start();
        await this.guidancePing.init();
        this.isPlaying = true;

        for (const sound of this.sounds) {
            this.createSynth(sound);
        }

        if (this.pingEnabled) {
            this.guidancePing.start();
        }
    }

    createSynth(sound) {
        const p = sound.params;
        const gain = new Tone.Gain(0).toDestination();
        const panner = new Tone.Panner(0).connect(gain);
        const synth = new Tone.Synth({
            oscillator: { type: p.waveform || 'sine' },
            envelope: {
                attack: p.attack || 0.1,
                decay: p.decay || 0.2,
                sustain: p.sustain || 0.5,
                release: p.release || 0.5
            }
        }).connect(panner);

        this.synths.set(sound.id, { synth, gain, panner, isPlaying: false });
    }

    stop() {
        this.isPlaying = false;
        this.guidancePing.stop();
        this.synths.forEach(({ synth, gain }) => {
            synth.triggerRelease();
            gain.gain.rampTo(0, 0.1);
        });
    }

    updateLoop() {
        if (this.userPos) {
            this.updateSounds();
        }
        requestAnimationFrame(() => this.updateLoop());
    }

    updateSounds() {
        const soundData = [];

        for (const sound of this.sounds) {
            if (sound.lat === null) continue;

            const distance = calculateDistance(this.userPos, sound);
            const absoluteBearing = calculateBearing(this.userPos, sound);
            const relativeBearing = (absoluteBearing - this.userHeading + 360) % 360;

            soundData.push({ id: sound.id, distance, bearing: relativeBearing });

            if (this.isPlaying) {
                this.updateSoundAudio(sound, distance, relativeBearing);
            }

            if (sound.id === this.targetSound?.id) {
                this.compassView.update(relativeBearing, distance);
                if (this.pingEnabled && this.isPlaying) {
                    this.guidancePing.setAlignment(Math.cos(relativeBearing * DEG_TO_RAD));
                }
            }
        }

        soundData.sort((a, b) => a.distance - b.distance);
        this.soundList.update(soundData);
    }

    updateSoundAudio(sound, distance, relativeBearing) {
        const synthData = this.synths.get(sound.id);
        if (!synthData) return;

        const { synth, gain, panner } = synthData;
        const maxDist = sound.maxDistance;

        if (distance > maxDist) {
            if (synthData.isPlaying) {
                synth.triggerRelease();
                synthData.isPlaying = false;
            }
            gain.gain.rampTo(0, 0.1);
            return;
        }

        const volume = sound.params.volume || 0.8;
        const targetGain = (1 - distance / maxDist) * volume;

        gain.gain.rampTo(targetGain, 0.1);
        panner.pan.rampTo(Math.sin(relativeBearing * DEG_TO_RAD), 0.05);

        if (!synthData.isPlaying && targetGain > 0) {
            const freq = Tone.Frequency(sound.params.pitch || 60, 'midi').toFrequency();
            synth.triggerAttack(freq);
            synthData.isPlaying = true;
        }
    }
}

new HeadlessApp().init();
