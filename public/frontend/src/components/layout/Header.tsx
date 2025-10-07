import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars, faHeart, faGlobe, faUser, faSun, faMoon } from '@fortawesome/free-solid-svg-icons';
import { useTheme } from '../../contexts/ThemeContext';

interface HeaderProps {
  title: string;
  onToggleSidebar?: () => void;
  children?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, onToggleSidebar, children }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="fixed top-0 right-0 left-0 z-40 h-16 bg-neutral-800 flex items-center justify-between px-6">
      <div className="flex items-center">
        <button
          className="btn btn-ghost p-2 mr-4 md:hidden"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <FontAwesomeIcon icon={faBars} />
        </button>
        <div className="flex items-center">
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center text-white font-bold text-lg">
            M
          </div>
          <span className="ml-3 text-xl font-bold text-white">METARR</span>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <button
          className="btn btn-ghost p-2"
          title="Health"
        >
          <FontAwesomeIcon icon={faHeart} />
        </button>
        <button
          className="btn btn-ghost p-2"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} />
        </button>
        <button
          className="btn btn-ghost p-2"
          title="Translate"
        >
          <FontAwesomeIcon icon={faGlobe} />
        </button>
        <button
          className="btn btn-ghost p-2"
          title="Profile"
        >
          <FontAwesomeIcon icon={faUser} />
        </button>
      </div>
    </header>
  );
};