import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLinkAlt, faExclamationTriangle, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { useMovie } from '../../hooks/useMovies';
import { useToggleLockField } from '../../hooks/useLockField';
import { SaveBar } from '../common/SaveBar';
import { GridField } from './GridField';
import { TextAreaField } from './TextAreaField';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

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
  mpaa?: string;
  premiered?: string;
  user_rating?: number;
  trailer_url?: string;
  tmdb_id?: number;
  imdb_id?: string;

  // Field locking
  title_locked: boolean;
  original_title_locked: boolean;
  sort_title_locked: boolean;
  year_locked: boolean;
  plot_locked: boolean;
  outline_locked: boolean;
  tagline_locked: boolean;
  mpaa_locked: boolean;
  premiered_locked: boolean;
  user_rating_locked: boolean;
  trailer_url_locked: boolean;

  // Related entities
  genres?: string[];
  directors?: string[];
  writers?: string[];
  studios?: string[];
  countries?: string[];
  tags?: string[];
}

interface SearchResult {
  tmdbId: number;
  title: string;
  year?: number;
  plot?: string;
  posterUrl?: string;
  imdbId?: string;
}

export const MetadataTab: React.FC<MetadataTabProps> = ({ movieId }) => {
  // Use TanStack Query to fetch movie data
  const { data: movieData, isLoading: loading } = useMovie(movieId);
  const queryClient = useQueryClient();

  // Use lock field mutation hook
  const toggleLockField = useToggleLockField();

  const [metadata, setMetadata] = useState<MovieMetadata | null>(null);
  const [originalMetadata, setOriginalMetadata] = useState<MovieMetadata | null>(null);
  const [saving, setSaving] = useState(false);

  // Identification banner state
  const [bannerExpanded, setBannerExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

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
        mpaa_locked: movieData.mpaa_locked ?? false,
        premiered_locked: movieData.premiered_locked ?? false,
        user_rating_locked: movieData.user_rating_locked ?? false,
        trailer_url_locked: movieData.trailer_url_locked ?? false,
      };

      setMetadata(normalizedData);
      setOriginalMetadata(structuredClone(normalizedData));
    }
  }, [movieData]);

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
      }
    } catch (error) {
      console.error('Failed to save metadata:', error);
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
      const response = await fetch(`/api/movies/${movieId}/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tmdbId: result.tmdbId,
          title: result.title,
          year: result.year,
          imdbId: result.imdbId,
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

  return (
    <>
      {/* Portal-based save bar - renders outside component tree */}
      <SaveBar
        hasChanges={hasChanges}
        onSave={handleSave}
        onReset={handleReset}
        saving={saving}
      />

      <div className="space-y-3">
        {/* Identification Banner - Only show if unidentified */}
        {movieData?.identification_status === 'unidentified' && (
          <div className="border border-yellow-600/50 bg-yellow-500/10 rounded-lg overflow-hidden">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <FontAwesomeIcon
                  icon={faExclamationTriangle}
                  className="text-yellow-500 text-xl mt-0.5 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-yellow-500">Movie Unidentified</h3>
                    <button
                      onClick={() => setBannerExpanded(!bannerExpanded)}
                      className="text-yellow-500 hover:text-yellow-400 transition-colors"
                    >
                      <FontAwesomeIcon icon={bannerExpanded ? faChevronUp : faChevronDown} />
                    </button>
                  </div>
                  <p className="text-sm text-neutral-300 mb-3">
                    Search TMDB to identify this movie and enable metadata enrichment.
                  </p>

                  {bannerExpanded && (
                    <div className="space-y-3">
                      {/* Search Input */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyPress={handleSearchKeyPress}
                          placeholder="Search title..."
                          className="flex-1 h-9 px-3 py-2 text-sm bg-neutral-900 border border-neutral-700 rounded-md text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500"
                          disabled={searching}
                        />
                        <button
                          onClick={handleSearch}
                          disabled={searching || !searchQuery.trim()}
                          className="btn btn-primary px-4 h-9 text-sm disabled:opacity-50"
                        >
                          {searching ? 'Searching...' : 'Search TMDB'}
                        </button>
                      </div>

                      {/* Search Results */}
                      {searchResults.length > 0 && (
                        <div className="space-y-2 max-h-64 overflow-y-auto border border-neutral-700 rounded-md bg-neutral-900/50">
                          {searchResults.map((result) => (
                            <div
                              key={result.tmdbId}
                              className="flex items-start gap-3 p-3 hover:bg-neutral-800/50 transition-colors border-b border-neutral-700 last:border-b-0"
                            >
                              {/* Poster Thumbnail */}
                              {result.posterUrl ? (
                                <img
                                  src={result.posterUrl}
                                  alt={result.title}
                                  className="w-12 h-18 object-cover rounded flex-shrink-0"
                                />
                              ) : (
                                <div className="w-12 h-18 bg-neutral-800 rounded flex items-center justify-center flex-shrink-0">
                                  <FontAwesomeIcon icon={faExternalLinkAlt} className="text-neutral-600" />
                                </div>
                              )}

                              {/* Movie Info */}
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-white">
                                  {result.title} {result.year && `(${result.year})`}
                                </h4>
                                {result.plot && (
                                  <p className="text-sm text-neutral-400 line-clamp-1 mt-1">
                                    {result.plot}
                                  </p>
                                )}
                                <p className="text-xs text-neutral-500 mt-1">
                                  TMDB ID: {result.tmdbId}
                                </p>
                              </div>

                              {/* Select Button */}
                              <button
                                onClick={() => handleIdentify(result)}
                                className="btn btn-secondary btn-sm px-3 h-8 text-sm flex-shrink-0"
                              >
                                Select
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Grid layout */}
      <div className="card">
        <div className="card-body p-3 space-y-2.5">

          {/* Row 1: Title (span 3) + Year */}
          <div className="grid grid-cols-4 gap-2">
            <GridField
              label="Title"
              field="title"
              value={metadata.title}
              locked={metadata.title_locked}
              onChange={(val) => handleFieldChange('title', val)}
              onToggleLock={handleToggleLock}
              className="col-span-3"
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
          <div className="grid grid-cols-2 gap-2">
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

          {/* Row 3: MPAA + Premiered + User Rating + Tagline */}
          <div className="grid grid-cols-4 gap-2">
            <GridField
              label="MPAA"
              field="mpaa"
              value={metadata.mpaa}
              locked={metadata.mpaa_locked}
              onChange={(val) => handleFieldChange('mpaa', val)}
              onToggleLock={handleToggleLock}
            />
            <GridField
              label="Premiered"
              field="premiered"
              value={metadata.premiered}
              locked={metadata.premiered_locked}
              type="date"
              onChange={(val) => handleFieldChange('premiered', val)}
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

          {/* Divider */}
          <div className="border-t border-neutral-700"></div>

          {/* Row 6: TMDB ID + IMDB ID + Trailer URL */}
          <div className="grid grid-cols-3 gap-2">
            <ReadOnlyField
              label="TMDB ID"
              value={metadata.tmdb_id}
              link={metadata.tmdb_id ? `https://www.themoviedb.org/movie/${metadata.tmdb_id}` : undefined}
            />
            <ReadOnlyField
              label="IMDB ID"
              value={metadata.imdb_id}
              link={metadata.imdb_id ? `https://www.imdb.com/title/${metadata.imdb_id}` : undefined}
            />
            <GridField
              label="Trailer URL"
              field="trailer_url"
              value={metadata.trailer_url}
              locked={metadata.trailer_url_locked}
              onChange={(val) => handleFieldChange('trailer_url', val)}
              onToggleLock={handleToggleLock}
            />
          </div>

          {/* Divider */}
          <div className="border-t border-neutral-700"></div>

          {/* Related Entities - Compact badge rows */}
          <div className="space-y-0.5 rounded-lg border border-neutral-700 bg-neutral-800/30 p-2.5">
            <BadgeRow label="Genres" items={metadata.genres} />
            <BadgeRow label="Directors" items={metadata.directors} />
            <BadgeRow label="Writers" items={metadata.writers} />
            <BadgeRow label="Studios" items={metadata.studios} />
            <BadgeRow label="Countries" items={metadata.countries} />
            <BadgeRow label="Tags" items={metadata.tags} />
          </div>
        </div>
      </div>
      </div>
    </>
  );
};
