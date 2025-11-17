/**
 * MusicBrainz API Response Types
 * Based on MusicBrainz API v2 documentation
 * @see https://musicbrainz.org/doc/MusicBrainz_API
 */

// ============================================
// Search Response Types (from API)
// ============================================

export interface MusicBrainzArtistSearchResult {
  id: string;
  name: string;
  score: number;
  type?: string;
  disambiguation?: string;
  'sort-name'?: string;
  country?: string;
}

export interface MusicBrainzArtistsSearchResponse {
  artists: MusicBrainzArtistSearchResult[];
  count: number;
  offset: number;
  created: string;
}

export interface MusicBrainzReleaseGroupSearchResult {
  id: string;
  title: string;
  score: number;
  'primary-type'?: string;
  'secondary-types'?: string[];
  disambiguation?: string;
  'first-release-date'?: string;
}

export interface MusicBrainzReleaseGroupsSearchResponse {
  'release-groups': MusicBrainzReleaseGroupSearchResult[];
  count: number;
  offset: number;
  created: string;
}

export interface MusicBrainzRecordingSearchResult {
  id: string;
  title: string;
  score: number;
  disambiguation?: string;
  length?: number;
}

export interface MusicBrainzRecordingsSearchResponse {
  recordings: MusicBrainzRecordingSearchResult[];
  count: number;
  offset: number;
  created: string;
}

// ============================================
// Detail Response Types (from API)
// ============================================

export interface MusicBrainzAlias {
  name: string;
  'sort-name'?: string;
  locale?: string;
  type?: string;
  primary?: boolean;
  'begin-date'?: string;
  'end-date'?: string;
}

export interface MusicBrainzGenre {
  id: string;
  name: string;
  count?: number;
}

export interface MusicBrainzLifeSpan {
  begin?: string;
  end?: string;
  ended?: boolean;
}

export interface MusicBrainzArtistDetail {
  id: string;
  name: string;
  'sort-name'?: string;
  disambiguation?: string;
  type?: string;
  country?: string;
  'life-span'?: MusicBrainzLifeSpan;
  aliases?: MusicBrainzAlias[];
  genres?: MusicBrainzGenre[];
}

export interface MusicBrainzArtistCredit {
  name?: string;
  joinphrase?: string;
  artist: {
    id: string;
    name: string;
    'sort-name'?: string;
    disambiguation?: string;
  };
}

export interface MusicBrainzReleaseGroupDetail {
  id: string;
  title: string;
  disambiguation?: string;
  'primary-type'?: string;
  'secondary-types'?: string[];
  'first-release-date'?: string;
  'artist-credit'?: MusicBrainzArtistCredit[];
}

export interface MusicBrainzRecordingDetail {
  id: string;
  title: string;
  length?: number;
  disambiguation?: string;
  'artist-credit'?: MusicBrainzArtistCredit[];
}
