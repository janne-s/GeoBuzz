#!/usr/bin/env python3
import asyncio
import websockets
from websockets.datastructures import Headers
from websockets.http11 import Response
import json
import os
import signal
import ssl
from pythonosc import udp_client

OSC_TARGET_IP = os.getenv('OSC_TARGET_IP', '127.0.0.1')
OSC_TARGET_PORT = int(os.getenv('OSC_TARGET_PORT', '9000'))
WEBSOCKET_PORT = int(os.getenv('WEBSOCKET_PORT', '8081'))
USE_SSL = os.getenv('USE_SSL', 'false').lower() in ('1', 'true', 'yes')
DEBUG = os.getenv('DEBUG', '').lower() in ('1', 'true', 'yes')

osc_client = udp_client.SimpleUDPClient(OSC_TARGET_IP, OSC_TARGET_PORT)

connected_clients = set()

async def process_request(connection, request):
    """Handle regular HTTP requests (for certificate acceptance)"""
    # Check if this is a WebSocket upgrade request
    upgrade_header = request.headers.get("Upgrade", "").lower()
    if upgrade_header == "websocket":
        # Let the WebSocket handshake proceed
        return None

    # Handle regular HTTP GET requests for the root path
    if request.path == "/":
        html_content = f"""<!DOCTYPE html>
<html>
<head>
    <title>GeoBuzz OSC Bridge</title>
    <style>
        body {{ font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }}
        h1 {{ color: #667eea; }}
        .success {{ background: #d4edda; padding: 15px; border-radius: 5px; border-left: 4px solid #28a745; }}
    </style>
</head>
<body>
    <h1>GeoBuzz OSC Bridge Server</h1>
    <div class="success">
        <strong>SSL Certificate Accepted!</strong><br>
        Your browser now trusts this server's certificate.<br><br>
        You can now enable OSC streaming in GeoBuzz.
    </div>
    <p><strong>Status:</strong> WebSocket server running on this port</p>
    <p><strong>OSC Target:</strong> {OSC_TARGET_IP}:{OSC_TARGET_PORT}</p>
    <p>Return to GeoBuzz and enable OSC output in the side menu.</p>
</body>
</html>"""
        headers = Headers([("Content-Type", "text/html; charset=utf-8")])
        return Response(200, "OK", headers, html_content.encode('utf-8'))
    return None

async def handler(websocket):
    client_ip = websocket.remote_address[0]
    connected_clients.add(websocket)
    print(f'WebSocket client connected: {client_ip}')

    try:
        await websocket.send(json.dumps({
            'type': 'connected',
            'oscTarget': f'{OSC_TARGET_IP}:{OSC_TARGET_PORT}'
        }))

        async for message in websocket:
            try:
                msg = json.loads(message)

                if 'address' not in msg or 'args' not in msg:
                    print(f'Invalid message format: {msg}')
                    continue

                address = msg['address']
                args = msg['args']

                if not isinstance(args, list):
                    args = [args]

                processed_args = []
                for arg in args:
                    if isinstance(arg, dict) and 'value' in arg:
                        processed_args.append(arg['value'])
                    else:
                        processed_args.append(arg)

                osc_client.send_message(address, processed_args)

                if DEBUG:
                    print(f'→ {address} {processed_args}')

            except json.JSONDecodeError:
                print(f'Invalid JSON: {message}')
            except Exception as e:
                print(f'Message processing error: {e}')

    except websockets.exceptions.ConnectionClosed:
        pass
    except Exception as e:
        if DEBUG:
            print(f'Handler error: {e}')
    finally:
        if websocket in connected_clients:
            connected_clients.remove(websocket)
        print(f'WebSocket client disconnected: {client_ip}')

async def main():
    print('GeoBuzz OSC Bridge Server (Python)')
    print('===================================')

    ssl_context = None
    if USE_SSL:
        if os.path.exists('server.crt') and os.path.exists('server.key'):
            ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ssl_context.load_cert_chain('server.crt', 'server.key')
            print('Using SSL (secure WebSocket)')
        else:
            print('ERROR: SSL requested but certificates not found!')
            print('Generate with: openssl req -x509 -newkey rsa:4096 -nodes \\')
            print('  -keyout server.key -out server.crt -days 365 \\')
            print('  -subj "/CN=localhost"')
            return
    else:
        print('Running without SSL (insecure - for HTTP only)')

    print(f'WebSocket server on port {WEBSOCKET_PORT}')
    print(f'OSC sending to {OSC_TARGET_IP}:{OSC_TARGET_PORT}')
    print('Press Ctrl+C to stop')
    print()

    loop = asyncio.get_running_loop()
    stop = loop.create_future()

    def signal_handler(signum, frame):
        loop.call_soon_threadsafe(stop.set_result, None)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    async with websockets.serve(
        handler,
        "0.0.0.0",
        WEBSOCKET_PORT,
        ssl=ssl_context,
        process_request=process_request
    ):
        await stop

    print('\nShutting down...')
    # Close all connected clients gracefully
    if connected_clients:
        await asyncio.gather(
            *[client.close() for client in list(connected_clients)],
            return_exceptions=True
        )

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    finally:
        print('Goodbye!')
