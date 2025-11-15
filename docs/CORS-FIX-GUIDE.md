# CORS Fix Guide

## Problem

Browsers block direct API calls to Replicate due to CORS (Cross-Origin Resource Sharing) policy. This is a security feature that prevents exposing API keys in client-side code.

**Your curl commands work** because command-line tools aren't subject to browser CORS policies.

## Solution

We've created a **local proxy server** that:
1. Runs on your computer (localhost:3001)
2. Receives requests from the browser
3. Forwards them to Replicate API with your API key
4. Returns the response with CORS headers enabled

## Changes Made

### 1. Fixed API Endpoint Format ✅

**Before:**
```javascript
POST /v1/predictions
body: { version: "model-id", input: { prompt } }
```

**After:**
```javascript
POST /v1/models/{owner}/{model}/predictions
body: { input: { prompt, duration: 4 } }
```

This matches your working curl example.

### 2. Updated Model ID ✅
Changed `google/veo-3` → `google/veo-3.1` to match the working model.

### 3. Created Proxy Server ✅
- File: `proxy-server.js`
- Reads API key from `.env.local`
- Forwards requests to api.replicate.com
- Adds CORS headers for browser access

### 4. Updated Config ✅
The app now uses:
- **Dev mode:** `http://localhost:3001/v1` (proxy)
- **Prod mode:** Would need a backend proxy

## How to Use

### Option 1: Run Everything Together (Recommended)

```bash
npm run dev:all
```

This starts both the proxy server (port 3001) and Vite dev server (port 5173) simultaneously.

### Option 2: Run Separately

**Terminal 1 - Start Proxy:**
```bash
npm run dev:proxy
```

**Terminal 2 - Start Frontend:**
```bash
npm run dev
```

### Option 3: Manual

**Terminal 1:**
```bash
node proxy-server.js
```

**Terminal 2:**
```bash
npm run dev
```

## Verification

When the proxy starts, you should see:
```
✓ CORS Proxy running on http://localhost:3001
✓ API Key: ***ZMZc
✓ Forwarding to: https://api.replicate.com

Now start your frontend with: npm run dev
```

## Testing Video Generation

1. Start both proxy and frontend
2. Open http://localhost:5173
3. Enter a prompt: "waves crashing dramatically against rocks"
4. Select "Google Veo 3.1"
5. Click "Generate Video"
6. Watch the status: pending → generating → complete

The video should generate successfully without CORS errors!

## Troubleshooting

### "API Key: NOT FOUND"
- Make sure `.env.local` exists
- Verify it contains: `VITE_REPLICATE_API_KEY=r8_...`

### "Port 3001 already in use"
- Kill the existing process: `lsof -ti:3001 | xargs kill`
- Or change the port in `proxy-server.js`

### Still Getting CORS Errors
- Make sure proxy is running (check terminal)
- Verify proxy is on port 3001
- Check browser console for the exact error

## Production Deployment

⚠️ **Important:** This proxy solution is for local development only.

For production, you need:
1. A backend server (Express, Next.js API routes, etc.)
2. Keep API keys on the server (never expose in browser)
3. Frontend calls your backend, backend calls Replicate

## Why This is Necessary

Browsers enforce same-origin policy to protect users. Replicate doesn't enable CORS because:
1. API keys should never be in browser code (security risk)
2. Requests should come from secure servers
3. Rate limiting and abuse prevention

The local proxy is safe because:
- It only runs on your machine
- API key stays in `.env.local` (not committed)
- Only you can access localhost:3001

## Summary

✅ API endpoint fixed
✅ Model ID updated to veo-3.1
✅ Proxy server created
✅ Config updated for dev/prod
✅ npm scripts added for convenience

Run `npm run dev:all` and start generating videos!
