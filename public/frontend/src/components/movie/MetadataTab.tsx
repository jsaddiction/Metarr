import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLinkAlt, faExclamationTriangle, faChevronDown, faChevronUp, faSave, faUndo } from '@fortawesome/free-solid-svg-icons';
import { useMovie, useToggleLockField, useGenreSuggestions, useDirectorSuggestions, useWriterSuggestions, useStudioSuggestions, useCountrySuggestions, useTagSuggestions } from '../../hooks/useMovies';
import { GridField } from './GridField';
import { TextAreaField } from './TextAreaField';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { cleanMovieTitle, getFolderNameFromPath } from '@/utils/titleCleaning';
import { ProviderBadge } from '../ui/ProviderBadge';
import { StatusBadge } from '../ui/StatusBadge';
import { CurrencyDisplay } from '../ui/CurrencyDisplay';
import { PopularityIndicator } from '../ui/PopularityIndicator';
import { ReadOnlyDataGrid } from '../ui/ReadOnlyDataGrid';
import { TagInput } from '../ui/TagInput';
import { getLanguageName } from '@/utils/languages';

interface MetadataTabProps {
  movieId: number;
}

interface MovieMetadata {
  id: number;
  title: string;
  original_title?: string;
  sort_title?: string;
  year?: number;
  plot?: string;
  outline?: string;
  tagline?: string;
  content_rating?: string;  // MPAA rating (e.g., "PG-13", "R")
  release_date?: string;    // Release date (e.g., "2017-07-19")
  user_rating?: number;
  tmdb_id?: number;
  imdb_id?: string;

  // Production & Business Metadata (read-only from providers)
  budget?: number;
  revenue?: number;
  homepage?: string;
  original_language?: string;
  popularity?: number;
  status?: string;

  // Field locking
  title_locked: boolean;
  original_title_locked: boolean;
  sort_title_locked: boolean;
  year_locked: boolean;
  plot_locked: boolean;
  outline_locked: boolean;
  tagline_locked: boolean;
  content_rating_locked: boolean;
  release_date_locked: boolean;
  user_rating_locked: boolean;

  // Related entities
  genres?: string[];
  directors?: string[];
  writers?: string[];
  studios?: string[];
  countries?: string[];
  tags?: string[];
}

interface SearchResult {
  providerId: string;
  providerResultId: string;
  externalIds?: {
    imdb?: string;
    tmdb?: number;
    tvdb?: number;
  };
  title: string;
  originalTitle?: string;
  releaseDate?: string | Date;
  overview?: string;
  posterUrl?: string;
  confidence: number;
}

export const MetadataTab: React.FC<MetadataTabProps> = ({ movieId }) => {
  // Use TanStack Query to fetch movie data
  const { data: movieData, isLoading: loading } = useMovie(movieId);
  const queryClient = useQueryClient();

  // Use lock field mutation hook
  const toggleLockField = useToggleLockField();

  // Fetch autocomplete suggestions
  const { data: genreSuggestions = [] } = useGenreSuggestions();
  const { data: directorSuggestions = [] } = useDirectorSuggestions();
  const { data: writerSuggestions = [] } = useWriterSuggestions();
  const { data: studioSuggestions = [] } = useStudioSuggestions();
  const { data: countrySuggestions = [] } = useCountrySuggestions();
  const { data: tagSuggestions = [] } = useTagSuggestions();

  const [metadata, setMetadata] = useState<MovieMetadata | null>(null);
  const [originalMetadata, setOriginalMetadata] = useState<MovieMetadata | null>(null);
  const [saving, setSaving] = useState(false);

  // Identification banner state
  const [bannerExpanded, setBannerExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [hasAutoSearched, setHasAutoSearched] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Update local state when movie data changes (from TanStack Query cache)
  useEffect(() => {
    if (movieData) {
      const normalizedData = {
        ...movieData,
        title_locked: movieData.title_locked ?? false,
        original_title_locked: movieData.original_title_locked ?? false,
        sort_title_locked: movieData.sort_title_locked ?? false,
        year_locked: movieData.year_locked ?? false,
        plot_locked: movieData.plot_locked ?? false,
        outline_locked: movieData.outline_locked ?? false,
        tagline_locked: movieData.tagline_locked ?? false,
        content_rating_locked: movieData.content_rating_locked ?? false,
        release_date_locked: movieData.release_date_locked ?? false,
        user_rating_locked: movieData.user_rating_locked ?? false,
      };

      setMetadata(normalizedData);
      setOriginalMetadata(structuredClone(normalizedData));
    }
  }, [movieData]);

  // Auto-search on load for unidentified movies
  useEffect(() => {
    if (movieData?.identification_status === 'unidentified' && !hasAutoSearched) {
      const performAutoSearch = async () => {
        setSearching(true);
        setHasAutoSearched(true);

        try {
          let query = '';
          let results: SearchResult[] = [];

          // Helper function to perform a single search
          const performSearch = async (searchQuery: string): Promise<SearchResult[]> => {
            const response = await fetch(`/api/movies/${movieId}/search-tmdb`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: searchQuery, year: movieData.year }),
            });

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || 'Failed to search TMDB');
            }

            const data = await response.json();
            return data.results || [];
          };

          // Collect all possible search queries (NFO title, filename, folder name)
          const searchQueries: string[] = [];

          // Source 1: Title from database
          // If NFO was parsed with <title>, this is the NFO title (BEST)
          // Otherwise, this is the main video filename without extension (from backend)
          if (movieData.title && movieData.title !== 'Unknown') {
            const cleanedTitle = cleanMovieTitle(movieData.title);
            if (cleanedTitle) {
              searchQueries.push(cleanedTitle);
            }
          }

          // Source 2: Folder name from file_path
          // This is the directory name like "The Matrix (1999)"
          if (movieData.file_path) {
            const folderName = getFolderNameFromPath(movieData.file_path);
            const cleanedFolder = cleanMovieTitle(folderName);
            if (cleanedFolder && !searchQueries.includes(cleanedFolder)) {
              searchQueries.push(cleanedFolder);
            }
          }

          // Strategy: Try first query, if 0 results try second query
          // This covers all 3 sources (NFO, filename, folder) with only 2 API calls max
          if (searchQueries.length > 0) {
            // First search attempt
            query = searchQueries[0];
            results = await performSearch(query);

            // If no results and we have a second option, try it
            if (results.length === 0 && searchQueries.length > 1) {
              query = searchQueries[1];
              results = await performSearch(query);
            }
          }

          // Set final state
          setSearchQuery(query);
          setSearchResults(results);

          // If still no results, focus the input for manual entry
          if (results.length === 0) {
            setSearchQuery(''); // Clear the field
            setTimeout(() => {
              searchInputRef.current?.focus();
            }, 100);

            toast.info('No results found', {
              description: 'Please enter the movie title manually',
            });
          }
        } catch (error: any) {
          console.error('Auto-search failed:', error);
          toast.error('Auto-search failed', {
            description: error.message,
          });
          // Focus input on error too
          setTimeout(() => {
            searchInputRef.current?.focus();
          }, 100);
        } finally {
          setSearching(false);
        }
      };

      performAutoSearch();
    }
  }, [movieData, movieId, hasAutoSearched]);

  // Deep comparison to detect actual changes
  const hasChanges = React.useMemo(() => {
    if (!metadata || !originalMetadata) return false;

    // Sort keys to ensure consistent comparison
    const sortedMetadata = JSON.stringify(metadata, Object.keys(metadata).sort());
    const sortedOriginal = JSON.stringify(originalMetadata, Object.keys(originalMetadata).sort());

    return sortedMetadata !== sortedOriginal;
  }, [metadata, originalMetadata]);

  const handleFieldChange = useCallback((field: keyof MovieMetadata, value: any) => {
    setMetadata((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [field]: value,
      };
    });
  }, []);

  const handleToggleLock = useCallback((field: string) => {
    if (!metadata) return;

    const lockField = `${field}_locked` as keyof MovieMetadata;
    const currentlyLocked = Boolean(metadata[lockField]);

    // Call the backend API to toggle the lock
    toggleLockField.mutate({
      movieId,
      fieldName: field,
      currentlyLocked,
    });

    // Optimistically update local state
    setMetadata((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [lockField]: !currentlyLocked,
      };
    });
  }, [metadata, movieId, toggleLockField]);

  const handleSave = async () => {
    if (!metadata) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/movies/${movieId}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata),
      });

      if (response.ok) {
        // Update original metadata to match saved state
        setOriginalMetadata(structuredClone(metadata));

        // Invalidate suggestion caches to reflect new entities
        queryClient.invalidateQueries({ queryKey: ['genre-suggestions'] });
        queryClient.invalidateQueries({ queryKey: ['director-suggestions'] });
        queryClient.invalidateQueries({ queryKey: ['writer-suggestions'] });
        queryClient.invalidateQueries({ queryKey: ['studio-suggestions'] });
        queryClient.invalidateQueries({ queryKey: ['country-suggestions'] });
        queryClient.invalidateQueries({ queryKey: ['tag-suggestions'] });

        toast.success('Metadata saved successfully', {
          description: 'All changes have been saved',
        });
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Server returned ${response.status}`);
      }
    } catch (error: any) {
      console.error('Failed to save metadata:', error);
      toast.error('Failed to save metadata', {
        description: error.message || 'An unknown error occurred',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    // Reset to original server data
    if (originalMetadata) {
      setMetadata(structuredClone(originalMetadata));
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearchResults([]);

    try {
      const response = await fetch(`/api/movies/${movieId}/search-tmdb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          year: metadata?.year
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to search TMDB');
      }

      const data = await response.json();
      setSearchResults(data.results || []);

      if (data.results?.length === 0) {
        toast.info('No results found', {
          description: 'Try adjusting your search query',
        });
      }
    } catch (error: any) {
      console.error('Search failed:', error);
      toast.error('Search failed', {
        description: error.message,
      });
    } finally {
      setSearching(false);
    }
  };

  const handleIdentify = async (result: SearchResult) => {
    try {
      // Extract year from releaseDate if available
      const year = result.releaseDate ? new Date(result.releaseDate).getFullYear() : undefined;

      const response = await fetch(`/api/movies/${movieId}/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tmdbId: result.externalIds?.tmdb,
          title: result.title,
          year,
          imdbId: result.externalIds?.imdb,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to identify movie');
      }

      toast.success('Movie identified!', {
        description: "Click 'Enrich' to fetch full metadata.",
      });

      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['movie', movieId] });
      queryClient.invalidateQueries({ queryKey: ['movies'] });

      // Clear search state
      setSearchQuery('');
      setSearchResults([]);
    } catch (error: any) {
      console.error('Identify failed:', error);
      toast.error('Failed to identify movie', {
        description: error.message,
      });
    }
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-neutral-400">Loading metadata...</div>
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="text-center py-12">
        <div className="text-error">Failed to load metadata</div>
      </div>
    );
  }

  const ReadOnlyField: React.FC<{
    label: string;
    value: any;
    link?: string;
  }> = ({ label, value, link }) => (
    <div>
      <label className="text-xs font-medium text-neutral-400 mb-1 block">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-8 px-2.5 py-1 text-sm bg-neutral-800/50 border border-neutral-700 rounded-md text-neutral-400 cursor-not-allowed">
          {value || 'N/A'}
        </div>
        {link && value && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-md transition-colors hover:bg-neutral-700 h-8 w-8 shrink-0 text-neutral-400"
            title="View external"
          >
            <FontAwesomeIcon icon={faExternalLinkAlt} className="text-xs" />
          </a>
        )}
      </div>
    </div>
  );

  const BadgeRow: React.FC<{
    label: string;
    items?: string[];
  }> = ({ label, items }) => {
    if (!items || items.length === 0) return null;

    return (
      <div className="flex items-start gap-2 py-1">
        <label className="text-xs font-medium text-neutral-500 w-20 flex-shrink-0 pt-0.5">
          {label}
        </label>
        <div className="flex-1 flex flex-wrap gap-1">
          {items.map((item, idx) => (
            <span key={idx} className="inline-flex items-center rounded-md bg-neutral-700/50 border border-neutral-600 px-2 py-0.5 text-xs text-neutral-300">
              {item}
            </span>
          ))}
        </div>
      </div>
    );
  };

  // If movie is unidentified, show only the search UI
  if (movieData?.identification_status === 'unidentified') {
    return (
      <div className="space-y-3">
        <div className="border border-neutral-700 bg-neutral-800 rounded-lg overflow-hidden">
          <div className="p-6">
            <div className="flex items-start gap-4 mb-6">
              <FontAwesomeIcon
                icon={faExclamationTriangle}
                className="text-yellow-500 text-2xl mt-1 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-semibold text-yellow-500 mb-2">Movie Unidentified</h3>
                <p className="text-base text-neutral-300">
                  Search TMDB to identify this movie and enable metadata enrichment.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Search Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={handleSearchKeyPress}
                  placeholder="Search title..."
                  className="flex-1 h-10 px-4 py-2 text-base bg-neutral-900 border border-neutral-700 rounded-md text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500"
                  disabled={searching}
                  ref={searchInputRef}
                />
                <button
                  onClick={handleSearch}
                  disabled={searching || !searchQuery.trim()}
                  className="btn btn-primary px-6 h-10 text-base disabled:opacity-50"
                >
                  {searching ? 'Searching...' : 'Search TMDB'}
                </button>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="relative">
                  {/* Results count header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-neutral-700 border border-neutral-700 border-b-0 rounded-t-md">
                    <span className="text-sm text-neutral-400">
                      {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                    </span>
                    <span className="text-xs text-neutral-500">
                      Scroll for more
                    </span>
                  </div>

                  {/* Scrollable results area with visible scrollbar */}
                  <div
                    className="scrollable-results max-h-[60vh] overflow-y-scroll border border-neutral-700 rounded-b-md bg-neutral-800"
                    style={{
                      scrollbarWidth: 'thin',
                      scrollbarColor: '#6b7280 #1f2937'
                    }}
                  >
                      {searchResults.map((result) => {
                        const year = result.releaseDate ? new Date(result.releaseDate).getFullYear() : undefined;
                        const tmdbId = result.externalIds?.tmdb;
                        const tmdbUrl = tmdbId ? `https://www.themoviedb.org/movie/${tmdbId}` : null;

                        return (
                          <div
                            key={`${result.providerId}-${result.providerResultId}`}
                            className="flex items-center gap-4 p-3 hover:bg-neutral-700 transition-colors border-b border-neutral-700 last:border-b-0"
                          >
                            {/* Poster Thumbnail - Left */}
                            {result.posterUrl ? (
                              <img
                                src={result.posterUrl}
                                alt={result.title}
                                className="w-20 h-28 object-cover rounded flex-shrink-0"
                              />
                            ) : (
                              <div className="w-20 h-28 bg-neutral-800 rounded flex items-center justify-center flex-shrink-0">
                                <FontAwesomeIcon icon={faExternalLinkAlt} className="text-neutral-600" />
                              </div>
                            )}

                            {/* Movie Info - Middle */}
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                              {/* Title and Year - Top */}
                              <div className="mb-2">
                                {tmdbUrl ? (
                                  <a
                                    href={tmdbUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-semibold text-white text-base hover:text-primary-400 transition-colors inline-flex items-center gap-1.5"
                                  >
                                    {result.title} {year && `(${year})`}
                                    <FontAwesomeIcon icon={faExternalLinkAlt} className="text-xs text-neutral-500" />
                                  </a>
                                ) : (
                                  <h4 className="font-semibold text-white text-base">
                                    {result.title} {year && `(${year})`}
                                  </h4>
                                )}
                              </div>

                              {/* Overview - Bottom */}
                              {result.overview && (
                                <p className="text-sm text-neutral-400 line-clamp-2">
                                  {result.overview}
                                </p>
                              )}
                            </div>

                            {/* Select Button - Right */}
                            <button
                              onClick={() => handleIdentify(result)}
                              className="btn btn-secondary px-5 py-2 text-sm flex-shrink-0 self-center"
                            >
                              Select
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show full metadata editor when identified
  return (
    <div className="space-y-3">
      {/* Grid layout */}
      <div className="card">
        <div className="card-body p-4 space-y-3">
          {/* Header with Directory Path and Action Buttons */}
          <div className="flex items-center justify-between gap-4 pb-2 border-b border-neutral-700">
            {/* Directory Path */}
            <div className="flex-1 min-w-0">
              <div className="text-xs text-neutral-500 font-mono truncate" title={(movieData as any)?.file_path || ''}>
                {(movieData as any)?.file_path || 'No file path'}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleReset}
                disabled={!hasChanges}
                className={`
                  inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
                  transition-colors
                  ${hasChanges
                    ? 'bg-neutral-700 text-neutral-200 hover:bg-neutral-600'
                    : 'bg-neutral-800 text-neutral-500 cursor-not-allowed opacity-50'
                  }
                `}
              >
                <FontAwesomeIcon icon={faUndo} className="text-xs" />
                <span>Reset</span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className={`
                  inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
                  transition-colors
                  ${hasChanges && !saving
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'bg-neutral-800 text-neutral-500 cursor-not-allowed opacity-50'
                  }
                `}
              >
                <FontAwesomeIcon icon={faSave} className="text-xs" />
                <span>{saving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </div>

          {/* Base Metadata Section */}
          <div className="rounded-lg border border-neutral-700 bg-neutral-800/30 p-3">
            <h3 className="text-sm font-medium text-neutral-300 mb-3">Base Metadata</h3>

            <div className="space-y-2">
              {/* Row 1: Title (span 3) + Year */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <GridField
                  label="Title"
                  field="title"
                  value={metadata.title}
                  locked={metadata.title_locked}
                  onChange={(val) => handleFieldChange('title', val)}
                  onToggleLock={handleToggleLock}
                  className="sm:col-span-1 lg:col-span-3"
                />
                <GridField
                  label="Year"
                  field="year"
                  value={metadata.year}
                  locked={metadata.year_locked}
                  type="number"
                  onChange={(val) => handleFieldChange('year', val)}
                  onToggleLock={handleToggleLock}
                />
              </div>

              {/* Row 2: Original Title + Sort Title */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <GridField
                  label="Original Title"
                  field="original_title"
                  value={metadata.original_title}
                  locked={metadata.original_title_locked}
                  onChange={(val) => handleFieldChange('original_title', val)}
                  onToggleLock={handleToggleLock}
                />
                <GridField
                  label="Sort Title"
                  field="sort_title"
                  value={metadata.sort_title}
                  locked={metadata.sort_title_locked}
                  onChange={(val) => handleFieldChange('sort_title', val)}
                  onToggleLock={handleToggleLock}
                />
              </div>

              {/* Row 3: Content Rating + Release Date + User Rating + Tagline */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <GridField
                  label="Content Rating"
                  field="content_rating"
                  value={metadata.content_rating}
                  locked={metadata.content_rating_locked}
                  onChange={(val) => handleFieldChange('content_rating', val)}
                  onToggleLock={handleToggleLock}
                  placeholder="PG-13"
                />
                <GridField
                  label="Release Date"
                  field="release_date"
                  value={metadata.release_date}
                  locked={metadata.release_date_locked}
                  type="date"
                  onChange={(val) => handleFieldChange('release_date', val)}
                  onToggleLock={handleToggleLock}
                />
                <GridField
                  label="User Rating"
                  field="user_rating"
                  value={metadata.user_rating}
                  locked={metadata.user_rating_locked}
                  type="number"
                  onChange={(val) => handleFieldChange('user_rating', val)}
                  onToggleLock={handleToggleLock}
                />
                <GridField
                  label="Tagline"
                  field="tagline"
                  value={metadata.tagline}
                  locked={metadata.tagline_locked}
                  onChange={(val) => handleFieldChange('tagline', val)}
                  onToggleLock={handleToggleLock}
                />
              </div>

              {/* Row 4: Outline */}
              <TextAreaField
                label="Outline"
                field="outline"
                value={metadata.outline}
                locked={metadata.outline_locked}
                onChange={(val) => handleFieldChange('outline', val)}
                onToggleLock={handleToggleLock}
                rows={2}
              />

              {/* Row 5: Plot */}
              <TextAreaField
                label="Plot"
                field="plot"
                value={metadata.plot}
                locked={metadata.plot_locked}
                onChange={(val) => handleFieldChange('plot', val)}
                onToggleLock={handleToggleLock}
                rows={3}
              />
            </div>
          </div>

          {/* Extended Metadata Section */}
          <div className="rounded-lg border border-neutral-700 bg-neutral-800/30 p-3">
            <h3 className="text-sm font-medium text-neutral-300 mb-3">Extended Metadata</h3>

            {/* Multi-column grid layout for efficient space usage */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-stretch">
              <TagInput
                label="Genres"
                value={metadata.genres || []}
                onChange={(genres) => handleFieldChange('genres', genres)}
                suggestions={genreSuggestions}
                placeholder="Add genre..."
              />
              <TagInput
                label="Tags"
                value={metadata.tags || []}
                onChange={(tags) => handleFieldChange('tags', tags)}
                suggestions={tagSuggestions}
                placeholder="Add tag..."
              />
              <TagInput
                label="Directors"
                value={metadata.directors || []}
                onChange={(directors) => handleFieldChange('directors', directors)}
                suggestions={directorSuggestions}
                placeholder="Add director..."
              />
              <TagInput
                label="Writers"
                value={metadata.writers || []}
                onChange={(writers) => handleFieldChange('writers', writers)}
                suggestions={writerSuggestions}
                placeholder="Add writer..."
              />
              <TagInput
                label="Studios"
                value={metadata.studios || []}
                onChange={(studios) => handleFieldChange('studios', studios)}
                suggestions={studioSuggestions}
                placeholder="Add studio..."
              />
              <TagInput
                label="Countries"
                value={metadata.countries || []}
                onChange={(countries) => handleFieldChange('countries', countries)}
                suggestions={countrySuggestions}
                placeholder="Add country..."
              />
            </div>
          </div>

          {/* Production & Stats / External Links Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Production & Stats Section */}
            <div className="rounded-lg border border-neutral-700 bg-neutral-800/30 p-3">
              <h3 className="text-sm font-medium text-neutral-300 mb-2">Production & Stats</h3>
              <div className="grid grid-cols-2 gap-2">
                {metadata.status && <StatusBadge status={metadata.status} />}
                {metadata.original_language && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-neutral-600/30 bg-neutral-600/20 text-sm font-semibold text-neutral-300">
                    <span>{getLanguageName(metadata.original_language)}</span>
                  </div>
                )}
                {metadata.budget !== undefined && metadata.budget !== null && metadata.budget > 0 && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-neutral-600/30 bg-neutral-600/20 text-sm font-semibold text-neutral-300">
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-xs opacity-60 font-normal">Budget</span>
                      <span>${(metadata.budget / 1000000).toFixed(1)}M</span>
                    </div>
                  </div>
                )}
                {metadata.revenue !== undefined && metadata.revenue !== null && metadata.revenue > 0 && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-neutral-600/30 bg-neutral-600/20 text-sm font-semibold text-neutral-300">
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-xs opacity-60 font-normal">Revenue</span>
                      <span>${(metadata.revenue / 1000000).toFixed(1)}M</span>
                    </div>
                  </div>
                )}
                {metadata.popularity !== undefined && metadata.popularity !== null && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-neutral-600/30 bg-neutral-600/20 text-sm font-semibold text-neutral-300">
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-xs opacity-60 font-normal">Popularity</span>
                      <span>{metadata.popularity.toFixed(1)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* External Links Section */}
            <div className="rounded-lg border border-neutral-700 bg-neutral-800/30 p-3">
              <h3 className="text-sm font-medium text-neutral-300 mb-2">External Links</h3>
              <div className="grid grid-cols-2 gap-2">
                {metadata.tmdb_id && <ProviderBadge provider="tmdb" id={metadata.tmdb_id} showId />}
                {metadata.imdb_id && <ProviderBadge provider="imdb" id={metadata.imdb_id} showId />}
                {(movieData as any)?.tvdb_id && <ProviderBadge provider="tvdb" id={(movieData as any).tvdb_id} showId />}
                {(movieData as any)?.homepage && (
                  <ProviderBadge provider="homepage" id={(movieData as any).homepage} label="Website" />
                )}
                {(movieData as any)?.external_ids?.facebook_id && (
                  <ProviderBadge provider="facebook" id={(movieData as any).external_ids.facebook_id} />
                )}
                {(movieData as any)?.external_ids?.instagram_id && (
                  <ProviderBadge provider="instagram" id={(movieData as any).external_ids.instagram_id} />
                )}
                {(movieData as any)?.external_ids?.twitter_id && (
                  <ProviderBadge provider="twitter" id={(movieData as any).external_ids.twitter_id} />
                )}
                {(movieData as any)?.external_ids?.wikidata_id && (
                  <ProviderBadge provider="wikidata" id={(movieData as any).external_ids.wikidata_id} />
                )}
              </div>
            </div>
          </div>

          {/* Technical Details Section */}
          {((movieData as any)?.video_streams || (movieData as any)?.audio_streams) && (
            <>
              <div className="space-y-2 rounded-lg border border-neutral-700 bg-neutral-800/50 p-3">
                <h3 className="text-sm font-medium text-neutral-400 mb-2">
                  Technical Details
                  <span className="text-xs text-neutral-500 ml-2">Read-Only</span>
                </h3>
                <ReadOnlyDataGrid
                  sections={[
                    {
                      label: 'Video Codec',
                      value: (movieData as any)?.video_streams?.[0]?.codec || null,
                    },
                    {
                      label: 'Resolution',
                      value:
                        (movieData as any)?.video_streams?.[0]?.width && (movieData as any)?.video_streams?.[0]?.height
                          ? `${(movieData as any).video_streams[0].width}x${(movieData as any).video_streams[0].height}`
                          : null,
                    },
                    {
                      label: 'Audio Codec',
                      value: (movieData as any)?.audio_streams?.[0]?.codec || null,
                    },
                    {
                      label: 'Channels',
                      value: (movieData as any)?.audio_streams?.[0]?.channels || null,
                    },
                  ]}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
