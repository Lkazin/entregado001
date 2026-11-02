import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import gateway


class GatewayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = 'test-only-' + 'a' * 40
        cls.server = gateway.GatewayServer(('127.0.0.1', 0), cls.key.encode())
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, method, path, payload=None, key=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        try:
            request_headers = {'Content-Type': 'application/json', **(headers or {})}
            if key is not None:
                request_headers['x-api-key'] = key
            connection.request(method, path, json.dumps(payload) if payload is not None else None, request_headers)
            response = connection.getresponse()
            return response.status, response.read()
        finally:
            connection.close()

    def test_authentication_precedes_proxy(self):
        with patch('gateway.proxy_request') as proxy:
            self.assertEqual(self.request('GET', '/status')[0], 401)
            self.assertEqual(self.request('GET', '/status', key='wrong')[0], 401)
            proxy.assert_not_called()

    def test_fixed_paths_no_query_or_external_url(self):
        with patch('gateway.proxy_request') as proxy:
            for path in ('/status?url=http://evil', '/admin', 'http://evil/status'):
                self.assertEqual(self.request('GET', path, key=self.key)[0], 404)
            proxy.assert_not_called()

    def test_valid_route_is_forwarded(self):
        payload = {'costing': 'motor_scooter', 'locations': [{'lat': -29.9, 'lon': -51.1}, {'lat': -29.91, 'lon': -51.11}]}
        with patch('gateway.proxy_request', return_value=(200, b'{"trip":{"status":0}}')) as proxy:
            self.assertEqual(self.request('POST', '/route', payload, self.key)[0], 200)
            self.assertEqual(proxy.call_args.args[:2], ('POST', '/route'))

    def test_invalid_coordinates_and_large_payload(self):
        with patch('gateway.proxy_request') as proxy:
            invalid = {'costing': 'motor_scooter', 'locations': [{'lat': 95, 'lon': 0}, {'lat': 1, 'lon': 2}]}
            self.assertEqual(self.request('POST', '/route', invalid, self.key)[0], 400)
            self.assertEqual(self.request('POST', '/route', 'a' * gateway.MAX_BODY, self.key)[0], 413)
            proxy.assert_not_called()

    def test_upstream_failure_is_sanitized(self):
        with patch('gateway.proxy_request', side_effect=OSError('private details')):
            status, body = self.request('GET', '/status', key=self.key)
            self.assertEqual(status, 502)
            self.assertNotIn(b'private details', body)

    def test_address_search_requires_auth_and_stays_in_canoas(self):
        with patch('gateway.proxy_request', return_value=(200, b'[]')) as proxy:
            self.assertEqual(self.request('GET', '/search?q=Rua%20Quinze')[0], 401)
            self.assertEqual(self.request('GET', '/search?q=Rua%20Quinze&format=jsonv2&limit=2', key=self.key)[0], 200)
            self.assertIn('bounded=1', proxy.call_args.args[1])
            self.assertIn('countrycodes=br', proxy.call_args.args[1])
            proxy.reset_mock()
            self.assertEqual(self.request('GET', '/search?q=Rua&url=http://evil', key=self.key)[0], 400)
            self.assertEqual(self.request('GET', '/search?q=Rua&q=Outra', key=self.key)[0], 400)
            proxy.assert_not_called()

    def test_key_file_is_required_and_validated(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'key'
            with self.assertRaises(FileNotFoundError):
                gateway.load_key(path)
            path.write_text('short')
            with self.assertRaises(ValueError):
                gateway.load_key(path)
            path.write_text(self.key)
            self.assertEqual(gateway.load_key(path), self.key.encode())


if __name__ == '__main__':
    unittest.main()
