# Getting Started

Quick guide to the main workflows in GeoBuzz.

---

## Placing Sounds

Add sounds to the map with position-triggered playback.

### Using the Create Element Menu

1. Open the **Create Element** menu (Shapes icon in the sidebar)
2. Choose a **shape** from the Sound column: Circle, Polygon, Line, or Oval
3. **Click on the map** to place the sound (for Circle and Oval, click to place center; for Polygon and Line, click to place points)
4. For multi-point shapes, **double-click** or press **Enter** to finish drawing

### Quick Placement

You can also **double-click** on an empty area of the map to quickly place a new Circle sound at that location.

Sounds play when the user enters their trigger area and stop on exit.

---

## Creating Paths

Draw paths to control sound movement and behavior.

1. Open the **Create Element** menu (Shapes icon in the sidebar)
2. Choose a **shape** from the Path column: Circle, Polygon, Line, or Oval
3. **Click on the map** to place path points
4. Press **Enter** to finish drawing
5. Attach sounds to the path

### Path Editing

- **Drag vertices** to reshape
- Adjust **smoothing** for curve interpolation

---

## Setting Up Sequencers

Create step sequences driven by walking distance.

1. Open the **Sequencing** menu (Drum icon) and click **Distance Sequencer**
2. Define **trigger area** on the map
3. Set **step count** and **step length** (meters)
4. Add **tracks** (synth or sound trigger)
5. Configure **notes/triggers** for each step

The sequence advances as the user walks through the area.

---

## Applying Effects

Add audio effects to sounds.

1. Click a **sound marker** on the map to open its editor panel
2. Go to the **FX** tab
3. Choose effects for **slots 1-3**
4. Adjust **wet/dry mix** per effect
5. Go to the **EQ** tab to configure the equalizer 

---

## Testing with Simulation

Preview your composition without physical movement.

### Point-to-Point Simulation

1. **Click the user marker** on the map to open User Settings
2. Select **Simulate Point-to-Point**
3. **Click on the map** to place a target marker
4. Choose a **speed** (Walking, Running, Cycling, Bus)
5. Click **Go** to calculate a route and start simulation

### Path Simulation

1. Create a **path** first (line, polygon, etc.)
2. **Click the user marker** on the map to open User Settings
3. Select **Simulate Along Path** and choose which path
4. Set **direction** (Forward, Backward, Ping-Pong)

Audio responds in real-time to simulated position.

---

## Organizing with Layers

Group related elements for easier management.

1. Open the **Layers** menu (Layer Group icon in the sidebar)
2. Click **Add Layer** to create a new layer with name and color
3. Open a sound or path editor and go to the **Layers** tab to assign it
4. Toggle **visibility** per layer in the Layers menu
5. Use the **Default Layers** (Sounds, Control) to quickly show/hide all sounds or paths

---

## Exporting for Deployment

Package your composition for standalone playback.

### Export as ZIP

1. Open the **Helper** menu (Wrench icon)
2. Under **Buzz Operations**, click **Export Buzz ZIP**
3. Toggle **Relative Positioning** if you want the layout to deploy to any location (otherwise it stays fixed to original coordinates)
4. **Upload** the ZIP to an HTTPS server
5. Users access via web browser with GPS enabled

The exported ZIP includes all necessary player files (buzz.json, index.html, CSS, audio files, and the runtime engine).

---

## Importing a Buzz

Import a previously exported buzz package into your workspace.

1. Open the **Helper** menu (Wrench icon)
2. Under **Buzz Operations**, click **Import Buzz ZIP**
3. Select a `.zip` file containing a buzz package
4. Choose your import options:

### Import Mode

- **Full Buzz** — Import all elements (sounds, paths, sequencers) and audio files
- **Sounds Only** — Import only the audio files, not the composition elements

### Sound File Conflicts

If imported audio files have the same names as files already in your workspace:

- **Skip existing** — Keep your current files, don't import conflicting ones
- **Overwrite** — Replace your current files with the incoming ones
- **Rename incoming** — Import the files under new names (e.g. `kick_1.wav`) to avoid conflicts

### Existing Elements

If your workspace already has elements, choose how to handle them:

- **Merge** — Add imported elements alongside your existing ones. Elements with the same IDs are kept as-is, only new ones are added. Custom parameter ranges and user layers are also merged.
- **Replace** — Clear all existing elements and load only the imported ones

---

## Saving Your Work

All data is stored locally in the browser using IndexedDB. It happens automatically after every action. Each workspace has a unique URL (visible in the Helper menu) that you can bookmark to return later.

### To File

1. Open the **Helper** menu (Wrench icon)
2. Under **Settings**, click **Save to File**
3. A JSON file downloads with your composition

### Loading

- **From bookmark** — Open your workspace URL in the browser
- **From file** — Open Helper menu and click **Load from File**

### Privacy Mode Warning

When using the browser in private/incognito mode, IndexedDB data is discarded when the window closes. Workspace URLs created in private mode will not work in normal browsing mode and vice versa. Use **Save to File** to keep a permanent copy of your work.

Browsers may also clear IndexedDB under storage pressure or after prolonged inactivity (Safari may evict data after 7 days for unvisited origins). To back up your buzz including all sound files, use **Export Buzz ZIP** — this creates a self-contained package that can be re-imported later.

### Shared Workspaces Version

Data persistence and related limits don't apply to the (self-hosted) server version. It is also the most practical platform for cross-device development. 

---

## Selecting and Managing Multiple Elements

Use bulk operations to work with multiple elements at once.

1. Open the **Selection** menu (Mouse Pointer icon)
2. Choose **Select (Click)** to click individual elements, or **Drag Select** to draw a rectangle
3. Use **Select by Layer** to select all elements in a specific layer
4. The **Selection Actions Bar** appears at the top with options to:
   - **Save** selected elements to a JSON file
   - **Duplicate** selected elements (automatically enters Move mode)
   - **Delete** selected elements
   - **Move** selected elements to a new location
   - **Clear** clear selection

---

## Splash Message

Show a one-time message to users on app load — useful for announcements, changelogs, or usage cautions.

### Setup

Create a `message.json` file in the project root:

```json
{
  "version": "2026-03-25",
  "title": "What's New",
  "body": "Your message text here."
}
```

The message appears as a modal dialog on page load. Once dismissed, it won't appear again until the `version` value changes.

### Updating the Message

Change the `version` field to any new string — every user will see the updated message exactly once.

### Disabling the Message

Delete `message.json` or remove it from the server. A missing file is handled silently.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Enter** | Finish drawing a line (path or sound) |
| **Escape** | Cancel current drawing operation |
| **Shift + Click** on sound marker or label | Delete sound (with confirmation) |
| **Shift + Click** on path marker or label | Delete path (with confirmation) |
| **Shift + Click** on vertex | Delete vertex (if path has 2+ points) |
| **Double-click** slider | Reset slider to default value |
