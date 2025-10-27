# Button & Interactive Element Standards

## Overview

This document defines the standard patterns for buttons and interactive elements across the Metarr frontend to ensure consistency and good UX.

## Button Component (shadcn/ui)

We use the shadcn/ui Button component as the foundation. All buttons should use this component.

### Button Variants

```tsx
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

```tsx
// Default size
<Button>Click Me</Button>

// Small (compact UIs, tables)
<Button size="sm">Add</Button>

// Large (prominent CTAs)
<Button size="lg">Get Started</Button>

// Icon only
<Button size="icon"><Icon /></Button>
```

## Hover States

### Standard Buttons (shadcn/ui)

shadcn/ui buttons have **built-in hover states** - no additional styling needed:

- **Default**: `hover:bg-primary/90` (slightly darker)
- **Outline**: `hover:bg-accent hover:text-accent-foreground`
- **Destructive**: `hover:bg-destructive/90`
- **Ghost**: `hover:bg-accent hover:text-accent-foreground`

**Do NOT override these** - they provide consistent feedback.

### Custom Interactive Elements

For custom clickable elements (not using Button component), apply these hover patterns:

#### Cards/Clickable Containers
```tsx
className="border border-neutral-700 hover:border-violet-500 hover:bg-violet-500/5 transition-colors cursor-pointer"
```

#### Icon Buttons (Custom)
```tsx
className="text-neutral-400 hover:text-violet-400 transition-colors cursor-pointer"
```

#### List Items
```tsx
className="hover:bg-neutral-800/50 transition-colors cursor-pointer"
```

#### Selection Cards (Type Selection, Mode Selection)
```tsx
className="border-2 border-neutral-700 hover:border-primary hover:bg-primary/5 transition-all"
```

## Transition Standards

Always use Tailwind's transition utilities for smooth interactions:

- **Colors/backgrounds**: `transition-colors` (fastest, 150ms)
- **Multiple properties**: `transition-all` (use sparingly, can be janky)
- **Custom duration**: `duration-200` (default is 150ms)

```tsx
// Good - specific transition
<div className="hover:bg-primary/5 transition-colors">

// Acceptable - multiple properties changing
<div className="hover:scale-105 hover:border-primary transition-all">

// Avoid - unnecessarily broad
<div className="text-white transition-all"> {/* only text color changes */}
```

## Cursor Standards

Always set appropriate cursor styles:

```tsx
// Clickable elements
cursor-pointer

// Disabled elements (automatically applied by Button component)
cursor-not-allowed

// Draggable elements
cursor-move

// Text selection
cursor-text

// Default (non-interactive)
cursor-default
```

## Disabled States

### Button Component (Automatic)

```tsx
<Button disabled={!isValid}>Save</Button>
// Automatically applies: opacity-50, cursor-not-allowed, pointer-events-none
```

### Custom Interactive Elements

```tsx
className={`
  border rounded px-4 py-2
  ${disabled
    ? 'opacity-50 cursor-not-allowed pointer-events-none'
    : 'hover:bg-primary/5 cursor-pointer'
  }
`}
```

## Loading States

Use the `disabled` prop with loading indicators:

```tsx
<Button disabled={isLoading}>
  {isLoading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Save'}
</Button>
```

## Focus States

shadcn/ui buttons have **built-in focus rings** for accessibility:
- `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`

**Never remove focus states** - they're critical for keyboard navigation.

## Icon Buttons

### With shadcn/ui Button
```tsx
<Button size="icon" variant="ghost">
  <FontAwesomeIcon icon={faTrash} />
</Button>
```

### Custom Icon Buttons
```tsx
<button className="w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-800 transition-colors">
  <FontAwesomeIcon icon={faCog} className="text-neutral-400 hover:text-violet-400" />
</button>
```

## Button Groups

Buttons placed side-by-side should have consistent spacing:

```tsx
<div className="flex gap-2">
  <Button variant="outline">Cancel</Button>
  <Button>Save</Button>
</div>
```

## Primary Action Guidelines

- **One primary button per view** - Use default variant
- **Secondary actions** - Use outline variant
- **Destructive actions** - Use destructive variant (red)
- **Navigation/back** - Use ghost variant

## Common Patterns

### Modal Footer
```tsx
<DialogFooter className="gap-2">
  <Button variant="outline" onClick={onClose}>Cancel</Button>
  <Button onClick={onSave} disabled={!isValid}>Save</Button>
</DialogFooter>
```

### Modal Footer with Delete (Left-aligned)
```tsx
<DialogFooter className="gap-2">
  <div className="mr-auto">
    <Button variant="destructive" onClick={onDelete}>Delete</Button>
  </div>
  <Button variant="outline" onClick={onClose}>Cancel</Button>
  <Button onClick={onSave}>Save</Button>
</DialogFooter>
```

### Form Submit
```tsx
<Button type="submit" className="w-full" disabled={isSubmitting}>
  {isSubmitting ? 'Saving...' : 'Save Changes'}
</Button>
```

### Inline Actions (Tables, Lists)
```tsx
<Button size="sm" variant="ghost">
  <FontAwesomeIcon icon={faEdit} className="mr-2" />
  Edit
</Button>
```

## Color Palette

Our primary interactive color is **violet/purple**:

- **Primary**: `violet-500` / `primary`
- **Primary hover**: `violet-500/90`
- **Primary subtle**: `violet-500/10` (backgrounds)
- **Primary border**: `violet-500/30`

```tsx
// Good - using theme colors
className="bg-violet-500 hover:bg-violet-500/90"

// Good - using semantic names
className="bg-primary hover:bg-primary/90"

// Avoid - hard-coded non-theme colors
className="bg-blue-500 hover:bg-blue-600"
```

## Accessibility Requirements

1. **Always provide visible focus states** (built into shadcn/ui)
2. **Use semantic HTML** (`<button>` for buttons, not `<div>`)
3. **Include aria-labels** for icon-only buttons
4. **Respect prefers-reduced-motion** (built into Tailwind transitions)

```tsx
// Good - semantic and accessible
<Button aria-label="Delete item">
  <FontAwesomeIcon icon={faTrash} />
</Button>

// Bad - div masquerading as button
<div onClick={handleClick}>Click Me</div>
```

## Examples from Codebase

### Wizard Type Selection (Custom)
```tsx
<button
  onClick={() => handleTypeSelect('kodi')}
  className="p-6 border-2 border-neutral-700 rounded-lg hover:border-primary hover:bg-primary/5 transition-all"
>
  <div className="text-4xl mb-2">🖥️</div>
  <div className="text-sm font-medium text-white">Kodi</div>
</button>
```

### Media Player Group Card (Custom)
```tsx
<div
  onClick={() => onPlayerClick(member.id)}
  className="flex items-center gap-2 px-2 py-1.5 rounded border border-transparent hover:border-violet-500/30 hover:bg-violet-500/5 cursor-pointer transition-all group"
>
  {/* content */}
</div>
```

### Standard Form Actions (shadcn/ui)
```tsx
<DialogFooter className="gap-2">
  <Button variant="outline" onClick={onClose}>Cancel</Button>
  <Button onClick={handleSave} disabled={!isValid}>
    {isSaving ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Save'}
  </Button>
</DialogFooter>
```

## Anti-Patterns

❌ **Don't**: Mix custom buttons with shadcn buttons inconsistently
❌ **Don't**: Remove focus states
❌ **Don't**: Use `transition-all` when only one property changes
❌ **Don't**: Override shadcn button hover states
❌ **Don't**: Use `<div>` as a button
❌ **Don't**: Forget disabled states
❌ **Don't**: Use non-theme colors (except for status: success, error, warning)

## Summary

1. **Use shadcn/ui Button component** for all standard buttons
2. **Hover states are built-in** for Button component
3. **Custom elements** should use violet theme colors and transition-colors
4. **Always set cursor-pointer** on clickable elements
5. **Respect disabled and loading states**
6. **One primary button per view**
7. **Focus states are required** for accessibility
