import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons';
import { useMovie } from '../../hooks/useMovies';
import { SaveBar } from '../common/SaveBar';
import { GridField } from './GridField';
import { TextAreaField } from './TextAreaField';

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

export const MetadataTab: React.FC<MetadataTabProps> = ({ movieId }) => {
  // Use TanStack Query to fetch movie data
  const { data: movieData, isLoading: loading } = useMovie(movieId);

  const [metadata, setMetadata] = useState<MovieMetadata | null>(null);
  const [originalMetadata, setOriginalMetadata] = useState<MovieMetadata | null>(null);
  const [saving, setSaving] = useState(false);

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

  const toggleFieldLock = useCallback((field: string) => {
    setMetadata((prev) => {
      if (!prev) return prev;

      const lockField = `${field}_locked` as keyof MovieMetadata;
      const newLockedValue = !prev[lockField];

      return {
        ...prev,
        [lockField]: newLockedValue,
      };
    });
  }, []);

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
              onToggleLock={toggleFieldLock}
              className="col-span-3"
            />
            <GridField
              label="Year"
              field="year"
              value={metadata.year}
              locked={metadata.year_locked}
              type="number"
              onChange={(val) => handleFieldChange('year', val)}
              onToggleLock={toggleFieldLock}
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
              onToggleLock={toggleFieldLock}
            />
            <GridField
              label="Sort Title"
              field="sort_title"
              value={metadata.sort_title}
              locked={metadata.sort_title_locked}
              onChange={(val) => handleFieldChange('sort_title', val)}
              onToggleLock={toggleFieldLock}
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
              onToggleLock={toggleFieldLock}
            />
            <GridField
              label="Premiered"
              field="premiered"
              value={metadata.premiered}
              locked={metadata.premiered_locked}
              type="date"
              onChange={(val) => handleFieldChange('premiered', val)}
              onToggleLock={toggleFieldLock}
            />
            <GridField
              label="User Rating"
              field="user_rating"
              value={metadata.user_rating}
              locked={metadata.user_rating_locked}
              type="number"
              onChange={(val) => handleFieldChange('user_rating', val)}
              onToggleLock={toggleFieldLock}
            />
            <GridField
              label="Tagline"
              field="tagline"
              value={metadata.tagline}
              locked={metadata.tagline_locked}
              onChange={(val) => handleFieldChange('tagline', val)}
              onToggleLock={toggleFieldLock}
            />
          </div>

          {/* Row 4: Outline */}
          <TextAreaField
            label="Outline"
            field="outline"
            value={metadata.outline}
            locked={metadata.outline_locked}
            onChange={(val) => handleFieldChange('outline', val)}
            onToggleLock={toggleFieldLock}
            rows={2}
          />

          {/* Row 5: Plot */}
          <TextAreaField
            label="Plot"
            field="plot"
            value={metadata.plot}
            locked={metadata.plot_locked}
            onChange={(val) => handleFieldChange('plot', val)}
            onToggleLock={toggleFieldLock}
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
              onToggleLock={toggleFieldLock}
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
