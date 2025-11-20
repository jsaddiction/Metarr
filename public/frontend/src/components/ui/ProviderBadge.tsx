import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons';

interface ProviderBadgeProps {
  provider: 'tmdb' | 'imdb' | 'tvdb' | 'facebook' | 'instagram' | 'twitter' | 'wikidata' | 'homepage';
  id: string | number | null;
  label?: string;
  showId?: boolean;
}

const PROVIDER_CONFIG = {
  tmdb: {
    name: 'TMDB',
    url: (id: string | number) => `https://www.themoviedb.org/movie/${id}`,
    color: 'bg-blue-600/20 text-neutral-300 border-blue-600/30 hover:bg-blue-600/30',
  },
  imdb: {
    name: 'IMDb',
    url: (id: string | number) => `https://www.imdb.com/title/${id}`,
    color: 'bg-yellow-600/20 text-neutral-300 border-yellow-600/30 hover:bg-yellow-600/30',
  },
  tvdb: {
    name: 'TVDB',
    url: (id: string | number) => `https://thetvdb.com/dereferrer/movie/${id}`,
    color: 'bg-green-600/20 text-neutral-300 border-green-600/30 hover:bg-green-600/30',
  },
  facebook: {
    name: 'Facebook',
    url: (id: string | number) => `https://www.facebook.com/${id}`,
    color: 'bg-blue-500/20 text-neutral-300 border-blue-500/30 hover:bg-blue-500/30',
  },
  instagram: {
    name: 'Instagram',
    url: (id: string | number) => `https://www.instagram.com/${id}`,
    color: 'bg-pink-600/20 text-neutral-300 border-pink-600/30 hover:bg-pink-600/30',
  },
  twitter: {
    name: 'Twitter',
    url: (id: string | number) => `https://twitter.com/${id}`,
    color: 'bg-sky-600/20 text-neutral-300 border-sky-600/30 hover:bg-sky-600/30',
  },
  wikidata: {
    name: 'Wikidata',
    url: (id: string | number) => `https://www.wikidata.org/wiki/${id}`,
    color: 'bg-neutral-600/20 text-neutral-300 border-neutral-600/30 hover:bg-neutral-600/30',
  },
  homepage: {
    name: 'Homepage',
    url: (id: string | number) => id.toString(),
    color: 'bg-purple-600/20 text-neutral-300 border-purple-600/30 hover:bg-purple-600/30',
  },
};

/**
 * Clickable badge that opens provider page in new tab
 */
export const ProviderBadge: React.FC<ProviderBadgeProps> = ({ provider, id, label, showId = false }) => {
  // Return null if no ID provided
  if (!id) {
    return null;
  }

  const config = PROVIDER_CONFIG[provider];
  const displayLabel = label || config.name;
  const url = config.url(id);

  // Determine what to show as subtext
  // For homepage, always show the URL; for others, show ID if showId is true
  const subtext = provider === 'homepage' ? id : (showId ? id : null);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1
        rounded-md border text-xs font-semibold
        transition-colors
        ${config.color}
      `}
      title={`View on ${config.name}`}
    >
      <div className="flex flex-col items-start gap-0.5">
        <div className="flex items-center gap-1.5">
          <span>{displayLabel}</span>
          <FontAwesomeIcon icon={faExternalLinkAlt} className="text-[10px]" />
        </div>
        {subtext && <span className="text-[10px] opacity-60 font-normal">{subtext}</span>}
      </div>
    </a>
  );
};
