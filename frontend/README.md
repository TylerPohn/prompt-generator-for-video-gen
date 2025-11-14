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

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open http://localhost:5173 in your browser

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
