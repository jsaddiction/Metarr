import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { AnimatedTabs, AnimatedTabsContent } from '@/components/ui/AnimatedTabs';
import { MetadataTab } from '@/components/movie/MetadataTab';
import { ImagesTab } from '@/components/movie/ImagesTab';
import { ExtrasTab } from '@/components/movie/ExtrasTab';
import { CastTab } from '@/components/movie/CastTab';
import { useMovie } from '@/hooks/useMovies';

type TabType = 'metadata' | 'images' | 'cast' | 'extras';

export const MovieEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const movieId = id ? parseInt(id) : null;

  // Fetch movie data
  const { data: movie, isLoading: movieLoading, error: movieError } = useMovie(movieId);

  const [activeTab, setActiveTab] = useState<TabType>('metadata');

  const handleBack = () => {
    navigate('/media/movies');
  };

  // Show loading state
  if (movieLoading) {
    return (
      <div className="content-spacing">
        <div className="flex items-center mb-6">
          <button onClick={handleBack} className="btn btn-ghost" title="Back to Movies">
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          <h1 className="text-2xl font-bold text-white ml-4">Loading...</h1>
        </div>
        <div className="text-center py-8 text-neutral-400">
          Loading movie data...
        </div>
      </div>
    );
  }

  // Show error state
  if (movieError || !movie) {
    return (
      <div className="content-spacing">
        <div className="flex items-center mb-6">
          <button onClick={handleBack} className="btn btn-ghost" title="Back to Movies">
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          <h1 className="text-2xl font-bold text-white ml-4">Error</h1>
        </div>
        <div className="text-center py-8">
          <p className="text-error mb-2">Failed to load movie</p>
          <p className="text-sm text-neutral-400">{movieError?.message || 'Movie not found'}</p>
          <button onClick={handleBack} className="btn btn-primary mt-4">
            Back to Movies
          </button>
        </div>
      </div>
    );
  }

  // Check if movie is unidentified
  const isUnidentified = movie.identification_status === 'unidentified';

  return (
    <div className="content-spacing">
      {/* Header */}
      <div className="flex items-start mb-4">
        <button
          onClick={handleBack}
          className="btn btn-ghost mt-1"
          title="Back to Movies"
        >
          <FontAwesomeIcon icon={faArrowLeft} />
        </button>
        <div className="ml-4 flex-1">
          <h1 className="text-2xl font-bold text-white">
            {isUnidentified ? 'Identify Movie: ' : 'Edit Movie: '}
            {movie.title} {movie.year ? `(${movie.year})` : ''}
          </h1>
          {movie.file_path && (
            <div className="text-xs text-neutral-500 font-mono mt-1">
              {movie.file_path}
            </div>
          )}
        </div>
      </div>

      {/* Show only identification UI when unidentified */}
      {isUnidentified ? (
        id && <MetadataTab movieId={parseInt(id)} />
      ) : (
        /* Show full tab interface when identified */
        <AnimatedTabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TabType)}
          tabs={[
            { value: 'metadata', label: 'Metadata' },
            { value: 'images', label: 'Images' },
            { value: 'cast', label: 'Cast' },
            { value: 'extras', label: 'Extras' },
          ]}
        >
          <AnimatedTabsContent value="metadata">
            {id && <MetadataTab movieId={parseInt(id)} />}
          </AnimatedTabsContent>

          <AnimatedTabsContent value="images">
            {id && <ImagesTab movieId={parseInt(id)} movieTitle={movie?.title} />}
          </AnimatedTabsContent>

          <AnimatedTabsContent value="cast">
            {id && <CastTab movieId={parseInt(id)} />}
          </AnimatedTabsContent>

          <AnimatedTabsContent value="extras">
            {id && <ExtrasTab movieId={parseInt(id)} />}
          </AnimatedTabsContent>
        </AnimatedTabs>
      )}
    </div>
  );
};
