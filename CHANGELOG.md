# Changelog

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