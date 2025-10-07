# WebSocket + TanStack Query Implementation Checklist

## ✅ Implementation Status

### Core Infrastructure (100% Complete)
- [x] WebSocket type definitions (`types/websocket.ts`)
- [x] ResilientWebSocket client (`services/ResilientWebSocket.ts`)
- [x] WebSocket React Context (`contexts/WebSocketContext.tsx`)
- [x] TanStack Query setup in App.tsx
- [x] QueryClientProvider configuration
- [x] React Query DevTools integration (dev only)

### TanStack Query Hooks (100% Complete)
- [x] Movies hooks (`hooks/useMovies.ts`)
  - [x] useMovies() - fetch all
  - [x] useMovie(id) - fetch one
  - [x] useUpdateMovie() - with optimistic updates
  - [x] useDeleteMovie() - placeholder

- [x] Media Players hooks (`hooks/usePlayers.ts`)
  - [x] usePlayers() - fetch all
  - [x] usePlayer(id) - fetch one
  - [x] usePlayerStatus() - real-time status
  - [x] useCreatePlayer()
  - [x] useUpdatePlayer() - WebSocket + REST
  - [x] useDeletePlayer()
  - [x] useTestConnection()
  - [x] useTestConnectionUnsaved()
  - [x] useConnectPlayer()
  - [x] useDisconnectPlayer()

- [x] Library Scans hooks (`hooks/useLibraryScans.ts`)
  - [x] useLibraries() - fetch all
  - [x] useLibrary(id) - fetch one
  - [x] useActiveScans() - real-time scans
  - [x] useCreateLibrary()
  - [x] useUpdateLibrary()
  - [x] useDeleteLibrary()
  - [x] useStartLibraryScan() - WebSocket + REST
  - [x] useCancelLibraryScan()
  - [x] useValidatePath()
  - [x] useBrowsePath(path)
  - [x] useDrives()

### Updated Hooks (100% Complete)
- [x] useBackendConnection - migrated to use WebSocket state

### Documentation (100% Complete)
- [x] Migration guide (`WEBSOCKET_MIGRATION.md`)
- [x] Implementation summary (`WEBSOCKET_IMPLEMENTATION_SUMMARY.md`)
- [x] Quick start guide (`QUICK_START.md`)
- [x] Example component (`Movies.tsx.example`)
- [x] This checklist

### Build & Type Safety (100% Complete)
- [x] TypeScript compilation passes
- [x] Frontend build succeeds
- [x] No linting errors
- [x] All dependencies installed

## 🔄 Next Steps (Migration)

### Phase 1: Test Infrastructure
- [ ] Start backend server with WebSocket support
- [ ] Start frontend development server
- [ ] Verify WebSocket connection in browser DevTools
- [ ] Check React Query DevTools panel appears
- [ ] Test auto-reconnect (stop/start backend)
- [ ] Verify message queue (disconnect, queue messages, reconnect)

### Phase 2: Migrate Components

#### High Priority (User-Facing)
- [ ] Movies list page (`pages/metadata/Movies.tsx`)
  - Replace with example from `Movies.tsx.example`
  - Test search and filtering
  - Verify real-time updates

- [ ] Media Players page (`pages/settings/MediaPlayers.tsx`)
  - Use usePlayers() and related hooks
  - Test player status indicators
  - Verify connection/disconnection

- [ ] Libraries page (`pages/settings/Libraries.tsx`)
  - Use useLibraries() and useActiveScans()
  - Test scan progress display
  - Verify real-time scan updates

#### Medium Priority (Forms)
- [ ] Movie edit form (`pages/metadata/MovieEdit.tsx`)
  - Use useUpdateMovie() mutation
  - Test optimistic updates
  - Verify error rollback

- [ ] Media Player configuration modal
  - Use useCreatePlayer() and useUpdatePlayer()
  - Test validation
  - Verify test connection functionality

- [ ] Library configuration modal
  - Use useCreateLibrary() and useUpdateLibrary()
  - Test path validation
  - Verify directory browser

#### Low Priority (Dashboard/Stats)
- [ ] Dashboard page (if it displays real-time stats)
- [ ] Activity pages (if they show real-time events)
- [ ] System status page (if it shows connections)

### Phase 3: Remove Deprecated Code
- [ ] Remove SSE subscriptions from `utils/api.ts`:
  - [ ] `movieApi.subscribeToUpdates()`
  - [ ] `mediaPlayerApi.subscribeToStatus()`
  - [ ] `libraryApi.subscribeToScanProgress()`

- [ ] Remove EventSource imports
- [ ] Clean up any leftover SSE error handling

### Phase 4: Testing

#### Functional Testing
- [ ] Create movie → verify appears in list
- [ ] Update movie → verify instant UI update
- [ ] Delete movie → verify removal
- [ ] Start scan → verify progress updates
- [ ] Cancel scan → verify cancellation
- [ ] Connect player → verify status update
- [ ] Disconnect player → verify status update

#### Connection Testing
- [ ] Disconnect network → verify error state
- [ ] Reconnect network → verify recovery
- [ ] Stop backend → verify auto-reconnect
- [ ] Restart backend → verify resync
- [ ] Slow network → verify message queuing

#### Multi-Tab Testing
- [ ] Open two tabs
- [ ] Update movie in tab 1 → verify update in tab 2
- [ ] Start scan in tab 1 → verify progress in tab 2
- [ ] Connect player in tab 1 → verify status in tab 2

#### Performance Testing
- [ ] Large movie list (1000+ items) → verify smooth scrolling
- [ ] Multiple scans running → verify UI responsiveness
- [ ] Rapid updates → verify no memory leaks
- [ ] Long session (1+ hour) → verify connection stability

### Phase 5: Production Preparation
- [ ] Test with production build (`npm run build:frontend`)
- [ ] Verify WebSocket works over HTTPS (wss://)
- [ ] Test with load balancer (if applicable)
- [ ] Add error monitoring/logging
- [ ] Document production deployment
- [ ] Create rollback plan

## 📋 Component Migration Template

For each component to migrate, follow this checklist:

### Before Migration
- [ ] Identify all SSE subscriptions
- [ ] List all manual state management (useState)
- [ ] Note all API calls (movieApi.*, etc.)
- [ ] Document expected behavior
- [ ] Create backup of component

### During Migration
- [ ] Replace useState + useEffect with appropriate hook
- [ ] Remove SSE subscription code
- [ ] Update loading/error states
- [ ] Test basic functionality
- [ ] Add optimistic updates (if mutation)

### After Migration
- [ ] Verify TypeScript compilation
- [ ] Test in browser
- [ ] Test real-time updates
- [ ] Test error scenarios
- [ ] Update component documentation
- [ ] Delete backup

## 🐛 Known Issues & Solutions

### Issue: WebSocket not connecting
**Solution:** Check backend WebSocket server is running on `/ws` endpoint

### Issue: Queries not invalidating
**Solution:** Verify WebSocketContext is receiving server messages

### Issue: Optimistic updates not reverting
**Solution:** Check mutation onError handler is not overridden

### Issue: DevTools not appearing
**Solution:** Ensure `import.meta.env.DEV` is true (dev mode only)

### Issue: Type errors in hooks
**Solution:** Run `npm run typecheck` and fix any type mismatches

## 📊 Success Metrics

### Before (SSE + Manual State)
- 3 persistent connections (SSE)
- ~15 LOC per component for state management
- Manual cache invalidation
- 4 health check requests/minute

### After (WebSocket + TanStack Query)
- 1 persistent connection (WebSocket)
- ~3 LOC per component for state management
- Automatic cache invalidation
- 0 health check requests (WebSocket handles it)

### Target Metrics
- [ ] 66% reduction in persistent connections
- [ ] 80% reduction in state management code
- [ ] 100% automatic cache invalidation
- [ ] 0 redundant health checks
- [ ] <100ms UI update latency
- [ ] >99% WebSocket uptime

## 🚀 Deployment Steps

### Development
1. `npm install` (if not already done)
2. `npm run dev:all` (starts backend + frontend)
3. Open http://localhost:3001
4. Check browser console for WebSocket connection
5. Open React Query DevTools (bottom-left)

### Production
1. `npm run build` (build backend)
2. `npm run build:frontend` (build frontend)
3. `npm start` (start server)
4. Verify WebSocket connects over wss://
5. Monitor connection logs

## 📝 Additional Notes

### TanStack Query Best Practices
- Use `staleTime: Infinity` for data invalidated via WebSocket
- Use `refetchOnWindowFocus: false` to prevent unnecessary refetches
- Use optimistic updates for instant UI feedback
- Let WebSocket events trigger cache invalidation

### WebSocket Best Practices
- Always handle disconnection gracefully
- Queue messages during disconnection
- Use exponential backoff for reconnection
- Implement heartbeat (ping/pong)
- Log connection events for debugging

### React Best Practices
- Use hooks at top level of components
- Don't call hooks conditionally
- Clean up subscriptions in useEffect
- Use TypeScript for type safety

## ✅ Final Verification

Before considering implementation complete:
- [ ] All TypeScript errors resolved
- [ ] All components migrated
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Performance metrics met
- [ ] Production deployment successful
- [ ] Rollback plan tested
- [ ] Team trained on new architecture

---

**Status:** ✅ Infrastructure Complete, Ready for Component Migration
**Last Updated:** 2025-10-07
**Next Action:** Test infrastructure by starting dev servers and verifying WebSocket connection
