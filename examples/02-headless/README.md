# Example 2: Sound Compass (Headless)

Map-free audio navigation experience. Point your device toward sounds using a compass-style interface.

## Features

- No map dependency
- Visual compass arrow pointing to target sound
- Distance display in meters
- Sound list with distance and direction indicators
- Stereo guidance ping (optional audio cue)
- Device orientation support (compass heading)
- GPS location tracking
- Spatial audio panning based on direction

## Guidance Ping

The optional stereo guidance ping provides audio feedback for alignment:

- Two oscillators panned hard left and right
- When facing away: pings are delayed and detuned
- When facing toward target: pings are synchronized and in tune
- Volume increases as alignment improves

Toggle the ping with the button in the top-right corner.

## Use Cases

- Audio geocaching / sound hunts
- Accessible audio navigation
- Audio walks without screen dependency

## Requirements

- HTTPS (required for geolocation and device orientation)
- Modern browser with Web Audio API
- Device with GPS and compass (for full experience)

## Files

- `index.html` - Main entry point
- `styles.css` - UI styles
- `main.js` - Application logic
- `CompassView.js` - Arrow and distance display
- `SoundList.js` - Target selection list
- `GuidancePing.js` - Stereo audio cue module
- `buzz.json` - Sound composition data
