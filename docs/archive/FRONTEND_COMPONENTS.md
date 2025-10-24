# Frontend Components & Implementations

## UI Component Library

Metarr uses **shadcn/ui** as its foundational component library for consistent, accessible, and themeable UI components.

**See:** [UI_COMPONENT_LIBRARY.md](./UI_COMPONENT_LIBRARY.md) for complete documentation on:
- shadcn/ui architecture and setup
- Available components (Button, Card, Input, etc.)
- Usage examples and best practices
- Migration strategy from legacy components
- Customization guidelines

## Movie Metadata Management

The Movies page implements a comprehensive metadata tracking system with fuzzy search filtering and three distinct view modes.

### Fuzzy Search Filtering (Fuse.js)
- **Real-time Filtering**: Updates as user types in ViewControls search bar
- **Fuzzy Matching**: Intelligent search - typing "Empire" finds "The empire strikes back"
- **Search Configuration**:
  - Keys: `title`, `studio`
  - Threshold: 0.4 (allows moderate typos/differences)
  - `ignoreLocation: true` - matches anywhere in text
  - `includeScore: true` - enables relevance sorting
- **Empty States**:
  - No movies in database: "No movies in your library yet. Scan a library to get started"
  - No search results: "No movies found matching '{searchTerm}'. Try adjusting your search terms"
- **Performance**: Uses `useMemo` for optimized re-computation only when search term changes

### View Modes

#### Table View (MovieTableView)
- **Props**:
  - `movies: Movie[]` - Array of movies to display
  - `onMovieClick?: (movie: Movie) => void` - Callback when row is clicked
- **3-Column Layout**: Title (25%), Metadata (auto), Actions (80px)
- **Comprehensive Metadata Tracking**:
  - NFO file status with progress indication
  - 8 image types tracked: poster, fanart, landscape, keyart, banner, clearart, clearlogo, discart
  - Media assets: trailers, subtitles, theme songs
  - Count badges for multiple assets (e.g., 3 trailers, 5 subtitles)
- **Visual Indicators**:
  - Green icons for available assets, gray for missing
  - FontAwesome icons for each asset type (all marked `aria-hidden="true"` for screen readers)
  - Tooltips showing asset descriptions
- **Single-Row Metadata**: All metadata indicators displayed in one condensed row
- **Refresh Action**: Per-movie metadata refresh button with `aria-label` for accessibility
- **Accessibility**: All icons properly labeled for screen readers, table structure semantic

#### Poster View (MoviePosterView)
- **Responsive Grid**: 2-6 columns depending on screen size
- **Poster Cards**: 2:3 aspect ratio with hover overlay
- **Hover Actions**: View, Edit, Delete buttons on hover
- **Status Badges**: Color-coded badges (monitored/unmonitored/missing)
- **Smooth Transitions**: Scale effect on hover

#### Overview View (MovieOverviewView)
- **Detailed Cards**: Expanded view with poster, description, and metadata
- **Comprehensive Info**: Studio, quality profile, IMDB rating, runtime
- **Description Text**: Full movie synopsis
- **Action Buttons**: View, Edit, Delete with icon indicators
- **Runtime Formatting**: Displays hours and minutes (e.g., "2h 15m")

## Movie Edit Page (MovieEdit)
- **URL Pattern**: `/metadata/movies/:id/edit`
- **Data Loading**: Uses `useMovie(movieId, ['files'])` to load full movie data including all files in single request
- **Header Section**:
  - Back button (FontAwesome arrow-left icon) - navigates to `/metadata/movies`
  - Dynamic title: "Edit Movie: {movieTitle}"
  - Save button (primary style with save icon)
- **Tabbed Interface**: Uses AnimatedTabs component
  - Three tabs: Metadata, Images, Extras
  - Smooth sliding indicator animation
  - Keyboard navigation support
  - Tab transitions: smooth sliding indicator with 300ms animation
- **Tab Content** (Current Implementation):
  - **Metadata Tab**: Placeholder for full metadata editing (scalar and array data with modal system)
  - **Images Tab**: Image asset management (poster, fanart, etc.) with rebuild assets functionality
  - **Extras Tab**: Extras management (trailers, subtitles, themes) with unknown files handling
- **Navigation Behavior**:
  - Clicking a movie row in Movies page navigates to edit page
  - Sidebar maintains "Movies" active state using path pattern matching
  - Back button returns to movies list

## Theme System Integration

All components in Metarr are **fully theme-aware** and support both dark mode (default) and light mode with automatic styling adjustments. The theme system is implemented at the CSS level using Tailwind utility classes with comprehensive overrides.

### How Components Adapt to Themes

**Automatic Theme Support**: Components using standard Tailwind classes automatically adapt when the theme changes. No JavaScript changes are required.

**Key Theme-Aware Classes**:
- **Backgrounds**: `bg-neutral-900`, `bg-neutral-800` → Automatically switch to `bg-white`, `bg-neutral-50` in light mode
- **Text Colors**: `text-white`, `text-neutral-300` → Automatically switch to `text-neutral-900`, `text-neutral-600` in light mode
- **Borders**: `border-neutral-700` → Automatically switch to `border-neutral-300` in light mode
- **Hover States**: Hover effects automatically adjust contrast for both themes

**Component-Specific Adaptations**:
- **Header**: Background switches from dark gray to white with proper border contrast
- **Sidebar**: Background, hover states, and active indicators adapt seamlessly
- **Modals**: Overlay opacity and container styling optimized for each theme
- **Cards**: Backgrounds, borders, and shadows adjusted for proper depth perception
- **Forms**: Input backgrounds, borders, and focus rings maintain WCAG compliance
- **Buttons**: Primary, secondary, and ghost variants maintain proper contrast ratios
- **Tables**: Row borders and hover states automatically adjust

### WCAG Compliance

Both themes are designed to meet **WCAG 2.1 Level AA** standards (most elements achieve AAA):

**Dark Mode**:
- Body text: 18.6:1 ratio (AAA)
- Secondary text: 8.3:1 ratio (AAA)
- Links: 7.9:1 ratio (AAA)

**Light Mode**:
- Body text: 18.6:1 ratio (AAA)
- Secondary text: 8.3:1 ratio (AAA)
- Links: 7.9:1 ratio (AAA)
- Buttons: 5.2:1+ ratio (AA)

### Adding Theme Support to New Components

When creating new components, follow these guidelines:

1. **Use Semantic Color Classes**: Use `bg-neutral-*`, `text-neutral-*`, `border-neutral-*` instead of hardcoded colors
2. **Test Both Themes**: Verify your component in both dark and light modes
3. **Avoid Inline Styles**: Use Tailwind classes for automatic theme adaptation
4. **Check Contrast**: Ensure text remains readable in both themes

**Example - Theme-Aware Component**:
```tsx
// ✅ GOOD - Automatically theme-aware
export const MyCard: React.FC = () => (
  <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
    <h3 className="text-white text-lg font-semibold mb-2">Card Title</h3>
    <p className="text-neutral-300">Card content that adapts to theme changes.</p>
  </div>
);

// ❌ BAD - Hardcoded colors don't adapt
export const MyCard: React.FC = () => (
  <div style={{ background: '#2D2D2D', border: '1px solid #3A3A3A' }}>
    <h3 style={{ color: '#FFFFFF' }}>Card Title</h3>
    <p style={{ color: '#B0B0B0' }}>This won't adapt to light mode.</p>
  </div>
);
```

### Theme Toggle Implementation

The theme toggle is located in the Header component and managed by the `ThemeContext`:

```tsx
import { useTheme } from '../../contexts/ThemeContext';

const { theme, toggleTheme } = useTheme();

<button
  className="btn btn-ghost p-2"
  onClick={toggleTheme}
  aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
>
  <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} />
</button>
```

**Features**:
- **Instant Theme Switching**: No page reload required
- **localStorage Persistence**: Theme preference saved across sessions
- **System Preference Detection**: Respects user's OS theme preference on first visit
- **Smooth Transitions**: CSS transitions for visual smoothness

### Testing Components in Both Themes

When developing or modifying components, always test in both themes:

1. Open the application in your browser
2. Click the theme toggle button (sun/moon icon in header)
3. Verify:
   - All text is readable (proper contrast)
   - Backgrounds are appropriate (not too bright or too dark)
   - Borders are visible
   - Hover states work correctly
   - Focus indicators are visible
   - Icons have proper contrast

**See also**: `docs/LIGHT_MODE_TESTING_CHECKLIST.md` for comprehensive testing procedures.

## Reusable UI Components

### FieldLockToggle Component

**Location**: `public/frontend/src/components/ui/FieldLockToggle.tsx`

**Purpose**: Lock/unlock individual metadata or asset fields to prevent automation from overwriting user edits

**Features:**
- **Visual States**: Unlocked (🔓 gray) → Locked (🔒 violet)
- **Direct Toggle**: Single click toggles state, no confirmation dialog
- **Backend Integration**: Calls lock/unlock API endpoints
- **Toast Notifications**: Success/failure feedback
- **Inline Display**: Appears next to field labels or asset cards

**Props:**
```typescript
interface FieldLockToggleProps {
  fieldName: string;        // e.g., "title", "poster", "plot"
  locked: boolean;          // Current lock state
  onChange: (locked: boolean) => void; // State update callback
  disabled?: boolean;       // Disable toggle during API call
  className?: string;       // Additional CSS classes
}
```

**Behavior:**
1. User clicks lock icon
2. Component calls: `POST /api/movies/:id/lock-field` or `POST /api/movies/:id/unlock-field`
3. Backend updates `{field_name}_locked` column
4. On success: Toast notification, icon updates
5. On failure: Toast error, state reverts

**Styling:**
- **Unlocked**: Gray lock icon (text-neutral-400), transparent background
- **Locked**: Violet lock icon (text-primary-500), subtle violet background (bg-primary-500/10)
- **Hover**: Background darkens, cursor pointer
- **Disabled**: Opacity 50%, cursor not-allowed

**Usage Example:**
```tsx
// Metadata field lock
<div className="flex items-center justify-between">
  <label>Title</label>
  <FieldLockToggle
    fieldName="title"
    locked={movie.title_locked}
    onChange={(locked) => handleLockToggle('title', locked)}
  />
</div>

// Asset lock
<div className="relative">
  <img src={posterUrl} alt="Poster" />
  <FieldLockToggle
    fieldName="poster"
    locked={movie.poster_locked}
    onChange={(locked) => handleLockToggle('poster', locked)}
    className="absolute top-2 right-2"
  />
</div>
```

**Accessibility:**
- ARIA label: "Lock {fieldName}" / "Unlock {fieldName}"
- Keyboard accessible: Tab to focus, Space/Enter to toggle
- Screen reader announces state changes

**Design Decisions:**
- **No Date Stamp**: Lock date not displayed in UI (stored in database for audit, not shown to user)
- **No Confirmation Dialog**: Direct toggle for speed, locks are easily reversible
- **No "Locked By" Display**: UI only shows locked/unlocked, details in backend logs

---

### EnrichmentStatusBadge Component

**Location**: `public/frontend/src/components/movie/EnrichmentStatusBadge.tsx`

**Purpose**: Show movie enrichment workflow state with visual indicators

**Features:**
- **Color-Coded States**: Gray (unidentified), Yellow (in progress), Green (complete)
- **Optional Label**: Show text label or icon-only
- **Compact Design**: Fits inline with movie title or table cell

**Props:**
```typescript
interface EnrichmentStatusBadgeProps {
  status: 'unidentified' | 'identified' | 'enriched';
  showLabel?: boolean;      // Default: true
  className?: string;
}
```

**Status Variants:**

| Status | Color | Icon | Label | Description |
|--------|-------|------|-------|-------------|
| **unidentified** | Gray (neutral-400) | ❓ | "Needs Identification" | Movie file discovered, TMDB/IMDB ID unknown |
| **identified** | Yellow (yellow-500) | 🔄 | "Enriching..." | Provider ID found, metadata fetch in progress |
| **enriched** | Green (green-500) | ✓ | "Complete" | Metadata fetched, assets available |

**Styling:**
- Badge: Rounded pill shape (rounded-full)
- Padding: px-2 py-1
- Font: text-xs font-medium
- Background: Semi-transparent color fill

**Usage:**
```tsx
// In table view
<td>
  <div className="flex items-center gap-2">
    <span>{movie.title}</span>
    <EnrichmentStatusBadge status={movie.enrichment_status} showLabel={false} />
  </div>
</td>

// In MovieEdit header
<div className="flex items-center gap-3">
  <h1>Edit Movie: {movie.title}</h1>
  <EnrichmentStatusBadge status={movie.enrichment_status} />
</div>
```

**Behavior:**
- Static display component (no user interaction)
- Updates automatically when movie.enrichment_status changes
- No loading spinners (status is always current)

**Accessibility:**
- ARIA label includes full status text
- Color not sole indicator (icon + label for clarity)

---

### AssetSelectionModal Component

**Location**: `public/frontend/src/components/asset/AssetSelectionModal.tsx`

**Purpose**: Full-viewport modal for selecting asset candidates from multiple providers

**Features:**
- **Full-Viewport Design**: Covers entire screen for focused selection
- **Split-Pane Layout**: Current selection (30%) vs. candidates (70%)
- **Progressive Loading**: Lazy-load thumbnails, instant preview updates
- **Filter & Sort**: Provider filtering, sort by votes/resolution/date
- **Keyboard Navigation**: ESC to cancel, Enter to apply, Tab navigation

**Props:**
```typescript
interface AssetSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  movieId: number;
  movieTitle: string;
  assetType: 'poster' | 'fanart' | 'landscape' | 'keyart' | 'banner' | 'clearart' | 'clearlogo' | 'discart';
  currentAssetId?: number | null;
  onApply: (candidateId: number) => Promise<void>;
}
```

**Layout Structure:**
```
┌─────────────────────────────────────────────────────────┐
│  [X] Select Poster for The Matrix (1999)               │ Header
├─────────────┬───────────────────────────────────────────┤
│ Current     │ Candidates                                │
│ Selection   │ [Filter: All ▼] [Sort: Votes ▼]          │
│ (30%)       │ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐           │
│             │ │   │ │   │ │   │ │   │ │   │           │ Content
│             │ └───┘ └───┘ └───┘ └───┘ └───┘           │
│             │ (Scrollable grid)                         │
└─────────────┴───────────────────────────────────────────┘
│  [Cancel]                              [Apply]          │ Footer
└─────────────────────────────────────────────────────────┘
```

**Behavior:**
1. User clicks "Change Poster" in MovieEdit > Images tab
2. Modal opens, fetches candidates: `GET /api/movies/:id/asset-candidates/poster`
3. User clicks candidate thumbnail → Left pane updates instantly
4. User clicks "Apply" → Backend call: `POST /api/movies/:id/assets/poster/select`
5. Modal closes, MovieEdit refreshes with new asset

**Keyboard Shortcuts:**
- **ESC**: Cancel and close
- **Enter**: Apply selection (when focused)
- **Tab**: Navigate between candidates and buttons

**See Also:** [ASSET_SELECTION_UI.md](ASSET_SELECTION_UI.md) for complete design specification

---

### AnimatedTabs Component

**Location**: `public/frontend/src/components/ui/AnimatedTabs.tsx`

A reusable tabbed interface component built on Radix UI with smooth sliding indicator animation.

**Features**:
- **Smooth Sliding Indicator**: 300ms transition animation that slides between active tabs
- **Full Keyboard Navigation**: Built on Radix UI primitives (Arrow keys, Home, End, Tab)
- **Accessibility**: ARIA attributes, screen reader support, focus management
- **Flexible Content**: Supports text labels, icons, or custom React elements
- **Theme-Aware**: Adapts to dark/light mode automatically
- **TypeScript**: Fully typed with generic value types

**Props**:
```typescript
interface AnimatedTabsProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  tabs: Array<{
    value: T;
    label: React.ReactNode;
  }>;
  children: React.ReactNode;
  className?: string;
}
```

**Usage Example**:
```tsx
import { AnimatedTabs, AnimatedTabsContent } from '@/components/ui/AnimatedTabs';

type TabType = 'metadata' | 'images' | 'extras';

const [activeTab, setActiveTab] = useState<TabType>('metadata');

<AnimatedTabs
  value={activeTab}
  onValueChange={(value) => setActiveTab(value)}
  tabs={[
    { value: 'metadata', label: 'Metadata' },
    { value: 'images', label: 'Images' },
    { value: 'extras', label: 'Extras' },
  ]}
  className="mb-6"
>
  <AnimatedTabsContent value="metadata" className="space-y-6">
    {/* Metadata content */}
  </AnimatedTabsContent>
  <AnimatedTabsContent value="images" className="space-y-6">
    {/* Images content */}
  </AnimatedTabsContent>
  <AnimatedTabsContent value="extras" className="space-y-6">
    {/* Extras content */}
  </AnimatedTabsContent>
</AnimatedTabs>
```

**Usage with Icons (DataSelection Example)**:
```tsx
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilm, faTv, faMusic } from '@fortawesome/free-solid-svg-icons';

<AnimatedTabs
  value={activeTab}
  onValueChange={(value) => setActiveTab(value as MediaType)}
  tabs={[
    {
      value: 'movies',
      label: (
        <span className="flex items-center gap-2">
          <FontAwesomeIcon icon={faFilm} />
          <span>Movies</span>
        </span>
      ),
    },
    {
      value: 'tvshows',
      label: (
        <span className="flex items-center gap-2">
          <FontAwesomeIcon icon={faTv} />
          <span>TV Shows</span>
        </span>
      ),
    },
    // ...
  ]}
>
  {/* Tab content */}
</AnimatedTabs>
```

**Implementation Details**:
- Built on `@radix-ui/react-tabs` for accessibility and keyboard navigation
- Sliding indicator uses CSS transforms for smooth 60fps animation
- Indicator position calculated dynamically based on active tab
- Uses `useEffect` to update indicator position when active tab changes
- Content fades in/out with CSS transitions (200ms)

**When to Use**:
- Multi-section forms or settings pages (Providers, Libraries)
- Different views of the same data (MovieEdit: Metadata, Images, Extras)
- Categorized configuration options (DataSelection: Movies, TV Shows, Music)
- Any interface with 2-5 related sections that shouldn't be shown simultaneously

**Migration from shadcn/ui Tabs**:
The AnimatedTabs component replaces shadcn/ui Tabs throughout the application. Key differences:
- Uses state-based `value`/`onValueChange` instead of uncontrolled component
- Includes sliding indicator animation (shadcn/ui has underline only)
- Simpler API with single `tabs` array prop
- Compatible with FontAwesome icons and custom label components

### TestButton Component

**Location**: `public/frontend/src/components/ui/TestButton.tsx`

A reusable button component for testing connections and configurations with smooth animated state transitions.

**Features**:
- **Smooth 500ms Fade Transitions**: Seamless opacity-based transitions between all states
- **Four Visual States**:
  - Default: "Test" (neutral text)
  - Testing: "Testing..." (neutral-300 text)
  - Success: "✓" (green-400 text)
  - Failure: "✗" (red-400 text)
- **Minimum Display Time**: Ensures "Testing..." is visible for at least 800ms (configurable)
- **Fixed Width**: 96px (w-24) prevents layout shift during state transitions
- **Automatic Result Clearing**: Results automatically clear after 3 seconds (configurable)
- **Console Logging**: Automatically logs test results to browser console
- **Disabled State**: Button disabled during testing and fade transitions

**Props**:
```typescript
interface TestButtonProps {
  onTest: () => Promise<{ success: boolean; message: string }>;
  disabled?: boolean;
  className?: string;
  minDisplayTime?: number;        // Default: 800ms
  resultDisplayTime?: number;     // Default: 3000ms
}
```

**Usage Example**:
```tsx
<TestButton
  onTest={async () => {
    const result = await testProvider.mutateAsync({
      name: 'tmdb',
      apiKey: apiKey || undefined,
    });
    return result; // Must return { success: boolean, message: string }
  }}
/>
```

**Implementation Details**:
- Uses three state variables: `testResult`, `isTesting`, `testingFadingOut`
- Layered absolute-positioned spans for smooth crossfade effects
- State sequence: Test → Testing... (min 800ms) → (500ms fade out) → ✓/✗ (3s) → (500ms fade) → Test
- All text changes use opacity transitions instead of instant swaps
- Result message displayed in button tooltip on hover

**When to Use**:
- Provider connection testing (TMDB, TVDB, FanArt.tv, etc.)
- Media player connection verification (Kodi, Jellyfin, Plex)
- API endpoint testing
- Configuration validation
- Any async operation that needs clear visual feedback

## ViewControls Component
- **Fixed Sticky Header**: Positioned below page header with darker background
- **Search Bar**: Real-time filtering with FontAwesome search icon
- **View Mode Dropdown**:
  - Eye icon with dropdown menu
  - Three modes: Table, Posters, Overview
  - Active mode highlighted with primary color
  - Click outside to close dropdown
- **Action Buttons**: Refresh, Sort, Filter options
- **Extensible**: Children prop for custom controls

## Sidebar Navigation (Sidebar)
- **Hierarchical Menu Structure**:
  - **Metadata** (expandable): Movies, Series, Music, Actors, Artists
  - **Activity** (expandable): History, Running Jobs, Blocked Assets
  - **Settings** (expandable): General, Providers (database icon), Data Selection (sliders icon), Files, Libraries (book icon), Media Players, Notifications, Asset Limits
  - **System** (expandable): Status, Tasks, Backup, Events, Log Files
- **Auto-Expand Logic**: Sections automatically expand based on current route
- **Click Navigation**: Clicking parent menu expands and navigates to first child
- **Smooth Concurrent Animations**:
  - CSS Grid `grid-rows-[1fr]` / `grid-rows-[0fr]` technique for smooth height transitions
  - 300ms duration with `ease-in-out` timing
  - Collapsing and expanding sections animate simultaneously for "wipe" effect
  - Separate state tracking (`expandedSections`, `collapsingSections`) ensures stable height
  - Staggered child item animations (40ms delay per item)
  - Transform and opacity effects on child items
- **Active State Indicators**:
  - Primary purple border for active sections
  - Background highlight for active items
- **Collapse Support**: Icon-only mode for narrow screens
- **Mobile Responsive**: Slide-in/out drawer on mobile devices
- **Accessibility Features**:
  - Full ARIA support: `aria-label`, `aria-expanded`, `aria-controls` on section buttons
  - `role="region"` and descriptive labels on submenu containers
  - Keyboard navigable with proper focus management
  - Screen reader friendly with clear section and item announcements

## Layout System (Layout)
- **Props**:
  - `children: React.ReactNode` - Page content to render
  - `title: string` - Page title displayed in header
- **Fixed Header**: 64px height with title, sidebar toggle, and utility buttons
- **Header Buttons**:
  - Health (heart icon) - Future donation link
  - Theme toggle (sun/moon icon) - Dark/light mode switcher
  - Translate (globe icon) - Future translation service link
- **Fixed Sidebar**: 192px width (64px collapsed)
- **Content Area**: Proper spacing calculations for fixed elements
- **Z-Index Management**: Proper layering for overlays and dropdowns
- **Responsive Breakpoints**: Mobile-first design with proper spacing
- **Error Handling**: Backend connection error banner with dismiss capability

## Frontend Routes

### Dashboard
- `/` - Dashboard (default landing page)

### Metadata Management
- `/metadata/movies` - Movie library with comprehensive metadata tracking and fuzzy search filtering
- `/metadata/movies/:id/edit` - Movie edit page with tabbed interface (metadata, images, extras)
- `/metadata/series` - TV series library management
- `/metadata/music` - Music library management
- `/metadata/actors` - Actor profile management
- `/metadata/artists` - Artist profile management

### Activity (Expandable Menu)
- `/activity` - Redirects to `/activity/history` (default activity page)
- `/activity/history` - Activity history and recent events
- `/activity/running-jobs` - Running jobs and active tasks
- `/activity/blocked-assets` - Blocked assets requiring attention

### Settings (Expandable Menu)
- `/settings` - Redirects to `/settings/general` (default settings page)
- `/settings/general` - Application-wide configurations and preferences
- `/settings/providers` - API keys and provider-specific settings (TMDB, TVDB, MusicBrainz, etc.)
  - **Tabbed Interface**: AnimatedTabs with 3 tabs (Providers, Asset Selection, Metadata Selection)
  - **Providers Tab**: API key configuration and connection testing for metadata providers
  - **Asset Selection Tab**: Choose which asset types to download (posters, fanart, etc.)
  - **Metadata Selection Tab**: Configure which metadata fields to fetch from providers
- `/settings/data-selection` - Provider priority configuration for movies, TV shows, and music
  - **Tabbed Interface**: AnimatedTabs with FontAwesome icons (Movies, TV Shows, Music)
  - **Drag-and-Drop**: Reorder providers to set priority for metadata/asset selection
  - **Provider Cards**: Visual cards showing enabled providers with priority order
- `/settings/files` - Naming conventions and file management settings
- `/settings/libraries` - Library management with scan controls and real-time progress
  - **Tabbed Interface**: AnimatedTabs with 2 tabs (Libraries, Scanner Settings)
  - **Libraries Tab**: Add/edit/delete libraries, trigger scans, view scan progress
  - **Scanner Settings Tab**: Configure scanner behavior and options
- `/settings/media-players` - Kodi, Jellyfin, Plex configurations
- `/settings/notifications` - Email, Discord, Slack, push notification settings
- `/settings/asset-limits` - Asset download limits and restrictions

### System (Expandable Menu)
- `/system` - System overview page (may redirect to Status)
- `/system/status` - System health and performance metrics
- `/system/tasks` - Background job management and processing queue
- `/system/backup` - Backup and restore operations
- `/system/events` - Event logging and monitoring
- `/system/logs` - System log files and debugging
