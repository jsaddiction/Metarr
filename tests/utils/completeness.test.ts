/**
 * Tests for Metadata Completeness Calculation
 *
 * Tests the completeness percentage calculation for movies and series
 */

import { calculateCompleteness } from '../../src/utils/completeness.js';

describe('calculateCompleteness', () => {
  describe('Movie completeness', () => {
    it('should return 100% for complete movie data', () => {
      const completeMovie = {
        title: 'The Matrix',
        plot: 'A hacker discovers the truth about reality.',
        tagline: 'Welcome to the Real World',
        imdb_rating: 8.7,
        rotten_tomatoes_score: 88,
        metacritic_score: 73,
        release_date: '1999-03-31',
        runtime: 136,
        content_rating: 'R',
        genres: ['Action', 'Sci-Fi'],
        poster_url: 'https://image.tmdb.org/poster.jpg',
      };

      expect(calculateCompleteness(completeMovie, 'movie')).toBe(100);
    });

    it('should return 0% for empty movie data', () => {
      const emptyMovie = {};
      expect(calculateCompleteness(emptyMovie, 'movie')).toBe(0);
    });

    it('should calculate correct percentage for partial data', () => {
      // Only title and plot (2 out of 11 fields = 18.18%, rounds to 18)
      const partialMovie = {
        title: 'The Matrix',
        plot: 'A hacker discovers the truth about reality.',
      };

      expect(calculateCompleteness(partialMovie, 'movie')).toBe(18);
    });

    it('should handle 50% completeness correctly', () => {
      // 6 out of 11 fields = 54.54%, rounds to 55
      const halfMovie = {
        title: 'The Matrix',
        plot: 'A hacker discovers the truth about reality.',
        imdb_rating: 8.7,
        release_date: '1999-03-31',
        runtime: 136,
        content_rating: 'R',
      };

      expect(calculateCompleteness(halfMovie, 'movie')).toBe(55);
    });

    it('should ignore null values', () => {
      const movieWithNulls = {
        title: 'The Matrix',
        plot: null,
        tagline: null,
        imdb_rating: null,
        rotten_tomatoes_score: null,
        metacritic_score: null,
        release_date: null,
        runtime: null,
        content_rating: null,
        genres: null,
        poster_url: null,
      };

      // Only title is filled (1 out of 11 = 9.09%, rounds to 9)
      expect(calculateCompleteness(movieWithNulls, 'movie')).toBe(9);
    });

    it('should ignore empty strings', () => {
      const movieWithEmptyStrings = {
        title: 'The Matrix',
        plot: '',
        tagline: '',
        imdb_rating: 8.7,
        rotten_tomatoes_score: 88,
        metacritic_score: '',
        release_date: '',
        runtime: 136,
        content_rating: '',
        genres: [],
        poster_url: '',
      };

      // title, imdb_rating, rotten_tomatoes_score, runtime = 4 out of 11 = 36.36%, rounds to 36
      expect(calculateCompleteness(movieWithEmptyStrings, 'movie')).toBe(36);
    });

    it('should handle zero as a valid value', () => {
      const movieWithZeros = {
        title: 'The Matrix',
        plot: 'A hacker discovers the truth.',
        tagline: 'Welcome to the Real World',
        imdb_rating: 0, // Zero rating is valid
        rotten_tomatoes_score: 0, // Zero score is valid
        metacritic_score: 0, // Zero score is valid
        release_date: '1999-03-31',
        runtime: 0, // Zero runtime treated as valid (though unrealistic)
        content_rating: 'R',
        genres: ['Action'],
        poster_url: 'https://image.tmdb.org/poster.jpg',
      };

      // All fields filled = 100%
      expect(calculateCompleteness(movieWithZeros, 'movie')).toBe(100);
    });

    it('should reject empty arrays for genres', () => {
      const movieWithEmptyGenres = {
        title: 'The Matrix',
        plot: 'A hacker discovers the truth.',
        tagline: 'Welcome to the Real World',
        imdb_rating: 8.7,
        rotten_tomatoes_score: 88,
        metacritic_score: 73,
        release_date: '1999-03-31',
        runtime: 136,
        content_rating: 'R',
        genres: [], // Empty array should not count
        poster_url: 'https://image.tmdb.org/poster.jpg',
      };

      // 10 out of 11 fields = 90.90%, rounds to 91
      expect(calculateCompleteness(movieWithEmptyGenres, 'movie')).toBe(91);
    });

    it('should accept non-empty arrays for genres', () => {
      const movieWithGenres = {
        title: 'The Matrix',
        genres: ['Action', 'Sci-Fi'],
      };

      // 2 out of 11 fields = 18.18%, rounds to 18
      expect(calculateCompleteness(movieWithGenres, 'movie')).toBe(18);
    });
  });

  describe('Series completeness', () => {
    it('should return 100% for complete series data', () => {
      const completeSeries = {
        title: 'Breaking Bad',
        plot: 'A chemistry teacher turns to cooking meth.',
        tagline: 'Change the Equation',
        imdb_rating: 9.5,
        rotten_tomatoes_score: 96,
        metacritic_score: 99,
        premiered: '2008-01-20',
        status: 'Ended',
        content_rating: 'TV-MA',
        genres: ['Crime', 'Drama', 'Thriller'],
        poster_id: 123,
      };

      expect(calculateCompleteness(completeSeries, 'series')).toBe(100);
    });

    it('should return 0% for empty series data', () => {
      const emptySeries = {};
      expect(calculateCompleteness(emptySeries, 'series')).toBe(0);
    });

    it('should calculate correct percentage for partial series data', () => {
      // Only title and plot (2 out of 11 fields = 18.18%, rounds to 18)
      const partialSeries = {
        title: 'Breaking Bad',
        plot: 'A chemistry teacher turns to cooking meth.',
      };

      expect(calculateCompleteness(partialSeries, 'series')).toBe(18);
    });

    it('should handle null poster_id', () => {
      const seriesWithNullPoster = {
        title: 'Breaking Bad',
        plot: 'A chemistry teacher turns to cooking meth.',
        tagline: 'Change the Equation',
        imdb_rating: 9.5,
        rotten_tomatoes_score: 96,
        metacritic_score: 99,
        premiered: '2008-01-20',
        status: 'Ended',
        content_rating: 'TV-MA',
        genres: ['Crime', 'Drama'],
        poster_id: null,
      };

      // 10 out of 11 fields = 90.90%, rounds to 91
      expect(calculateCompleteness(seriesWithNullPoster, 'series')).toBe(91);
    });

    it('should accept zero as valid poster_id', () => {
      const seriesWithZeroPoster = {
        title: 'Breaking Bad',
        poster_id: 0, // Zero is a valid ID (though unlikely)
      };

      // 2 out of 11 fields = 18.18%, rounds to 18
      expect(calculateCompleteness(seriesWithZeroPoster, 'series')).toBe(18);
    });
  });

  describe('Rounding behavior', () => {
    it('should round 9.09% to 9', () => {
      const entity = { title: 'Test' };
      expect(calculateCompleteness(entity, 'movie')).toBe(9);
    });

    it('should round 18.18% to 18', () => {
      const entity = { title: 'Test', plot: 'Plot' };
      expect(calculateCompleteness(entity, 'movie')).toBe(18);
    });

    it('should round 27.27% to 27', () => {
      const entity = { title: 'Test', plot: 'Plot', tagline: 'Tag' };
      expect(calculateCompleteness(entity, 'movie')).toBe(27);
    });

    it('should round 45.45% to 45', () => {
      const entity = {
        title: 'Test',
        plot: 'Plot',
        tagline: 'Tag',
        imdb_rating: 8.0,
        release_date: '2020-01-01',
      };
      expect(calculateCompleteness(entity, 'movie')).toBe(45);
    });

    it('should round 54.54% to 55', () => {
      const entity = {
        title: 'Test',
        plot: 'Plot',
        tagline: 'Tag',
        imdb_rating: 8.0,
        release_date: '2020-01-01',
        runtime: 120,
      };
      expect(calculateCompleteness(entity, 'movie')).toBe(55);
    });

    it('should round 90.90% to 91', () => {
      const entity = {
        title: 'Test',
        plot: 'Plot',
        tagline: 'Tag',
        imdb_rating: 8.0,
        rotten_tomatoes_score: 85,
        metacritic_score: 75,
        release_date: '2020-01-01',
        runtime: 120,
        content_rating: 'R',
        genres: ['Action'],
      };
      expect(calculateCompleteness(entity, 'movie')).toBe(91);
    });
  });

  describe('Real-world scenarios', () => {
    it('should calculate completeness after TMDB enrichment', () => {
      const afterTMDB = {
        title: 'Inception',
        plot: 'A thief who steals corporate secrets through dream-sharing technology.',
        tagline: 'Your mind is the scene of the crime',
        imdb_rating: 8.8,
        release_date: '2010-07-16',
        runtime: 148,
        content_rating: 'PG-13',
        genres: ['Action', 'Sci-Fi', 'Thriller'],
        poster_url: 'https://image.tmdb.org/poster.jpg',
      };

      // 9 out of 11 fields = 81.81%, rounds to 82
      expect(calculateCompleteness(afterTMDB, 'movie')).toBe(82);
    });

    it('should show improvement after OMDB enrichment adds missing scores', () => {
      const beforeOMDB = {
        title: 'Inception',
        plot: 'A thief who steals corporate secrets through dream-sharing technology.',
        tagline: 'Your mind is the scene of the crime',
        imdb_rating: 8.8,
        release_date: '2010-07-16',
        runtime: 148,
        content_rating: 'PG-13',
        genres: ['Action', 'Sci-Fi', 'Thriller'],
        poster_url: 'https://image.tmdb.org/poster.jpg',
      };

      const afterOMDB = {
        ...beforeOMDB,
        rotten_tomatoes_score: 87,
        metacritic_score: 74,
      };

      expect(calculateCompleteness(beforeOMDB, 'movie')).toBe(82);
      expect(calculateCompleteness(afterOMDB, 'movie')).toBe(100);
    });

    it('should handle minimally enriched movie', () => {
      const minimalMovie = {
        title: 'Unknown Movie',
        release_date: '2020-01-01',
      };

      // 2 out of 11 = 18.18%, rounds to 18
      expect(calculateCompleteness(minimalMovie, 'movie')).toBe(18);
    });

    it('should handle series with ongoing status', () => {
      const ongoingSeries = {
        title: 'The Mandalorian',
        plot: 'The travels of a lone bounty hunter in the outer reaches of the galaxy.',
        status: 'Continuing',
        premiered: '2019-11-12',
        content_rating: 'TV-14',
        genres: ['Action', 'Adventure', 'Sci-Fi'],
        poster_id: 456,
      };

      // 7 out of 11 = 63.63%, rounds to 64
      expect(calculateCompleteness(ongoingSeries, 'series')).toBe(64);
    });
  });
});
