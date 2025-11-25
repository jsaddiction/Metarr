# Component Consolidation Plan

**Purpose**: Identify and eliminate duplicate patterns, improve DRY compliance, ensure styling consistency

**Branch**: feature/component-consolidation (new)

**Related Docs**: [Styling Architecture](STYLING_ARCHITECTURE.md), [Styling Guidelines](STYLING_GUIDELINES.md)

---

## Goals

1. **DRY Compliance**: Extract repeated patterns into reusable components (2+ usage = component)
2. **Styling Consistency**: Use design tokens and utility classes, eliminate inline Tailwind where possible
3. **Import Path Consistency**: All components should use barrel exports (index.tsx)
4. **Industry Standards**: Follow established patterns (shadcn, Atomic Design)

---

## Analysis: Current Issues

### 1. Section Headers (3+ occurrences)

**Pattern**:
```tsx
<h2 className="text-2xl font-bold mb-4">Section Title</h2>
```

**Found in**:
- Dashboard.tsx (lines 27, 58, 94)
- Potentially other pages with section-based layouts

**Issue**:
- Uses `font-bold` instead of our standard `font-semibold`
- Duplicates PageContainer's title styling
- No component abstraction

**Solution**: Create `SectionHeader` component

---

### 2. Empty State Messages (5+ occurrences)

**Pattern**:
```tsx
<Card>
  <CardContent className="py-8 text-center">
    <p className="text-muted-foreground mb-4">No items found</p>
    <a href="/path" className="text-primary underline-offset-4 hover:underline">
      Action link
    </a>
  </CardContent>
</Card>
```

**Found in**:
- Dashboard.tsx (lines 34-44, 65-75)
- Movies.tsx (lines 105-119, 123-157)
- Providers.tsx (lines 48-54)

**Issue**:
- Repeated structure with minor variations
- Mixes shadcn `text-muted-foreground` with our `text-neutral-400`
- No centralized empty state component

**Solution**: Create `EmptyState` component with icon, message, and optional action

---

### 3. Loading States (6+ occurrences)

**Pattern**:
```tsx
<div className="text-center py-12 text-neutral-400">
  Loading...
</div>
```

**Found in**:
- Dashboard.tsx (lines 30, 60, 102)
- Movies.tsx (lines 92-100)
- Providers.tsx (line 22)
- RunningJobs.tsx (lines 24-29)

**Issue**:
- Inconsistent spacing (py-12 vs py-32)
- Inconsistent text color (text-neutral-400 vs text-muted-foreground)
- No spinner/loading animation
- No component abstraction

**Solution**: Create `LoadingState` component with optional spinner and message

---

### 4. Text Color Inconsistencies

**Current Usage**:
- `text-muted-foreground` (shadcn): 7 occurrences across Dashboard, Providers
- `text-neutral-400` (our tokens): Used in other pages
- `text-neutral-500`: Used in some places

**Issue**: Mixing design systems (shadcn vs our tokens)

**Solution**:
- Define which to use as standard (recommend: our tokens for consistency)
- Add utility class `.text-muted` → `@apply text-neutral-400`
- Search/replace `text-muted-foreground` with `.text-muted`

---

### 5. Import Path Inconsistencies

**Current**:
```tsx
import { PageContainer } from '@/components/ui/PageContainer/PageContainer';
```

**Should be**:
```tsx
import { PageContainer } from '@/components/ui/PageContainer';
```

**Found in**: Libraries.tsx, Providers.tsx

**Solution**: Update imports to use barrel exports

---

### 6. Movies.tsx Not Using PageContainer

**Current**: Movies.tsx (lines 93-100, 107-119)
```tsx
<div className="content-spacing">
  <div className="mb-6">
    <h1 className="text-2xl font-semibold text-white">Movies</h1>
  </div>
  ...
</div>
```

**Issue**: Doesn't use PageContainer, duplicates header markup

**Solution**: Wrap with PageContainer component

---

### 7. Card Usage Inconsistencies

**Current**:
- Some pages import Card directly from shadcn: `import { Card, CardHeader } from '@/components/ui/card'`
- Dashboard (lines 34, 65, 97) uses Card directly for empty states
- RunningJobs (line 106) uses Card for job list
- SettingCard exists but not used where appropriate

**Issue**:
- Missing opportunities to use SettingCard
- Direct Card usage doesn't apply our styling patterns

**Solution**:
- Evaluate each Card usage
- Replace with SettingCard where appropriate
- Create DataCard component for non-settings cards (tables, lists)

---

## Proposed New Components

### 1. SectionHeader Component

**Location**: `components/ui/SectionHeader/`

**Props**:
```tsx
interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode; // Optional action button/link
}
```

**Implementation**:
```tsx
<div className="flex items-center justify-between mb-4">
  <div>
    <h2 className="section-header-title">{title}</h2>
    {subtitle && <p className="section-header-subtitle">{subtitle}</p>}
  </div>
  {action}
</div>
```

**CSS** (globals.css):
```css
.section-header-title {
  @apply text-2xl font-semibold text-white;
}

.section-header-subtitle {
  @apply text-sm text-neutral-400 mt-1;
}
```

**Usage**: Dashboard sections, any page with multiple sections

---

### 2. EmptyState Component

**Location**: `components/ui/EmptyState/`

**Props**:
```tsx
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}
```

**Implementation**:
```tsx
<div className="empty-state">
  {icon && <div className="empty-state-icon">{icon}</div>}
  <p className="empty-state-title">{title}</p>
  {description && <p className="empty-state-description">{description}</p>}
  {action && (
    action.href ? (
      <a href={action.href} className="empty-state-action">
        {action.label}
      </a>
    ) : (
      <button onClick={action.onClick} className="empty-state-action">
        {action.label}
      </button>
    )
  )}
</div>
```

**CSS** (globals.css):
```css
.empty-state {
  @apply py-8 text-center;
}

.empty-state-icon {
  @apply text-neutral-500 text-4xl mb-4;
}

.empty-state-title {
  @apply text-neutral-300 mb-2;
}

.empty-state-description {
  @apply text-neutral-400 text-sm mb-4;
}

.empty-state-action {
  @apply text-primary-500 hover:text-primary-400 underline-offset-4 hover:underline;
}
```

**Usage**: Dashboard, Movies, Providers (anywhere with "no data" states)

---

### 3. LoadingState Component

**Location**: `components/ui/LoadingState/`

**Props**:
```tsx
interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}
```

**Implementation**:
```tsx
<div className="loading-state">
  <div className="loading-spinner" />
  {message && <p className="loading-message">{message}</p>}
</div>
```

**CSS** (globals.css):
```css
.loading-state {
  @apply flex flex-col items-center justify-center py-12 text-neutral-400;
}

.loading-spinner {
  @apply w-8 h-8 border-4 border-neutral-700 border-t-primary-500 rounded-full animate-spin mb-3;
}

.loading-message {
  @apply text-sm;
}
```

**Usage**: All pages with loading states (6+ locations)

---

### 4. DataCard Component

**Location**: `components/ui/DataCard/`

**Purpose**: Cards for displaying data (not settings) - tables, lists, grids

**Props**:
```tsx
interface DataCardProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  noPadding?: boolean; // For tables that need full-width
}
```

**Implementation**:
```tsx
<Card className="data-card">
  {(title || description || action) && (
    <CardHeader>
      <div className="flex items-center justify-between">
        <div>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </div>
    </CardHeader>
  )}
  <CardContent className={noPadding ? 'p-0' : ''}>
    {children}
  </CardContent>
</Card>
```

**CSS** (globals.css):
```css
.data-card {
  @apply bg-neutral-800 border border-neutral-700 rounded-xl;
}
```

**Usage**: Replace direct Card usage in Dashboard (Recent Activity), RunningJobs (Active Jobs), Movies (future table wrapper)

---

## Utility Class Additions

Add to `globals.css` → `@layer components`:

```css
/* Section headers */
.section-header-title {
  @apply text-2xl font-semibold text-foreground;
}

.section-header-subtitle {
  @apply text-sm text-muted-foreground mt-1;
}
```

**Note**: We use shadcn semantic utilities (`text-foreground`, `text-muted-foreground`) instead of explicit colors. See [Tailwind + shadcn Integration](TAILWIND_SHADCN_INTEGRATION.md) for full strategy.

---

## Migration Strategy

### Phase 1: Create New Components (Sequential)
1. Create SectionHeader component with CSS utilities
2. Create EmptyState component with CSS utilities
3. Create LoadingState component with CSS utilities
4. Create DataCard component
5. Add utility classes to globals.css

### Phase 2: Fix Import Paths (Automated)
1. Search: `from '@/components/ui/PageContainer/PageContainer'`
2. Replace: `from '@/components/ui/PageContainer'`
3. Repeat for SettingCard, SettingRow, SectionStack

### Phase 3: Page Migrations (Parallel - 3 agents)

**Agent 1: Activity Pages**
- Dashboard.tsx
  - Apply SectionHeader (3 locations)
  - Apply EmptyState (2 locations)
  - Apply LoadingState (3 locations)
  - Apply DataCard (Recent Activity section)
- RunningJobs.tsx
  - Apply LoadingState (1 location)
  - Apply DataCard (Active Jobs section)

**Agent 2: Metadata Pages**
- Movies.tsx
  - Wrap with PageContainer
  - Apply EmptyState (2 locations)
  - Apply LoadingState (1 location)
- Actors.tsx (if similar patterns exist)
- MovieEdit.tsx (if similar patterns exist)

**Agent 3: Settings Pages**
- Review all settings pages for:
  - Import path corrections
  - LoadingState usage
  - EmptyState usage

### Phase 4: Styling Consistency Review
1. Verify shadcn semantic utilities used consistently
2. Check for any remaining inline styles that should be components
3. Ensure `text-foreground`, `text-muted-foreground` used appropriately

### Phase 5: Validation (Sequential)
1. Run TypeScript checks
2. Run ESLint
3. Run builds (backend + frontend)
4. Manual browser testing of all modified pages

---

## Success Criteria

**Code Quality**:
- [ ] All repeated patterns (2+) extracted to components
- [ ] shadcn semantic utilities used consistently (`text-muted-foreground`, `text-foreground`, `bg-card`)
- [ ] All import paths use barrel exports
- [ ] SectionHeader used consistently (3+ locations)
- [ ] EmptyState used consistently (5+ locations)
- [ ] LoadingState used consistently (6+ locations)
- [ ] DataCard used for all data display cards

**Styling Consistency**:
- [ ] All section headers use `.section-header-title` utility
- [ ] All empty states follow EmptyState component pattern
- [ ] All loading states follow LoadingState component pattern
- [ ] Font weights consistent (`font-semibold` for headings)
- [ ] shadcn semantics preferred over explicit colors where appropriate

**Build Quality**:
- [ ] TypeScript compiles without errors
- [ ] ESLint passes (no new errors)
- [ ] Frontend builds successfully
- [ ] Backend builds successfully
- [ ] All pages render correctly in browser

**Documentation**:
- [ ] Update STYLING_ARCHITECTURE.md with new components
- [ ] Update STYLING_GUIDELINES.md with utility class usage
- [ ] Add component examples to .component-examples.md (optional)

---

## Estimated Impact

**Before**:
- 40+ instances of repeated patterns
- Inconsistent usage of shadcn semantics vs explicit colors
- 2 incorrect import paths
- 1 page (Movies) not using PageContainer

**After**:
- 4 new reusable components
- 100% consistent shadcn semantic usage
- 100% correct import paths
- 100% pages using PageContainer
- ~50-80 lines of code reduction across pages
- Significantly improved maintainability
- Future light/dark theme support enabled

---

## Risk Assessment

**Low Risk**:
- New component creation (additive only)
- Utility class additions (non-breaking)
- Import path corrections (TypeScript enforced)

**Medium Risk**:
- Movies.tsx refactor (significant structural change)
- Dashboard.tsx refactor (3 sections × multiple patterns)

**Mitigation**:
- Test each page individually after migration
- Keep changes atomic (one component type at a time)
- Validate builds after each phase

---

## Next Steps

1. Review and approve this plan
2. Create feature/component-consolidation branch
3. Execute Phase 1: Create components
4. Execute Phase 2: Fix imports (quick win)
5. Execute Phase 3: Page migrations (parallel agents)
6. Execute Phase 4: Text color consistency
7. Execute Phase 5: Validation
8. Commit, push, and document in ROADMAP.md
