import { useState, useEffect, useCallback } from 'react';
import type { VideoCard } from '../types';
import { StorageKeys, getFromStorage, setToStorage } from '../utils/localStorage';

export function useVideoCards() {
  const [cards, setCards] = useState<VideoCard[]>(() =>
    getFromStorage<VideoCard[]>(StorageKeys.VIDEO_CARDS, [])
  );

  // Save to localStorage whenever cards change
  useEffect(() => {
    setToStorage(StorageKeys.VIDEO_CARDS, cards);
  }, [cards]);

  const addCard = useCallback((card: VideoCard) => {
    setCards(prev => [card, ...prev]); // newest first
  }, []);

  const updateCard = useCallback((id: string, updates: Partial<VideoCard>) => {
    setCards(prev =>
      prev.map(card => card.id === id ? { ...card, ...updates } : card)
    );
  }, []);

  const deleteCard = useCallback((id: string) => {
    setCards(prev => prev.filter(card => card.id !== id));
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setCards(prev =>
      prev.map(card =>
        card.id === id ? { ...card, isFavorite: !card.isFavorite } : card
      )
    );
  }, []);

  const addLabel = useCallback((id: string, label: string) => {
    setCards(prev =>
      prev.map(card =>
        card.id === id && !card.labels.includes(label)
          ? { ...card, labels: [...card.labels, label] }
          : card
      )
    );
  }, []);

  const removeLabel = useCallback((id: string, label: string) => {
    setCards(prev =>
      prev.map(card =>
        card.id === id
          ? { ...card, labels: card.labels.filter(l => l !== label) }
          : card
      )
    );
  }, []);

  return {
    cards,
    addCard,
    updateCard,
    deleteCard,
    toggleFavorite,
    addLabel,
    removeLabel,
  };
}
