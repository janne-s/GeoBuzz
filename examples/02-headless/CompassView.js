const BRIGHTNESS_THRESHOLD = 12;

export class CompassView {
    constructor() {
        this.arrowEl = document.getElementById('arrow');
        this.polygonEl = this.arrowEl.querySelector('polygon');
        this.distanceEl = document.getElementById('distance');
        this.soundNameEl = document.getElementById('sound-name');
        this.rotation = 0;
    }

    setTarget(sound) {
        if (sound) {
            this.soundNameEl.textContent = sound.label || 'Unnamed';
            this.distanceEl.classList.remove('no-unit');
        } else {
            this.soundNameEl.textContent = 'No target';
            this.distanceEl.textContent = '--';
            this.distanceEl.classList.add('no-unit');
            this.arrowEl.style.opacity = '0.3';
        }
    }

    update(bearing, distance) {
        this.arrowEl.style.opacity = '1';

        let delta = bearing - this.rotation;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        this.rotation += delta;

        const deviation = Math.min(bearing, 360 - bearing);
        const t = Math.pow(Math.max(0, 1 - deviation / BRIGHTNESS_THRESHOLD), 2);

        const r = Math.round(50 + 205 * t);
        const g = Math.round(100 + 155 * t);
        const b = Math.round(180 + 75 * t);

        this.arrowEl.style.transform = `rotate(${this.rotation}deg) scale(${1 + t * 0.15})`;
        this.polygonEl.style.fill = `rgb(${r}, ${g}, ${b})`;

        this.distanceEl.textContent = distance < 1000
            ? Math.round(distance)
            : (distance / 1000).toFixed(1) + ' k';
    }
}
