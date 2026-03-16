# GeoBuzz Examples

Inspiring starting points for custom buzz players. Not production-ready — springboards for your own development.

---

## Examples

| Example | Description |
|---------|-------------|
| **01-minimal** | Simplest implementation (~50 lines). Map + play button. |
| **02-headless** | Audio-only, no map. |
| **03-visualizer** | Canvas visualization with Delaunay, particles, networks. |
| **04-guided-tour** | Walking tour with progress bar, waypoints, direction arrow. |
| **05-aframe** | A-Frame AR/VR integration with 3D sound visualization. |
| **06-multi-buzz** | Switch between multiple buzz compositions. |
| **07-osc-streaming** | Stream data to Max/MSP, Pure Data, TouchDesigner. |

---

## Dependencies

| Example | Leaflet | Tone.js | Resonance | A-Frame | Other |
|---------|---------|---------|-----------|---------|-------|
| 01-minimal | ✓ | ✓ | ✓ | | |
| 02-headless | | ✓ | ✓ | | |
| 03-visualizer | ✓ | ✓ | ✓ | | Delaunator |
| 04-guided-tour | ✓ | ✓ | ✓ | | Font Awesome |
| 05-aframe | | ✓ | ✓ | ✓ | |
| 06-multi-buzz | ✓ | ✓ | ✓ | | |
| 07-osc-streaming | ✓ | ✓ | ✓ | | Node.js bridge |

---

## Using Examples Within the App

The simplest way: replace `buzz.json` with your own and open the example from `/examples/` in your browser.

Examples reference the main `src/` folder, so they work directly when served from the GeoBuzz app.

---

## Creating Standalone Deployments

To deploy an example independently:

1. **Export a buzz package** from the editor
2. **Copy to example folder:**
   - `buzz.json` from your export
   - `src/` folder from your export
3. **Deploy to HTTPS server** (required for geolocation)

```
your-deployment/
├── index.html      # From example
├── styles.css      # From example (if present)
├── buzz.json       # From your export
└── src/            # From your export
    └── runtime/
        └── RuntimeEngine.js
```

---

## Troubleshooting

- **Won't load**: Needs HTTPS server, not `file://`
- **No audio**: Click play button first (browser requirement)
- **No location**: Check HTTPS and browser permissions
