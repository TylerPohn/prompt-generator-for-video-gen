import { useState, useEffect, useCallback } from 'react';
import type { LabelColorMap } from '../types';
import { StorageKeys, getFromStorage, setToStorage } from '../utils/localStorage';

const LABEL_COLORS = [
  '#EF4444', // red
  '#F59E0B', // amber
  '#10B981', // emerald
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
];

function getRandomColor(): string {
  return LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)];
}

export function useLabelColors() {
  const [labelColors, setLabelColors] = useState<LabelColorMap>(() =>
    getFromStorage<LabelColorMap>(StorageKeys.LABEL_COLORS, {})
  );

  useEffect(() => {
    setToStorage(StorageKeys.LABEL_COLORS, labelColors);
  }, [labelColors]);

  const getColorForLabel = useCallback((label: string): string => {
    if (labelColors[label]) {
      return labelColors[label];
    }

    // Assign new random color
    const color = getRandomColor();
    setLabelColors(prev => ({ ...prev, [label]: color }));
    return color;
  }, [labelColors]);

  return { labelColors, getColorForLabel };
}
