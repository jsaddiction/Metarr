import React from 'react';
import { MetadataCompleteness, calculateMetadataScore, getCompletenessColor, getCompletenessLabel } from '../../types/metadata';

interface MovieCardProps {
  title: string;
  year?: number;
  posterUrl?: string;
  quality?: string;
  metadata: MetadataCompleteness;
  studio?: string;
  director?: string;
}

export const MovieCard: React.FC<MovieCardProps> = ({
  title,
  year,
  posterUrl,
  quality,
  metadata,
  studio,
  director
}) => {
  const overallScore = calculateMetadataScore(metadata);
  const completenessColor = getCompletenessColor(overallScore);
  const completenessLabel = getCompletenessLabel(overallScore);

  return (
    <div className="bg-neutral-800 rounded-lg overflow-hidden border border-neutral-700 hover:border-primary-500 transition-colors duration-200 cursor-pointer group" role="button" tabIndex={0}>
      <div className="relative aspect-[2/3]">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={`${title} poster`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-neutral-600 flex items-center justify-center">
            <span className="text-4xl">🎬</span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <div className="flex space-x-2">
            <button className="btn btn-secondary p-2 text-sm" title="More Info" aria-label="More Info">
              ℹ️
            </button>
            <button className="btn btn-secondary p-2 text-sm" title="Edit" aria-label="Edit">
              ✏️
            </button>
            <button className="btn btn-secondary p-2 text-sm" title="Search" aria-label="Search">
              🔍
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-700">
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${overallScore}%`,
              backgroundColor: completenessColor,
            }}
          />
        </div>
      </div>

      <div className="p-3">
        <h3 className="font-medium text-white truncate" title={title}>
          {title}
        </h3>
        {year && (
          <span className="text-sm text-neutral-400">({year})</span>
        )}

        <div className="mt-2 space-y-1">
          {studio && (
            <div className="text-xs text-neutral-400 truncate" title={`Studio: ${studio}`}>
              🏢 {studio}
            </div>
          )}

          <div className="flex items-center space-x-1">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: completenessColor }}
              aria-hidden="true"
            />
            <span
              className="text-xs"
              style={{ color: completenessColor }}
              title={`Metadata Completeness: ${overallScore}%`}
            >
              {completenessLabel} ({overallScore}%)
            </span>
          </div>
        </div>

        {director && (
          <div className="mt-2">
            <span className="text-xs text-neutral-400">👨‍🎬 {director}</span>
          </div>
        )}
      </div>
    </div>
  );
};