# Component Reference

**Purpose**: Authoritative inventory of all custom components in the Metarr frontend - what they are, when to use them, and how they compose.

**Related Docs**: [Component Guidelines](COMPONENT_GUIDELINES.md), [Styling Guide](STYLING_GUIDE.md), [README](README.md)

---

## Quick Reference

**Before creating a component, CHECK THIS LIST FIRST!**

| Component | Category | Purpose |
|-----------|----------|---------|
| [PageContainer](#pagecontainer) | Layout | Page wrapper with title/subtitle |
| [SectionHeader](#sectionheader) | Layout | Section titles within pages |
| [SectionStack](#sectionstack) | Layout | Vertical spacing container |
| [SettingCard](#settingcard) | Settings | Settings section card |
| [SettingRow](#settingrow) | Settings | Label + control row |
| [DataCard](#datacard) | Data Display | Card for tables/lists |
| [EmptyState](#emptystate) | Feedback | "No data" message with action |
| [LoadingState](#loadingstate) | Feedback | Loading spinner + message |
| [AnimatedTabs](#animatedtabs) | Navigation | Animated tab navigation |
| [ViewControls](#viewcontrols) | Controls | Search/filter/view mode toolbar |
| [SaveBar](#savebar) | Forms | Fixed bottom save bar |

**shadcn/ui Primitives** (imported, not custom):
- Button, Card, Input, Label, Switch, Select, Dialog, Alert, Checkbox, Badge, Tooltip, Table, Progress, Tabs

---

## Component Categories

### Layout Components

Components that structure pages and sections.

#### PageContainer

**Purpose**: Standard page wrapper providing consistent title, subtitle, and content spacing.

**Use When**:
- Creating any new page
- Need consistent page header structure
- Want standardized spacing/padding

**Props**:
- `title: string` - Page title
- `subtitle?: string` - Optional subtitle
- `children: ReactNode` - Page content

**Composes With**: SectionStack, SettingCard, DataCard, all content components

**Used In**: All pages (Dashboard, Settings, Movies, etc.)

**DO NOT Use When**:
- Page has custom header requirements (e.g., MovieEdit with tabs)
- Need full-width content without padding

---

#### SectionHeader

**Purpose**: Consistent section titles within pages, replacing inline `<h2>` tags.

**Use When**:
- Dividing page content into logical sections
- Need section title + optional subtitle
- Want optional action button/link next to title

**Props**:
- `title: string` - Section title
- `subtitle?: string` - Optional subtitle below title
- `action?: ReactNode` - Optional button/link aligned right

**Composes With**: Used inside PageContainer, before DataCard or content grids

**Used In**: Dashboard (Libraries, Media Players sections), multi-section pages

**DO NOT Use When**:
- Page has only one section (use PageContainer title instead)
- Section doesn't need a prominent title

---

#### SectionStack

**Purpose**: Applies consistent vertical spacing between elements.

**Use When**:
- Stacking cards or sections vertically
- Need consistent spacing (6 or 3 units)

**Props**:
- `spacing?: 'default' | 'compact'` - Default (24px) or compact (12px)
- `children: ReactNode` - Stacked content

**Composes With**: Contains SettingCard, DataCard, or any stacked elements

**Used In**: Most pages wrapping multiple cards

**DO NOT Use When**:
- Custom spacing needed (use Tailwind directly)
- Grid or flex layout more appropriate

---

### Settings Components

Components specific to settings pages.

#### SettingCard

**Purpose**: Styled card for settings sections with title, description, and icon.

**Use When**:
- Creating settings sections
- Grouping related settings together
- Need card with title/description header

**Props**:
- `title: string` - Card title
- `description?: string` - Card description
- `icon?: ReactNode` - Optional emoji or icon
- `variant?: 'default' | 'subtle'` - Background style (solid or transparent)
- `children: ReactNode` - Card content

**Composes With**: Contains SettingRow components, used inside SectionStack

**Used In**: Workflow, Providers, Libraries settings pages

**DO NOT Use When**:
- Displaying data tables/lists (use DataCard)
- Need custom card styling incompatible with settings pattern

---

#### SettingRow

**Purpose**: Standard row for a single setting - label + description + control.

**Use When**:
- Adding any setting with label and control
- Need consistent label/control layout
- Want optional description text

**Props**:
- `label: string` - Setting label
- `description?: string` - Optional help text
- `children: ReactNode` - Control element (Switch, Input, Select, etc.)

**Composes With**: Used inside SettingCard, contains shadcn controls (Switch, Input)

**Used In**: All settings pages

**DO NOT Use When**:
- Control requires custom layout
- Not a traditional label + control pattern

---

### Data Display Components

Components for displaying data (tables, lists, grids).

#### DataCard

**Purpose**: Card wrapper for data tables, lists, or grids with optional title.

**Use When**:
- Wrapping data tables
- Displaying lists (jobs, activities)
- Need card with optional title + action button

**Props**:
- `title?: string` - Optional card title
- `description?: string` - Optional card description
- `action?: ReactNode` - Optional action button/link
- `noPadding?: boolean` - Remove padding (for full-width tables)
- `children: ReactNode` - Data content

**Composes With**: Contains tables, lists, EmptyState, LoadingState

**Used In**: Dashboard (Recent Activity), RunningJobs (Active Jobs)

**DO NOT Use When**:
- Settings content (use SettingCard)
- Custom card styling needed

---

### Feedback Components

Components for user feedback (loading, empty states, errors).

#### EmptyState

**Purpose**: Consistent "no data" messages with optional icon and action.

**Use When**:
- No data to display
- Need user-friendly empty message
- Want optional call-to-action

**Props**:
- `icon?: ReactNode` - Optional icon/emoji
- `title: string` - Primary message
- `description?: string` - Additional context
- `action?: { label: string; href?: string; onClick?: () => void }` - Optional action

**Composes With**: Used inside DataCard, PageContainer

**Used In**: Dashboard (no libraries), Movies (no movies), Providers (no providers)

**DO NOT Use When**:
- Error states (use Alert component)
- Loading states (use LoadingState)

---

#### LoadingState

**Purpose**: Consistent loading indicator with spinner and optional message.

**Use When**:
- Fetching data
- Need visual loading feedback
- Want consistent spinner across app

**Props**:
- `message?: string` - Loading message (default: "Loading...")
- `size?: 'sm' | 'md' | 'lg'` - Spinner size and padding

**Composes With**: Used inside PageContainer, DataCard

**Used In**: All pages with async data

**DO NOT Use When**:
- Inline/button loading (use Button loading prop)
- Custom loading animation needed

---

### Navigation Components

Components for navigation and view control.

#### AnimatedTabs

**Purpose**: Animated tab navigation with smooth transitions.

**Use When**:
- Multiple views of same content type
- Need animated tab switching
- Want consistent tab styling

**Props**:
- `tabs: { id: string; label: string }[]` - Tab definitions
- `activeTab: string` - Currently active tab ID
- `onTabChange: (id: string) => void` - Tab change handler

**Composes With**: Contains AnimatedTabsContent for each tab panel

**Used In**: Libraries (Libraries/Scanner tabs), MovieEdit (tabs for different sections)

**DO NOT Use When**:
- Only 2 tabs (consider buttons instead)
- Vertical navigation needed

---

#### ViewControls

**Purpose**: Toolbar with search, filters, view mode, and refresh controls.

**Use When**:
- Need search/filter on data views
- Want view mode toggle (table/grid)
- Need refresh button

**Props**:
- `searchPlaceholder: string` - Search input placeholder
- `searchValue: string` - Current search value
- `onSearchChange: (value: string) => void` - Search handler
- `viewMode: ViewMode` - Current view mode
- `onViewModeChange: (mode: ViewMode) => void` - View mode handler
- `onRefresh: () => void` - Refresh handler
- `onSortChange?: (sort: string) => void` - Optional sort handler
- `onFilterChange?: (filter: string) => void` - Optional filter handler
- `children?: ReactNode` - Additional custom filters

**Composes With**: Used above data tables/grids, outside PageContainer

**Used In**: Movies page (search and status filter)

**DO NOT Use When**:
- Simple search only needed (use Input)
- Custom toolbar layout required

---

### Form Components

Components for forms and user input.

#### SaveBar

**Purpose**: Fixed bottom bar showing unsaved changes with save/discard actions.

**Use When**:
- Form has unsaved changes
- Need prominent save/discard actions
- Want fixed bottom positioning

**Props**:
- `hasChanges: boolean` - Show/hide bar based on changes
- `onSave: () => void` - Save handler
- `onDiscard: () => void` - Discard handler
- `isPending?: boolean` - Show saving state

**Composes With**: Standalone, appears at bottom of pages with forms

**Used In**: MovieEdit, any page with editable forms

**DO NOT Use When**:
- Auto-save implemented
- Modal forms (use modal footer)

---

## Domain-Specific Components

### Movie Components

Located in `components/movie/`

- **VirtualizedMovieTable** - High-performance movie table with virtual scrolling
- **MovieCard** - Movie display card (poster + metadata)
- **AssetSelectionModal** - Modal for selecting movie assets (posters, fanart)
- **MetadataTab** / **ImagesTab** / **CastTab** / **ExtrasTab** - MovieEdit page tabs
- **EnrichmentStatusBadge** - Badge showing enrichment status

**Use When**: Working with movie-specific UI

### Provider Components

Located in `components/provider/`

- **ProviderCard** - Provider configuration card (ultra-compact single-row)
- **ProviderCapabilities** - Tooltip showing provider capabilities
- **ProviderStats** - Display provider API statistics
- **ProviderConfig** - Provider configuration form

**Use When**: Working with provider settings

### Library Components

Located in `components/library/`

- **LibraryCard** - Library display/config card with scan progress
- **AddLibraryCard** - "Add library" button card
- **LibraryConfigModal** - Modal for library configuration
- **ScannerSettings** - Library scanner configuration

**Use When**: Working with library management

### Media Player Components

Located in `components/mediaPlayer/`

- **MediaPlayerCard** - Player display card
- **MediaPlayerWizard** - Multi-step player setup wizard
- **MediaPlayerConfigModal** - Player configuration modal
- **MediaPlayerGroupCard** - Player group display card
- **ConnectionBadge** - Player connection status indicator

**Use When**: Working with media player configuration

### Dashboard Components

Located in `components/dashboard/`

- **LibraryStatusCard** - Library status widget for Dashboard
- **MediaPlayerStatusCard** - Media player status widget
- **RecentActivityList** - Recent job activity list
- **CompletenessStatCard** - Metadata completeness statistics

**Use When**: Building Dashboard widgets

### Asset Components

Located in `components/asset/`

- **AssetCard** - Asset display card with selection
- **AssetThumbnail** - Asset thumbnail with hover preview
- **AssetCandidateGrid** - Grid of asset candidates for selection
- **AssetBrowserModal** - Full-screen asset browser modal

**Use When**: Working with asset selection/display

---

## shadcn/ui Components

**Pre-built components from shadcn/ui** - Import from `@/components/ui/`:

### Controls
- **Button** - Buttons with variants (default, outline, ghost, destructive)
- **Input** - Text input fields
- **Label** - Form labels
- **Switch** - Toggle switches
- **Select** - Dropdown selects
- **Checkbox** - Checkboxes

### Feedback
- **Alert** - Alert messages (info, warning, error)
- **Badge** - Small status badges
- **Progress** - Progress bars
- **Skeleton** - Loading skeletons
- **Tooltip** - Hover tooltips

### Overlays
- **Dialog** - Modal dialogs
- **AlertDialog** - Confirmation dialogs
- **DropdownMenu** - Dropdown menus

### Layout
- **Card** / **CardHeader** / **CardTitle** / **CardDescription** / **CardContent** - Card components
- **Table** / **TableHeader** / **TableBody** / **TableRow** / **TableCell** - Table components
- **Tabs** / **TabsList** / **TabsTrigger** / **TabsContent** - Basic tabs (not animated)
- **ScrollArea** - Custom scrollbars

**Use When**: Need basic UI primitives without custom behavior

**DO NOT**: Create custom versions of these unless absolutely necessary

---

## Component Composition Patterns

### Typical Page Structure

```
<PageContainer title="..." subtitle="...">
  <SectionStack>
    <SectionHeader title="..." />
    <SettingCard title="..." variant="subtle">
      <SettingRow label="..." description="...">
        <Switch />
      </SettingRow>
    </SettingCard>

    <DataCard title="...">
      {loading && <LoadingState />}
      {!loading && items.length === 0 && <EmptyState title="..." />}
      {!loading && items.length > 0 && <ItemList items={items} />}
    </DataCard>
  </SectionStack>
</PageContainer>
```

### Settings Page Pattern

```
<PageContainer title="Settings" subtitle="Configure...">
  <SectionStack>
    <SettingCard title="General" variant="subtle">
      <SettingRow label="Setting 1">
        <Switch />
      </SettingRow>
      <SettingRow label="Setting 2">
        <Input />
      </SettingRow>
    </SettingCard>
  </SectionStack>
</PageContainer>
```

### Data Display Pattern

```
<>
  <div className="full-width-section">
    <ViewControls ... />
  </div>

  <PageContainer title="Data" subtitle="...">
    {loading && <LoadingState size="lg" />}
    {!loading && data.length === 0 && <EmptyState title="..." />}
    {!loading && data.length > 0 && (
      <DataCard>
        <DataTable data={data} />
      </DataCard>
    )}
  </PageContainer>
</>
```

---

## Decision Trees

### "Should I create a new component?"

```
Does this pattern appear 2+ times?
├─ YES → Does a component already exist? (Check this reference)
│         ├─ YES → Use existing component
│         └─ NO → Can we extend an existing component?
│                 ├─ YES → Modify existing component
│                 └─ NO → Create new component
└─ NO → Is this component >200 lines or very complex?
        ├─ YES → Extract to new component
        └─ NO → Keep inline
```

### "Which component should I use?"

```
What am I building?
├─ Page wrapper? → PageContainer
├─ Section title? → SectionHeader
├─ Settings UI?
│   ├─ Card wrapper? → SettingCard
│   └─ Label + control? → SettingRow
├─ Data display?
│   ├─ Card wrapper? → DataCard
│   ├─ No data? → EmptyState
│   └─ Loading? → LoadingState
├─ Navigation?
│   ├─ Tabs? → AnimatedTabs
│   └─ Toolbar? → ViewControls
└─ Form?
    └─ Unsaved changes? → SaveBar
```

---

## Modification Guidelines

### Before Modifying Existing Components

**Ask**:
1. **Is this a breaking change?** - Will it affect existing usages?
2. **Is this a new feature?** - Can it be added via optional prop?
3. **Is this a fix?** - Does it correct broken behavior?

**Safe Modifications**:
- Adding optional props (with defaults)
- Fixing bugs that don't change API
- Improving types (narrowing types, adding generics)

**Unsafe Modifications**:
- Changing required props
- Removing props
- Changing default behavior
- Changing component structure significantly

**If Unsafe**: Consider creating new variant instead of modifying existing

---

## Component Inventory Summary

**Total Components**: 45+

**By Category**:
- Layout: 3 (PageContainer, SectionHeader, SectionStack)
- Settings: 2 (SettingCard, SettingRow)
- Data Display: 1 (DataCard)
- Feedback: 2 (EmptyState, LoadingState)
- Navigation: 2 (AnimatedTabs, ViewControls)
- Forms: 1 (SaveBar)
- Domain-Specific: 30+ (movie, provider, library, player, asset, dashboard)
- shadcn Primitives: 15+ (imported)

---

## Maintenance

### Adding New Components

1. Create component following [Component Guidelines](COMPONENT_GUIDELINES.md)
2. Add entry to this reference under appropriate category
3. Update Quick Reference table
4. Update Component Inventory Summary

### Deprecating Components

1. Mark as deprecated in this reference
2. Add migration path to replacement component
3. Update all usages to new component
4. Remove after all usages updated

---

## Related Documentation

- **[Component Guidelines](COMPONENT_GUIDELINES.md)** - When/how to create components
- **[Styling Guide](STYLING_GUIDE.md)** - How to style components
- **[Architecture](ARCHITECTURE.md)** - Technical architecture details
- **[README](README.md)** - Documentation hub
