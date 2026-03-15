# Max/MSP Example Patch

Simple Max/MSP patch to receive and parse GeoBuzz OSC messages.

## Basic Receiver

```
┌──────────────────┐
│  [udpreceive 9000]
└────────┬─────────┘
         │
┌────────▼─────────┐
│  [route /geobuzz]
└────────┬─────────┘
         │
    ┌────▼────┬──────────┐
    │         │          │
  user    {layer}   {soundName}
    │         │          │
```

## User Position Tracking

```
[udpreceive 9000]
│
[route /geobuzz]
│
[route user]
│
[route lat lng direction]
│    │    │
│    │    └──────────> [prepend direction]
│    └───────────────> [prepend lng]
└────────────────────> [prepend lat]
                       │
                       [print USER]
```

## Sound Object Monitoring

For a sound named "ambient_1" on layer "background":

```
[udpreceive 9000]
│
[route /geobuzz]
│
[route background]  # layer name
│
[route ambient_1]  # sound name
│
[route x y distance gain lat lng]
│    │  │        │    │   │
│    │  │        │    │   └─> [prepend lng]
│    │  │        │    └────> [prepend lat]
│    │  │        └─────────> [prepend gain]
│    │  └──────────────────> [prepend distance]
│    └─────────────────────> [prepend y]
└──────────────────────────> [prepend x]
```

For a sound without a layer:

```
[udpreceive 9000]
│
[route /geobuzz]
│
[route synth_1]  # sound name (no layer)
│
[route x y distance gain]
│    │  │        │
```

## Echo Monitoring

For echoes on a sound:

```
[udpreceive 9000]
│
[route /geobuzz]
│
[route background ambient_1]  # layer and sound
│
[route echo_path1 echo_path2]  # echo names
│             │
│             [route x y distance gain]
│
[route x y distance gain]
```

## Complete Example Patch

Create a new Max patch and add these objects:

```
[udpreceive 9000]
│
[route /geobuzz]
│
┌──────┴──────┬───────────┬────────────┐
│             │           │            │
user      layer1     layer2      soundName
│             │           │            │
[r.user]  [r.layer1] [r.layer2]   [r.sound]
```

### User Position Subpatch (r.user)

```
[inlet]
│
[route lat lng direction]
│    │    │
│    │    [s user.direction]
│    [s user.lng]
[s user.lat]
```

### Layer Subpatch (r.layer1)

```
[inlet]
│
[route *]  # routes all sound names
│
[prepend set]
│
[r layer1.sounds]  # list of sound names
```

### Sound Subpatch (r.sound)

```
[inlet]
│
[route x y distance gain lat lng]
│    │  │        │    │   │
│    │  │        │    │   [s $1.lng]
│    │  │        │    [s $1.lat]
│    │  │        [s $1.gain]
│    │  [s $1.distance]
│    [s $1.y]
[s $1.x]
```

## Using the Data

### Control volume from distance

```
[r ambient_1.distance]
│
[scale 0. 100. 1. 0.]  # invert: closer = louder
│
[line~]
│
[*~ 1.]
│
[dac~]
```

### Map x/y position to stereo panning

```
[r ambient_1.x]
│
[scale -50. 50. -1. 1.]  # x position to pan (-50m to 50m range)
│
[line~]
│
[*~ 1.]  # apply to left/right channels
```

### Rotate sound field based on user direction

```
[r user.direction]
│
[- 180.]  # normalize to -180 to 180
│
[/ 180.]  # normalize to -1 to 1
│
[line~]
│
[*~ 1.]  # rotate entire sound field
```

### Distance-based filtering

```
[r ambient_1.distance]
│
[scale 0. 100. 20000. 500.]  # far = low-pass
│
[line~]
│
[lores~]  # low-pass filter
```

## Dynamic Sound Routing

Handle any sound on any layer:

```
[udpreceive 9000]
│
[route /geobuzz]
│
[unpack s s s]  # layer, sound, param
│      │    │
│      │    [s $2.param]
│      [s $1.sound]
[s layer]

# Then use naming convention:
[r background.ambient_1.x]
[r background.ambient_1.gain]
etc.
```

## Integration with M4L

Create a Max for Live device:

1. Create new Max Audio Effect
2. Add `[udpreceive 9000]` in patch
3. Map OSC values to Live parameters
4. Map to device controls

Example Live control:

```
[r ambient_1.gain]
│
[scale 0. 1. 0 127]  # to MIDI range
│
[live.dial Volume]
│
[scale 0 127 0. 1.]
│
[live.gain~]
```

## Tips

- **Use [route /geobuzz]** first to filter GeoBuzz messages
- **Use [send]/[receive]** for clean patching with dynamic names
- **Scale values** appropriately for your use case
- **Add [print]** objects for debugging
- **Use [prepend]** to label values
- **Use [scale]** to map ranges
- **Layer names and sound names** are sanitized (special chars become underscores)

## Testing

1. Start GeoBuzz OSC bridge server
2. Open this Max patch
3. Should see messages in Max console
4. Click on number boxes to see values update
5. Add [print] objects to debug message flow

## Common Issues

**No messages received**
- Check UDP port matches bridge target (default 9000)
- Verify bridge server is running
- Check firewall settings

**Messages but no parsing**
- Check OSC address format matches [route] arguments
- Add [print] before [route] to see raw messages
- Remember all addresses start with `/geobuzz/`

**Values out of range**
- Add [scale] objects to map to expected range
- Check data types (int vs float)
- Use [clip] to limit extreme values

## Message Examples

Real examples of what you'll receive:

```
/geobuzz/user/lat 60.1699
/geobuzz/user/lng 24.9384
/geobuzz/user/direction 45.0

/geobuzz/background/ambient_1/x 12.5
/geobuzz/background/ambient_1/y -8.3
/geobuzz/background/ambient_1/distance 15.2
/geobuzz/background/ambient_1/gain 0.75
/geobuzz/background/ambient_1/lat 60.1700
/geobuzz/background/ambient_1/lng 24.9385

/geobuzz/synth_1/x 5.0
/geobuzz/synth_1/y 10.0
/geobuzz/synth_1/distance 11.2
/geobuzz/synth_1/gain 0.5

/geobuzz/background/ambient_1/echo_path1/x 20.0
/geobuzz/background/ambient_1/echo_path1/y 15.0
/geobuzz/background/ambient_1/echo_path1/distance 25.0
/geobuzz/background/ambient_1/echo_path1/gain 0.3
```
