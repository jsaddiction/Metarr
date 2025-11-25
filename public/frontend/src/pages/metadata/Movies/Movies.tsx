import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Fuse from 'fuse.js';
import { ViewControls, ViewMode } from '@/components/ui/ViewControls';
import { VirtualizedMovieTable } from '@/components/movie/VirtualizedMovieTable';
import { PageContainer } from '@/components/ui/PageContainer';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { MovieListItem } from '@/types/movie';
import { useMovies } from '@/hooks/useMovies';

export const Movies: React.FC = () => {
  const navigate = useNavigate();

  // Use TanStack Query hook for movies data
  const { data: moviesData, isLoading: loading, refetch } = useMovies();
  const movies = moviesData?.movies || [];

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [indexedMovies, setIndexedMovies] = useState(movies);

  // Debounce search input for performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Debounce Fuse.js index rebuilding (only rebuild 500ms after last change)
  useEffect(() => {
    const timer = setTimeout(() => {
      setIndexedMovies(movies);
    }, 500);

    return () => clearTimeout(timer);
  }, [movies]);

  // Initialize Fuse.js for fuzzy search (now uses debounced indexedMovies)
  const fuse = useMemo(() => {
    return new Fuse(indexedMovies, {
      keys: ['title', 'studio'],
      threshold: 0.4,
      ignoreLocation: true,
      includeScore: true,
    });
  }, [indexedMovies]);

  // Filter movies based on debounced search term and status
  const filteredMovies = useMemo(() => {
    let result = movies;

    // Apply search filter
    if (debouncedSearchTerm.trim()) {
      result = fuse.search(debouncedSearchTerm).map((r) => r.item);
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter((m) => m.identification_status === statusFilter);
    }

    return result;
  }, [debouncedSearchTerm, statusFilter, movies, fuse]);

  const handleRefresh = async () => {
    refetch();
  };

  const handleMovieClick = (movie: MovieListItem) => {
    navigate(`/media/movies/${movie.id}/edit`);
  };

  const handleRefreshClick = (movie: MovieListItem) => {
    console.log('Refreshing metadata for:', movie.title);
    // TODO: Implement metadata refresh for individual movie
  };

  const handleSortChange = (sort: string) => {
    console.log('Sort changed:', sort);
    // TODO: Implement sorting logic
  };

  const handleFilterChange = (filter: string) => {
    console.log('Filter changed:', filter);
    // TODO: Implement filtering logic
  };

  // Loading state
  if (loading) {
    return (
      <PageContainer title="Movies" subtitle="Manage your movie library">
        <LoadingState size="lg" message="Loading movies..." />
      </PageContainer>
    );
  }

  // Empty database state - no movies at all
  if (movies.length === 0) {
    return (
      <PageContainer title="Movies" subtitle="Manage your movie library">
        <EmptyState
          title="No movies found in database"
          description="Add a movie library to get started"
          action={{
            label: "Setup Movie Library",
            onClick: () => navigate('/settings/libraries')
          }}
        />
      </PageContainer>
    );
  }

  // No search results (but movies exist in DB)
  if (filteredMovies.length === 0) {
    return (
      <>
        <div className="full-width-section">
          <ViewControls
            searchPlaceholder="Filter movies..."
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onRefresh={handleRefresh}
            onSortChange={handleSortChange}
            onFilterChange={handleFilterChange}
          >
            {/* Status Filter Dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
              aria-label="Filter by enrichment status"
            >
              <option value="all">All Status</option>
              <option value="unidentified">Unidentified</option>
              <option value="identified">Enriching</option>
              <option value="enriched">Enriched</option>
            </select>
          </ViewControls>
        </div>

        <PageContainer title="Movies" subtitle="Manage your movie library">
          <EmptyState
            title={`No movies matching "${searchTerm}"`}
            description="Try adjusting your search terms or status filter"
          />
        </PageContainer>
      </>
    );
  }

  // Render movie table with virtualization
  return (
    <>
      <div className="full-width-section">
        <ViewControls
          searchPlaceholder="Filter movies..."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onRefresh={handleRefresh}
          onSortChange={handleSortChange}
          onFilterChange={handleFilterChange}
        >
          {/* Status Filter Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Filter by enrichment status"
          >
            <option value="all">All Status</option>
            <option value="unidentified">Unidentified</option>
            <option value="identified">Enriching</option>
            <option value="enriched">Enriched</option>
          </select>
        </ViewControls>
      </div>

      <PageContainer title="Movies" subtitle="Manage your movie library">
        <VirtualizedMovieTable
          movies={filteredMovies}
          onMovieClick={handleMovieClick}
          onRefreshClick={handleRefreshClick}
        />
      </PageContainer>
    </>
  );
};
