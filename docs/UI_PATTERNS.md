# UI Patterns & Conventions

## Overview

This document defines reusable UI patterns and interaction conventions used throughout Metarr. Following these patterns ensures consistent user experience, predictable behavior, and maintainable code.

---

## Design Principles

### 1. Desktop-First Design

**Target Resolution**: 1920x1080+ desktop browsers

**Rationale:**
- Primary use case is home media server management (desktop environment)
- Complex metadata editing requires screen real estate
- Mobile support deferred to Phase 2

**Implementation:**
- Breakpoints optimize for desktop (1280px, 1600px, 1920px)
- Touch gestures not prioritized
- Keyboard shortcuts and mouse interactions emphasized

---

### 2. Intelligent Defaults with Manual Override

**Philosophy**: "Automation First, User Control Always Available"

**Application:**
- Monitored flag: Automation enabled by default for new movies
- Asset selection: Auto-select highest-rated candidates, user can override
- Field locking: All fields unlocked by default, lock to prevent automation
- Publishing: Backend handles instantly, UI only shows failures

**User Experience:**
- Power users configure once, automation handles routine tasks
- Manual users retain full control without fighting automation
- Locks preserve user intent across all future automation

---

### 3. Progressive Disclosure

**Principle**: Show essential information, hide complexity until needed

**Examples:**
- Movies table: Show asset counts, hide full candidate lists
- MovieEdit tabs: Separate metadata, images, extras into focused views
- Settings: Accordion sections hide advanced configuration
- Asset selection: Modal hides until user needs to change asset

**Benefits:**
- Reduces cognitive load for new users
- Simplifies common workflows
- Maintains access to advanced features

---

### 4. Real-Time Updates

**Principle**: WebSocket-driven UI updates for background operations

**Use Cases:**
- Library scan progress bars update live
- Job queue status changes reflect immediately
- Media player connection status updates in real-time
- Enrichment status badges change as backend processes

**Implementation:**
- WebSocket events trigger React state updates
- Aggregate events to avoid UI spam (batch updates every 500ms)
- Optimistic UI updates for user actions (instant feedback, revert on error)

---

## Common Patterns

### Field Locking Pattern

**Purpose**: Preserve user edits from automation overwrites

**Visual States:**
- **Unlocked**: Gray lock icon (🔓), normal field styling
- **Locked**: Violet lock icon (🔒), subtle border highlight

**Interaction:**
1. User clicks lock icon
2. Icon animates to new state
3. Backend API call: `POST /api/movies/:id/lock-field` or `unlock-field`
4. Toast notification confirms change
5. On failure: State reverts, error toast shown

**Use Cases:**
- Metadata fields: Title, plot, runtime, rating, etc.
- Asset selections: Poster, fanart, logo, etc.
- Applies to movies, TV shows, episodes, music

**Design Decisions:**
- **No Confirmation Dialog**: Direct toggle for speed, locks are easily reversible
- **No Date Stamp in UI**: Lock date stored in database for audit, not shown to user
- **No "Locked By" Display**: UI only shows locked/unlocked state

**Component**: `FieldLockToggle.tsx`

**Example Locations:**
- MovieEdit > Metadata tab: Lock icon next to each field label
- MovieEdit > Images tab: Lock icon on poster/fanart cards
- SeriesEdit > Metadata tab: Same pattern for TV shows

---

### Status Badge Pattern

**Purpose**: Visual indicators for workflow states

**Variants:**

#### Enrichment Status
- **unidentified**: Gray badge, ❓ icon, "Needs Identification"
- **identified**: Yellow badge, 🔄 icon, "Enriching..."
- **enriched**: Green badge, ✓ icon, "Complete"

#### Asset Status
- **none**: Gray background, 0 assets
- **partial**: Yellow background, 1+ assets but incomplete
- **complete**: Green background, all required assets present

#### Connection Status
- **connected**: Green badge, ✓ icon
- **disconnected**: Gray badge, ⚠ icon
- **error**: Red badge, ✗ icon

**Placement:**
- Inline with entity name (table rows, card headers)
- As standalone indicators (status pages, dashboards)

**Accessibility:**
- Color not sole indicator (icon + text label)
- ARIA labels describe full state
- High contrast ratios (WCAG AA minimum)

**Component**: `EnrichmentStatusBadge.tsx`, `ConnectionStatusBadge.tsx`

---

### Full-Viewport Modal Pattern

**Purpose**: Focus user attention on complex selection or configuration tasks

**Characteristics:**
- **Coverage**: Entire viewport (minus header/sidebar on desktop)
- **Backdrop**: Semi-transparent dark overlay (bg-black/50)
- **Z-Index**: 1000 (above all page content)
- **Keyboard Trap**: Focus restricted to modal until closed

**Structure:**
```
┌─────────────────────────────────────┐
│  [X] Modal Title                    │ Header
├─────────────────────────────────────┤
│                                     │
│  Modal Content                      │ Body (scrollable)
│                                     │
├─────────────────────────────────────┤
│  [Cancel]              [Action]     │ Footer
└─────────────────────────────────────┘
```

**Interaction:**
- **Open**: User clicks button, modal animates in (fade + scale)
- **Close**: ESC key, backdrop click, or Cancel button
- **Apply**: Primary action button (Enter key when focused)

**Use Cases:**
- Asset candidate selection (split-pane layout)
- Bulk operations (select multiple movies for action)
- Complex configuration wizards (multi-step forms)

**Design Decisions:**
- **Full-Viewport vs. Centered**: Full viewport for complex tasks requiring screen real estate
- **Backdrop Click**: Closes modal (user intent to dismiss)
- **ESC Key**: Always closes without applying (universal convention)

**Component**: `AssetSelectionModal.tsx`, future: `BulkOperationModal.tsx`

**Example Locations:**
- MovieEdit > Images tab > "Change Poster" button
- Movies page > Bulk select > "Set Monitored" action

---

### Real-Time Progress Pattern

**Purpose**: Show background job progress without blocking UI

**Implementation:**

#### Library Scan Progress
- **Location**: Header, persistent during scan
- **Display**: Progress bar (0-100%), file count, elapsed time
- **Update Frequency**: Every 500ms (WebSocket events aggregated)
- **Dismissible**: No (auto-dismisses on completion)

#### Enrichment Progress
- **Location**: Per-movie row in table, MovieEdit header
- **Display**: EnrichmentStatusBadge component
- **Update Frequency**: On status change (unidentified → identified → enriched)
- **Aggregation**: Backend batches updates to avoid spamming (1 event per movie state change)

#### Job Queue Progress
- **Location**: System > Tasks page
- **Display**: Table of jobs with progress bars
- **Update Frequency**: Real-time per job
- **Filtering**: Show pending, processing, or all jobs

**Design Decisions:**
- **Per-Media Events**: Send enrichment events per movie, not per asset (avoid spam)
- **Aggregate Updates**: Batch WebSocket events to reduce UI re-renders
- **Dismissible Notifications**: Completed job notifications dismissible, in-progress not
- **No Loading Spinners**: For fast operations (<500ms), show results instantly

**Components**: `ProgressBar.tsx`, `JobStatusTable.tsx`

---

### Toast Notification Pattern

**Purpose**: Temporary feedback for user actions and background events

**Variants:**

#### Success Toast
- **Color**: Green background (bg-green-500)
- **Icon**: ✓ checkmark
- **Duration**: 3 seconds
- **Use**: Successful saves, lock toggles, connection tests

#### Error Toast
- **Color**: Red background (bg-red-500)
- **Icon**: ✗ cross
- **Duration**: 5 seconds (longer for errors)
- **Use**: Failed API calls, validation errors, connection failures

#### Info Toast
- **Color**: Blue background (bg-blue-500)
- **Icon**: ℹ info
- **Duration**: 3 seconds
- **Use**: Informational messages, tips, reminders

#### Warning Toast
- **Color**: Yellow background (bg-yellow-500)
- **Icon**: ⚠ warning
- **Duration**: 4 seconds
- **Use**: Non-critical issues, deprecation notices

**Placement:**
- Top-right corner (consistent with most UIs)
- Stack vertically if multiple toasts
- Animate in from right (slide + fade)

**Interaction:**
- Auto-dismiss after duration
- Click to dismiss immediately
- Hover pauses auto-dismiss timer

**Library**: Uses `react-hot-toast` or similar

**Usage:**
```tsx
import { toast } from 'react-hot-toast';

// Success
toast.success('Movie metadata saved successfully');

// Error
toast.error('Failed to connect to TMDB API');

// Info
toast('Library scan started');

// Warning
toast('Some assets failed to download', { icon: '⚠️' });
```

---

### Drag-and-Drop Priority Pattern

**Purpose**: Reorder provider priorities or asset candidates

**Visual Feedback:**
- **Draggable**: Cursor changes to grab hand
- **Dragging**: Item lifts (shadow increases), cursor changes to grabbing hand
- **Drop Target**: Highlight area with border or background change
- **Reordering**: Items smoothly animate to new positions

**Use Cases:**
- Settings > Data Selection: Reorder provider priorities (TMDB, TVDB, FanArt.tv)
- MovieEdit > Actors: Reorder cast list display order

**Library**: `@dnd-kit/core` or `react-beautiful-dnd`

**Accessibility:**
- Keyboard alternative: Arrow keys to move items up/down
- Screen reader announces drag start, drop target, final position
- Focus indicator visible during keyboard navigation

**Example:**
```tsx
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

<DndContext onDragEnd={handleDragEnd}>
  <SortableContext items={providers} strategy={verticalListSortingStrategy}>
    {providers.map(provider => (
      <ProviderCard key={provider.id} provider={provider} />
    ))}
  </SortableContext>
</DndContext>
```

---

### Inline Editing Pattern

**Purpose**: Edit values without opening separate form or modal

**Interaction:**
1. User clicks field or "Edit" icon
2. Field transforms to input (text, select, etc.)
3. User edits value
4. User presses Enter or clicks outside (blur)
5. Value saves to backend (debounced for rapid edits)
6. Field returns to read-only display

**Visual States:**
- **Read-Only**: Normal text, hover shows edit icon
- **Editing**: Input field with focus border, save/cancel buttons
- **Saving**: Loading spinner, input disabled
- **Error**: Red border, error message below

**Use Cases:**
- Quick metadata edits in table rows
- Tag editing (add/remove tags inline)
- Future: Movie title edit in MovieEdit header

**Accessibility:**
- Enter key saves, ESC key cancels
- Tab key navigates to next editable field
- Screen reader announces state change (read-only → editing → saved)

**Component**: `InlineEditField.tsx` (future)

---

### Confirmation Dialog Pattern

**Purpose**: Prevent accidental destructive actions

**Use Cases:**
- Delete movie (removes from database, preserves file)
- Delete asset (removes from cache, irreversible)
- Reset settings to defaults

**Structure:**
```
┌────────────────────────────────┐
│  ⚠ Confirm Deletion            │
├────────────────────────────────┤
│  Are you sure you want to      │
│  delete "The Matrix (1999)"?   │
│                                │
│  This action cannot be undone. │
├────────────────────────────────┤
│  [Cancel]            [Delete]  │
└────────────────────────────────┘
```

**Interaction:**
- Destructive action labeled clearly ("Delete", not "OK")
- Cancel button styled as secondary (gray)
- Destructive button styled as danger (red)
- ESC key cancels, Enter key does NOT confirm (avoid accidents)

**Design Decisions:**
- **No Confirmation for Reversible Actions**: Lock toggles, monitoring toggles
- **Confirmation Only for Destructive Actions**: Delete, reset, clear cache
- **No "Are you sure?" for "Are you sure?"**: Single confirmation, not double

**Component**: `ConfirmDialog.tsx`

---

### Empty State Pattern

**Purpose**: Guide users when no data exists

**Variants:**

#### No Data in Database
```
┌────────────────────────────────┐
│        📂                      │
│  No movies in your library yet │
│                                │
│  [Scan Library]                │
└────────────────────────────────┘
```

#### No Search Results
```
┌────────────────────────────────┐
│        🔍                      │
│  No movies found matching      │
│  "The Matrxi"                  │
│                                │
│  Try adjusting your search     │
└────────────────────────────────┘
```

#### No Assets Available
```
┌────────────────────────────────┐
│        🖼                      │
│  No poster candidates found    │
│                                │
│  [Manually Upload]             │
└────────────────────────────────┘
```

**Structure:**
- Large icon (related to missing content)
- Descriptive message (concise, actionable)
- Call-to-action button (when applicable)
- Centered layout with padding

**Accessibility:**
- Icon has ARIA label describing state
- Message is semantic heading (h2/h3)
- Button has descriptive label

---

### Table Sorting Pattern

**Purpose**: Allow users to sort table data by column

**Visual Indicators:**
- **Unsorted**: Column header normal, hover shows sort icon
- **Ascending**: ↑ arrow icon, column header highlighted
- **Descending**: ↓ arrow icon, column header highlighted

**Interaction:**
1. User clicks column header
2. Table sorts ascending on first click
3. Second click toggles to descending
4. Third click removes sort (returns to default)

**Implementation:**
- Frontend sorting: For small datasets (<1000 rows)
- Backend sorting: For large datasets (pass `?sort=title&order=asc` to API)

**Accessibility:**
- Column headers are buttons with ARIA sort attributes
- Screen reader announces sort direction change
- Keyboard navigation: Tab to column, Enter to sort

**Component**: `SortableTableHeader.tsx`

---

### Filter Panel Pattern

**Purpose**: Narrow down displayed data by criteria

**Layout:**
- **Collapsed**: "Filters" button shows count of active filters
- **Expanded**: Panel slides in from right or top
- **Filters**: Grouped by category (metadata, assets, status)

**Interaction:**
1. User clicks "Filters" button
2. Panel expands
3. User selects filter criteria (checkboxes, dropdowns, sliders)
4. Table/grid updates live (debounced for performance)
5. User clicks "Clear All" to reset or closes panel

**Active Filter Indicators:**
- Badge on "Filters" button: "(3)" active filters
- Chips below table: "Genre: Action ✗", "Year: 1999 ✗"
- Click chip to remove individual filter

**Use Cases:**
- Movies page: Filter by genre, year, studio, monitoring status
- Asset candidates: Filter by provider, resolution, language
- Job history: Filter by status, type, date range

**Component**: `FilterPanel.tsx`, `FilterChip.tsx`

---

## Responsive Breakpoints

**Desktop-First Strategy**: Design for desktop, adapt down for tablet/mobile

### Breakpoints

| Name | Min Width | Target Devices | Notes |
|------|-----------|----------------|-------|
| **xs** | 0px | Mobile (portrait) | Deferred to Phase 2 |
| **sm** | 640px | Mobile (landscape) | Deferred to Phase 2 |
| **md** | 768px | Tablet | Minimal support (Phase 1) |
| **lg** | 1024px | Small desktop | Sidebar collapses to icons |
| **xl** | 1280px | Desktop | Primary target |
| **2xl** | 1600px | Large desktop | Optimal layout |
| **3xl** | 1920px | Full HD+ | Maximum information density |

### Component Adaptations

**Sidebar:**
- `<lg`: Collapses to icon-only (64px width)
- `>=lg`: Full width with labels (192px width)

**Movies Table:**
- `<md`: Not supported (Phase 2)
- `md-lg`: Reduce columns, hide non-essential metadata
- `>=xl`: Full table with all columns

**Asset Selection Modal:**
- `<md`: Not supported (Phase 2)
- `md-lg`: Stacked layout (current selection on top, candidates below)
- `>=xl`: Split-pane layout (30/70)

---

## Animation Guidelines

**Principle**: Animations should enhance, not distract

### Duration Standards

| Type | Duration | Easing | Use Case |
|------|----------|--------|----------|
| **Micro** | 100-150ms | ease-out | Hover effects, button presses |
| **Short** | 200-300ms | ease-in-out | Tab transitions, dropdowns |
| **Medium** | 300-500ms | ease-in-out | Modal open/close, sidebar expand |
| **Long** | 500-800ms | ease-in-out | Page transitions (rare) |

### Common Animations

**Fade In/Out:**
- Opacity: 0 → 1 (fade in), 1 → 0 (fade out)
- Duration: 200ms
- Use: Toast notifications, tooltips

**Slide:**
- Transform: translateX(-100%) → translateX(0)
- Duration: 300ms
- Use: Sidebar expand, filter panel open

**Scale:**
- Transform: scale(0.95) → scale(1)
- Duration: 150ms
- Use: Modal open, button press

**Sliding Indicator (AnimatedTabs):**
- Transform: translateX() based on active tab position
- Duration: 300ms
- Easing: ease-in-out
- Use: Tab indicator animation

### Reduced Motion

**Accessibility**: Respect `prefers-reduced-motion` media query

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## See Also

- **[FRONTEND_TYPES.md](FRONTEND_TYPES.md)** - Type system and data structures
- **[FRONTEND_COMPONENTS.md](FRONTEND_COMPONENTS.md)** - Component library and usage
- **[ASSET_SELECTION_UI.md](ASSET_SELECTION_UI.md)** - Asset selection modal design
- **[UI_DESIGN.md](UI_DESIGN.md)** - Color scheme, typography, layout system
