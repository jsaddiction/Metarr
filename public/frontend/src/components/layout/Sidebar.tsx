import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSquareBinary,
  faFilm,
  faTv,
  faMusic,
  faUserGroup,
  faMicrophone,
  faClock,
  faGears,
  faLaptop,
  faHeartbeat,
  faClipboardList,
  faHdd,
  faCalendar,
  faFileText,
  faCog,
  faDatabase,
  faFolder,
  faPlay,
  faBell,
  faHistory,
  faSpinner,
  faBan,
  faSliders,
  faBook
} from '@fortawesome/free-solid-svg-icons';
interface SidebarProps {
  isCollapsed?: boolean;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface NavigationItem {
  icon: any;
  label: string;
  path?: string;
  exact?: boolean;
  children?: NavigationItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed = false, isMobileOpen = false, onCloseMobile }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [collapsingSections, setCollapsingSections] = useState<string[]>([]);

  const toggleSection = (sectionLabel: string, item: NavigationItem) => {
    if (isCollapsed) return;

    const isCurrentlyExpanded = expandedSections.includes(sectionLabel);
    const hasOtherExpanded = expandedSections.some(s => s !== sectionLabel);

    if (!isCurrentlyExpanded) {
      // Expanding a new section - collapse all others and expand this one
      const sectionsToCollapse = expandedSections.filter(s => s !== sectionLabel);

      if (sectionsToCollapse.length > 0) {
        // Mark the old sections as collapsing (keeps them in DOM but animates them out)
        setCollapsingSections(sectionsToCollapse);

        // Immediately add the new section to expanded (starts animating in)
        setExpandedSections([sectionLabel]);

        // After animation completes, remove from collapsing state
        setTimeout(() => {
          setCollapsingSections([]);
        }, 300);
      } else {
        // No sections to collapse, just expand
        setExpandedSections([sectionLabel]);
      }

      // Navigate to first child
      if (item.children && item.children.length > 0) {
        navigate(item.children[0].path!);
      }
    } else if (isCurrentlyExpanded && !hasOtherExpanded) {
      // Only collapse if this is the only expanded section (clicking to close it)
      setCollapsingSections([sectionLabel]);
      setExpandedSections([]);

      // Remove from collapsing after animation completes
      setTimeout(() => {
        setCollapsingSections([]);
      }, 300);
    }
  };

  // Check if a parent section is active based on current route
  const isSectionActive = (item: NavigationItem): boolean => {
    if (item.children) {
      return item.children.some(child =>
        child.path && location.pathname.startsWith(child.path)
      );
    }
    return false;
  };

  // Auto-expand sections based on current route (for initial page load and direct navigation)
  useEffect(() => {
    const currentPath = location.pathname;
    let targetSection: string | null = null;

    // Determine which section should be expanded
    if (currentPath.startsWith('/metadata/')) {
      targetSection = 'metadata';
    } else if (currentPath.startsWith('/activity/')) {
      targetSection = 'activity';
    } else if (currentPath.startsWith('/system/')) {
      targetSection = 'system';
    } else if (currentPath.startsWith('/settings/')) {
      targetSection = 'settings';
    }

    // Update expanded sections based on route
    // This handles initial page load and direct URL navigation
    setExpandedSections(prev => {
      if (targetSection) {
        // If already includes this section, don't change
        if (prev.includes(targetSection)) {
          return prev;
        }
        // Update to new section without animation (for direct navigation)
        return [targetSection];
      } else {
        // No target section - collapse all
        if (prev.length === 0) {
          return prev;
        }
        return [];
      }
    });
  }, [location.pathname]);

  const navigationItems: NavigationItem[] = [
    {
      icon: faSquareBinary,
      label: 'Metadata',
      children: [
        {
          icon: faFilm,
          label: 'Movies',
          path: '/metadata/movies',
        },
        {
          icon: faTv,
          label: 'Series',
          path: '/metadata/series',
        },
        {
          icon: faMusic,
          label: 'Music',
          path: '/metadata/music',
        },
        {
          icon: faUserGroup,
          label: 'Actors',
          path: '/metadata/actors',
        },
        {
          icon: faMicrophone,
          label: 'Artists',
          path: '/metadata/artists',
        },
      ],
    },
    {
      icon: faClock,
      label: 'Activity',
      children: [
        {
          icon: faHistory,
          label: 'History',
          path: '/activity/history',
        },
        {
          icon: faSpinner,
          label: 'Running Jobs',
          path: '/activity/running-jobs',
        },
        {
          icon: faBan,
          label: 'Blocked Assets',
          path: '/activity/blocked-assets',
        },
      ],
    },
    {
      icon: faGears,
      label: 'Settings',
      children: [
        {
          icon: faCog,
          label: 'General',
          path: '/settings/general',
        },
        {
          icon: faDatabase,
          label: 'Providers',
          path: '/settings/providers',
        },
        {
          icon: faSliders,
          label: 'Data Selection',
          path: '/settings/data-selection',
        },
        {
          icon: faFolder,
          label: 'Files',
          path: '/settings/files',
        },
        {
          icon: faBook,
          label: 'Libraries',
          path: '/settings/libraries',
        },
        {
          icon: faPlay,
          label: 'Media Players',
          path: '/settings/media-players',
        },
        {
          icon: faBell,
          label: 'Notifications',
          path: '/settings/notifications',
        },
      ],
    },
    {
      icon: faLaptop,
      label: 'System',
      children: [
        {
          icon: faHeartbeat,
          label: 'Status',
          path: '/system/status',
        },
        {
          icon: faClipboardList,
          label: 'Tasks',
          path: '/system/tasks',
        },
        {
          icon: faHdd,
          label: 'Backup',
          path: '/system/backup',
        },
        {
          icon: faCalendar,
          label: 'Events',
          path: '/system/events',
        },
        {
          icon: faFileText,
          label: 'Log Files',
          path: '/system/logs',
        },
      ],
    },
  ];

  return (
    <aside className={`fixed top-16 left-0 h-[calc(100vh-4rem)] bg-neutral-900 border-r border-t border-neutral-700 transition-all duration-300 z-40 ${
      isCollapsed ? 'w-16' : 'w-48'
    } ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>

      <nav className="flex-1 overflow-y-auto">
        <ul>
          {navigationItems.map((item) => (
            <li key={item.label}>
              {item.children ? (
                // Parent item with children
                <>
                  <button
                    className={`w-full flex items-center px-4 py-3 text-sm transition-all duration-500 ${
                      isSectionActive(item) ? 'border-l-4 border-primary-500 bg-neutral-800 text-white hover:text-neutral-100' : 'border-l-4 border-transparent text-neutral-300 hover:text-white'
                    }`}
                    onClick={() => toggleSection(item.label.toLowerCase(), item)}
                    title={isCollapsed ? item.label : undefined}
                    aria-label={`${item.label} navigation section`}
                    aria-expanded={expandedSections.includes(item.label.toLowerCase())}
                    aria-controls={`${item.label.toLowerCase()}-submenu`}
                  >
                    <span className={`${isCollapsed ? 'mx-auto' : 'mr-3'} w-4 h-4 flex items-center justify-center`}>
                      <FontAwesomeIcon icon={item.icon} />
                    </span>
                    {!isCollapsed && (
                      <span className="flex-1 text-left">{item.label}</span>
                    )}
                  </button>

                  <div
                    id={`${item.label.toLowerCase()}-submenu`}
                    className={`grid transition-all duration-300 ease-in-out ${
                      !isCollapsed && (expandedSections.includes(item.label.toLowerCase()) || collapsingSections.includes(item.label.toLowerCase()))
                        ? expandedSections.includes(item.label.toLowerCase())
                          ? 'grid-rows-[1fr] opacity-100'
                          : 'grid-rows-[0fr] opacity-0'
                        : 'grid-rows-[0fr] opacity-0'
                    }`}
                    role="region"
                    aria-label={`${item.label} submenu`}
                  >
                    <div className="overflow-hidden">
                      <ul className="bg-neutral-800">
                        {item.children.map((child, index) => (
                          <li
                            key={child.path}
                            className={`transform transition-all duration-300 ease-in-out ${
                              !isCollapsed && expandedSections.includes(item.label.toLowerCase())
                                ? 'translate-y-0 opacity-100'
                                : '-translate-y-2 opacity-0'
                            }`}
                            style={{
                              transitionDelay:
                                !isCollapsed && expandedSections.includes(item.label.toLowerCase())
                                  ? `${index * 40}ms`
                                  : '0ms'
                            }}
                          >
                            <NavLink
                              to={child.path!}
                              className={({ isActive }) => {
                                const baseClasses = 'flex items-center px-4 py-2 text-sm transition-all duration-500';
                                const borderClasses = isSectionActive(item) ? 'border-l-4 border-primary-500' : 'border-l-4 border-transparent';
                                const bgClasses = isActive ? 'bg-neutral-700' : '';
                                const textClasses = isActive ? 'text-white hover:text-neutral-100' : 'text-neutral-400 hover:text-white';

                                return `${baseClasses} ${borderClasses} ${bgClasses} ${textClasses}`;
                              }}
                            >
                              <span className="ml-6">{child.label}</span>
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              ) : (
                // Regular navigation item
                <NavLink
                  to={item.path!}
                  className={({ isActive }) =>
                    `flex items-center px-4 py-3 text-sm transition-all duration-500 ${
                      isActive ? 'border-l-4 border-primary-500 bg-neutral-800 text-white hover:text-neutral-100' : 'border-l-4 border-transparent text-neutral-300 hover:text-white'
                    }`
                  }
                  title={isCollapsed ? item.label : undefined}
                >
                  <span className={`${isCollapsed ? 'mx-auto' : 'mr-3'} w-4 h-4 flex items-center justify-center`}>
                    <FontAwesomeIcon icon={item.icon} />
                  </span>
                  {!isCollapsed && (
                    <span>{item.label}</span>
                  )}
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};