# PR01: Project Setup & Foundation

## Dependencies
None - This can be executed immediately

## Overview
Set up the initial Vite + React + TailwindCSS project structure with all necessary configuration files and environment setup.

## Objectives
- Initialize Vite project with React and TypeScript
- Configure TailwindCSS
- Set up environment variable handling for Replicate API key
- Create basic project structure and folders
- Add essential dependencies

## Technical Decisions
- **Build Tool**: Vite (fast, modern, great DX)
- **Framework**: React 18+ with TypeScript
- **Styling**: TailwindCSS with default config
- **Package Manager**: npm (can use pnpm/yarn if preferred)

## Tasks

### 1. Initialize Vite Project
```bash
npm create vite@latest . -- --template react-ts
npm install
```

### 2. Install TailwindCSS
```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 3. Configure TailwindCSS
Update `tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

Update `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 4. Create Environment Configuration
Create `.env.local` file:
```
VITE_REPLICATE_API_KEY=your_api_key_here
```

Create `.env.example`:
```
VITE_REPLICATE_API_KEY=
```

Add to `.gitignore`:
```
.env.local
```

### 5. Create Project Structure
Create the following folders:
```
src/
  components/
  hooks/
  utils/
  types/
  services/
```

### 6. Install Additional Dependencies
```bash
npm install uuid
npm install -D @types/uuid
```

### 7. Clean Up Template Files
- Remove default Vite template content from `App.tsx`
- Keep basic App component shell
- Update `App.tsx` to simple hello world:
```tsx
function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <h1 className="text-2xl font-bold p-4">Video Prompt Lab</h1>
    </div>
  )
}

export default App
```

### 8. Verify Setup
```bash
npm run dev
```
- Should run without errors
- Should show basic page with "Video Prompt Lab" heading
- TailwindCSS should be working (verify by seeing gray background)

## Acceptance Criteria
- [ ] Project runs with `npm run dev`
- [ ] TailwindCSS is properly configured and working
- [ ] Environment variable setup is ready (`.env.local` and `.env.example`)
- [ ] Project structure folders created
- [ ] TypeScript compilation works without errors
- [ ] Basic App component renders successfully

## Files to Create/Modify
- `package.json`
- `vite.config.ts`
- `tailwind.config.js`
- `postcss.config.js`
- `.env.example`
- `.env.local` (local only, not committed)
- `.gitignore`
- `src/index.css`
- `src/App.tsx`
- Folder structure under `src/`

## Testing
- Run `npm run dev` and verify app loads
- Check that TailwindCSS classes apply correctly
- Verify TypeScript has no errors (`npm run build`)

## Notes for Junior Engineers
- Make sure to replace `your_api_key_here` with an actual Replicate API key in `.env.local`
- Never commit `.env.local` - it contains secrets!
- If Vite port 5173 is in use, Vite will auto-increment to 5174, etc.
- The `VITE_` prefix is required for environment variables to be accessible in browser code
