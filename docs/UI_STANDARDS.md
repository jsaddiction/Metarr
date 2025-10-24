# UI Standards

**Purpose**: Frontend design system, component patterns, and visual standards for Metarr.

**Stack**: React + TypeScript + Tailwind CSS v4 + shadcn/ui

## Design System

### Color Palette

**Primary Color: Violet**
```css
/* Tailwind violet scale */
--primary-50:  #f5f3ff;
--primary-100: #ede9fe;
--primary-200: #ddd6fe;
--primary-300: #c4b5fd;
--primary-400: #a78bfa;
--primary-500: #8b5cf6;  /* Main brand color */
--primary-600: #7c3aed;
--primary-700: #6d28d9;
--primary-800: #5b21b6;
--primary-900: #4c1d95;
```

**Semantic Colors**
```css
--success: #10b981;  /* green-500 */
--warning: #f59e0b;  /* amber-500 */
--error:   #ef4444;  /* red-500 */
--info:    #3b82f6;  /* blue-500 */
```

**Neutral Palette**
```css
/* Light mode */
--background: #ffffff;
--foreground: #020817;
--muted:      #f1f5f9;
--border:     #e2e8f0;

/* Dark mode */
--background: #020817;
--foreground: #f8fafc;
--muted:      #1e293b;
--border:     #334155;
```

### Typography

```css
/* Font families */
--font-sans: 'Inter', system-ui, sans-serif;
--font-mono: 'Fira Code', 'Cascadia Code', monospace;

/* Font sizes */
--text-xs:   0.75rem;   /* 12px */
--text-sm:   0.875rem;  /* 14px */
--text-base: 1rem;      /* 16px */
--text-lg:   1.125rem;  /* 18px */
--text-xl:   1.25rem;   /* 20px */
--text-2xl:  1.5rem;    /* 24px */
--text-3xl:  1.875rem;  /* 30px */

/* Font weights */
--font-normal:   400;
--font-medium:   500;
--font-semibold: 600;
--font-bold:     700;
```

### Spacing

```css
/* Standard spacing scale */
--space-0:   0;
--space-1:   0.25rem;  /* 4px */
--space-2:   0.5rem;   /* 8px */
--space-3:   0.75rem;  /* 12px */
--space-4:   1rem;     /* 16px */
--space-6:   1.5rem;   /* 24px */
--space-8:   2rem;     /* 32px */
--space-12:  3rem;     /* 48px */
--space-16:  4rem;     /* 64px */
```

## Component Standards

### Layout Components

**Main Layout**
```tsx
<div className="flex h-screen bg-background">
  {/* Sidebar */}
  <aside className="w-64 border-r border-border bg-muted/10">
    <Sidebar />
  </aside>

  {/* Main content */}
  <main className="flex-1 overflow-y-auto">
    {/* Header */}
    <header className="border-b border-border bg-background">
      <Header />
    </header>

    {/* Page content */}
    <div className="container mx-auto p-6">
      {children}
    </div>
  </main>
</div>
```

**Page Container**
```tsx
<div className="space-y-6">
  {/* Page title */}
  <div>
    <h1 className="text-3xl font-bold">Page Title</h1>
    <p className="text-muted-foreground">Page description</p>
  </div>

  {/* Content */}
  <div className="grid gap-6">
    {content}
  </div>
</div>
```

### Cards

**Use shadcn/ui Card components**
```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle className="text-primary-500">
      Card Title
    </CardTitle>
  </CardHeader>
  <CardContent>
    Card content goes here
  </CardContent>
</Card>
```

### Tabs

**Use custom AnimatedTabs component**
```tsx
import { AnimatedTabs } from '@/components/ui/AnimatedTabs';

<AnimatedTabs
  tabs={[
    { id: 'overview', label: 'Overview' },
    { id: 'metadata', label: 'Metadata' },
    { id: 'assets', label: 'Assets' }
  ]}
  activeTab={activeTab}
  onChange={setActiveTab}
/>
```

**Why custom tabs?**
- Unique sliding violet indicator animation
- Consistent with Metarr brand identity
- Simple maintenance (100 lines of code)

### Forms

**Input Fields**
```tsx
<div className="space-y-2">
  <label className="text-sm font-medium">
    Field Label
  </label>
  <input
    type="text"
    className="w-full rounded-md border border-input bg-background px-3 py-2
               text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
  />
  <p className="text-xs text-muted-foreground">
    Helper text
  </p>
</div>
```

**Buttons**
```tsx
// Primary button
<button className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium
                   text-white hover:bg-primary-600 focus:outline-none
                   focus:ring-2 focus:ring-primary-500">
  Primary Action
</button>

// Secondary button
<button className="rounded-md border border-border bg-background px-4 py-2
                   text-sm font-medium hover:bg-muted focus:outline-none
                   focus:ring-2 focus:ring-primary-500">
  Secondary Action
</button>

// Danger button
<button className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium
                   text-white hover:bg-red-600">
  Delete
</button>
```

### Tables

**Movie/Show Tables**
```tsx
<div className="rounded-lg border border-border">
  <table className="w-full">
    <thead className="border-b bg-muted/50">
      <tr>
        <th className="px-4 py-3 text-left text-sm font-medium">Title</th>
        <th className="px-4 py-3 text-left text-sm font-medium">Year</th>
        <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
      </tr>
    </thead>
    <tbody>
      <tr className="border-b hover:bg-muted/30">
        <td className="px-4 py-3">{movie.title}</td>
        <td className="px-4 py-3">{movie.year}</td>
        <td className="px-4 py-3">
          <StatusBadge status={movie.status} />
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### Status Indicators

**Badges**
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

**Progress Bars**
```tsx
<div className="w-full bg-gray-200 rounded-full h-2">
  <div className="bg-primary-500 h-2 rounded-full transition-all duration-300"
       style={{ width: `${progress}%` }} />
</div>
```

### Icons

**Lock Icons for Field Locking**
```tsx
// Locked by user
<LockClosedIcon className="h-4 w-4 text-primary-500" title="Locked" />

// Auto-selected
<SparklesIcon className="h-4 w-4 text-gray-400" title="Auto-selected" />

// Manual selection available
<PencilIcon className="h-4 w-4 text-gray-400" title="Click to edit" />
```

### Modals

**Use shadcn/ui Dialog**
```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="sm:max-w-[600px]">
    <DialogHeader>
      <DialogTitle>Modal Title</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      {/* Modal content */}
    </div>
  </DialogContent>
</Dialog>
```

## Asset Selection UI

**Grid Layout for Posters/Fanart**
```tsx
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
  {candidates.map(asset => (
    <div key={asset.id}
         className="relative group cursor-pointer rounded-lg overflow-hidden
                    border-2 border-transparent hover:border-primary-500">
      <img src={asset.url} className="w-full h-auto" />

      {/* Overlay with info */}
      <div className="absolute inset-0 bg-black/60 opacity-0
                      group-hover:opacity-100 transition-opacity p-2">
        <div className="text-white text-xs">
          <p>{asset.width}x{asset.height}</p>
          <p>Score: {asset.score}</p>
        </div>
      </div>

      {/* Selection indicator */}
      {asset.is_selected && (
        <div className="absolute top-2 right-2">
          <CheckCircleIcon className="h-6 w-6 text-primary-500" />
        </div>
      )}
    </div>
  ))}
</div>
```

## Responsive Design

### Breakpoints
```css
/* Tailwind defaults */
sm: 640px   /* Tablets */
md: 768px   /* Small laptops */
lg: 1024px  /* Desktops */
xl: 1280px  /* Large screens */
2xl: 1536px /* Extra large */
```

### Mobile Considerations
- Sidebar collapses to hamburger menu
- Tables switch to card layout
- Reduced padding/margins
- Stack horizontal layouts vertically

## Loading States

**Skeleton Loaders**
```tsx
<div className="space-y-4">
  <div className="h-4 bg-gray-200 rounded animate-pulse" />
  <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
  <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
</div>
```

**Spinners**
```tsx
<div className="flex items-center justify-center p-8">
  <div className="h-8 w-8 border-2 border-primary-500 border-t-transparent
                  rounded-full animate-spin" />
</div>
```

## Empty States

```tsx
<div className="text-center py-12">
  <FilmIcon className="mx-auto h-12 w-12 text-gray-400" />
  <h3 className="mt-2 text-sm font-semibold">No movies found</h3>
  <p className="mt-1 text-sm text-muted-foreground">
    Get started by adding a library or scanning for media.
  </p>
  <div className="mt-6">
    <button className="btn-primary">
      Add Library
    </button>
  </div>
</div>
```

## Error States

```tsx
<div className="rounded-md bg-red-50 p-4">
  <div className="flex">
    <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
    <div className="ml-3">
      <h3 className="text-sm font-medium text-red-800">
        Error loading data
      </h3>
      <p className="mt-1 text-sm text-red-700">
        {error.message}
      </p>
    </div>
  </div>
</div>
```

## Accessibility

### Requirements
- All interactive elements keyboard navigable
- ARIA labels for icon-only buttons
- Contrast ratio 4.5:1 minimum
- Focus indicators visible
- Screen reader announcements for dynamic content

### Implementation
```tsx
// Accessible button
<button
  aria-label="Lock field"
  className="focus:outline-none focus:ring-2 focus:ring-primary-500"
  title="Prevent automatic updates"
>
  <LockIcon className="h-4 w-4" aria-hidden="true" />
</button>

// Accessible form
<label htmlFor="title" className="sr-only">
  Movie Title
</label>
<input
  id="title"
  name="title"
  type="text"
  required
  aria-describedby="title-error"
/>
<span id="title-error" className="text-sm text-red-500">
  Title is required
</span>
```

## Animation Guidelines

### Transitions
```css
/* Standard transitions */
transition-all      /* All properties */
transition-colors   /* Color changes */
transition-opacity  /* Fade in/out */
transition-transform /* Scale/rotate */

/* Duration */
duration-150  /* Fast (150ms) */
duration-300  /* Normal (300ms) */
duration-500  /* Slow (500ms) */
```

### Examples
```tsx
// Hover effects
<div className="transition-colors duration-200 hover:bg-primary-50" />

// Fade in
<div className="transition-opacity duration-300 opacity-0 data-[show=true]:opacity-100" />

// Scale on hover
<div className="transition-transform duration-200 hover:scale-105" />
```

## File Structure

```
src/
├── components/
│   ├── ui/              # Base UI components
│   │   ├── AnimatedTabs.tsx
│   │   ├── card.tsx
│   │   └── dialog.tsx
│   ├── layout/          # Layout components
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── Layout.tsx
│   └── movie/           # Feature components
│       ├── MovieTable.tsx
│       ├── MovieCard.tsx
│       └── AssetSelector.tsx
├── pages/               # Route pages
├── styles/
│   └── globals.css      # Global styles
└── lib/
    └── utils.ts         # Utility functions
```

## Related Documentation

### UI Components in Phases
- [Publishing Phase](phases/PUBLISHING.md) - Progress bars
- [Verification Phase](phases/VERIFICATION.md) - Report displays
- [Enrichment Phase](phases/ENRICHMENT.md) - Asset selection UI

### Related Systems
- [API Architecture](API.md) - Frontend-backend integration
- [Development](DEVELOPMENT.md) - Frontend patterns