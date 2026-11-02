"""Private Valhalla gateway. Secret stays on disk; no public unauthenticated API."""
import hmac
import http.client
import json
import math
import socket
import threading
from urllib.parse import urlsplit, parse_qs, urlencode
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_BODY = 256 * 1024
MAX_RESPONSE = 4 * 1024 * 1024
SECRET_PATH = Path('/run/secrets/valhalla_api_key')


def load_key(path=SECRET_PATH):
    key = path.read_bytes().strip()
    if len(key) < 32 or len(key) > 256 or not key.isascii():
        raise ValueError('Configure a private API key containing 32 to 256 ASCII bytes.')
    return key


def valid_point(point):
    if not isinstance(point, dict):
        return False
    lat, lon = point.get('lat'), point.get('lon')
    return (type(lat) in (int, float) and type(lon) in (int, float)
            and math.isfinite(lat) and math.isfinite(lon)
            and -90 <= lat <= 90 and -180 <= lon <= 180)


def valid_payload(path, payload):
    if not isinstance(payload, dict):
        return False
    if payload.get('costing') not in ('motor_scooter', 'motorcycle', 'auto'):
        return False
    if payload.get('units', 'kilometers') not in ('kilometers', 'miles'):
        return False
    allowed = {'locations', 'sources', 'targets', 'costing', 'costing_options',
               'units', 'language', 'shape_format', 'directions_options', 'verbose', 'format'}
    if not set(payload).issubset(allowed):
        return False
    if payload.get('format', 'json') not in ('json', 'osrm'):
        return False
    keys, limit = (('locations',), 50) if path == '/route' else (('sources', 'targets'), 25)
    for key in keys:
        points = payload.get(key)
        minimum = 2 if key == 'locations' else 1
        if not isinstance(points, list) or not minimum <= len(points) <= limit or not all(map(valid_point, points)):
            return False
    return True


def proxy_request(method, path, body):
    # Fixed Docker service hostname. User input can never change the destination.
    connection = http.client.HTTPConnection('nominatim' if path.startswith('/search?') else 'valhalla', 8080 if path.startswith('/search?') else 8002, timeout=20)
    try:
        connection.request(method, path, body=body or None, headers={'Content-Type': 'application/json'})
        response = connection.getresponse()
        data = response.read(MAX_RESPONSE + 1)
        if len(data) > MAX_RESPONSE:
            raise ValueError('Response too large')
        json.loads(data)
        return response.status, data
    finally:
        connection.close()


class GatewayHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.0'
    server_version = 'NovaesWebMaps'
    sys_version = ''

    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def log_message(self, *_args):
        pass  # Do not log keys, coordinates, URLs or request bodies.

    def reply(self, status, data):
        if not isinstance(data, bytes):
            data = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(data)

    def dispatch(self):
        supplied = self.headers.get_all('x-api-key', [])
        candidate = supplied[0].encode('utf-8') if len(supplied) == 1 else b''
        if not hmac.compare_digest(candidate, self.server.api_key):
            return self.reply(401, {'error': 'Unauthorized'})
        parsed = urlsplit(self.path)
        if parsed.scheme or parsed.netloc:
            return self.reply(404, {'error': 'Not found'})
        path = parsed.path
        if self.command == 'GET' and path == '/search':
            params = parse_qs(parsed.query, keep_blank_values=True)
            allowed = {'q', 'format', 'limit', 'countrycodes', 'addressdetails'}
            if not set(params).issubset(allowed) or any(len(v) != 1 for v in params.values()):
                return self.reply(400, {'error': 'Invalid search parameters'})
            query = params.get('q', [''])[0].strip()
            if not 3 <= len(query) <= 350 or params.get('format', ['jsonv2'])[0] != 'jsonv2' or params.get('limit', ['2'])[0] not in ('1', '2'):
                return self.reply(400, {'error': 'Invalid address query'})
            # The bounded city extract has no enclosing state boundary relation.
            # State is implicit in this Canoas-only service; keep street/number/neighbourhood/city.
            query = ', '.join(part.strip() for part in query.split(',') if part.strip().casefold() not in ('rs', 'rio grande do sul'))
            search_path = '/search?' + urlencode({'q': query, 'format': 'jsonv2', 'limit': '2', 'countrycodes': 'br', 'addressdetails': '1', 'bounded': '1', 'viewbox': '-51.32,-29.78,-51.05,-30.02'})
            try:
                status, data = proxy_request('GET', search_path, b'')
                return self.reply(status, data)
            except (OSError, ValueError, http.client.HTTPException):
                return self.reply(502, {'error': 'Address service unavailable'})
        if (self.command, self.path) not in {('GET', '/status'), ('POST', '/route'), ('POST', '/sources_to_targets')}:
            return self.reply(404, {'error': 'Not found'})
        body = b''
        if self.command == 'POST':
            lengths = self.headers.get_all('Content-Length', [])
            if self.headers.get('Transfer-Encoding') or len(lengths) != 1 or not lengths[0].isdigit():
                return self.reply(400, {'error': 'Invalid request length'})
            length = int(lengths[0])
            if not 0 < length <= MAX_BODY:
                return self.reply(413, {'error': 'Payload too large'})
            if self.headers.get_content_type() != 'application/json':
                return self.reply(415, {'error': 'JSON required'})
            try:
                body = self.rfile.read(length)
                if len(body) != length:
                    raise ValueError('Incomplete body')
                payload = json.loads(body)
                if not valid_payload(self.path, payload):
                    raise ValueError('Invalid coordinates or request')
            except (ValueError, UnicodeError, RecursionError):
                return self.reply(400, {'error': 'Invalid route request'})
        try:
            status, data = proxy_request(self.command, self.path, body)
            return self.reply(status, data)
        except (OSError, ValueError, http.client.HTTPException):
            return self.reply(502, {'error': 'Routing service unavailable'})

    def do_GET(self):
        try:
            self.dispatch()
        except (socket.timeout, ConnectionError):
            self.close_connection = True

    do_POST = do_GET


class GatewayServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, api_key):
        self.api_key = api_key
        self.slots = threading.BoundedSemaphore(8)
        super().__init__(address, GatewayHandler)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            try:
                request.sendall(b'HTTP/1.0 503 Busy\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


if __name__ == '__main__':
    GatewayServer(('0.0.0.0', 8003), load_key()).serve_forever()
