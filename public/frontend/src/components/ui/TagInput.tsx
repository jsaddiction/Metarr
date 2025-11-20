import React, { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faLockOpen, faTimes, faPlus } from '@fortawesome/free-solid-svg-icons';
import Fuse from 'fuse.js';

interface TagInputProps {
  label: string;
  value: string[];
  onChange: (tags: string[]) => void;
  locked: boolean;
  onToggleLock: () => void;
  suggestions?: string[];
  placeholder?: string;
}

/**
 * Editable tag input with autocomplete and fuzzy search
 * Features:
 * - Badge display of selected tags
 * - Autocomplete dropdown with fuzzy search
 * - Keyboard navigation (↑↓ to navigate, Enter to select, Escape to close)
 * - Click X to remove tags
 * - Lock/unlock functionality
 */
export const TagInput: React.FC<TagInputProps> = ({
  label,
  value = [],
  onChange,
  locked,
  onToggleLock,
  suggestions = [],
  placeholder = 'Add...',
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize Fuse for fuzzy search
  const fuse = useRef(
    new Fuse(suggestions, {
      threshold: 0.3,
      keys: ['item'],
    })
  );

  // Update fuse when suggestions change
  useEffect(() => {
    fuse.current = new Fuse(
      suggestions.map((s) => ({ item: s })),
      { threshold: 0.3, keys: ['item'] }
    );
  }, [suggestions]);

  // Filter suggestions based on input
  useEffect(() => {
    if (!inputValue.trim()) {
      setFilteredSuggestions([]);
      setSelectedIndex(-1);
      return;
    }

    // Fuzzy search
    const results = fuse.current
      .search(inputValue)
      .map((result) => result.item.item)
      .filter((suggestion) => !value.includes(suggestion))
      .slice(0, 8); // Limit to 8 suggestions

    setFilteredSuggestions(results);
    setSelectedIndex(results.length > 0 ? 0 : -1);
  }, [inputValue, value]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsEditing(false);
        setInputValue('');
      }
    };

    if (isEditing) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isEditing]);

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !value.includes(trimmedTag)) {
      onChange([...value, trimmedTag]);
      setInputValue('');
      setIsEditing(false);
      setSelectedIndex(-1);
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      if (selectedIndex >= 0 && filteredSuggestions[selectedIndex]) {
        // Add selected suggestion
        addTag(filteredSuggestions[selectedIndex]);
      } else if (inputValue.trim()) {
        // Create new tag
        addTag(inputValue);
      }
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setInputValue('');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < filteredSuggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      // Remove last tag if input is empty
      removeTag(value[value.length - 1]);
    }
  };

  const handleAddClick = () => {
    if (!locked) {
      setIsEditing(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-neutral-400">
          {label}
        </label>
        <button
          type="button"
          onClick={onToggleLock}
          className={`
            inline-flex items-center justify-center rounded-md transition-colors
            h-6 w-6 text-xs
            ${locked ? 'text-amber-400 hover:bg-amber-400/10' : 'text-neutral-500 hover:bg-neutral-700'}
          `}
          title={locked ? 'Unlock field' : 'Lock field'}
        >
          <FontAwesomeIcon icon={locked ? faLock : faLockOpen} />
        </button>
      </div>

      <div
        className={`
          rounded-lg border bg-neutral-800/30 p-3
          transition-colors
          ${locked ? 'border-neutral-700 opacity-60' : 'border-neutral-700 hover:border-neutral-600'}
        `}
      >
        {/* Selected Tags */}
        <div className="flex flex-wrap gap-2 mb-2">
          {value.map((tag) => (
            <div
              key={tag}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border-2 border-purple-500/40 bg-purple-500/10 text-sm font-semibold text-purple-200 shadow-sm"
            >
              <span>{tag}</span>
              {!locked && (
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="hover:text-red-400 transition-colors"
                  title="Remove tag"
                >
                  <FontAwesomeIcon icon={faTimes} className="text-xs" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Input Field or Add Button */}
        {isEditing && !locked ? (
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-600 rounded-md text-sm text-neutral-300 placeholder-neutral-500 focus:outline-none focus:border-neutral-500"
            />

            {/* Suggestions Dropdown */}
            {filteredSuggestions.length > 0 && (
              <div
                ref={dropdownRef}
                className="absolute z-50 w-full mt-1 bg-neutral-800 border border-neutral-600 rounded-md shadow-lg max-h-48 overflow-y-auto"
              >
                {filteredSuggestions.map((suggestion, index) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => addTag(suggestion)}
                    className={`
                      w-full px-3 py-2 text-left text-sm transition-colors
                      ${index === selectedIndex ? 'bg-neutral-700 text-neutral-200' : 'text-neutral-400 hover:bg-neutral-700/50'}
                    `}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {/* Helper Text */}
            {inputValue && filteredSuggestions.length === 0 && (
              <div className="absolute z-50 w-full mt-1 bg-neutral-800 border border-neutral-600 rounded-md shadow-lg px-3 py-2">
                <span className="text-xs text-neutral-500">
                  Press Enter to create "{inputValue}"
                </span>
              </div>
            )}
          </div>
        ) : (
          !locked && (
            <button
              type="button"
              onClick={handleAddClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-dashed border-neutral-600/50 bg-neutral-700/20 text-sm text-neutral-400 hover:bg-neutral-700/40 hover:text-neutral-300 transition-colors"
            >
              <FontAwesomeIcon icon={faPlus} className="text-xs" />
              <span>{placeholder}</span>
            </button>
          )
        )}
      </div>
    </div>
  );
};
