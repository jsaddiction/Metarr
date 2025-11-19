# Coding Standards

**Purpose**: TypeScript conventions, code organization patterns, naming standards, and best practices specific to the Metarr codebase. Ensures consistency and maintainability across all code contributions.

**Related Docs**:
- Parent: [WORKFLOW.md](./WORKFLOW.md) - Development workflow
- Related: [TESTING.md](./TESTING.md), [/CLAUDE.md](/CLAUDE.md)

## Quick Reference

- **Language**: TypeScript with strict mode enabled
- **Module system**: ES modules (ESM) with `.js` extensions in imports
- **Style**: Prettier for formatting, ESLint for linting
- **Naming**: PascalCase classes, camelCase functions/variables, SCREAMING_SNAKE_CASE constants
- **Architecture**: Services for business logic, controllers for HTTP handling
- **File extensions**: `.ts` for source, import with `.js` extension

---

## TypeScript Configuration

### Compiler Options

**Strict mode enabled** (`tsconfig.json`):
```json
{
  "strict": true,
  "noImplicitAny": true,
  "noImplicitReturns": true,
  "noImplicitThis": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "exactOptionalPropertyTypes": true
}
```

**What this means**:
- All types must be explicit
- No implicit `any`
- Functions must return consistently
- No unused variables/parameters
- Optional properties must be defined or `undefined`, not missing

### ES Modules

**Import/export syntax**:
```typescript
// Use .js extension in imports (even for .ts files)
import { MovieService } from './services/movieService.js';
import { logger } from '../middleware/logging.js';

// Named exports preferred over default exports
export class TMDBProvider { }
export function calculateScore() { }
```

**Why `.js` extension**: TypeScript compiles to JavaScript, runtime expects `.js` extensions.

---

## Naming Conventions

### Classes and Interfaces

**PascalCase**:
```typescript
// Classes
class MovieService { }
class TMDBProvider { }
class AssetScoringService { }

// Interfaces
interface MovieMetadata { }
interface ProviderConfig { }
interface AssetCandidate { }

// Type aliases
type MovieFilters = { ... };
type EnrichmentResult = { ... };
```

### Functions and Variables

**camelCase**:
```typescript
// Functions
function calculateAssetScore() { }
async function fetchMovieMetadata() { }
const handleEnrichment = async () => { };

// Variables
const movieService = new MovieService();
const assetCandidates = [];
let currentScore = 0;
```

### Constants

**SCREAMING_SNAKE_CASE**:
```typescript
const DEFAULT_TIMEOUT = 5000;
const MAX_RETRIES = 3;
const CACHE_PATH = '/data/cache';
const ASSET_TYPES = ['poster', 'fanart', 'banner'];
```

### Files and Directories

**camelCase for files**:
```
movieService.ts
assetScoring.ts
nfoGenerator.ts
```

**camelCase for directories**:
```
src/services/
src/controllers/
src/middleware/
```

**Exception**: Special files use PascalCase or specific conventions:
```
README.md
CLAUDE.md
TMDBProvider.ts (matches class name)
```

---

## Code Organization

### Project Structure

```
src/
├── controllers/        # HTTP request handlers
│   └── movie/         # Domain-specific controllers
├── services/          # Business logic
│   ├── providers/     # External provider integrations
│   ├── media/         # Media-specific services
│   └── files/         # File operations
├── types/             # TypeScript type definitions
├── routes/            # Express route definitions
├── database/          # Database connections and migrations
├── config/            # Configuration files
├── middleware/        # Express middleware
├── validation/        # Input validation schemas
├── errors/            # Custom error classes
└── utils/             # Helper functions
```

### Separation of Concerns

**Controllers** (handle HTTP):
```typescript
// controllers/movie/MovieCrudController.ts
export class MovieCrudController {
  constructor(private movieService: MovieService) {}

  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = this.parseFilters(req.query);
      const result = await this.movieService.getAll(filters);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}
```

**Services** (business logic):
```typescript
// services/movieService.ts
export class MovieService {
  async getAll(filters: MovieFilters): Promise<MovieListResult> {
    // Business logic here
    const movies = await this.movieQueryService.findAll(filters);
    return this.formatResponse(movies);
  }
}
```

**Models/Types** (data structures):
```typescript
// types/database.ts
export interface Movie {
  id: number;
  title: string;
  releaseDate?: string;
  plot?: string;
}
```

---

## TypeScript Patterns

### Type Safety

**Explicit types for function parameters and returns**:
```typescript
// Good
function calculateScore(asset: AssetCandidate): number {
  return asset.width * asset.height;
}

// Bad (implicit any)
function calculateScore(asset) {
  return asset.width * asset.height;
}
```

**Use interfaces for object shapes**:
```typescript
interface MovieMetadata {
  title: string;
  releaseDate?: string; // Optional
  plot: string | null;  // Nullable
}

function updateMetadata(movieId: number, metadata: MovieMetadata): void {
  // Implementation
}
```

### Null Safety

**Use optional chaining and nullish coalescing**:
```typescript
// Optional chaining
const runtime = movie?.metadata?.runtime;

// Nullish coalescing
const title = movie.title ?? 'Unknown Title';

// Combined
const year = movie?.releaseDate?.substring(0, 4) ?? 'Unknown';
```

**Explicit null checks**:
```typescript
if (movie === null || movie === undefined) {
  throw new NotFoundError('Movie not found');
}

// Or using type guard
if (!movie) {
  throw new NotFoundError('Movie not found');
}
```

### Async/Await

**Prefer async/await over promises**:
```typescript
// Good
async function enrichMovie(movieId: number): Promise<EnrichmentResult> {
  const movie = await movieService.getById(movieId);
  const metadata = await tmdbProvider.getMetadata(movie.tmdbId);
  return await movieService.updateMetadata(movieId, metadata);
}

// Bad (promise chains)
function enrichMovie(movieId: number): Promise<EnrichmentResult> {
  return movieService.getById(movieId)
    .then(movie => tmdbProvider.getMetadata(movie.tmdbId))
    .then(metadata => movieService.updateMetadata(movieId, metadata));
}
```

### Error Handling

**Use try-catch with async/await**:
```typescript
async function processMovie(movieId: number): Promise<void> {
  try {
    const movie = await movieService.getById(movieId);
    await enrichmentService.enrich(movie);
  } catch (error) {
    if (error instanceof NotFoundError) {
      logger.warn(`Movie ${movieId} not found`);
    } else {
      logger.error('Enrichment failed', { error, movieId });
      throw error;
    }
  }
}
```

### Type Guards

**Custom type guards for runtime validation**:
```typescript
interface TMDBMovie {
  id: number;
  title: string;
}

function isTMDBMovie(obj: unknown): obj is TMDBMovie {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'title' in obj
  );
}

// Usage
const data: unknown = await fetchData();
if (isTMDBMovie(data)) {
  console.log(data.title); // TypeScript knows data is TMDBMovie
}
```

---

## Class Patterns

### Service Classes

**Constructor dependency injection**:
```typescript
export class MovieService {
  constructor(
    private movieQueryService: MovieQueryService,
    private movieUpdateService: MovieUpdateService,
    private logger: Logger
  ) {}

  async getById(id: number): Promise<Movie | null> {
    this.logger.debug(`Fetching movie ${id}`);
    return await this.movieQueryService.findById(id);
  }
}
```

### Provider Classes

**Extend BaseProvider**:
```typescript
export class TMDBProvider extends BaseProvider {
  private tmdbClient: TMDBClient;

  constructor(config: ProviderConfig, options?: ProviderOptions) {
    super(config, options);
    this.tmdbClient = new TMDBClient(config);
  }

  defineCapabilities(): ProviderCapabilities {
    return {
      id: 'tmdb',
      name: 'The Movie Database',
      supportedEntityTypes: ['movie', 'collection'],
    };
  }
}
```

### Controller Classes

**Methods for route handlers**:
```typescript
export class MovieCrudController {
  constructor(private movieService: MovieService) {}

  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.movieService.getAll();
      res.json(result);
    } catch (error) {
      next(error); // Pass to error middleware
    }
  }
}
```

---

## Function Patterns

### Pure Functions

**Prefer pure functions for logic**:
```typescript
// Good: Pure function (no side effects)
function calculateScore(width: number, height: number): number {
  return width * height * 0.5;
}

// Avoid: Impure function (side effects)
let totalScore = 0;
function calculateScore(width: number, height: number): void {
  totalScore += width * height * 0.5; // Modifies external state
}
```

### Single Responsibility

**Each function does one thing**:
```typescript
// Good: Separate responsibilities
function fetchMovie(id: number): Promise<Movie> { }
function enrichMovie(movie: Movie): Promise<Movie> { }
function saveMovie(movie: Movie): Promise<void> { }

// Bad: Multiple responsibilities
function fetchEnrichAndSaveMovie(id: number): Promise<void> {
  // Too much in one function
}
```

### Parameter Objects

**Use object parameters for multiple arguments**:
```typescript
// Good: Object parameter
interface EnrichOptions {
  movieId: number;
  force?: boolean;
  providers?: string[];
  skipLocked?: boolean;
}

function enrichMovie(options: EnrichOptions): Promise<void> {
  // Implementation
}

// Bad: Many parameters
function enrichMovie(
  movieId: number,
  force?: boolean,
  providers?: string[],
  skipLocked?: boolean
): Promise<void> {
  // Hard to call with many optional params
}
```

---

## Error Handling Standards

### Custom Error Classes

**Extend ApplicationError base class**:
```typescript
// errors/ApplicationError.ts
export class ApplicationError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

// errors/NotFoundError.ts
export class NotFoundError extends ApplicationError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
  }
}

// errors/ValidationError.ts
export class ValidationError extends ApplicationError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}
```

### Throwing Errors

**Use specific error classes**:
```typescript
async function getMovie(id: number): Promise<Movie> {
  const movie = await db.get('SELECT * FROM movies WHERE id = ?', [id]);

  if (!movie) {
    throw new NotFoundError(`Movie with id ${id} not found`);
  }

  return movie;
}
```

### Error Middleware

**Let middleware handle errors**:
```typescript
// Controller
async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const movie = await this.movieService.getById(parseInt(req.params.id));
    res.json(movie);
  } catch (error) {
    next(error); // Pass to error middleware
  }
}

// Error middleware handles formatting and logging
```

---

## Logging Standards

### Logger Usage

**Use winston logger**:
```typescript
import { logger } from '../middleware/logging.js';

// Log levels
logger.error('Critical error', { error, context });
logger.warn('Warning message', { details });
logger.info('Informational message', { data });
logger.debug('Debug details', { verbose });
```

### Structured Logging

**Include context in logs**:
```typescript
// Good: Structured logging
logger.info('Movie enriched', {
  movieId: movie.id,
  providerId: 'tmdb',
  duration: elapsed,
});

// Bad: String concatenation
logger.info(`Movie ${movie.id} enriched from tmdb in ${elapsed}ms`);
```

---

## Code Style

### Formatting

**Prettier handles formatting** (configured):
- 2 space indentation
- Single quotes for strings
- No semicolons (ASI)
- Trailing commas in multiline

**Run before committing**:
```bash
npm run format
```

### Linting

**ESLint catches issues** (configured):
```bash
npm run lint
npm run lint:fix  # Auto-fix issues
```

### Comments

**Use JSDoc for public APIs**:
```typescript
/**
 * Calculate asset quality score based on dimensions and type.
 *
 * @param asset - The asset candidate to score
 * @param preferences - User preferences for scoring weights
 * @returns Score between 0-100
 */
function calculateAssetScore(
  asset: AssetCandidate,
  preferences: ScoringPreferences
): number {
  // Implementation
}
```

**Inline comments for complex logic**:
```typescript
// Check if asset dimensions match expected aspect ratio (within 5% tolerance)
const aspectRatio = width / height;
const expectedRatio = ASPECT_RATIOS[assetType];
const tolerance = 0.05;
if (Math.abs(aspectRatio - expectedRatio) <= tolerance) {
  score += ASPECT_RATIO_WEIGHT;
}
```

---

## Best Practices

### Immutability

**Prefer const, avoid mutation**:
```typescript
// Good
const movies = await movieService.getAll();
const filtered = movies.filter(m => m.status === 'active');

// Bad
let movies = await movieService.getAll();
movies = movies.filter(m => m.status === 'active');
```

### Array Methods

**Use modern array methods**:
```typescript
// Good: map, filter, reduce
const titles = movies.map(m => m.title);
const active = movies.filter(m => m.status === 'active');
const count = movies.reduce((sum, m) => sum + m.fileCount, 0);

// Avoid: for loops for simple transformations
const titles = [];
for (let i = 0; i < movies.length; i++) {
  titles.push(movies[i].title);
}
```

### Object Destructuring

**Destructure for readability**:
```typescript
// Good
const { title, releaseDate, plot } = movie;
logger.info(`Processing: ${title} (${releaseDate})`);

// OK but more verbose
logger.info(`Processing: ${movie.title} (${movie.releaseDate})`);
```

### Early Returns

**Return early to reduce nesting**:
```typescript
// Good: Early returns
function processMovie(movie: Movie): void {
  if (!movie) {
    logger.warn('No movie provided');
    return;
  }

  if (movie.locked) {
    logger.debug('Movie locked, skipping');
    return;
  }

  // Main logic here
  enrichMovie(movie);
}

// Bad: Nested conditions
function processMovie(movie: Movie): void {
  if (movie) {
    if (!movie.locked) {
      // Main logic here
      enrichMovie(movie);
    }
  }
}
```

---

## Anti-Patterns to Avoid

### Magic Numbers

```typescript
// Bad
if (score > 75) { }

// Good
const MINIMUM_ACCEPTABLE_SCORE = 75;
if (score > MINIMUM_ACCEPTABLE_SCORE) { }
```

### Callback Hell

```typescript
// Bad
fetchMovie(id, (movie) => {
  enrichMovie(movie, (enriched) => {
    saveMovie(enriched, (saved) => {
      // Too nested
    });
  });
});

// Good
const movie = await fetchMovie(id);
const enriched = await enrichMovie(movie);
await saveMovie(enriched);
```

### Ignoring Errors

```typescript
// Bad
try {
  await riskyOperation();
} catch (e) {
  // Silent failure
}

// Good
try {
  await riskyOperation();
} catch (error) {
  logger.error('Risky operation failed', { error });
  throw error;
}
```

### Using `any`

```typescript
// Bad
function process(data: any): any {
  return data.value;
}

// Good
function process(data: ProcessInput): ProcessOutput {
  return { result: data.value };
}
```

---

## See Also

- [WORKFLOW.md](./WORKFLOW.md) - Development workflow
- [TESTING.md](./TESTING.md) - Testing standards
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [ESLint Configuration](../../.eslintrc.json)
- [Prettier Configuration](../../.prettierrc)
