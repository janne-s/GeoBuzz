const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

export class SoundList {
    constructor(container) {
        this.container = container;
        this.sounds = [];
        this.selectedId = null;
        this.onSelect = null;
    }

    setSounds(sounds) {
        this.sounds = sounds;
        this.render();
    }

    setSelected(id) {
        this.selectedId = id;
        this.container.querySelectorAll('.sound-item').forEach(el => {
            el.classList.toggle('selected', el.dataset.id === id);
        });
    }

    update(soundData) {
        for (const { id, distance, bearing } of soundData) {
            const el = this.container.querySelector(`[data-id="${id}"]`);
            if (!el) continue;

            el.querySelector('.dist').textContent = distance < 1000
                ? `${Math.round(distance)} m`
                : `${(distance / 1000).toFixed(1)} km`;

            el.querySelector('.direction').textContent = ARROWS[Math.round(bearing / 45) % 8];
        }
    }

    render() {
        this.container.innerHTML = '';

        for (const sound of this.sounds) {
            const el = document.createElement('div');
            el.className = 'sound-item' + (sound.id === this.selectedId ? ' selected' : '');
            el.dataset.id = sound.id;
            el.innerHTML = `
                <div class="indicator"></div>
                <div class="info">
                    <div class="name">${sound.label || 'Unnamed'}</div>
                    <div class="dist">--</div>
                </div>
                <div class="direction">--</div>
            `;
            el.addEventListener('click', () => {
                this.setSelected(sound.id);
                this.onSelect?.(sound);
            });
            this.container.appendChild(el);
        }
    }
}
