# UI Standards

**Purpose**: Design system and component patterns for Metarr frontend.

**Stack**: React + TypeScript + Tailwind CSS v4 + shadcn/ui

---

## Design System

### Colors
**Primary**: Violet (#8b5cf6)
**Semantic**: Green (success), Amber (warning), Red (error), Blue (info)
**Theme**: Dark mode first

### Typography
**Font**: Inter (sans-serif), Fira Code (monospace)
**Scale**: xs (12px) → sm (14px) → base (16px) → lg (18px) → xl (20px) → 2xl (24px)

### Spacing
**Scale**: 0.25rem (4px) increments
**Common**: space-2, space-4, space-6, space-8

---

## Component Standards

### Layout Pattern
```tsx
<div className="flex h-screen bg-background">
  <aside className="w-64 border-r">
    <Sidebar />
  </aside>
  <main className="flex-1 overflow-y-auto">
    <header className="border-b">
      <Header />
    </header>
    <div className="container mx-auto p-6">
      {children}
    </div>
  </main>
</div>
```

### Page Structure
```tsx
<div className="space-y-6">
  <div>
    <h1 className="text-3xl font-bold">Title</h1>
    <p className="text-muted-foreground">Description</p>
  </div>
  <div className="grid gap-6">
    {content}
  </div>
</div>
```

### Cards
Use shadcn/ui Card:
```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>
    Content
  </CardContent>
</Card>
```

### Tabs
Use custom AnimatedTabs (violet sliding indicator):
```tsx
import { AnimatedTabs, AnimatedTabsContent } from '@/components/ui/AnimatedTabs';

<AnimatedTabs
  tabs={[
    { value: 'one', label: 'Tab 1' },
    { value: 'two', label: 'Tab 2' },
  ]}
  activeTab={tab}
  onChange={setTab}
/>
<AnimatedTabsContent value="one">Content 1</AnimatedTabsContent>
<AnimatedTabsContent value="two">Content 2</AnimatedTabsContent>
```

### Buttons
```tsx
// Primary
<button className="bg-primary-500 text-white px-4 py-2 rounded-md hover:bg-primary-600">
  Primary
</button>

// Secondary
<button className="border border-border bg-background px-4 py-2 rounded-md hover:bg-muted">
  Secondary
</button>

// Danger
<button className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600">
  Delete
</button>
```

### Forms
```tsx
<div className="space-y-2">
  <label className="text-sm font-medium">Label</label>
  <input
    type="text"
    className="w-full rounded-md border border-input bg-background px-3 py-2
               focus:outline-none focus:ring-2 focus:ring-primary-500"
  />
  <p className="text-xs text-muted-foreground">Helper text</p>
</div>
```

---

## State Patterns

### Loading
```tsx
{isLoading && (
  <div className="flex justify-center p-8">
    <div className="h-8 w-8 border-2 border-primary-500 border-t-transparent
                    rounded-full animate-spin" />
  </div>
)}
```

### Error
```tsx
{error && (
  <div className="rounded-md bg-red-50 p-4">
    <div className="flex">
      <ExclamationIcon className="h-5 w-5 text-red-400" />
      <div className="ml-3">
        <h3 className="text-sm font-medium text-red-800">Error</h3>
        <p className="text-sm text-red-700">{error.message}</p>
      </div>
    </div>
  </div>
)}
```

### Empty
```tsx
<div className="text-center py-12">
  <Icon className="mx-auto h-12 w-12 text-gray-400" />
  <h3 className="mt-2 text-sm font-semibold">No items found</h3>
  <p className="text-sm text-muted-foreground">Description</p>
  <button className="mt-6 btn-primary">Action</button>
</div>
```

### Status Badges
```tsx
// Success
<span className="inline-flex items-center rounded-full bg-green-100
                 px-2.5 py-0.5 text-xs font-medium text-green-800">
  Completed
</span>

// Warning
<span className="inline-flex items-center rounded-full bg-amber-100
                 px-2.5 py-0.5 text-xs font-medium text-amber-800">
  Processing
</span>

// Error
<span className="inline-flex items-center rounded-full bg-red-100
                 px-2.5 py-0.5 text-xs font-medium text-red-800">
  Failed
</span>
```

### Warning Boxes / Alert Panels
**Standard**: Neutral background with colored icon/title only (no tinted backgrounds)

```tsx
// Using shadcn/ui Alert component
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';

<Alert variant="warning">
  <FontAwesomeIcon icon={faExclamationTriangle} />
  <AlertTitle>Warning Title</AlertTitle>
  <AlertDescription>
    Description of the warning condition.
  </AlertDescription>
</Alert>

// Manual implementation
<div className="border border-neutral-700 bg-neutral-800 rounded-lg p-6">
  <div className="flex items-start gap-4">
    <FontAwesomeIcon
      icon={faExclamationTriangle}
      className="text-yellow-500 text-2xl flex-shrink-0"
    />
    <div>
      <h3 className="text-xl font-semibold text-yellow-500 mb-2">
        Warning Title
      </h3>
      <p className="text-base text-neutral-300">
        Warning description text.
      </p>
    </div>
  </div>
</div>
```

**Key Principles**:
- ✅ Background: `bg-neutral-800` (dark mode) / `bg-neutral-50` (light mode)
- ✅ Border: `border-neutral-700` (neutral, not warning color)
- ✅ Icon: `text-yellow-500` (orange warning color)
- ✅ Title: `text-yellow-500` (matches icon)
- ✅ Body text: `text-neutral-300` (standard text color)
- ❌ Avoid: Tinted backgrounds like `bg-yellow-500/10` or `bg-orange-50`

**Rationale**: Colored backgrounds can be visually overwhelming, especially in light mode. Using neutral backgrounds with colored text/icons provides sufficient warning indication without dominating the interface.

---

## Responsive Design

### Breakpoints
```
sm:  640px  (tablets)
md:  768px  (small laptops)
lg:  1024px (desktops)
xl:  1280px (large screens)
2xl: 1536px (extra large)
```

### Mobile-First Approach
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* 1 column mobile, 2 tablet, 3 desktop */}
</div>
```

---

## Accessibility

### Requirements
- Keyboard navigation for all interactive elements
- ARIA labels for icon-only buttons
- Min contrast ratio: 4.5:1
- Visible focus indicators
- Screen reader announcements for dynamic content

### Implementation
```tsx
<button
  aria-label="Lock field"
  title="Prevent automatic updates"
  className="focus:outline-none focus:ring-2 focus:ring-primary-500"
>
  <LockIcon aria-hidden="true" />
</button>
```

---

## Animation Guidelines

### Standard Transitions
```css
transition-colors   /* Color changes (200ms) */
transition-opacity  /* Fade (300ms) */
transition-transform /* Scale/rotate (200ms) */
```

### Usage
```tsx
<div className="transition-colors duration-200 hover:bg-primary-50" />
<div className="transition-opacity duration-300 opacity-0 data-[show=true]:opacity-100" />
<div className="transition-transform duration-200 hover:scale-105" />
```

---

## Component Library

### shadcn/ui Components
**Use for**: Card, Dialog, DropdownMenu, Select, Checkbox, RadioGroup

### Custom Components
**AnimatedTabs**: Unique violet indicator (brand identity)

### When to Create Custom
- Unique brand requirements
- Complex interaction patterns
- Performance optimization needed

---

See [Frontend README](./README.md) for architecture overview.
