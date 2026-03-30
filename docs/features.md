# Features Reference

Comprehensive parameter reference for all GeoBuzz menus and settings.

Numerical parameters can be freely set to any value by clicking on the parameter values next to their respective sliders.

---

## Sound Menu

Click a sound marker or label to open the sound editor panel. The editor panels can also be opened via the Elements side menu.

### Header Controls

| Control | Description |
|---------|-------------|
| **Source** | Synth type: Basic Synth, Fat Oscillator, AM Synth, FM Synth, NoiseSynth, SoundFile, Sampler, StreamPlayer |
| **Color** | Visual color for map marker and areas |
| **Shape** | Trigger area shape: Circle, Polygon, Line, or Oval |
| **Label** | Display name for the sound |

### Spatial Section (collapsible, above tabs)

Always visible above the tab bar.

#### Spatial Behavior

| Parameter | Description |
|-----------|-------------|
| **Volume Origin** | Where volume is loudest: Center Icon, Division, or Centerline |
| **Icon Position** | Fixed Center or Free Movement (whether marker can be dragged independently) |
| **Panning** | Spatial (automatic 3D) or Manual pan control |
| **Exit Behavior** | Stop at edge or Use release/fade (what happens when user leaves area) |

#### Volume Origin Modes

| Mode | Description |
|------|-------------|
| **Center Icon** | Volume peaks at the sound icon and fades toward edges (default) |
| **Division** | Volume peaks along a configurable line that divides the shape |
| **Centerline** | Volume peaks along the shape's principal axis |

**Center Icon settings:**

| Parameter | Description |
|-----------|-------------|
| **Volume Model** | Distance Based or Ray-Cast Based |

#### Ray-Cast Settings (conditional)

Appears in the Sound tab when Volume Model is set to Ray-Cast Based:

| Parameter | Description |
|-----------|-------------|
| **Gamma** | Volume curve exponent |
| **Edge Margin** | Soft edge distance |
| **Min Radius** | Minimum active radius |

**Division settings:**

| Parameter | Description |
|-----------|-------------|
| **Angle** | Division line angle |
| **Position** | Line position |

**Centerline settings:**

| Parameter | Description |
|-----------|-------------|
| **Position** | Line position along the principal axis |

#### Shape-Specific Controls

| Parameter | Shapes | Description |
|-----------|--------|-------------|
| **Radius** | Circle | Trigger area radius |
| **Scale** | Circle | Area size multiplier |
| **Tolerance** | Line | Detection distance from line |
| **Smoothing** | Line | Curve interpolation |

#### Speed Gate

| Parameter | Description |
|-----------|-------------|
| **Min Speed Gate** | Minimum movement speed (m/s) required for the sound to play. When the user's speed falls below this threshold, the sound is silenced as if the user left the area. Default: 0 (disabled) |

---

### Sound Tab

Parameters are organized by category. Which categories appear depends on the synth type selected.

#### Oscillator (Basic Synth, Fat Oscillator, AM Synth, FM Synth)

| Parameter | Description |
|-----------|-------------|
| **Pitch** | Base pitch in semitones |
| **Frequency** | Direct frequency control (Hz) |
| **Waveform** | Wave shape: Sine, Square, Sawtooth, Triangle, Pulse, PWM |
| **Pulse Width** | Width for pulse waveforms |
| **Detune** | Fine tuning offset in cents |
| **Portamento** | Glide time between notes |
| **Partial Count** | Number of harmonic partials |
| **Partial Curve** | Harmonic rolloff curve |

**Fat Oscillator** additionally shows:

| Parameter | Description |
|-----------|-------------|
| **Voice Count** | Number of unison voices |
| **Spread** | Detune spread between voices in cents |

**NoiseSynth** shows instead:

| Parameter | Description |
|-----------|-------------|
| **Noise Type** | Noise color: White, Pink, Brown |

#### Envelope (Basic Synth, Fat Oscillator, AM Synth, FM Synth, NoiseSynth)

| Parameter | Description |
|-----------|-------------|
| **Attack** | Attack time |
| **Decay** | Decay time |
| **Sustain** | Sustain level |
| **Release** | Release time |

#### Filter (Basic Synth, Fat Oscillator, AM Synth, FM Synth, NoiseSynth, SoundFile)

| Parameter | Description |
|-----------|-------------|
| **Filter Freq** | Filter cutoff frequency |
| **Filter Type** | Lowpass, Highpass, Bandpass, Allpass |
| **Resonance** | Filter resonance (Q) |

#### Modulation (AM Synth, FM Synth)

| Parameter | Description |
|-----------|-------------|
| **Harmonicity** | Ratio between carrier and modulator |
| **Mod Index** | Modulation depth (FM Synth only) |
| **Mod Waveform** | Modulator wave shape: Sine, Square, Sawtooth, Triangle |
| **Mod Attack** | Modulator envelope attack |
| **Mod Release** | Modulator envelope release |
| **Mod Partial Count** | Modulator harmonic partial count |
| **Mod Partial Curve** | Modulator harmonic rolloff curve |

#### Playback (SoundFile)

| Parameter | Description |
|-----------|-------------|
| **Speed** | Playback rate multiplier |
| **Loop** | Enable sample looping |
| **Loop Start** | Loop region start point |
| **Loop End** | Loop region end point |
| **Reverse** | Play sample backwards |
| **Fade In** | Initial fade in time |
| **Fade Out** | End fade out time |
| **Loop Fade In** | Crossfade at loop start |
| **Loop Fade Out** | Crossfade at loop end |

#### Common (all synth types)

| Parameter | Description |
|-----------|-------------|
| **Volume** | Output level |
| **Pan** | Stereo position (left to right) |
| **Curve Strength** | Volume falloff curve shape |
| **Release Mode** | Stop or Release (what happens on exit) |
| **Polyphony** | Voice limit (synths that support it) |

#### Audio File (SoundFile, Sampler)

| Control | Description |
|---------|-------------|
| **Mode** | Single or Grid sample mapping (Sampler only) |
| **File status** | Shows loaded filename and duration |
| **Load or record file** | Opens the File Manager dialog |

#### Stream Control (StreamPlayer)

| Control | Description |
|---------|-------------|
| **Stream status** | Current connection state |
| **Stream URL** | Network audio stream address |

---

### Keys Tab

For keyboard-triggered sounds.

| Control | Description |
|---------|-------------|
| **Octave** | Select active octave (0-8) |
| **Piano Keyboard** | 2-octave keyboard — click keys to assign trigger notes |
| **Clear Selection** | Remove all selected notes |
| **Grid Edit/Play Mode** | Toggle between sample assignment and preview (Sampler in Grid mode) |
| **Clear All Samples** | Remove all grid samples (Sampler in Grid mode) |
| **Speed Range** | Per-key speed range slider in single mode; per-key speed range in grid mode individual key edit dialog (Sampler only) |

---

### Mod Tab

#### Motion & Playback (SoundFile only)

| Parameter | Description |
|-----------|-------------|
| **Playback Mode** | Resample (pitch shift) or Granular (time-stretch) |

Resample mode uses only the common SoundFile features (fade, loop, etc.) already shown in the Sound tab — no additional parameters.

Granular mode adds the following parameters:

| Parameter | Description |
|-----------|-------------|
| **Time-Stretch Mode** | Adaptive or Manual grain timing |
| **Grain Size** | Duration of each grain |
| **Overlap** | Overlap between grains |
| **Pitch Shift** | Independent pitch control in cents |

Motion controls (link playback to user movement):

| Parameter | Description |
|-----------|-------------|
| **Lock to User Speed** | Scale playback speed with walking speed |
| **Reference Speed** | Walking speed that maps to 1x playback |
| **Advance only on Move** | Pause playback when user stops moving |
| **Move Trigger** | Minimum speed to continue playback |
| **Resume on Re-enter** | Continue from last position when re-entering area |

#### Position & Size LFO

| Parameter | Description |
|-----------|-------------|
| **X Position Range / Freq** | Horizontal movement amplitude and rate |
| **Y Position Range / Freq** | Vertical movement amplitude and rate |
| **Size Range / Freq** | Area size oscillation amplitude and rate |

#### Parameter Modulation (3 slots: Mod 1, Mod 2, Mod 3)

| Parameter | Description |
|-----------|-------------|
| **Source** | Modulation source: LFO, Walkable LFO, Speed, GPS Instability, Distance, X position, Y position |
| **Target** | Sound parameter to modulate |
| **Waveform** | Modulation shape: Sine, Triangle, Saw Up, Saw Down, Square, S&H, S&H Hard |
| **Range** | Modulation depth |
| **Frequency** | Rate (Hz for LFO, cycles/m for Walkable) |
| **Reference Speed** | Speed for 100% modulation (Speed source only) |
| **Speed Threshold** | Minimum speed to activate (Walkable LFO only) |
| **Reactivity** | GPS instability response scaling (GPS Instability source only) |

#### Effects Modulation (3 slots: FX Mod 1, FX Mod 2, FX Mod 3)

Same controls as Parameter Modulation, but targets effect parameters (Mix, Speed, Depth, etc.) instead of sound parameters.

---

### FX Tab

Three collapsible effect slots. Effects process in series.

#### Effect Types

| Effect | Description |
|--------|-------------|
| **None** | Bypass slot |
| **Auto Filter** | Modulated filter sweep |
| **Auto Panner** | Automatic stereo panning |
| **Auto Wah** | Envelope-following filter |
| **Chorus** | Modulated delay for thickness |
| **Feedback Delay** | Echo/delay with feedback |
| **Phaser** | Phase-shifting effect |
| **Ping Pong Delay** | Stereo bouncing delay |
| **Reverb** | Algorithmic reverb |
| **Tremolo** | Volume modulation |

#### Common Effect Parameter

| Parameter | Description |
|-----------|-------------|
| **Mix** | Wet/dry balance (0-100%) |

#### Effect-Specific Parameters

**Auto Filter:**

| Parameter | Description |
|-----------|-------------|
| **Speed** | Filter modulation rate (Hz) |
| **Base Freq** | Base filter frequency (Hz) |
| **Octaves** | Filter sweep range |
| **Depth** | Modulation depth |

**Auto Panner:**

| Parameter | Description |
|-----------|-------------|
| **Speed** | Panning rate (Hz) |
| **Depth** | Panning depth |

**Auto Wah:**

| Parameter | Description |
|-----------|-------------|
| **Base Freq** | Base filter frequency (Hz) |
| **Octaves** | Sweep range |
| **Sensitivity** | Envelope follower sensitivity (dB) |
| **Q** | Filter resonance |

**Chorus:**

| Parameter | Description |
|-----------|-------------|
| **Speed** | Modulation rate (Hz) |
| **Delay** | Delay time (ms) |
| **Depth** | Modulation depth |

**Feedback Delay:**

| Parameter | Description |
|-----------|-------------|
| **Time** | Delay time (s) |
| **Feedback** | Repeat amount |

**Phaser:**

| Parameter | Description |
|-----------|-------------|
| **Speed** | Modulation rate (Hz) |
| **Octaves** | Sweep range |
| **Base Freq** | Base frequency (Hz) |

**Ping Pong Delay:**

| Parameter | Description |
|-----------|-------------|
| **Time** | Delay time (s) |
| **Feedback** | Repeat amount |

**Reverb:**

| Parameter | Description |
|-----------|-------------|
| **Decay** | Reverb tail length (s) |
| **Pre-Delay** | Initial delay before reverb (s) |

**Tremolo:**

| Parameter | Description |
|-----------|-------------|
| **Speed** | Modulation rate (Hz) |
| **Depth** | Modulation depth |

---

### EQ Tab

Three-band equalizer.

| Control | Description |
|---------|-------------|
| **Enable EQ** | Activate equalizer |

#### EQ Bands (collapsible)

| Parameter | Description |
|-----------|-------------|
| **Low** | Low frequency gain (-24 to +24 dB) |
| **Mid** | Mid frequency gain (-24 to +24 dB) |
| **High** | High frequency gain (-24 to +24 dB) |

#### Crossover Frequencies (collapsible)

| Parameter | Description |
|-----------|-------------|
| **Low/Mid Crossover** | Low to mid transition frequency (100-1000 Hz) |
| **Mid/High Crossover** | Mid to high transition frequency (1000-10000 Hz) |

---

### Patches Tab

#### Movement Path

| Parameter | Description |
|-----------|-------------|
| **Movement Path** | Attach sound to a path for automated movement |
| **Speed** | Movement speed along path (m/s) |
| **Roundtrip** | Total path cycle duration (seconds) |
| **Behavior** | Direction: Forward, Backward, Ping-Pong |

#### Zone Boundaries

| Control | Description |
|---------|-------------|
| **Path Checkboxes** | Select which paths define active zones for this sound |

#### Modulation Patches

| Parameter | Description |
|-----------|-------------|
| **Path Selection** | Path to use as modulation source |
| **Path Output** | What aspect of path position to use: Distance, X position, Y position, Gate in/out |
| **Parameter** | Sound parameter to modulate |
| **Depth** | Modulation amount |
| **Invert** | Reverse polarity |

#### Sound Relative

| Parameter | Description |
|-----------|-------------|
| **Source Sound** | Reference sound for relative modulation |
| **Output** | Relationship metric: Proximity relative, Distance, X position, Y position, Gate |
| **Target Parameter** | Parameter to modulate |
| **Range** | Modulation depth |
| **Polarity** | Direction and scaling |

#### Reflections (Spatial Delay)

| Parameter | Description |
|-----------|-------------|
| **Enable Reflections** | Toggle spatial delay reflections |
| **Reflect From** | Path checkboxes with calculated distance/delay display |

---

### Layers Tab

#### Default Layers

| Control | Description |
|---------|-------------|
| **Sounds** | Assign to Sounds layer |
| **Control** | Assign to Control layer |

#### User Layers

Checkboxes to assign sound to custom layers. Each shows the layer's color indicator and name.

---

### Actions

| Button | Description |
|--------|-------------|
| **Delete** | Remove sound from composition |
| **Duplicate** | Create copy of sound |

---

## Path Menu

Click a path label to open the path editor panel.

### Settings Tab

#### Identity

| Parameter | Description |
|-----------|-------------|
| **Label** | Display name for path |
| **Color** | Visual color on map |

#### Path Properties

| Parameter | Description |
|-----------|-------------|
| **Tolerance** | Detection distance from path line |
| **Relative Speed** | Speed multiplier when on path |
| **Smoothing** | Curve interpolation (line and polygon paths only) |

#### Path Info

| Display | Description |
|---------|-------------|
| **Path Length** | Calculated total length in meters |

### Effects

#### Echo Effect

| Parameter | Description |
|-----------|-------------|
| **Enabled** | Toggle echo reflections |
| **Level** | Echo volume |
| **Reflectivity** | Surface reflection amount |

#### Silencer Effect

| Parameter | Description |
|-----------|-------------|
| **Curve** | Silencing curve shape |

---

### Mod Tab

#### Position LFO

| Parameter | Description |
|-----------|-------------|
| **X Position Range / Freq** | Horizontal oscillation amplitude and rate |
| **Y Position Range / Freq** | Vertical oscillation amplitude and rate |

#### Size LFO (Circular Paths)

| Parameter | Description |
|-----------|-------------|
| **Size/Radius Range / Freq** | Radius oscillation amplitude and rate |

---

### Layers Tab

| Control | Description |
|---------|-------------|
| **User Layers** | Checkboxes to assign path to custom layers |

---

### Actions

| Button | Description |
|--------|-------------|
| **Delete Path** | Remove path (with confirmation) |
| **Duplicate Path** | Create copy of path |

---

## Sequencer Menu

Click the edit button on a sequencer in the Sequencing side menu to open its editor panel.

### Tracks Tab

#### General Settings

| Parameter | Description |
|-----------|-------------|
| **Label** | Display name for sequencer |
| **Enabled** | Toggle sequencer on/off |
| **Loop** | Enable sequence looping |

#### Step Settings

| Parameter | Description |
|-----------|-------------|
| **Steps** | Number of steps in sequence |
| **Step Length** | Distance per step |
| **Speed Threshold** | Minimum speed to advance steps |

#### Release Settings

| Parameter | Description |
|-----------|-------------|
| **Release on Stop** | Release notes when user stops |
| **Release Delay** | Time before release triggers |

### Track Settings

Each track has:

| Parameter | Description |
|-----------|-------------|
| **Track Name** | Track label |
| **Instrument Type** | What the track triggers: synth or sound |
| **Instrument** | Specific synth or sound |
| **Offset** | Step offset from main sequence |
| **Offset Mode** | How offset is calculated: meters, steps, division |
| **Steps** | Per-track step count override |

### Step Editor

| Control | Description |
|---------|-------------|
| **Step Grid** | Click cells to toggle triggers |
| **Velocity** | Per-step volume |
| **Note Selection** | MIDI note for keyboard instruments |

---

### Spatial Tab

#### Active Area

| Parameter | Description |
|-----------|-------------|
| **Active Paths** | Checkboxes for paths/sounds that define where the sequencer plays. If none selected, the sequencer plays anywhere |
| **Zone Type** | Per-path zone detection mode (see below) |
| **Resume on Re-enter** | Continue from last step when re-entering the active area |
| **Restart on Re-enter** | Reset to step 0 when re-entering the active area |

#### Zone Types

| Zone | Description |
|------|-------------|
| **Interior** | Inside the shape boundary. Available for circles, ovals, and polygons. Lines have no interior |
| **Corridor** | A band outside the shape boundary, extending outward by the path's tolerance distance. The only option for lines |
| **Both** | Union of interior and corridor |

#### Scene Changes

| Parameter | Description |
|-----------|-------------|
| **Scene Change Paths** | Checkboxes for paths/sounds that trigger scene changes when the listener enters their zone |
| **Zone Type** | Same zone detection modes as active area |
| **Target Scene** | Which scene to switch to when the listener enters the zone |
| **Base Scene** | The fallback scene used when the listener is not inside any scene change zone |

When multiple scene change zones overlap, the most recently entered zone determines the active scene. When the listener exits a zone, the scene reverts to the next innermost zone's scene, or to the base scene if no other zones are active. A path can serve as both an active area and a scene change zone simultaneously.

---

### Status Display

| Display | Description |
|---------|-------------|
| **Current Step** | Shows X/Y progress |
| **Total Distance** | Accumulated distance in meters |
| **Area Status** | Inside, Outside, or Anywhere |

---

## Side Menus

### Helper Menu (Wrench Icon)

#### Settings Section

| Item | Description |
|------|-------------|
| **Save to File** | Export composition as JSON file |
| **Load from File** | Import composition from JSON |
| **Clear All Elements** | Reset workspace (with confirmation) |

#### Buzz Operations

| Item | Description |
|------|-------------|
| **Import Buzz ZIP** | Import complete package |
| **Export Buzz ZIP** | Export as standalone deployable package |
| **Export to Workspace** | Save to cloud workspace |

#### Relative Positioning

| Setting | Description |
|---------|-------------|
| **Saves layout relative to you** | Toggle relative vs absolute coordinates for export |

#### Workspace

| Item | Description |
|------|-------------|
| **Workspace URL** | Current workspace address |
| **Copy Workspace** | Copy URL to clipboard for sharing |

#### Map Style

| Item | Description |
|------|-------------|
| **Map Style Select** | Choose base map tile provider |

#### Sound Files

| Item | Description |
|------|-------------|
| **Manage Files and Buzzes** | Open file management dialog |

---

### Layers Menu (Layer Group Icon)

#### User Layers

| Control | Description |
|---------|-------------|
| **Add Layer** | Create new custom layer |
| **Layer List** | Each layer shows: color picker, name, visibility toggle, edit, delete |

#### Default Layers

| Layer | Description |
|-------|-------------|
| **Sounds** | Audio source elements visibility |
| **Control** | Paths and sequencers visibility |

---

### Create Element Menu (Shapes Icon)

The primary menu for creating sounds and paths. Contains a grid with two columns.

#### Sound Creation Tools

| Tool | Description |
|------|-------------|
| **Circle** | Create circular sound zone (click to place center) |
| **Polygon** | Create polygonal sound zone (click to place points) |
| **Line** | Create linear sound zone (click to place points, click the action bar or press Enter to finish) |
| **Oval** | Create elliptical sound zone (click to place center) |

#### Path Creation Tools

| Tool | Description |
|------|-------------|
| **Circle** | Create circular control path |
| **Polygon** | Create polygonal control path (click to place points) |
| **Line** | Create linear control path (click points, click the action bar or press Enter to finish) |
| **Oval** | Create elliptical control path |

#### Elements List

| Display | Description |
|---------|-------------|
| **Element entries** | All sounds and paths with color indicator, name, and type, click to edit |

#### Quick Placement

**Double-click** on an empty area of the map to quickly place a new Circle sound at that location.

---

### Sequencing Menu (Drum Icon)

| Item | Description |
|------|-------------|
| **Distance Sequencer** | Create new sequencer |
| **Sequencers List** | Name, status, click to edit |

---

### Interface Menu (Plug Icon)

#### OSC Streaming

| Setting | Description |
|---------|-------------|
| **Enable OSC Output** | Toggle OSC data streaming |
| **Host** | OSC destination host address |
| **Bridge Port** | WebSocket bridge port number |
| **OSC Status** | Connection status indicator |
| **Send Test Message** | Test the OSC connection |

#### Address Format

Displays the OSC address pattern format for receiving applications.

---

### Selection Menu (Mouse Pointer Icon)

Tools for selecting and managing multiple elements.

#### Selection Modes

| Mode | Description |
|------|-------------|
| **Select (Click)** | Click individual elements to select/deselect |
| **Drag Select** | Draw rectangle to select all elements within |

#### Quick Actions

| Action | Description |
|--------|-------------|
| **Select All** | Select all elements in workspace |
| **Select None** | Clear current selection |

#### Select by Layer

Lists all layers with checkboxes. Check a layer to select all elements assigned to that layer.

#### Selection Actions Bar

When elements are selected, a floating actions bar appears at the bottom of the screen showing the selection count and available actions:

| Action | Description |
|--------|-------------|
| **Save** | Export selected elements to a JSON file (respects Relative Positioning setting) |
| **Duplicate** | Create copies of all selected elements and enter move mode |
| **Delete** | Delete all selected elements (with confirmation) |
| **Move** | Enter move mode — drag any selected element to reposition the entire selection together |
| **Clear** | Deselect all elements |

---

### Import Buzz Modal

Appears when importing a buzz ZIP to a workspace.

#### Import Mode

| Option | Description |
|--------|-------------|
| **Full Buzz** | Import all elements (sounds, paths, sequencers) |
| **Sounds Only** | Import only audio files |

#### Sound File Conflicts

Appears if imported sounds conflict with existing files:

| Option | Description |
|--------|-------------|
| **Skip existing** | Don't import conflicting files |
| **Overwrite** | Replace existing files with incoming |
| **Rename incoming** | Rename imported files to avoid conflicts |

#### Existing Elements

Appears when workspace already has elements:

| Option | Description |
|--------|-------------|
| **Merge** | Add imported elements to existing workspace |
| **Replace** | Clear workspace and import only new elements |

When merging:
- Custom parameter ranges are added (existing preserved)
- User layers with new IDs are added
- Paths and sounds with new IDs are added
- Existing elements with same IDs are preserved

---

### File Manager Dialog

Accessed via "Manage Files and Buzzes" in Helper Menu.

#### Test Stream

| Control | Description |
|---------|-------------|
| **Stream URL** | URL input for testing audio streams |
| **Start/Stop** | Toggle stream playback |
| **Stream Status** | Current stream state |

#### Record Audio

| Control | Description |
|---------|-------------|
| **Start Record** | Begin recording from microphone |
| **Stop Record** | End recording |
| **Record Status** | Recording state indicator |

#### Upload File

| Control | Description |
|---------|-------------|
| **File Input** | Select local audio file |
| **Upload Progress** | Upload status |

#### Server Files

| Display | Description |
|---------|-------------|
| **File List** | Available audio files on server |
| **Select** | Choose file for current sound |
| **Download** | Download file locally |
| **Delete** | Remove file from server |
| **File Size** | Size of each file |

#### Exported Buzzes

| Display | Description |
|---------|-------------|
| **Buzz List** | Previously exported compositions |
| **Open** | Load buzz into editor |
| **Delete** | Remove exported buzz |

---

## User Settings Menu

Click the user marker on the map to access.

### Positioning Mode

| Mode | Description |
|------|-------------|
| **Follow GPS** | Track real device location |
| **Dev Mode (Draggable)** | Manually drag user position |
| **Simulate Point-to-Point** | Animated movement simulation (see below) |

### Simulation Controls

Selecting "Simulate Point-to-Point" or "Simulate Along Path" opens a controls bar.

#### Point-to-Point Simulation

1. Click "Simulate Point-to-Point" in user menu — controls bar appears with "Place a target."
2. Click on the map to place a draggable target marker
3. Drag the target to adjust position, then press **Go**
4. The app routes via OSRM pedestrian routing and animates user movement along the path

#### Path Simulation

If paths exist in the composition, the user menu shows a "Simulate Along Path" dropdown:

| Setting | Description |
|---------|-------------|
| **Path Select** | Choose a path or "Detached" |
| **Path Behavior** | Forward, Backward, or Ping-Pong |

#### Controls Bar

| Control | Description |
|---------|-------------|
| **Status** | Current simulation state message |
| **Speed** | Walking (5 km/h), Running (12 km/h), Cycling (20 km/h), Bus (35 km/h) |
| **Go** | Calculate route and start simulation (point-to-point only) |
| **Cancel** | Stop active simulation and remove target marker |

### Display

| Setting | Description |
|---------|-------------|
| **Show/Hide Accuracy** | Toggle GPS accuracy display |
| **Customize Parameters** | Open parameter customization |

### Spatial Panning

| Setting | Description |
|---------|-------------|
| **Enable Spatial Panning** | Toggle 3D audio |
| **Panning Mode** | Spatialization method: HRTF 3D, Stereo Bearing, Ambisonics |

### Ambisonics Settings

When Ambisonics mode selected:

| Parameter | Description |
|-----------|-------------|
| **Ambisonic Order** | Spatial resolution: 1st, 2nd, 3rd |
| **Gain Boost** | Output gain multiplier |
| **Distance Model** | Volume falloff curve: linear, logarithmic, none |
| **Min Distance** | Distance for full volume |
| **Stereo Width** | Stereo field width |
| **Stereo Spread** | Distance for full stereo |

### Audio Smoothing

| Parameter | Description |
|-----------|-------------|
| **Position Smoothing** | Location interpolation |
| **Max Gain Change** | Volume change limiting |
| **Dead Zone** | Minimum movement threshold |

### GPS Accuracy

| Parameter | Description |
|-----------|-------------|
| **GPS Responsiveness** | Controls Kalman filter aggressiveness. |

### Listener Direction

| Setting | Description |
|---------|-------------|
| **Use Device Orientation** | Use phone compass |
| **Listener Direction Slider** | Manual direction control |
| **Direction Arrow** | Visual indicator |

---

## Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| **Enter** | Finish line path | While drawing line path |
| **Enter** | Finish sound line | While drawing sound line |
| **Escape** | Cancel drawing | While in any drawing mode |
| **Shift + Click** on point | Remove point |
| **Shift + Click** on sound marker | Delete sound | With confirmation |
| **Shift + Click** on path marker or label | Delete path | With confirmation |
| **Shift + Click** on path vertex | Delete vertex | If path has 2+ points |

---

## Slider Interactions

| Action | Description |
|--------|-------------|
| **Double-click** a slider | Reset to default value |
| **Click** the numerical value | Edit the value directly by typing |
