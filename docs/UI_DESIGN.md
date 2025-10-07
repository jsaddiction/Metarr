# UI Design & Layout System

## Design Guidelines

### Color Scheme
- **Primary**: Purple (#8B5FBF) - Main accent color
- **Background**: Dark (#1E1E1E) - Main background
- **Secondary**: Light purple (#B794C6) - Secondary elements
- **Success**: Green (#48BB78) - Success states
- **Error**: Red (#F56565) - Error states
- **Warning**: Orange (#ED8936) - Warning states

### Typography
- Match Sonarr/Radarr font families and sizing
- Clean, readable sans-serif fonts
- Consistent spacing and line heights

### Layout Patterns
- **Sidebar Navigation**: Fixed left sidebar with expandable menus (Metadata, Settings, System)
- **View Controls**: Fixed header controls with search, view modes, and refresh functionality
- **Table Views**: Comprehensive metadata tracking with consolidated columns
- **Grid Views**: Poster cards for movies/series (responsive)
- **Cards**: Rounded corners, subtle shadows for information display
- **Expandable Menus**: Auto-expand based on current route, navigate to first child on click
- **Responsive**: Mobile-friendly layouts with proper spacing and breakpoints

### Navigation Structure
- **Metadata Menu**: Movies, Series, Music, Actors, Artists (expandable)
- **Settings Menu**: General, Providers, Files, Media Players, Notifications (expandable)
- **System Menu**: Status, Tasks, Backup, Events, Log Files (expandable)
- **Activity**: Standalone page for job processing and recent activity

## Layout & Content Area Design System

### Overview
Metarr implements a consistent layout system with a fixed sidebar, fixed header, and flexible content area. The design ensures uniform spacing and visual hierarchy across all pages.

### Layout Components

#### Main Layout Structure (Layout.tsx)
```tsx
<div className="min-h-screen bg-neutral-900">
  <Header /> {/* Fixed, 64px height */}
  <Sidebar /> {/* Fixed left, 192px width (64px collapsed) */}
  <main className="pt-16 p-6 ml-48"> {/* Content area with padding */}
    {children}
  </main>
</div>
```

**Key Specifications:**
- **Header**: `h-16` (64px), fixed at top, z-index 40
- **Sidebar**: `w-48` (192px), fixed left, z-index 30, collapses to `w-16` (64px)
- **Main Content Area**:
  - `pt-16` (64px top padding to clear header)
  - `p-6` (24px padding on all sides)
  - `ml-48` (192px left margin to clear sidebar)
  - Responsive: adjusts margin based on sidebar state

### Content Area Patterns

#### Pattern 1: Pages WITH ViewControls
Used for content with search, filtering, and view mode controls (Movies, Series, Music, Actors, Artists).

```tsx
export const PageName: React.FC = () => {
  return (
    <>
      <div className="full-width-section">
        <ViewControls
          searchPlaceholder="Filter..."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onRefresh={handleRefresh}
          onSortChange={handleSortChange}
          onFilterChange={handleFilterChange}
        />
      </div>

      <div className="content-spacing">
        {/* Page content goes here */}
      </div>
    </>
  );
};
```

**Key Classes:**
- **`.full-width-section`**: Negative margin `-mx-6` to break out of parent padding, making ViewControls span full width edge-to-edge
- **`.content-spacing`**: Top padding `pt-4` to create gap between ViewControls and content

#### Pattern 2: Pages WITHOUT ViewControls
Used for settings, system pages, and activity pages that don't require search/filter controls.

```tsx
export const PageName: React.FC = () => {
  return (
    <div className="content-spacing">
      {/* Page content goes here */}
      <div className="card">
        {/* Card content */}
      </div>
    </div>
  );
};
```

**Key Classes:**
- **`.content-spacing`**: Top padding `pt-4` to create consistent gap from top of content area
- No `.full-width-section` needed as there are no controls to span full width

### ViewControls Component Specifications

**Visual Structure:**
```
┌─────────────────────────────────────────────────────┐
│ [Search Bar................] [👁️▼] [🔄] [⬆️⬇️] [🔍] │ ← ViewControls (full width)
└─────────────────────────────────────────────────────┘
  ↕ 16px gap (pt-4)
┌─────────────────────────────────────────────────────┐
│ Content starts here                                  │
│                                                      │
```

**Properties:**
- **Position**: `sticky top-16 z-30` (sticks below header when scrolling)
- **Background**: `bg-neutral-800` with `border-b border-neutral-700`
- **Padding**: `px-6 py-4` (24px horizontal, 16px vertical)
- **Layout**: Flexbox with space-between, search on left, actions on right

**Search Bar:**
- Width: `w-64` (256px)
- FontAwesome search icon positioned absolutely inside input
- Background: `bg-neutral-700`
- Border: `border-neutral-600`

**Action Buttons:**
- Refresh: `faRefresh` icon
- View Mode: `faEye` icon with dropdown (Table, Posters, Overview)
- Sort: `faSort` icon
- Filter: `faFilter` icon
- Style: Ghost buttons with hover states

### Utility Classes (globals.css)

#### `.full-width-section`
```css
.full-width-section {
  @apply -mx-6; /* Negative margin to counteract parent's px-6 padding */
}
```
**Purpose**: Breaks content out of the main content area's 24px horizontal padding to achieve full-width edge-to-edge display for ViewControls.

#### `.content-spacing`
```css
.content-spacing {
  @apply pt-4; /* 16px top padding */
}
```
**Purpose**: Provides consistent top spacing for all content, whether below ViewControls or at the top of pages without ViewControls.

### Sidebar Navigation Behavior

#### Menu Structure
```
Metadata (expandable)
  ├─ Movies
  ├─ Series
  ├─ Music
  ├─ Actors
  └─ Artists

Activity (standalone)

Settings (expandable)
  ├─ General
  ├─ Providers
  ├─ Files
  ├─ Media Players
  └─ Notifications

System (expandable)
  ├─ Status
  ├─ Tasks
  ├─ Backup
  ├─ Events
  └─ Log Files
```

#### Interaction Behaviors

**Auto-Expand Logic:**
- Sections automatically expand when viewing any of their child routes
- Example: Visiting `/settings/providers` automatically expands the Settings menu

**Click Navigation:**
- Clicking a parent menu (Metadata, Settings, System) expands it AND navigates to its first child
- Example: Clicking "Settings" → expands menu AND navigates to `/settings/general`

**Active State Styling:**
- Active parent sections: `border-l-4 border-primary-500`
- Active menu items: `bg-neutral-700` with `text-primary-300`
- Inactive items: `text-neutral-300` with hover state `hover:bg-neutral-700`
- **Active State Detection**: Uses path pattern matching (`location.pathname.startsWith(child.path)`) instead of exact matching, so child routes (e.g., `/metadata/movies/1/edit`) maintain parent item's active state

**Animation Specifications:**
- Expand/collapse: `max-height` transition with `ease-in-out` timing
- Menu items: Staggered fade-in with 50ms delay per item
- Transform: `translateY(-10px)` to `translateY(0)` on expand
- Opacity: `0` to `1` on expand

### Responsive Behavior

#### Breakpoints
- **Desktop**: `md:` (768px+) - Full sidebar visible (192px)
- **Tablet/Mobile**: `< 768px` - Sidebar collapses to icons (64px) or drawer

#### Mobile Sidebar
- **Closed State**: Hidden off-screen with overlay
- **Open State**: Slides in from left, full width overlay darkens background
- **Backdrop**: `bg-black bg-opacity-50 z-30` closes sidebar on click
- **Toggle**: Hamburger menu in header

#### Content Area Adjustments
```tsx
<main className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-48'} md:ml-48`}>
```
- Smoothly transitions margin when sidebar collapses/expands
- Mobile: Always uses responsive margin

### Page Layout Examples

#### Example 1: Movies Page (With ViewControls)
```tsx
export const Movies: React.FC = () => {
  return (
    <>
      {/* Full-width ViewControls */}
      <div className="full-width-section">
        <ViewControls {...props} />
      </div>

      {/* Content with spacing */}
      <div className="content-spacing">
        <MovieTableView movies={filteredMovies} />
      </div>
    </>
  );
};
```

**Visual Result:**
```
┌────────────────────────────────────────┐
│ Header (64px)                          │
└────────────────────────────────────────┘
┌──────┬──────────────────────────────┐
│      │ ┌──────────────────────────┐ │
│      │ │ ViewControls (full width)│ │ ← Breaks out of padding
│      │ └──────────────────────────┘ │
│ Side │   ↕ 16px gap                  │
│ bar  │ ┌──────────────────────────┐ │
│ 192px│ │ Movie Table              │ │ ← Normal padding
│      │ │                          │ │
└──────┴──────────────────────────────┘
        ← 24px padding on sides
```

#### Example 2: Settings/General Page (Without ViewControls)
```tsx
export const General: React.FC = () => {
  return (
    <div className="content-spacing">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-body">
            {/* Settings content */}
          </div>
        </div>
      </div>
    </div>
  );
};
```

**Visual Result:**
```
┌────────────────────────────────────────┐
│ Header (64px)                          │
└────────────────────────────────────────┘
┌──────┬──────────────────────────────┐
│      │ ↕ 16px gap (content-spacing) │
│ Side │ ┌──────────────────────────┐ │
│ bar  │ │ Settings Cards (2 cols)  │ │ ← Normal padding
│ 192px│ │                          │ │
│      │ └──────────────────────────┘ │
└──────┴──────────────────────────────┘
        ← 24px padding on sides
```

### Design Consistency Rules

1. **All pages with ViewControls MUST**:
   - Wrap ViewControls in `<div className="full-width-section">`
   - Wrap content below in `<div className="content-spacing">`
   - Return a React Fragment `<>...</>` as root element

2. **All pages without ViewControls MUST**:
   - Wrap entire content in `<div className="content-spacing">`
   - Return a single div as root element

3. **ViewControls MUST**:
   - Always be used inside `.full-width-section`
   - Have `sticky top-16 z-30` positioning
   - Include consistent search bar on left, actions on right

4. **Content spacing MUST**:
   - Always use `.content-spacing` class for top spacing
   - Never use inline styles or arbitrary margins for top spacing
   - Maintain consistent 16px (`pt-4`) gap throughout application

5. **Sidebar navigation MUST**:
   - Auto-expand sections based on current route
   - Navigate to first child when parent is clicked
   - Maintain smooth animations for expand/collapse
   - Show active states clearly with purple accent

## Styling & Design System

### Color Palette (globals.css)
- **Primary Purple Scale**: 50-950 shades (#8B5FBF base)
- **Neutral Scale**: 50-900 shades for backgrounds and text
- **Status Colors**: Success (green), Warning (orange), Error (red), Info (blue)
- **Shadow Effects**: Purple-tinted shadows for focus states

### Component Classes
- **Buttons**: Primary, secondary, ghost variants with hover states
- **Form Elements**: Inputs with purple focus rings
- **Cards**: Neutral backgrounds with border styling
- **Progress Bars**: Color-coded fills for metadata tracking
- **Status Indicators**: Dot indicators with semantic colors

### Typography
- **Heading Hierarchy**: h1-h6 with consistent sizing
- **Font Family**: System sans-serif stack
- **Text Colors**: Semantic color classes (text-success, text-error, etc.)
- **Antialiasing**: Enabled for smooth rendering

## Theme System (ThemeContext)
- **Dark Mode Default**: Purple-themed dark interface
- **Light Mode Support**: Automatic color inversions
- **System Preference Detection**: Respects OS theme preference
- **LocalStorage Persistence**: Theme choice saved across sessions
- **Theme Toggle**: Programmatic theme switching capability
