import { type FormEvent } from 'react';
import { AVAILABLE_MODELS } from '../types';
import type { VideoCard } from '../types';
import { useVideoGeneration } from '../hooks/useVideoGeneration';
import { useLastModel } from '../hooks/useLastModel';

interface PromptInputPanelProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  duration: number;
  onCardCreate: (card: VideoCard) => void;
  onCardUpdate: (id: string, updates: Partial<VideoCard>) => void;
}

export function PromptInputPanel({ prompt, onPromptChange, duration, onCardCreate, onCardUpdate }: PromptInputPanelProps) {
  const { lastModel, setLastModel } = useLastModel();
  const { generate, isGenerating } = useVideoGeneration();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!prompt.trim()) return;

    // Start generation
    await generate({
      prompt: prompt.trim(),
      model: lastModel,
      duration,
      onCardCreate,
      onCardUpdate,
    });

    // Optionally clear prompt after submission
    onPromptChange('');
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
            onChange={(e) => onPromptChange(e.target.value)}
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
