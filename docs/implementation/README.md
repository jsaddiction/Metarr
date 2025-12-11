# Implementation

Media-specific implementation details for each operational concept.

For conceptual documentation, see [Operational Concepts](../concepts/README.md).

## Media Types

| Media Type | Status | Documentation |
|------------|--------|---------------|
| [Movies](./Movies/README.md) | Complete | Full pipeline implementation |
| TV Shows | Planned | Series → Season → Episode hierarchy |
| Music | Planned | Artist → Album → Track hierarchy |

## Movies Implementation

| Phase | Document | Concept Reference |
|-------|----------|-------------------|
| Scanning | [01-SCANNING.md](./Movies/01-SCANNING.md) | [Scanning](../concepts/Scanning/) |
| Scraping | [02-SCRAPING.md](./Movies/02-SCRAPING.md) | [Scraping](../concepts/Enrichment/SCRAPING/) |
| Asset Selection | [03-ASSET-SELECTION.md](./Movies/03-ASSET-SELECTION.md) | [Downloading](../concepts/Enrichment/DOWNLOADING.md) |
| Actor Enrichment | [04-ACTOR-ENRICHMENT.md](./Movies/04-ACTOR-ENRICHMENT.md) | - |
| Trailer Enrichment | [05-TRAILER-ENRICHMENT.md](./Movies/05-TRAILER-ENRICHMENT.md) | - |
| Publishing | [06-PUBLISHING.md](./Movies/06-PUBLISHING.md) | [Publishing](../concepts/Publishing/) |

## Structure

```
implementation/
├── README.md           # This file
├── Movies/             # Movie-specific implementation
│   ├── README.md       # Movie pipeline overview
│   ├── 01-SCANNING.md
│   ├── 02-SCRAPING.md
│   ├── 03-ASSET-SELECTION.md
│   ├── 04-ACTOR-ENRICHMENT.md
│   ├── 05-TRAILER-ENRICHMENT.md
│   └── 06-PUBLISHING.md
├── TVShows/            # (Planned)
└── Music/              # (Planned)
```

## Related Documentation

- [Operational Concepts](../concepts/README.md) - Design principles and architecture
- [Architecture](../architecture/) - System design
