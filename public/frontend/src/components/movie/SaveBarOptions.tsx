import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faUndo, faExclamationTriangle, faEdit, faPencil } from '@fortawesome/free-solid-svg-icons';

export const SaveBarOptions: React.FC = () => {
  const [activeOption, setActiveOption] = useState<1 | 2 | 3>(1);
  const [showBar, setShowBar] = useState(true);

  const handleSave = () => console.log('Save clicked');
  const handleReset = () => console.log('Reset clicked');

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold">Save Bar Style Options</h2>
        <button
          onClick={() => setShowBar(!showBar)}
          className="btn btn-primary"
        >
          {showBar ? 'Hide' : 'Show'} Bar
        </button>
      </div>

      <div className="flex gap-4 mb-8">
        <button
          onClick={() => setActiveOption(1)}
          className={`btn ${activeOption === 1 ? 'btn-primary' : 'btn-secondary'}`}
        >
          Option 1: Purple Theme
        </button>
        <button
          onClick={() => setActiveOption(2)}
          className={`btn ${activeOption === 2 ? 'btn-primary' : 'btn-secondary'}`}
        >
          Option 2: Warning Theme
        </button>
        <button
          onClick={() => setActiveOption(3)}
          className={`btn ${activeOption === 3 ? 'btn-primary' : 'btn-secondary'}`}
        >
          Option 3: Subtle/Minimal
        </button>
      </div>

      {/* OPTION 1: Purple Theme (Matches Primary Color) */}
      {activeOption === 1 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Option 1: Purple Theme (Improved)</h3>
          <p className="text-sm text-neutral-400">Matches your app's primary color with clear change indicators.</p>
          <div
            className={`fixed bottom-0 left-0 right-0 bg-neutral-800 border-t-2 border-primary-500 px-6 py-3 flex items-center justify-between shadow-2xl z-30 transition-transform duration-300 ${
              showBar ? 'translate-y-0' : 'translate-y-full'
            }`}
          >
            <div className="flex items-center gap-4">
              <FontAwesomeIcon icon={faPencil} className="text-primary-500" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">Unsaved changes</span>
                <span className="text-xs text-neutral-400">You have modified this tab</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleReset} className="btn btn-ghost btn-sm">
                <FontAwesomeIcon icon={faUndo} className="mr-1.5" />
                Reset
              </button>
              <button onClick={handleSave} className="btn btn-primary btn-sm">
                <FontAwesomeIcon icon={faSave} className="mr-1.5" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OPTION 2: Warning Theme (Orange/Yellow - More Urgent) */}
      {activeOption === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Option 2: Warning Theme</h3>
          <p className="text-sm text-neutral-400">Orange/yellow border and icon. More urgent feeling.</p>
          <div
            className={`fixed bottom-0 left-0 right-0 bg-neutral-800 border-t-2 border-warning px-6 py-3 flex items-center justify-between shadow-2xl z-30 transition-transform duration-300 ${
              showBar ? 'translate-y-0' : 'translate-y-full'
            }`}
          >
            <div className="flex items-center gap-3">
              <FontAwesomeIcon icon={faExclamationTriangle} className="text-warning" />
              <span className="text-sm font-medium">You have unsaved changes</span>
            </div>
            <div className="flex gap-2">
              <button onClick={handleReset} className="btn btn-ghost btn-sm">
                <FontAwesomeIcon icon={faUndo} className="mr-1.5" />
                Reset
              </button>
              <button onClick={handleSave} className="btn btn-primary btn-sm">
                <FontAwesomeIcon icon={faSave} className="mr-1.5" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OPTION 3: Subtle/Minimal (Matches Cards Exactly) */}
      {activeOption === 3 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Option 3: Subtle/Minimal</h3>
          <p className="text-sm text-neutral-400">Matches card styling exactly. Most subtle approach.</p>
          <div
            className={`fixed bottom-0 left-0 right-0 bg-neutral-800 border-t border-neutral-700 px-6 py-3 flex items-center justify-between shadow-2xl z-30 transition-transform duration-300 ${
              showBar ? 'translate-y-0' : 'translate-y-full'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm text-neutral-400">Unsaved changes</span>
            </div>
            <div className="flex gap-2">
              <button onClick={handleReset} className="btn btn-ghost btn-sm">
                <FontAwesomeIcon icon={faUndo} className="mr-1.5" />
                Reset
              </button>
              <button onClick={handleSave} className="btn btn-primary btn-sm">
                <FontAwesomeIcon icon={faSave} className="mr-1.5" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-32 space-y-4">
        <h3 className="text-lg font-semibold">Comparison Details</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="card">
            <div className="card-body">
              <h4 className="font-medium mb-2">Option 1: Purple</h4>
              <ul className="text-sm text-neutral-400 space-y-1">
                <li>• 2px purple border</li>
                <li>• Pulsing dot animation</li>
                <li>• Cohesive with brand</li>
                <li>• Not urgent feeling</li>
              </ul>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <h4 className="font-medium mb-2">Option 2: Warning</h4>
              <ul className="text-sm text-neutral-400 space-y-1">
                <li>• 2px orange border</li>
                <li>• Warning icon</li>
                <li>• Urgent/cautionary</li>
                <li>• Attention-grabbing</li>
              </ul>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <h4 className="font-medium mb-2">Option 3: Minimal</h4>
              <ul className="text-sm text-neutral-400 space-y-1">
                <li>• 1px neutral border</li>
                <li>• No icon</li>
                <li>• Very subtle</li>
                <li>• Matches cards exactly</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
