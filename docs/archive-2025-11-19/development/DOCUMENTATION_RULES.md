# Documentation Rules

**Purpose**: Meta-documentation defining how to write, maintain, and organize Metarr documentation. These rules ensure documentation remains concise, current, DRY, and context-efficient for both AI assistants and human developers.

**Related Docs**:
- Parent: [WORKFLOW.md](./WORKFLOW.md) - When to update docs
- Related: [ROADMAP.md](./ROADMAP.md), [/CLAUDE.md](/CLAUDE.md)

## Quick Reference

- DRY: One canonical source per concept
- Link, don't duplicate
- Strict length limits (no exceptions without justification)
- Brevity: Every sentence must add value
- Actionable: Enable work, don't describe implementation
- Current: Outdated docs worse than no docs

---

## Philosophy

### DRY Principle (Don't Repeat Yourself)

**One canonical source per concept**:
- Choose the best location for each concept
- Link to that location from everywhere else
- Never copy/paste documentation content
- If explaining same thing twice, refactor

**Example**:
```markdown
❌ Bad: Duplicating asset tier explanation in multiple docs
✅ Good: Explain in ASSET_MANAGEMENT/README.md, link from elsewhere
```

### Brevity is Critical

**Why brevity matters**:
- AI context windows are limited (200K tokens)
- Faster to read and comprehend
- Easier to keep current
- Forces clarity of thought

**Every sentence must add value**:
- Remove obvious statements
- Cut filler words
- Use bullets over paragraphs
- Use tables for comparisons

### Actionable Over Descriptive

**Enable work, don't describe code**:
```markdown
❌ Bad: "The assetScoring.ts file contains a function called calculateScore"
✅ Good: "Asset scoring uses weighted dimensions: 1.0=resolution, 0.8=aspect ratio"
```

**Focus on**:
- What developers need to know
- How to accomplish tasks
- When to use what approach
- Why decisions were made

**Avoid**:
- Implementation details (use inline code comments)
- API response formats (link to official docs)
- Obvious explanations
- Code walkthroughs

### Currency is Sacred

**Outdated docs are worse than no docs**:
- Reader wastes time following wrong info
- Breaks trust in documentation
- Better to delete than leave stale
- Update immediately when behavior changes

**Staleness indicators**:
- References to removed features
- Outdated command examples
- Broken links
- Contradicts actual code behavior

---

## Length Limits

**Strict maximums per document type** (exceptions require written justification):

| Document Type | Maximum Lines | Purpose |
|--------------|---------------|---------|
| Overview docs | 200 | High-level navigation |
| Phase docs | 500 | Detailed phase behavior |
| Technical references | 500 | Implementation details |
| Getting started | 300 | Tutorial-style guides |
| Development docs | 400 | Workflow and standards |
| Index/navigation | 150 | Documentation maps |
| Directory READMEs | 250 | Overview + links |
| Root files (CLAUDE.md) | 250 | AI entry point |
| Root files (README.md) | 100 | Human entry point |
| Root files (CONTRIBUTING.md) | 200 | Contributor guide |

### Enforcement

**Before committing docs**:
```bash
# Check line count
wc -l docs/path/to/file.md

# If exceeds limit, either:
# 1. Trim unnecessary content
# 2. Split into multiple focused docs
# 3. Move details to separate reference docs
```

**Dealing with limit violations**:
1. Remove duplication (link instead)
2. Cut verbose explanations
3. Move examples to separate file
4. Split into focused sub-docs
5. Only then: Request limit exception with justification

---

## Mandatory Structure

**Every documentation file MUST include**:

```markdown
# Title

**Purpose**: 2-3 sentence description of what this doc covers

**Related Docs**:
- Parent: [Link to parent/overview doc]
- Related: [Link], [Link], [Link]

## Quick Reference (TL;DR)
- Bullet points for quick scanning
- Key takeaways
- Common use cases

## [Main Content Sections]

## See Also
- [Related documentation links]
```

### Section Organization

**Recommended order**:
1. Purpose statement
2. Related docs
3. Quick reference
4. Overview (if needed)
5. Detailed sections (alphabetical or logical order)
6. Troubleshooting (if applicable)
7. See also

**Section guidelines**:
- Use H2 (`##`) for main sections
- Use H3 (`###`) for subsections
- Use H4 (`####`) sparingly (indicates over-complexity)
- Keep nesting shallow (max 3 levels)

---

## When to Update Docs

### Update Triggers

| Trigger | Update These Docs | Priority |
|---------|------------------|----------|
| New API endpoint | `docs/architecture/API.md` | High |
| Database schema change | `docs/architecture/DATABASE.md` | High |
| Phase behavior change | `docs/phases/[PHASE].md` | High |
| Configuration option added | `docs/getting-started/CONFIGURATION.md` | High |
| Provider integration change | `docs/providers/[PROVIDER].md` | Medium |
| New component pattern | `docs/frontend/COMPONENTS.md` | Medium |
| Job queue change | `docs/architecture/JOB_QUEUE.md` | Medium |
| Asset system change | `docs/architecture/ASSET_MANAGEMENT/` | High |
| New troubleshooting case | `docs/operations/TROUBLESHOOTING.md` | Low |
| Coding standard change | `docs/development/CODING_STANDARDS.md` | Medium |

### Documentation Quality Checks

**Before committing doc changes**:
```
[ ] Still under length limit?
[ ] Examples up to date?
[ ] Links still valid?
[ ] Information not duplicated elsewhere?
[ ] Mandatory structure present?
[ ] Clear and actionable?
```

### Verification Process

**Check for staleness**:
1. Read the doc critically
2. Test examples in current codebase
3. Verify links work
4. Confirm behavior matches reality
5. Update or delete outdated content

---

## Linking Strategy

### When to Link vs Duplicate

**ALWAYS link (never duplicate)**:
- Concept explanations
- Process descriptions
- Architecture overviews
- API specifications
- Configuration options

**OK to duplicate**:
- Quick reference tables (with note: "See [link] for details")
- Critical warnings/notices
- Command examples (if context-appropriate)

### Link Format Standards

**Internal links** (same repo):
```markdown
Relative from current file:
- Same directory: [Link text](./FILE.md)
- Parent directory: [Link text](../FILE.md)
- Root: [Link text](/CLAUDE.md)

With anchors:
- [Link text](./FILE.md#section-name)
```

**External links** (other sites):
```markdown
[Official TMDB API Docs](https://developers.themoviedb.org/3)
```

**Link best practices**:
- Use descriptive link text (not "click here")
- Keep links up to date
- Prefer relative paths for internal links
- Link to official docs for external APIs
- Use anchor links to specific sections

---

## Forbidden Practices

### Never Do These

**❌ Duplicating content**:
```markdown
❌ Bad: Copying asset tier explanation from ASSET_MANAGEMENT/ to ENRICHMENT.md
✅ Good: "See [Asset Management](../architecture/ASSET_MANAGEMENT/README.md) for tier details"
```

**❌ Implementation details in docs**:
```markdown
❌ Bad: "The calculateScore function loops through assets and multiplies..."
✅ Good: "Assets are scored based on weighted dimensions (see inline comments)"
```

**❌ Outdated examples**:
```markdown
❌ Bad: Code examples using old API that no longer exists
✅ Good: Either update examples or remove them
```

**❌ External API specs**:
```markdown
❌ Bad: Documenting full TMDB API response format
✅ Good: "See [TMDB API docs](https://link) for response structure"
```

**❌ Verbose obvious explanations**:
```markdown
❌ Bad: "TypeScript is a strongly typed language that compiles to JavaScript..."
✅ Good: Assume basic TypeScript knowledge, document project-specific patterns
```

**❌ Stale TODOs**:
```markdown
❌ Bad: "TODO: Document this feature" (sitting for months)
✅ Good: Create GitHub issue, link in code comment, remove from docs
```

### Common Pitfalls

**Copying from old docs without trimming**:
- Always question if content is necessary
- Aggressively cut unnecessary words
- Focus on what's unique to Metarr

**Including too many examples**:
- One good example better than three mediocre ones
- Link to code for additional examples
- Keep examples up to date or remove

**Explaining framework/library behavior**:
- Assume React/TypeScript knowledge
- Link to official docs for framework features
- Only document Metarr-specific patterns

---

## When to Create New Docs

### Split Triggers

**Create new doc when**:
1. Concept referenced from 3+ different places
2. Section exceeds 300 lines in parent doc
3. New major feature added (e.g., new phase)
4. Distinct audience (ops vs dev vs user)

**Process for splitting**:
1. Create new doc with mandatory structure
2. Move content to new doc
3. Add to parent doc's "See Also" section
4. Replace detailed content with link + brief summary
5. Update INDEX.md

### Directory Structure Guidelines

**When to create new directory**:
- Conceptually related docs (5+ files)
- Hierarchical relationship (overview + specifics)
- Distinct domain (phases, providers, frontend)

**Directory README.md**:
- Required for every doc directory
- 250 line maximum
- Overview + links to files in directory
- Navigation aid for that domain

**Example**:
```
docs/architecture/ASSET_MANAGEMENT/
├── README.md              # Overview + tier flow
├── ASSET_TYPES.md         # Media-specific details
├── CONTENT_ADDRESSING.md  # SHA256 sharding
├── TWO_COPY_SYSTEM.md     # Cache vs library
└── FIELD_LOCKING.md       # Lock behavior
```

---

## Archive Policy

### When to Archive

**Archive documentation when**:
- Feature completely removed from codebase
- Approach replaced with better solution
- External dependency deprecated
- Documentation no longer relevant

**Don't archive**:
- Temporarily outdated (update instead)
- Partially outdated (fix stale sections)
- Just because it's old (if still accurate)

### Archive Process

**Steps**:
1. Create dated archive directory if needed:
   ```
   docs/archive-YYYY-MM-DD/
   ```

2. Move entire file (preserve directory structure):
   ```
   docs/phases/OLD_PHASE.md → docs/archive-2025-11-19/phases/OLD_PHASE.md
   ```

3. Update links pointing to archived doc:
   - Remove from INDEX.md
   - Update or remove links from other docs
   - Add archive note if historically significant

4. Commit with clear message:
   ```
   docs: archive OLD_PHASE documentation (feature removed)
   ```

### Archive Naming Convention

```
docs/archive-YYYY-MM-DD/
```

**Examples**:
- `docs/archive-2025-11-19/` - Major doc migration
- `docs/archive-2025-12-15/` - Removed feature docs

### When to Delete Archives

**Delete archives after**:
- 1 year, if feature completely removed
- 6 months, if replaced with better docs
- Immediately, if sensitive info (secrets, vulns)

**Exception**: Keep archives for major system redesigns as historical reference.

---

## See Also

- [WORKFLOW.md](./WORKFLOW.md) - When to update docs during development
- [/CLAUDE.md](/CLAUDE.md) - AI assistant rules and entry point
- [INDEX.md](../INDEX.md) - Documentation map (when created)
