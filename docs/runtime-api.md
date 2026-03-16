# RuntimeEngine API Reference

API documentation for the GeoBuzz RuntimeEngine — the lightweight player module for deploying buzz compositions without the editor.

---

## Quick Start

```javascript
import { runtimeEngine } from './src/runtime/RuntimeEngine.js';

// 1. Initialize engine with a map container
await runtimeEngine.initialize({
  mapContainer: document.getElementById('map')
});

// 2. Load a buzz composition
const response = await fetch('buzz.json');
const buzzData = await response.json();
await runtimeEngine.loadBuzz(buzzData);

// 3. Start playback (must be called from a user gesture)
document.getElementById('playBtn').addEventListener('click', async () => {
  await runtimeEngine.start();
});
```

---

## Import

The module exports a singleton instance and the class:

```javascript
// Singleton (recommended)
import { runtimeEngine } from './src/runtime/RuntimeEngine.js';

// Also available as default export
import runtimeEngine from './src/runtime/RuntimeEngine.js';

// Also exposed as a global
window.GeoBuzzEngine
```

---

## Lifecycle

The engine follows a strict lifecycle:

```
  initialize()  →  loadBuzz()  →  start()  ⇄  stop()  →  dispose()
       │                │             │                        │
   Creates map,     Loads visuals,  Initializes audio       Cleans up
   audio context,   paths, state    on first call,          everything
   geolocation                      begins playback
```

### Why audio is deferred

Browsers suspend audio contexts that are created without a user gesture. The engine handles this by splitting loading into two phases:

1. **`loadBuzz()`** — loads map visuals (shapes, markers, paths) immediately
2. **`start()`** — initializes audio nodes and loads sound files on the first call, then starts playback

This means `start()` must be called from a user interaction (click, tap) to work reliably across browsers.

---

## Core Methods

### `initialize(options)`

Sets up the map, audio context, geolocation, and internal wiring.

```javascript
await runtimeEngine.initialize({
  mapContainer: document.getElementById('map'),  // Required (or element with id="map")
  mapConfig: {                                    // Optional Leaflet map config
    center: [60.17, 24.94],
    zoom: 15,
    zoomControl: true,
    preferCanvas: true
  }
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mapContainer` | HTMLElement | `document.getElementById('map')` | Container element for the Leaflet map |
| `mapConfig` | Object | `{ center: [0,0], zoom: 2 }` | Leaflet [map options](https://leafletjs.com/reference.html#map-option) |

**Throws** if the map container is not found.

Calling `initialize()` on an already-initialized engine is a no-op (logs a warning).

---

### `loadBuzz(buzzData)`

Loads a buzz composition. Applies audio settings, creates map visuals for sounds and paths, and starts the visual update loop.

```javascript
const response = await fetch('buzz.json');
const buzzData = await response.json();
await runtimeEngine.loadBuzz(buzzData);
```

**Requires** the engine to be initialized first.

**Does NOT start audio** — call `start()` for that.

If `buzzData.relativePositioning` is `true`, the engine waits for a GPS fix and places all elements relative to the user's current position.

---

### `start()`

Starts audio playback. On the first call, this also:
- Resumes the Web Audio context (browser requirement)
- Initializes ambisonics if configured
- Creates audio node chains for all sounds
- Loads audio files for SoundFile and Sampler types
- Initializes distance sequencers

```javascript
// Must be called from a user gesture (click/tap)
playButton.addEventListener('click', async () => {
  await runtimeEngine.start();
});
```

Subsequent calls resume playback after `stop()`.

---

### `stop()`

Pauses audio playback. Stops all sounds, streams, and sequencers. The engine remains initialized — call `start()` again to resume.

```javascript
runtimeEngine.stop();
```

---

### `dispose()`

Fully cleans up the engine: stops audio, cancels the update loop, closes the audio context. Call this when you're done with the engine entirely.

```javascript
runtimeEngine.dispose();
```

After `dispose()`, the engine must be re-initialized with `initialize()` before use.

---

### `getState()`

Returns the internal application state containing all loaded data.

```javascript
const state = runtimeEngine.getState();
console.log(state.sounds);        // Array of sound objects
console.log(state.controlPaths);  // Array of path objects
console.log(state.sequencers);    // Array of sequencer objects
```

#### Sound object (key properties)

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier |
| `type` | string | `'Synth'`, `'FMSynth'`, `'AMSynth'`, `'FatOscillator'`, `'NoiseSynth'`, `'SoundFile'`, `'Sampler'`, `'StreamPlayer'` |
| `label` | string | Display name |
| `color` | string | Hex color |
| `shapeType` | string | `'circle'`, `'polygon'`, `'line'`, `'oval'` |
| `isPlaying` | boolean | Whether the sound is currently producing audio |
| `isReady` | boolean | Whether audio is loaded and ready |
| `userLat` / `userLng` | number | Current sound position |
| `maxDistance` | number | Trigger radius in meters (circle shapes) |
| `params` | Object | All sound parameters (volume, pitch, etc.) |

#### Sequencer object (key properties)

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier |
| `label` | string | Display name |
| `enabled` | boolean | Whether the sequencer is active |
| `insideArea` | boolean | Whether the user is in a trigger zone |

---

### `getContext()`

Returns the internal engine context object, giving access to all managers and utilities.

```javascript
const ctx = runtimeEngine.getContext();
```

See [Accessing Managers](#accessing-managers) below for details.

---

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `initialized` | boolean | Whether `initialize()` has completed |
| `audioInitialized` | boolean | Whether audio nodes have been created (happens on first `start()`) |
| `isPlaying` | boolean | Whether audio playback is active |
| `map` | L.Map | The Leaflet map instance |

---

## Accessing Managers

Use `getContext()` to access the internal managers. These are the most useful for custom players:

### GeolocationManager

Manages user position, GPS tracking, and the user marker.

```javascript
const geo = runtimeEngine.getContext().GeolocationManager;

// Get current user position as Leaflet LatLng
const pos = geo.getUserPosition();
// → { lat: 60.17, lng: 24.94 }

// Get detailed status
const info = geo.getStatusInfo();
// → { status: 'watching', followGPS: true, hasMarker: true, position: LatLng }

// Toggle between GPS tracking and manual (draggable) positioning
geo.toggleFollowGPS();       // Toggle
geo.toggleFollowGPS(true);   // Force GPS mode
geo.toggleFollowGPS(false);  // Force manual mode

// Get the Leaflet marker for the user
const marker = geo.getUserMarker();

// Wait for first GPS fix (useful for relative positioning)
const position = await geo.waitForLocation(5000); // timeout in ms
```

### LayerManager

Controls layer visibility and gain.

```javascript
const layers = runtimeEngine.getContext().LayerManager;

// Default layer visibility
layers.layers.sounds;   // boolean
layers.layers.control;  // boolean

// User layers array
layers.userLayers;
// → [{ id, name, color, visible, muted, soloed, gain, fxNodes }]

// Get a specific user layer
const layer = layers.getUserLayer('user_1');
```

### Map

The Leaflet map instance — use it for custom map interactions.

```javascript
const map = runtimeEngine.getContext().map;

// Pan to a location
map.setView([60.17, 24.94], 16);

// Listen to map events
map.on('click', (e) => {
  console.log('Clicked at', e.latlng);
});
```

### AppState

The central state store. Supports a subscription system for reacting to internal events.

```javascript
const appState = runtimeEngine.getContext().AppState;

// Subscribe to internal events
appState.subscribe((action) => {
  switch (action.type) {
    case 'STREAM_PLAYBACK_UPDATE':
      // A stream sound's gain changed
      const { sound, effectiveGain } = action.payload;
      break;
    case 'AUDIO_ECHO_UPDATE_REQUESTED':
      // Echo reflection update
      break;
    case 'USER_POSITION_CHANGED':
      // User moved (in drag mode)
      const { position } = action.payload;
      break;
  }
});
```

---

## Buzz JSON Structure

The `buzz.json` file loaded by `loadBuzz()` has this top-level structure:

```javascript
{
  "meta": {
    "title": "My Buzz",
    "description": "A spatial composition"
  },
  "audioSettings": {
    "spatialMode": "stereo",          // "stereo", "ambisonics", or "hrtf"
    "ambisonics": { ... },            // See Ambisonics Settings
    "smoothing": { ... }              // See Smoothing Settings
  },
  "defaultLayerStates": {
    "sounds": true,
    "control": true
  },
  "relativePositioning": false,       // If true, coordinates are offsets from user
  "sounds": [ ... ],                  // Sound definitions
  "controlPaths": [ ... ],            // Path definitions
  "sequencers": [ ... ],              // Sequencer definitions
  "userLayers": [ ... ]               // Layer definitions
}
```

### Audio Settings

#### Spatial Modes

| Mode | Description |
|------|-------------|
| `"stereo"` | Standard stereo panning based on bearing to sound. Works everywhere. |
| `"hrtf"` | Head-Related Transfer Function 3D audio via Web Audio API PannerNode. Good headphone experience. |
| `"ambisonics"` | Full ambisonics spatial audio via Resonance Audio. Most immersive, higher CPU cost. |

#### Ambisonics Settings

```javascript
"ambisonics": {
  "order": 1,              // Ambisonic order: 1, 2, or 3 (higher = more precise)
  "gainBoost": 1.0,        // Output gain multiplier
  "rolloff": "logarithmic",// Distance model: "linear" or "logarithmic"
  "minDistance": 1,         // Distance for full volume (meters)
  "stereoWidth": 1.0,      // Stereo field width
  "stereoSpread": 10       // Distance for full stereo separation
}
```

#### Audio Smoothing

Smooths audio transitions to reduce abrupt changes as the user moves.

```javascript
"smoothing": {
  "positionSmoothing": 0.5,  // Location interpolation factor (0-1)
  "maxGainChange": 0.05,     // Maximum volume change per update
  "deadZone": 1              // Minimum movement in meters to trigger update
}
```

### Sound Definition

```javascript
{
  "type": "Synth",              // See sound types below
  "label": "Drone",
  "color": "#ff6600",
  "shapeType": "circle",        // "circle", "polygon", "line", "oval"
  "lat": 60.17,                 // Position (absolute mode)
  "lng": 24.94,
  "offsetX": 0,                 // Position (relative mode, meters)
  "offsetY": 50,
  "maxDistance": 100,            // Trigger radius for circles (meters)
  "useSpatialPanning": true,
  "volumeOrigin": "icon",       // "icon", "division", "centerline"
  "volumeModel": "distance",    // "distance" or "raycast"
  "layers": ["user_1"],
  "pathRoles": {
    "movement": null,            // Path ID for automated movement
    "zones": [],                 // Path IDs that gate this sound
    "modulation": [],            // Path-to-parameter modulation
    "soundModulation": []        // Sound-to-parameter modulation
  },
  "params": {
    "pitch": 60,
    "volume": -6,
    "pan": 0,
    "curveStrength": 1,
    "oscillatorType": "sine",
    "envelope": { "attack": 0.1, "decay": 0.2, "sustain": 0.8, "release": 0.5 },
    "filterFrequency": 2000,
    "filterQ": 1,
    "filterType": "lowpass",
    "loop": true,
    "soundFile": "sounds/drone.wav",
    "streamUrl": "https://...",
    "lfo": { "x": {}, "y": {}, "size": {} },
    "fx": { "fx1": {}, "fx2": {}, "fx3": {} },
    "eq": { "enabled": false, "low": 0, "mid": 0, "high": 0 },
    "reflections": { "enabled": false, "include": [] }
  }
}
```

#### Sound Types

| Type | Description |
|------|-------------|
| `Synth` | Basic synthesizer (sine, square, saw, triangle, pulse, PWM) |
| `FatOscillator` | Unison oscillator with spread/count |
| `AMSynth` | Amplitude modulation synthesis |
| `FMSynth` | Frequency modulation synthesis |
| `NoiseSynth` | Noise generator (white, pink, brown) |
| `SoundFile` | Audio file player (supports granular mode) |
| `Sampler` | Sampler instrument (single sample or grid) |
| `StreamPlayer` | Network audio stream player |

### Path Definition

```javascript
{
  "id": "path_1",
  "type": "line",               // "line", "circle", "polygon", "oval"
  "label": "Walking route",
  "color": "#00ff00",
  "points": [                   // For line/polygon (absolute mode)
    { "lat": 60.17, "lng": 24.94 },
    { "lat": 60.18, "lng": 24.95 }
  ],
  "pointOffsets": [             // For line/polygon (relative mode, meters)
    { "x": 0, "y": 0 },
    { "x": 50, "y": 100 }
  ],
  "center": { "lat": 60.17, "lng": 24.94 },  // For circle/oval
  "radius": 50,                 // For circle/oval
  "radiusY": 30,                // For oval
  "loop": true,
  "direction": "forward",       // "forward", "backward", "ping-pong"
  "smoothing": 0,
  "tolerance": 10,
  "relativeSpeed": 1.0,
  "params": { ... }             // Echo, silencer settings
}
```

### Sequencer Definition

```javascript
{
  "id": "seq_1",
  "label": "Drum pattern",
  "enabled": true,
  "loop": true,
  "steps": 8,
  "stepLength": 5,              // Meters per step
  "speedThreshold": 0.5,        // Min speed to advance (m/s)
  "releaseOnStop": true,
  "releaseDelay": 0.5,
  "tracks": [
    {
      "name": "Kick",
      "instrumentType": "sound",
      "instrumentId": "sound_1",
      "steps": [1, 0, 0, 0, 1, 0, 0, 0],
      "velocities": [1, 0, 0, 0, 0.8, 0, 0, 0]
    }
  ],
  "activePaths": ["path_1"],
  "resumeOnReenter": true
}
```

---

## Monitoring Playback State

The engine does not emit events to external consumers. To monitor playback, poll `getState()` using `requestAnimationFrame`:

```javascript
function updateUI(timestamp) {
  if (!runtimeEngine.isPlaying) return;

  const state = runtimeEngine.getState();

  state.sounds.forEach(sound => {
    if (sound.isPlaying) {
      // Sound is currently producing audio
    }
  });

  state.sequencers.forEach(seq => {
    if (seq.enabled && seq.insideArea) {
      // Sequencer is actively triggering
    }
  });

  requestAnimationFrame(updateUI);
}

// Start polling when playback begins
requestAnimationFrame(updateUI);
```

---

## Background/Foreground Handling

The engine automatically handles tab visibility changes:

- **Tab hidden** — stops all sounds and pauses the update loop
- **Tab visible** — resumes audio context and restarts the update loop

No action needed from your code.

---

## Relative Positioning

When `relativePositioning` is `true` in the buzz data, all coordinates are stored as meter offsets from the user's position at load time. This means the same buzz will work at any GPS location — the layout appears around wherever the user currently is.

The engine calls `GeolocationManager.waitForLocation()` before placing elements, so GPS must be available.

---

## Browser Requirements

| Requirement | Reason |
|-------------|--------|
| HTTPS | Required for Geolocation API and Web Audio |
| Modern browser | Chrome, Firefox, Safari, Edge |
| Location permission | If the buzz uses GPS positioning |
| User gesture for audio | Browsers require a click/tap before audio can play |

---

## Error Handling

All async methods (`initialize`, `loadBuzz`, `start`) throw on failure. Wrap them in try/catch:

```javascript
try {
  await runtimeEngine.initialize({ mapContainer: el });
  await runtimeEngine.loadBuzz(data);
} catch (error) {
  console.error('Engine failed:', error.message);
  // Show user-friendly error
}
```

Common errors:

| Error | Cause |
|-------|-------|
| `"Map container not found"` | The container element doesn't exist in the DOM |
| `"Engine not initialized"` | Called `loadBuzz()` or `start()` before `initialize()` |
| `"Engine not initialized. Call initialize() first."` | Same as above |
| Audio context suspended | `start()` was not called from a user gesture |
| Sound file 404 | Audio file path in buzz.json doesn't match deployed files |

---

## Complete Example

A minimal but complete player:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Buzz Player</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <style>
    html, body, #map { margin: 0; height: 100%; }
    #controls { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 1000; }
    button { padding: 12px 24px; font-size: 16px; cursor: pointer; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="controls">
    <button id="playBtn">Start</button>
    <span id="status">Loading...</span>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/tone"></script>
  <script src="https://cdn.jsdelivr.net/npm/resonance-audio/build/resonance-audio.min.js"></script>

  <script type="module">
    import { runtimeEngine } from './src/runtime/RuntimeEngine.js';

    const status = document.getElementById('status');
    const playBtn = document.getElementById('playBtn');
    let playing = false;

    try {
      await runtimeEngine.initialize({
        mapContainer: document.getElementById('map')
      });

      const res = await fetch('buzz.json');
      await runtimeEngine.loadBuzz(await res.json());
      status.textContent = 'Ready';
      playBtn.disabled = false;
    } catch (e) {
      status.textContent = 'Error: ' + e.message;
    }

    playBtn.addEventListener('click', async () => {
      if (!playing) {
        await runtimeEngine.start();
        playing = true;
        playBtn.textContent = 'Pause';
        status.textContent = 'Playing';
      } else {
        runtimeEngine.stop();
        playing = false;
        playBtn.textContent = 'Resume';
        status.textContent = 'Paused';
      }
    });
  </script>
</body>
</html>
```

---

## See Also

- [Features Reference](features.md) — all sound, path, and sequencer parameters
- [Getting Started](getting-started.md) — editor workflows
- [Examples](../examples/README.md) — example player implementations
