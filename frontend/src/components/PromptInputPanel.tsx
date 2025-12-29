import { type FormEvent, useMemo } from 'react';
import { getAvailableModels } from '../services/modelRouter';
import type { VideoCard } from '../types';
import { useVideoGeneration } from '../hooks/useVideoGeneration';
import { useLastModel } from '../hooks/useLastModel';

interface PromptInputPanelProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  duration: number;
  onDurationChange: (duration: number) => void;
  onCardCreate: (card: VideoCard) => void;
  onCardUpdate: (id: string, updates: Partial<VideoCard>) => void;
}

export function PromptInputPanel({ prompt, onPromptChange, duration, onDurationChange, onCardCreate, onCardUpdate }: PromptInputPanelProps) {
  const { lastModel, setLastModel } = useLastModel();
  const { generate, isGenerating } = useVideoGeneration();

  // Group models by backend
  const { awsModels, replicateModels, availableModels } = useMemo(() => {
    const available = getAvailableModels();
    const aws = available.filter(m => m.backend === 'aws');
    const replicate = available.filter(m => m.backend === 'replicate');
    return { awsModels: aws, replicateModels: replicate, availableModels: available };
  }, []);

  // Get description for selected model
  const selectedModelDescription = useMemo(() => {
    return availableModels.find(m => m.id === lastModel)?.description || '';
  }, [lastModel, availableModels]);

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
            htmlFor="duration"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Video Length
          </label>
          <select
            id="duration"
            value={duration}
            onChange={(e) => onDurationChange(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={isGenerating}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((sec) => (
              <option key={sec} value={sec}>
                {sec} second{sec !== 1 ? 's' : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            💡 Use 1-3s for memory-constrained GPUs
          </p>
        </div>

        <div>
          <label
            htmlFor="model"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Model / GPU Selection
          </label>
          <select
            id="model"
            value={lastModel}
            onChange={(e) => setLastModel(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={isGenerating}
          >
            {awsModels.length > 0 && (
              <optgroup label="🔥 AWS GPU (Self-Hosted)">
                {awsModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </optgroup>
            )}

            <optgroup label="☁️ Replicate API">
              {replicateModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </optgroup>
          </select>

          {/* Show description for selected model */}
          {selectedModelDescription && (
            <p className="text-xs text-gray-500 mt-1">
              {selectedModelDescription}
            </p>
          )}
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
