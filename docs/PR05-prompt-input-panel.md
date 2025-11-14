# PR05: Prompt Input Panel Component

## Dependencies
- PR01 (Project Setup)
- PR02 (Data Model) - for AVAILABLE_MODELS
- PR03 (LocalStorage) - for useVideoCards, useLastModel hooks
- PR04 (Replicate API) - for useVideoGeneration hook

## Overview
Build the prompt input UI where users enter prompts, select models, and trigger video generation. This is the primary input interface for the application.

## Objectives
- Create textarea for prompt input
- Add model selection dropdown
- Implement generate button with loading state
- Integrate with video generation hook
- Persist last selected model
- Add basic validation

## Technical Decisions
- Controlled components (React manages input state)
- Disable generate button when prompt is empty or during generation
- Auto-save last selected model
- Clear prompt after successful generation (optional - can ask user)

## Tasks

### 1. Create PromptInputPanel Component
Create `src/components/PromptInputPanel.tsx`:
```typescript
import { useState, FormEvent } from 'react';
import { AVAILABLE_MODELS } from '../types';
import { useVideoCards } from '../hooks/useVideoCards';
import { useVideoGeneration } from '../hooks/useVideoGeneration';
import { useLastModel } from '../hooks/useLastModel';

export function PromptInputPanel() {
  const [prompt, setPrompt] = useState('');
  const { lastModel, setLastModel } = useLastModel();
  const { addCard, updateCard } = useVideoCards();
  const { generate, isGenerating } = useVideoGeneration();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!prompt.trim()) return;

    // Start generation
    await generate({
      prompt: prompt.trim(),
      model: lastModel,
      onCardCreate: addCard,
      onCardUpdate: updateCard,
    });

    // Optionally clear prompt after submission
    setPrompt('');
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="prompt"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Prompt
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter your video prompt..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            disabled={isGenerating}
          />
        </div>

        <div>
          <label
            htmlFor="model"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Model
          </label>
          <select
            id="model"
            value={lastModel}
            onChange={(e) => setLastModel(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={isGenerating}
          >
            {AVAILABLE_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={!prompt.trim() || isGenerating}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {isGenerating ? 'Generating...' : 'Generate Video'}
        </button>
      </form>
    </div>
  );
}
```

### 2. Create Component Index
Create `src/components/index.ts`:
```typescript
export * from './PromptInputPanel';
```

### 3. Add PromptInputPanel to App
Update `src/App.tsx`:
```typescript
import { PromptInputPanel } from './components';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Video Prompt Lab
          </h1>
          <p className="mt-2 text-gray-600">
            Experiment with video generation models
          </p>
        </header>

        <div className="mb-8">
          <PromptInputPanel />
        </div>

        {/* Video cards grid will go here in next PR */}
      </div>
    </div>
  );
}

export default App;
```

### 4. Add Focus Styles (Optional Enhancement)
Add custom focus ring styles to make the form more accessible:
```css
/* In src/index.css if needed */
/* The Tailwind classes above already handle this */
```

## Acceptance Criteria
- [ ] Textarea accepts multi-line prompt input
- [ ] Model dropdown shows all available models
- [ ] Last selected model is remembered after refresh
- [ ] Generate button is disabled when prompt is empty
- [ ] Generate button shows loading state during generation
- [ ] Form prevents submission when already generating
- [ ] Component integrates with video generation hook
- [ ] Prompt clears after successful submission (or persists - decide based on UX preference)

## Files to Create/Modify
- `src/components/PromptInputPanel.tsx`
- `src/components/index.ts`
- `src/App.tsx` (update)
- Update `src/hooks/index.ts` to export useVideoGeneration

## Testing
### Manual Testing Steps:
1. Run the app: `npm run dev`
2. Type a prompt in the textarea
3. Select a model from dropdown
4. Click "Generate Video"
5. Verify button shows "Generating..." and is disabled
6. Refresh page
7. Verify selected model persists
8. Try submitting empty prompt (should be blocked)

### Visual Testing:
- Check responsive layout (mobile, tablet, desktop)
- Verify focus styles work (tab through form)
- Check disabled states look correct
- Verify hover states on button

## Notes for Junior Engineers
- `FormEvent` is the TypeScript type for form submission events
- `e.preventDefault()` stops the form from refreshing the page (default browser behavior)
- `trim()` removes whitespace from start/end of string
- The `disabled` prop prevents interaction and changes styling
- `onChange` fires every time the user types
- Controlled components: React state is the "source of truth" for input values
- The `?` in ternary `isGenerating ? 'Generating...' : 'Generate'` means if-else in one line
- Template literals with `${}` let you embed variables in strings
- The `space-y-4` Tailwind class adds vertical spacing between children
- `focus:ring` classes add a colored outline when element is focused (accessibility!)
