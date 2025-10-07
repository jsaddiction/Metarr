export interface MetadataCompleteness {
  details: {
    score: number; // 0-100
    missing: string[];
    complete: string[];
  };
  baseImages: {
    score: number; // 0-100
    poster: boolean;
    backdrop: boolean;
  };
  extendedArtwork: {
    score: number; // 0-100
    fanarts: number;
    logos: number;
    banners: number;
    thumbs: number;
    clearart: number;
  };
  overall: number; // 0-100 overall completeness score
}

export interface Movie {
  id: number;
  title: string;
  year?: number;
  tmdbId?: number;
  imdbId?: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  filePath: string;
  quality?: string;
  releaseDate?: Date;
  runtime?: number;
  genres?: string[];
  rating?: number;
  voteCount?: number;
  studio?: string;
  director?: string;
  actors?: Actor[];
  metadata: MetadataCompleteness;
  createdAt: Date;
  updatedAt: Date;
}

export interface Series {
  id: number;
  title: string;
  year?: number;
  tmdbId?: number;
  tvdbId?: number;
  imdbId?: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  folderPath: string;
  firstAirDate?: Date;
  lastAirDate?: Date;
  episodeCount?: number;
  seasonCount?: number;
  network?: string;
  genres?: string[];
  rating?: number;
  voteCount?: number;
  actors?: Actor[];
  metadata: MetadataCompleteness;
  createdAt: Date;
  updatedAt: Date;
}

export interface Actor {
  id: number;
  name: string;
  tmdbId?: number;
  imdbId?: string;
  biography?: string;
  birthday?: Date;
  deathday?: Date;
  placeOfBirth?: string;
  profilePath?: string;
  knownForDepartment?: string;
  metadata: MetadataCompleteness;
  createdAt: Date;
  updatedAt: Date;
}

export interface Artist {
  id: number;
  name: string;
  mbId?: string; // MusicBrainz ID
  biography?: string;
  formed?: Date;
  disbanded?: Date;
  genres?: string[];
  profilePath?: string;
  country?: string;
  metadata: MetadataCompleteness;
  createdAt: Date;
  updatedAt: Date;
}

export interface Album {
  id: number;
  title: string;
  artistId: number;
  mbId?: string;
  releaseDate?: Date;
  trackCount?: number;
  genres?: string[];
  coverPath?: string;
  type: 'album' | 'single' | 'ep' | 'compilation';
  metadata: MetadataCompleteness;
  createdAt: Date;
  updatedAt: Date;
}

export const calculateMetadataScore = (metadata: MetadataCompleteness): number => {
  // Weight the different categories
  const detailsWeight = 0.4;
  const baseImagesWeight = 0.3;
  const extendedArtworkWeight = 0.3;

  return Math.round(
    metadata.details.score * detailsWeight +
    metadata.baseImages.score * baseImagesWeight +
    metadata.extendedArtwork.score * extendedArtworkWeight
  );
};

export const getCompletenessColor = (score: number): string => {
  if (score >= 90) return 'var(--success)';
  if (score >= 70) return 'var(--primary-purple)';
  if (score >= 50) return 'var(--warning)';
  return 'var(--error)';
};

export const getCompletenessLabel = (score: number): string => {
  if (score >= 90) return 'Complete';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Partial';
  return 'Minimal';
};