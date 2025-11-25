# Frontend Styling Architecture

**Purpose**: Centralized styling system and project structure for consistent UI/UX

**Related Docs**: [Styling Guidelines](STYLING_GUIDELINES.md), [Components](COMPONENTS.md)

---

## Core Principles

1. **Component-Based Styling**: Create reusable components when patterns appear 2+ times
2. **Global Patterns**: Use CSS variables and utility classes, not inline Tailwind
3. **Industry Standard Structure**: Files organized by logical scope, discoverable by convention
4. **Type Colocation**: Types live where they're scoped (global vs component-specific)
5. **Single Source of Truth**: One place to change, applies everywhere

---

## File Structure

### Current State Issues
- ❌ Inconsistent directory structure
- ❌ Types scattered between global and component-specific
- ❌ Components without proper index.tsx exports
- ❌ Supporting code not properly encapsulated

### Target Structure

```
public/frontend/src/
├── components/
│   ├── ui/                          # Generic reusable components
│   │   ├── PageContainer/
│   │   │   ├── index.tsx           # Export only
│   │   │   ├── PageContainer.tsx   # Implementation
│   │   │   └── types.ts            # Component-specific types
│   │   ├── SettingCard/
│   │   │   ├── index.tsx
│   │   │   ├── SettingCard.tsx
│   │   │   └── types.ts
│   │   ├── SettingRow/
│   │   │   ├── index.tsx
│   │   │   ├── SettingRow.tsx
│   │   │   └── types.ts
│   │   └── SectionStack/
│   │       ├── index.tsx
│   │       └── SectionStack.tsx
│   ├── asset/                       # Asset-specific components
│   │   ├── AssetCard/
│   │   │   ├── index.tsx
│   │   │   ├── AssetCard.tsx
│   │   │   └── types.ts
│   │   └── ...
│   ├── provider/                    # Provider-specific components
│   │   ├── ProviderCard/
│   │   │   ├── index.tsx
│   │   │   ├── ProviderCard.tsx
│   │   │   ├── types.ts
│   │   │   └── ProviderCard.test.tsx
│   │   └── ...
│   ├── movie/                       # Movie-specific components
│   └── library/                     # Library-specific components
│
├── pages/
│   ├── settings/                    # Settings section
│   │   ├── Workflow/
│   │   │   ├── index.tsx           # Export only
│   │   │   ├── Workflow.tsx        # Page implementation
│   │   │   └── types.ts            # Page-specific types
│   │   ├── Providers/
│   │   ├── Libraries/
│   │   └── MediaPlayers/
│   ├── metadata/                    # Metadata section
│   │   ├── Movies/
│   │   ├── Actors/
│   │   └── Series/
│   └── activity/                    # Activity section
│
├── hooks/
│   ├── useProviders/
│   │   ├── index.ts
│   │   ├── useProviders.ts
│   │   └── types.ts                # Hook-specific types
│   └── usePhaseConfig/
│       ├── index.ts
│       └── usePhaseConfig.ts
│
├── types/
│   ├── index.ts                    # Re-exports all global types
│   ├── api.ts                      # API response/request types
│   ├── provider.ts                 # Provider domain types (used by multiple pages)
│   ├── movie.ts                    # Movie domain types (used by multiple pages)
│   └── config.ts                   # Config types (used by multiple pages)
│
├── styles/
│   └── globals.css                 # Design tokens + utility classes
│
└── utils/
    ├── api.ts
    └── formatting.ts
```

### Organization Rules

**Components** (`components/[domain]/[ComponentName]/`):
- `index.tsx` - Export only: `export { ComponentName } from './ComponentName'`
- `ComponentName.tsx` - Implementation
- `types.ts` - Component-specific types (if any)
- `ComponentName.test.tsx` - Tests (optional)
- Supporting files (helpers, constants) stay in directory

**Pages** (`pages/[section]/[PageName]/`):
- `index.tsx` - Export only: `export { PageName } from './PageName'`
- `PageName.tsx` - Page implementation
- `types.ts` - Page-specific types (if any)
- Page-specific components stay in directory (if not reusable)

**Hooks** (`hooks/[hookName]/`):
- `index.ts` - Export only
- `hookName.ts` - Hook implementation
- `types.ts` - Hook-specific types (if any)

**Types** (`types/`):
- **ONLY** for types used by **2+ pages/components**
- Domain-organized (api.ts, provider.ts, movie.ts)
- `index.ts` re-exports all for convenience

### Type Scoping Decision Tree

```
Is type used by 2+ pages/components?
├─ YES → types/[domain].ts (global)
└─ NO → Is it for a component, page, or hook?
    ├─ Component → components/[domain]/[Component]/types.ts
    ├─ Page → pages/[section]/[Page]/types.ts
    └─ Hook → hooks/[hookName]/types.ts
```

---

## Three-Layer Styling System

### Layer 1: Design Tokens (CSS Variables)

**Location**: `public/frontend/src/styles/globals.css` → `@theme {}`

**Add**:
```css
@theme {
  /* Surface Colors */
  --color-surface-app: #171717;
  --color-surface-raised: #262626;
  --color-surface-overlay: #404040;

  /* Borders */
  --color-border-default: #404040;
  --color-border-subtle: #2626267f;

  /* Spacing */
  --spacing-card: 1.5rem;
  --spacing-compact: 0.75rem;
  --spacing-section: 1.5rem;

  /* Sizing */
  --input-height-standard: 2.5rem;
  --input-height-compact: 2rem;

  /* Radius */
  --radius-card: 0.75rem;
}
```

### Layer 2: Utility Classes

**Location**: `public/frontend/src/styles/globals.css` → `@layer components {}`

**Add**:
```css
@layer components {
  /* Cards */
  .card-raised { /* bg-neutral-800 border border-neutral-700 rounded-xl */ }
  .card-raised-subtle { /* bg-neutral-800/50 border border-neutral-700 rounded-xl */ }

  /* Layout */
  .page-container { /* content-spacing pb-24 */ }
  .page-header { /* mb-6 */ }
  .page-title { /* text-2xl font-semibold text-white */ }
  .page-subtitle { /* text-sm text-neutral-400 mt-1 */ }

  /* Forms */
  .setting-row { /* flex items-center justify-between */ }
  .input-standard { /* h-10 text-sm bg-neutral-800 border border-neutral-600 */ }
  .input-compact { /* h-8 text-sm bg-neutral-800 border border-neutral-600 */ }

  /* Spacing */
  .section-stack { /* space-y-6 */ }
  .section-stack-compact { /* space-y-3 */ }
}
```

### Layer 3: Components

**Create** (in `components/ui/`):
- `PageContainer/` - Page layout wrapper (title + subtitle + content)
- `SettingCard/` - Card with title, description, icon, variant
- `SettingRow/` - Label + description + control
- `SectionStack/` - Vertical spacing container (default or compact)
- `FormField/` - Input with label and optional error
- `CollapsibleSection/` - Expandable section with chevron

**Usage Pattern**:
```tsx
// Before: Inline Tailwind
<div className="p-6 pb-24">
  <div className="mb-6">
    <h1 className="text-2xl font-semibold text-white">Title</h1>
  </div>
  <div className="space-y-6">
    <Card className="bg-neutral-800/50">
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <Label>Setting</Label>
          <Switch />
        </div>
      </CardContent>
    </Card>
  </div>
</div>

// After: Components
<PageContainer title="Title">
  <SectionStack>
    <SettingCard title="Section" variant="subtle">
      <SettingRow label="Setting">
        <Switch />
      </SettingRow>
    </SettingCard>
  </SectionStack>
</PageContainer>
```

---

## Migration Strategy

### Phase 1: Foundation Setup
1. Add design tokens to globals.css
2. Add utility classes to globals.css
3. Create component directories with index.tsx exports
4. Create core UI components (PageContainer, SettingCard, SettingRow, SectionStack)

### Phase 2: Structure Reorganization
1. Move pages to proper directory structure with index.tsx
2. Move components to domain-organized directories with index.tsx
3. Relocate types according to scoping rules
4. Update all imports to use index.tsx exports

### Phase 3: Page Migration
1. Settings pages (Workflow, Providers, Libraries, MediaPlayers)
2. Metadata pages (Movies, Actors, Series)
3. Activity pages (Dashboard, RunningJobs, History)

### Phase 4: Cleanup
1. Remove duplicate inline styles
2. Delete unused utility classes
3. Audit for remaining inconsistencies
4. Update documentation

---

## Implementation with Specialized Agents

### Agent Roles & Responsibilities

**1. Structure Agent** (foundation-builder)
- Create directory structure
- Create index.tsx exports
- Move and reorganize files
- Update imports

**2. Component Agent** (component-builder)
- Create UI components (PageContainer, SettingCard, etc.)
- Implement design tokens in globals.css
- Create utility classes in globals.css
- Write component types

**3. Migration Agent** (page-migrator)
- Convert pages to use new components
- Replace inline Tailwind with components
- Update page structure to match conventions
- Test after each page migration

**4. Type Agent** (type-organizer)
- Analyze type usage across codebase
- Move types according to scoping rules
- Create types/index.ts with re-exports
- Update imports

**5. Validation Agent** (quality-checker)
- Run type checks after changes
- Run builds after changes
- Verify no broken imports
- Check for remaining inline styles

### Parallel Execution Strategy

**Maximum Concurrency**: 6 agents (per user's hardware limit)

**Wave 1** (Parallel):
1. Structure Agent - Create directories
2. Component Agent - Build UI components + CSS

**Wave 2** (Parallel):
3. Type Agent - Reorganize types
4. Migration Agent (Settings) - Migrate settings pages
5. Migration Agent (Metadata) - Migrate metadata pages
6. Migration Agent (Activity) - Migrate activity pages

**Wave 3** (Sequential):
7. Validation Agent - Run all checks
8. Cleanup - Remove dead code

### Context Window Management

**Problem**: Large codebase (123 TSX files) exceeds context limits

**Solution**: Agent specialization with focused scope
- Each agent works on specific domains only
- Agents read only files they need to modify
- Structure Agent provides file map, other agents reference it
- No agent loads entire codebase

---

## Success Criteria

**Structure**:
- [ ] All components have directory + index.tsx export
- [ ] All pages have directory + index.tsx export
- [ ] All hooks have directory + index.ts export
- [ ] Types properly scoped (global vs component-specific)

**Styling**:
- [ ] Design tokens defined in globals.css
- [ ] Utility classes defined in globals.css
- [ ] Core UI components created (6 minimum)
- [ ] Zero inline `bg-neutral-800` or `border border-neutral-700`

**Migration**:
- [ ] All settings pages use new components
- [ ] All metadata pages use new components
- [ ] All activity pages use new components
- [ ] Consistent styling across all pages

**Quality**:
- [ ] TypeScript compiles without errors
- [ ] Frontend builds successfully
- [ ] All imports resolve correctly
- [ ] No broken UI in browser

---

## File Checklist

### To Create
- [ ] `components/ui/PageContainer/`
- [ ] `components/ui/SettingCard/`
- [ ] `components/ui/SettingRow/`
- [ ] `components/ui/SectionStack/`
- [ ] `components/ui/FormField/`
- [ ] `components/ui/CollapsibleSection/`

### To Reorganize
- [ ] Move pages to `pages/[section]/[Page]/` structure
- [ ] Move components to `components/[domain]/[Component]/` structure
- [ ] Move hooks to `hooks/[hookName]/` structure
- [ ] Relocate types per scoping rules

### To Update
- [ ] `globals.css` - Add tokens and utility classes
- [ ] All imports to use index.tsx exports
- [ ] Pages to use new components
- [ ] Remove inline Tailwind styling

---

## Next Steps

1. Review and approve this architecture
2. Begin Phase 1 with Structure + Component agents (parallel)
3. Execute Phase 2 with Type + Migration agents (parallel)
4. Run Validation agent
5. Update STYLING_GUIDELINES.md with new patterns
