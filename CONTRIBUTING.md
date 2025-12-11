# Contributing to Metarr

Thank you for your interest in contributing to Metarr! This document provides guidelines for human contributors.

**For AI assistants**: See [CLAUDE.md](CLAUDE.md) for AI-specific workflow rules.

---

## Code of Conduct

**Be respectful**: Treat all contributors with respect. No harassment, discrimination, or toxic behavior.

**Be constructive**: Provide helpful feedback. Focus on the code, not the person.

**Be collaborative**: Work together to solve problems. Ask questions, share knowledge.

---

## Getting Started

### 1. Fork and Clone

```bash
# Fork the repository on GitHub
# Then clone your fork
git clone https://github.com/YOUR_USERNAME/Metarr.git
cd Metarr

# Add upstream remote
git remote add upstream https://github.com/jsaddiction/Metarr.git
```

### 2. Set Up Development Environment

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your settings (optional for development)

# Start development servers
npm run dev:all  # Backend (port 3000) + Frontend (port 3001)
```

### 3. Create a Feature Branch

```bash
# Always branch from master
git checkout master
git pull upstream master

# Create feature branch
git checkout -b feature/your-feature-name
```

---

## Development Workflow

**Complete workflow**: See [docs/development/WORKFLOW.md](docs/development/WORKFLOW.md)

### Quick Reference

1. **Make changes** - Edit code, add features, fix bugs
2. **Test changes** - Run tests (`npm test`), test in browser
3. **Lint code** - `npm run lint` (fixes auto-apply)
4. **Type check** - `npm run typecheck`
5. **Build** - `npm run build && npm run build:frontend`
6. **Commit** - Small, focused commits with clear messages
7. **Push** - Push to your fork
8. **Pull request** - Create PR on GitHub

### Pre-Commit Checklist

Before every commit:
- [ ] Code quality: TypeScript errors resolved, ESLint passing
- [ ] Tests: All tests pass (`npm test`)
- [ ] Build: Both builds succeed
- [ ] Documentation: Relevant docs updated
- [ ] Manual testing: Changes verified in browser

**See [WORKFLOW.md](docs/development/WORKFLOW.md) for complete checklist.**

---

## Commit Message Format

Use conventional commits:

```
type(scope): subject

body (optional)
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring (no behavior change)
- `test`: Test additions or modifications
- `chore`: Build process, tooling, dependencies

**Examples**:
```
feat(enrichment): add Fanart.tv provider integration
fix(scan): resolve race condition in NFO parsing
docs(reference): add asset scoring algorithm details
```

**See**: [docs/development/WORKFLOW.md](docs/development/WORKFLOW.md) for complete git standards.

---

## Testing Requirements

### When Tests Are Required

Tests are **mandatory** for:
- New business logic functions
- New API endpoints
- Database operations
- Complex algorithms (scoring, matching, parsing)

### Running Tests

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode for development
```

### Writing Tests

Place tests adjacent to source files:
```
src/services/assetScoring.ts
src/services/assetScoring.test.ts
```

**See**: [docs/development/TESTING.md](docs/development/TESTING.md) for complete testing guidelines.

---

## Documentation Requirements

**When to update docs**:
- New features: Update relevant phase/architecture docs
- API changes: Update [docs/architecture/API.md](docs/architecture/API.md)
- Database changes: Update [docs/architecture/DATABASE.md](docs/architecture/DATABASE.md)
- Configuration changes: Update relevant concepts or architecture doc

**Documentation standards**: See [docs/development/DOCUMENTATION_RULES.md](docs/development/DOCUMENTATION_RULES.md)

---

## Pull Request Process

### 1. Create Pull Request

- **Base branch**: Always target `master`
- **Title**: Clear, descriptive title
- **Description**: Explain what changed and why
- **Link issues**: Reference related issues (`Fixes #123`)

### 2. PR Checklist

Ensure your PR includes:
- [ ] Clear description of changes
- [ ] Tests for new functionality
- [ ] Documentation updates
- [ ] No breaking changes (or clearly documented)
- [ ] All CI checks passing

### 3. Review Process

- Maintainers will review your PR
- Address feedback promptly
- Keep discussion focused and professional
- Be patient - reviews take time

### 4. After Merge

```bash
# Update your fork
git checkout master
git pull upstream master
git push origin master

# Delete feature branch
git branch -d feature/your-feature-name
git push origin --delete feature/your-feature-name
```

---

## Code Style

**TypeScript/JavaScript**:
- Use TypeScript for all new code
- Strict type checking enabled
- No `any` types (use `unknown` if needed)
- ESLint configuration enforced

**React Components**:
- Functional components with hooks
- TypeScript interfaces for props
- Organized by feature/domain

**See**: [docs/development/CODING_STANDARDS.md](docs/development/CODING_STANDARDS.md)

---

## Project Areas Looking for Help

**High Priority**:
- Jellyfin player integration
- Plex player integration
- MusicBrainz provider integration
- Test coverage improvements

**Documentation**:
- Screenshots and examples
- Tutorial videos
- Troubleshooting guides

**Frontend**:
- UI/UX improvements
- Accessibility enhancements
- Mobile responsiveness

**Backend**:
- Performance optimizations
- Error handling improvements
- Additional provider integrations

---

## Questions or Issues?

- **Bug reports**: [GitHub Issues](https://github.com/jsaddiction/Metarr/issues)
- **Feature requests**: [GitHub Discussions](https://github.com/jsaddiction/Metarr/discussions)
- **Questions**: [GitHub Discussions](https://github.com/jsaddiction/Metarr/discussions)

---

## License

By contributing to Metarr, you agree that your contributions will be licensed under the MIT License.
