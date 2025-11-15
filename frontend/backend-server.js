#!/usr/bin/env node

/**
 * Backend Server using bash/curl for Replicate API
 *
 * This replaces the proxy server with a proper backend that:
 * - Uses child_process to run curl commands (like your bash example)
 * - Provides REST API endpoints for the frontend
 * - Avoids CORS issues entirely
 */

import http from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read API key
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

async function createPrediction(model, prompt, duration = 4) {
  // Properly escape the prompt for JSON
  const escapedPrompt = prompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

  const cmd = `curl -s -X POST "https://api.replicate.com/v1/models/${model}/predictions" \
    -H "Authorization: Bearer ${REPLICATE_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\\"input\\": {\\"prompt\\": \\"${escapedPrompt}\\", \\"duration\\": ${duration}}}"`;

  console.log('\n🔧 DEBUG: Executing curl command:');
  console.log('Model:', model);
  console.log('Prompt:', prompt);
  console.log('Duration:', duration);
  console.log('Command:', cmd.replace(REPLICATE_API_KEY, '***KEY***'));

  const { stdout, stderr } = await execAsync(cmd);

  console.log('Stdout:', stdout);
  if (stderr) console.log('Stderr:', stderr);

  return JSON.parse(stdout);
}

async function getPrediction(predictionId) {
  const cmd = `curl -s -H "Authorization: Bearer ${REPLICATE_API_KEY}" \
    "https://api.replicate.com/v1/predictions/${predictionId}"`;

  const { stdout } = await execAsync(cmd);
  return JSON.parse(stdout);
}

async function generatePromptWithLLM(selections) {
  const productContext = selections.product ? ` for ${selections.product}` : '';
  const systemPrompt = `You are a creative video prompt writer. Based on the user's selections for a video ad${productContext}, generate a detailed, vivid video prompt that would work well for video generation AI models. Keep it concise (2-4 sentences) but descriptive. The video must be exactly ${selections.ad_length} seconds long. IMPORTANT: The product asset/hero shot will be added separately after the video, so focus on setting the mood and context, NOT showing the product itself. CRITICAL: Do NOT use quotation marks (single or double quotes) anywhere in your response as it will break JSON parsing.`;

  const productLine = selections.product ? `- Product: ${selections.product}` : '';

  // Build specifications dynamically - only include fields with values
  const specs = [];
  const fieldLabels = {
    hook_type: 'Hook Type',
    pain_point: 'Pain Point',
    tone: 'Tone',
    visual_style: 'Visual Style',
    character_type: 'Character Type',
    character_vibe: 'Character Vibe',
    problem_context: 'Problem Context',
    emotion_first_3_seconds: 'First 3 Seconds Emotion',
    platform: 'Platform',
    transition_type: 'Transition Type',
  };

  for (const [key, label] of Object.entries(fieldLabels)) {
    if (selections[key]) {
      specs.push(`- ${label}: ${selections[key]}`);
    }
  }

  // Add product line to specs if it exists
  if (productLine) {
    specs.unshift(productLine);
  }

  const specsText = specs.length > 0 ? specs.join('\n') : '';

  const userMessage = specs.length > 0
    ? `Create a ${selections.ad_length}-second video prompt${productContext} with these specifications:
${specsText}

Generate a detailed video prompt that incorporates these elements naturally. Remember, the video is ${selections.ad_length} seconds long, so keep the action and narrative paced accordingly. The prompt should set the mood and context for the product but NOT show the actual product (that will be composited later).`
    : `Create a ${selections.ad_length}-second video prompt. Generate a detailed, vivid video prompt that would work well for video generation AI models. Keep it concise (2-4 sentences) but descriptive. Remember, the video is ${selections.ad_length} seconds long, so keep the action and narrative paced accordingly.`;

  const escapedPrompt = userMessage.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  const escapedSystem = systemPrompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

  // Use meta/llama-3.1-405b-instruct for prompt generation
  const cmd = `curl -s -X POST "https://api.replicate.com/v1/models/meta/meta-llama-3.1-405b-instruct/predictions" \
    -H "Authorization: Bearer ${REPLICATE_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\\"input\\": {\\"prompt\\": \\"${escapedPrompt}\\", \\"system_prompt\\": \\"${escapedSystem}\\", \\"max_tokens\\": 500}}"`;

  console.log('\n🤖 Generating prompt with LLM...');

  const { stdout } = await execAsync(cmd);
  const prediction = JSON.parse(stdout);

  console.log('LLM Prediction ID:', prediction.id);

  // Poll for completion
  let result = prediction;
  let attempts = 0;
  const maxAttempts = 60; // 60 seconds max

  while (!['succeeded', 'failed'].includes(result.status) && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const pollCmd = `curl -s -H "Authorization: Bearer ${REPLICATE_API_KEY}" \
      "https://api.replicate.com/v1/predictions/${prediction.id}"`;
    const { stdout: pollOutput } = await execAsync(pollCmd);
    result = JSON.parse(pollOutput);
    attempts++;
    console.log('LLM Status:', result.status);
  }

  if (result.status === 'succeeded') {
    // Extract text from output (llama returns array of strings)
    const generatedText = Array.isArray(result.output) ? result.output.join('') : result.output;
    console.log('Generated prompt:', generatedText);
    return generatedText;
  } else {
    throw new Error('Failed to generate prompt with LLM');
  }
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Parse URL
  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    // POST /api/predictions/{owner}/{model} - Create prediction
    if (req.method === 'POST' && url.pathname.startsWith('/api/predictions/')) {
      console.log('\n📥 Incoming POST request:');
      console.log('Full path:', url.pathname);

      // /api/predictions/google/veo-3.1 -> google/veo-3.1
      const model = url.pathname.replace('/api/predictions/', '');
      console.log('Extracted model:', model);

      let body = '';
      req.on('data', chunk => { body += chunk; });

      await new Promise(resolve => req.on('end', resolve));

      const data = JSON.parse(body);
      console.log('Request body:', data);

      const result = await createPrediction(model, data.input.prompt, data.input.duration);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // GET /api/predictions/:id - Get prediction status
    if (req.method === 'GET' && url.pathname.startsWith('/api/predictions/')) {
      const predictionId = url.pathname.split('/').pop();
      const result = await getPrediction(predictionId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // POST /api/generate-prompt - Generate prompt using LLM
    if (req.method === 'POST' && url.pathname === '/api/generate-prompt') {
      console.log('\n📝 Incoming prompt generation request');

      let body = '';
      req.on('data', chunk => { body += chunk; });
      await new Promise(resolve => req.on('end', resolve));

      const selections = JSON.parse(body);
      console.log('Selections:', selections);

      const generatedPrompt = await generatePromptWithLLM(selections);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ prompt: generatedPrompt }));
      return;
    }

    // 404
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));

  } catch (error) {
    console.error('Error:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, () => {
  console.log(`\n✓ Backend server running on http://localhost:${PORT}`);
  console.log(`✓ API Key: ${REPLICATE_API_KEY ? '***' + REPLICATE_API_KEY.slice(-4) : 'NOT FOUND'}`);
  console.log(`✓ Using bash/curl for Replicate API calls`);
  console.log(`\nNow start your frontend with: npm run dev\n`);
});
