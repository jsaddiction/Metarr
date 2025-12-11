# Frontend Documentation

**Purpose**: Complete guide to Metarr's React frontend - architecture, components, styling, and development guidelines.

**For**: Developers (human and AI) building or maintaining the Metarr frontend.

---

## Quick Start

**New to the codebase?** Start here:
1. [Architecture Overview](#architecture) - Understand the tech stack
2. [Component Guidelines](#components) - Learn when/how to create components
3. [Styling System](#styling) - Master the design system

**Need to find something?**
- **"Where do I put this component?"** → [Component Guidelines](COMPONENT_GUIDELINES.md#file-organization)
- **"Does a component exist for X?"** → [Component Reference](COMPONENT_REFERENCE.md)
- **"How do I style this?"** → [Styling Guide](STYLING_GUIDE.md)
- **"How do I fetch data?"** → [State Management](STATE_MANAGEMENT.md)

---

## Documentation Structure

### Core Documentation (Read First)

| Document | Purpose | When to Read |
|----------|---------|--------------|
| **[Component Guidelines](COMPONENT_GUIDELINES.md)** | When to create components, file organization, composition patterns | Before creating ANY component |
| **[Component Reference](COMPONENT_REFERENCE.md)** | Complete inventory of all custom components | Before creating a new component (avoid duplication) |
| **[Styling Guide](STYLING_GUIDE.md)** | Design tokens, shadcn integration, utility classes | Before writing any styles |
| **[Architecture](ARCHITECTURE.md)** | Tech stack, build system, data flow | Understanding the big picture |

### Specialized Documentation

| Document | Purpose | When to Read |
|----------|---------|--------------|
| **[State Management](STATE_MANAGEMENT.md)** | TanStack Query, WebSocket, caching | Working with server state |
| **[API Layer](API_LAYER.md)** | API client, request handling, error management | Adding API calls |
| **[Error Handling](ERROR_HANDLING.md)** | Error boundaries, user feedback, recovery | Implementing error states |

---

## Architecture

### Technology Stack

**Core**:
- **React 18** - Functional components with hooks
- **TypeScript 5** - Strict typing, no `any`
- **Vite 5** - Fast dev server and optimized builds

**Styling**:
- **Tailwind CSS v4** - Utility-first styling
- **shadcn/ui** - Pre-built component primitives
- **Custom Components** - Domain-specific reusable components

**State Management**:
- **TanStack Query** - Server state (API data, caching)
- **React Hooks** - Local UI state (useState, useReducer)
- **WebSocket** - Real-time updates

**Key Principles**:
1. **Component-Based** - Reusable components when patterns appear 2+ times
2. **Type-Safe** - Full TypeScript coverage, strict mode
3. **DRY** - Single source of truth for styles, logic, and data
4. **Industry Standards** - Follow React, TypeScript, and Tailwind best practices

See [Architecture](ARCHITECTURE.md) for complete details.

---

## Components

### Component Hierarchy

```
shadcn/ui primitives (Button, Card, Input)
    ↓
Custom UI components (PageContainer, SettingCard, EmptyState)
    ↓
Domain components (MovieCard, ProviderCard, LibraryCard)
    ↓
Pages (Dashboard, Movies, Settings)
```

### When to Create a Component

**Create a new component when**:
1. **Pattern appears 2+ times** - Eliminate duplication
2. **Component exceeds 200 lines** - Break into smaller pieces
3. **Logic is reusable** - Extract for use elsewhere

**DO NOT create a component when**:
1. **Used only once** - Keep inline unless complex
2. **Tightly coupled to parent** - Keep as local implementation
3. **Already exists** - Check [Component Reference](COMPONENT_REFERENCE.md) first!

### Before Creating a Component

**Checklist**:
- [ ] Search [Component Reference](COMPONENT_REFERENCE.md) - does it already exist?
- [ ] Check if existing component can be extended/modified
- [ ] Verify pattern appears 2+ times (or is complex enough to warrant extraction)
- [ ] Read [Component Guidelines](COMPONENT_GUIDELINES.md) for structure

See [Component Guidelines](COMPONENT_GUIDELINES.md) for complete rules.

---

## Styling

### System Overview

**Three Layers**:
1. **Design Tokens** - CSS variables (`--color-primary-500`, `--spacing-card`)
2. **Utility Classes** - Semantic classes (`.section-header-title`, `.text-muted`)
3. **Components** - Reusable components (PageContainer, SettingCard)

**Key Concepts**:
- **shadcn Semantics** - Use `text-muted-foreground`, `bg-card` for theme-aware colors
- **Explicit Colors** - Use `bg-neutral-800`, `border-neutral-700` for structural elements
- **No Inline Tailwind** - Use utility classes and components (DRY principle)

### Quick Reference

**Text Colors**:
- Primary text: `text-foreground`
- Secondary text: `text-muted-foreground`
- Explicit gray: `text-neutral-400` (when semantic doesn't fit)

**Surfaces**:
- Page background: `bg-background`
- Card background: `bg-card` or `bg-neutral-800`
- Elevated surface: `bg-neutral-800/50`

**Spacing**:
- Section spacing: `section-stack` (space-y-6)
- Compact spacing: `section-stack-compact` (space-y-3)
- Page padding: `page-container` (pt-16 pb-24)

See [Styling Guide](STYLING_GUIDE.md) for complete patterns.

---

## Common Tasks

### Adding a New Page

1. **Check routing** - Ensure route exists in `App.tsx`
2. **Use PageContainer** - Wrap page with `<PageContainer title="..." subtitle="...">`
3. **Follow patterns** - Use SectionStack, SettingCard, DataCard as appropriate
4. **Apply utility classes** - Use semantic colors, spacing utilities

**Example**:
```tsx
import { PageContainer } from '@/components/ui/PageContainer';
import { SectionStack } from '@/components/ui/SectionStack';

export const MyPage = () => (
  <PageContainer title="My Page" subtitle="Page description">
    <SectionStack>
      {/* Page content */}
    </SectionStack>
  </PageContainer>
);
```

### Adding a New Feature

1. **Plan component structure** - Identify reusable vs. feature-specific components
2. **Check existing components** - Review [Component Reference](COMPONENT_REFERENCE.md)
3. **Create types first** - Define TypeScript interfaces
4. **Implement incrementally** - Build, test, refine
5. **Update documentation** - Add to Component Reference if reusable

### Styling a Component

1. **Use existing components** - Check if PageContainer, SettingCard, etc. fit
2. **Apply utility classes** - Use `section-header-title`, `text-muted-foreground`, etc.
3. **Use shadcn semantics** - Prefer semantic colors over explicit
4. **Create utility if 2+ uses** - Add to `globals.css` @layer components
5. **Create component if 2+ uses** - Extract to `components/ui/`

---

## Development Workflow

### Making Changes

1. **Read relevant docs** - Review Component/Styling guides
2. **Check existing patterns** - Avoid reinventing the wheel
3. **Follow file organization** - Place files in correct directories
4. **Type everything** - No `any` types
5. **Test incrementally** - Verify TypeScript and build after changes

### Code Review Checklist

- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] ESLint passes (`npm run lint`)
- [ ] Frontend builds (`npm run build:frontend`)
- [ ] No new code duplication (DRY)
- [ ] Consistent with styling guide
- [ ] Documentation updated if needed

---

## AI Agent Guidelines

**For AI assistants working on this codebase:**

### Before Creating Components

1. **ALWAYS read** [Component Reference](COMPONENT_REFERENCE.md) first
2. **Check if component exists** - Search for similar patterns
3. **Consider extending existing** - Can we modify an existing component?
4. **Follow 2+ rule** - Only create if pattern appears twice or is very complex

### Component Creation Process

1. **Read** [Component Guidelines](COMPONENT_GUIDELINES.md) - File structure, naming
2. **Create directory** - `components/[domain]/[ComponentName]/`
3. **Create files** - `index.tsx`, `ComponentName.tsx`, `types.ts`
4. **Update reference** - Add to [Component Reference](COMPONENT_REFERENCE.md)

### Styling Guidelines

1. **Read** [Styling Guide](STYLING_GUIDE.md) first
2. **Use shadcn semantics** - `text-muted-foreground`, `bg-card`, etc.
3. **Use existing utilities** - Check globals.css @layer components
4. **Create utility if 2+ uses** - Add to globals.css with clear comment

### Documentation Updates

**When to update**:
- New component created → Update Component Reference
- Styling pattern changed → Update Styling Guide
- Architecture changed → Update Architecture doc
- New guideline established → Update relevant doc

---

## Troubleshooting

### "Where should I put this component?"

**Decision Tree**:
1. **Is it reusable across domains?** → `components/ui/`
2. **Is it domain-specific?** → `components/[domain]/`
3. **Is it page-specific and not reusable?** → Keep inline in page

### "How do I style this?"

**Decision Tree**:
1. **Does a component exist?** → Use it ([Component Reference](COMPONENT_REFERENCE.md))
2. **Is there a utility class?** → Use it (check globals.css)
3. **Do I need this 2+ times?** → Create utility or component
4. **One-time use?** → Use Tailwind utilities inline

### "Build is failing"

**Checklist**:
1. Run `npm run typecheck` - Fix TypeScript errors
2. Run `npm run lint` - Fix ESLint errors
3. Check imports - Ensure all imports resolve correctly
4. Check component structure - Verify barrel exports (index.tsx)

---

## Contributing

### Documentation Standards

1. **DRY Principle** - Link to other docs, don't duplicate
2. **Guidelines, Not Examples** - Explain rules, not implementations
3. **Clear Navigation** - Use tables, links, decision trees
4. **AI-Friendly** - Write for both humans and AI agents

### Adding New Documentation

1. **Check if doc exists** - Avoid duplication
2. **Update README** - Add to relevant table
3. **Follow structure** - Purpose, Quick Reference, Content, Related Docs
4. **Link bidirectionally** - Update related docs to link back

---

## Related Documentation

- **[Project Root README](../../README.md)** - Project overview
- **[Development Workflow](../development/WORKFLOW.md)** - Git, commits, testing
- **[Backend Architecture](../architecture/)** - Server-side documentation
