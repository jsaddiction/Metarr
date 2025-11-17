import React, { useState } from 'react';
import { ViewControls } from '../components/ui/ViewControls';

export const Settings: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const handleRefresh = () => {
    console.log('Refreshing settings...');
  };

  return (
      <div className="content-container">
        <div className="content-header">
          <div>
            <h2 className="content-title">Application Settings & Configuration</h2>
            <p className="content-subtitle">
              Configure workflow behavior, providers, libraries, media players, and notifications
            </p>
          </div>
        </div>

        <ViewControls
          searchPlaceholder="Search settings..."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          onRefresh={handleRefresh}
          showViewOptions={false}
          showSort={false}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">General Settings</h3>
              <ul className="text-secondary">
                <li>• Core application behavior</li>
                <li>• Metadata enrichment preferences</li>
                <li>• Publishing and asset deployment</li>
                <li>• Automatic vs manual workflow control</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Provider Settings</h3>
              <ul className="text-secondary">
                <li>• TMDB, TVDB, and Fanart.tv configuration</li>
                <li>• MusicBrainz and music providers</li>
                <li>• API keys and authentication</li>
                <li>• Rate limiting and retry policies</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Libraries</h3>
              <ul className="text-secondary">
                <li>• Media library path configuration</li>
                <li>• Library types (movies, TV shows, music)</li>
                <li>• Scanner settings and scheduling</li>
                <li>• Directory monitoring preferences</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Media Players</h3>
              <ul className="text-secondary">
                <li>• Kodi JSON-RPC configuration</li>
                <li>• Jellyfin server integration</li>
                <li>• Plex Media Server settings</li>
                <li>• Player groups and path mappings</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Notifications</h3>
              <ul className="text-secondary">
                <li>• Discord and Slack webhooks</li>
                <li>• Email and SMTP configuration</li>
                <li>• Push notification services</li>
                <li>• Event triggers and filtering</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
  );
};
