import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function for merging Tailwind CSS classes
 *
 * This function combines clsx and tailwind-merge to intelligently merge
 * className strings, handling Tailwind class conflicts properly.
 *
 * @example
 * cn('px-2 py-1', 'px-4') // Returns: 'py-1 px-4' (px-2 is overridden)
 * cn('text-red-500', condition && 'text-blue-500') // Conditional classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
