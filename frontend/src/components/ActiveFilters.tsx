import type { FilterState } from '../types';

interface ActiveFiltersProps {
  filters: FilterState;
  onRemoveFavoriteFilter: () => void;
  onRemoveLabelFilter: () => void;
}

export function ActiveFilters({
  filters,
  onRemoveFavoriteFilter,
  onRemoveLabelFilter,
}: ActiveFiltersProps) {
  const hasFilters = filters.showFavoritesOnly || filters.selectedLabel;

  if (!hasFilters) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <span className="text-sm text-gray-600">Active filters:</span>

      {filters.showFavoritesOnly && (
        <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
          ⭐ Favorites
          <button
            onClick={onRemoveFavoriteFilter}
            className="hover:text-blue-900"
            aria-label="Remove favorites filter"
          >
            ×
          </button>
        </span>
      )}

      {filters.selectedLabel && (
        <span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">
          Label: {filters.selectedLabel}
          <button
            onClick={onRemoveLabelFilter}
            className="hover:text-purple-900"
            aria-label="Remove label filter"
          >
            ×
          </button>
        </span>
      )}
    </div>
  );
}
