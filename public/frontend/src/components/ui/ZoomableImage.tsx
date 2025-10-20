/**
 * ZoomableImage Component
 *
 * A reusable image component with smooth 2x zoom-on-hover effect.
 *
 * Features:
 * - 2x scale zoom animation on hover
 * - Smooth clip-path transition for rounded corners
 * - Purple border on zoom (1px, 8px radius)
 * - Z-index management to prevent overlap issues
 * - Supports any aspect ratio via Tailwind classes
 * - Optional badge overlay (e.g., provider source)
 *
 * Usage:
 * ```tsx
 * <ZoomableImage
 *   src="/path/to/image.jpg"
 *   alt="Description"
 *   aspectRatio="aspect-[2/3]"
 *   badge="TMDB"
 * />
 * ```
 *
 * Implementation Notes:
 * - Uses clip-path for corner rounding (smoothly transitions to none on hover)
 * - Z-index timing: immediately raises on hover, delays drop on exit (300ms)
 * - Border: transparent by default, violet on hover (smooth transition)
 * - Background: neutral-800 (important for transparent images like logos)
 *
 * Known Limitations:
 * - May cause temporary horizontal scrollbar on viewport edges (acceptable trade-off)
 * - Z-index conflicts possible when rapidly moving between images (minor visual glitch)
 */

import React from 'react';
import { Card, CardContent } from './card';

interface ZoomableImageProps {
  src: string;
  alt: string;
  aspectRatio?: string; // Tailwind aspect ratio class (e.g., 'aspect-[2/3]', 'aspect-[16/9]')
  badge?: string; // Optional badge text (bottom-left overlay)
  badgeAriaLabel?: string; // Accessibility label for badge
  className?: string; // Additional classes for the card wrapper
}

export const ZoomableImage: React.FC<ZoomableImageProps> = ({
  src,
  alt,
  aspectRatio = 'aspect-[2/3]',
  badge,
  badgeAriaLabel,
  className = '',
}) => {
  return (
    <Card className={`relative border-2 border-neutral-700 bg-neutral-800 hover:border-primary-500 transition-colors group ${className}`}>
      <CardContent className="p-0">
        <div className={`${aspectRatio} relative`}>
          {/* Image with zoom effect */}
          <div className="absolute inset-0 overflow-visible z-0 group-hover:z-50 [transition:z-index_0s_300ms] group-hover:[transition:z-index_0s_0s]">
            <img
              src={src}
              alt={alt}
              style={{ clipPath: 'inset(0 0 0 0 round 8px)' }}
              className="w-full h-full object-cover transition-all duration-300 ease-in-out group-hover:scale-[2] group-hover:[clip-path:none] border border-transparent group-hover:border-primary-500 group-hover:rounded-lg bg-neutral-800"
              loading="lazy"
              draggable="false"
            />
          </div>

          {/* Optional badge overlay */}
          {badge && (
            <div
              className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded text-xs text-gray-300 z-10 group-hover:z-0 pointer-events-none"
              aria-label={badgeAriaLabel || badge}
            >
              {badge}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
