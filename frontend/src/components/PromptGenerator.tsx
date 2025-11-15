import { useState } from 'react';
import { PROMPT_OPTIONS, type PromptSelections } from '../types/promptGenerator';

interface PromptGeneratorProps {
  onUsePrompt: (prompt: string, duration: number) => void;
}

export function PromptGenerator({ onUsePrompt }: PromptGeneratorProps) {
  const [selections, setSelections] = useState<PromptSelections>({
    product: '',
    hook_type: undefined,
    pain_point: undefined,
    tone: undefined,
    visual_style: undefined,
    character_type: undefined,
    character_vibe: undefined,
    problem_context: undefined,
    emotion_first_3_seconds: undefined,
    platform: undefined,
    transition_type: undefined,
    ad_length: PROMPT_OPTIONS.ad_length[0], // Default to 4 seconds
  });

  const [generatedPrompt, setGeneratedPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const updateSelection = (key: keyof PromptSelections, value: string | number) => {
    setSelections(prev => ({ ...prev, [key]: value }));
  };

  const generatePrompt = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('http://localhost:3001/api/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selections),
      });

      if (!response.ok) {
        throw new Error('Failed to generate prompt');
      }

      const data = await response.json();
      setGeneratedPrompt(data.prompt);
    } catch (error) {
      console.error('Error generating prompt:', error);
      alert('Failed to generate prompt. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedPrompt);
    alert('Prompt copied to clipboard!');
  };

  const formatLabel = (key: string) => {
    return key.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const formatOption = (option: string) => {
    return option.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">AI Prompt Generator</h2>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          {isExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-4 mb-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product Name
            </label>
            <input
              type="text"
              value={selections.product}
              onChange={(e) => {
                const value = e.target.value.slice(0, 20); // Max 20 chars
                updateSelection('product', value);
              }}
              placeholder="e.g., Energy Drink, Wireless Earbuds"
              maxLength={20}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              {selections.product.length}/20 characters
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {(Object.keys(selections) as Array<keyof PromptSelections>)
              .filter(key => key !== 'product') // Product has its own input above
              .map((key) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {formatLabel(key)}
                </label>
                <select
                  value={selections[key] ?? ''}
                  onChange={(e) => {
                    const value = e.target.value === ''
                      ? undefined
                      : key === 'ad_length' ? Number(e.target.value) : e.target.value;
                    updateSelection(key, value);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  {key !== 'ad_length' && <option value="">None (optional)</option>}
                  {PROMPT_OPTIONS[key].map((option) => (
                    <option key={option} value={option}>
                      {key === 'ad_length' ? `${option} seconds` : formatOption(String(option))}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={generatePrompt}
        disabled={isGenerating}
        className="w-full px-4 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors mb-4"
      >
        {isGenerating ? 'Generating...' : 'Generate Prompt with AI'}
      </button>

      {generatedPrompt && (
        <div className="mt-4 space-y-3">
          <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{generatedPrompt}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={copyToClipboard}
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md font-medium hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              Copy to Clipboard
            </button>
            <button
              onClick={() => onUsePrompt(generatedPrompt, selections.ad_length)}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              Use This Prompt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
