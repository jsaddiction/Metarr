# Development Guidelines

**Purpose**: Development workflow, coding standards, and best practices for Metarr.

## Git Workflow

### Branch Strategy

```
master          Production-ready code
├── develop     Integration branch
├── feature/*   New features
├── bugfix/*    Bug fixes
└── hotfix/*    Emergency fixes
```

### Commit Conventions

**Format**: `type: scope: description`

**Types**:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `style:` Formatting (no code change)
- `refactor:` Code restructuring
- `test:` Test additions/fixes
- `chore:` Maintenance tasks

**Examples**:
```bash
feat: movies: add poster selection UI
fix: enrichment: handle TMDB 429 responses
docs: phases: update scanning documentation
refactor: database: normalize asset tables
```

### Pull Request Process

1. Create feature branch from develop
2. Make changes with clear commits
3. Run tests and linting
4. Update documentation if needed
5. Create PR with description
6. Wait for review and CI checks
7. Merge after approval

## Development Environment

### Prerequisites

```bash
# Required
Node.js 20+
npm 10+

# Optional
Docker (for PostgreSQL)
Git
VS Code (recommended IDE)
```

### Initial Setup

```bash
# Clone repository
git clone https://github.com/yourusername/metarr.git
cd metarr

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Initialize database
npm run db:init

# Start development
npm run dev:all
```

### Environment Variables

```env
# Required for production
NODE_ENV=development|production
PORT=3000

# Database
DB_TYPE=sqlite|postgres
DATABASE_URL=postgresql://user:pass@localhost/metarr

# Optional API keys (defaults provided)
TMDB_API_KEY=your_key
TVDB_API_KEY=your_key
FANART_TV_API_KEY=your_key

# Paths
DATA_PATH=./data
CACHE_PATH=./data/cache
LOGS_PATH=./logs
```

## Backend Rules

### TypeScript Standards

**Strict Mode**
```typescript
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

**Type Everything**
```typescript
// ❌ Bad
function processMovie(movie) {
  return movie.title;
}

// ✅ Good
function processMovie(movie: Movie): string {
  return movie.title;
}
```

**Use Interfaces**
```typescript
// Define clear interfaces
interface MovieService {
  findById(id: number): Promise<Movie>;
  create(data: CreateMovieDto): Promise<Movie>;
  update(id: number, data: UpdateMovieDto): Promise<Movie>;
  delete(id: number): Promise<void>;
}
```

### Error Handling

**Custom Error Classes**
```typescript
export class AppError extends Error {
  constructor(
    public message: string,
    public code: string,
    public status: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public details?: any) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}
```

**Try-Catch Patterns**
```typescript
// Service layer
async function enrichMovie(id: number): Promise<void> {
  try {
    const movie = await db.movies.findById(id);
    if (!movie) {
      throw new NotFoundError(`Movie ${id} not found`);
    }

    const metadata = await tmdb.fetchMovie(movie.tmdb_id);
    await db.movies.update(id, metadata);

  } catch (error) {
    if (error instanceof AppError) {
      throw error;  // Re-throw known errors
    }
    // Wrap unknown errors
    throw new AppError('Enrichment failed', 'ENRICHMENT_ERROR', 500);
  }
}
```

### Database Patterns

**Repository Pattern**
```typescript
export class MovieRepository {
  async findById(id: number): Promise<Movie | null> {
    return db('movies')
      .where('id', id)
      .first();
  }

  async findAll(options: FindOptions): Promise<Movie[]> {
    let query = db('movies');

    if (options.monitored !== undefined) {
      query = query.where('monitored', options.monitored);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    return query;
  }

  async create(data: CreateMovieDto): Promise<Movie> {
    const [id] = await db('movies')
      .insert(data)
      .returning('id');

    return this.findById(id);
  }
}
```

**Transaction Management**
```typescript
async function publishMovie(movieId: number): Promise<void> {
  const trx = await db.transaction();

  try {
    // Multiple operations in transaction
    await trx('movies').update({ status: 'publishing' });
    await deployAssets(movieId, trx);
    await generateNFO(movieId, trx);
    await trx('movies').update({ status: 'published' });

    await trx.commit();
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}
```

### Service Layer

**Separation of Concerns**
```typescript
// Controller: HTTP handling
export class MovieController {
  constructor(private movieService: MovieService) {}

  async getMovie(req: Request, res: Response): Promise<void> {
    const movie = await this.movieService.findById(req.params.id);
    res.json({ success: true, data: movie });
  }
}

// Service: Business logic
export class MovieService {
  constructor(
    private movieRepo: MovieRepository,
    private enrichService: EnrichmentService
  ) {}

  async findById(id: number): Promise<Movie> {
    const movie = await this.movieRepo.findById(id);
    if (!movie) {
      throw new NotFoundError(`Movie ${id} not found`);
    }
    return movie;
  }

  async enrich(id: number): Promise<void> {
    const movie = await this.findById(id);
    await this.enrichService.enrichMovie(movie);
  }
}

// Repository: Data access
export class MovieRepository {
  async findById(id: number): Promise<Movie | null> {
    // Database query only
  }
}
```

## Testing

### Test Structure

```
test/
├── unit/           # Unit tests
├── integration/    # Integration tests
├── fixtures/       # Test data
└── helpers/        # Test utilities
```

### Unit Tests

```typescript
describe('MovieService', () => {
  let service: MovieService;
  let mockRepo: jest.Mocked<MovieRepository>;

  beforeEach(() => {
    mockRepo = createMockRepository();
    service = new MovieService(mockRepo);
  });

  describe('findById', () => {
    it('should return movie when found', async () => {
      const movie = { id: 1, title: 'Test Movie' };
      mockRepo.findById.mockResolvedValue(movie);

      const result = await service.findById(1);

      expect(result).toEqual(movie);
      expect(mockRepo.findById).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundError when not found', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.findById(999))
        .rejects
        .toThrow(NotFoundError);
    });
  });
});
```

### Integration Tests

```typescript
describe('Movies API', () => {
  beforeAll(async () => {
    await db.migrate.latest();
    await db.seed.run();
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('GET /api/v1/movies/:id', () => {
    it('should return movie details', async () => {
      const response = await request(app)
        .get('/api/v1/movies/1')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: 1,
          title: expect.any(String)
        }
      });
    });
  });
});
```

## Code Quality

### ESLint Configuration

```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "no-console": "warn",
    "no-unused-vars": "error",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "@typescript-eslint/no-explicit-any": "error"
  }
}
```

### Prettier Configuration

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

### Pre-commit Hooks

```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.ts": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

## Logging

### Log Levels

```typescript
enum LogLevel {
  ERROR = 'error',   // System errors
  WARN = 'warn',     // Warnings
  INFO = 'info',     // General info
  DEBUG = 'debug',   // Debug info
  TRACE = 'trace'    // Detailed trace
}
```

### Logger Usage

```typescript
import { logger } from '@/utils/logger';

// Error logging
logger.error('Database connection failed', {
  error: err.message,
  host: config.db.host
});

// Info logging
logger.info('Movie enriched', {
  movieId: movie.id,
  provider: 'tmdb',
  duration: 1234
});

// Debug logging
logger.debug('API request', {
  method: req.method,
  path: req.path,
  query: req.query
});
```

## Performance

### Database Optimization

```typescript
// Use indexes
CREATE INDEX idx_movies_monitored ON movies(monitored);
CREATE INDEX idx_movies_tmdb ON movies(tmdb_id);

// Batch operations
const movies = await db('movies')
  .whereIn('id', movieIds)
  .select(['id', 'title', 'year']);  // Select only needed fields

// Use joins wisely
const moviesWithAssets = await db('movies as m')
  .leftJoin('cache_assets as p', 'm.poster_id', 'p.id')
  .select('m.*', 'p.file_path as poster_path');
```

### Caching Strategy

```typescript
class CacheService {
  private cache = new Map<string, CacheEntry>();

  async get<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);

    if (cached && !this.isExpired(cached)) {
      return cached.value as T;
    }

    const value = await factory();
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });

    return value;
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > 3600000; // 1 hour
  }
}
```

## Security

### Input Validation

```typescript
import { body, validationResult } from 'express-validator';

// Validation middleware
export const validateMovie = [
  body('title').notEmpty().isLength({ max: 255 }),
  body('year').isInt({ min: 1888, max: 2100 }),
  body('tmdb_id').optional().isInt(),

  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid input', errors.array());
    }
    next();
  }
];
```

### SQL Injection Prevention

```typescript
// ❌ Bad - SQL injection vulnerable
const movie = await db.raw(`
  SELECT * FROM movies WHERE title = '${userInput}'
`);

// ✅ Good - Parameterized query
const movie = await db('movies')
  .where('title', userInput)
  .first();

// ✅ Good - With raw query
const movie = await db.raw(
  'SELECT * FROM movies WHERE title = ?',
  [userInput]
);
```

## Debugging

### VS Code Launch Configuration

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "program": "${workspaceFolder}/dist/index.js",
      "preLaunchTask": "npm: build",
      "sourceMaps": true,
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "app:*"
      }
    }
  ]
}
```

### Debug Logging

```typescript
import debug from 'debug';

const log = debug('app:movies');

export class MovieService {
  async enrichMovie(id: number): Promise<void> {
    log('Starting enrichment for movie %d', id);

    const movie = await this.findById(id);
    log('Found movie: %O', movie);

    const metadata = await this.fetchMetadata(movie);
    log('Fetched metadata: %O', metadata);
  }
}
```

## Related Documentation

### Development in Phases
- All [Phase Documentation](phases/) - Implementation patterns
- [Database Schema](DATABASE.md) - Migration strategies
- [API Architecture](API.md) - API design patterns
- [UI Standards](UI_STANDARDS.md) - Frontend patterns

### Technical References
- [Git Workflow](technical/GIT_WORKFLOW.md) - Detailed Git conventions
- [Webhooks](technical/WEBHOOKS.md) - Webhook handling