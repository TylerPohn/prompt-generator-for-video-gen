import { useState, useCallback, useEffect, useRef } from 'react';
import { getAwsVideoClient } from '../services/awsVideoClient';
import type { S3VideoItem, ListVideosResponse, SortField, SortOrder } from '../services/awsVideoClient';

export interface S3VideoFilters {
  searchQuery: string;
  sortField: SortField;
  sortOrder: SortOrder;
}

export const DEFAULT_FILTERS: S3VideoFilters = {
  searchQuery: '',
  sortField: 'lastModified',
  sortOrder: 'desc',
};

interface UseS3VideosReturn {
  videos: S3VideoItem[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  totalCount: number;
  filters: S3VideoFilters;
  setSearchQuery: (query: string) => void;
  setSortField: (field: SortField) => void;
  toggleSortOrder: () => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  loadMore: () => Promise<void>;
  loadAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

const PAGE_SIZE = 24;

export function useS3Videos(): UseS3VideosReturn {
  const [videos, setVideos] = useState<S3VideoItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState<S3VideoFilters>(DEFAULT_FILTERS);

  // Track if initial load has happened
  const initialLoadDone = useRef(false);

  const loadVideos = useCallback(async (currentFilters: S3VideoFilters, currentPage: number, append: boolean = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const client = getAwsVideoClient();
      const response: ListVideosResponse = await client.listVideos({
        pageSize: PAGE_SIZE,
        page: currentPage,
        search: currentFilters.searchQuery,
        sortField: currentFilters.sortField,
        sortOrder: currentFilters.sortOrder,
      });

      if (append) {
        setVideos(prev => [...prev, ...response.videos]);
      } else {
        setVideos(response.videos);
      }
      setHasMore(!!response.nextToken);
      setTotalCount(response.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load videos');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load videos when filters change
  useEffect(() => {
    setPage(1);
    loadVideos(filters, 1, false);
    initialLoadDone.current = true;
  }, [filters, loadVideos]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading) return;

    const nextPage = page + 1;
    setPage(nextPage);
    await loadVideos(filters, nextPage, true);
  }, [hasMore, isLoading, page, filters, loadVideos]);

  const refresh = useCallback(async () => {
    setPage(1);
    setVideos([]);
    await loadVideos(filters, 1, false);
  }, [filters, loadVideos]);

  const loadAll = useCallback(async () => {
    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const client = getAwsVideoClient();
      const allVideos: S3VideoItem[] = [];
      let currentPage = 1;
      let keepLoading = true;

      while (keepLoading) {
        const response: ListVideosResponse = await client.listVideos({
          pageSize: PAGE_SIZE,
          page: currentPage,
          search: filters.searchQuery,
          sortField: filters.sortField,
          sortOrder: filters.sortOrder,
        });

        allVideos.push(...response.videos);
        setVideos([...allVideos]);
        setTotalCount(response.totalCount);

        if (!response.nextToken) {
          keepLoading = false;
          setHasMore(false);
        } else {
          currentPage++;
        }
      }

      setPage(currentPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load all videos');
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, filters]);

  const setSearchQuery = useCallback((query: string) => {
    setFilters(prev => ({ ...prev, searchQuery: query }));
  }, []);

  const setSortField = useCallback((field: SortField) => {
    setFilters(prev => ({ ...prev, sortField: field }));
  }, []);

  const toggleSortOrder = useCallback(() => {
    setFilters(prev => ({
      ...prev,
      sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const hasActiveFilters = filters.searchQuery.trim() !== '' ||
    filters.sortField !== DEFAULT_FILTERS.sortField ||
    filters.sortOrder !== DEFAULT_FILTERS.sortOrder;

  return {
    videos,
    isLoading,
    error,
    hasMore,
    totalCount,
    filters,
    setSearchQuery,
    setSortField,
    toggleSortOrder,
    clearFilters,
    hasActiveFilters,
    loadMore,
    loadAll,
    refresh,
  };
}
