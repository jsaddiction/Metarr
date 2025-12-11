# CLI Reference

**Purpose**: Complete reference for all npm scripts and command-line operations.

**Related Docs**:
- Parent: [Reference Documentation](../INDEX.md#reference-technical-details)
- Related: [Development Workflow](../development/WORKFLOW.md)

---

## Quick Reference

```bash
# Development
npm run dev:all        # Full stack development (backend + frontend)
npm run dev:backend    # Backend only with auto-restart
npm run dev:frontend   # Frontend only with hot reload

# Building
npm run build          # Build TypeScript backend
npm run build:frontend # Build React frontend with Vite

# Production
npm start             # Start production server (requires build first)

# Code Quality
npm run lint          # Check code style
npm run lint:fix      # Auto-fix linting issues
npm run format        # Format code with Prettier
npm run typecheck     # TypeScript type checking

# Testing
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report

# Database
npm run migrate       # Run database migrations

# Utilities
npm run dev:clean     # Clean development artifacts
npm run test-media:create  # Create test media files
```

---

## Development Commands

### `npm run dev:all`
Starts both backend (port 3000) and frontend (port 3001) with hot reload.

### `npm run dev:backend`
Backend only with auto-restart. Uses `tsx` for TypeScript execution.

### `npm run dev:frontend`
Frontend only with Vite HMR.

### `npm run dev:clean`
Cleans development artifacts before starting dev server.

---

## Build Commands

### `npm run build`
Compiles TypeScript backend to JavaScript. Output: `dist/` directory.

### `npm run build:frontend`
Builds optimized production frontend bundle. Output: `public/frontend/dist/`.

---

## Production Commands

### `npm start`
Starts production server using compiled JavaScript. Requires `build` and `build:frontend` first.

---

## Code Quality Commands

### `npm run lint`
Checks code style with ESLint. All TypeScript files in `src/`.

### `npm run lint:fix`
Auto-fixes linting issues where possible.

### `npm run format`
Formats code with Prettier.

### `npm run typecheck`
Type checks TypeScript without emitting files.

---

## Testing Commands

### `npm test`
Runs all tests once. Jest test runner with experimental VM modules.

### `npm run test:watch`
Runs tests in watch mode. Ideal for test-driven development.

### `npm run test:coverage`
Runs tests with coverage report. Output: `coverage/` directory.

---

## Database Commands

### `npm run migrate`
Runs database migrations. Use for first-time setup or after pulling schema changes. Idempotent (safe to run multiple times).

### `npm run test-media:create`
Creates test media files for development.

---

## Environment Variables

**Development**: Uses `.env` file (copy from `.env.example`)

**Key variables**:
```env
PORT=3000                    # Server port
NODE_ENV=development         # Environment (development | production)
DB_TYPE=sqlite               # Database type (sqlite | postgres)
DATABASE_URL=./data/metarr.sqlite  # Database path/connection
TMDB_API_KEY=your_key       # TMDB API key (optional - embedded key provided)
```

Environment variables are configured in `.env` file - see `.env.example` for available options.

---

## Common Workflows

### First-Time Setup
```bash
npm install
cp .env.example .env
npm run migrate
npm run dev:all
```

### Development
```bash
npm run dev:all
# Make changes
npm run lint
npm run typecheck
npm test
```

### Pre-Commit
```bash
npm run typecheck
npm run lint
npm run build
npm run build:frontend
npm test
```

### Production Deployment
```bash
npm install --production
npm run migrate
npm run build
npm run build:frontend
npm start
```

---

## Troubleshooting

**Port already in use**:
```bash
# Change port in .env
PORT=3001
```

**Build errors**:
```bash
# Clean and rebuild
rm -rf dist/
npm run build
```

**Test failures**:
```bash
# Run in watch mode for debugging
npm run test:watch
```

**TypeScript errors**:
```bash
# Check types without building
npm run typecheck
```
