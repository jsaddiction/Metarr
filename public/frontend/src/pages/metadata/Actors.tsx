import React, { useState, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUserGroup,
  faSearch,
  faFilm,
  faTimes,
  faEdit,
  faSave,
  faLock,
  faUnlock,
} from '@fortawesome/free-solid-svg-icons';
import { useActors } from '../../hooks/useActors';

interface Actor {
  id: number;
  name: string;
  name_normalized: string;
  tmdb_id?: number;
  imdb_id?: string;
  image_cache_path?: string;
  image_hash?: string;
  identification_status: 'identified' | 'enriched';
  enrichment_priority: number;
  name_locked: boolean;
  image_locked: boolean;
  movie_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Convert image hash to cache URL
 * Cache structure: /cache/actors/{first2chars}/{next2chars}/{fullhash}.jpg
 */
function getImageUrl(hash: string | undefined): string | null {
  if (!hash) return null;
  const first2 = hash.substring(0, 2);
  const next2 = hash.substring(2, 4);
  return `/cache/actors/${first2}/${next2}/${hash}.jpg`;
}

export const Actors: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedActor, setSelectedActor] = useState<Actor | null>(null);

  // Fetch all actors once
  const { data, isLoading, error, refetch } = useActors();
  const actors = data?.actors || [];
  const total = data?.total || 0;

  // Debounce search input for performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Initialize Fuse.js for fuzzy search
  const fuse = useMemo(() => {
    return new Fuse(actors, {
      keys: ['name', 'name_normalized'],
      threshold: 0.3,
      ignoreLocation: true,
      includeScore: true,
    });
  }, [actors]);

  // Filter actors based on debounced search term
  const filteredActors = useMemo(() => {
    if (!debouncedSearchTerm.trim()) {
      return actors;
    }
    return fuse.search(debouncedSearchTerm).map((result) => result.item);
  }, [debouncedSearchTerm, actors, fuse]);

  const handleActorClick = (actor: Actor) => {
    setSelectedActor(actor);
  };

  const handleCloseDetail = () => {
    setSelectedActor(null);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="content-spacing">
        <div className="flex items-center justify-center py-32 text-neutral-400">
          <div className="text-center">
            <div className="text-xl mb-2">Loading actors...</div>
            <div className="text-sm">Please wait</div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="content-spacing">
        <div className="flex flex-col items-center justify-center py-32 text-neutral-400">
          <p className="text-xl mb-4 text-red-400">Failed to load actors</p>
          <p className="text-sm mb-6">{error.message}</p>
          <button onClick={() => refetch()} className="btn btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (actors.length === 0) {
    return (
      <div className="content-spacing">
        <div className="flex flex-col items-center justify-center py-32 text-neutral-400">
          <FontAwesomeIcon icon={faUserGroup} className="text-6xl mb-4 text-neutral-600" />
          <p className="text-xl mb-4">No actors found in database</p>
          <p className="text-sm mb-6">Actors will appear here after scanning your library</p>
        </div>
      </div>
    );
  }

  // No search results
  if (filteredActors.length === 0) {
    return (
      <div className="content-spacing">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <FontAwesomeIcon icon={faUserGroup} className="text-purple-400 text-2xl" />
            <h1 className="text-2xl font-bold text-white">Actors</h1>
            <span className="text-neutral-400 text-sm">
              ({total} actor{total !== 1 ? 's' : ''})
            </span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FontAwesomeIcon icon={faSearch} className="text-neutral-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search actors by name..."
              className="input w-full pl-10"
            />
          </div>
        </div>

        {/* No Results Message */}
        <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
          <p className="text-lg">No actors matching "{searchTerm}"</p>
          <p className="text-sm mt-2">Try adjusting your search terms</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-spacing">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <FontAwesomeIcon icon={faUserGroup} className="text-purple-400 text-2xl" />
          <h1 className="text-2xl font-bold text-white">Actors</h1>
          <span className="text-neutral-400 text-sm">
            ({filteredActors.length} of {total} actor{total !== 1 ? 's' : ''})
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <FontAwesomeIcon icon={faSearch} className="text-neutral-400" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search actors by name..."
            className="input w-full pl-10"
          />
        </div>
      </div>

      {/* Actors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredActors.map((actor) => (
          <div
            key={actor.id}
            onClick={() => handleActorClick(actor)}
            className="bg-neutral-800 rounded-lg p-4 hover:bg-neutral-700 cursor-pointer transition-colors border border-neutral-700"
          >
            <div className="flex items-start space-x-3">
              {/* Actor Image Placeholder */}
              <div className="flex-shrink-0 w-16 h-16 rounded-full bg-neutral-700 flex items-center justify-center">
                {getImageUrl(actor.image_hash) ? (
                  <img
                    src={getImageUrl(actor.image_hash)!}
                    alt={actor.name}
                    className="w-full h-full rounded-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <FontAwesomeIcon icon={faUserGroup} className="text-neutral-500 text-2xl" />
                )}
              </div>

              {/* Actor Info */}
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-semibold truncate">{actor.name}</h3>
                <div className="flex items-center space-x-2 mt-1 text-sm text-neutral-400">
                  <FontAwesomeIcon icon={faFilm} className="text-xs" />
                  <span>{actor.movie_count} movie{actor.movie_count !== 1 ? 's' : ''}</span>
                </div>
                {actor.tmdb_id && (
                  <div className="mt-1 text-xs text-purple-400">
                    TMDB: {actor.tmdb_id}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actor Detail Modal */}
      {selectedActor && (
        <ActorDetailModal actor={selectedActor} onClose={handleCloseDetail} />
      )}
    </div>
  );
};

// Actor Edit Modal - editable actor information
const ActorDetailModal: React.FC<{ actor: Actor; onClose: () => void }> = ({ actor: initialActor, onClose }) => {
  const [movies, setMovies] = useState<any[]>([]);
  const [loadingMovies, setLoadingMovies] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actor, setActor] = useState(initialActor);

  // Form state for editable fields
  const [editedName, setEditedName] = useState(actor.name);
  const [editedTmdbId, setEditedTmdbId] = useState(actor.tmdb_id?.toString() || '');
  const [editedImdbId, setEditedImdbId] = useState(actor.imdb_id || '');

  // Fetch movies when modal opens
  useEffect(() => {
    const fetchMovies = async () => {
      try {
        const response = await fetch(`/api/actors/${actor.id}/movies`);
        if (!response.ok) throw new Error('Failed to fetch movies');
        const data = await response.json();
        setMovies(data);
      } catch (error) {
        console.error('Failed to fetch actor movies:', error);
      } finally {
        setLoadingMovies(false);
      }
    };

    fetchMovies();
  }, [actor.id]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updates: any = {};

      // Only include changed fields
      if (editedName !== actor.name) {
        updates.name = editedName;
      }

      const tmdbIdNumber = editedTmdbId ? parseInt(editedTmdbId, 10) : undefined;
      if (tmdbIdNumber !== actor.tmdb_id) {
        updates.tmdb_id = tmdbIdNumber || null;
      }

      if (editedImdbId !== actor.imdb_id) {
        updates.imdb_id = editedImdbId || null;
      }

      // Make API call to update actor
      const response = await fetch(`/api/actors/${actor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to update actor');
      }

      const updatedActor = await response.json();
      setActor(updatedActor);
      setIsEditing(false);

      // TODO: Invalidate actor cache to refresh list
    } catch (error) {
      console.error('Failed to save actor:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset form to current values
    setEditedName(actor.name);
    setEditedTmdbId(actor.tmdb_id?.toString() || '');
    setEditedImdbId(actor.imdb_id || '');
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-800 rounded-lg border border-neutral-700 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-neutral-800 border-b border-neutral-700 p-6 z-10">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              {/* Actor Image */}
              <div className="flex-shrink-0 w-20 h-20 rounded-full bg-neutral-700 flex items-center justify-center">
                {getImageUrl(actor.image_hash) ? (
                  <img
                    src={getImageUrl(actor.image_hash)!}
                    alt={actor.name}
                    className="w-full h-full rounded-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <FontAwesomeIcon icon={faUserGroup} className="text-neutral-500 text-3xl" />
                )}
              </div>

              <div>
                <h2 className="text-2xl font-bold text-white">{actor.name}</h2>
                <div className="flex items-center space-x-3 mt-1 text-sm text-neutral-400">
                  <span>
                    <FontAwesomeIcon icon={faFilm} className="mr-1" />
                    {actor.movie_count} movie{actor.movie_count !== 1 ? 's' : ''}
                  </span>
                  {actor.tmdb_id && (
                    <a
                      href={`https://www.themoviedb.org/person/${actor.tmdb_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-purple-300"
                      onClick={(e) => e.stopPropagation()}
                    >
                      TMDB: {actor.tmdb_id}
                    </a>
                  )}
                  {actor.imdb_id && (
                    <a
                      href={`https://www.imdb.com/name/${actor.imdb_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-purple-300"
                      onClick={(e) => e.stopPropagation()}
                    >
                      IMDb: {actor.imdb_id}
                    </a>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white transition-colors text-xl"
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Edit Mode Toggle */}
          <div className="flex items-center justify-between mb-4">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="btn btn-secondary flex items-center space-x-2"
              >
                <FontAwesomeIcon icon={faEdit} />
                <span>Edit Actor</span>
              </button>
            ) : (
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="btn btn-primary flex items-center space-x-2"
                >
                  <FontAwesomeIcon icon={faSave} />
                  <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Editable Fields */}
          <div className="space-y-4 bg-neutral-900/50 rounded-lg p-4">
            {/* Name Field */}
            <div>
              <label className="text-xs text-neutral-400 uppercase tracking-wider flex items-center space-x-2">
                <span>Name</span>
                {actor.name_locked && (
                  <span className="text-yellow-500" title="Locked - User Edited">
                    <FontAwesomeIcon icon={faLock} className="text-xs" /> User Edited
                  </span>
                )}
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="input w-full mt-1"
                  placeholder="Actor name"
                />
              ) : (
                <p className="text-white mt-1">{actor.name}</p>
              )}
            </div>

            {/* TMDB ID Field */}
            <div>
              <label className="text-xs text-neutral-400 uppercase tracking-wider">TMDB ID</label>
              {isEditing ? (
                <input
                  type="number"
                  value={editedTmdbId}
                  onChange={(e) => setEditedTmdbId(e.target.value)}
                  className="input w-full mt-1"
                  placeholder="TMDB person ID"
                />
              ) : actor.tmdb_id ? (
                <a
                  href={`https://www.themoviedb.org/person/${actor.tmdb_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300 mt-1 block"
                >
                  {actor.tmdb_id}
                </a>
              ) : (
                <p className="text-neutral-500 mt-1">Not set</p>
              )}
            </div>

            {/* IMDb ID Field */}
            <div>
              <label className="text-xs text-neutral-400 uppercase tracking-wider">IMDb ID</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedImdbId}
                  onChange={(e) => setEditedImdbId(e.target.value)}
                  className="input w-full mt-1"
                  placeholder="nm0000001"
                />
              ) : actor.imdb_id ? (
                <a
                  href={`https://www.imdb.com/name/${actor.imdb_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300 mt-1 block"
                >
                  {actor.imdb_id}
                </a>
              ) : (
                <p className="text-neutral-500 mt-1">Not set</p>
              )}
            </div>

            {/* Read-only fields */}
            <div className="pt-4 border-t border-neutral-700 space-y-3">
              <div>
                <label className="text-xs text-neutral-400 uppercase tracking-wider">Normalized Name</label>
                <p className="text-white font-mono mt-1">{actor.name_normalized}</p>
              </div>
              <div>
                <label className="text-xs text-neutral-400 uppercase tracking-wider">Enrichment Status</label>
                <p className="text-white mt-1">
                  <span className={actor.identification_status === 'enriched' ? 'text-green-400' : 'text-yellow-400'}>
                    {actor.identification_status}
                  </span>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-neutral-400 uppercase tracking-wider">Created</label>
                  <p className="text-white mt-1 text-sm">{new Date(actor.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-xs text-neutral-400 uppercase tracking-wider">Last Updated</label>
                  <p className="text-white mt-1 text-sm">{new Date(actor.updated_at).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Movies List */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Movies</h3>
            {loadingMovies ? (
              <div className="text-neutral-400 text-sm">Loading movies...</div>
            ) : movies.length === 0 ? (
              <div className="text-neutral-400 text-sm">No movies found</div>
            ) : (
              <div className="space-y-2">
                {movies.map((movie: any) => (
                  <div
                    key={movie.id}
                    className="bg-neutral-900/50 rounded-lg p-3 hover:bg-neutral-900 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-white font-medium">
                          {movie.title} {movie.year && <span className="text-neutral-400">({movie.year})</span>}
                        </h4>
                        {movie.role && (
                          <p className="text-sm text-neutral-400 mt-1">as {movie.role}</p>
                        )}
                      </div>
                      {movie.actor_order && (
                        <span className="text-xs text-neutral-500">#{movie.actor_order}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
