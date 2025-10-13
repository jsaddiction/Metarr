import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ErrorBanner } from '../ui/ErrorBanner';
import { useBackendConnection } from '../../hooks/useBackendConnection';

interface LayoutProps {
  children: React.ReactNode;
  title: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, title }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { error, dismissError } = useBackendConnection();

  const handleToggleSidebar = () => {
    if (window.innerWidth <= 768) {
      setMobileSidebarOpen(!mobileSidebarOpen);
    } else {
      setSidebarCollapsed(!sidebarCollapsed);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900">
      <Header
        title={title}
        onToggleSidebar={handleToggleSidebar}
      />

      <Sidebar
        isCollapsed={sidebarCollapsed}
        isMobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <main className={`pt-16 p-6 min-h-screen transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-48'} md:ml-48`}>
        {children}
      </main>

      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Backend connection error banner */}
      <ErrorBanner
        error={error}
        type="connection"
        onDismiss={dismissError}
      />
    </div>
  );
};