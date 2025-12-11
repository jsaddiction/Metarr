# Movie Enrichment Pipeline

Implementation details for movie enrichment. For conceptual overview, see [Operational Concepts](../../concepts/README.md).

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        SCANNING                                  │
│  Directory Discovery → File Classification → ID Extraction      │
│  See: 01-SCANNING.md                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        SCRAPING                                  │
│  Identify media → Query providers → Cache all data              │
│  Implementation: 02-SCRAPING.md                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  ASSET SELECTION                                 │
│  Score candidates → Download top → pHash dedup → Select unique  │
│  Implementation: 03-ASSET-SELECTION.md                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  ACTOR ENRICHMENT                                │
│  Fetch cast data → Download headshots → Store records           │
│  Implementation: 04-ACTOR-ENRICHMENT.md                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  TRAILER ENRICHMENT                              │
│  Search YouTube → Score candidates → Download best              │
│  Implementation: 05-TRAILER-ENRICHMENT.md                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      PUBLISHING                                  │
│  Copy to library → Generate NFO → Update player paths           │
│  Implementation: 06-PUBLISHING.md                               │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Documents

| Phase | Document | Purpose |
|-------|----------|---------|
| Pre-requisite | [01-SCANNING.md](./01-SCANNING.md) | Directory discovery and file classification |
| Scraping | [02-SCRAPING.md](./02-SCRAPING.md) | Metadata enrichment and provider queries |
| Asset Selection | [03-ASSET-SELECTION.md](./03-ASSET-SELECTION.md) | Scoring, downloading, deduplication |
| Actor Enrichment | [04-ACTOR-ENRICHMENT.md](./04-ACTOR-ENRICHMENT.md) | Cast data and headshots |
| Trailer Enrichment | [05-TRAILER-ENRICHMENT.md](./05-TRAILER-ENRICHMENT.md) | Trailer search and download |
| Publishing | [06-PUBLISHING.md](./06-PUBLISHING.md) | Deploy to library |

## Decision Points

| Checkpoint | Condition | If False |
|------------|-----------|----------|
| Scanning complete | Main movie + TMDB ID found | Manual identification required |
| Scraping enabled | `phase.enrichment.scrapeProviders = true` | Skip metadata fetch |
| Asset fetch | `phase.enrichment.fetchProviderAssets = true` | Skip image selection |
| Auto-select | `phase.enrichment.autoSelectAssets = true` | User picks in UI |
| Trailer enabled | `asset_limit_trailer > 0` | Skip trailer phase |
| Auto-publish | `phase.general.autoPublish = true` | Stop after selection |

## Asset Types

| Type | Default Limit | Binary | Description |
|------|---------------|--------|-------------|
| poster | 3 | No | Main promotional images |
| fanart | 2 | No | Background/backdrop images |
| logo | 1 | Yes | Transparent title treatment |
| banner | 1 | Yes | Wide horizontal promotional |
| thumb | 1 | Yes | Thumbnail/preview image |
| clearart | 1 | Yes | Character/scene artwork |
| disc | 1 | Yes | Physical media disc image |
| trailer | 1 | Yes | Video trailer file |

*Binary = only one can be selected (no multiple versions)*

## State Transitions

```
pending → enriching → enriched → publishing → published
                 ↓
              failed (with retry)
```

## Troubleshooting

| Symptom | Likely Phase | Check |
|---------|--------------|-------|
| No metadata found | Scraping | TMDB ID valid? API responding? |
| Missing asset options | Scraping | Asset limits > 0? Provider API keys? |
| Assets not downloading | Asset Selection | Cache disk space? Network access? |
| Wrong asset selected | Asset Selection | Language preference? Scoring weights? |
| No trailer options | Trailer Enrichment | Trailer limit > 0? YouTube accessible? |
| Assets not in library | Publishing | Auto-publish on? Library path writable? |

## Conceptual Documentation

For design principles and architecture:

| Concept | Document |
|---------|----------|
| Pipeline overview | [Operational Concepts](../../concepts/README.md) |
| Scanning | [Scanning Concepts](../../concepts/Scanning/README.md) |
| Enrichment | [Enrichment Concepts](../../concepts/Enrichment/README.md) |
| Publishing | [Publishing Concepts](../../concepts/Publishing/README.md) |
