import http from 'node:http';

const request = http.request(
  { host: '127.0.0.1', port: process.env.PORT || 5173, path: '/', method: 'HEAD', timeout: 3000 },
  (response) => {
    response.resume();
    process.exitCode = response.statusCode === 200 ? 0 : 1;
  },
);
request.on('timeout', () => request.destroy(new Error('Health check timed out')));
request.on('error', () => {
  process.exitCode = 1;
});
request.end();
