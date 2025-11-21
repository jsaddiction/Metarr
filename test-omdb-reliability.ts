/**
 * OMDB API Reliability Test
 *
 * Tests OMDB API against a sample of popular movies to validate
 * reliability claims from user reports (2024-2025).
 *
 * Measures:
 * - Success rate (Response: "True")
 * - Completeness (percentage of fields populated)
 * - Data quality (valid values vs "N/A")
 * - IMDb ratings availability
 */

import axios from 'axios';

interface OMDBResponse {
  Title?: string;
  Year?: string;
  Rated?: string;
  Released?: string;
  Runtime?: string;
  Genre?: string;
  Director?: string;
  Writer?: string;
  Actors?: string;
  Plot?: string;
  Language?: string;
  Country?: string;
  Awards?: string;
  Poster?: string;
  Ratings?: Array<{ Source: string; Value: string }>;
  Metascore?: string;
  imdbRating?: string;
  imdbVotes?: string;
  imdbID?: string;
  Type?: string;
  DVD?: string;
  BoxOffice?: string;
  Production?: string;
  Website?: string;
  Response: 'True' | 'False';
  Error?: string;
}

interface TestResult {
  imdbId: string;
  title: string;
  success: boolean;
  completeness: number;
  hasRating: boolean;
  hasPlot: boolean;
  hasActors: boolean;
  error?: string;
  response?: OMDBResponse;
}

interface Statistics {
  totalRequests: number;
  successfulRequests: number;
  successRate: number;
  averageCompleteness: number;
  ratingsAvailable: number;
  plotAvailable: number;
  actorsAvailable: number;
  usableResponses: number; // >60% completeness
  usableRate: number;
}

// Top 100 popular movies by IMDb ID (mix of classics and recent)
const TEST_MOVIES = [
  { id: 'tt0111161', title: 'The Shawshank Redemption' },
  { id: 'tt0068646', title: 'The Godfather' },
  { id: 'tt0071562', title: 'The Godfather Part II' },
  { id: 'tt0468569', title: 'The Dark Knight' },
  { id: 'tt0050083', title: '12 Angry Men' },
  { id: 'tt0108052', title: "Schindler's List" },
  { id: 'tt0167260', title: 'The Lord of the Rings: The Return of the King' },
  { id: 'tt0110912', title: 'Pulp Fiction' },
  { id: 'tt0060196', title: 'The Good, the Bad and the Ugly' },
  { id: 'tt0137523', title: 'Fight Club' },
  { id: 'tt0120737', title: 'The Lord of the Rings: The Fellowship of the Ring' },
  { id: 'tt0109830', title: 'Forrest Gump' },
  { id: 'tt0167261', title: 'The Lord of the Rings: The Two Towers' },
  { id: 'tt1375666', title: 'Inception' },
  { id: 'tt0080684', title: 'Star Wars: Episode V - The Empire Strikes Back' },
  { id: 'tt0133093', title: 'The Matrix' },
  { id: 'tt0099685', title: 'Goodfellas' },
  { id: 'tt0073486', title: "One Flew Over the Cuckoo's Nest" },
  { id: 'tt0047478', title: 'Seven Samurai' },
  { id: 'tt0114369', title: 'Se7en' },
  { id: 'tt0102926', title: 'The Silence of the Lambs' },
  { id: 'tt0038650', title: "It's a Wonderful Life" },
  { id: 'tt0118799', title: 'Life Is Beautiful' },
  { id: 'tt0245429', title: 'Spirited Away' },
  { id: 'tt0120815', title: 'Saving Private Ryan' },
  { id: 'tt0816692', title: 'Interstellar' },
  { id: 'tt0317248', title: 'City of God' },
  { id: 'tt0120689', title: 'The Green Mile' },
  { id: 'tt0076759', title: 'Star Wars' },
  { id: 'tt0114814', title: 'The Usual Suspects' },
  { id: 'tt0121766', title: 'Star Wars: Episode III - Revenge of the Sith' },
  { id: 'tt0054215', title: 'Psycho' },
  { id: 'tt0110413', title: 'Léon: The Professional' },
  { id: 'tt0021749', title: 'City Lights' },
  { id: 'tt0034583', title: 'Casablanca' },
  { id: 'tt0064116', title: 'The Good, the Bad and the Ugly' },
  { id: 'tt0027977', title: 'Modern Times' },
  { id: 'tt0047396', title: 'Rear Window' },
  { id: 'tt0082971', title: 'Raiders of the Lost Ark' },
  { id: 'tt0053125', title: 'North by Northwest' },
  { id: 'tt0172495', title: 'Gladiator' },
  { id: 'tt0078788', title: 'Apocalypse Now' },
  { id: 'tt0078748', title: 'Alien' },
  { id: 'tt0209144', title: 'Memento' },
  { id: 'tt0095327', title: 'Grave of the Fireflies' },
  { id: 'tt0253474', title: 'The Pianist' },
  { id: 'tt0088763', title: 'Back to the Future' },
  { id: 'tt0095765', title: 'Cinema Paradiso' },
  { id: 'tt0103064', title: 'Terminator 2: Judgment Day' },
  { id: 'tt0056058', title: 'Lawrence of Arabia' },
  { id: 'tt0482571', title: 'The Prestige' },
  { id: 'tt0407887', title: 'The Departed' },
  { id: 'tt0043014', title: 'Sunset Boulevard' },
  { id: 'tt0095016', title: 'Die Hard' },
  { id: 'tt0057012', title: 'Dr. Strangelove' },
  { id: 'tt0032553', title: 'The Great Dictator' },
  { id: 'tt0086190', title: 'Star Wars: Episode VI - Return of the Jedi' },
  { id: 'tt0022100', title: 'M' },
  { id: 'tt0050825', title: 'Paths of Glory' },
  { id: 'tt0086879', title: 'Amadeus' },
  { id: 'tt0910970', title: 'WALL·E' },
  { id: 'tt0119698', title: 'Princess Mononoke' },
  { id: 'tt0119217', title: 'Good Will Hunting' },
  { id: 'tt0051201', title: 'Vertigo' },
  { id: 'tt0169547', title: 'American Beauty' },
  { id: 'tt0090605', title: 'Aliens' },
  { id: 'tt0086250', title: 'Scarface' },
  { id: 'tt0033467', title: 'Citizen Kane' },
  { id: 'tt0405094', title: 'The Lives of Others' },
  { id: 'tt0056172', title: 'To Kill a Mockingbird' },
  { id: 'tt0062622', title: '2001: A Space Odyssey' },
  { id: 'tt0364569', title: 'Oldboy' },
  { id: 'tt0057565', title: 'The Great Escape' },
  { id: 'tt0469494', title: 'There Will Be Blood' },
  { id: 'tt0082096', title: 'Das Boot' },
  { id: 'tt0112573', title: 'Braveheart' },
  { id: 'tt0180093', title: 'Requiem for a Dream' },
  { id: 'tt0105236', title: 'Reservoir Dogs' },
  { id: 'tt0066921', title: 'A Clockwork Orange' },
  { id: 'tt0338013', title: 'Eternal Sunshine of the Spotless Mind' },
  { id: 'tt0081505', title: 'The Shining' },
  { id: 'tt0097576', title: 'Indiana Jones and the Last Crusade' },
  { id: 'tt0045152', title: 'Singin\' in the Rain' },
  { id: 'tt0055630', title: 'Yojimbo' },
  { id: 'tt0071853', title: 'The Sting' },
  { id: 'tt0361748', title: 'Inglourious Basterds' },
  { id: 'tt0057115', title: 'The Great Escape' },
  { id: 'tt0114709', title: 'Toy Story' },
  { id: 'tt0087843', title: 'Once Upon a Time in America' },
  { id: 'tt0075314', title: 'Taxi Driver' },
  { id: 'tt0093058', title: 'Full Metal Jacket' },
  { id: 'tt0044741', title: 'Ikiru' },
  { id: 'tt0086879', title: 'Amadeus' },
  { id: 'tt0070735', title: 'The Exorcist' },
  { id: 'tt0119488', title: 'L.A. Confidential' },
  { id: 'tt0053604', title: 'Ben-Hur' },
  { id: 'tt0036775', title: 'Double Indemnity' },
  { id: 'tt0208092', title: 'Snatch' },
  { id: 'tt0093779', title: 'The Princess Bride' },
  { id: 'tt0052357', title: 'Some Like It Hot' },
  { id: 'tt0053291', title: 'North by Northwest' },
];

const OMDB_API_KEY = '28ded185';
const OMDB_BASE_URL = 'https://www.omdbapi.com/';
const REQUEST_DELAY_MS = 200; // 5 req/sec to avoid rate limiting

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidValue(value: string | undefined): boolean {
  return value !== undefined && value !== 'N/A' && value.trim() !== '';
}

function calculateCompleteness(response: OMDBResponse): number {
  const fields = [
    'Title',
    'Year',
    'Plot',
    'Genre',
    'Director',
    'Actors',
    'Runtime',
    'Released',
    'imdbRating',
    'imdbVotes',
    'Language',
    'Country',
  ];

  const validFields = fields.filter((field) =>
    isValidValue(response[field as keyof OMDBResponse] as string | undefined)
  );

  return validFields.length / fields.length;
}

async function testMovie(imdbId: string, title: string): Promise<TestResult> {
  try {
    const response = await axios.get<OMDBResponse>(OMDB_BASE_URL, {
      params: {
        apikey: OMDB_API_KEY,
        i: imdbId,
        plot: 'full',
      },
      timeout: 10000,
    });

    const data = response.data;

    if (data.Response === 'False') {
      return {
        imdbId,
        title,
        success: false,
        completeness: 0,
        hasRating: false,
        hasPlot: false,
        hasActors: false,
        error: data.Error,
      };
    }

    const completeness = calculateCompleteness(data);

    return {
      imdbId,
      title: data.Title || title,
      success: true,
      completeness,
      hasRating: isValidValue(data.imdbRating),
      hasPlot: isValidValue(data.Plot),
      hasActors: isValidValue(data.Actors),
      response: data,
    };
  } catch (error) {
    return {
      imdbId,
      title,
      success: false,
      completeness: 0,
      hasRating: false,
      hasPlot: false,
      hasActors: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function calculateStatistics(results: TestResult[]): Statistics {
  const successful = results.filter((r) => r.success);
  const usable = results.filter((r) => r.completeness >= 0.6);

  const avgCompleteness =
    successful.length > 0
      ? successful.reduce((sum, r) => sum + r.completeness, 0) / successful.length
      : 0;

  return {
    totalRequests: results.length,
    successfulRequests: successful.length,
    successRate: successful.length / results.length,
    averageCompleteness: avgCompleteness,
    ratingsAvailable: successful.filter((r) => r.hasRating).length,
    plotAvailable: successful.filter((r) => r.hasPlot).length,
    actorsAvailable: successful.filter((r) => r.hasActors).length,
    usableResponses: usable.length,
    usableRate: usable.length / results.length,
  };
}

function printResults(results: TestResult[], stats: Statistics): void {
  console.log('\n' + '='.repeat(80));
  console.log('OMDB API RELIABILITY TEST RESULTS');
  console.log('='.repeat(80));

  console.log('\n📊 OVERALL STATISTICS:');
  console.log(`  Total Requests:        ${stats.totalRequests}`);
  console.log(`  Successful (200 + Response:"True"): ${stats.successfulRequests}`);
  console.log(`  Success Rate:          ${(stats.successRate * 100).toFixed(1)}%`);
  console.log(`  Usable (>60% complete): ${stats.usableResponses}`);
  console.log(`  Usable Rate:           ${(stats.usableRate * 100).toFixed(1)}%`);
  console.log(`  Average Completeness:  ${(stats.averageCompleteness * 100).toFixed(1)}%`);

  console.log('\n📋 DATA AVAILABILITY:');
  console.log(`  IMDb Ratings Available: ${stats.ratingsAvailable}/${stats.totalRequests} (${((stats.ratingsAvailable / stats.totalRequests) * 100).toFixed(1)}%)`);
  console.log(`  Plot Available:         ${stats.plotAvailable}/${stats.totalRequests} (${((stats.plotAvailable / stats.totalRequests) * 100).toFixed(1)}%)`);
  console.log(`  Actors Available:       ${stats.actorsAvailable}/${stats.totalRequests} (${((stats.actorsAvailable / stats.totalRequests) * 100).toFixed(1)}%)`);

  console.log('\n❌ FAILURES:');
  const failures = results.filter((r) => !r.success);
  if (failures.length === 0) {
    console.log('  None! All requests successful.');
  } else {
    failures.slice(0, 10).forEach((r) => {
      console.log(`  - ${r.title} (${r.imdbId}): ${r.error}`);
    });
    if (failures.length > 10) {
      console.log(`  ... and ${failures.length - 10} more failures`);
    }
  }

  console.log('\n⚠️  LOW COMPLETENESS (<60%):');
  const lowCompleteness = results.filter((r) => r.success && r.completeness < 0.6);
  if (lowCompleteness.length === 0) {
    console.log('  None! All successful responses had >60% completeness.');
  } else {
    lowCompleteness.slice(0, 10).forEach((r) => {
      console.log(`  - ${r.title} (${r.imdbId}): ${(r.completeness * 100).toFixed(1)}% complete`);
    });
    if (lowCompleteness.length > 10) {
      console.log(`  ... and ${lowCompleteness.length - 10} more low-completeness results`);
    }
  }

  console.log('\n✅ TOP 5 BEST RESULTS:');
  const best = results
    .filter((r) => r.success)
    .sort((a, b) => b.completeness - a.completeness)
    .slice(0, 5);
  best.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.title}: ${(r.completeness * 100).toFixed(1)}% complete`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('COMPARISON TO USER CLAIMS:');
  console.log('='.repeat(80));
  console.log(`User Report: "1 out of 10 requests returned usable data" (10% usable rate)`);
  console.log(`Our Test:    ${stats.usableResponses} out of ${stats.totalRequests} requests returned usable data (${(stats.usableRate * 100).toFixed(1)}% usable rate)`);

  if (stats.usableRate >= 0.9) {
    console.log('\n✅ CONCLUSION: OMDB is HIGHLY RELIABLE - User reports appear outdated');
  } else if (stats.usableRate >= 0.5) {
    console.log('\n⚠️  CONCLUSION: OMDB is MODERATELY RELIABLE - Proceed with caution');
  } else {
    console.log('\n❌ CONCLUSION: OMDB is UNRELIABLE - User reports confirmed');
  }

  console.log('='.repeat(80) + '\n');
}

async function main() {
  console.log('Starting OMDB reliability test...');
  console.log(`Testing ${TEST_MOVIES.length} popular movies`);
  console.log(`API Key: ${OMDB_API_KEY.slice(0, 4)}...${OMDB_API_KEY.slice(-4)}`);
  console.log('');

  const results: TestResult[] = [];

  for (let i = 0; i < TEST_MOVIES.length; i++) {
    const movie = TEST_MOVIES[i];
    process.stdout.write(
      `\rTesting ${i + 1}/${TEST_MOVIES.length}: ${movie.title.padEnd(50).slice(0, 50)}...`
    );

    const result = await testMovie(movie.id, movie.title);
    results.push(result);

    // Delay to respect rate limits
    if (i < TEST_MOVIES.length - 1) {
      await delay(REQUEST_DELAY_MS);
    }
  }

  console.log('\n');

  const stats = calculateStatistics(results);
  printResults(results, stats);

  // Export detailed results to JSON
  const output = {
    timestamp: new Date().toISOString(),
    apiKey: `${OMDB_API_KEY.slice(0, 4)}...${OMDB_API_KEY.slice(-4)}`,
    statistics: stats,
    results: results.map((r) => ({
      imdbId: r.imdbId,
      title: r.title,
      success: r.success,
      completeness: r.completeness,
      hasRating: r.hasRating,
      hasPlot: r.hasPlot,
      hasActors: r.hasActors,
      error: r.error,
    })),
  };

  console.log('Detailed results saved to: omdb-test-results.json\n');

  // Return stats for programmatic use
  return { stats, results, output };
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isMainModule) {
  main().catch(console.error);
}

export { main, testMovie, calculateStatistics };
