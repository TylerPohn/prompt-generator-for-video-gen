const STORAGE_PREFIX = 'videoPromptLab:';

export const StorageKeys = {
  VIDEO_CARDS: `${STORAGE_PREFIX}videoCards`,
  LABEL_COLORS: `${STORAGE_PREFIX}labelColors`,
  LAST_MODEL: `${STORAGE_PREFIX}lastModel`,
  PROMPT_HISTORY: `${STORAGE_PREFIX}promptHistory`,
} as const;

export function getFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    if (!item) return defaultValue;
    return JSON.parse(item) as T;
  } catch (error) {
    console.error(`Error reading from localStorage (${key}):`, error);
    return defaultValue;
  }
}

export function setToStorage<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Error writing to localStorage (${key}):`, error);
    // Handle quota exceeded or other errors
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn('LocalStorage quota exceeded. Consider cleaning old data.');
    }
    return false;
  }
}

export function removeFromStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Error removing from localStorage (${key}):`, error);
  }
}

export function clearAllAppStorage(): void {
  Object.values(StorageKeys).forEach(key => {
    removeFromStorage(key);
  });
}
