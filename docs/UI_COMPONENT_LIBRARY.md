# UI Component Library

Metarr uses a combination of **shadcn/ui** components (Radix UI primitives with Tailwind styling) and **custom components** built for domain-specific needs.

## Component Architecture

**Two-Tier Approach**:
1. **shadcn/ui Components**: Foundation layer providing standard UI primitives (buttons, inputs, dialogs, etc.)
2. **Custom Components**: Application-specific components built on top of or alongside shadcn/ui

**Why shadcn/ui?**
- Copy-paste components (no package dependency)
- Full TypeScript support
- Accessible by default (Radix UI primitives)
- Themeable via CSS variables
- Customizable without ejecting

---

## shadcn/ui Components

**Installed**: alert, alert-dialog, badge, button, card, checkbox, dialog, dropdown-menu, input, label, progress, select, skeleton, sonner, switch, table, tabs, tooltip

**Add Component**: `npx shadcn@latest add <component>`

**Customization**: All components use CSS variables from `globals.css` for theming (`:root` and `.dark` selectors)

**Theme Integration**: Auto-adapts to light/dark mode via `--primary-*` variables

**See**: [shadcn/ui documentation](https://ui.shadcn.com/) for component APIs

---

## Custom UI Components

**Location**: `public/frontend/src/components/ui/`

### AnimatedTabs
**Location**: `public/frontend/src/components/ui/AnimatedTabs.tsx`
**Purpose**: Tab navigation with sliding violet indicator animation
**Key Props**: `tabs` (array of Tab objects), `value` (string), `onValueChange` (function)
**Usage**: See [MovieEdit](c:\Users\04red\Nextcloud\Documents\development\Metarr\public\frontend\src\pages\metadata\MovieEdit.tsx), [Libraries](c:\Users\04red\Nextcloud\Documents\development\Metarr\public\frontend\src\pages\settings\Libraries.tsx), [Providers](c:\Users\04red\Nextcloud\Documents\development\Metarr\public\frontend\src\pages\settings\Providers.tsx)
**Decision**: Custom implementation for unique branding (2025-10-18)

### ZoomableImage
**Location**: `public/frontend/src/components/ui/ZoomableImage.tsx`
**Purpose**: Image component with 2x zoom-on-hover effect
**Key Props**: `src`, `alt`, `aspectRatio`, `badge`
**Usage**: See [CurrentAssetCard](c:\Users\04red\Nextcloud\Documents\development\Metarr\public\frontend\src\components\movie\CurrentAssetCard.tsx)

### TestButton
**Location**: `public/frontend/src/components/ui/TestButton.tsx`
**Purpose**: Button for testing connections with animated state transitions (Test → Testing... → ✓/✗)
**Key Props**: `onTest` (async function returning {success, message})
**Usage**: See [ProviderConfigModal](c:\Users\04red\Nextcloud\Documents\development\Metarr\public\frontend\src\components\provider\ProviderConfigModal.tsx)

### ViewControls
**Location**: `public/frontend/src/components/ui/ViewControls.tsx`
**Purpose**: Fixed sticky header with search, view mode dropdown, and action buttons
**Key Props**: `searchValue`, `onSearchChange`, `viewMode`, `onViewModeChange`, `onRefresh`
**Usage**: See [Movies](c:\Users\04red\Nextcloud\Documents\development\Metarr\public\frontend\src\pages\metadata\Movies.tsx), [Series](c:\Users\04red\Nextcloud\Documents\development\Metarr\public\frontend\src\pages\Series.tsx), [Music](c:\Users\04red\Nextcloud\Documents\development\Metarr\public\frontend\src\pages\Music.tsx)

### BookmarkToggle
**Location**: `public/frontend/src/components/ui/BookmarkToggle.tsx`
**Purpose**: Toggle button for monitoring items (Sonarr/Radarr-style)
**Key Props**: `monitored` (boolean), `onToggle` (function), `size`
**Usage**: See [MovieRow](c:\Users\04red\Nextcloud\Documents\development\Metarr\public\frontend\src\components\movie\MovieRow.tsx)
**Note**: Monitored = automation enabled; Unmonitored = automation frozen

### LockIcon
**Location**: `public/frontend/src/components/ui/LockIcon.tsx`
**Purpose**: Toggle icon for field-level locking
**Key Props**: `locked` (boolean), `onToggle` (function), `size`, `indicatorOnly`
**Usage**: Planned for MovieEdit metadata fields
**Note**: Locked = automation cannot modify field; Unlocked = automation can modify

### ErrorBanner
**Location**: `public/frontend/src/components/ui/ErrorBanner.tsx`
**Purpose**: Display errors/warnings at bottom of screen with slide-up animation
**Key Props**: `error` (string), `type` ('error' | 'warning' | 'connection'), `onDismiss`
**Usage**: See [Layout](c:\Users\04red\Nextcloud\Documents\development\Metarr\public\frontend\src\components\layout\Layout.tsx) for WebSocket connection errors

### Asset Selection Components

**AssetBrowserModal** (`AssetBrowserModal.tsx`)
- Full-screen modal for browsing and selecting asset candidates
- Used in MovieEdit for asset management

**AssetCandidateGrid** (`AssetCandidateGrid.tsx`)
- Grid of asset candidates with sorting/filtering
- Used within AssetBrowserModal

**AssetThumbnail** (`AssetThumbnail.tsx`)
- Individual asset thumbnail with provider badge, score, and selection state
- Used within AssetCandidateGrid

---

## Domain-Specific Components

**Location**: `public/frontend/src/components/<category>/`

### Layout Components
**Location**: `public/frontend/src/components/layout/`

- **Layout.tsx** - Main application wrapper with sidebar, header, and error handling
- **Header.tsx** - Top navigation bar with title and theme toggle
- **Sidebar.tsx** - Left navigation sidebar with expandable menus

### Movie Components
**Location**: `public/frontend/src/components/movie/`

**VirtualizedMovieTable** (`VirtualizedMovieTable.tsx`)
- Table view for movies list with fixed header
- Used in [Movies](c:\Users\04red\Nextcloud\Documents\development\Metarr\public\frontend\src\pages\metadata\Movies.tsx) page

**MovieRow** (`MovieRow.tsx`)
- Individual movie row in table with bookmark toggle and metadata indicators
- Used in VirtualizedMovieTable

**MovieTableView** (`MovieTableView.tsx`)
- Alternative table view (legacy/backup implementation)

**MoviePosterView** (`MoviePosterView.tsx`)
- Poster grid view for movies

**MovieOverviewView** (`MovieOverviewView.tsx`)
- Overview card view for movies

**AssetIndicator** (`AssetIndicator.tsx`)
- Visual indicator for asset counts (images, trailers, etc.)

### MovieEdit Tab Components
**Location**: `public/frontend/src/components/movie/`

**MetadataTab** (`MetadataTab.tsx`)
- Metadata editing form with scalar and array fields
- Used in [MovieEdit](c:\Users\04red\Nextcloud\Documents\development\Metarr\public\frontend\src\pages\metadata\MovieEdit.tsx)

**ImagesTab** (`ImagesTab.tsx`)
- Image asset management (poster, fanart, etc.)
- Used in MovieEdit

**ExtrasTab** (`ExtrasTab.tsx`)
- Extras management (trailers, subtitles)
- Used in MovieEdit

**CastTab** (`CastTab.tsx`)
- Cast/crew management
- Used in MovieEdit

### Form Components
**Location**: `public/frontend/src/components/movie/` or `public/frontend/src/components/common/`

**GridField** (`GridField.tsx`)
- Grid-based form field layout
- Used in MetadataTab

**TextAreaField** (`TextAreaField.tsx`)
- Textarea with label and validation
- Used in MetadataTab

**CurrentAssetCard** (`CurrentAssetCard.tsx`)
- Shows currently selected asset with ZoomableImage
- Used in ImagesTab

**EmptySlotCard** (`EmptySlotCard.tsx`)
- Placeholder for missing asset slot
- Used in ImagesTab

**SaveBar** (`SaveBar.tsx`)
- Bottom sticky bar for unsaved changes with Save/Reset buttons
- Used in MetadataTab and [SaveBarDemo](c:\Users\04red\Nextcloud\Documents\development\Metarr\public\frontend\src\pages\test\SaveBarDemo.tsx)

**ActorsList** (`ActorsList.tsx`)
- List of actors/crew members
- Used in CastTab

**AssetSelectionModal** (`AssetSelectionModal.tsx`)
- Modal for selecting assets
- Used in ImagesTab/ExtrasTab

**AssetSelectionDialog** (`AssetSelectionDialog.tsx`)
- Dialog variant for asset selection
- Alternative to AssetSelectionModal

---

## Component Naming Conventions

**shadcn/ui Components**: kebab-case filenames (`alert-dialog.tsx`)

**Custom UI Components**: PascalCase filenames (`AnimatedTabs.tsx`)

**Domain Components**: PascalCase filenames in categorized folders (`components/movie/MovieTableView.tsx`)

**Import Aliases**: Use `@/components/...` alias in imports (configured in `tsconfig.json`)

---

## Adding New Components

### Adding shadcn/ui Component

```bash
# Install new component
npx shadcn@latest add <component-name>

# Example: Add Popover
npx shadcn@latest add popover
```

This will:
1. Download component to `public/frontend/src/components/ui/`
2. Install required dependencies
3. Update `components.json` configuration

### Creating Custom Component

1. **Decide location**:
   - **UI primitive** (button-like, reusable) → `components/ui/`
   - **Domain-specific** (movie-related, page-specific) → `components/<category>/`

2. **Create component file**:
   ```tsx
   // public/frontend/src/components/ui/MyComponent.tsx
   import React from 'react';
   import { cn } from '@/lib/utils';

   interface MyComponentProps {
     className?: string;
     children: React.ReactNode;
   }

   export const MyComponent: React.FC<MyComponentProps> = ({
     className,
     children,
   }) => {
     return (
       <div className={cn('base-styles', className)}>
         {children}
       </div>
     );
   };
   ```

3. **Use theme-aware classes**:
   - Use `bg-neutral-*`, `text-neutral-*`, `border-neutral-*`
   - Avoid hardcoded colors
   - Test in both light and dark modes

4. **Document the component**:
   - Add to this file (UI_COMPONENT_LIBRARY.md)
   - Add usage examples
   - Note any design decisions

---

## Theme Integration

All components automatically support dark/light themes via CSS variables and utility class overrides.

**How It Works**:
1. ThemeContext applies `light` or `dark` class to `<html>` element
2. CSS variables (`:root` and `.dark`) define base colors
3. Utility class overrides (`.light .bg-neutral-900`) remap classes for light mode
4. Components using semantic classes automatically adapt

**See**: `UI_DESIGN.md` for complete theme system documentation.

---

## Related Documentation

- **[FRONTEND_COMPONENTS.md](./FRONTEND_COMPONENTS.md)** - Complete frontend architecture and components
- **[UI_DESIGN.md](./UI_DESIGN.md)** - Layout system, theme system, and design guidelines
- **[shadcn/ui Documentation](https://ui.shadcn.com/)** - Official shadcn/ui docs
- **[Radix UI Documentation](https://www.radix-ui.com/)** - Underlying primitives documentation
