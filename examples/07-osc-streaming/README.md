# OSC Streaming

Stream real-time spatial audio data from GeoBuzz to external applications via OSC (Open Sound Control) over WebSocket.

## Quick Start

### 1. Install Dependencies

```bash
cd examples/07-osc-streaming
pip install -r requirements.txt
```

### 2. For HTTPS Sites (Most Common)

If your GeoBuzz runs on HTTPS, you need SSL certificates:

```bash
# Generate self-signed certificate
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout server.key -out server.crt -days 365 \
  -subj "/CN=localhost"

# Start bridge with SSL
USE_SSL=true python bridge_server.py
```

**Accept the certificate in your browser:**
1. Visit `https://YOUR_HOST:8081` (use same host as your GeoBuzz URL - localhost or your local IP)
2. Click "Advanced" → "Proceed" to accept the self-signed certificate
3. You should see a "SSL Certificate Accepted!" page confirming the server is running

### 3. For HTTP Sites (Development)

```bash
# Start bridge without SSL
python bridge_server.py
```

### 4. Configure GeoBuzz

In GeoBuzz, open the side menu → OSC Streaming:
- Host: **YOUR_HOST** (same as your GeoBuzz URL - localhost or your local IP)
- Port: **8081**
- Check ☑️ **Enable OSC Output**

GeoBuzz uses WebSocket (ws:// or wss://) to communicate with the bridge server.

### 5. Start OSC Receiver

Configure your application to receive OSC on port 9000:

**Max/MSP:**
```
[udpreceive 9000]
|
[print OSC]
```

**Pure Data:**
```
[netreceive 9000 1]
|
[oscparse]
|
[print]
```

**Python:**
```python
from pythonosc import dispatcher, osc_server

def print_handler(address, *args):
    print(f"{address}: {args}")

disp = dispatcher.Dispatcher()
disp.set_default_handler(print_handler)

server = osc_server.ThreadingOSCUDPServer(("127.0.0.1", 9000), disp)
server.serve_forever()
```

## OSC Messages

All messages are prefixed with `/geobuzz/` to separate them from other OSC streams.

### User Position
```
/geobuzz/user/lat <float>        # Latitude
/geobuzz/user/lng <float>        # Longitude
/geobuzz/user/direction <float>  # Bearing (0-360°)
```

### Sound Objects
```
/geobuzz/{layerName}/{soundName}/x <float>         # Relative X position (meters)
/geobuzz/{layerName}/{soundName}/y <float>         # Relative Y position (meters)
/geobuzz/{layerName}/{soundName}/distance <float>  # Distance (meters)
/geobuzz/{layerName}/{soundName}/gain <float>      # Volume (0.0-1.0)
/geobuzz/{layerName}/{soundName}/lat <float>       # Latitude
/geobuzz/{layerName}/{soundName}/lng <float>       # Longitude
```

If the sound is not on a layer, the layer name is omitted:
```
/geobuzz/{soundName}/x <float>
```

**Note:** `x` and `y` coordinates are relative to the user's direction (bearing). The coordinate system rotates with the user:
- `y` is positive in the direction the user is facing (forward)
- `x` is positive to the user's right
- Values are calculated in meters using the Haversine formula

### Echoes (if path has echo)
```
/geobuzz/{layerName}/{soundName}/echo_{pathName}/x <float>
/geobuzz/{layerName}/{soundName}/echo_{pathName}/y <float>
/geobuzz/{layerName}/{soundName}/echo_{pathName}/distance <float>
/geobuzz/{layerName}/{soundName}/echo_{pathName}/gain <float>
```

## Configuration

### Environment Variables

```bash
# OSC target (where messages are sent)
OSC_TARGET_IP=127.0.0.1     # Default: localhost
OSC_TARGET_PORT=9000        # Default: 9000

# WebSocket server
WEBSOCKET_PORT=8081         # Default: 8081
USE_SSL=true                # Enable SSL (required for HTTPS)

# Debug mode
DEBUG=true                  # Log all messages
```

### Examples

**Send to remote OSC receiver:**
```bash
OSC_TARGET_IP=YOUR_TARGET_IP OSC_TARGET_PORT=8000 USE_SSL=true python bridge_server.py
```

**Debug mode:**
```bash
DEBUG=true USE_SSL=true python bridge_server.py
```

**Custom WebSocket port:**
```bash
WEBSOCKET_PORT=9999 USE_SSL=true python bridge_server.py
```

## Troubleshooting

### "SSL error" when connecting

You need to accept the certificate in your browser first:
1. Visit `https://YOUR_HOST:8081` (use same host as GeoBuzz)
2. Accept the security warning
3. Then enable OSC in GeoBuzz

**Important:** The hostname must match everywhere - if GeoBuzz is at `https://localhost:8443`, visit `https://localhost:8081` and set OSC Host to `localhost`. Use your local IP if accessing from other devices.

### "Mixed Content" errors

Your GeoBuzz is on HTTPS but bridge is running without SSL.
- Start bridge with: `USE_SSL=true python bridge_server.py`
- Make sure `server.key` and `server.crt` exist

### No messages received

1. Check bridge is running
2. Check OSC receiver is listening on port 9000
3. Enable debug mode: `DEBUG=true USE_SSL=true python bridge_server.py`
4. Click "Test" button in GeoBuzz OSC panel

### Port already in use

Change the WebSocket port:
```bash
WEBSOCKET_PORT=9999 USE_SSL=true python bridge_server.py
```
Then update GeoBuzz OSC settings to match the new port.

## Use Cases

- Live performances with Max/MSP or Pure Data
- VJing with TouchDesigner
- DAW integration (Ableton, Logic)
- Interactive installations
- Recording spatial audio sessions
- Multi-device synchronized experiences

## Implementation

GeoBuzz uses WebSocket for all OSC communication, automatically selecting ws:// or wss:// based on whether the site is served over HTTP or HTTPS.

**Client:** `src/debug/OSCManager.js` - WebSocket client with automatic wss:// for HTTPS sites
**Server:** `bridge_server.py` - WebSocket to OSC UDP bridge

See [max-example.md](max-example.md) for Max/MSP integration examples.
