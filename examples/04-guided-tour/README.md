# Example 4: Guided Tour

Narrative-driven walking experience with waypoints and progress tracking.

## Features

- Progress bar showing journey completion
- Waypoint system ("Stop 2 of 4")
- Distance and direction to next stop
- Visited/unvisited waypoint states
- Completion celebration
- Clean, minimal UI

## Use Cases

- City walking tours
- Museum audio guides
- Heritage trail experiences
- Art installation paths
- Campus tours
- Nature walk narratives

## How It Works

Each sound in the buzz represents a tour stop. When you enter a sound's range:
1. The stop is marked as visited
2. Progress bar updates
3. Next waypoint is highlighted
4. Direction arrow points to the next unvisited stop

## Structure

```
04-guided-tour/
├── index.html      # Tour player
├── styles.css      # UI styles
├── buzz.json       # Sample 4-stop tour
└── README.md       # This file
```

## Sample Tour

The included `buzz.json` creates a square walking path with 4 stops:
- **Welcome** (north) - Starting point
- **History** (east) - Second stop
- **Nature** (south) - Third stop
- **Finale** (west) - Final destination

Each stop is ~20 meters apart, making it easy to test by walking.

## Customization

Replace `buzz.json` with your own exported buzz. The tour will automatically:
- Count all sounds as waypoints
- Track visits in order of proximity
- Update progress accordingly

For a true linear narrative, arrange sounds along a path in your buzz editor.
