import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from '@/components/ui/sonner';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { Layout } from './components/layout/Layout';
import { RouteErrorBoundary } from './components/error/RouteErrorBoundary';
import { Dashboard } from './pages/Dashboard';
import { Movies } from './pages/metadata/Movies';
import { MovieEdit } from './pages/metadata/MovieEdit';
import { Actors } from './pages/metadata/Actors';
import { Series } from './pages/Series';
import { Music } from './pages/Music';
import { Artists } from './pages/Artists';
import { History } from './pages/activity/History';
import { RunningJobs } from './pages/activity/RunningJobs';
import { BlockedAssets } from './pages/activity/BlockedAssets';
import { System } from './pages/System';
import { Status } from './pages/system/Status';
import { Tasks } from './pages/system/Tasks';
import { Backup } from './pages/system/Backup';
import { Events } from './pages/system/Events';
import { LogFiles } from './pages/system/LogFiles';
import { General } from './pages/settings/General';
import { Providers } from './pages/settings/Providers';
import { DataSelection } from './pages/settings/DataSelection';
import { Files } from './pages/settings/Files';
import { Libraries } from './pages/settings/Libraries';
import { MediaPlayers } from './pages/settings/MediaPlayers';
import { Notifications } from './pages/settings/Notifications';
import { AssetLimits } from './pages/settings/AssetLimits';
import { Workflow } from './pages/settings/Workflow';
import { SaveBarDemo } from './pages/test/SaveBarDemo';

// Configure QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity, // Data is fresh until explicitly invalidated
      refetchOnWindowFocus: false, // Don't refetch on window focus
      retry: 1, // Only retry once on failure
      useErrorBoundary: false, // Handle errors in components, not error boundary
    },
    mutations: {
      useErrorBoundary: false, // Handle mutation errors in components
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
    '/settings/general': 'General Settings',
    '/settings/providers': 'Providers',
    '/settings/data-selection': 'Data Selection',
    '/settings/files': 'Files',
    '/settings/libraries': 'Libraries',
    '/settings/media-players': 'Media Players',
    '/settings/notifications': 'Notifications',
    '/settings/asset-limits': 'Asset Limits',
    '/settings/workflow': 'Workflow Control',
    '/system/status': 'System Status',
    '/system/tasks': 'Tasks',
    '/system/backup': 'Backup',
    '/system/events': 'Events',
    '/system/logs': 'Log Files',
  };
  return pathMap[location.pathname] || 'Metarr';
}

function AppRoutes() {
  const title = usePageTitle();

  return (
    <Layout title={title}>
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
          <RouteErrorBoundary routeName="General Settings">
            <General />
          </RouteErrorBoundary>
        } />
        <Route path="/settings/providers" element={
          <RouteErrorBoundary routeName="Providers">
            <Providers />
          </RouteErrorBoundary>
        } />
        <Route path="/settings/data-selection" element={
          <RouteErrorBoundary routeName="Data Selection">
            <DataSelection />
          </RouteErrorBoundary>
        } />
        <Route path="/settings/files" element={
          <RouteErrorBoundary routeName="Files">
            <Files />
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
        <Route path="/settings/asset-limits" element={
          <RouteErrorBoundary routeName="Asset Limits">
            <AssetLimits />
          </RouteErrorBoundary>
        } />
        <Route path="/settings/workflow" element={
          <RouteErrorBoundary routeName="Workflow">
            <Workflow />
          </RouteErrorBoundary>
        } />

        {/* Test routes */}
        <Route path="/test/save-bar-demo" element={<SaveBarDemo />} />

        {/* Fallback for unknown routes */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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