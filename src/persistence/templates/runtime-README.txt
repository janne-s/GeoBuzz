GeoBuzz Runtime Player - {{TITLE}}
===============================================

This is a STANDALONE buzz package with the GeoBuzz Runtime Engine.
The player interface is a boilerplate designed for customization!


WHAT'S INCLUDED
---------------

📦 buzz.json          Your buzz data (sounds, paths, sequences, settings)
🎮 index.html         Runtime player (boilerplate - customize this!)
🎨 player-styles.css  Player styling (customize to match your design!)
🔧 src/              GeoBuzz Runtime Engine (audio/spatial modules)
🎵 sounds/           Audio files referenced by SoundFile and Sampler elements
📖 README.txt         This file


ARCHITECTURE: ENGINE MODEL
--------------------------

This package uses GeoBuzz as an ENGINE, not a full application:

   ┌─────────────────────┐
   │   YOUR PLAYER UI    │  ← Customize index.html & CSS
   │   (index.html)      │
   └──────────┬──────────┘
              │
   ┌──────────▼──────────┐
   │  GeoBuzz Engine     │  ← Handles audio/spatial
   │  (RuntimeEngine.js) │
   └─────────────────────┘
              │
   ┌──────────▼──────────┐
   │    buzz.json        │  ← Your buzz data
   └─────────────────────┘

The engine provides audio/spatial capabilities.
The player provides the user interface.
You customize the player, the engine handles the buzz!


DEPLOYMENT
----------

STRUCTURE:
   {{FILENAME}}/
   ├── buzz.json           (Your buzz data)
   ├── index.html          (Player - CUSTOMIZE THIS!)
   ├── player-styles.css   (Styles - CUSTOMIZE THIS!)
   ├── sounds/            (Audio files - included automatically)
   ├── README.txt          (This file)
   └── src/               (Engine - don't modify)
       └── runtime/
           └── RuntimeEngine.js

STEPS:
1. Extract this package
2. Customize index.html and player-styles.css (optional)
3. Deploy to any HTTPS web server or run locally
4. Click "Start Buzz"


CUSTOMIZING THE PLAYER
----------------------

The included player is a BOILERPLATE. Here's how to customize it:

1. CUSTOMIZE THE UI (index.html):
   - Change the layout in the <div class="player-ui"> section
   - Add your own controls, visualizations, info panels
   - Add custom interactions with the buzz

2. CUSTOMIZE THE STYLES (player-styles.css):
   - Change colors, fonts, positioning
   - Add your brand identity
   - Create unique visual presentations

3. USE THE ENGINE API:

   The RuntimeEngine provides a simple API:

   // Initialize
   import { runtimeEngine } from './src/runtime/RuntimeEngine.js';
   await runtimeEngine.initialize({
     mapContainer: document.getElementById('map'),
     mapConfig: { center: [0, 0], zoom: 2 }
   });

   // Load buzz
   await runtimeEngine.loadBuzz(buzzData);

   // Control playback
   await runtimeEngine.start();  // Start audio
   runtimeEngine.stop();          // Stop audio

   // Access state
   const state = runtimeEngine.getState();
   console.log(state.sounds.length); // Number of sounds

   // Cleanup
   runtimeEngine.dispose();


UPDATING THE BUZZ
-----------------

To update buzz content without changing the player:

1. Open GeoBuzz editor
2. Make your changes
3. Click "Save Settings" → download settings.json
4. Rename settings.json to buzz.json
5. Replace buzz.json in your deployed folder
6. Refresh the browser


REQUIREMENTS
------------

✓ Modern browser (Chrome, Firefox, Safari, Edge)
✓ HTTPS web server (required for geolocation and audio APIs)
✓ Location permissions (if buzz uses geolocation)


TROUBLESHOOTING
---------------

❌ "Failed to load buzz.json"
   → Check buzz.json exists next to index.html

❌ CORS/module errors
   → Must use HTTPS web server (not file://)

❌ No audio
   → Click "Start Buzz" (browser requirement)
   → Check browser console for errors

❌ Map not showing
   → Check browser console
   → Verify Leaflet is loading

❌ Location not working
   → Use HTTPS web server (required)
   → Grant location permissions when prompted


PERFORMANCE OPTIMIZATION
-------------------------

By default, the exported buzz loads external libraries from CDNs:

  • Leaflet (map library) - from unpkg.com
  • Tone.js (audio library) - from unpkg.com
  • Resonance Audio (spatial audio) - from cdn.jsdelivr.net
  • Font Awesome (icons) - from cdnjs.cloudflare.com

For better performance, especially for offline use:

1. DOWNLOAD LIBRARIES LOCALLY:
   - Download Leaflet from https://leafletjs.com/download.html
   - Download Tone.js from https://unpkg.com/tone
   - Download Resonance Audio from https://cdn.jsdelivr.net/npm/resonance-audio/build/
   - Download Font Awesome from https://fontawesome.com/download

2. UPDATE index.html:
   - Replace CDN URLs with local paths
   - Example: Change from:
     <script src="https://unpkg.com/tone"></script>
     To:
     <script src="./lib/tone.js"></script>

3. BENEFITS:
   ✓ Faster loading (no external requests)
   ✓ Works offline
   ✓ No dependency on external CDN availability
   ✓ Consistent versions

4. STRUCTURE:
   {{FILENAME}}/
   ├── lib/               (Optional - add your downloaded libraries here)
   │   ├── leaflet.js
   │   ├── leaflet.css
   │   ├── tone.js
   │   ├── resonance-audio.min.js
   │   └── font-awesome/
   ├── buzz.json
   ├── index.html
   └── ...


DEVELOPMENT TIPS
----------------

1. Keep buzz.json and player separate
   - Update buzz via GeoBuzz editor
   - Develop player independently

2. The engine is modular
   - Import only RuntimeEngine.js
   - No need to modify engine code

3. Deploy to HTTPS web server
   - Any static web hosting with HTTPS support
   - HTTPS required for geolocation and audio APIs


NOTES
-----

• This is a STANDALONE package
• No GeoBuzz editor needed for playback
• Player is customizable boilerplate code
• Engine handles all audio/spatial processing
• Update buzz and player independently


RESOURCES
---------

GeoBuzz Engine API: Check RuntimeEngine.js for available methods
Leaflet Map API: https://leafletjs.com/reference.html
Tone.js Audio API: https://tonejs.github.io/docs/


Generated by GeoBuzz Editor v{{VERSION}}
