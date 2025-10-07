# Frontend Components & Implementations

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
- **3-Column Layout**: Title (25%), Metadata (auto), Actions (80px)
- **Comprehensive Metadata Tracking**:
  - NFO file status with progress indication
  - 8 image types tracked: poster, fanart, landscape, keyart, banner, clearart, clearlogo, discart
  - Media assets: trailers, subtitles, theme songs
  - Count badges for multiple assets (e.g., 3 trailers, 5 subtitles)
- **Visual Indicators**:
  - Green icons for available assets, gray for missing
  - FontAwesome icons for each asset type
  - Tooltips showing asset descriptions
- **Single-Row Metadata**: All metadata indicators displayed in one condensed row
- **Refresh Action**: Per-movie metadata refresh button

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
  - Settings: General, Providers, Files, Media Players, Notifications
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

## Layout System (Layout)
- **Fixed Header**: 64px height with title and actions
- **Fixed Sidebar**: 192px width (64px collapsed)
- **Content Area**: Proper spacing calculations for fixed elements
- **Z-Index Management**: Proper layering for overlays and dropdowns
- **Responsive Breakpoints**: Mobile-first design with proper spacing

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
