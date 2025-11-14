import { useState, useMemo } from 'react';
import type { VideoCard, FilterState } from '../types';

export function useFilters(cards: VideoCard[]) {
  const [filters, setFilters] = useState<FilterState>({
    showFavoritesOnly: false,
    selectedLabel: null,
  });

  // Get all unique labels from cards
  const availableLabels = useMemo(() => {
    const labelSet = new Set<string>();
    cards.forEach(card => {
      card.labels.forEach(label => labelSet.add(label));
    });
    return Array.from(labelSet).sort();
  }, [cards]);

  // Filter cards based on active filters
  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      // Filter by favorites
      if (filters.showFavoritesOnly && !card.isFavorite) {
        return false;
      }

      // Filter by label
      if (filters.selectedLabel && !card.labels.includes(filters.selectedLabel)) {
        return false;
      }

      return true;
    });
  }, [cards, filters]);

  const toggleFavoritesFilter = () => {
    setFilters(prev => ({
      ...prev,
      showFavoritesOnly: !prev.showFavoritesOnly,
    }));
  };

  const setLabelFilter = (label: string | null) => {
    setFilters(prev => ({
      ...prev,
      selectedLabel: label,
    }));
  };

  const clearFilters = () => {
    setFilters({
      showFavoritesOnly: false,
      selectedLabel: null,
    });
  };

  const hasActiveFilters = filters.showFavoritesOnly || filters.selectedLabel !== null;

  return {
    filters,
    filteredCards,
    availableLabels,
    toggleFavoritesFilter,
    setLabelFilter,
    clearFilters,
    hasActiveFilters,
  };
}
