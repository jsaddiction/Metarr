import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from '@/components/ui/sonner';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { Layout } from './components/layout/Layout';
import { RouteErrorBoundary } from './components/error/RouteErrorBoundary';

// Lazy-loaded route components for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Movies = lazy(() => import('./pages/metadata/Movies').then(m => ({ default: m.Movies })));
const MovieEdit = lazy(() => import('./pages/metadata/MovieEdit').then(m => ({ default: m.MovieEdit })));
const Actors = lazy(() => import('./pages/metadata/Actors').then(m => ({ default: m.Actors })));
const Series = lazy(() => import('./pages/Series').then(m => ({ default: m.Series })));
const Music = lazy(() => import('./pages/Music').then(m => ({ default: m.Music })));
const Artists = lazy(() => import('./pages/Artists').then(m => ({ default: m.Artists })));
const History = lazy(() => import('./pages/activity/History').then(m => ({ default: m.History })));
const RunningJobs = lazy(() => import('./pages/activity/RunningJobs').then(m => ({ default: m.RunningJobs })));
const BlockedAssets = lazy(() => import('./pages/activity/BlockedAssets').then(m => ({ default: m.BlockedAssets })));
const Status = lazy(() => import('./pages/system/Status').then(m => ({ default: m.Status })));
const Tasks = lazy(() => import('./pages/system/Tasks').then(m => ({ default: m.Tasks })));
const Backup = lazy(() => import('./pages/system/Backup').then(m => ({ default: m.Backup })));
const Events = lazy(() => import('./pages/system/Events').then(m => ({ default: m.Events })));
const LogFiles = lazy(() => import('./pages/system/LogFiles').then(m => ({ default: m.LogFiles })));
const Providers = lazy(() => import('./pages/settings/Providers').then(m => ({ default: m.Providers })));
const Libraries = lazy(() => import('./pages/settings/Libraries').then(m => ({ default: m.Libraries })));
const MediaPlayers = lazy(() => import('./pages/settings/MediaPlayers').then(m => ({ default: m.MediaPlayers })));
const Notifications = lazy(() => import('./pages/settings/Notifications').then(m => ({ default: m.Notifications })));
const Workflow = lazy(() => import('./pages/settings/Workflow').then(m => ({ default: m.Workflow })));
const SaveBarDemo = lazy(() => import('./pages/test/SaveBarDemo').then(m => ({ default: m.SaveBarDemo })));

// Configure QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - data becomes stale after this time
      refetchOnWindowFocus: 'always', // Refetch on window focus for freshness
      refetchOnReconnect: 'always', // Refetch when network reconnects
      retry: 1, // Only retry once on failure
    },
    mutations: {
      retry: false, // Don't retry mutations by default (user actions should be explicit)
    },
  },
});

// Helper to get page title based on route
function usePageTitle() {
  const location = useLocation();

  // Handle dynamic routes
  if (location.pathname.match(/^\/media\/movies\/\d+\/edit$/)) {
    return 'Edit Movie';
  }

  const pathMap: Record<string, string> = {
    '/': 'Dashboard',
    '/media/movies': 'Movies',
    '/media/tv-shows': 'TV Shows',
    '/media/music': 'Music',
    '/actors': 'Actors',
    '/artists': 'Artists',
    '/activity': 'Activity',
    '/activity/history': 'Activity History',
    '/activity/running-jobs': 'Running Jobs',
    '/activity/blocked-assets': 'Blocked Assets',
    '/settings/general': 'General',
    '/settings/providers': 'Providers',
    '/settings/libraries': 'Libraries',
    '/settings/media-players': 'Media Players',
    '/settings/notifications': 'Notifications',
    '/system/status': 'System Status',
    '/system/tasks': 'Tasks',
    '/system/backup': 'Backup',
    '/system/events': 'Events',
    '/system/logs': 'Log Files',
  };
  return pathMap[location.pathname] || 'Metarr';
}

// Loading fallback component
function RouteLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="text-neutral-400">Loading...</div>
    </div>
  );
}

function AppRoutes() {
  const title = usePageTitle();

  return (
    <Layout title={title}>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          {/* Dashboard */}
          <Route path="/" element={
            <RouteErrorBoundary routeName="Dashboard">
              <Dashboard />
            </RouteErrorBoundary>
          } />

        {/* Media routes */}
        <Route path="/media/movies" element={
          <RouteErrorBoundary routeName="Movies">
            <Movies />
          </RouteErrorBoundary>
        } />
        <Route path="/media/movies/:id/edit" element={
          <RouteErrorBoundary routeName="Movie Edit">
            <MovieEdit />
          </RouteErrorBoundary>
        } />
        <Route path="/media/tv-shows" element={
          <RouteErrorBoundary routeName="TV Shows">
            <Series />
          </RouteErrorBoundary>
        } />
        <Route path="/media/music" element={
          <RouteErrorBoundary routeName="Music">
            <Music />
          </RouteErrorBoundary>
        } />

        {/* Actor routes */}
        <Route path="/actors" element={
          <RouteErrorBoundary routeName="Actors">
            <Actors />
          </RouteErrorBoundary>
        } />

        {/* Artist routes */}
        <Route path="/artists" element={
          <RouteErrorBoundary routeName="Artists">
            <Artists />
          </RouteErrorBoundary>
        } />

        {/* Activity routes */}
        <Route path="/activity" element={<Navigate to="/activity/history" replace />} />
        <Route path="/activity/history" element={
          <RouteErrorBoundary routeName="Activity History">
            <History />
          </RouteErrorBoundary>
        } />
        <Route path="/activity/running-jobs" element={
          <RouteErrorBoundary routeName="Running Jobs">
            <RunningJobs />
          </RouteErrorBoundary>
        } />
        <Route path="/activity/blocked-assets" element={
          <RouteErrorBoundary routeName="Blocked Assets">
            <BlockedAssets />
          </RouteErrorBoundary>
        } />

        {/* Other routes */}
        <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
        <Route path="/system" element={<Navigate to="/system/status" replace />} />

        {/* System sub-routes */}
        <Route path="/system/status" element={
          <RouteErrorBoundary routeName="System Status">
            <Status />
          </RouteErrorBoundary>
        } />
        <Route path="/system/tasks" element={
          <RouteErrorBoundary routeName="Tasks">
            <Tasks />
          </RouteErrorBoundary>
        } />
        <Route path="/system/backup" element={
          <RouteErrorBoundary routeName="Backup">
            <Backup />
          </RouteErrorBoundary>
        } />
        <Route path="/system/events" element={
          <RouteErrorBoundary routeName="Events">
            <Events />
          </RouteErrorBoundary>
        } />
        <Route path="/system/logs" element={
          <RouteErrorBoundary routeName="Log Files">
            <LogFiles />
          </RouteErrorBoundary>
        } />

        {/* Settings sub-routes */}
        <Route path="/settings/general" element={
          <RouteErrorBoundary routeName="General">
            <Workflow />
          </RouteErrorBoundary>
        } />
        <Route path="/settings/providers" element={
          <RouteErrorBoundary routeName="Providers">
            <Providers />
          </RouteErrorBoundary>
        } />
        <Route path="/settings/libraries" element={
          <RouteErrorBoundary routeName="Libraries">
            <Libraries />
          </RouteErrorBoundary>
        } />
        <Route path="/settings/media-players" element={
          <RouteErrorBoundary routeName="Media Players">
            <MediaPlayers />
          </RouteErrorBoundary>
        } />
        <Route path="/settings/notifications" element={
          <RouteErrorBoundary routeName="Notifications">
            <Notifications />
          </RouteErrorBoundary>
        } />

        {/* Test routes */}
        <Route path="/test/save-bar-demo" element={<SaveBarDemo />} />

        {/* Fallback for unknown routes */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider>
        <AppRoutes />
        <Toaster position="bottom-right" expand={true} richColors />
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </WebSocketProvider>
    </QueryClientProvider>
  );
}

export default App;