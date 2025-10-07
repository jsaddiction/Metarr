# Kodi JSON-RPC API Reference

This document provides comprehensive reference for Kodi's JSON-RPC API used by Metarr for media player integration.

**API Version**: v13 (Kodi 20 Nexus / Kodi 21 Omega)
**Data Source**: Live introspect from Kodi instance with 1510 movies
**Last Updated**: 2025-10-02

All method signatures, parameters, and response examples are derived from `JSONRPC.Introspect` and verified against real API responses.

## Connection Architecture

### Transport Protocols

Kodi supports two transport protocols:

1. **HTTP JSON-RPC** (`/jsonrpc`)
   - One-off requests
   - Polling for status
   - Configuration changes
   - Library operations

2. **WebSocket JSON-RPC** (`ws://host:port/jsonrpc`)
   - Persistent connection
   - Real-time notifications
   - Playback events
   - Library updates

### Connection Pattern

```typescript
class KodiWebSocketClient {
  // Primary: WebSocket for real-time events
  private ws: WebSocket;

  // Fallback: HTTP for operations when WS unavailable
  private httpClient: HttpClient;

  // Connection lifecycle
  connect() → establish WebSocket → subscribe to notifications
  disconnect() → close WebSocket → cleanup
  reconnect() → exponential backoff strategy
}
```

### Authentication

Both protocols support HTTP Basic Auth:
- **Username**: Kodi web interface username (default: `kodi`)
- **Password**: Kodi web interface password
- **Header**: `Authorization: Basic <base64(username:password)>`

## JSON-RPC Message Format

### Request Structure

```json
{
  "jsonrpc": "2.0",
  "method": "Namespace.Method",
  "params": { /* method-specific parameters */ },
  "id": 1
}
```

### Response Structure

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { /* method-specific result */ }
}
```

### Error Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32601,
    "message": "Method not found"
  }
}
```

### Notification Structure (WebSocket Only)

```json
{
  "jsonrpc": "2.0",
  "method": "Notification.Event",
  "params": {
    "sender": "xbmc",
    "data": { /* event-specific data */ }
  }
}
```

## Property Reference

### Video.Fields.Movie (Available Movie Properties)

Complete list of properties that can be requested in `VideoLibrary.GetMovies` and `VideoLibrary.GetMovieDetails`:

| Property | Type | Description |
|----------|------|-------------|
| `title` | string | Movie title |
| `originaltitle` | string | Original language title |
| `sorttitle` | string | Title for alphabetical sorting |
| `year` | integer | Release year |
| `rating` | number | Default rating (deprecated, use `ratings`) |
| `ratings` | object | Multi-source ratings (IMDB, TMDB, Rotten Tomatoes) |
| `userrating` | integer | User's personal rating (0-10) |
| `votes` | integer | Vote count (deprecated, use `ratings`) |
| `playcount` | integer | Number of times played |
| `lastplayed` | string | ISO timestamp of last playback |
| `dateadded` | string | ISO timestamp when added to library |
| `premiered` | string | Release date (YYYY-MM-DD) |
| `runtime` | integer | Duration in seconds |
| `mpaa` | string | Content rating (G, PG, PG-13, R, etc.) |
| `plot` | string | Full synopsis |
| `plotoutline` | string | Short summary |
| `tagline` | string | Movie tagline |
| `file` | string | Full file path |
| `imdbnumber` | string | IMDB ID (deprecated, use `uniqueid`) |
| `uniqueid` | object | Provider IDs (`{imdb: "tt0133093", tmdb: "603"}`) |
| `genre` | array | List of genres |
| `director` | array | List of directors |
| `writer` | array | List of writers |
| `studio` | array | List of studios |
| `country` | array | List of countries |
| `tag` | array | User-defined tags |
| `cast` | array | Actors with roles, order, thumbnails |
| `set` | string | Movie set/collection name |
| `setid` | integer | Movie set ID |
| `showlink` | array | Related TV shows |
| `top250` | integer | IMDb Top 250 ranking |
| `trailer` | string | Trailer URL |
| `art` | object | All artwork types |
| `thumbnail` | string | Poster URL (deprecated, use `art`) |
| `fanart` | string | Backdrop URL (deprecated, use `art`) |
| `resume` | object | Resume position data |
| `streamdetails` | object | Video/audio codec information |

### Player.Property.Name (Available Player Properties)

Properties that can be requested in `Player.GetProperties`:

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | Media type (video, audio, picture) |
| `partymode` | boolean | Party mode enabled |
| `speed` | integer | Playback speed (0=paused, 1=normal, 2=2x, etc.) |
| `time` | object | Current position (`{hours, minutes, seconds, milliseconds}`) |
| `percentage` | number | Playback progress (0-100) |
| `totaltime` | object | Total duration |
| `playlistid` | integer | Active playlist ID |
| `position` | integer | Position in playlist |
| `repeat` | string | Repeat mode (off, one, all) |
| `shuffled` | boolean | Shuffle enabled |
| `canseek` | boolean | Seeking supported |
| `canchangespeed` | boolean | Speed change supported |
| `canmove` | boolean | Playlist reordering supported |
| `canzoom` | boolean | Zoom supported |
| `canrotate` | boolean | Rotation supported |
| `canshuffle` | boolean | Shuffle supported |
| `canrepeat` | boolean | Repeat supported |
| `currentaudiostream` | object | Active audio stream info |
| `audiostreams` | array | All available audio streams |
| `subtitleenabled` | boolean | Subtitles enabled |
| `currentsubtitle` | object | Active subtitle info |
| `subtitles` | array | All available subtitles |
| `live` | boolean | Live stream indicator |
| `currentvideostream` | object | Active video stream info |
| `videostreams` | array | All available video streams |
| `cachepercentage` | number | Buffer cache percentage |

## Core API Methods

### JSONRPC Namespace

#### JSONRPC.Ping
Test connection to Kodi instance.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "JSONRPC.Ping",
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "pong"
}
```

#### JSONRPC.Version
Get Kodi JSON-RPC API version.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "JSONRPC.Version",
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "version": {
      "major": 13,
      "minor": 0,
      "patch": 0
    }
  }
}
```

#### JSONRPC.Introspect
Get full API schema (for debugging/discovery).

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "JSONRPC.Introspect",
  "id": 1
}
```

**Response:** Returns complete API schema (very large response).

### VideoLibrary Namespace

#### VideoLibrary.Scan
Scans the video sources for new library items.

**Parameters (from introspect):**
- `directory` (string, optional, default: `""`) - Specific directory to scan, or empty for all sources
- `showdialogs` (boolean, optional, default: `true`) - Whether to show progress dialogs in Kodi UI

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "VideoLibrary.Scan",
  "params": {
    "directory": "/var/nfs/movies/",
    "showdialogs": false
  },
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "OK"
}
```

**Note**: Scan runs asynchronously. Use `VideoLibrary.OnScanStarted` and `VideoLibrary.OnScanFinished` notifications (WebSocket) to track progress.

#### VideoLibrary.Clean
Cleans the video library for non-existent items.

**Parameters (from introspect):**
- `showdialogs` (boolean, optional, default: `true`) - Whether to show progress dialogs
- `content` (string, optional, default: `"video"`) - Content type to clean
- `directory` (string, optional, default: `""`) - Specific directory to clean

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "VideoLibrary.Clean",
  "params": {
    "showdialogs": false,
    "content": "video"
  },
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "OK"
}
```

**Note**: Clean operation removes database entries for files that no longer exist on disk.

#### VideoLibrary.GetMovies
Retrieve movies from library.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "VideoLibrary.GetMovies",
  "params": {
    "properties": [
      "title",
      "year",
      "rating",
      "playcount",
      "file",
      "lastplayed",
      "dateadded",
      "imdbnumber",
      "mpaa",
      "runtime",
      "genre",
      "director",
      "studio",
      "plot",
      "originaltitle",
      "thumbnail",
      "fanart"
    ],
    "limits": {
      "start": 0,
      "end": 50
    },
    "sort": {
      "order": "ascending",
      "method": "title"
    }
  },
  "id": 1
}
```

**Response Example (from real Kodi instance with 1510 movies):**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "limits": {
      "start": 0,
      "end": 3,
      "total": 1510
    },
    "movies": [
      {
        "movieid": 9757,
        "title": "Dune: Part Two",
        "year": 2024,
        "rating": 8.5,
        "ratings": {
          "imdb": {
            "default": true,
            "rating": 8.5,
            "votes": 661737
          },
          "themoviedb": {
            "default": false,
            "rating": 8.1,
            "votes": 7004
          },
          "tomatometerallcritics": {
            "default": false,
            "rating": 9.2,
            "votes": 0
          }
        },
        "playcount": 0,
        "file": "/var/nfs/movies/Dune Sequel ()/Dune Part Two (tt15239678).mkv",
        "imdbnumber": "693134",
        "uniqueid": {
          "imdb": "tt15239678",
          "tmdb": "693134"
        },
        "mpaa": "PG-13",
        "runtime": 10020,
        "genre": ["Science Fiction", "Adventure"],
        "director": ["Denis Villeneuve"],
        "studio": ["Legendary Pictures"],
        "plot": "Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen while on a path of revenge against the conspirators who destroyed his family. Facing a choice between the love of his life and the fate of the known universe, Paul endeavors to prevent a terrible future only he can foresee.",
        "cast": [
          {
            "name": "Timothée Chalamet",
            "role": "Paul Atreides",
            "order": 0,
            "thumbnail": "image://https%3a%2f%2fimage.tmdb.org%2ft%2fp%2foriginal%2fBE2sdjpgsa2rNTFa66f7upkaOP.jpg/"
          },
          {
            "name": "Zendaya",
            "role": "Chani",
            "order": 1,
            "thumbnail": "image://https%3a%2f%2fimage.tmdb.org%2ft%2fp%2foriginal%2f3WdOloHpjtjL96uVOhFRRCcYSwq.jpg/"
          },
          {
            "name": "Rebecca Ferguson",
            "role": "Jessica",
            "order": 2,
            "thumbnail": "image://https%3a%2f%2fimage.tmdb.org%2ft%2fp%2foriginal%2flJloTOheuQSirSLXNA3JHsrMNfH.jpg/"
          }
        ]
      }
    ]
  }
}
```

**Note**: Runtime is in seconds (10020 = 167 minutes). The `rating` field shows the default rating, while `ratings` object provides multi-source ratings with vote counts.

#### VideoLibrary.GetMovieDetails
Get detailed information for specific movie.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "VideoLibrary.GetMovieDetails",
  "params": {
    "movieid": 1,
    "properties": [
      "title",
      "year",
      "rating",
      "playcount",
      "file",
      "imdbnumber",
      "cast",
      "writer",
      "set",
      "tag",
      "streamdetails"
    ]
  },
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "moviedetails": {
      "movieid": 1,
      "title": "The Matrix",
      "year": 1999,
      "cast": [
        {
          "name": "Keanu Reeves",
          "role": "Neo",
          "order": 0,
          "thumbnail": "image://..."
        }
      ],
      "streamdetails": {
        "video": [
          {
            "codec": "h264",
            "width": 1920,
            "height": 1080,
            "duration": 8160
          }
        ],
        "audio": [
          {
            "codec": "dts",
            "language": "eng",
            "channels": 6
          }
        ],
        "subtitle": [
          {
            "language": "eng"
          }
        ]
      }
    }
  }
}
```

#### VideoLibrary.SetMovieDetails
Update movie metadata.

**Parameters (from introspect):**
- `movieid` (integer, REQUIRED) - Movie ID to update
- `title` (string, optional) - Movie title
- `originaltitle` (string, optional) - Original language title
- `sorttitle` (string, optional) - Sort title
- `playcount` (integer, optional) - Play count
- `runtime` (integer, optional) - Runtime in seconds
- `director` (array of strings, optional) - Directors
- `studio` (array of strings, optional) - Studios
- `year` (integer, optional) - Release year
- `plot` (string, optional) - Full plot
- `plotoutline` (string, optional) - Short plot
- `genre` (array of strings, optional) - Genres
- `rating` (number, optional) - Rating (deprecated, use `ratings`)
- `mpaa` (string, optional) - Content rating
- `imdbnumber` (string, optional) - IMDB number (deprecated, use `uniqueid`)
- `votes` (integer, optional) - Vote count
- `lastplayed` (string, optional) - Last played timestamp
- `trailer` (string, optional) - Trailer URL
- `tagline` (string, optional) - Movie tagline
- `writer` (array of strings, optional) - Writers
- `country` (array of strings, optional) - Countries
- `top250` (integer, optional) - Top 250 ranking
- `set` (string, optional) - Movie set name
- `showlink` (array of strings, optional) - Related TV shows
- `thumbnail` (string, optional) - Thumbnail URL
- `fanart` (string, optional) - Fanart URL
- `tag` (array of strings, optional) - Tags
- `art` (object, optional) - All artwork types
- `resume` (object, optional) - Resume position
- `userrating` (integer, optional) - User rating (0-10)
- `ratings` (object, optional) - Multi-source ratings
- `dateadded` (string, optional) - Date added timestamp
- `premiered` (string, optional) - Premiere date (YYYY-MM-DD)
- `uniqueid` (object, optional) - Provider IDs (`{imdb: "...", tmdb: "..."}`)

**Request Example:**
```json
{
  "jsonrpc": "2.0",
  "method": "VideoLibrary.SetMovieDetails",
  "params": {
    "movieid": 9757,
    "title": "Updated Title",
    "year": 2024,
    "plot": "Updated plot...",
    "userrating": 9,
    "playcount": 5,
    "tag": ["Action", "Favorite"],
    "uniqueid": {
      "imdb": "tt15239678",
      "tmdb": "693134"
    }
  },
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "OK"
}
```

**Note**: All parameters except `movieid` are optional. Set to `null` to clear a value.

#### VideoLibrary.GetTVShows
Retrieve TV shows from library.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "VideoLibrary.GetTVShows",
  "params": {
    "properties": [
      "title",
      "year",
      "rating",
      "playcount",
      "genre",
      "studio",
      "plot",
      "imdbnumber",
      "premiered",
      "episode",
      "watchedepisodes",
      "thumbnail",
      "fanart"
    ]
  },
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tvshows": [
      {
        "tvshowid": 1,
        "title": "Breaking Bad",
        "year": 2008,
        "episode": 62,
        "watchedepisodes": 45,
        "imdbnumber": "tt0903747"
      }
    ]
  }
}
```

#### VideoLibrary.GetEpisodes
Retrieve episodes for a TV show.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "VideoLibrary.GetEpisodes",
  "params": {
    "tvshowid": 1,
    "season": 1,
    "properties": [
      "title",
      "season",
      "episode",
      "runtime",
      "rating",
      "playcount",
      "file",
      "plot",
      "firstaired",
      "showtitle"
    ]
  },
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "episodes": [
      {
        "episodeid": 1,
        "title": "Pilot",
        "season": 1,
        "episode": 1,
        "runtime": 58,
        "rating": 8.9,
        "playcount": 2,
        "file": "/tv/Breaking Bad/Season 01/S01E01.mkv",
        "showtitle": "Breaking Bad"
      }
    ]
  }
}
```

### Player Namespace

#### Player.GetActivePlayers
Check if any media is currently playing.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "Player.GetActivePlayers",
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": [
    {
      "playerid": 1,
      "playertype": "internal",
      "type": "video"
    }
  ]
}
```

**Empty Response (Nothing Playing):**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": []
}
```

#### Player.GetItem
Get currently playing item details.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "Player.GetItem",
  "params": {
    "playerid": 1,
    "properties": [
      "title",
      "season",
      "episode",
      "duration",
      "showtitle",
      "tvshowid",
      "file"
    ]
  },
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "item": {
      "id": 1,
      "type": "episode",
      "title": "Pilot",
      "season": 1,
      "episode": 1,
      "showtitle": "Breaking Bad",
      "tvshowid": 1,
      "file": "/tv/Breaking Bad/Season 01/S01E01.mkv"
    }
  }
}
```

#### Player.GetProperties
Get playback status (position, speed, etc.).

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "Player.GetProperties",
  "params": {
    "playerid": 1,
    "properties": [
      "time",
      "totaltime",
      "percentage",
      "speed",
      "position"
    ]
  },
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "percentage": 32.5,
    "position": 0,
    "speed": 1,
    "time": {
      "hours": 0,
      "minutes": 15,
      "seconds": 30,
      "milliseconds": 0
    },
    "totaltime": {
      "hours": 0,
      "minutes": 58,
      "seconds": 0,
      "milliseconds": 0
    }
  }
}
```

#### Player.PlayPause
Pauses or unpauses playback and returns the new state.

**Parameters (from introspect):**
- `playerid` (integer, REQUIRED) - Player ID (get from Player.GetActivePlayers)
- `play` (Global.Toggle, optional, default: `"toggle"`) - Playback action:
  - `"toggle"` - Toggle between play and pause
  - `true` - Force play
  - `false` - Force pause

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "Player.PlayPause",
  "params": {
    "playerid": 1,
    "play": "toggle"
  },
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "speed": 0
  }
}
```

**Speed Values:**
- `0` - Paused
- `1` - Normal playback
- `2`, `4`, `8`, etc. - Fast forward at 2x, 4x, 8x speed
- `-2`, `-4`, `-8`, etc. - Rewind at 2x, 4x, 8x speed

#### Player.Stop
Stop playback.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "Player.Stop",
  "params": {
    "playerid": 1
  },
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "OK"
}
```

### Files Namespace

#### Files.GetDirectory
Browse filesystem or library sources.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "Files.GetDirectory",
  "params": {
    "directory": "/movies/",
    "media": "video",
    "properties": [
      "file",
      "filetype",
      "size",
      "dateadded"
    ]
  },
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "files": [
      {
        "file": "/movies/The Matrix (1999)/",
        "filetype": "directory",
        "label": "The Matrix (1999)",
        "type": "directory"
      }
    ]
  }
}
```

#### Files.GetSources
Get library source paths.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "Files.GetSources",
  "params": {
    "media": "video"
  },
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "sources": [
      {
        "file": "/mnt/movies/",
        "label": "Movies"
      },
      {
        "file": "/mnt/tv/",
        "label": "TV Shows"
      }
    ]
  }
}
```

### Application Namespace

#### Application.GetProperties
Get Kodi application info.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "Application.GetProperties",
  "params": {
    "properties": [
      "version",
      "name",
      "volume",
      "muted"
    ]
  },
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "muted": false,
    "name": "Kodi",
    "version": {
      "major": 20,
      "minor": 2,
      "revision": "20230708-5af1e33d77",
      "tag": "stable"
    },
    "volume": 75
  }
}
```

## WebSocket Notifications

When connected via WebSocket, Kodi sends real-time notifications for various events.

### Connection Lifecycle

1. **Connect**: Establish WebSocket connection
2. **Subscribe**: No explicit subscription needed - all notifications sent automatically
3. **Receive**: Handle incoming notification messages
4. **Reconnect**: Implement exponential backoff on disconnect

### Notification Events

#### VideoLibrary.OnScanStarted
Library scan has started.

**Notification:**
```json
{
  "jsonrpc": "2.0",
  "method": "VideoLibrary.OnScanStarted",
  "params": {
    "sender": "xbmc",
    "data": null
  }
}
```

#### VideoLibrary.OnScanFinished
Library scan completed.

**Notification:**
```json
{
  "jsonrpc": "2.0",
  "method": "VideoLibrary.OnScanFinished",
  "params": {
    "sender": "xbmc",
    "data": null
  }
}
```

#### VideoLibrary.OnUpdate
Library item metadata updated.

**Notification:**
```json
{
  "jsonrpc": "2.0",
  "method": "VideoLibrary.OnUpdate",
  "params": {
    "sender": "xbmc",
    "data": {
      "id": 1,
      "type": "movie",
      "playcount": 3
    }
  }
}
```

#### VideoLibrary.OnRemove
Item removed from library.

**Notification:**
```json
{
  "jsonrpc": "2.0",
  "method": "VideoLibrary.OnRemove",
  "params": {
    "sender": "xbmc",
    "data": {
      "id": 5,
      "type": "movie"
    }
  }
}
```

#### Player.OnPlay
Playback started.

**Notification:**
```json
{
  "jsonrpc": "2.0",
  "method": "Player.OnPlay",
  "params": {
    "sender": "xbmc",
    "data": {
      "item": {
        "id": 1,
        "type": "movie",
        "title": "The Matrix"
      },
      "player": {
        "playerid": 1,
        "speed": 1
      }
    }
  }
}
```

#### Player.OnPause
Playback paused.

**Notification:**
```json
{
  "jsonrpc": "2.0",
  "method": "Player.OnPause",
  "params": {
    "sender": "xbmc",
    "data": {
      "item": {
        "id": 1,
        "type": "movie"
      },
      "player": {
        "playerid": 1,
        "speed": 0
      }
    }
  }
}
```

#### Player.OnStop
Playback stopped.

**Notification:**
```json
{
  "jsonrpc": "2.0",
  "method": "Player.OnStop",
  "params": {
    "sender": "xbmc",
    "data": {
      "end": true,  // true = reached end, false = manually stopped
      "item": {
        "id": 1,
        "type": "movie"
      }
    }
  }
}
```

#### Player.OnSeek
User seeked to different position.

**Notification:**
```json
{
  "jsonrpc": "2.0",
  "method": "Player.OnSeek",
  "params": {
    "sender": "xbmc",
    "data": {
      "item": {
        "id": 1,
        "type": "movie"
      },
      "player": {
        "playerid": 1,
        "time": {
          "hours": 0,
          "minutes": 30,
          "seconds": 15
        }
      }
    }
  }
}
```

#### Player.OnSpeedChanged
Playback speed changed (fast forward, rewind).

**Notification:**
```json
{
  "jsonrpc": "2.0",
  "method": "Player.OnSpeedChanged",
  "params": {
    "sender": "xbmc",
    "data": {
      "player": {
        "playerid": 1,
        "speed": 2  // 2x speed
      }
    }
  }
}
```

## Error Codes

| Code | Message | Description |
|------|---------|-------------|
| -32700 | Parse error | Invalid JSON received |
| -32600 | Invalid Request | JSON is not valid request object |
| -32601 | Method not found | Method does not exist |
| -32602 | Invalid params | Invalid method parameters |
| -32603 | Internal error | Internal JSON-RPC error |
| -32100 | Failed | Method call failed |

## Common Patterns

### Testing Connection

```typescript
async testConnection(): Promise<boolean> {
  try {
    const response = await this.sendRequest({
      jsonrpc: '2.0',
      method: 'JSONRPC.Ping',
      id: 1
    });
    return response.result === 'pong';
  } catch (error) {
    return false;
  }
}
```

### Triggering Library Scan

```typescript
async scanLibrary(path?: string): Promise<void> {
  await this.sendRequest({
    jsonrpc: '2.0',
    method: 'VideoLibrary.Scan',
    params: {
      directory: path,
      showdialogs: false
    },
    id: Date.now()
  });
}
```

### Checking Playback Status

```typescript
async getPlaybackStatus(): Promise<PlaybackStatus | null> {
  // First, check if any players are active
  const playersResponse = await this.sendRequest({
    jsonrpc: '2.0',
    method: 'Player.GetActivePlayers',
    id: 1
  });

  if (!playersResponse.result || playersResponse.result.length === 0) {
    return null; // Nothing playing
  }

  const playerId = playersResponse.result[0].playerid;

  // Get item details
  const itemResponse = await this.sendRequest({
    jsonrpc: '2.0',
    method: 'Player.GetItem',
    params: {
      playerid: playerId,
      properties: ['title', 'season', 'episode', 'showtitle']
    },
    id: 2
  });

  // Get playback properties
  const propsResponse = await this.sendRequest({
    jsonrpc: '2.0',
    method: 'Player.GetProperties',
    params: {
      playerid: playerId,
      properties: ['time', 'totaltime', 'percentage', 'speed']
    },
    id: 3
  });

  return {
    item: itemResponse.result.item,
    position: propsResponse.result.time,
    duration: propsResponse.result.totaltime,
    percentage: propsResponse.result.percentage,
    speed: propsResponse.result.speed
  };
}
```

### Updating Movie Metadata

```typescript
async updateMovieMetadata(movieId: number, metadata: MovieMetadata): Promise<void> {
  await this.sendRequest({
    jsonrpc: '2.0',
    method: 'VideoLibrary.SetMovieDetails',
    params: {
      movieid: movieId,
      ...metadata
    },
    id: Date.now()
  });
}
```

### Handling WebSocket Notifications

```typescript
handleNotification(notification: any): void {
  const { method, params } = notification;

  switch (method) {
    case 'Player.OnPlay':
      this.emit('playbackStarted', params.data);
      break;

    case 'Player.OnStop':
      this.emit('playbackStopped', params.data);
      break;

    case 'VideoLibrary.OnScanStarted':
      this.emit('scanStarted');
      break;

    case 'VideoLibrary.OnScanFinished':
      this.emit('scanFinished');
      break;

    case 'VideoLibrary.OnUpdate':
      this.emit('libraryUpdated', params.data);
      break;

    default:
      // Log unknown notifications for debugging
      console.log('Unknown notification:', method);
  }
}
```

## Connection State Management

### States

```typescript
enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}
```

### Reconnection Strategy

```typescript
class ReconnectionManager {
  private attempts = 0;
  private maxAttempts = 5;
  private baseDelay = 1000; // 1 second

  getReconnectDelay(): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    return Math.min(
      this.baseDelay * Math.pow(2, this.attempts),
      30000 // Max 30 seconds
    );
  }

  reset(): void {
    this.attempts = 0;
  }

  incrementAttempts(): boolean {
    this.attempts++;
    return this.attempts < this.maxAttempts;
  }
}
```

## Best Practices

### 1. Use WebSocket for Real-Time Updates
- Establish persistent WebSocket connection for notifications
- Fall back to HTTP for one-off operations if WebSocket unavailable

### 2. Implement Proper Error Handling
- Catch connection errors and implement retry logic
- Handle JSON-RPC error responses gracefully
- Log errors with context for debugging

### 3. Request ID Management
- Use unique IDs for each request (timestamp or incrementing counter)
- Match responses to requests using ID field

### 4. Optimize API Calls
- Request only needed properties to reduce response size
- Use pagination for large result sets
- Batch related operations when possible

### 5. Handle Connection State
- Track connection state and emit events
- Implement exponential backoff for reconnection
- Notify application layer of connection changes

### 6. Notification Processing
- Process notifications asynchronously
- Emit events for application layer to consume
- Handle unknown notifications gracefully

### 7. Library Path Mapping
- Get library sources using `Files.GetSources`
- Map Metarr library paths to Kodi source paths
- Handle path format differences (Windows vs. Linux)

## Kodi Version Compatibility

- **Kodi 18 (Leia)**: JSON-RPC API v10
- **Kodi 19 (Matrix)**: JSON-RPC API v12
- **Kodi 20 (Nexus)**: JSON-RPC API v13
- **Kodi 21 (Omega)**: JSON-RPC API v13

Most methods remain stable across versions. Use `JSONRPC.Version` to detect capabilities.

## Resources

- **Official API Documentation**: https://kodi.wiki/view/JSON-RPC_API
- **Interactive API Browser**: Available in Kodi settings (Web interface)
- **WebSocket Testing**: Use browser console or WebSocket client tools
