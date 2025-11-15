#!/usr/bin/env node

/**
 * Simple CORS Proxy for Replicate API
 *
 * This proxy solves the CORS issue when calling Replicate API from the browser.
 * It forwards requests from the frontend to Replicate API while adding CORS headers.
 *
 * Usage: node proxy-server.js
 * The proxy will run on http://localhost:3001
 */

import http from 'http';
import https from 'https';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read API key from .env.local
let REPLICATE_API_KEY = '';
try {
  const envContent = readFileSync(join(__dirname, '.env.local'), 'utf8');
  const match = envContent.match(/VITE_REPLICATE_API_KEY=(.+)/);
  if (match) {
    REPLICATE_API_KEY = match[1].trim();
  }
} catch (err) {
  console.error('Error reading .env.local:', err.message);
}

const PORT = 3001;
const REPLICATE_API = 'api.replicate.com';

const server = http.createServer((req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Only proxy /v1/* paths
  if (!req.url.startsWith('/v1/')) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  // Collect request body
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    // Forward to Replicate API
    const options = {
      hostname: REPLICATE_API,
      path: req.url,
      method: req.method,
      headers: {
        'Authorization': `Token ${REPLICATE_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const proxyReq = https.request(options, (proxyRes) => {
      // Copy status code
      res.writeHead(proxyRes.statusCode, proxyRes.headers);

      // Pipe response back
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    });

    // Write body and end request
    if (body) {
      proxyReq.write(body);
    }
    proxyReq.end();
  });
});

server.listen(PORT, () => {
  console.log(`\n✓ CORS Proxy running on http://localhost:${PORT}`);
  console.log(`✓ API Key: ${REPLICATE_API_KEY ? '***' + REPLICATE_API_KEY.slice(-4) : 'NOT FOUND'}`);
  console.log(`✓ Forwarding to: https://${REPLICATE_API}`);
  console.log(`\nNow start your frontend with: npm run dev\n`);
});
