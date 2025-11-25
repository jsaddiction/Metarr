# Frontend Styling Guide

**Purpose**: Comprehensive styling rules, design system principles, and component conventions for Metarr's frontend UI. Single source of truth for all styling decisions.

**Related Docs**:
- Parent: [Frontend Documentation](../INDEX.md#frontend)
- See also: [Components](COMPONENTS.md), [Pages](PAGES.md)

---

## Quick Reference

**Design Language**: Dark mode first, ultra-compact, high information density

**Framework Stack**:
- Tailwind CSS v4 with custom utility classes
- shadcn/ui components (pre-built, copy-paste)
- Custom design tokens (CSS variables via `@theme`)

**Color System**: Neutral grays + Violet primary + Semantic status colors

**Typography**: Inter font family, carefully sized for density

---

## Three-Layer System

The styling architecture operates as three integrated layers:

### Layer 1: Design Tokens (CSS Variables)

**Purpose**: Define reusable values for colors, spacing, typography

**Location**: `globals.css` in `@theme {}` and `:root` variables

**Examples**:
- Color tokens: `--color-neutral-400`, `--color-primary-500`
- Semantic variables: `--muted-foreground`, `--destructive`
- Spacing: Tailwind scale (3, 4, 6 = 12px, 16px, 24px)

**Rule**: All reusable values must be tokens. No magic numbers in components.

### Layer 2: Utility Classes (Tailwind + Custom)

**Purpose**: Compose tokens into reusable utilities

**Tailwind utilities** (built-in):
- Layout: `flex`, `grid`, `absolute`
- Spacing: `p-6`, `mb-4`, `space-y-3`
- Colors: `bg-neutral-800`, `text-primary-500`
- Effects: `hover:bg-neutral-700`, `transition-colors`

**Custom utilities** (defined in `@layer components`):
- Page-level: `.content-spacing`, `.page-container`
- Cards: `.card`, `.card-body`
- Sections: `.section-stack`, `.form-group`

**Rule**: Create utility class only if pattern appears 2+ times in codebase.

### Layer 3: Components (shadcn + Custom)

**Purpose**: Combine utilities into reusable UI components

**shadcn components** (use as-is):
- Card, Button, Input, Dialog, Switch, Label
- Already styled with proper utilities
- Customize via className when needed
- All use shadcn CSS variables (semantic colors)

**Custom components** (build when needed):
- PageContainer, SettingCard, EmptyState
- Compose from utilities + shadcn components
- Document usage in [Components.md](COMPONENTS.md)

**Rule**: Use existing components before creating custom styles. Ask: "Does this exist in shadcn?" first.

---

## shadcn + Tailwind Integration

### Understanding the Stack

**Tailwind CSS v4 (Foundation)**
- Utility-first framework providing base utilities
- Custom tokens in `@theme {}` block
- All utilities: `bg-neutral-800`, `text-sm`, `flex`, etc.

**shadcn/ui (Component Library)**
- Pre-built React components styled with Tailwind
- Uses HSL-based CSS variables for theming
- NOT a separate framework—just copy-paste components
- Provides: Card, Button, Input, Dialog, Switch, etc.

**Our Custom System (Metarr Design)**
- Custom CSS utilities in `@layer components {}`
- Custom design tokens in `@theme {}` (neutrals, primary violet)
- Reusable components using both Tailwind and shadcn

**Integration Flow**:
```
Tailwind Core → Our @theme tokens → shadcn CSS variables → shadcn components → Custom components → Pages
```

### Semantic vs Explicit Colors

**Semantic utilities** (from shadcn, HSL-based):
- Purpose: Text and secondary UI elements that should adapt to theme
- Properties: `text-foreground`, `text-muted-foreground`, `bg-card`, `border-border`
- Behavior: Change automatically with light/dark theme
- Use when: Text color, secondary elements, standard card backgrounds, standard borders

**Example semantic utilities**:
```
text-foreground          → Primary text (text-white in dark)
text-muted-foreground   → Secondary text (text-neutral-400 equivalent)
bg-card                 → Card backgrounds (bg-neutral-800 equivalent)
bg-muted                → Subtle backgrounds
border-border           → Standard borders (border-neutral-700 equivalent)
text-destructive        → Error/danger text (red)
```

**Explicit utilities** (from Tailwind, hex-based):
- Purpose: Structural elements needing specific colors, surfaces, opacity variants
- Properties: `bg-neutral-800`, `border-neutral-700`, `text-primary-500`
- Behavior: Fixed color, no theme switching
- Use when: Exact shade needed, opacity variations, surfaces, borders with specific shades

**Example explicit utilities**:
```
bg-neutral-800          → Card background (when specific shade matters)
bg-neutral-800/50       → Semi-transparent backgrounds (opacity variants)
border-neutral-700      → Card borders, dividers
border-neutral-700/50   → Subtle dividers
text-primary-500        → Primary brand color
```

### Decision Tree: When to Use Which

**For text/foreground colors**:
```
Is this secondary/descriptive text?
  → YES: Use text-muted-foreground
  → NO: Use text-foreground (primary) or text-primary-500 (brand)
```

**For background colors**:
```
Is this a standard card/container?
  → YES: Use bg-card (or bg-neutral-800 if you need opacity variant)
  → NO: Use bg-neutral-800/[amount] (specific shade + opacity)
```

**For borders**:
```
Is this a standard border?
  → YES: Use border-border
  → NO: Use border-neutral-700 (or border-neutral-700/50 for subtle)
```

**For status/semantic meaning**:
```
Does this indicate error, success, warning, info?
  → YES: Use text-destructive, text-success, text-warning, text-info
  → NO: Use explicit color from neutral or primary scale
```

### Common Color Equivalencies

**Understanding the mapping** (both render the same color in dark mode):

| Semantic | Explicit | Hex Color | Use Case |
|----------|----------|-----------|----------|
| `text-muted-foreground` | `text-neutral-400` | #a3a3a3 | Secondary text, descriptions |
| `text-foreground` | `text-white` | #ffffff | Primary text, headings |
| `bg-card` | `bg-neutral-800` | #262626 | Card backgrounds |
| `border-border` | `border-neutral-700` | #404040 | Card borders, dividers |
| `bg-muted` | `bg-neutral-800/50` | #262626 with opacity | Subtle backgrounds |

**The rule**: Prefer semantic for text/UI. Prefer explicit for structure/surfaces.

---

## Design Tokens

### Token System (CSS Variables)

**Location**: `globals.css` in `@theme {}` block and `:root`

**Tailwind tokens** (hex-based, explicit):
```css
@theme {
  --color-neutral-950: #0a0a0a;
  --color-neutral-900: #171717;
  --color-neutral-800: #262626;
  --color-neutral-700: #404040;
  --color-neutral-600: #525252;
  --color-neutral-500: #737373;
  --color-neutral-400: #a3a3a3;
  --color-neutral-300: #d4d4d4;
  --color-neutral-200: #e5e5e5;
  --color-neutral-100: #f5f5f5;
  --color-neutral-50:  #fafafa;

  --color-primary-950: #2e1065;
  --color-primary-900: #4c1d95;
  --color-primary-800: #5b21b6;
  --color-primary-700: #6d28d9;
  --color-primary-600: #7c3aed;
  --color-primary-500: #8b5cf6;
  --color-primary-400: #a78bfa;
  --color-primary-300: #c4b5fd;
  --color-primary-200: #ddd6fe;
  --color-primary-100: #ede9fe;
  --color-primary-50:  #f5f3ff;
}
```

**shadcn semantic variables** (HSL-based, in `:root` and `.dark`):
```css
:root {
  --foreground: 0 0% 3.6%;
  --muted: 0 0% 96.3%;
  --muted-foreground: 0 0% 45.1%;
  --card: 0 0% 100%;
  --card-foreground: 0 0% 3.6%;
  --destructive: 0 84% 60%;
  --border: 0 0% 89.8%;
  --input: 0 0% 89.8%;
  /* ... more variables ... */
}

.dark {
  --foreground: 0 0% 98%;
  --muted: 0 0% 14.9%;
  --muted-foreground: 0 0% 63.9%;
  --card: 0 0% 3.6%;
  --card-foreground: 0 0% 98%;
  /* ... more variables ... */
}
```

**Usage in code**:
```tsx
// Use Tailwind utilities (which reference tokens)
<div className="bg-neutral-800">           {/* References --color-neutral-800 */}
<p className="text-muted-foreground">      {/* References --muted-foreground */}
<button className="bg-primary-500">       {/* References --color-primary-500 */}
```

**Token principles**:
- All values defined once, used many times
- Colors use hex for explicit or HSL for semantic
- Spacing uses Tailwind scale (3, 4, 6, 8, etc.)
- No magic numbers in component code

---

## Utility Classes

### When to Create Custom Utilities

**DO create** a utility class if:
- Pattern repeats 2+ times across codebase
- Complex class combination that's hard to read inline
- Page-level or component-level consistent styling

**Examples of good custom utilities**:
```css
@layer components {
  .content-spacing {
    @apply pt-16;  /* Accounts for sticky header */
  }

  .page-container {
    @apply mx-auto max-w-7xl px-4;
  }

  .card {
    @apply bg-neutral-800 border border-neutral-700 rounded-xl;
  }

  .card-body {
    @apply p-6;
  }

  .section-stack {
    @apply space-y-6;
  }

  .form-group {
    @apply flex flex-col gap-2;
  }
}
```

**DON'T create** utility if:
- Used only once (inline class is fine)
- Tailwind class already exists
- Better expressed as component

**Naming conventions**:
- Use kebab-case: `.card-body`, `.section-stack`
- Prefix component utilities: `.modal-header`, `.button-group`
- No color codes in names: avoid `.bg-800-card`, use `.card`

---

## Color System

### Neutral Grays (Foundation)

**Purpose**: Background layers, text hierarchy, borders

```
neutral-950  #0a0a0a  Darkest backgrounds, max contrast
neutral-900  #171717  Page background
neutral-800  #262626  Card backgrounds, inputs
neutral-700  #404040  Borders, dividers
neutral-600  #525252  Hover states, medium surfaces
neutral-500  #737373  Disabled text, tertiary
neutral-400  #a3a3a3  Secondary text, placeholders (≈ text-muted-foreground)
neutral-300  #d4d4d4  Tertiary text, light text
neutral-200  #e5e5e5  Light borders
neutral-100  #f5f5f5  Very light backgrounds
neutral-50   #fafafa  Lightest backgrounds
```

**Usage**:
- **Backgrounds**: `bg-neutral-900`, `bg-neutral-800`, `bg-neutral-700`
- **Text**: `text-neutral-400` (secondary), `text-neutral-300` (tertiary)
- **Borders**: `border-neutral-700` (standard), `border-neutral-600` (hover)
- **Dividers**: `border-neutral-700/50` (subtle)

### Primary Color (Violet)

**Purpose**: Brand identity, primary actions, links, accents

```
primary-950  #2e1065  Darkest shade
primary-900  #4c1d95
primary-800  #5b21b6
primary-700  #6d28d9
primary-600  #7c3aed
primary-500  #8b5cf6  Main brand color ← USE FOR BUTTONS
primary-400  #a78bfa
primary-300  #c4b5fd  Links, accents
primary-200  #ddd6fe
primary-100  #ede9fe
primary-50   #f5f3ff  Lightest purple
```

**Usage**:
- **Buttons**: `bg-primary-500`, `hover:bg-primary-600`
- **Links**: `text-primary-300`, `hover:text-primary-200`
- **Accents**: `border-primary-500`, `text-primary-500`
- **Hover**: Switch from `-500` to `-600`

### Semantic Status Colors

**Purpose**: Convey meaning (success, warning, error, info)

```
success  #22c55e  Green - successful operations, valid states
warning  #f97316  Orange - warnings, caution needed
error    #ef4444  Red - errors, failures, invalid states
info     #3b82f6  Blue - informational messages, highlights
```

**Usage**:
- **Status indicators**: `<span className="text-success">Active</span>`
- **Validation rings**: `ring-error`, `ring-success`
- **Alerts**: `className="text-destructive"` (error) from shadcn
- **Icons**: `text-warning`, `text-success`

### Color Selection Rules

**For text**:
- Primary text: `text-white` or `text-foreground`
- Secondary text: `text-muted-foreground` (prefer) or `text-neutral-400`
- Tertiary text: `text-neutral-500`
- Disabled text: `text-neutral-500`

**For backgrounds**:
- Page background: `bg-neutral-900`
- Card backgrounds: `bg-card` (semantic) or `bg-neutral-800` (explicit)
- Semi-transparent: `bg-neutral-800/50`, `bg-neutral-800/30`
- Hover state: `hover:bg-neutral-800/30`, `hover:bg-neutral-600`

**For borders**:
- Standard borders: `border-border` (semantic) or `border-neutral-700` (explicit)
- Subtle dividers: `border-neutral-700/50`
- Focus states: `ring-primary-500`, `border-primary-500`

---

## Spacing System

### Spacing Scale

**Tailwind scale** (base unit: 4px):
```
space-y-3   12px   Compact lists, provider cards
space-y-4   16px   Form sections, moderate spacing
space-y-6   24px   Major sections, card spacing
p-3         12px   Compact card padding
p-6         24px   Standard card padding
m-6         24px   Margins (headers, section bottom)
```

**Section-level spacing**:
```
section-stack    space-y-6   Cards/sections with 24px gap
page-container   max-w-7xl   Responsive page width
content-spacing  pt-16       Accounts for sticky header (64px offset)
```

### Page Layout Structure

**Standard page structure**:
```
content-spacing (pt-16 for sticky header offset)
  ├─ Page header (mb-6)
  │  ├─ h1 title
  │  └─ p subtitle (text-neutral-400)
  └─ Main content (space-y-6)
     ├─ Card (space-y-6 inside)
     ├─ Card (space-y-6 inside)
     └─ Card (space-y-6 inside)
```

**Spacing inside cards**:
- `CardContent className="space-y-6"` – Major sections (24px)
- `<div className="space-y-3">` – Compact lists (12px)
- `<div className="space-y-4">` – Form groups (16px)

**Form group spacing**:
```
<div className="space-y-4">
  <div>
    <Label>Field 1</Label>
    <Input />
  </div>
  <div>
    <Label>Field 2</Label>
    <Input />
  </div>
</div>
```

---

## Typography

### Heading Hierarchy

**Heading sizes and weights**:
```
<h1 className="text-2xl font-semibold text-white">             Page Title
<h2 className="text-xl font-semibold text-white">              Section Title
<h3 className="text-lg font-semibold text-white">              Subsection
<h4 className="text-base font-medium text-neutral-200">       Card Title
<p className="text-sm font-normal text-neutral-400">          Body text, descriptions
<span className="text-xs font-normal text-neutral-500">       Helper text, hints
```

### Font Weights

- **font-semibold** (600) – Page titles, main section headings
- **font-medium** (500) – Card titles, labels, emphasized text
- **font-normal** (400) – Body text, descriptions, helper text

### Text Sizes and Usage

```
text-2xl (1.5rem)  Page titles, large headings
text-xl (1.25rem)  Section titles
text-lg (1.125rem) Subsection titles
text-base (1rem)   Card titles, regular emphasis
text-sm (0.875rem) Body text, descriptions (MOST COMMON)
text-xs (0.75rem)  Labels, helper text, compact UI
```

**Common combinations**:
```
Page title:       text-2xl font-semibold text-white
Section title:    text-xl font-semibold text-white
Card title:       text-base font-medium text-neutral-200
Description:      text-sm text-neutral-400
Label:            text-xs font-medium text-neutral-400
Helper text:      text-xs text-neutral-500
```

### Font Family

**Font**: Inter (sans-serif)

**Application**: Applied globally in `globals.css`, no need to specify per component

---

## Component Styling

### Using Utilities First

**Philosophy**: Build from utilities before reaching for components

**Utility-first approach**:
```tsx
// ✅ Good: Clear, composable, easy to modify
<div className="flex items-center justify-between p-6 bg-neutral-800 rounded-xl border border-neutral-700">
  <h3 className="text-lg font-semibold text-white">Title</h3>
  <Switch />
</div>

// ❌ Avoid: Creates component for single use
const MyCard = ({ children }) => {
  return <div className="...">{children}</div>;
};
```

**When to extract to component**:
- Appears 3+ times in codebase
- Complex conditional logic
- Consistent behavior across uses
- Benefits from reusable props

### shadcn Component Guidelines

**Using shadcn components**:
```tsx
// ✅ Use shadcn as-is
<Card className="bg-neutral-800/50">
  <CardHeader>
    <CardTitle>Section Title</CardTitle>
    <CardDescription>Subtitle</CardDescription>
  </CardHeader>
  <CardContent className="space-y-6">
    {/* Content with 24px spacing */}
  </CardContent>
</Card>

// ✅ Add custom className when needed
<Button className="bg-primary-500 hover:bg-primary-600">Save</Button>

// ❌ Don't override core structure
<Card className="bg-neutral-900">...</Card>  // shadcn expects bg-card
```

**Common shadcn components**:
- `Card` – Container with header, content, footer sections
- `Button` – Action buttons with variants (primary, outline, ghost, destructive)
- `Input` – Text input fields
- `Label` – Form labels (paired with inputs)
- `Switch` – Toggle switches
- `Dialog` – Modal dialogs
- `Alert` – Message alerts
- `Select` – Dropdown menus

**Customization approach**:
1. Use component as-is if it fits
2. Add className for color/size overrides
3. Only create custom component if shadcn doesn't exist

### Custom Component Pattern

**Structure for custom components**:
```tsx
// Use utilities for layout and colors
// Use shadcn components where available
// Combine into reusable pattern

const SettingCard = ({ title, description, children }) => {
  return (
    <div className="card">
      <div className="card-body space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-base font-medium text-neutral-200">{title}</h4>
            <p className="text-sm text-neutral-400 mt-1">{description}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
};
```

---

## Best Practices

### DO (✅ Recommended)

- **Use semantic colors for text**: `text-muted-foreground` instead of `text-neutral-400`
- **Use explicit colors for structure**: `bg-neutral-800`, `border-neutral-700`
- **Apply `bg-neutral-800/50`** for prominent cards (workflow settings)
- **Apply `bg-neutral-800`** for standard cards (provider cards)
- **Use `space-y-3`** for compact lists, `space-y-6` for major sections
- **Use `h-8`** inputs in compact layouts, `h-10` in standard forms
- **Use `text-sm`** for most body text, `text-xs` for labels/hints
- **Add emojis** to card titles for visual hierarchy (✨ 📤 ⚙️ 🔔)
- **Use `transition-colors`** for all interactive hover states
- **Apply `content-spacing`** to page root for sticky header offset
- **Keep utility classes DRY**: Extract if repeating 2+ times
- **Document patterns**: Note unusual color or spacing choices

### DON'T (❌ Avoid)

- **Don't mix card background styles** on same page (pick one: `/50` or solid)
- **Don't use custom spacing** outside Tailwind scale (3, 4, 6)
- **Don't use `h-12` or larger** inputs (too tall for dense UI)
- **Don't overuse borders** (prefer subtle `border-neutral-700/50` dividers)
- **Don't skip hover states** on interactive elements
- **Don't use tabs** when cards can show all content
- **Don't use `text-base`** for body text (use `text-sm`)
- **Don't hardcode colors** (always use tokens)
- **Don't mix semantic and explicit** needlessly (pick one per rule)
- **Don't create inline styles** (always use classes)
- **Don't duplicate utility patterns** (extract to utility class at 2+ uses)

---

## Common Patterns

### Standard Page Structure

**Pattern for workflow/settings pages**:
```
content-spacing (pt-16 offset)
  Page header (mb-6)
    h1 title
    p subtitle
  Main content (space-y-6)
    Multiple Cards with bg-neutral-800/50
```

**Pattern for compact lists** (provider cards):
```
space-y-3 container
  Multiple .card elements
    .card-body with internal space-y-3
```

### Provider Card Pattern

**Ultra-compact card with title, inputs, and footer**:
```
.card (bg-neutral-800, border-neutral-700)
  .card-body (p-6)
    Header row: title + icon + switch
    Content: compact inputs (h-8)
    Footer: divider + stats
```

### Workflow Card Pattern

**Spacious settings card with sections**:
```
Card (bg-neutral-800/50)
  CardHeader
    CardTitle + emoji
    CardDescription
  CardContent (space-y-6)
    Multiple setting rows (flex items-center justify-between)
    Each row with label + input/switch
```

### Form Group Pattern

**Related fields grouped with spacing**:
```
space-y-4 container
  Label
  Input
  Helper text (if needed)

(repeat 2-3 times)
```

### Validation and Status Pattern

**Input with validation state**:
```
Invalid:  ring-2 ring-red-500 + border-red-500
Valid:    ring-2 ring-green-500 + border-green-500
Focused:  ring-1 ring-primary-500
```

---

## Color Decision Matrix

**Quick reference for common scenarios**:

| Element | Situation | Color Class |
|---------|-----------|-------------|
| **Text** | Primary heading | `text-white` or `text-foreground` |
| **Text** | Description/secondary | `text-muted-foreground` (prefer) or `text-neutral-400` |
| **Text** | Disabled/tertiary | `text-neutral-500` |
| **Text** | Brand action/link | `text-primary-500` |
| **Text** | Error message | `text-destructive` |
| **Text** | Success message | `text-success` |
| **Background** | Page | `bg-neutral-900` |
| **Background** | Card standard | `bg-card` or `bg-neutral-800` |
| **Background** | Card prominent | `bg-neutral-800/50` |
| **Background** | Nested/layer | `bg-neutral-700` |
| **Background** | Hover state | `hover:bg-neutral-700` or `hover:bg-neutral-800/30` |
| **Background** | Disabled | `bg-neutral-800/50` |
| **Border** | Standard | `border-border` or `border-neutral-700` |
| **Border** | Subtle divider | `border-neutral-700/50` |
| **Border** | Focused/active | `border-primary-500` |
| **Ring** | Focus | `ring-primary-500` |
| **Ring** | Error | `ring-red-500` |
| **Ring** | Success | `ring-green-500` |

---

## Related Documentation

**Component Patterns**: [Components](COMPONENTS.md) - Reusable component examples

**Page Templates**: [Pages](PAGES.md) - Full page layout examples

**Configuration**: [Tailwind Config](../../public/frontend/tailwind.config.js) - Custom theme and token definitions

**Global Styles**: [Global CSS](../../public/frontend/src/styles/globals.css) - Utility class definitions and CSS variables

**Frontend Overview**: [Frontend Docs](../frontend/README.md) - Architecture and structure

---

## Document History

- **Consolidated from**: STYLING_GUIDELINES.md + TAILWIND_SHADCN_INTEGRATION.md
- **Purpose**: Single authoritative guide replacing two separate documents
- **Last updated**: 2025-11-25
