# Video Prompt Lab

A local-only application for experimenting with video generation models via the Replicate API.

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env.local` file:
   ```
   VITE_REPLICATE_API_KEY=your_api_key_here
   ```

4. **Run both proxy server and frontend together:**
   ```bash
   npm run dev:all
   ```

   This starts:
   - CORS proxy on http://localhost:3001 (handles API calls)
   - Frontend on http://localhost:5173 (your app)

5. Open http://localhost:5173 in your browser

### Why the Proxy?

The proxy server solves CORS (Cross-Origin Resource Sharing) issues when calling Replicate API from the browser. It:
- Runs locally on your machine
- Forwards API requests to Replicate with your API key
- Returns responses with CORS headers enabled

**Alternative:** Run them separately:
```bash
# Terminal 1
npm run dev:proxy

# Terminal 2
npm run dev
```

## Features

- Test prompts across multiple Replicate video models
- Organize outputs with favorites and custom labels
- Copy prompts for easy iteration
- Local persistence (no backend required)
- Automatic thumbnail generation
- Filter by favorites and labels
- Retry failed generations
- Delete cards with confirmation
- Smooth animations and transitions
- Full keyboard navigation support
- Accessibility features (ARIA labels, focus management, reduced motion support)

## Tech Stack

- Vite + React + TypeScript
- TailwindCSS
- Replicate API
- LocalStorage for persistence

## Accessibility

This application follows WCAG 2.1 AA accessibility standards:

- Full keyboard navigation (Tab, Shift+Tab, ESC)
- ARIA labels for all interactive elements
- Focus trap in modals
- Respects `prefers-reduced-motion` for users who prefer less animation
- Proper color contrast

## Development

### Project Structure

```
frontend/
├── src/
│   ├── components/      # React components
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utility functions and API clients
│   ├── styles/         # CSS files including animations
│   ├── types/          # TypeScript type definitions
│   ├── App.tsx         # Main application component
│   └── main.tsx        # Application entry point
├── index.html          # HTML template
└── package.json        # Dependencies and scripts
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## License

MIT
