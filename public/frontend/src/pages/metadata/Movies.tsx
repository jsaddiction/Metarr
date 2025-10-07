import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Fuse from 'fuse.js';
import { ViewControls, ViewMode } from '../../components/ui/ViewControls';
import { VirtualizedMovieTable } from '../../components/movie/VirtualizedMovieTable';
import { Movie } from '../../types/movie';
import { movieApi } from '../../utils/api';

export const Movies: React.FC = () => {
  const navigate = useNavigate();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Debounce search input for performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load movies on mount
  useEffect(() => {
    const loadMovies = async () => {
      try {
        const result = await movieApi.getAll();
        setMovies(result.movies || []);
      } catch (error) {
        console.error('Failed to load movies:', error);
        setMovies([]);
      } finally {
        setLoading(false);
      }
    };

    loadMovies();
  }, []);

  // Subscribe to real-time movie updates
  useEffect(() => {
    const cleanup = movieApi.subscribeToUpdates(
      // Movies added (batch)
      (addedMovies) => {
        if (addedMovies && Array.isArray(addedMovies)) {
          setMovies((prev) => [...prev, ...addedMovies]);
        }
      },
      // Movie updated
      (updatedMovie) => {
        if (updatedMovie) {
          setMovies((prev) =>
            prev.map((m) => (m.id === updatedMovie.id ? updatedMovie : m))
          );
        }
      },
      // Movie removed
      (removedId) => {
        if (removedId !== undefined && removedId !== null) {
          setMovies((prev) => prev.filter((m) => m.id !== removedId));
        }
      }
    );

    return cleanup;
  }, []);

  // Initialize Fuse.js for fuzzy search
  const fuse = useMemo(() => {
    return new Fuse(movies, {
      keys: ['title', 'studio'],
      threshold: 0.4,
      ignoreLocation: true,
      includeScore: true,
    });
  }, [movies]);

  // Filter movies based on debounced search term
  const filteredMovies = useMemo(() => {
    if (!debouncedSearchTerm.trim()) {
      return movies;
    }
    return fuse.search(debouncedSearchTerm).map((result) => result.item);
  }, [debouncedSearchTerm, movies, fuse]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const result = await movieApi.getAll();
      setMovies(result.movies || []);
    } catch (error) {
      console.error('Failed to refresh movies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMovieClick = (movie: Movie) => {
    navigate(`/metadata/movies/${movie.id}/edit`);
  };

  const handleRefreshClick = (movie: Movie) => {
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
          />
        </div>

        <div className="content-spacing">
          <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
            <p className="text-lg">No movies matching "{searchTerm}"</p>
            <p className="text-sm mt-2">Try adjusting your search terms</p>
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
        />
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
