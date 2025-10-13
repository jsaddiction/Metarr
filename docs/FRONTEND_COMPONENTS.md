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
- **Header Section**:
  - Back button (FontAwesome arrow-left icon) - navigates to `/metadata/movies`
  - Dynamic title: "Edit Movie: {movieTitle}"
  - Save button (primary style with save icon)
- **Tabbed Interface**:
  - Three tabs: Metadata, Images, Extras
  - Active tab styling: primary purple border-bottom and text color
  - Inactive tabs: neutral text with hover effects
  - Tab transitions: smooth color and border animations
- **Tab Content** (Current Implementation):
  - **Metadata Tab**: Placeholder for full metadata editing (scalar and array data with modal system)
  - **Images Tab**: Placeholder for image asset management (poster, fanart, etc.)
  - **Extras Tab**: Placeholder for extras management (trailers, subtitles, themes)
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

### TestButton Component (`components/ui/TestButton.tsx`)

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
  - Metadata: Movies, Series, Music, Actors, Artists
  - Activity: History, Running Jobs, Blocked Assets
  - Settings: General, Providers (database icon), Data Selection (sliders icon), Files, Libraries (book icon), Media Players, Notifications
  - System: Status, Tasks, Backup, Events, Log Files
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

### Metadata Management
- `/metadata/movies` - Movie library with comprehensive metadata tracking and fuzzy search filtering
- `/metadata/movies/:id/edit` - Movie edit page with tabbed interface (metadata, images, extras)
- `/metadata/series` - TV series library management
- `/metadata/music` - Music library management
- `/metadata/actors` - Actor profile management
- `/metadata/artists` - Artist profile management

### Settings (Expandable Menu)
- `/settings/general` - Application-wide configurations and preferences
- `/settings/providers` - API keys and provider-specific settings (TMDB, TVDB, MusicBrainz, etc.)
- `/settings/files` - Naming conventions and file management settings
- `/settings/libraries` - Library management with scan controls and real-time progress
- `/settings/media-players` - Kodi, Jellyfin, Plex configurations
- `/settings/notifications` - Email, Discord, Slack, push notification settings

### System (Expandable Menu)
- `/system/status` - System health and performance metrics
- `/system/tasks` - Background job management and processing queue
- `/system/backup` - Backup and restore operations
- `/system/events` - Event logging and monitoring
- `/system/logs` - System log files and debugging

### Other Routes
- `/activity` - Job processing status and recent activity
- `/` - Redirects to `/metadata/movies` (default landing page)
