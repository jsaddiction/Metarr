import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Fuse from 'fuse.js';
import { ViewControls, ViewMode } from '../../components/ui/ViewControls';
import { VirtualizedMovieTable } from '../../components/movie/VirtualizedMovieTable';
import { MovieListItem } from '../../types/movie';
import { useMovies } from '../../hooks/useMovies';

export const Movies: React.FC = () => {
  const navigate = useNavigate();

  // Use TanStack Query hook for movies data
  const { data: moviesData, isLoading: loading, refetch } = useMovies();
  const movies = moviesData?.movies || [];

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Debounce search input for performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Initialize Fuse.js for fuzzy search
  const fuse = useMemo(() => {
    return new Fuse(movies, {
      keys: ['title', 'studio'],
      threshold: 0.4,
      ignoreLocation: true,
      includeScore: true,
    });
  }, [movies]);

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
      <div className="content-spacing">
        <div className="flex items-center justify-center py-32 text-neutral-400">
          <div className="text-center">
            <div className="text-xl mb-2">Loading movies...</div>
            <div className="text-sm">Please wait</div>
          </div>
        </div>
      </div>
    );
  }

  // Empty database state - no movies at all
  if (movies.length === 0) {
    return (
      <div className="content-spacing">
        <div className="flex flex-col items-center justify-center py-32 text-neutral-400">
          <p className="text-xl mb-4">No movies found in database</p>
          <p className="text-sm mb-6">Add a movie library to get started</p>
          <button
            onClick={() => navigate('/settings/libraries')}
            className="btn btn-primary"
          >
            Setup Movie Library
          </button>
        </div>
      </div>
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

        <div className="content-spacing">
          <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
            <p className="text-lg">No movies matching "{searchTerm}"</p>
            <p className="text-sm mt-2">Try adjusting your search terms or status filter</p>
          </div>
        </div>
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

      <div className="content-spacing">
        <VirtualizedMovieTable
          movies={filteredMovies}
          onMovieClick={handleMovieClick}
          onRefreshClick={handleRefreshClick}
        />
      </div>
    </>
  );
};
