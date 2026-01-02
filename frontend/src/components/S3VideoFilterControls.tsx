import type { SortField } from '../services/awsVideoClient';
import type { S3VideoFilters } from '../hooks/useS3Videos';

interface S3VideoFilterControlsProps {
  filters: S3VideoFilters;
  onSearchChange: (query: string) => void;
  onSortFieldChange: (field: SortField) => void;
  onToggleSortOrder: () => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  totalCount: number;
  filteredCount: number;
  isLoading?: boolean;
}

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'lastModified', label: 'Date' },
  { value: 'size', label: 'Size' },
  { value: 'key', label: 'Name' },
  { value: 'upvotes', label: 'Upvotes' },
];

export function S3VideoFilterControls({
  filters,
  onSearchChange,
  onSortFieldChange,
  onToggleSortOrder,
  onClearFilters,
  hasActiveFilters,
  totalCount,
  filteredCount,
  isLoading = false,
}: S3VideoFilterControlsProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      {/* Search Input */}
      <div className="flex-1">
        <div className="relative">
          <input
            type="text"
            placeholder="Search videos..."
            value={filters.searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full px-4 py-2 pl-10 bg-gray-800 border border-gray-700 rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Sort Controls */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">Sort by:</span>
        <select
          value={filters.sortField}
          onChange={(e) => onSortFieldChange(e.target.value as SortField)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Sort Order Toggle */}
        <button
          onClick={onToggleSortOrder}
          className="p-2 bg-gray-800 border border-gray-700 rounded-md text-gray-300 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          title={filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
        >
          {filters.sortOrder === 'asc' ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
            </svg>
          )}
        </button>
      </div>

      {/* Results Count & Clear */}
      <div className="flex items-center gap-3">
        {isLoading && (
          <span className="text-sm text-gray-400 flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Loading...
          </span>
        )}
        {!isLoading && filters.searchQuery && (
          <span className="text-sm text-gray-400">
            {filteredCount} of {totalCount} videos
          </span>
        )}
        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="text-sm text-gray-400 hover:text-gray-200 underline"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
