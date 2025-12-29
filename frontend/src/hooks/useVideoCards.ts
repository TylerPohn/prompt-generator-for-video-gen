import { useState, useEffect, useCallback, useRef } from 'react';
import type { VideoCard } from '../types';
import { StorageKeys, getFromStorage, setToStorage } from '../utils/localStorage';

export function useVideoCards() {
  const [cards, setCards] = useState<VideoCard[]>(() =>
    getFromStorage<VideoCard[]>(StorageKeys.VIDEO_CARDS, [])
  );

  // Debounce localStorage writes to avoid performance issues
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardsRef = useRef(cards);

  // Keep ref updated
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  // Debounced save
  useEffect(() => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Schedule save after 500ms of inactivity
    saveTimeoutRef.current = setTimeout(() => {
      setToStorage(StorageKeys.VIDEO_CARDS, cards);
    }, 500);

    // Cleanup
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [cards]);

  // Save immediately on page unload to prevent data loss
  useEffect(() => {
    const handleBeforeUnload = () => {
      setToStorage(StorageKeys.VIDEO_CARDS, cardsRef.current);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

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
