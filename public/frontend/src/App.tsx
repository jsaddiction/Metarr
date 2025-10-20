import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { Layout } from './components/layout/Layout';
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
import { SaveBarDemo } from './pages/test/SaveBarDemo';

// Configure QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity, // Data is fresh until explicitly invalidated
      refetchOnWindowFocus: false, // Don't refetch on window focus
      retry: 1, // Only retry once on failure
    },
  },
});

// Helper to get page title based on route
function usePageTitle() {
  const location = useLocation();

  // Handle dynamic routes
  if (location.pathname.match(/^\/metadata\/movies\/\d+\/edit$/)) {
    return 'Edit Movie';
  }

  const pathMap: Record<string, string> = {
    '/': 'Dashboard',
    '/metadata/movies': 'Movies',
    '/metadata/series': 'Series',
    '/metadata/music': 'Music',
    '/metadata/actors': 'Actors',
    '/metadata/artists': 'Artists',
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
        <Route path="/" element={<Dashboard />} />

        {/* Metadata routes */}
        <Route path="/metadata/movies" element={<Movies />} />
        <Route path="/metadata/movies/:id/edit" element={<MovieEdit />} />
        <Route path="/metadata/series" element={<Series />} />
        <Route path="/metadata/music" element={<Music />} />
        <Route path="/metadata/actors" element={<Actors />} />
        <Route path="/metadata/artists" element={<Artists />} />

        {/* Activity routes */}
        <Route path="/activity" element={<Navigate to="/activity/history" replace />} />
        <Route path="/activity/history" element={<History />} />
        <Route path="/activity/running-jobs" element={<RunningJobs />} />
        <Route path="/activity/blocked-assets" element={<BlockedAssets />} />

        {/* Other routes */}
        <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
        <Route path="/system" element={<System />} />

        {/* System sub-routes */}
        <Route path="/system/status" element={<Status />} />
        <Route path="/system/tasks" element={<Tasks />} />
        <Route path="/system/backup" element={<Backup />} />
        <Route path="/system/events" element={<Events />} />
        <Route path="/system/logs" element={<LogFiles />} />

        {/* Settings sub-routes */}
        <Route path="/settings/general" element={<General />} />
        <Route path="/settings/providers" element={<Providers />} />
        <Route path="/settings/data-selection" element={<DataSelection />} />
        <Route path="/settings/files" element={<Files />} />
        <Route path="/settings/libraries" element={<Libraries />} />
        <Route path="/settings/media-players" element={<MediaPlayers />} />
        <Route path="/settings/notifications" element={<Notifications />} />
        <Route path="/settings/asset-limits" element={<AssetLimits />} />

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
        <Toaster position="bottom-right" />
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </WebSocketProvider>
    </QueryClientProvider>
  );
}

export default App;