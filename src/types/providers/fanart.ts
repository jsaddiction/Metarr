/**
 * FanArt.tv API Response Types
 * Based on FanArt.tv API v3
 * @see https://fanart.tv/api-docs/
 */

// ============================================
// Common Types
// ============================================

export interface FanArtImage {
  id: string;
  url: string;
  lang: string; // ISO 639-1 code or "00" for no language
  likes: string; // Number as string
}

export interface FanArtImageWithDisc extends FanArtImage {
  disc: string; // Disc number for multi-disc releases
  disc_type: string; // "bluray" | "dvd" | "3d"
}

// ============================================
// Movie Images
// ============================================

export interface FanArtMovieImages {
  name: string;
  tmdb_id: string;
  imdb_id: string;
  hdmovielogo?: FanArtImage[]; // HD transparent logo
  moviedisc?: FanArtImageWithDisc[]; // Disc image
  movielogo?: FanArtImage[]; // Standard logo
  movieposter?: FanArtImage[]; // Poster
  hdmovieclearart?: FanArtImage[]; // HD clearart
  movieart?: FanArtImage[]; // Standard clearart
  moviebackground?: FanArtImage[]; // Fanart/background
  moviebanner?: FanArtImage[]; // Banner
  moviethumb?: FanArtImage[]; // Thumbnail/landscape
}

// ============================================
// TV Show Images
// ============================================

export interface FanArtTVImages {
  name: string;
  thetvdb_id: string;
  clearlogo?: FanArtImage[]; // Transparent logo
  hdtvlogo?: FanArtImage[]; // HD transparent logo
  clearart?: FanArtImage[]; // Clearart
  hdclearart?: FanArtImage[]; // HD clearart
  showbackground?: FanArtImage[]; // Fanart/background
  tvthumb?: FanArtImage[]; // Landscape thumbnail
  seasonposter?: FanArtSeasonImage[]; // Season posters
  seasonthumb?: FanArtSeasonImage[]; // Season thumbnails
  seasonbanner?: FanArtSeasonImage[]; // Season banners
  tvbanner?: FanArtImage[]; // Series banner
  tvposter?: FanArtImage[]; // Series poster
  characterart?: FanArtImage[]; // Character art
}

export interface FanArtSeasonImage extends FanArtImage {
  season: string; // Season number as string
}

// ============================================
// Music Images
// ============================================

export interface FanArtMusicArtistImages {
  name: string;
  mbid_id: string; // MusicBrainz ID
  artistbackground?: FanArtImage[];
  artistthumb?: FanArtImage[];
  musiclogo?: FanArtImage[];
  hdmusiclogo?: FanArtImage[];
  musicbanner?: FanArtImage[];
}

export interface FanArtMusicAlbumImages {
  albums: {
    [albumMbid: string]: {
      cdart?: FanArtImageWithDisc[];
      albumcover?: FanArtImage[];
    };
  };
}

// ============================================
// API Response Wrappers
// ============================================

export interface FanArtError {
  error: {
    code: number;
    message: string;
  };
}

// ============================================
// Client Options
// ============================================

export interface FanArtClientOptions {
  apiKey: string;
  personalApiKey?: string; // Optional personal key for higher rate limits
  baseUrl?: string;
}

// ============================================
// Image Type Enums
// ============================================

export enum FanArtMovieImageType {
  HD_MOVIE_LOGO = 'hdmovielogo',
  MOVIE_LOGO = 'movielogo',
  HD_MOVIE_CLEARART = 'hdmovieclearart',
  MOVIE_CLEARART = 'movieart',
  MOVIE_POSTER = 'movieposter',
  MOVIE_BACKGROUND = 'moviebackground',
  MOVIE_BANNER = 'moviebanner',
  MOVIE_THUMB = 'moviethumb',
  MOVIE_DISC = 'moviedisc',
}

export enum FanArtTVImageType {
  HD_TV_LOGO = 'hdtvlogo',
  CLEARLOGO = 'clearlogo',
  HD_CLEARART = 'hdclearart',
  CLEARART = 'clearart',
  SHOW_BACKGROUND = 'showbackground',
  TV_THUMB = 'tvthumb',
  SEASON_POSTER = 'seasonposter',
  SEASON_THUMB = 'seasonthumb',
  SEASON_BANNER = 'seasonbanner',
  TV_BANNER = 'tvbanner',
  TV_POSTER = 'tvposter',
  CHARACTER_ART = 'characterart',
}
