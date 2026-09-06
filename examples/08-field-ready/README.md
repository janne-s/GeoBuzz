# Example 8: Field-Ready Player

A small map-and-button player built to survive a real phone outdoors.

## Features

- Silent switch handled, so an iPhone does not mute the piece
- Screen kept awake while walking, re-acquired on return to the page
- Audio interruptions detected and offered back to the listener
- Audio preloaded with a progress bar before playback starts
- Buzz can be relocated to wherever the listener is standing
- Synthetic walk for developing without going outside

## Use Cases

- Any piece people walk through outdoors
- Public events where listeners arrive on their own phones
- Testing a buzz far from where it is anchored
- Developing a location piece at a desk

## How It Works

Playback starts from a single tap, which is also where the silent switch is
handled and the screen lock is held off. Sound files are fetched with a
progress bar first, so loading does not look like a broken piece.

After that the audio context is watched rather than polled. When the browser
or the operating system pauses the audio — a call, another app, the page going
to the background — the listener gets a panel offering it back, worded for what
actually happened.

## URL Modes

| Mode | Effect |
|------|--------|
| `?here=1` | Moves the whole buzz so its centre sits where you are standing. Distances are preserved. You begin in the middle of the work rather than walking into it. |
| `?demo=1` | Walks a synthetic listener between the sounds, one step per second. The engine cannot tell the difference. |

## Structure

```
08-field-ready/
├── index.html      # Player
├── styles.css      # UI styles
├── buzz.json       # Sample 4-stop buzz
└── README.md       # This file
```

## Sample Buzz

The included `buzz.json` is the 4-stop tour from example 4, which is synth-only
— the loading bar completes instantly. Swap in a buzz with samples to see
preloading do real work.
