import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faLock,
  faLockOpen,
  faSave,
  faUndo,
  faExternalLinkAlt,
  faChevronUp,
  faChevronDown,
  faCalendar,
} from '@fortawesome/free-solid-svg-icons';
import { useMovie } from '../../hooks/useMovies';

// CSS to hide default date input calendar icon
const hideDatePickerStyle = `
  input[type="date"]::-webkit-calendar-picker-indicator {
    display: none;
    -webkit-appearance: none;
  }
  input[type="date"]::-webkit-inner-spin-button,
  input[type="date"]::-webkit-outer-spin-button {
    display: none;
    -webkit-appearance: none;
  }
`;

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
  actors?: Array<{ name: string; role?: string; order?: number }>;
}

export const MetadataTab: React.FC<MetadataTabProps> = ({ movieId }) => {
  // Use TanStack Query to fetch movie data
  const { data: movieData, isLoading: loading, refetch } = useMovie(movieId);

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
      setOriginalMetadata(JSON.parse(JSON.stringify(normalizedData))); // Deep copy
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

  const handleFieldChange = (field: keyof MovieMetadata, value: any) => {
    if (!metadata) return;

    setMetadata({
      ...metadata,
      [field]: value,
    });
  };

  const toggleFieldLock = (field: string) => {
    if (!metadata) return;

    const lockField = `${field}_locked` as keyof MovieMetadata;
    const newLockedValue = !metadata[lockField];

    setMetadata({
      ...metadata,
      [lockField]: newLockedValue,
    });
  };

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
        // Update original metadata to match saved state (deep copy)
        setOriginalMetadata(JSON.parse(JSON.stringify(metadata)));
      }
    } catch (error) {
      console.error('Failed to save metadata:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    // Reset to original server data (deep copy)
    if (originalMetadata) {
      setMetadata(JSON.parse(JSON.stringify(originalMetadata)));
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

  const GridField: React.FC<{
    label: string;
    field: string;
    value: any;
    locked: boolean;
    type?: 'text' | 'number' | 'date';
    onChange: (value: any) => void;
    className?: string;
  }> = ({ label, field, value, locked, type = 'text', onChange, className = '' }) => {
    const dateInputRef = React.useRef<HTMLInputElement>(null);
    const hiddenDateInputRef = React.useRef<HTMLInputElement>(null);

    const handleIncrement = () => {
      const currentValue = parseFloat(value) || 0;
      onChange(currentValue + 1);
    };

    const handleDecrement = () => {
      const currentValue = parseFloat(value) || 0;
      onChange(currentValue - 1);
    };

    const handleCalendarClick = () => {
      if (hiddenDateInputRef.current) {
        hiddenDateInputRef.current.showPicker();
      }
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Format from native date input (YYYY-MM-DD) is already correct
      onChange(e.target.value);
    };

    const handleTextDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;

      // Allow empty value
      if (value === '') {
        onChange('');
        return;
      }

      // Validate YYYY-MM-DD format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(value)) {
        // Invalid format, don't update
        return;
      }

      // Validate it's a real date
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        // Invalid date, don't update
        return;
      }

      // Ensure the date components match (handles cases like 2024-02-31)
      const [year, month, day] = value.split('-').map(Number);
      if (
        date.getFullYear() !== year ||
        date.getMonth() + 1 !== month ||
        date.getDate() !== day
      ) {
        // Invalid date (e.g., Feb 31), don't update
        return;
      }

      onChange(value);
    };

    return (
      <div className={className}>
        <label className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider mb-1 block">
          {label}
        </label>
        <div className="flex items-stretch relative">
          {type === 'date' && (
            <input
              ref={hiddenDateInputRef}
              type="date"
              value={value || ''}
              onChange={handleDateChange}
              className="absolute opacity-0"
              style={{
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: -1,
                pointerEvents: 'none',
                textAlign: 'right'
              }}
            />
          )}
          <button
            onClick={() => toggleFieldLock(field)}
            className={`px-2 rounded-l border-l border-t border-b flex items-center ${
              locked
                ? 'bg-error/40 border-error/40 text-error'
                : 'bg-neutral-500 border-neutral-500 text-neutral-800 hover:bg-neutral-400'
            }`}
            title={locked ? 'Locked' : 'Unlocked'}
          >
            <FontAwesomeIcon icon={locked ? faLock : faLockOpen} className="text-[10px]" />
          </button>
          <input
            ref={type === 'date' ? dateInputRef : null}
            type={type === 'date' ? 'text' : type}
            value={value || ''}
            onChange={(e) => {
              if (type === 'number') {
                onChange(parseFloat(e.target.value));
              } else if (type === 'date') {
                handleTextDateChange(e);
              } else {
                onChange(e.target.value);
              }
            }}
            placeholder={type === 'date' ? 'YYYY-MM-DD' : undefined}
            className={`input flex-1 text-sm py-1.5 px-2.5 text-neutral-200 border-l-0 ${
              type === 'number' || type === 'date' ? 'rounded-none' : 'rounded-l-none'
            } focus:border-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
              locked ? 'border-error/40 focus:border-error' : 'border-neutral-500'
            }`}
          />
          {type === 'number' && (
            <div className="flex flex-col border-t border-b border-r rounded-r overflow-hidden border-neutral-500">
              <button
                onClick={handleIncrement}
                className="px-2 flex-1 flex items-center justify-center bg-neutral-500 text-neutral-800 hover:bg-neutral-400"
                title="Increment"
              >
                <FontAwesomeIcon icon={faChevronUp} className="text-[8px]" />
              </button>
              <div className="border-t border-neutral-600"></div>
              <button
                onClick={handleDecrement}
                className="px-2 flex-1 flex items-center justify-center bg-neutral-500 text-neutral-800 hover:bg-neutral-400"
                title="Decrement"
              >
                <FontAwesomeIcon icon={faChevronDown} className="text-[8px]" />
              </button>
            </div>
          )}
          {type === 'date' && (
            <button
              onClick={handleCalendarClick}
              className="px-2 border-t border-b border-r rounded-r flex items-center justify-center bg-neutral-500 border-neutral-500 text-neutral-800 hover:bg-neutral-400"
              title="Select date"
            >
              <FontAwesomeIcon icon={faCalendar} className="text-[10px]" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const TextAreaField: React.FC<{
    label: string;
    field: string;
    value: any;
    locked: boolean;
    onChange: (value: any) => void;
    rows?: number;
  }> = ({ label, field, value, locked, onChange, rows = 2 }) => (
    <div>
      <label className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider mb-1 block">
        {label}
      </label>
      <div className="flex items-stretch">
        <button
          onClick={() => toggleFieldLock(field)}
          className={`px-2 rounded-l border-l border-t border-b flex items-center ${
            locked
              ? 'bg-error/40 border-error/40 text-error'
              : 'bg-neutral-500 border-neutral-500 text-neutral-800 hover:bg-neutral-400'
          }`}
          title={locked ? 'Locked' : 'Unlocked'}
        >
          <FontAwesomeIcon icon={locked ? faLock : faLockOpen} className="text-[10px]" />
        </button>
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className={`input flex-1 text-sm py-1.5 px-2.5 resize-none text-neutral-200 border-l-0 rounded-l-none focus:border-primary ${
            locked ? 'border-error/40 focus:border-error' : 'border-neutral-500'
          }`}
          rows={rows}
        />
      </div>
    </div>
  );

  const ReadOnlyField: React.FC<{
    label: string;
    value: any;
    link?: string;
  }> = ({ label, value, link }) => (
    <div>
      <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1 block">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <div className="input flex-1 text-sm py-1.5 px-2.5 bg-neutral-800/30 border-neutral-500 text-neutral-300 cursor-not-allowed">
          {value || 'N/A'}
        </div>
        {link && value && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-xs px-1.5 h-[30px]"
            title="View external"
          >
            <FontAwesomeIcon icon={faExternalLinkAlt} className="text-[10px]" />
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
        <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider w-20 flex-shrink-0 pt-0.5">
          {label}
        </label>
        <div className="flex-1 flex flex-wrap gap-1">
          {items.map((item, idx) => (
            <span key={idx} className="badge badge-xs badge-secondary px-2 py-0.5">
              {item}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <style>{hideDatePickerStyle}</style>
      <div className="space-y-3">
        {/* Save/Reset actions - Always in DOM, visibility controlled by opacity */}
        <div
          className={`bg-neutral-700/50 backdrop-blur-sm rounded-lg px-4 py-3 flex items-center justify-between shadow-lg border-2 border-warning/40 transition-opacity duration-300 ${
            hasChanges ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-200">Unsaved changes</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-neutral-100 bg-neutral-600/50 hover:bg-neutral-600 rounded transition-colors duration-200 flex items-center gap-1.5 border border-neutral-400"
            >
              <FontAwesomeIcon icon={faUndo} className="text-[10px]" />
              Reset
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded transition-colors duration-200 flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={saving}
            >
              <FontAwesomeIcon icon={faSave} className="text-[10px]" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

      {/* Grid layout */}
      <div className="card">
        <div className="card-body p-3 space-y-3">

          {/* Row 1: Title (span 3) + Year */}
          <div className="grid grid-cols-4 gap-2">
            <GridField
              label="Title"
              field="title"
              value={metadata.title}
              locked={metadata.title_locked}
              onChange={(val) => handleFieldChange('title', val)}
              className="col-span-3"
            />
            <GridField
              label="Year"
              field="year"
              value={metadata.year}
              locked={metadata.year_locked}
              type="number"
              onChange={(val) => handleFieldChange('year', val)}
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
            />
            <GridField
              label="Sort Title"
              field="sort_title"
              value={metadata.sort_title}
              locked={metadata.sort_title_locked}
              onChange={(val) => handleFieldChange('sort_title', val)}
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
            />
            <GridField
              label="Premiered"
              field="premiered"
              value={metadata.premiered}
              locked={metadata.premiered_locked}
              type="date"
              onChange={(val) => handleFieldChange('premiered', val)}
            />
            <GridField
              label="User Rating"
              field="user_rating"
              value={metadata.user_rating}
              locked={metadata.user_rating_locked}
              type="number"
              onChange={(val) => handleFieldChange('user_rating', val)}
            />
            <GridField
              label="Tagline"
              field="tagline"
              value={metadata.tagline}
              locked={metadata.tagline_locked}
              onChange={(val) => handleFieldChange('tagline', val)}
            />
          </div>

          {/* Row 4: Outline */}
          <TextAreaField
            label="Outline"
            field="outline"
            value={metadata.outline}
            locked={metadata.outline_locked}
            onChange={(val) => handleFieldChange('outline', val)}
            rows={2}
          />

          {/* Row 5: Plot */}
          <TextAreaField
            label="Plot"
            field="plot"
            value={metadata.plot}
            locked={metadata.plot_locked}
            onChange={(val) => handleFieldChange('plot', val)}
            rows={3}
          />

          {/* Divider */}
          <div className="border-t border-neutral-700/30"></div>

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
            />
          </div>

          {/* Divider */}
          <div className="border-t border-neutral-700/30"></div>

          {/* Related Entities - Compact badge rows */}
          <div className="space-y-1 bg-neutral-800/20 rounded p-2">
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
