# UI Standards

**Purpose**: Design system, styling patterns, and component standards for Metarr frontend.

**Related Docs**:
- Parent: [Frontend README](./README.md)
- Related: [COMPONENTS.md](./COMPONENTS.md), [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Quick Reference (TL;DR)

- **Primary color**: Violet (#8b5cf6)
- **Theme**: Dark mode first
- **Component library**: shadcn/ui + custom AnimatedTabs
- **Styling**: Tailwind CSS v4 utility classes
- **Font**: Inter (sans-serif), Fira Code (monospace)
- **Spacing**: 0.25rem (4px) increments
- **Button variants**: default, destructive, outline, ghost, link
- **Always**: Use transition-colors for hover effects

---

## Design System

### Color Palette

**Primary**: Violet
```
violet-500:  #8b5cf6  (Primary actions, links)
violet-600:  #7c3aed  (Hover states)
violet-400:  #a78bfa  (Lighter accents)
violet-500/90        (Primary hover: 90% opacity)
violet-500/10        (Subtle backgrounds: 10% opacity)
```

**Semantic Colors**:
```
green-500:   #22c55e  (Success)
amber-500:   #f59e0b  (Warning)
red-500:     #ef4444  (Error/Destructive)
blue-500:    #3b82f6  (Info)
```

**Neutrals** (Dark mode):
```
neutral-950: #0a0a0a  (Background)
neutral-900: #171717  (Cards, elevated surfaces)
neutral-800: #262626  (Hover states)
neutral-700: #404040  (Borders)
neutral-400: #a3a3a3  (Muted text)
neutral-300: #d4d4d4  (Body text)
white:       #ffffff  (Headings)
```

### Typography

**Font Stack**:
```css
font-sans: Inter, system-ui, sans-serif
font-mono: Fira Code, Menlo, monospace
```

**Scale**:
```
text-xs:   12px  (Labels, badges)
text-sm:   14px  (Body text, buttons)
text-base: 16px  (Default body)
text-lg:   18px  (Section headers)
text-xl:   20px  (Page subheadings)
text-2xl:  24px  (Page headings)
text-3xl:  30px  (Hero headings)
```

**Font Weights**:
```
font-normal:   400  (Body text)
font-medium:   500  (Emphasis)
font-semibold: 600  (Headings)
font-bold:     700  (Strong emphasis)
```

### Spacing Scale

Tailwind's 4px increment system:
```
space-1:  0.25rem  (4px)
space-2:  0.5rem   (8px)
space-4:  1rem     (16px)
space-6:  1.5rem   (24px)
space-8:  2rem     (32px)
space-12: 3rem     (48px)
```

**Common patterns**:
- Card padding: `p-6`
- Section spacing: `space-y-6`
- Button gap: `gap-2`
- Form field spacing: `space-y-4`

---

## Button Standards

### Button Component (shadcn/ui)

Use shadcn/ui Button for all standard buttons:

```typescript
import { Button } from '@/components/ui/button';

// Primary action (default)
<Button>Save</Button>

// Secondary action
<Button variant="outline">Cancel</Button>

// Destructive action
<Button variant="destructive">Delete</Button>

// Ghost (minimal visual weight)
<Button variant="ghost">Back</Button>

// Link style
<Button variant="link">Learn More</Button>
```

### Button Sizes

```typescript
// Default size
<Button>Click Me</Button>

// Small (compact UIs, tables)
<Button size="sm">Add</Button>

// Large (prominent CTAs)
<Button size="lg">Get Started</Button>

// Icon only (square)
<Button size="icon"><FontAwesomeIcon icon={faTrash} /></Button>
```

### Button Variants Explained

**Default**: Violet background, white text
```typescript
<Button>Save Changes</Button>
// bg-primary text-primary-foreground hover:bg-primary/90
```

**Destructive**: Red background, white text
```typescript
<Button variant="destructive">Delete Movie</Button>
// bg-destructive hover:bg-destructive/90
```

**Outline**: Border only, transparent background
```typescript
<Button variant="outline">Cancel</Button>
// border border-input hover:bg-accent
```

**Ghost**: No border, transparent background
```typescript
<Button variant="ghost">Close</Button>
// hover:bg-accent hover:text-accent-foreground
```

**Link**: Text with underline on hover
```typescript
<Button variant="link">View Documentation</Button>
// text-primary underline-offset-4 hover:underline
```

### Hover States

**Built-in** (shadcn/ui buttons):
- Default: Darkens to 90% opacity
- Outline: Adds subtle background
- Ghost: Adds subtle background
- Destructive: Darkens to 90% opacity

**Do NOT override** - these provide consistent feedback.

### Button States

**Loading**:
```typescript
<Button disabled={isLoading}>
  {isLoading ? (
    <>
      <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
      Saving...
    </>
  ) : (
    'Save'
  )}
</Button>
```

**Disabled**:
```typescript
<Button disabled={!isValid}>Save</Button>
// Automatically applies: opacity-50, cursor-not-allowed
```

### Icon Buttons

```typescript
// With shadcn/ui Button
<Button size="icon" variant="ghost" aria-label="Delete">
  <FontAwesomeIcon icon={faTrash} />
</Button>

// Custom icon button
<button
  className="w-8 h-8 flex items-center justify-center rounded
             hover:bg-neutral-800 transition-colors"
  aria-label="Settings"
>
  <FontAwesomeIcon icon={faCog} className="text-neutral-400" />
</button>
```

### Button Groups

```typescript
<div className="flex gap-2">
  <Button variant="outline">Cancel</Button>
  <Button>Save</Button>
</div>
```

### Primary Action Guidelines

- **One primary button per view** - Use default variant
- **Secondary actions** - Use outline variant
- **Destructive actions** - Use destructive variant (red)
- **Navigation/back** - Use ghost variant

---

## Custom Interactive Elements

### Clickable Cards

```typescript
<div className="border border-neutral-700 rounded-lg p-6
                hover:border-violet-500 hover:bg-violet-500/5
                transition-colors cursor-pointer"
     onClick={handleClick}>
  {/* content */}
</div>
```

### Icon Buttons (Custom)

```typescript
<button className="text-neutral-400 hover:text-violet-400
                   transition-colors cursor-pointer">
  <FontAwesomeIcon icon={faEdit} />
</button>
```

### List Items

```typescript
<div className="px-4 py-3 hover:bg-neutral-800/50
                transition-colors cursor-pointer">
  {/* list item content */}
</div>
```

### Selection Cards

```typescript
<button className="border-2 border-neutral-700 rounded-lg p-6
                   hover:border-violet-500 hover:bg-violet-500/5
                   transition-all cursor-pointer"
        onClick={handleSelect}>
  {/* selection option */}
</button>
```

---

## Layout Patterns

### Page Structure

```typescript
<div className="space-y-6">
  {/* Page header */}
  <div>
    <h1 className="text-3xl font-bold">Page Title</h1>
    <p className="text-neutral-400 mt-1">Page description</p>
  </div>

  {/* Main content */}
  <div className="grid gap-6">
    {content}
  </div>
</div>
```

### Grid Layout

```typescript
// Responsive grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map(item => <Card key={item.id}>{item}</Card>)}
</div>
```

### Container

```typescript
<div className="container mx-auto px-6 py-6 max-w-7xl">
  {/* page content */}
</div>
```

---

## Component Patterns

### Cards (shadcn/ui)

```typescript
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
  </CardHeader>
  <CardContent>
    <p>Card body content</p>
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

### Tabs (Custom AnimatedTabs)

```typescript
import { AnimatedTabs, AnimatedTabsContent } from '@/components/ui/AnimatedTabs';

<AnimatedTabs
  tabs={[
    { value: 'metadata', label: 'Metadata' },
    { value: 'assets', label: 'Assets' },
  ]}
  activeTab={tab}
  onChange={setTab}
/>

<AnimatedTabsContent value="metadata">
  <MetadataForm />
</AnimatedTabsContent>

<AnimatedTabsContent value="assets">
  <AssetGrid />
</AnimatedTabsContent>
```

### Forms

```typescript
<form className="space-y-4">
  <div className="space-y-2">
    <label htmlFor="title" className="block text-sm font-medium">
      Title
    </label>
    <input
      id="title"
      type="text"
      className="w-full rounded-md border border-neutral-700 bg-neutral-900
                 px-3 py-2 text-sm
                 focus:outline-none focus:ring-2 focus:ring-violet-500"
    />
    <p className="text-xs text-neutral-400">
      Helper text for the field
    </p>
  </div>

  <Button type="submit">Submit</Button>
</form>
```

### Dialogs (Modals)

```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
    </DialogHeader>

    <div className="py-4">
      {/* Dialog body */}
    </div>

    <DialogFooter className="gap-2">
      <Button variant="outline" onClick={() => setIsOpen(false)}>
        Cancel
      </Button>
      <Button onClick={handleSave}>
        Save
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## State Patterns

### Loading

```typescript
{isLoading && (
  <div className="flex justify-center items-center p-8">
    <div className="h-8 w-8 border-2 border-violet-500 border-t-transparent
                    rounded-full animate-spin" />
  </div>
)}
```

### Error

```typescript
{error && (
  <div className="rounded-md bg-red-500/10 border border-red-500/20 p-4">
    <div className="flex items-start gap-3">
      <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500 mt-0.5" />
      <div>
        <h3 className="text-sm font-semibold text-red-500">Error</h3>
        <p className="text-sm text-neutral-300 mt-1">{error.message}</p>
      </div>
    </div>
  </div>
)}
```

### Empty State

```typescript
<div className="text-center py-12">
  <FontAwesomeIcon icon={faFilm} className="text-neutral-600 text-6xl mb-4" />
  <h3 className="text-xl font-semibold mb-2">No movies found</h3>
  <p className="text-neutral-400 mb-6">
    Add a library or scan for media to get started
  </p>
  <Button onClick={handleAddLibrary}>
    Add Library
  </Button>
</div>
```

### Status Badges

```typescript
// Success
<span className="inline-flex items-center rounded-full
                 bg-green-500/10 border border-green-500/20
                 px-2.5 py-0.5 text-xs font-medium text-green-500">
  Completed
</span>

// Warning
<span className="inline-flex items-center rounded-full
                 bg-amber-500/10 border border-amber-500/20
                 px-2.5 py-0.5 text-xs font-medium text-amber-500">
  Processing
</span>

// Error
<span className="inline-flex items-center rounded-full
                 bg-red-500/10 border border-red-500/20
                 px-2.5 py-0.5 text-xs font-medium text-red-500">
  Failed
</span>
```

### Warning Boxes

**Standard**: Neutral background with colored icon/title only (no tinted backgrounds)

```typescript
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
- Background: `bg-neutral-800` (neutral, not tinted)
- Border: `border-neutral-700` (neutral)
- Icon: `text-yellow-500` (warning color)
- Title: `text-yellow-500` (matches icon)
- Body text: `text-neutral-300` (standard)

---

## Transitions and Animations

### Standard Transitions

```css
transition-colors   /* Color changes (200ms) - Use for most hovers */
transition-opacity  /* Fade effects (300ms) */
transition-transform /* Scale/rotate (200ms) */
transition-all      /* Multiple properties (use sparingly) */
```

### Usage

```typescript
// Color changes (fastest, most common)
<div className="hover:bg-violet-500/5 transition-colors">

// Fade in/out
<div className="opacity-0 transition-opacity duration-300 data-[show=true]:opacity-100">

// Scale on hover
<div className="hover:scale-105 transition-transform">

// Multiple properties (use sparingly)
<div className="hover:border-violet-500 hover:bg-violet-500/5 transition-all">
```

### Cursor Standards

```typescript
cursor-pointer      // Clickable elements
cursor-not-allowed  // Disabled elements (automatic on disabled buttons)
cursor-move         // Draggable elements
cursor-text         // Text selection areas
cursor-default      // Non-interactive (default)
```

---

## Responsive Design

### Breakpoints

```
sm:  640px   (Tablets)
md:  768px   (Small laptops)
lg:  1024px  (Desktops)
xl:  1280px  (Large screens)
2xl: 1536px  (Extra large)
```

### Mobile-First Approach

```typescript
// 1 column mobile, 2 tablet, 3 desktop
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

// Hide on mobile, show on desktop
<div className="hidden lg:block">

// Full width mobile, fixed width desktop
<div className="w-full lg:w-64">
```

---

## Accessibility

### Requirements

- Keyboard navigation for all interactive elements
- ARIA labels for icon-only buttons
- Min contrast ratio: 4.5:1
- Visible focus indicators (built into shadcn/ui)
- Screen reader announcements for dynamic content

### Implementation

```typescript
// Icon button with aria-label
<Button size="icon" aria-label="Delete item">
  <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
</Button>

// Focus visible (built into shadcn/ui)
// focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500

// Skip link for keyboard users
<a href="#main-content" className="sr-only focus:not-sr-only">
  Skip to main content
</a>
```

---

## Common Patterns

### Modal Footer

```typescript
<DialogFooter className="gap-2">
  <Button variant="outline" onClick={onClose}>Cancel</Button>
  <Button onClick={onSave} disabled={!isValid}>Save</Button>
</DialogFooter>
```

### Modal Footer with Delete

```typescript
<DialogFooter className="gap-2">
  <div className="mr-auto">
    <Button variant="destructive" onClick={onDelete}>Delete</Button>
  </div>
  <Button variant="outline" onClick={onClose}>Cancel</Button>
  <Button onClick={onSave}>Save</Button>
</DialogFooter>
```

### Form Submit Button

```typescript
<Button type="submit" className="w-full" disabled={isSubmitting}>
  {isSubmitting ? (
    <>
      <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
      Saving...
    </>
  ) : (
    'Save Changes'
  )}
</Button>
```

### Table Row Actions

```typescript
<Button size="sm" variant="ghost">
  <FontAwesomeIcon icon={faEdit} className="mr-2" />
  Edit
</Button>
```

---

## Anti-Patterns

**Don't**:
- ❌ Remove focus states (required for accessibility)
- ❌ Use transition-all when only one property changes
- ❌ Override shadcn button hover states
- ❌ Use `<div>` as a button (use `<button>` or Button component)
- ❌ Forget disabled states on loading buttons
- ❌ Use non-theme colors except for status (success, error, warning)
- ❌ Mix custom buttons with shadcn buttons inconsistently

**Do**:
- ✅ Use shadcn/ui Button component for all standard buttons
- ✅ Apply cursor-pointer to all clickable custom elements
- ✅ Use transition-colors for hover effects
- ✅ Respect theme colors (violet primary)
- ✅ Provide aria-labels for icon-only buttons
- ✅ Handle loading and disabled states

---

## See Also

- [COMPONENTS.md](./COMPONENTS.md) - Component organization
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall frontend architecture
- [ERROR_HANDLING.md](./ERROR_HANDLING.md) - Error state styling
