/**
 * Sort Title Tests
 */

import { generateSortTitle } from '../../src/utils/sortTitle.js';

describe('generateSortTitle', () => {
  it('should move "The" article to end with comma', () => {
    expect(generateSortTitle('The Matrix')).toBe('Matrix, The');
    expect(generateSortTitle('The Shawshank Redemption')).toBe('Shawshank Redemption, The');
    expect(generateSortTitle('The Lord of the Rings')).toBe('Lord of the Rings, The');
  });

  it('should move "A" article to end with comma', () => {
    expect(generateSortTitle('A Clockwork Orange')).toBe('Clockwork Orange, A');
    expect(generateSortTitle('A Beautiful Mind')).toBe('Beautiful Mind, A');
  });

  it('should move "An" article to end with comma', () => {
    expect(generateSortTitle('An American Werewolf in London')).toBe('American Werewolf in London, An');
    expect(generateSortTitle('An Inconvenient Truth')).toBe('Inconvenient Truth, An');
  });

  it('should be case-insensitive for article matching', () => {
    expect(generateSortTitle('the matrix')).toBe('matrix, the');
    expect(generateSortTitle('THE MATRIX')).toBe('MATRIX, THE');
    expect(generateSortTitle('a beautiful mind')).toBe('beautiful mind, a');
    expect(generateSortTitle('an inconvenient truth')).toBe('inconvenient truth, an');
  });

  it('should preserve article capitalization in output', () => {
    expect(generateSortTitle('The Matrix')).toBe('Matrix, The');
    expect(generateSortTitle('the Matrix')).toBe('Matrix, the');
    expect(generateSortTitle('A Beautiful Mind')).toBe('Beautiful Mind, A');
  });

  it('should not modify titles without leading articles', () => {
    expect(generateSortTitle('Matrix')).toBe('Matrix');
    expect(generateSortTitle('Inception')).toBe('Inception');
    expect(generateSortTitle('Pulp Fiction')).toBe('Pulp Fiction');
    expect(generateSortTitle('Fight Club')).toBe('Fight Club');
  });

  it('should not treat article-like words mid-title as articles', () => {
    expect(generateSortTitle('Beauty and the Beast')).toBe('Beauty and the Beast');
    expect(generateSortTitle('Fast & Furious: The Tokyo Drift')).toBe('Fast & Furious: The Tokyo Drift');
    expect(generateSortTitle('To Kill a Mockingbird')).toBe('To Kill a Mockingbird');
  });

  it('should handle titles that are only the article', () => {
    expect(generateSortTitle('The')).toBe('The');
    expect(generateSortTitle('A')).toBe('A');
    expect(generateSortTitle('An')).toBe('An');
  });

  it('should handle empty or whitespace-only titles', () => {
    expect(generateSortTitle('')).toBe('');
    expect(generateSortTitle('   ')).toBe('   ');
  });

  it('should handle null and undefined', () => {
    expect(generateSortTitle(null as any)).toBe(null);
    expect(generateSortTitle(undefined as any)).toBe(undefined);
  });

  it('should trim whitespace', () => {
    expect(generateSortTitle('  The Matrix  ')).toBe('Matrix, The');
    expect(generateSortTitle('  Matrix  ')).toBe('Matrix');
  });

  it('should handle titles with multiple spaces', () => {
    expect(generateSortTitle('The    Matrix')).toBe('Matrix, The');
  });

  it('should handle unicode and special characters', () => {
    expect(generateSortTitle('The Amélie')).toBe('Amélie, The');
    expect(generateSortTitle('The 日本映画')).toBe('日本映画, The');
    expect(generateSortTitle('The Matrix™')).toBe('Matrix™, The');
  });

  it('should handle titles with numbers', () => {
    expect(generateSortTitle('The 40-Year-Old Virgin')).toBe('40-Year-Old Virgin, The');
    expect(generateSortTitle('A 2001: A Space Odyssey')).toBe('2001: A Space Odyssey, A');
  });
});
