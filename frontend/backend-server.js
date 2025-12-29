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

async function recommendSelections(product) {
  const systemPrompt = `You are an expert in furniture advertising and video marketing. Based on the furniture product provided, recommend the most effective video ad parameters to showcase it. Consider the furniture's likely style, target room, materials, and key selling points. CRITICAL: Respond ONLY with valid JSON, no other text. Do NOT use quotation marks within field values.`;

  const userMessage = `Product: ${product}. Analyze this furniture product and recommend the most effective video ad parameters to showcase it. Consider the brand aesthetic, voice, product category, materials, setting, features, and whether showing people using it would be effective. Pick one value from each list below based on what would best showcase this specific furniture item. Respond with ONLY a JSON object in this exact format: {"furniture_style":"value","brand_voice":"value","product_category":"value","room_setting":"value","furniture_material":"value","furniture_benefit":"value","product_highlights":"value","environment_style":"value","people_in_scene":"value","lifestyle_context":"value","hook_type":"value","pain_point":"value","tone":"value","visual_style":"value","problem_context":"value","emotion_first_3_seconds":"value","platform":"value","transition_type":"value"}. Options: furniture_style (modern, mid_century_modern, minimalist, scandinavian, luxury_high_end, rustic, industrial, antique_vintage, eclectic_artistic, office_functional, classic_traditional, contemporary), brand_voice (sophisticated, warm_inviting, artistic, functional_practical, playful, neutral_clean, luxurious, casual_friendly, professional, cozy), product_category (sofa_sectional, dining_table, chair_seating, bed_bedroom_set, office_desk, storage_shelves, accent_furniture, outdoor_furniture, coffee_table, nightstand, dresser, bookshelf), room_setting (living_room, bedroom, dining_room, office, kitchen, outdoor, entryway, bathroom, kids_room, home_theater, bar), furniture_material (leather, velvet, cotton, oak, walnut, bamboo, metal, plastic, glass, rattan, marble, linen, wood_general, mixed_materials), furniture_benefit (space_saving, comfort, durability, style, versatility, storage, ergonomic, easy_assembly, sustainable), product_highlights (handcrafted, new_arrival, best_seller, customizable_sizes, sustainable_materials, space_saving_design, ergonomic_design, pet_friendly, locally_made, limited_edition, eco_friendly, easy_care), environment_style (modern_loft, cozy_home, luxury_living_room, minimalist_white_studio, rustic_cabin_interior, urban_apartment, outdoor_patio_scene, commercial_office_space, bright_airy, warm_intimate), people_in_scene (no_people, individual, couple, family, roommates, friends, parent_child, multi_generational, pet_owner), lifestyle_context (everyday_living, entertaining_guests, relaxing_alone, working_from_home, family_time, romantic_moment, morning_routine, evening_unwind, reading_relaxing, watching_tv), hook_type (transform_your_space, comfort_statement, style_upgrade, space_solution, quality_reveal, price_reveal, trending_design, problem_solver, room_makeover, investment_piece), pain_point (uncomfortable_seating, cluttered_space, poor_storage, outdated_style, limited_space, hard_to_clean, not_durable, expensive, difficult_assembly, doesnt_match_decor), tone (calm, serious, lighthearted, humorous, dramatic, gritty, aspirational, friendly, moody, energetic, seductive, sensual), visual_style (product_focus, lifestyle_shot, room_reveal, detail_closeup, before_after, 360_view, flat_lay, in_situ, lifestyle_vignette, catalog_style), problem_context (moving_into_new_home, redecorating, downsizing, growing_family, home_office_setup, small_apartment, seasonal_refresh, furniture_broke, style_refresh, gift_shopping), emotion_first_3_seconds (surprise, curiosity, relief, excitement, empathy, urgency, calm, humor, nostalgia, intrigue), platform (tiktok, instagram_reels, youtube, linkedin, facebook, x_twitter, website_hero, snapchat, youtube_shorts, generic_social), transition_type (room_reveal, zoom_to_detail, pan_across, soft_fade, before_after_swipe, lifestyle_to_product, rotate_reveal, pull_back, close_to_wide, drawer_open). Respond with JSON only.`;

  // Use proper JSON.stringify instead of manual escaping
  const payload = JSON.stringify({
    input: {
      prompt: userMessage,
      system_prompt: systemPrompt,
      max_tokens: 500
    }
  });

  const tmpFile = `/tmp/replicate-${Date.now()}.json`;
  const { writeFileSync, unlinkSync } = await import('fs');
  writeFileSync(tmpFile, payload);

  const cmd = `curl -s -X POST "https://api.replicate.com/v1/models/meta/meta-llama-3.1-405b-instruct/predictions" \
    -H "Authorization: Bearer ${REPLICATE_API_KEY}" \
    -H "Content-Type: application/json" \
    -d @${tmpFile}`;

  console.log('\n✨ Generating selection recommendations with LLM...');

  const { stdout, stderr } = await execAsync(cmd);

  // Clean up temp file
  try { unlinkSync(tmpFile); } catch (e) {}

  console.log('API Response:', stdout);
  if (stderr) console.log('API Error:', stderr);

  const prediction = JSON.parse(stdout);

  console.log('LLM Prediction ID:', prediction.id);

  if (!prediction.id) {
    console.error('Failed to create prediction:', prediction);
    throw new Error(`Failed to create prediction: ${JSON.stringify(prediction)}`);
  }

  // Poll for completion
  let result = prediction;
  let attempts = 0;
  const maxAttempts = 60;

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
    const generatedText = Array.isArray(result.output) ? result.output.join('') : result.output;
    console.log('Generated recommendations:', generatedText);

    // Extract JSON from response (in case LLM adds extra text)
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(generatedText);
  } else {
    throw new Error('Failed to generate recommendations with LLM');
  }
}

function sanitizePrompt(prompt) {
  // Remove potentially flagged content while maintaining the mood
  const flaggedPhrases = [
    /bodies? entwined/gi,
    /bodies? intertwined/gi,
    /intimate touch/gi,
    /caress/gi,
    /sensual touch/gi,
    /naked/gi,
    /undressed/gi,
    /seductive gaze/gi,
    /seductive stare/gi,
  ];

  let sanitized = prompt;

  // Replace flagged phrases with safer alternatives
  flaggedPhrases.forEach(phrase => {
    sanitized = sanitized.replace(phrase, 'close together');
  });

  // Remove overly explicit descriptions
  sanitized = sanitized.replace(/their (bodies|forms)[^,.]*(entwined|intertwined|pressed|touching)[^,.]*,?/gi, 'together,');

  return sanitized;
}

async function generatePromptWithLLM(selections) {
  const productContext = selections.product ? ` for ${selections.product}` : '';
  const systemPrompt = `You are a creative video prompt writer specializing in furniture advertising. Based on the user's selections for a video ad${productContext}, generate a detailed, vivid video prompt that would work well for video generation AI models. Keep it concise (2-4 sentences) but descriptive. The video must be exactly ${selections.ad_length} seconds long. Focus on showcasing the furniture product in a realistic room setting. Emphasize the furniture's style, materials, and benefits. The video should make viewers imagine the furniture in their own home. Ensure the furniture product is clearly visible and the hero of the scene. IMPORTANT: The product asset/hero shot will be added separately after the video, so focus on setting the mood and context, NOT showing the product itself. CRITICAL: Do NOT use quotation marks (single or double quotes) anywhere in your response as it will break JSON parsing. CONTENT POLICY: Avoid explicit descriptions of bodies, physical intimacy, or suggestive content. Focus on lighting, atmosphere, setting, and emotion instead. Use elegant and sophisticated language.`;

  const productLine = selections.product ? `- Product: ${selections.product}` : '';

  // Build specifications dynamically - only include fields with values
  const specs = [];
  const fieldLabels = {
    hook_type: 'Hook Type',
    pain_point: 'Pain Point',
    tone: 'Tone',
    visual_style: 'Visual Style',
    furniture_style: 'Brand Aesthetic / Style',
    brand_voice: 'Brand Voice',
    product_category: 'Product Category',
    room_setting: 'Room Setting',
    furniture_material: 'Material(s)',
    furniture_benefit: 'Key Benefit',
    product_highlights: 'Highlight Features',
    environment_style: 'Setting / Environment Style',
    people_in_scene: 'People in Scene',
    lifestyle_context: 'Lifestyle Context',
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
    console.log('Generated prompt (raw):', generatedText);

    // Sanitize the prompt to avoid content moderation issues
    const sanitizedPrompt = sanitizePrompt(generatedText);
    console.log('Generated prompt (sanitized):', sanitizedPrompt);

    return sanitizedPrompt;
  } else {
    throw new Error('Failed to generate prompt with LLM');
  }
}

const server = http.createServer(async (req, res) => {
  const requestId = Date.now().toString(36);
  console.log(`\n🔵 [${requestId}] ${req.method} ${req.url}`);
  console.log(`🔵 [${requestId}] Headers:`, req.headers);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    console.log(`🔵 [${requestId}] OPTIONS request - responding with 200`);
    res.writeHead(200);
    res.end();
    return;
  }

  // Parse URL
  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    // POST /api/predictions/{owner}/{model} - Create prediction
    if (req.method === 'POST' && url.pathname.startsWith('/api/predictions/')) {
      console.log(`\n📥 [${requestId}] Create Prediction Request`);
      console.log(`📥 [${requestId}] Full path:`, url.pathname);

      // /api/predictions/google/veo-3.1 -> google/veo-3.1
      const model = url.pathname.replace('/api/predictions/', '');
      console.log(`📥 [${requestId}] Extracted model:`, model);

      let body = '';
      req.on('data', chunk => { body += chunk; });

      await new Promise(resolve => req.on('end', resolve));

      const data = JSON.parse(body);
      console.log(`📥 [${requestId}] Request body:`, JSON.stringify(data, null, 2));

      console.log(`📥 [${requestId}] Calling createPrediction...`);
      const result = await createPrediction(model, data.input.prompt, data.input.duration);

      console.log(`✅ [${requestId}] Prediction created:`, result.id);
      console.log(`✅ [${requestId}] Response:`, JSON.stringify(result, null, 2));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // GET /api/predictions/:id - Get prediction status
    if (req.method === 'GET' && url.pathname.startsWith('/api/predictions/')) {
      const predictionId = url.pathname.split('/').pop();
      console.log(`🔍 [${requestId}] Get Prediction Status:`, predictionId);

      const result = await getPrediction(predictionId);

      console.log(`🔍 [${requestId}] Prediction status:`, result.status);
      if (result.status === 'succeeded') {
        console.log(`✅ [${requestId}] Prediction succeeded! Output:`, result.output);
      } else if (result.status === 'failed') {
        console.log(`❌ [${requestId}] Prediction failed:`, result.error);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // POST /api/generate-prompt - Generate prompt using LLM
    if (req.method === 'POST' && url.pathname === '/api/generate-prompt') {
      console.log(`\n📝 [${requestId}] Generate Prompt Request`);

      let body = '';
      req.on('data', chunk => { body += chunk; });
      await new Promise(resolve => req.on('end', resolve));

      const selections = JSON.parse(body);
      console.log(`📝 [${requestId}] Selections:`, JSON.stringify(selections, null, 2));

      console.log(`📝 [${requestId}] Calling generatePromptWithLLM...`);
      const generatedPrompt = await generatePromptWithLLM(selections);

      console.log(`✅ [${requestId}] Prompt generated successfully`);
      console.log(`✅ [${requestId}] Length:`, generatedPrompt.length, 'characters');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ prompt: generatedPrompt }));
      return;
    }

    // POST /api/recommend-selections - Get AI recommendations for selections
    if (req.method === 'POST' && url.pathname === '/api/recommend-selections') {
      console.log(`\n✨ [${requestId}] Recommend Selections Request`);

      let body = '';
      req.on('data', chunk => { body += chunk; });
      await new Promise(resolve => req.on('end', resolve));

      const { product } = JSON.parse(body);
      console.log(`✨ [${requestId}] Product:`, product);

      console.log(`✨ [${requestId}] Calling recommendSelections...`);
      const recommendations = await recommendSelections(product);

      console.log(`✅ [${requestId}] Recommendations generated:`, JSON.stringify(recommendations, null, 2));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ selections: recommendations }));
      return;
    }

    // 404
    console.log(`❌ [${requestId}] 404 Not Found: ${req.method} ${url.pathname}`);
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));

  } catch (error) {
    console.error(`❌ [${requestId}] Error:`, error);
    console.error(`❌ [${requestId}] Stack:`, error.stack);
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
