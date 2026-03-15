# Example 5: A-Frame 3D Visualization

Immersive 3D visualization of GeoBuzz sound elements using A-Frame.

## Features

- 3D visualization of sound elements as floating spheres
- Transparent torus rings showing sound boundaries
- Optional camera view mode (AR-like experience)
- LFO animation support for size modulation
- Real-time visual feedback for active sounds
- Pulsing animations when sounds are playing
- GPS-based camera movement with smooth transitions
- Device orientation compass alignment

## Running the Example

1. Serve GeoBuzz with a local or remote server
2. Navigate to `/examples/05-aframe/`
3. Click "Start" to begin audio playback
4. Move around physically to navigate (uses GPS)
5. Click "Camera View" to toggle device camera as background (requires HTTPS)

## Sample Buzz

The included `buzz.json` demonstrates three circular sound zones positioned around the user:

- **Bass** (blue, north) - Sawtooth synth with filter modulation, breathing size animation
- **Pad** (pink, southeast) - Triangle wave with pitch modulation, gentle size pulse
- **Shimmer** (green, southwest) - Sine wave with volume modulation, dynamic size animation

Each zone has a 10-meter radius with boundaries starting 10 meters from the user's position. Uses relative positioning for portable experiences.

## Visualization

- **Center sphere**: Represents the sound source position
- **Torus ring**: Shows the sound's active radius (animates with LFO)
- **Opacity**: Playing sounds are bright, inactive sounds are dimmed
- **Pulse animation**: Active sounds pulse gently
- **Distance labels**: Show real-time distance to each sound

## Technical

- A-Frame for 3D rendering
- RuntimeEngine in headless mode (hidden map)
- Coordinate transformation: GPS offsets → 3D space
- Leaflet for internal map operations
- Tone.js for audio synthesis

## Camera View Mode

When enabled, uses the device's rear camera as the scene background for an AR-like experience. Requires:
- HTTPS connection (for camera access)
- Camera permission granted
- Device with rear-facing camera

## Customization

Replace `buzz.json` with your own exported buzz file from the GeoBuzz editor to visualize your compositions.
