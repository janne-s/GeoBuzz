# Changelog

## 2026-08-21

### Added

- Speed Scale for distance sequencers, turning them into arpeggiators that keep pace with the listener
- Sequencer tracks can be modulated from a sound element, like sound elements already could

### Changed

- Each sequencer note now gets its own attack
- Sequencer release time now matches the value you set

### Fixed

- Release on Stop not firing when movement stopped
- Cancel leaving sequencer notes sounding in point-to-point simulation
- Cancel detaching from a path instead of stopping the simulation
- Sequencer notes cutting out instead of releasing
- Sequencer notes after the first playing with no attack
- New paths reusing an existing path ID
- Silencer paths not silencing distance sequencers
- Silencer on a line path silencing its whole area
- Duplicated paths sharing the original's silencer
- Duplicated paths losing their tolerance, layers and speed
- Path labels sitting away from the shape instead of on its edge like sound labels
- Muting a layer not silencing or dimming its elements
- Volume jumping back up when leaving a sound whose volume is modulated
- Volume modulation having no effect on a sequencer track's internal synth
- Echo taps ignoring silencer paths
- Layer effects still audible inside a silencer

## 2026-08-20

### Changed

- Server-kit replaces sound URL resolution instead of two large files

### Fixed

- Server-kit missing the grid sampler per-key speed gate hold
- Server-kit restarting the route animation when simulation speed changed
- Sequencer sound areas never triggering
- Sequencer stuck outside its area after reload
- Duplicated sounds sharing the original's persistent ID

## 2026-08-15

### Added

- "Don't show this again" checkbox on the welcome/info modal
- Heading indicator on the user marker, following GPS heading or device orientation
- "Go to Buzz" in the user menu, fitting the composition in view with the user marker at its centre
- Offer to go to the Buzz after loading or importing one that is far from your current location

### Changed

- Geolocation permission is now requested after the welcome modal resolves instead of racing it on page load
- Increased maximum map zoom by one level (18 → 19, via tile overzoom), in the editor and the exported player
- `watchPosition` no longer requests `enableHighAccuracy` on non-touch devices
- A user-position icon now always appears at the fallback location (0,0) once geolocation fails or is unsupported
- User marker in the exported player now matches the editor's
- Speed gate dual slider is now grey, matching the sliders around it

### Fixed

- Device orientation not working on some Android devices
- Map snapping back to the GPS position while working elsewhere
- Server-kit's `WorkspaceManager.js` template missing the welcome-modal/GPS-sequencing call
- Sliders and checkboxes taking the system accent colour, turning them blue on iOS
- Menu buttons and toolbar icons taking the system button colour, turning them blue on iOS
- Collapsible section and octave arrows rendering as emoji on iOS

## 2026-04-08

### Note

All the features that I've had in my mind have been implemented. The work is focused on testing and possible bug fixing.

### Added

- Per-note speed gate hold in distance sequencer, falling back to sequencer-level hold
- Sequencer-level speed gate (min/max range with hold) replacing the single speed threshold
- Collapsible Settings section in the sequencer Tracks tab

## 2026-04-07

### Added

- Speed gate hold for sampler grid mode per-key speed ranges, falling back to sound-level hold
- Speed gate hold parameter on the Spatial tab for all sound types

## 2026-04-06

### Fixed

- Sequencer and track mute/solo, restart on re-enter, and release delay not persisted across sessions
- Internal ADSR neutralization for sequencer synths to prevent user envelope bleed
- Double-release of retrigger notes in distance sequencer
- Speed change continuity during simulation
- Simulation status text sequencing

## 2026-04-02

### Added

- Per-note speed gate in the distance sequencer with dual-range slider editor, origin-note inheritance for sustains, and per-step gating

### Fixed

- Removing a sustain mid-chain now cuts the tail of the chain instead of leaving orphaned sustains
- Track deletion in the distance sequencer now requires confirmation

## 2026-04-01

### Changed

- Consolidated speed gate into a unified min/max range on the Spatial tab for all sound types, replacing the separate spatial min-only gate and sampler-specific speed range

## 2026-03-31

### Changed

- Replaced OSRM routing with Overpass API and client-side Dijkstra for point-to-point simulation

### Fixed

- Speed gate behavior for sampler (single and grid mode) and spatial min speed gate

## 2026-03-30

### Added

- Per-key speed gate for grid mode sampler

## 2026-03-29

### Fixed

- Speed gate parameter missing from the spatial section UI

## 2026-03-28

### Added

- Solo and mute controls for distance sequencers (per-sequencer and per-track)

### Fixed

- Duplicated sequencers not playing in sync due to copied runtime track state

## 2026-03-27

### Added

- Scene change zones for distance sequencer: control paths can trigger scene switches based on listener position
- Base scene setting for the distance sequencer (fallback scene when outside all scene change zones)

### Fixed

- Sequencer pitch modulation overriding piano roll notes (now uses detune for correct polyphonic behavior)
- Duplicating a track mid-playback causing it to wait for loop restart before playing
- Scene changes not reflected live in the sequencer UI (scene dropdown, track grid, scene change section)

## 2026-03-26

### Added

- Scene system for the distance sequencer (multiple step pattern configurations per sequencer)
- Duplicate track in the distance sequencer

### Fixed

- Sustain painting blocking note input afterwards
- Sequencer label not updating live in the navigation dropdown
- Distance sequencer LFO modulation now runs at frame rate instead of GPS update rate
- Release envelope using exponential curve for perceptually correct fade-out on synths

## 2026-03-25

### Added

- Splash message functionality
- GPS instability as a mod source

## 2026-03-24

### Added

- Sustain painting in the distance sequencer
- GPS responsiveness as a parameter

## 2026-03-21

### Changed

- Creates the workspace after the first action, not at the first page load

## 2026-03-17

### Added

- Info side menu item