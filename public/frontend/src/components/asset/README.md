# Asset Selection Components

MediaElch-style asset selection dialog for choosing posters, fanart, and other media assets from multiple metadata providers.

## Components

### `AssetSelectionDialog`

Main modal dialog for selecting assets. Features:

- **Current Selection Display** - Shows currently selected asset with lock status
- **Recommendation Section** - Highlights best match from AutoSelectionService with quick "Use This" button
- **Asset Grid** - Responsive grid of all available assets (2-5 columns based on screen size)
- **Filtering** - By provider and quality (4K/HD/SD)
- **Sorting** - By score, resolution, votes, or provider
- **Real-time Loading** - Fetches from providers when opened, caches for 1 hour

### `AssetCard`

Individual asset card component with:

- Image preview with lazy loading
- Provider badge
- Quality/resolution overlays
- Vote count display
- Recommended indicator (star badge)
- Selected state with checkmark
- Hover effects

## Usage

### Basic Integration

```tsx
import { AssetSelectionDialog } from '../../components/asset';
import { AssetCandidate, AssetType } from '../../types/asset';

function ImagesTab({ movieId }: { movieId: number }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assetType, setAssetType] = useState<AssetType>('poster');
  const [currentAsset, setCurrentAsset] = useState<CurrentAsset | undefined>();

  const handleAssetSelect = async (asset: AssetCandidate, provider: string) => {
    // Save the selected asset
    await api.saveAsset(movieId, {
      assetType: asset.assetType,
      url: asset.url,
      provider,
    });

    // Refresh your assets
    refetch();
  };

  return (
    <>
      {/* Your existing asset display */}
      <div onClick={() => {
        setAssetType('poster');
        setDialogOpen(true);
      }}>
        <img src={currentAsset?.cache_url} alt="Poster" />
      </div>

      {/* Asset selection dialog */}
      <AssetSelectionDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSelect={handleAssetSelect}
        movieId={movieId}
        assetType={assetType}
        currentAsset={currentAsset}
      />
    </>
  );
}
```

### Integration with ImagesTab

To integrate with the existing `ImagesTab.tsx` component:

1. Import the dialog:
```tsx
import { AssetSelectionDialog } from '../asset';
import { AssetType } from '../../types/asset';
```

2. Add state for dialog:
```tsx
const [assetDialogOpen, setAssetDialogOpen] = useState(false);
const [selectedAssetType, setSelectedAssetType] = useState<AssetType>('poster');
```

3. Modify your "Upload" button section to add a "Select from Providers" button:
```tsx
<div className="flex items-center gap-2">
  <button
    onClick={() => {
      setSelectedAssetType(type.key as AssetType);
      setAssetDialogOpen(true);
    }}
    className="btn btn-primary btn-sm"
  >
    <FontAwesomeIcon icon={faSearch} className="mr-2" />
    Search Providers
  </button>
  <button
    onClick={() => handleUploadClick(type.key)}
    className="btn btn-secondary btn-sm"
  >
    <FontAwesomeIcon icon={faUpload} className="mr-2" />
    Upload
  </button>
</div>
```

4. Add the dialog at the end of the component:
```tsx
<AssetSelectionDialog
  isOpen={assetDialogOpen}
  onClose={() => setAssetDialogOpen(false)}
  onSelect={handleAssetSelect}
  movieId={movieId}
  assetType={selectedAssetType}
  currentAsset={images[selectedAssetType]?.[0]}
/>
```

5. Implement the selection handler:
```tsx
const handleAssetSelect = async (asset: AssetCandidate, provider: string) => {
  try {
    // TODO: Call your asset save API
    // await api.saveAsset(movieId, { assetType: asset.assetType, url: asset.url, provider });

    // TanStack Query will automatically refetch
    console.log('Selected asset:', { asset, provider });
  } catch (error) {
    console.error('Failed to save asset:', error);
    alert('Failed to save asset');
  }
};
```

## API Requirements

The component expects the following API endpoint:

### `GET /api/movies/:id/provider-results`

Query parameters:
- `assetTypes` (optional): Comma-separated list of asset types to fetch
- `force` (optional): Force fresh fetch, bypass cache

Response:
```typescript
{
  movieId: number;
  movie: { id, title, year, imdbId, tmdbId };
  providers: {
    [providerName: string]: {
      images: {
        [assetType: string]: AssetCandidate[];
      };
      success: boolean;
      error?: string;
    };
  };
  recommendations: {
    [assetType: string]: {
      asset: AssetCandidate;
      provider: string;
      score: number;
      reason: string;
    };
  };
  metadata: {
    fetchedAt: string;
    completedProviders: string[];
    failedProviders: Array<{ name: string; error: string }>;
    timedOutProviders: string[];
    totalProviders: number;
    totalAssets: number;
    durationMs: number;
  };
}
```

## Styling

Uses existing Tailwind CSS classes from `globals.css`:

- `.modal-overlay` - Backdrop overlay
- `.modal-container` - Modal card container
- `.modal-header` - Modal header section
- `.modal-body` - Modal body section
- `.modal-footer` - Modal footer section
- `.btn`, `.btn-primary`, `.btn-secondary` - Button styles
- `.form-input` - Input/select styles
- Purple theme colors (`primary-*`)
- Dark mode by default

## Props Reference

### `AssetSelectionDialogProps`

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `isOpen` | `boolean` | Yes | Controls dialog visibility |
| `onClose` | `() => void` | Yes | Called when dialog should close |
| `onSelect` | `(asset: AssetCandidate, provider: string) => void` | Yes | Called when user selects an asset |
| `movieId` | `number` | Yes | Movie ID to fetch assets for |
| `assetType` | `AssetType` | Yes | Type of asset to display (poster, fanart, etc.) |
| `currentAsset` | `CurrentAsset` | No | Currently selected asset (shows in "Current Selection" section) |

### `AssetCardProps`

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `asset` | `AssetCandidate` | Yes | Asset data to display |
| `provider` | `string` | Yes | Provider name |
| `isSelected` | `boolean` | Yes | Whether this asset is currently selected |
| `isRecommended` | `boolean` | Yes | Whether this is the recommended asset |
| `score` | `number` | No | Match score (0-1) |
| `onClick` | `() => void` | Yes | Click handler |

## Features

### Filtering

- **Provider Filter** - Show assets from specific provider or all providers
- **Quality Filter** - Filter by 4K (3840px+), HD (1280px+), SD (<1280px), or all

### Sorting

- **Score** (default) - Sort by recommendation score
- **Resolution** - Sort by image dimensions (highest first)
- **Votes** - Sort by vote count (most votes first)
- **Provider** - Sort alphabetically by provider name

### States

- **Loading** - Shows spinner while fetching from providers
- **Error** - Shows error message if fetch fails
- **Empty** - Shows "No assets found" message when filters return no results
- **Current Selection** - Shows currently selected asset if provided
- **Recommendation** - Highlights best match with score and reason

### Responsive Design

- Mobile: 2 columns
- Tablet (md): 3 columns
- Desktop (lg): 4 columns
- Large Desktop (xl): 5 columns

## Dependencies

- React
- @fortawesome/react-fontawesome (icons)
- @tanstack/react-query (data fetching)
- Tailwind CSS (styling)

## Testing

See `AssetSelectionExample.tsx` for a working example component.

To test:

1. Add the example to a route:
```tsx
import { AssetSelectionExample } from './components/asset/AssetSelectionExample';

// In your router
<Route path="/test-asset-selection" element={<AssetSelectionExample movieId={1} />} />
```

2. Navigate to `/test-asset-selection`
3. Click any "Select X" button
4. Dialog should open and fetch assets from providers

## Design Notes

- Follows MediaElch modal approach (click slot → modal opens → select → return to editor)
- Uses purple theme matching Sonarr/Radarr design
- Dark mode by default
- 1 hour cache for provider results (prevents excessive API calls)
- Lazy loading for images (performance)
- Responsive grid layout
- Smooth animations and transitions

## Future Enhancements

- Upload custom asset from dialog
- Unlock and auto-select functionality
- Real-time WebSocket progress updates during fetch
- Preview full-size image on hover/click
- Batch selection for multiple asset types
- Comparison view (side-by-side)
- Asset history/versions
