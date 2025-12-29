import { useState, useEffect } from 'react';
import { StorageKeys, getFromStorage, setToStorage } from '../utils/localStorage';
import { getAvailableModels, getDefaultModel } from '../services/modelRouter';

export function useLastModel() {
  const [lastModel, setLastModel] = useState<string>(() => {
    const defaultModel = getDefaultModel();
    const stored = getFromStorage<string>(
      StorageKeys.LAST_MODEL,
      defaultModel
    );

    // Validate that the stored model still exists in available models
    const availableModels = getAvailableModels();
    const isValidModel = availableModels.some(model => model.id === stored);

    return isValidModel ? stored : defaultModel;
  });

  useEffect(() => {
    if (lastModel) {
      setToStorage(StorageKeys.LAST_MODEL, lastModel);
    }
  }, [lastModel]);

  return { lastModel, setLastModel };
}
