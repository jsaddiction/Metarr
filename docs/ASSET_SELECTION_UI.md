# Asset Selection UI Design

## Overview

Metarr uses a **full-viewport modal design** for selecting asset candidates from multiple providers. This approach focuses user attention on the selection task while providing rich visual comparison between current selection and available alternatives.

**Design Philosophy:**
- Desktop-first (optimized for 1920x1080+ screens)
- Split-pane comparison (current vs. candidates)
- Visual-first decision making (large previews, minimal metadata)
- Instant feedback (no loading spinners for local actions)

---

## Layout Architecture

### Full-Viewport Modal

**Dimensions:**
- Width: 100vw (minus sidebar if desktop)
- Height: 100vh (minus header)
- Z-Index: 1000 (above all content)
- Position: Fixed, covers entire viewport
- Backdrop: Semi-transparent dark overlay (bg-black/50)

**Why Full-Viewport?**
- Asset selection is a focused task requiring full attention
- Large preview images need significant screen real estate
- Comparison between current and candidates benefits from side-by-side layout
- Eliminates distraction from underlying page content

---

### Split-Pane Design

```
┌─────────────────────────────────────────────────────────────┐
│  [X] Select Poster for The Matrix (1999)                   │ ← Header
├─────────────────┬───────────────────────────────────────────┤
│                 │                                           │
│  Current        │  Candidates                               │
│  Selection      │                                           │
│  (30% width)    │  (70% width)                              │
│                 │                                           │
│  ┌───────────┐  │  [Filter: All Providers ▼] [Sort: Votes ▼]│
│  │           │  │                                           │
│  │  Poster   │  │  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐     │
│  │  Preview  │  │  │    │ │    │ │    │ │    │ │    │     │
│  │  (Large)  │  │  │ 1  │ │ 2  │ │ 3  │ │ 4  │ │ 5  │     │
│  │           │  │  │    │ │    │ │    │ │    │ │    │     │
│  └───────────┘  │  └────┘ └────┘ └────┘ └────┘ └────┘     │
│                 │                                           │
│  Provider: TMDB │  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐     │
│  Resolution:    │  │    │ │    │ │    │ │    │ │    │     │
│    1000 x 1500  │  │ 6  │ │ 7  │ │ 8  │ │ 9  │ │ 10 │     │
│  Votes: 234     │  │    │ │    │ │    │ │    │ │    │     │
│                 │  └────┘ └────┘ └────┘ └────┘ └────┘     │
│  [🔒 Lock]      │                                           │
│  [Remove]       │  (Scrollable grid continues...)          │
│                 │                                           │
└─────────────────┴───────────────────────────────────────────┘
│  [Cancel]                                    [Apply]        │ ← Footer
└─────────────────────────────────────────────────────────────┘
```

**Pane Widths:**
- Left Pane: 30% (minimum 320px)
- Right Pane: 70% (flexible)
- Divider: 1px border, no drag resize (desktop-first, simplicity)

---

## Left Pane: Current Selection

### Content Structure

**When Asset Selected:**
```
┌─────────────────────┐
│                     │
│   Large Preview     │
│   (Fit to pane)     │
│                     │
├─────────────────────┤
│ Provider: TMDB      │
│ Resolution: 1000x1500│
│ Votes: 234          │
│ Language: en        │
├─────────────────────┤
│ [🔒 Lock Asset]     │ ← Toggle button
│ [🗑 Remove]         │ ← Unassign button
└─────────────────────┘
```

**When No Asset Selected:**
```
┌─────────────────────┐
│                     │
│   ⬜ No poster     │
│   selected          │
│                     │
│   Select from       │
│   candidates →      │
│                     │
└─────────────────────┘
```

### Metadata Display

| Field | Description | Example |
|-------|-------------|---------|
| **Provider** | Source of asset | "TMDB", "TVDB", "FanArt.tv" |
| **Resolution** | Image dimensions | "1000 x 1500" |
| **Votes** | Provider vote count | "234 votes" |
| **Language** | Asset language code | "en", "fr", "de" |
| **Aspect Ratio** | Calculated ratio | "2:3" (for posters) |

### Action Buttons

**Lock Asset Toggle:**
- Visual: 🔒 icon with "Lock" / "Unlock" label
- State: Active (violet) when locked, gray when unlocked
- Click: Toggles lock state, updates database
- Tooltip: "Prevent automation from changing this asset"

**Remove Button:**
- Visual: 🗑 icon with "Remove" label
- Action: Unassigns asset, sets foreign key to NULL
- Does NOT delete from cache
- Confirmation: None (instant, reversible via candidate selection)

---

## Right Pane: Candidate Grid

### Filter & Sort Bar

**Filter Dropdown:**
```
[Filter: All Providers ▼]
  - All Providers
  - TMDB
  - TVDB
  - FanArt.tv
  - Local Files
```

**Sort Dropdown:**
```
[Sort: Votes (High to Low) ▼]
  - Votes (High to Low)
  - Votes (Low to High)
  - Resolution (Largest)
  - Resolution (Smallest)
  - Date Added (Newest)
  - Date Added (Oldest)
  - Provider (A-Z)
```

**Search Input** (optional, Phase 2):
```
[🔍 Search by language, provider...]
```

### Candidate Grid Layout

**Responsive Grid:**
- Desktop (>1920px): 6 columns
- Desktop (1600-1920px): 5 columns
- Desktop (1280-1600px): 4 columns
- Tablet (768-1280px): 3 columns
- Mobile (<768px): 2 columns (deferred to Phase 2)

**Grid Spacing:**
- Gap: 16px between cards
- Padding: 24px around grid
- Scroll: Vertical, smooth scrolling

### Candidate Card Design

**Card Structure:**
```
┌──────────────┐
│              │
│   Thumbnail  │ ← Hover to enlarge
│              │
├──────────────┤
│ TMDB  1000px │ ← Provider badge, resolution
│ ⭐ 234       │ ← Votes
└──────────────┘
```

**Hover Effect:**
- Scale: 1.05x (smooth transition)
- Shadow: Drop shadow increases
- Cursor: Pointer
- Overlay: Checkmark icon fades in (if selected)

**Selected State:**
- Border: 2px solid violet (primary-500)
- Background: Subtle violet tint
- Checkmark: Visible in top-right corner

**Card Click Behavior:**
1. User clicks candidate card
2. Left pane instantly updates with new preview
3. Card gains "selected" visual state
4. Previous selection (if any) loses "selected" state
5. No backend call yet (local state only)

---

## Modal Controls

### Header

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  [X]  Select Poster for The Matrix (1999)              │
└─────────────────────────────────────────────────────────┘
```

**Elements:**
- Close button (X): Top-right, closes modal without applying
- Title: "Select {AssetType} for {MovieTitle}"
- Asset type: "Poster", "Fanart", "Landscape", etc.

### Footer

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  [Cancel]                                    [Apply]    │
└─────────────────────────────────────────────────────────┘
```

**Cancel Button:**
- Position: Left side
- Action: Closes modal, discards local selection
- Keyboard: ESC key

**Apply Button:**
- Position: Right side
- Style: Primary (violet)
- Action: Saves selection to database, closes modal
- Disabled: If no changes made
- Keyboard: Enter key (when focused)

---

## User Flow

### Opening Modal

**Trigger Points:**
- MovieEdit > Images tab > "Change Poster" button
- MovieEdit > Images tab > Poster card click
- Similar for all asset types

**Modal Open Sequence:**
1. User clicks "Change Poster"
2. Frontend fetches asset candidates: `GET /api/movies/:id/asset-candidates/poster`
3. Modal opens with current selection (if exists) in left pane
4. Candidates display in right pane grid
5. Focus moves to modal (keyboard trap)

### Selecting Asset

**Selection Sequence:**
1. User clicks candidate thumbnail in grid
2. Left pane instantly updates with large preview
3. Candidate card gains "selected" border
4. Apply button becomes enabled
5. User reviews metadata (resolution, votes, provider)
6. User clicks "Apply"

### Applying Selection

**Apply Sequence:**
1. User clicks "Apply" button
2. Frontend sends: `POST /api/movies/:id/assets/poster/select { candidate_id: 123 }`
3. Backend:
   - Downloads asset to cache (if not already cached)
   - Updates movie.poster_id foreign key
   - Creates publishing job to copy to library (if auto-publish enabled)
4. Frontend:
   - Closes modal
   - Updates MovieEdit page with new poster
   - Shows success toast
   - Re-fetches movie detail to sync state

**Error Handling:**
- Download fails: Show error toast, keep modal open, allow retry
- Network error: Show error toast, keep modal open, preserve selection
- Validation error: Show inline error, prevent submission

### Canceling Selection

**Cancel Sequence:**
1. User clicks "Cancel" or presses ESC
2. Modal closes immediately
3. No backend call
4. Local selection state discarded
5. MovieEdit page unchanged

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **ESC** | Cancel and close modal |
| **Enter** | Apply selection (if Apply button focused) |
| **Tab** | Navigate between candidates, buttons |
| **Arrow Keys** | Navigate grid (future enhancement) |
| **Space** | Select focused candidate |

---

## Progressive Loading Strategy

### Initial Load

1. Show modal skeleton immediately (avoid flash)
2. Load current selection metadata (fast, already in memory)
3. Load candidate thumbnails (lazy load, progressive JPEG)
4. Show loading spinner only if >500ms

### Thumbnail Loading

**Strategy:**
- Use low-quality placeholder (LQIP) base64 images
- Load full thumbnails progressively (IntersectionObserver)
- Cache thumbnails in browser (HTTP cache headers)

**Fallback:**
- Missing thumbnail: Show provider logo + resolution text
- Failed load: Show broken image icon + retry button

### Full Preview on Hover

**Strategy:**
- Thumbnail size: 200px width (optimized for grid)
- Full preview: Load on demand when hovering candidate
- Cache: Store in memory for session duration
- Lazy load: Only load visible + next 10 candidates

---

## Responsive Breakpoints

### Desktop (Primary Target)

**1920x1080+:**
- Modal: Full viewport
- Left pane: 30% (576px)
- Right pane: 70% (1344px)
- Grid: 6 columns

**1600x900:**
- Modal: Full viewport
- Left pane: 30% (480px)
- Right pane: 70% (1120px)
- Grid: 5 columns

**1280x720:**
- Modal: Full viewport
- Left pane: 30% (384px)
- Right pane: 70% (896px)
- Grid: 4 columns

### Tablet (Deferred)

**768x1024:**
- Modal: Full screen
- Left pane: Collapses to tab/accordion
- Right pane: Full width
- Grid: 3 columns

### Mobile (Deferred)

**<768px:**
- Modal: Full screen
- Left pane: Header section only
- Right pane: Full width
- Grid: 2 columns
- Touch gestures for navigation

---

## Technical Implementation

### Component Structure

```
AssetSelectionModal/
├── AssetSelectionModal.tsx          (Main container)
├── CurrentSelectionPane.tsx         (Left pane)
├── CandidateGrid.tsx                (Right pane)
├── CandidateCard.tsx                (Individual candidate)
├── FilterSortBar.tsx                (Filter/sort controls)
└── hooks/
    ├── useAssetCandidates.ts        (Fetch candidates)
    └── useAssetSelection.ts         (Selection state)
```

### State Management

**Local State:**
```typescript
interface AssetSelectionState {
  selectedCandidateId: number | null; // Local selection (not yet applied)
  candidates: AssetCandidate[];
  currentAsset: Asset | null;
  filterProvider: string | null;
  sortBy: 'votes' | 'resolution' | 'date';
  sortOrder: 'asc' | 'desc';
}
```

**Backend Sync:**
- No backend calls until "Apply" clicked
- Selection stored in local state only
- Apply triggers single POST request

### API Integration

**Fetch Candidates:**
```typescript
GET /api/movies/:id/asset-candidates/poster
Response: {
  current: Asset | null,
  candidates: AssetCandidate[]
}
```

**Apply Selection:**
```typescript
POST /api/movies/:id/assets/poster/select
Body: { candidate_id: 123 }
Response: { success: true, asset: Asset }
```

---

## Future Enhancements

### Phase 2
- Mobile/tablet responsive design
- Drag-and-drop reordering for multi-asset types
- Bulk selection (select poster + fanart + landscape in one modal)
- Image editing (crop, resize, filters)

### Phase 3
- Custom upload (user-provided images)
- AI-powered recommendations (rank candidates by quality)
- A/B comparison mode (side-by-side comparison of 2 candidates)

---

## Design Decisions

### Why Full-Viewport Modal?

**Alternatives Considered:**
- Inline expansion: Clutters MovieEdit page, limited preview size
- Sidebar drawer: Too narrow for proper image comparison
- New page: Requires navigation, loses context

**Decision Rationale:**
- Asset selection is a focused task requiring full attention
- Large previews essential for quality assessment
- Split-pane allows direct comparison
- Modal maintains context (user knows they're editing movie X)

### Why Split-Pane Instead of Tabs?

**Alternatives Considered:**
- Tab 1: Current, Tab 2: Candidates
- Accordion: Expand/collapse sections

**Decision Rationale:**
- Direct comparison is core to decision-making
- Switching tabs slows down workflow
- Side-by-side layout mirrors common design patterns (e.g., file managers)

### Why No Drag Resize on Divider?

**Decision Rationale:**
- Desktop-first design: 70/30 split optimized for common resolutions
- Simplicity: Fewer UI controls, clearer intent
- Deferred to Phase 2: Can add if user testing shows need

---

## See Also

- **[FRONTEND_TYPES.md](FRONTEND_TYPES.md)** - Type system for asset data structures
- **[FRONTEND_COMPONENTS.md](FRONTEND_COMPONENTS.md)** - Component library and patterns
- **[UI_PATTERNS.md](UI_PATTERNS.md)** - Common UI patterns and conventions
- **[API_ARCHITECTURE.md](API_ARCHITECTURE.md)** - Backend API endpoints for asset management
