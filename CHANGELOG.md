# Changelog

## 2026-08-28

### Added

- Line elements always show their centre line, not only in centreline mode

### Changed

- Speed gate hold, its stand-still rule and the sampler grid speed ranges are now one shared implementation instead of six
- Speed gate now opens and closes with the sound's attack and release instead of cutting
- Sound files played by a sequencer follow their fade in and out

### Fixed

- The envelope ran twice on synths that carry their own, halving sustain and doubling the attack curve
- Division volume origin had no gradient on line elements
- Going to a Buzz spiked movement speed, saturating speed-driven modulation for several seconds
- Looping sound files went silent after two seconds when the listener stood still
- A looping sampler on a sequencer track never stopped when the speed gate closed

## 2026-08-27

### Fixed

- Sound file fade in and out now apply when a speed gate or an area boundary starts or stops the sound, and a loop keeps running across them

## 2026-08-26

### Changed

- Position-based audio work no longer runs on every animation frame
- Map styles are now Dark, Light and OpenStreetMap, all drawn from OpenStreetMap tiles

### Fixed

- Echo taps kept loading the CPU after their sound went silent

## 2026-08-25

### Added

- Loop end starts at the end of the sound when a file is loaded
- Runtime API docs and the exported README explain how to feed your own compass heading

### Changed

- Removed an unused listener-orientation function and the source-listing endpoint the export no longer needs

### Fixed

- Both exports left out modules the player needs, producing a player that would not start
- An export that could not include every module or sound now fails instead of reporting success
- The exported player's Elements list left out sequencers
- Workspaces over 100 KB stopped saving, without telling anyone
- A workspace save that fails twice in a row now says so
- Directory listing of the workspaces folder is now denied from the repository, not only by server config
- Looping a sound file was unreliable, and restarted audibly on every pass
- The loop end slider could not reach the end of the file
- Bearing panning collapsed stereo sound files to mono
- Pan did nothing on sound files, samplers and streams, by hand or by modulation
- Modulating a sound file's speed had no effect
- Inertia was offered for LFO modulation, where it does nothing
- A modulation target the element does not offer was shown as selected but never applied, and survived a change of element type
- An element's position and size stayed offset when its position modulation was turned off
- Echoes went silent after changing an element's sound type or spatial mode
- Changing the spatial or panning mode left elements near silent until you left the area and returned

## 2026-08-24

### Changed

- The three-band EQ is allocated only when it is enabled
- Audio output uses a playback-oriented buffer instead of the browser's smallest
- The runtime API exposes a fixed set of managers instead of the whole engine
- Less repeated geometry, allocation and audio work per frame

### Fixed

- Playing a chord no longer overwrites a sequencer track's saved polyphony setting
- Notes could stick on permanently when moving quickly across sequencer areas
- Removing a sequencer track left its sounding notes playing
- A sound file could not trigger again after playing to its end
- Speed gates let a note start briefly on every step
- Loop start and end were ignored, and dragging either to the end of the file broke playback
- Changing a sound file's playback mode while looping left the loop running
- Uploading a sound failed on PHP 8.5
- A failed sound upload showed the browser's parser error instead of the server's reason

## 2026-08-22

### Added

- Freeverb and JC Reverb effects, far cheaper than the convolution reverb
- Sequencer tracks can be assigned to a user layer, sharing its effect chain
- Mute and solo in the Elements list for every element that takes part in audio processing

### Changed

- Tone.js and resonance-audio pinned to fixed versions
- The audio loop now sleeps when there is nothing to update
- Layer effects disconnect once the layer has been silent for longer than its tail
- Sequencer track effects disconnect once the track has been silent for longer than its tail
- The selection pulse animates opacity instead of box-shadow, so it no longer repaints every frame

### Fixed

- Duplicate audio loops starting on tab return and on assigning a movement path
- A sequencer sending UI updates while outside its area
- Sequencer synths staying in the audio graph once a track had played
- Clearing all elements leaving sequencer synths behind
- A layer saved muted loading unmuted
- The layer gain slider ignoring mute, solo and silencers
- A duplicated layer not being assignable to elements
- A new layer sounding while another layer is soloed
- Go and Cancel dropping onto separate rows in the simulation panel
- The direction readout searching the document and redrawing on every frame
- Sound markers on a movement path redrawing when they had not moved
- A sound jumping to full volume when first heard from very close to its icon
- A duplicated layer losing its effects
- Clearing all elements leaving stale layer references behind
- The layer menu repeating the layer name in its title

## 2026-08-21

### Added

- Inertia and invert on modulation sources, for damping or reversing a modulation
- Scale and Variability for simulation, for speeds between the presets and a less mechanical pace
- Speed Scale for distance sequencers, turning them into arpeggiators that keep pace with the listener
- Sequencer tracks can be modulated from a sound element, like sound elements already could

### Changed

- Each sequencer note now gets its own attack
- Sequencer release time now matches the value you set

### Fixed

- Echo reflections updating every frame for sounds that are out of range
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