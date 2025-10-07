import React, { useState, useMemo } from 'react';
import { MovieCard } from '../components/ui/MovieCard';
import { ViewControls } from '../components/ui/ViewControls';
import { MetadataCompleteness } from '../types/metadata';

// Mock metadata completeness data
const createMockMetadata = (detailsScore: number, baseImagesScore: number, extendedScore: number): MetadataCompleteness => ({
  details: {
    score: detailsScore,
    missing: detailsScore < 100 ? ['studio', 'director'] : [],
    complete: ['title', 'year', 'overview', 'runtime'],
  },
  baseImages: {
    score: baseImagesScore,
    poster: baseImagesScore >= 50,
    backdrop: baseImagesScore >= 100,
  },
  extendedArtwork: {
    score: extendedScore,
    fanarts: Math.floor(extendedScore / 20),
    logos: extendedScore >= 80 ? 2 : extendedScore >= 40 ? 1 : 0,
    banners: extendedScore >= 60 ? 1 : 0,
    thumbs: extendedScore >= 100 ? 3 : 0,
    clearart: extendedScore >= 100 ? 1 : 0,
  },
  overall: Math.round((detailsScore * 0.4) + (baseImagesScore * 0.3) + (extendedScore * 0.3)),
});

// Mock data for demonstration
const mockMovies = [
  {
    id: 1,
    title: 'The Matrix',
    year: 1999,
    posterUrl: 'https://via.placeholder.com/300x450/8B5FBF/FFFFFF?text=The+Matrix',
    studio: 'Warner Bros',
    director: 'The Wachowskis',
    metadata: createMockMetadata(95, 100, 85),
  },
  {
    id: 2,
    title: 'Inception',
    year: 2010,
    posterUrl: 'https://via.placeholder.com/300x450/6A4C93/FFFFFF?text=Inception',
    studio: 'Warner Bros',
    director: 'Christopher Nolan',
    metadata: createMockMetadata(90, 80, 60),
  },
  {
    id: 3,
    title: 'Interstellar',
    year: 2014,
    posterUrl: 'https://via.placeholder.com/300x450/B794C6/FFFFFF?text=Interstellar',
    studio: 'Paramount',
    director: 'Christopher Nolan',
    metadata: createMockMetadata(85, 50, 30),
  },
  {
    id: 4,
    title: 'Blade Runner 2049',
    year: 2017,
    posterUrl: 'https://via.placeholder.com/300x450/553C75/FFFFFF?text=Blade+Runner',
    studio: 'Sony Pictures',
    director: 'Denis Villeneuve',
    metadata: createMockMetadata(100, 100, 95),
  },
  {
    id: 5,
    title: 'Dune',
    year: 2021,
    studio: 'Legendary',
    director: 'Denis Villeneuve',
    metadata: createMockMetadata(60, 20, 10),
  },
  {
    id: 6,
    title: 'The Dark Knight',
    year: 2008,
    posterUrl: 'https://via.placeholder.com/300x450/8B5FBF/FFFFFF?text=Dark+Knight',
    studio: 'Warner Bros',
    director: 'Christopher Nolan',
    metadata: createMockMetadata(75, 90, 40),
  },
  {
    id: 7,
    title: 'Pulp Fiction',
    year: 1994,
    studio: 'Miramax',
    director: 'Quentin Tarantino',
    metadata: createMockMetadata(100, 100, 100),
  },
  {
    id: 8,
    title: 'Fight Club',
    year: 1999,
    posterUrl: 'https://via.placeholder.com/300x450/6A4C93/FFFFFF?text=Fight+Club',
    studio: '20th Century Fox',
    director: 'David Fincher',
    metadata: createMockMetadata(40, 30, 20),
  },
];

export const Dashboard: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter movies based on search term
  const filteredMovies = useMemo(() => {
    if (!searchTerm.trim()) return mockMovies;

    const term = searchTerm.toLowerCase();
    return mockMovies.filter(movie =>
      movie.title.toLowerCase().includes(term) ||
      movie.director?.toLowerCase().includes(term) ||
      movie.studio?.toLowerCase().includes(term) ||
      movie.year.toString().includes(term)
    );
  }, [searchTerm]);

  const completeMovies = filteredMovies.filter(m => m.metadata.overall >= 90).length;
  const partialMovies = filteredMovies.filter(m => m.metadata.overall >= 50 && m.metadata.overall < 90).length;
  const incompleteMovies = filteredMovies.filter(m => m.metadata.overall < 50).length;

  const headerActions = (
    <>
      <button className="btn btn-primary">
        Refresh Metadata
      </button>
      <button className="btn btn-secondary">
        Update Images
      </button>
    </>
  );

  const handleRefresh = () => {
    console.log('Refreshing movie metadata...');
  };

  return (
      <div className="content-container">
        <div className="content-header">
          <div>
            <h2 className="content-title">Movie Metadata Management</h2>
            <p className="content-subtitle">
              {filteredMovies.length} movies • {completeMovies} complete • {partialMovies} partial • {incompleteMovies} minimal
            </p>
          </div>
        </div>

        <ViewControls
          searchPlaceholder="Search movies, directors, studios..."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          onRefresh={handleRefresh}
        />

        <div className="movies-grid">
          {filteredMovies.map((movie) => (
            <MovieCard
              key={movie.id}
              title={movie.title}
              year={movie.year}
              posterUrl={movie.posterUrl}
              studio={movie.studio}
              director={movie.director}
              metadata={movie.metadata}
            />
          ))}
        </div>

        {filteredMovies.length === 0 && searchTerm && (
          <div className="no-results">
            <p>No movies found matching "{searchTerm}"</p>
          </div>
        )}
      </div>
  );
};