# Documentation Audit Findings
**Date**: 2025-12-11
**Auditor**: Documentation Lead (DOC)
**Scope**: Complete documentation review for Metarr

## Executive Summary

**Total Findings**: 9
- **Critical**: 0
- **High**: 3
- **Medium**: 5
- **Low**: 1

The documentation is generally well-structured and comprehensive. However, there are significant issues with outdated database schema documentation, broken directory structure references, and placeholder URLs that need immediate attention. The API documentation is mostly accurate but has one endpoint documented that doesn't exist in the codebase.

---

## Findings by Severity

### DOC-001: Database schema completely outdated

**Severity**: High
**Location**: `docs/architecture/DATABASE.md:687-743`
**Standard Violated**: Outdated doc (contradicts code)

**Problem**: The DATABASE.md documentation describes a `people` table for actors, directors, and crew members (lines 687-767), but the actual migration creates an `actors` table with a completely different schema. The documented `people` table includes fields like `biography`, `birthday`, `deathday`, and `birthplace` that don't exist in the actual `actors` table. The actual `actors` table has fields like `name_normalized`, `image_cache_path`, `identification_status`, and field locking that aren't documented.

**Impact**: Developers and AI assistants using the DATABASE.md file will work with incorrect schema information, potentially causing bugs, incorrect queries, and wasted development time. This is particularly critical as DATABASE.md is listed as a required reference in CLAUDE.md.

**Remediation**: Update DATABASE.md section "### people" (line 687) to accurately reflect the `actors` table schema from migration file at line 872. Include all actual fields: `name_normalized`, `image_cache_path`, `image_hash`, `image_ctime`, `identification_status`, `enrichment_priority`, and locking fields. Update related `movie_actors` table documentation to match actual schema with `role_locked` and `removed` fields.

**Effort**: Medium (requires careful review of migration and updating ~80 lines of docs)

---

### DOC-002: Broken directory structure reference in CLAUDE.md

**Severity**: High
**Location**: `CLAUDE.md:284`
**Standard Violated**: Referenced file/function doesn't exist

**Problem**: CLAUDE.md line 284 references `docs/providers/` directory in the project structure diagram: "├── providers/       # Provider integrations". However, this directory does not exist. The actual structure has `docs/implementation/Providers/` and `docs/concepts/Enrichment/Providers/` instead.

**Impact**: New developers and AI assistants following CLAUDE.md will look for provider documentation in the wrong location. This breaks the mental model of the documentation structure presented in the critical onboarding document.

**Remediation**: Update CLAUDE.md line 284 to reflect actual structure. Remove the misleading `providers/` entry and update the structure diagram to show the correct locations. Consider adding a comment directing to the actual locations: `implementation/Providers/` and `concepts/Enrichment/Providers/`.

**Effort**: Low (simple text update in one location)

---

### DOC-003: Inconsistent GitHub repository URLs

**Severity**: High
**Location**: `CLAUDE.md:31,295` and `README.md:31`
**Standard Violated**: Dead links in docs

**Problem**: CLAUDE.md uses placeholder URLs `https://github.com/yourusername/metarr` (lines 31 and 295) while README.md and CONTRIBUTING.md use the actual repository URL `https://github.com/jsaddiction/Metarr`. This creates inconsistency and broken links for users following CLAUDE.md instructions.

**Impact**: Developers following CLAUDE.md clone instructions will encounter 404 errors. AI assistants may provide incorrect clone commands. This affects the critical "Quick Start" section that's meant to be the fastest path to running the application.

**Remediation**: Replace all instances of `yourusername/metarr` in CLAUDE.md with the actual repository URL `jsaddiction/Metarr` to match README.md and CONTRIBUTING.md.

**Effort**: Low (find and replace in single file)

---

### DOC-004: Documented API endpoint doesn't exist

**Severity**: Medium
**Location**: `docs/architecture/API.md:908-916`
**Standard Violated**: Documented API endpoint doesn't exist

**Problem**: API.md documents a bulk enrichment endpoint at line 908: `POST /api/v1/jobs/bulk` with a specific payload structure for bulk enrichment operations. However, this endpoint does not exist in the actual route definitions in `src/routes/api.ts` or `src/routes/enrichment.ts`. The actual bulk enrichment endpoint is `POST /api/v1/enrichment/bulk-run` (documented correctly at line 480 in the same file).

**Impact**: Frontend developers attempting to implement bulk operations will use the wrong endpoint and receive 404 errors. This creates confusion as the same document correctly lists the actual endpoint earlier but then provides conflicting information in the "Bulk Operations" section.

**Remediation**: Remove or update the "Bulk Enrich" example at lines 908-916 in API.md. Either remove it entirely (since bulk enrichment is already correctly documented at line 480) or update it to reference the correct endpoint `POST /api/v1/enrichment/bulk-run` with accurate payload structure.

**Effort**: Low (remove or update ~8 lines)

---

### DOC-005: Missing LICENSE file referenced in README

**Severity**: Medium
**Location**: `README.md:78`
**Standard Violated**: Referenced file/function doesn't exist

**Problem**: README.md line 78 states "This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details." However, the LICENSE file does not exist in the repository root directory.

**Impact**: Users and contributors cannot verify the actual license terms. The README makes a false promise about license information availability. This could have legal implications for open source usage and contributions.

**Remediation**: Create a LICENSE file in the repository root with the appropriate MIT License text, or remove/update the LICENSE reference in README.md if a different license is intended.

**Effort**: Low (add standard MIT license file or update one line)

---

### DOC-006: Documentation references non-existent docs/getting-started directory

**Severity**: Medium
**Location**: Git status shows deleted `docs/getting-started/` files
**Standard Violated**: Dead links in docs

**Problem**: Git status shows the following getting-started documentation files were deleted but not yet committed:
- `docs/getting-started/CONFIGURATION.md`
- `docs/getting-started/DOCKER.md`
- `docs/getting-started/FIRST_RUN.md`
- `docs/getting-started/INSTALLATION.md`
- `docs/getting-started/MIGRATION.md`

However, there may still be references to these files in existing documentation that haven't been updated.

**Impact**: Any documentation that links to these getting-started guides will have broken links. New users looking for installation or configuration guidance may be directed to non-existent files.

**Remediation**: Search all documentation files for links to `docs/getting-started/` and update them to point to the correct current documentation locations (likely in README.md or other appropriate locations). Verify no broken links remain.

**Effort**: Medium (requires grep search and updating multiple potential link locations)

---

### DOC-007: Documentation references deleted archive files

**Severity**: Medium
**Location**: Git status shows 60+ deleted archive files
**Standard Violated**: Dead links in docs

**Problem**: Git status shows extensive documentation archive from 2025-11-19 with 60+ deleted files in `docs/archive-2025-11-19/`. While archiving old docs is good practice, there may be stale references to these archived files in current documentation that haven't been updated to point to the new locations.

**Impact**: Broken links if any current documentation references these archived files. Historical context may be lost if the archive deletion is committed without ensuring all content has been migrated to new locations.

**Remediation**: Before committing the archive deletion, verify:
1. All content from archived files has been migrated to new locations
2. No current documentation files reference the archive
3. Consider keeping a single archive index file documenting what was archived and why

**Effort**: Medium (requires systematic verification of archive content migration)

---

### DOC-008: Redundant API endpoint documentation

**Severity**: Medium
**Location**: `docs/architecture/API.md:117 and 429`
**Standard Violated**: Documented API endpoint doesn't exist (technically exists but duplicated)

**Problem**: The `POST /api/v1/movies/:id/enrich` endpoint is documented twice in API.md - once at line 117 under "Enrich Movie" section and again at line 429 under "Trigger Manual Movie Enrichment". Both refer to the same endpoint but with slightly different descriptions and documentation structure.

**Impact**: This creates confusion about which documentation is authoritative. The duplication violates the DRY (Don't Repeat Yourself) principle emphasized in DOCUMENTATION_RULES.md. Maintainers may update one location and miss the other, leading to inconsistent documentation.

**Remediation**: Consolidate the two entries into a single, comprehensive documentation of the endpoint. Decide which location is more appropriate (likely the "Trigger Manual Movie Enrichment" section as it's more detailed) and remove the duplicate, adding a cross-reference if needed.

**Effort**: Low (consolidate two sections into one)

---

### DOC-009: README refers to non-existent provider concepts path

**Severity**: Low
**Location**: `README.md:62`
**Standard Violated**: Dead links in docs

**Problem**: README.md line 62 lists "**[Providers](docs/concepts/Enrichment/Providers/)** - TMDB, TVDB, OMDb, Fanart.tv concepts" in the documentation index. While this path does exist, it's inconsistent with the INDEX.md structure which separates provider concepts from provider implementation. This could cause confusion about where to find provider information.

**Impact**: Minor - the link works, but users may be unclear about the distinction between provider concepts vs. provider implementation details documented in `docs/implementation/Providers/`.

**Remediation**: Update README.md documentation section to clarify the distinction between conceptual provider documentation (rate limiting, capabilities) and implementation details (API integration specifics). Consider matching the structure presented in docs/INDEX.md more closely.

**Effort**: Low (clarify documentation structure in README)

---

## Recommendations

### Immediate Actions (High Priority)
1. **DOC-001**: Update DATABASE.md to reflect actual `actors` table schema (highest priority)
2. **DOC-002**: Fix CLAUDE.md project structure to show correct directory layout
3. **DOC-003**: Standardize all GitHub repository URLs across documentation

### Short-term Actions (Medium Priority)
4. **DOC-004**: Remove or fix incorrect bulk enrichment endpoint documentation
5. **DOC-005**: Add LICENSE file or update README reference
6. **DOC-006**: Audit and fix all links to deleted getting-started documentation
7. **DOC-007**: Verify archive migration completeness before committing deletion
8. **DOC-008**: Consolidate duplicate API endpoint documentation

### Long-term Improvements
9. **DOC-009**: Standardize provider documentation organization references
10. Implement automated link checking in CI/CD pipeline
11. Add schema validation tests to catch database documentation drift
12. Consider adding a documentation changelog to track major doc restructurings

---

## Positive Findings

The audit also identified several documentation strengths:

1. **Comprehensive Coverage**: The documentation covers all major system components
2. **Good Organization**: Clear separation between concepts, implementation, and architecture
3. **Consistent Style**: Most documents follow the established formatting patterns
4. **Active Maintenance**: Recent updates show documentation is being actively maintained
5. **Good Cross-Referencing**: Most internal links are accurate and helpful
6. **Clear Quick Reference Sections**: TL;DR sections at document tops are very helpful

---

## Methodology

This audit was conducted by:
1. Reading all root-level markdown files (README, CLAUDE, CONTRIBUTING)
2. Reviewing docs/INDEX.md and directory structure
3. Cross-referencing DATABASE.md with actual migration files
4. Verifying API.md endpoints against src/routes/ implementation
5. Checking for broken internal links and missing referenced files
6. Comparing documented vs actual directory structure
7. Reviewing git status for uncommitted documentation changes

**Files Analyzed**: 60+ documentation files across all docs/ subdirectories
**Code Cross-Reference**: Migration files, route definitions, API controllers
**Tools Used**: Read, Grep, Glob, Bash for systematic verification
