# Directory Discovery

Discovery is the first phase of scanning: enumerating all files, detecting directory structures, and gathering objective facts.

## Purpose

Discovery answers: **"What files exist and what are their properties?"**

- Enumerate all files in the target directory
- Detect disc structures (BDMV, VIDEO_TS)
- Gather objective metadata (size, duration, dimensions)
- Compute hashes for change detection
- Prepare facts for classification

## Process Flow

```
DISCOVERY
    │
    ├──► ENUMERATE
    │         └──► List all files in directory
    │         └──► Detect subdirectories
    │
    ├──► DETECT DISC STRUCTURE
    │         └──► Check for BDMV/ (BluRay)
    │         └──► Check for VIDEO_TS/ (DVD)
    │         └──► Set naming mode (short vs prefixed)
    │
    ├──► GATHER FACTS
    │         └──► Video: duration, resolution, codec, HDR
    │         └──► Image: dimensions, aspect ratio, alpha
    │         └──► Text: content sample, encoding
    │
    └──► COMPUTE HASHES
              └──► Video: quick hash (first/last 64KB + size)
              └──► Image/Text: SHA256 of content
```

---

## Disc Structure Detection

Before gathering facts, discovery checks for disc structures that change how the directory is interpreted.

### BluRay (BDMV)

```
Movie Name (2024)/
├── BDMV/
│   ├── index.bdmv         ← Detection marker
│   ├── STREAM/
│   │   └── 00001.m2ts     ← Main movie
│   └── ...
├── poster.jpg             ← Short name format
└── movie.nfo              ← Disc NFO location
```

**Detection:** Presence of `BDMV/index.bdmv`

### DVD (VIDEO_TS)

```
Movie Name (2024)/
├── VIDEO_TS/
│   ├── VIDEO_TS.IFO       ← Detection marker
│   ├── VTS_01_1.VOB       ← Video segments
│   └── ...
├── poster.jpg             ← Short name format
└── movie.nfo              ← Disc NFO location
```

**Detection:** Presence of `VIDEO_TS/VIDEO_TS.IFO`

### Naming Mode Impact

| Structure | Asset Names | NFO Name |
|-----------|-------------|----------|
| Standard | `Movie.Name.2024-poster.jpg` | `Movie.Name.2024.nfo` |
| Disc | `poster.jpg` | `movie.nfo` |

This affects both classification (what patterns to look for) and publishing (what names to generate).

---

## Fact Gathering

Facts are objective metadata collected **before** any classification decisions.

### Video Files

| Fact | Source | Purpose |
|------|--------|---------|
| Duration | FFprobe | Main movie identification |
| Resolution | FFprobe | Quality metadata |
| Codec | FFprobe | Compatibility |
| HDR type | FFprobe | Quality metadata |
| Audio tracks | FFprobe | Language detection |
| Subtitle tracks | FFprobe | Embedded subtitle detection |
| File size | Filesystem | Sorting, validation |

### Image Files

| Fact | Source | Purpose |
|------|--------|---------|
| Width, Height | Image analysis | Dimension validation |
| Aspect ratio | Calculated | Asset type inference |
| Format | File header | Compatibility |
| Has alpha | Image analysis | Logo/clearart detection |

### Text Files

| Fact | Source | Purpose |
|------|--------|---------|
| Content sample | First 10KB | ID extraction, type detection |
| File extension | Filename | NFO vs subtitle |
| Encoding | Content analysis | Proper parsing |

---

## Hash Collection

Hashes enable change detection and content-addressed storage.

### Hash Methods

| File Type | Method | Purpose |
|-----------|--------|---------|
| Video | Quick hash (first/last 64KB + size) | Detect upgrades |
| Image | SHA256 of content | Content-addressed cache |
| Text | SHA256 of content | Change detection |

### Caching Strategy

FFprobe is expensive. Results are cached by quick hash:

```
Scan file:
  1. Compute quick hash (fast)
  2. Check cache for hash
  3. Cache miss → FFprobe → Store result
  4. Cache hit → Return cached result
```

**Performance impact:**
- First scan (1000 movies): ~8 hours
- Rescan (cached): ~50 seconds

---

## Special Directories

| Directory | Treatment |
|-----------|-----------|
| `trailers/` | All videos → trailers |
| `extras/` | All videos → extras |
| `.actors/` | Actor headshots |
| `extrafanarts/` | Additional fanart (legacy) |
| `extrathumbs/` | Additional thumbs (legacy) |
| `BDMV/` | BluRay disc structure |
| `VIDEO_TS/` | DVD disc structure |

---

## Output

After discovery:

- Complete file inventory with paths
- Disc structure mode determined
- Facts gathered for every file
- Hashes computed
- Ready for [Classification](./CLASSIFICATION.md)
