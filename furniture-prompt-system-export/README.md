# Furniture Ad Prompt Generator - Simplified Export

A streamlined AI-powered prompt generation system for furniture advertising with just **6 core parameters**.

## 🎯 Core Parameters Only

1. **Brand Aesthetic / Style** (11 options)
2. **Brand Voice** (6 options)  
3. **Product Category** (8 options)
4. **Material(s)** (11 options)
5. **Highlight Features** (9 options)
6. **Setting / Environment Style** (8 options)

Plus: `Product Name` and `Ad Length` (required)

**Total: 8 fields, 53 options** - Clean, focused, easy to integrate.

## 📦 What's Included

```
furniture-prompt-system-export/
├── frontend/
│   ├── promptGenerator.ts      # 6 parameters + types  
│   └── PromptGenerator.tsx     # React component
├── backend/
│   └── backend-server.js       # API server
└── README.md
```

## 🚀 Quick Start

### 1. Copy Files
```bash
cp frontend/* YOUR_PROJECT/src/
cp backend/backend-server.js YOUR_BACKEND/
```

### 2. Setup Backend
```bash
echo "REPLICATE_API_TOKEN=your_token" > .env
node backend-server.js
```

### 3. Use Component
```tsx
import { PromptGenerator } from './PromptGenerator';

<PromptGenerator onUsePrompt={(prompt, duration) => {
  console.log(prompt); // Use for video generation
}} />
```

## 📊 Complete Parameter List

### Brand Aesthetic / Style
Modern | Mid-Century Modern | Minimalist | Scandinavian | Luxury High-End | Rustic | Industrial | Antique/Vintage | Eclectic/Artistic | Office/Functional | Classic/Traditional

### Brand Voice  
Sophisticated | Warm & Inviting | Artistic | Functional/Practical | Playful | Neutral/Clean

### Product Category
Sofa/Sectional | Dining Table | Chair | Bed/Bedroom Set | Office Desk | Storage/Shelves | Accent Furniture | Outdoor Furniture

### Material(s)
Leather | Velvet | Cotton | Oak | Walnut | Bamboo | Metal | Plastic | Glass | Rattan | Marble

### Highlight Features
Handcrafted | New Arrival | Best Seller | Customizable Sizes | Sustainable Materials | Space-Saving Design | Ergonomic | Pet-Friendly | Locally Made

### Setting / Environment Style
Modern Loft | Cozy Home | Luxury Living Room | Minimalist White Studio | Rustic Cabin Interior | Urban Apartment | Outdoor Patio Scene | Commercial Office Space

## 🔧 API Endpoints

**Recommend Parameters:**
```bash
POST http://localhost:3001/api/recommend-selections
{"product": "Modern Sofa"}
```

**Generate Prompt:**
```bash  
POST http://localhost:3001/api/generate-prompt
{
  "product": "Modern Sofa",
  "furniture_style": "modern",
  "brand_voice": "sophisticated",
  ...
  "ad_length": 4
}
```

## ✨ Why Simplified?

- ✅ Faster to integrate
- ✅ Easier to understand
- ✅ Less overwhelming for users
- ✅ Covers 80% of use cases
- ✅ Still generates high-quality prompts

Perfect for MVP launches and rapid integration!
