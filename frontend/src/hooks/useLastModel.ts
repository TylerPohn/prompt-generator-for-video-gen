import { useState, useEffect } from 'react';
import { StorageKeys, getFromStorage, setToStorage } from '../utils/localStorage';
import { AVAILABLE_MODELS } from '../types';

export function useLastModel() {
  const [lastModel, setLastModel] = useState<string>(() => {
    const stored = getFromStorage<string>(
      StorageKeys.LAST_MODEL,
      AVAILABLE_MODELS[0]?.id || ''
    );

    // Validate that the stored model still exists in available models
    const isValidModel = AVAILABLE_MODELS.some(model => model.id === stored);

    return isValidModel ? stored : (AVAILABLE_MODELS[0]?.id || '');
  });

  useEffect(() => {
    if (lastModel) {
      setToStorage(StorageKeys.LAST_MODEL, lastModel);
    }
  }, [lastModel]);

  return { lastModel, setLastModel };
}
