# Frontend Styling Architecture

**Purpose**: Centralized styling system architecture for consistent UI/UX across Metarr

**Related Docs**:
- Parent: [Frontend Documentation](../INDEX.md#frontend)
- See also: [Styling Guidelines](STYLING_GUIDELINES.md), [Components](COMPONENTS.md)

---

## Current State Analysis

### Problem Statement

**Scattered Styling**: Inline Tailwind classes duplicated across 123 components
- `bg-neutral-800` appears 44 times across 24 files
- `border border-neutral-700` appears 71 times across 26 files
- Inconsistent card backgrounds, borders, and spacing
- No single source of truth for component styling

**Inconsistencies**:
- Workflow page: `bg-neutral-800/50` cards
- Provider page: `bg-neutral-800` cards
- Some pages: Harsh borders, others subtle
- Mixed padding patterns (p-3, p-4, p-6)

**Maintenance Issues**:
- Style changes require editing multiple files
- Easy to introduce inconsistencies
- Difficult to maintain design system
- No component-level reusability

---

## Proposed Architecture

### Core Principle

> **"Component-Based Styling with Global Patterns"**
>
> Create reusable components whenever a pattern appears 2+ times. Apply styling via global utility classes and CSS variables, not inline Tailwind.

### Industry Best Practices Alignment

This architecture aligns with:

1. **Atomic Design** (Brad Frost)
   - Atoms: Basic styled components (Button, Input, Card)
   - Molecules: Composed components (FormField, SettingRow)
   - Organisms: Complex components (ProviderCard, WorkflowSection)

2. **Design Tokens** (Salesforce, Adobe)
   - Semantic naming (--color-surface, --spacing-section)
   - Theme-able via CSS variables
   - Single source of truth

3. **Component-Driven Development** (Storybook pattern)
   - Isolated, reusable components
   - Consistent API across similar components
   - Self-documenting through props

4. **BEM + Utility-First Hybrid**
   - Global utility classes for common patterns
   - Component-specific variants via props
   - Tailwind for one-offs only

---

## Three-Layer Styling System

### Layer 1: Design Tokens (CSS Variables)

**Location**: `public/frontend/src/styles/globals.css` (exists)

Define semantic tokens instead of using Tailwind classes directly:

```css
@theme {
  /* Surface Colors (instead of neutral-X) */
  --color-surface-app: #171717;        /* Page background */
  --color-surface-raised: #262626;     /* Card background */
  --color-surface-overlay: #404040;    /* Modal/popover background */

  /* Border Colors */
  --color-border-default: #404040;     /* Standard borders */
  --color-border-subtle: #2626267f;    /* Subtle dividers (50% opacity) */

  /* Spacing Scale */
  --spacing-card: 1.5rem;              /* 24px - Card padding */
  --spacing-compact: 0.75rem;          /* 12px - Compact padding */
  --spacing-section: 1.5rem;           /* 24px - Between sections */
  --spacing-list: 0.75rem;             /* 12px - Between list items */

  /* Component Sizing */
  --input-height-standard: 2.5rem;     /* 40px - h-10 */
  --input-height-compact: 2rem;        /* 32px - h-8 */

  /* Border Radius */
  --radius-card: 0.75rem;              /* 12px - rounded-xl */
  --radius-input: 0.375rem;            /* 6px - rounded-md */
}
```

**Benefits**:
- Change entire theme by updating tokens
- Semantic names (surface vs neutral-800)
- Easier to maintain
- Theme switching capability

### Layer 2: Utility Classes (Global Patterns)

**Location**: `public/frontend/src/styles/globals.css` (expand existing `@layer components`)

Create utility classes for repeated patterns:

```css
@layer components {
  /* === CARDS === */
  .card-raised {
    @apply bg-[var(--color-surface-raised)] border border-[var(--color-border-default)] rounded-[var(--radius-card)] shadow-sm;
  }

  .card-raised-subtle {
    @apply bg-[var(--color-surface-raised)]/50 border border-[var(--color-border-default)] rounded-[var(--radius-card)] shadow-sm;
  }

  /* === CARD SECTIONS === */
  .card-section {
    @apply p-[var(--spacing-card)];
  }

  .card-section-compact {
    @apply p-[var(--spacing-compact)];
  }

  .card-divider {
    @apply border-t border-[var(--color-border-subtle)] my-[var(--spacing-section)];
  }

  /* === PAGE LAYOUT === */
  .page-container {
    @apply content-spacing pb-24;
  }

  .page-header {
    @apply mb-6;
  }

  .page-title {
    @apply text-2xl font-semibold text-white;
  }

  .page-subtitle {
    @apply text-sm text-neutral-400 mt-1;
  }

  /* === FORM PATTERNS === */
  .setting-row {
    @apply flex items-center justify-between;
  }

  .setting-label-group {
    @apply space-y-1;
  }

  .input-standard {
    @apply h-[var(--input-height-standard)] text-sm bg-neutral-800 border border-neutral-600 rounded-md;
  }

  .input-compact {
    @apply h-[var(--input-height-compact)] text-sm bg-neutral-800 border border-neutral-600 rounded-md;
  }

  /* === SECTION SPACING === */
  .section-stack {
    @apply space-y-[var(--spacing-section)];
  }

  .section-stack-compact {
    @apply space-y-[var(--spacing-list)];
  }
}
```

**Usage Example**:
```tsx
// Before (inline Tailwind)
<div className="bg-neutral-800/50 border border-neutral-700 rounded-xl shadow-sm p-6">

// After (utility class)
<div className="card-raised-subtle card-section">
```

### Layer 3: Reusable Components

**Location**: `public/frontend/src/components/ui/`

Create components for repeated patterns:

#### 3.1 PageContainer Component

```tsx
// components/ui/PageContainer.tsx
interface PageContainerProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function PageContainer({ title, subtitle, children }: PageContainerProps) {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
```

**Usage**:
```tsx
<PageContainer
  title="General Settings"
  subtitle="Configure metadata enrichment and library publishing behavior"
>
  {/* Page content */}
</PageContainer>
```

#### 3.2 SettingCard Component

```tsx
// components/ui/SettingCard.tsx
interface SettingCardProps {
  title: string;
  description?: string;
  icon?: string;
  variant?: 'default' | 'subtle';
  children: React.ReactNode;
}

export function SettingCard({
  title,
  description,
  icon,
  variant = 'default',
  children
}: SettingCardProps) {
  const cardClass = variant === 'subtle' ? 'card-raised-subtle' : 'card-raised';

  return (
    <Card className={cardClass}>
      <CardHeader>
        <CardTitle>{icon} {title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="section-stack">
        {children}
      </CardContent>
    </Card>
  );
}
```

**Usage**:
```tsx
<SettingCard
  title="Metadata & Asset Enrichment"
  description="Control how Metarr fetches and selects assets from providers"
  icon="✨"
  variant="subtle"
>
  {/* Settings */}
</SettingCard>
```

#### 3.3 SettingRow Component

```tsx
// components/ui/SettingRow.tsx
interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

export function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="setting-row">
      <div className="setting-label-group">
        <Label>{label}</Label>
        {description && <p className="text-sm text-neutral-500">{description}</p>}
      </div>
      {children}
    </div>
  );
}
```

**Usage**:
```tsx
<SettingRow
  label="Automatic Publishing"
  description="When enabled, assets are automatically published after enrichment completes."
>
  <Switch checked={autoPublish} onCheckedChange={setAutoPublish} />
</SettingRow>
```

#### 3.4 SectionStack Component

```tsx
// components/ui/SectionStack.tsx
interface SectionStackProps {
  spacing?: 'default' | 'compact';
  children: React.ReactNode;
}

export function SectionStack({ spacing = 'default', children }: SectionStackProps) {
  const stackClass = spacing === 'compact' ? 'section-stack-compact' : 'section-stack';
  return <div className={stackClass}>{children}</div>;
}
```

**Usage**:
```tsx
<SectionStack spacing="compact">
  {providers.map(provider => (
    <ProviderCard key={provider.id} provider={provider} />
  ))}
</SectionStack>
```

---

## Component Reuse Rule

### When to Create a Component

**Rule**: Create a reusable component when a pattern appears **2 or more times**

**Examples**:

✅ **Create Component** (appears 2+ times):
- Setting toggle row (appears on every settings page)
- Card with title/description (appears on all pages)
- Input with label (appears in all forms)
- Page header (title + subtitle)
- Collapsible section (used 5+ times)

❌ **Don't Create Component** (one-off):
- Unique layout for dashboard
- Custom visualization components
- Page-specific complex forms

### Component Naming Convention

```
[Domain][Purpose]Component

Examples:
- SettingRow (settings domain)
- PageContainer (page domain)
- FormField (form domain)
- AssetCard (asset domain)
- ProviderCard (provider domain)
```

---

## Migration Strategy

### Phase 1: Foundation (Week 1)

1. **Add Design Tokens**
   - Expand `@theme` in globals.css
   - Define semantic color, spacing, sizing tokens
   - Document token usage

2. **Create Utility Classes**
   - Add to `@layer components` in globals.css
   - Cover: cards, page layout, forms, spacing
   - Test in one page first

3. **Build Core Components**
   - PageContainer
   - SettingCard
   - SettingRow
   - SectionStack

### Phase 2: Page Migration (Week 2)

1. **Settings Pages** (highest priority)
   - Workflow page (already 50% migrated)
   - Providers page
   - Libraries page
   - Media Players page

2. **Content Pages**
   - Movies page
   - Actors page
   - Dashboard page

### Phase 3: Refinement (Week 3)

1. **Component Library Audit**
   - Identify remaining duplicated patterns
   - Create additional components as needed
   - Remove inline Tailwind where possible

2. **Documentation**
   - Update STYLING_GUIDELINES.md
   - Create component usage examples
   - Document token system

---

## File Structure

```
public/frontend/src/
├── styles/
│   └── globals.css           # Design tokens + utility classes
├── components/
│   └── ui/
│       ├── PageContainer.tsx    # Page layout wrapper
│       ├── SettingCard.tsx      # Card with title/description
│       ├── SettingRow.tsx       # Label + control row
│       ├── SectionStack.tsx     # Vertical spacing container
│       ├── FormField.tsx        # Input with label
│       ├── CollapsibleSection.tsx
│       └── ...
└── pages/
    └── settings/
        └── Workflow.tsx         # Uses components
```

---

## Benefits of This Architecture

### Consistency
- Single source of truth for styles
- All pages use same components
- Impossible to create visual inconsistencies

### Maintainability
- Change style once, applies everywhere
- No hunting for duplicate Tailwind classes
- Easy to refactor

### Developer Experience
- Import component, not copy/paste styles
- Self-documenting through component names
- TypeScript props enforce correct usage

### Performance
- Smaller bundle (reused components vs duplicated classes)
- Better tree-shaking
- Faster builds

### Theme-ability
- CSS variables enable theme switching
- Light/dark mode easier to maintain
- Brand color changes in one place

---

## Example: Before & After

### Before (Current)

```tsx
// Workflow.tsx
<div className="p-6 pb-24">
  <div className="mb-6">
    <h1 className="text-2xl font-semibold text-white">General Settings</h1>
    <p className="text-sm text-neutral-400 mt-1">Configure metadata enrichment</p>
  </div>

  <div className="space-y-6">
    <Card className="bg-neutral-800/50">
      <CardHeader>
        <CardTitle>✨ Metadata & Asset Enrichment</CardTitle>
        <CardDescription>Control how Metarr fetches assets</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label>Automatic Asset Selection</Label>
            <p className="text-sm text-neutral-500">Description</p>
          </div>
          <Switch />
        </div>
      </CardContent>
    </Card>
  </div>
</div>
```

**Problems**:
- Inline Tailwind classes (`p-6`, `pb-24`, `mb-6`, etc.)
- Repeated patterns (`flex items-center justify-between`)
- Hard to maintain consistency

### After (Proposed)

```tsx
// Workflow.tsx
<PageContainer
  title="General Settings"
  subtitle="Configure metadata enrichment and library publishing behavior"
>
  <SectionStack>
    <SettingCard
      title="Metadata & Asset Enrichment"
      description="Control how Metarr fetches and selects assets from providers"
      icon="✨"
      variant="subtle"
    >
      <SettingRow
        label="Automatic Asset Selection"
        description="When enabled, Metarr automatically selects the best assets."
      >
        <Switch checked={autoSelect} onCheckedChange={setAutoSelect} />
      </SettingRow>
    </SettingCard>
  </SectionStack>
</PageContainer>
```

**Benefits**:
- Zero inline Tailwind classes
- Semantic component names
- Reusable across all pages
- Single source of truth for styling

---

## Implementation Checklist

### Setup Phase
- [ ] Add design tokens to globals.css
- [ ] Create utility classes in @layer components
- [ ] Test tokens and utilities on one page

### Component Creation
- [ ] Create PageContainer component
- [ ] Create SettingCard component
- [ ] Create SettingRow component
- [ ] Create SectionStack component
- [ ] Create FormField component
- [ ] Create CollapsibleSection component

### Migration
- [ ] Migrate Workflow page
- [ ] Migrate Providers page
- [ ] Migrate Libraries page
- [ ] Migrate remaining settings pages
- [ ] Migrate content pages

### Documentation
- [ ] Update STYLING_GUIDELINES.md with new system
- [ ] Document all components with examples
- [ ] Create migration guide for future pages

---

## Decision Log

### Why Not Full CSS Modules?
CSS Modules would work but:
- Adds build complexity
- Harder to share styles across components
- Utility-first approach better for rapid iteration

### Why Keep Tailwind?
Tailwind is kept for:
- One-off unique styles (rare)
- Rapid prototyping
- Responsive utilities (md:, lg:, etc.)
- Existing shadcn/ui components

### Why CSS Variables Over Sass?
CSS variables because:
- Native browser support
- Theme switching at runtime
- Easier debugging (inspect in DevTools)
- No build step required

---

## See Also

- [Styling Guidelines](STYLING_GUIDELINES.md) - Design system reference
- [Component Library](COMPONENTS.md) - Component documentation
- [Tailwind Config](../../public/frontend/tailwind.config.js) - Tailwind customization
