# WebSocket + TanStack Query Implementation Summary

## Overview

The Metarr frontend has been successfully migrated from Server-Sent Events (SSE) with manual state management to WebSocket with TanStack Query for real-time bidirectional communication and automatic server state management.

## Implementation Completed

### 1. Type Definitions
**File:** `/home/justin/Code/Metarr/public/frontend/src/types/websocket.ts`

Created comprehensive TypeScript interfaces mirroring backend WebSocket message types:
- Client messages (ping, resync, updateMovie, deleteImage, updatePlayer, startLibraryScan, cancelLibraryScan)
- Server messages (pong, resyncData, playerStatus, scanStatus, moviesChanged, libraryChanged, ack, conflict, error, welcome)
- Connection state types (connecting, connected, disconnected, error)
- WebSocket configuration types

### 2. ResilientWebSocket Client
**File:** `/home/justin/Code/Metarr/public/frontend/src/services/ResilientWebSocket.ts`

Implemented a robust WebSocket client with:
- **Automatic Reconnection:** Exponential backoff (1s → 2s → 4s → 8s → 16s, max 30s)
- **Connection State Management:** Tracks connecting, connected, disconnected, error states
- **Message Queue:** Buffers messages during disconnection and flushes on reconnect
- **Heartbeat:** Ping/pong mechanism to detect dead connections (30s interval)
- **Event Emitter Pattern:** Subscribe to message types with on()/off() methods
- **State Change Notifications:** Subscribe to connection state changes

**Key Methods:**
- `connect()` - Establish WebSocket connection
- `disconnect()` - Close connection gracefully
- `send(message)` - Send message (queues if disconnected)
- `on(type, handler)` - Subscribe to message type
- `off(type, handler)` - Unsubscribe from message type
- `onStateChange(handler)` - Subscribe to connection state changes
- `getState()` - Get current connection state

### 3. WebSocket Context
**File:** `/home/justin/Code/Metarr/public/frontend/src/contexts/WebSocketContext.tsx`

React Context providing WebSocket connection to all components:
- Initializes ResilientWebSocket instance
- Provides connection state to components via `useWebSocket()` hook
- **Automatic TanStack Query Integration:** Listens to server messages and invalidates queries
- Handles automatic query invalidation for:
  - `moviesChanged` → invalidates movies queries
  - `playerStatus` → invalidates player queries
  - `scanStatus` → invalidates scan queries
  - `libraryChanged` → invalidates library queries
  - `resyncData` → invalidates all queries in scope

**WebSocket URL:** Automatically determined from window.location:
- Development: `ws://localhost:3000/ws`
- Production: `wss://your-domain.com/ws`

### 4. TanStack Query Setup
**File:** `/home/justin/Code/Metarr/public/frontend/src/App.tsx`

Configured TanStack Query with optimal settings:
- `staleTime: Infinity` - Data stays fresh until explicitly invalidated
- `refetchOnWindowFocus: false` - Don't refetch on window focus
- `retry: 1` - Only retry once on failure
- React Query DevTools enabled in development mode only

**Provider Hierarchy:**
```tsx
<QueryClientProvider>
  <WebSocketProvider>
    <AppRoutes />
    <ReactQueryDevtools /> {/* Dev only */}
  </WebSocketProvider>
</QueryClientProvider>
```

### 5. TanStack Query Hooks

#### Movies Hooks
**File:** `/home/justin/Code/Metarr/public/frontend/src/hooks/useMovies.ts`

- `useMovies(options?)` - Fetch all movies with optional filtering
- `useMovie(id)` - Fetch single movie by ID
- `useUpdateMovie()` - Update movie with optimistic updates and rollback on error
- `useDeleteMovie()` - Delete movie (placeholder)

**Features:**
- Optimistic updates for instant UI feedback
- Automatic rollback on error
- WebSocket integration for real-time updates
- Query invalidation on success

#### Media Players Hooks
**File:** `/home/justin/Code/Metarr/public/frontend/src/hooks/usePlayers.ts`

- `usePlayers()` - Fetch all media players
- `usePlayer(id)` - Fetch single media player
- `usePlayerStatus()` - Real-time player status from WebSocket
- `useCreatePlayer()` - Create new media player
- `useUpdatePlayer()` - Update media player (WebSocket + REST fallback)
- `useDeletePlayer()` - Delete media player
- `useTestConnection()` - Test connection to saved player
- `useTestConnectionUnsaved()` - Test connection without saving
- `useConnectPlayer()` - Connect media player
- `useDisconnectPlayer()` - Disconnect media player

**Features:**
- Real-time status updates via WebSocket
- Dual WebSocket + REST API calls for mutations
- Automatic cache invalidation

#### Library Scans Hooks
**File:** `/home/justin/Code/Metarr/public/frontend/src/hooks/useLibraryScans.ts`

- `useLibraries()` - Fetch all libraries
- `useLibrary(id)` - Fetch single library
- `useActiveScans()` - Real-time active scans from WebSocket
- `useCreateLibrary()` - Create new library
- `useUpdateLibrary()` - Update library
- `useDeleteLibrary()` - Delete library
- `useStartLibraryScan()` - Start library scan (WebSocket + REST)
- `useCancelLibraryScan()` - Cancel library scan (WebSocket only)
- `useValidatePath()` - Validate directory path
- `useBrowsePath(path)` - Browse directory
- `useDrives()` - Get available drives (Windows)

**Features:**
- Real-time scan progress via WebSocket
- Auto-removal of completed scans after 5s
- Map-based state management for efficient updates

### 6. Updated Backend Connection Hook
**File:** `/home/justin/Code/Metarr/public/frontend/src/hooks/useBackendConnection.ts`

Migrated from health check polling to WebSocket connection state:
- Removed fetch polling logic
- Now uses WebSocket connection state
- Maintains same interface for backward compatibility
- Updates global connection monitor
- Maps WebSocket states to connection errors

**Benefits:**
- No redundant HTTP polling
- Instant connection state updates
- Less network overhead

### 7. Migration Documentation
**File:** `/home/justin/Code/Metarr/public/frontend/WEBSOCKET_MIGRATION.md`

Comprehensive migration guide including:
- Before/after code examples
- Step-by-step migration instructions
- Complete hook documentation
- Common patterns and use cases
- Debugging tips
- TanStack Query DevTools usage

### 8. Example Component
**File:** `/home/justin/Code/Metarr/public/frontend/src/pages/metadata/Movies.tsx.example`

Complete example showing how to migrate the Movies component:
- Replaces manual state with `useMovies()` hook
- Removes SSE subscription code
- Keeps all UI components unchanged
- Demonstrates error handling
- Includes detailed migration notes

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         React App                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         QueryClientProvider (TanStack Query)           │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │          WebSocketProvider                       │  │  │
│  │  │  ┌───────────────────────────────────────────┐  │  │  │
│  │  │  │     ResilientWebSocket Client             │  │  │  │
│  │  │  │  - Auto-reconnect (exp. backoff)          │  │  │  │
│  │  │  │  - Message queue                           │  │  │  │
│  │  │  │  - Heartbeat (ping/pong)                   │  │  │  │
│  │  │  │  - Event emitter                           │  │  │  │
│  │  │  └───────────────┬───────────────────────────┘  │  │  │
│  │  │                  │                               │  │  │
│  │  │                  ▼                               │  │  │
│  │  │      Automatic Query Invalidation               │  │  │
│  │  │      (on WebSocket events)                      │  │  │
│  │  └──────────────────┬──────────────────────────────┘  │  │
│  │                     │                                  │  │
│  │                     ▼                                  │  │
│  │            React Components                            │  │
│  │         ┌──────────┬──────────┬──────────┐            │  │
│  │         │ useMovies│usePlayers│ useScans │            │  │
│  │         │  hook    │  hook    │   hook   │            │  │
│  │         └──────────┴──────────┴──────────┘            │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
                 WebSocket Connection
                    ws://host/ws
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend Server                            │
│                  WebSocket Handler                           │
│  - Broadcasts events (moviesChanged, playerStatus, etc.)     │
│  - Handles client messages (updateMovie, startScan, etc.)    │
│  - Ping/pong heartbeat                                       │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow Examples

### 1. Movie Updated (Client → Server → All Clients)
```
User edits movie
    ↓
useUpdateMovie().mutate({ id, updates })
    ↓
Optimistic update (instant UI feedback)
    ↓
Send updateMovie message via WebSocket
    ↓
Server processes update
    ↓
Server broadcasts moviesChanged to all clients
    ↓
WebSocketContext receives moviesChanged
    ↓
Invalidates movies queries
    ↓
TanStack Query refetches movies
    ↓
UI updates with server data (confirms optimistic update or reverts)
```

### 2. Library Scan Progress (Server → Client)
```
User clicks "Scan Library"
    ↓
useStartLibraryScan().mutate(libraryId)
    ↓
Send startLibraryScan via WebSocket
    ↓
Server starts scan job
    ↓
Server broadcasts scanStatus (status: running)
    ↓
useActiveScans() hook receives update
    ↓
Progress bar updates in real-time
    ↓
Server broadcasts scanStatus updates
    ↓
Progress continues to update
    ↓
Server broadcasts scanStatus (status: completed)
    ↓
Scan removed from active scans after 5s
```

### 3. Player Connection Status (Server → Client)
```
Kodi player connects
    ↓
Server detects connection
    ↓
Server broadcasts playerStatus (status: connected)
    ↓
WebSocketContext receives playerStatus
    ↓
Invalidates player queries
    ↓
usePlayerStatus() updates
    ↓
Connection indicator turns green
```

## Migration Path for Existing Components

### Phase 1: Update Data Fetching (Low Risk)
Components that only fetch and display data:
1. Replace `useState` + `useEffect` with appropriate hook
2. Remove SSE subscriptions
3. Test thoroughly

**Example Components:**
- Movies list
- Libraries list
- Media Players list

### Phase 2: Update Mutations (Medium Risk)
Components that modify data:
1. Replace manual API calls with mutation hooks
2. Add optimistic updates where appropriate
3. Test error rollback scenarios

**Example Components:**
- Movie edit form
- Library configuration
- Media player settings

### Phase 3: Real-time Features (Low Risk)
Components that display real-time data:
1. Use real-time hooks (useActiveScans, usePlayerStatus)
2. Remove SSE event listeners
3. Test WebSocket reconnection scenarios

**Example Components:**
- Scan progress indicators
- Player status indicators
- Activity feeds

## Testing Recommendations

### 1. Connection Resilience
- Stop backend server → Check auto-reconnect
- Network throttling → Verify message queuing
- Restart backend → Ensure state resync

### 2. Real-time Updates
- Update movie in one browser tab → Verify update in another tab
- Start scan → Verify progress updates in real-time
- Connect/disconnect player → Verify status updates

### 3. Optimistic Updates
- Update movie with good connection → Instant UI update
- Update movie with no connection → Rollback on error
- Update movie then quickly navigate away → No stale state

### 4. Query Invalidation
- Receive WebSocket event → Verify query refetch
- Multiple updates in quick succession → Verify debouncing
- Update while query is already fetching → No race conditions

### 5. DevTools
- Open React Query DevTools → Inspect query states
- Trigger refetch → Verify query updates
- Inspect WebSocket frames → Verify message format

## Performance Improvements

### Before (SSE + Manual State)
- 3 separate SSE connections (movies, players, scans)
- Manual state updates on every event
- No request deduplication
- No automatic caching
- Polling for connection health (15s interval)

### After (WebSocket + TanStack Query)
- 1 WebSocket connection for all real-time updates
- Automatic cache management
- Request deduplication
- Smart invalidation (only refetch when needed)
- No health check polling (WebSocket handles this)

**Network Savings:**
- 66% reduction in persistent connections (3 SSE → 1 WebSocket)
- Eliminated health check polling (saves 4 requests/minute)
- Bidirectional communication (no need for separate POST requests for some operations)

**Memory Savings:**
- TanStack Query garbage collects unused queries
- No duplicate state in multiple components
- Automatic cache pruning

## Backward Compatibility

### Deprecated (Still Available)
The following SSE subscriptions in `api.ts` are deprecated but still functional:
- `movieApi.subscribeToUpdates()`
- `mediaPlayerApi.subscribeToStatus()`
- `libraryApi.subscribeToScanProgress()`

**Recommendation:** Migrate to TanStack Query hooks as soon as possible. These will be removed in a future release.

### REST API Fallback
All mutations maintain REST API fallback:
- WebSocket sends message first (fast)
- REST API called as backup (reliable)
- If WebSocket disconnected, REST API ensures operation succeeds

## Known Limitations

1. **Backend WebSocket must be running** - Frontend requires active WebSocket server
2. **Browser compatibility** - Requires browsers with WebSocket support (all modern browsers)
3. **Single movie fetch** - `useMovie(id)` currently fetches all movies and filters (needs backend endpoint)
4. **Delete movie** - Not yet implemented in backend

## Next Steps

### Immediate Tasks
1. Migrate existing components to use new hooks
2. Remove SSE subscription code from `api.ts`
3. Test WebSocket reconnection in production
4. Monitor WebSocket connection stability

### Future Enhancements
1. Add `GET /api/movies/:id` endpoint for single movie fetch
2. Implement `DELETE /api/movies/:id` endpoint
3. Add WebSocket message compression for large payloads
4. Implement WebSocket authentication/authorization
5. Add metrics for WebSocket message volume
6. Consider WebSocket clustering for horizontal scaling

## Files Created/Modified

### Created
1. `/home/justin/Code/Metarr/public/frontend/src/types/websocket.ts` - Type definitions
2. `/home/justin/Code/Metarr/public/frontend/src/services/ResilientWebSocket.ts` - WebSocket client
3. `/home/justin/Code/Metarr/public/frontend/src/contexts/WebSocketContext.tsx` - React Context
4. `/home/justin/Code/Metarr/public/frontend/src/hooks/useMovies.ts` - Movies hooks
5. `/home/justin/Code/Metarr/public/frontend/src/hooks/usePlayers.ts` - Players hooks
6. `/home/justin/Code/Metarr/public/frontend/src/hooks/useLibraryScans.ts` - Library scans hooks
7. `/home/justin/Code/Metarr/public/frontend/WEBSOCKET_MIGRATION.md` - Migration guide
8. `/home/justin/Code/Metarr/public/frontend/src/pages/metadata/Movies.tsx.example` - Example component
9. `/home/justin/Code/Metarr/WEBSOCKET_IMPLEMENTATION_SUMMARY.md` - This document

### Modified
1. `/home/justin/Code/Metarr/public/frontend/src/App.tsx` - Added QueryClientProvider and WebSocketProvider
2. `/home/justin/Code/Metarr/public/frontend/src/hooks/useBackendConnection.ts` - Uses WebSocket state

## Verification

### TypeScript Compilation
```bash
npm run typecheck
# ✓ No errors
```

### Dependencies
All required packages already installed:
- `@tanstack/react-query@^5.90.2`
- `@tanstack/react-query-devtools@^5.90.2`

### Code Quality
- All files follow existing code style
- Comprehensive TypeScript types
- Extensive inline documentation
- Error handling with rollback
- Optimistic updates where appropriate

## Conclusion

The WebSocket + TanStack Query implementation is **complete and ready for testing**. The architecture provides:
- **Real-time bidirectional communication** via WebSocket
- **Automatic server state management** via TanStack Query
- **Optimistic updates** for instant UI feedback
- **Automatic cache invalidation** based on server events
- **Connection resilience** with exponential backoff
- **Developer-friendly debugging** with DevTools

All existing REST API endpoints remain functional, ensuring a smooth migration path. Components can be migrated incrementally without breaking existing functionality.
