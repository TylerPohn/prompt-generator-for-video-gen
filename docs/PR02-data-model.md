# PR02: Data Model & TypeScript Interfaces

## Dependencies
- PR01 (Project Setup) - for TypeScript configuration

## Overview
Define all TypeScript interfaces and types that will be used throughout the application. This establishes the data contract for video cards, models, and application state.

## Objectives
- Create TypeScript interfaces matching the PRD data model
- Define types for all domain entities
- Create enums for status and other constants
- Set up types for Replicate API responses

## Technical Decisions
- Use `interface` for object shapes (better for extension)
- Use `type` for unions and complex types
- Use `enum` for fixed sets of values (status, etc.)
- All types in `src/types/` folder

## Tasks

### 1. Create Core VideoCard Interface
Create `src/types/videoCard.ts`:
```typescript
export type VideoStatus = "pending" | "generating" | "complete" | "error";

export interface VideoCard {
  id: string; // uuid
  prompt: string;
  model: string; // replicate model ID
  status: VideoStatus;
  videoUrl?: string;
  thumbnailUrl?: string;
  isFavorite: boolean;
  labels: string[];
  createdAt: number; // timestamp
  errorMessage?: string; // for error status
}
```

### 2. Create Model Types
Create `src/types/model.ts`:
```typescript
export interface ReplicateModel {
  id: string; // e.g., "bytedance/seedance-1.0"
  name: string; // display name
  description?: string;
}

// Hardcoded model list from PRD
export const AVAILABLE_MODELS: ReplicateModel[] = [
  {
    id: "bytedance/seedance-1.0",
    name: "Bytedance Seedance 1.0",
  },
  {
    id: "hailuo/hailuo-02",
    name: "Hailuo 02",
  },
  {
    id: "kling/kling-2.5-turbo",
    name: "Kling 2.5 Turbo",
  },
  {
    id: "google/veo-3",
    name: "Google Veo 3",
  },
  // Add best sora 2 model when available
];
```

### 3. Create Filter Types
Create `src/types/filters.ts`:
```typescript
export interface FilterState {
  showFavoritesOnly: boolean;
  selectedLabel: string | null; // null means show all
}
```

### 4. Create Replicate API Types
Create `src/types/replicate.ts`:
```typescript
export interface ReplicatePredictionRequest {
  version?: string;
  input: {
    prompt: string;
    [key: string]: unknown; // additional model-specific params
  };
}

export interface ReplicatePredictionResponse {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[]; // video URL(s)
  error?: string;
  urls?: {
    get: string;
    cancel: string;
  };
}
```

### 5. Create Label Types
Create `src/types/label.ts`:
```typescript
export interface LabelColor {
  label: string;
  color: string; // hex color code
}

export interface LabelColorMap {
  [label: string]: string; // label -> color mapping
}
```

### 6. Create Index File for Easy Imports
Create `src/types/index.ts`:
```typescript
export * from './videoCard';
export * from './model';
export * from './filters';
export * from './replicate';
export * from './label';
```

## Acceptance Criteria
- [ ] All interfaces are properly typed
- [ ] TypeScript compilation succeeds with no errors
- [ ] All types are exported from `src/types/index.ts`
- [ ] Model list includes all models from PRD
- [ ] VideoCard interface matches PRD specification exactly
- [ ] Types can be imported: `import { VideoCard, VideoStatus } from '@/types'`

## Files to Create
- `src/types/videoCard.ts`
- `src/types/model.ts`
- `src/types/filters.ts`
- `src/types/replicate.ts`
- `src/types/label.ts`
- `src/types/index.ts`

## Testing
- Run `npm run build` - should compile without TypeScript errors
- Try importing types in `App.tsx` to verify they're accessible
- No runtime testing needed (types are compile-time only)

## Notes for Junior Engineers
- Types don't execute at runtime - they're for TypeScript's type checker
- The `?` after a property name means it's optional (e.g., `videoUrl?: string`)
- Union types like `"pending" | "generating"` mean the value must be one of those strings
- The `unknown` type is safer than `any` - it requires type checking before use
- Export everything from `index.ts` to allow clean imports elsewhere
