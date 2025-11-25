# Frontend Styling Guidelines

**Purpose**: Comprehensive design system and styling conventions for Metarr's frontend UI

**Related Docs**:
- Parent: [Frontend Documentation](../INDEX.md#frontend)
- See also: [Components](COMPONENTS.md), [Pages](PAGES.md)

---

## Quick Reference

**Design Language**: Dark mode first, ultra-compact, high information density
**Framework**: Tailwind CSS v4 with custom utility classes
**Color System**: Neutral grays + Violet primary + Semantic status colors
**Typography**: Inter font family, carefully sized for density

---

## Color System

### Neutral Grays (Foundation)

```css
neutral-950  #0a0a0a  /* Darkest backgrounds */
neutral-900  #171717  /* Page background */
neutral-800  #262626  /* Card backgrounds, inputs */
neutral-700  #404040  /* Borders, dividers */
neutral-600  #525252  /* Hover states */
neutral-500  #737373  /* Disabled text */
neutral-400  #a3a3a3  /* Secondary text, placeholders */
neutral-300  #d4d4d4  /* Tertiary text */
neutral-200  #e5e5e5  /* Light borders */
neutral-100  #f5f5f5  /* Very light backgrounds */
neutral-50   #fafafa  /* Lightest backgrounds */
```

### Primary Color (Violet/Purple)

```css
primary-950  #2e1065  /* Darkest purple */
primary-900  #4c1d95
primary-800  #5b21b6
primary-700  #6d28d9
primary-600  #7c3aed
primary-500  #8b5cf6  /* Main brand color */
primary-400  #a78bfa
primary-300  #c4b5fd  /* Links, accents */
primary-200  #ddd6fe
primary-100  #ede9fe
primary-50   #f5f3ff  /* Lightest purple */
```

### Semantic Status Colors

```css
success  #22c55e  /* Green - success states */
warning  #f97316  /* Orange - warnings */
error    #ef4444  /* Red - errors */
info     #3b82f6  /* Blue - informational */
```

---

## Typography

### Heading Sizes

```tsx
<h1 className="text-2xl font-semibold text-white">Page Title</h1>
<h2 className="text-xl font-semibold text-white">Section</h2>
<h3 className="text-lg font-semibold text-white">Subsection</h3>
<h4 className="text-base font-medium text-neutral-200">Card Title</h4>
```

### Body Text

```tsx
<p className="text-sm text-neutral-400">Subtitle / description</p>
<span className="text-xs text-neutral-500">Helper text / hints</span>
<label className="text-xs font-medium text-neutral-400">Form Label</label>
```

### Font Weights

- `font-semibold` - Page titles, section headings (600)
- `font-medium` - Card titles, labels, emphasis (500)
- `font-normal` - Body text, descriptions (400)

---

## Page Layout

### Standard Page Structure

```tsx
<div className="content-spacing">  {/* pt-16 for sticky header offset */}
  {/* Page Header */}
  <div className="mb-6">
    <h1 className="text-2xl font-semibold text-white">Page Title</h1>
    <p className="text-sm text-neutral-400 mt-1">Page description</p>
  </div>

  {/* Main Content */}
  <div className="space-y-6">
    {/* Cards with bg-neutral-800/50 */}
  </div>
</div>
```

### Spacing Scale

```css
space-y-3   /* Compact lists (12px) - Provider cards */
space-y-4   /* Form sections (16px) */
space-y-6   /* Major sections, cards (24px) */
mb-6        /* Header bottom margin (24px) */
p-6         /* Card padding (24px) */
p-3         /* Compact card padding (12px) */
```

---

## Card Styles

### Standard Card (Workflow Settings)

```tsx
<Card className="bg-neutral-800/50">
  <CardHeader>
    <CardTitle>✨ Section Title</CardTitle>
    <CardDescription>Brief description of section</CardDescription>
  </CardHeader>
  <CardContent className="space-y-6">
    {/* Card content with 24px spacing between sections */}
  </CardContent>
</Card>
```

### Compact Card (Provider Style)

```tsx
<div className="card">  {/* Utility class: bg-neutral-800 border border-neutral-700 rounded-xl */}
  <div className="card-body">  {/* Utility class: p-6 */}
    {/* Compact content */}
  </div>
</div>
```

### Card Background Variants

- **Subtle gray**: `bg-neutral-800/50` - Workflow cards, prominent sections
- **Solid gray**: `bg-neutral-800` - Standard cards, provider cards
- **Nested cards**: `bg-neutral-700` - Cards within cards

---

## Form Elements

### Input Fields

```tsx
{/* Compact height (h-8) for dense layouts */}
<Input
  className="h-8 text-sm bg-neutral-800 border border-neutral-600"
  placeholder="Placeholder text"
/>

{/* Standard height (h-10) for regular forms */}
<Input
  className="h-10 text-sm bg-neutral-800 border border-neutral-600"
/>
```

### Labels

```tsx
{/* Standard label */}
<Label htmlFor="fieldId">Field Name</Label>

{/* Compact label (provider cards) */}
<label className="text-xs font-medium text-neutral-400 mb-1 block">
  API Key
</label>
```

### Select / Dropdown

```tsx
<select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
  <option value="en">English</option>
</select>
```

### Switch Toggle

```tsx
<Switch
  checked={isEnabled}
  onCheckedChange={setIsEnabled}
  className="scale-75"  {/* Compact size for provider cards */}
/>

<Switch
  checked={isEnabled}
  onCheckedChange={setIsEnabled}
  {/* Standard size for workflow settings */}
/>
```

---

## Buttons

### Primary Action

```tsx
<Button className="bg-primary-500 hover:bg-primary-600 text-white">
  <SaveIcon className="h-4 w-4 mr-2" />
  Save Changes
</Button>
```

### Secondary Action

```tsx
<Button variant="outline">
  Discard
</Button>
```

### Icon Sizing in Buttons

```tsx
<Icon className="h-4 w-4 mr-2" />  {/* Standard button icons */}
<Icon className="h-3 w-3" />        {/* Compact inline icons */}
```

---

## Lists & Spacing

### Compact List (Provider Cards)

```tsx
<div className="space-y-3">
  {items.map(item => (
    <div className="card" key={item.id}>
      {/* Each card has 12px spacing */}
    </div>
  ))}
</div>
```

### Standard List (Workflow Cards)

```tsx
<div className="space-y-6">
  {items.map(item => (
    <Card className="bg-neutral-800/50" key={item.id}>
      {/* Each card has 24px spacing */}
    </Card>
  ))}
</div>
```

### Form Sections Within Cards

```tsx
<CardContent className="space-y-6">
  <div className="flex items-center justify-between">
    {/* Setting 1 */}
  </div>

  <div className="flex items-center justify-between">
    {/* Setting 2 */}
  </div>
</CardContent>
```

---

## Icons & Emojis

### Icon Sizing

```css
text-xs   /* 0.75rem / 12px - Very compact */
text-sm   /* 0.875rem / 14px - Compact */
text-base /* 1rem / 16px - Standard */
h-3 w-3   /* 12px - Chevrons, small indicators */
h-4 w-4   /* 16px - Button icons, most UI icons */
h-5 w-5   /* 20px - Larger interactive icons */
```

### Emoji Usage in Titles

```tsx
<CardTitle>✨ Metadata & Asset Enrichment</CardTitle>
<CardTitle>📤 Library Publishing</CardTitle>

{/* Provider page - use emojis sparingly */}
<h1 className="text-2xl font-semibold text-white">Metadata Providers</h1>
```

---

## Borders & Dividers

### Card Borders

```tsx
className="border border-neutral-700"  {/* Standard card borders */}
className="border border-neutral-700/50"  {/* Subtle dividers within cards */}
```

### Horizontal Dividers

```tsx
<div className="border-t border-neutral-700 my-6" />  {/* Section divider */}
<div className="border-t border-neutral-700/50 pt-3" />  {/* Subtle divider */}
```

---

## Alerts & Messages

### Info Alert

```tsx
<Alert>
  <InfoIcon className="h-4 w-4" />
  <AlertDescription>
    <strong>Recommended: Off</strong> - Review metadata before publishing.
  </AlertDescription>
</Alert>
```

### Error State

```tsx
<Alert variant="destructive">
  <AlertDescription>Error message here</AlertDescription>
</Alert>
```

### Status Indicators

```tsx
<span className="text-green-400">Using Personal API Key</span>
<span className="text-amber-400">Using Default API Key</span>
<span className="text-red-400">API Key Required</span>
```

---

## Validation States

### Input Validation

```tsx
{/* Invalid */}
<div className="ring-2 ring-red-500">
  <input className="border-red-500" />
</div>

{/* Valid */}
<div className="ring-2 ring-green-500">
  <input className="border-green-500" />
</div>

{/* Focus */}
<div className="hover:ring-1 hover:ring-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
  <input />
</div>
```

---

## Interactive States

### Hover Effects

```tsx
{/* Button hover */}
className="hover:bg-neutral-600 transition-colors"

{/* Card hover */}
className="hover:bg-neutral-800/30 transition-colors"

{/* Text hover */}
className="text-neutral-400 hover:text-neutral-200 transition-colors"
```

### Disabled States

```tsx
<Button disabled={isPending}>
  {isPending ? 'Saving...' : 'Save'}
</Button>

{/* Disabled styling */}
className="disabled:opacity-50 disabled:cursor-not-allowed"
```

---

## Layout Utilities

### Content Spacing

```tsx
className="content-spacing"  {/* pt-16 - Accounts for sticky header */}
```

### Collapsible Sections

```tsx
<div className="border border-neutral-700 rounded-md">
  <button
    onClick={() => toggleSection()}
    className="w-full flex items-center justify-between p-3 text-left hover:bg-neutral-800/30 transition-colors rounded-md"
  >
    <div className="flex items-center gap-2">
      {expanded ?
        <ChevronDown className="h-3 w-3 text-neutral-400" /> :
        <ChevronRight className="h-3 w-3 text-neutral-400" />
      }
      <span className="text-sm font-medium text-neutral-200">Section Title</span>
    </div>
  </button>

  {expanded && (
    <div className="border-t border-neutral-700 p-3">
      {/* Section content */}
    </div>
  )}
</div>
```

---

## Design Patterns

### Provider Card Pattern (Ultra-Compact)

```tsx
<div className="space-y-3">
  {providers.map(provider => (
    <div className="card" key={provider.id}>
      <div className="card-body">
        {/* Header: Title + Info + Switch */}
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-lg font-semibold text-white">{provider.name}</h3>
          <TooltipTrigger>
            <FontAwesomeIcon icon={faCircleQuestion} className="text-sm" />
          </TooltipTrigger>
          <Switch className="scale-75" />
        </div>

        {/* Content */}
        <div className="mb-3">
          {/* Compact inputs (h-8, text-sm) */}
        </div>

        {/* Footer: Stats */}
        <div className="pt-3 border-t border-neutral-700/50">
          <div className="text-xs text-neutral-400">Stats</div>
        </div>
      </div>
    </div>
  ))}
</div>
```

### Workflow Card Pattern (Spacious)

```tsx
<div className="space-y-6">
  {sections.map(section => (
    <Card className="bg-neutral-800/50" key={section.id}>
      <CardHeader>
        <CardTitle>✨ {section.title}</CardTitle>
        <CardDescription>{section.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Sections with 24px spacing */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label>Setting Name</Label>
            <p className="text-sm text-neutral-500">Description</p>
          </div>
          <Switch />
        </div>
      </CardContent>
    </Card>
  ))}
</div>
```

---

## Grid Layouts

### 2-Column Form Grid

```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
  {fields.map(field => (
    <div key={field.id} className="space-y-1">
      <Label className="text-xs">{field.label}</Label>
      <Input className="h-8 text-sm" />
    </div>
  ))}
</div>
```

---

## Best Practices

### DO ✅

- Use `bg-neutral-800/50` for prominent cards (workflow settings)
- Use `bg-neutral-800` for standard cards (provider cards)
- Use `space-y-3` for compact lists, `space-y-6` for major sections
- Use `h-8` inputs in compact layouts, `h-10` in standard forms
- Use `text-sm` for most body text
- Use `text-xs` for labels, hints, and helper text
- Add emojis to card titles for visual hierarchy (✨ 📤 ⚙️ 🔔)
- Use `transition-colors` for all hover states
- Use `content-spacing` class on page root to account for sticky headers

### DON'T ❌

- Don't mix card background styles on the same page
- Don't use custom spacing - stick to scale (3, 4, 6)
- Don't use h-12 or larger inputs (too tall for dense UI)
- Don't overuse borders - prefer subtle `border-neutral-700/50` dividers
- Don't forget hover states on interactive elements
- Don't use tabs when cards can show all content at once
- Don't use text-base for body text (too large)

---

## Component-Specific Guidelines

### Page Header

```tsx
<div className="mb-6">
  <h1 className="text-2xl font-semibold text-white">Page Title</h1>
  <p className="text-sm text-neutral-400 mt-1">Page description</p>
</div>
```

### Save Bar (Fixed Bottom)

```tsx
{hasChanges && (
  <div className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-700 shadow-lg p-4 z-50">
    <div className="container mx-auto flex items-center justify-between max-w-7xl">
      <div className="text-sm text-neutral-400">
        You have unsaved changes
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={handleDiscard}>Discard</Button>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>
    </div>
  </div>
)}
```

---

## Migration Checklist

When updating existing pages to match provider styling:

- [ ] Replace `AnimatedTabs` with stacked card layout
- [ ] Apply `bg-neutral-800/50` to cards
- [ ] Add emojis to card titles
- [ ] Use `space-y-6` for card spacing
- [ ] Use `space-y-6` inside CardContent for sections
- [ ] Ensure all inputs have `text-sm`
- [ ] Use `h-8` for compact inputs, `h-10` for standard
- [ ] Add `transition-colors` to all hover states
- [ ] Use `text-xs` for labels and helper text
- [ ] Apply `content-spacing` to page root

---

## See Also

- [Component Library](COMPONENTS.md) - Reusable component patterns
- [Page Templates](PAGES.md) - Full page examples
- [Tailwind Config](../../public/frontend/tailwind.config.js) - Custom theme configuration
- [Global CSS](../../public/frontend/src/styles/globals.css) - Utility classes and theme
