import type { FilterState } from '../types';

interface FilterControlsProps {
  filters: FilterState;
  availableLabels: string[];
  onToggleFavorites: () => void;
  onSelectLabel: (label: string | null) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

export function FilterControls({
  filters,
  availableLabels,
  onToggleFavorites,
  onSelectLabel,
  onClearFilters,
  hasActiveFilters,
}: FilterControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Favorites Toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={filters.showFavoritesOnly}
          onChange={onToggleFavorites}
          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-sm font-medium text-gray-700">
          ⭐ Favorites Only
        </span>
      </label>

      {/* Label Filter Dropdown */}
      {availableLabels.length > 0 && (
        <select
          value={filters.selectedLabel || ''}
          onChange={(e) => onSelectLabel(e.target.value || null)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">All Labels</option>
          {availableLabels.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      )}

      {/* Clear Filters Button */}
      {hasActiveFilters && (
        <button
          onClick={onClearFilters}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 underline"
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}
