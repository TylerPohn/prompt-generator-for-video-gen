
# Product Requirements Document (PRD)

## **Video Prompt Lab — Local Replicate Prompt Testing Tool**

### **Overview**

The Video Prompt Lab is a local-only application designed for experimenting with video generation models available via the Replicate API. It allows rapid iteration on prompts, organizes generated outputs, and provides a clear interface for comparing models, prompts, and generations.

This tool is intended for internal experimentation with ad-style video generation and prompt strategy exploration.

---

## **Goals**

* Enable quick testing of prompts across multiple Replicate video models.
* Provide a clean interface for reviewing outputs, understanding which model & prompt produced each, and easily copying prompts for iteration.
* Allow saving/star/favoriting outputs and adding custom labels for organization.

---

## **Core User Flows**

### **1. Enter a Prompt and Generate Video**

* User types a prompt into an input field.
* User selects a model (dropdown of available Replicate video models).
* User clicks **Generate**.
* A new card is immediately created in the “Video Results” section showing:

  * Chosen model
  * Prompt text
  * Placeholder thumbnail (static image placeholder) until video is returned
  * Loading indicator
* Once Replicate returns the completed video URL:

  * The card updates with a video preview
  * Thumbnail updates to the first frame

### **2. View Result Cards**

* All generated attempts appear as cards in a grid.
* **Thumbnail:**

  * Before video arrival: placeholder image or skeleton loader
  * After completion: frame extracted from video
* **Badges:**

  * Model Name
  * Labels (if user added any)
* **Text:**

  * Rendered prompt

### **3. Copy Prompt Button**

* Each card includes a **Copy Prompt** button.
* Works whether or not the video is finished.
* Copies full prompt text to clipboard.

### **4. Pre‑Generation Card Availability**

* As soon as user hits "Generate", the card appears with:

  * Prompt
  * Model
  * "Pending" state
  * Copy button enabled
  * Empty thumbnail / placeholder
* This allows tracking queued or inflight jobs.

### **5. Local-Only Application**

* No backend required except API calls to Replicate.
* Runs entirely on user's machine.
* Environment variable for Replicate API key.

  * e.g. `.env.local` → `REPLICATE_API_KEY="xxxx"`

### **6. Starring, Favoriting & Labeling**

* Each card includes:

  * ⭐ **Favorite toggle** (saves to localStorage)
  * ➕ **Add Label** button → opens small modal/input
  * Labels displayed as small badges under model badge
* Filters at top of screen:

  * **Show Favorites Only** toggle
  * **Filter by Label** dropdown

---

## **Key Features**

### **1. Prompt Generation UI**

* Large textarea for entering prompt
* Dropdown of all Replicate video models (fetched or hardcoded)
* Generate button
* Optionally: seed value for reproducibility

### **2. Results Grid**

* Masonry or simple responsive grid
* Card structure:

  * Thumbnail (video or placeholder)
  * Prompt text preview (expandable)
  * Model badge
  * Labels
  * Favorite star
  * Copy prompt button
  * Video player once available

### **3. Local Persistence**

Use `localStorage` to store:

* All generated card metadata
* Favorited state
* Labels
* Last selected model
* Prompt history

### **4. Error Handling**

* If Replicate errors, card shows error state
* Retry button on card

---

## **Data Model**

```ts
interface VideoCard {
  id: string; // uuid
  prompt: string;
  model: string; // replicate model ID
  status: "pending" | "generating" | "complete" | "error";
  videoUrl?: string;
  thumbnailUrl?: string;
  isFavorite: boolean;
  labels: string[];
  createdAt: number;
}
```

Persistence: All stored in `localStorage.videoCards`.

---

## **API Calls (Replicate)**

* POST to `/v1/predictions`
* Poll or websocket for completion
* Extract video URL from response
* Extract first frame as thumbnail (FFmpeg in browser optional, or use video element to grab frame)

---

## **Technical Implementation**

### **Frontend Stack**

* Vite + React (local-only)
* TailwindCSS or simple CSS
* LocalStorage for persistence
* Replicate JS SDK

### **Components**

**PromptInputPanel**

* textarea
* model select
* generate button
* handles creation of new card with status=pending

**VideoCard**

* model badge
* thumbnail or video
* prompt text
* star button
* labels + add-label UI
* copy prompt button
* error / retry state

**CardGrid**

* responsive layout

**FilterPanel**

* favorites toggle
* label filter

---

## **Stretch Features (Optional)**

* Side-by-side model comparison mode
* Prompt templates library
* Export card as JSON
* Drag-and-drop reorder
* Model pricing indicator
* Auto-generate multiple variations

---

## **Success Criteria**

* User can test a variety of prompts quickly.
* Easy to compare outputs visually.
* Quick workflow for iteration and copying prompts.
* Stable local persistence.
* Simple and easy to run locally with only a Replicate API key.

---

## **Appendix**

### Thumbnail Generation

* Use `<video>` element + canvas snapshot.
* Only after video finishes loading.
* Fallback to static placeholder.

### Label Colors

* Random color per label stored in localStorage.

### Model List

* Hardcode common Replicate video models: 
  Bytedance Seedance 1.0

  Hailuo 02

  Kling 2.5 Turbo

  Google Veo 3

  [best sora 2 model available]
  * etc.
