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
              Configure providers, file management, media players, notifications, and general application settings
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
                <li>• Application-wide configurations</li>
                <li>• Database and storage settings</li>
                <li>• Logging and monitoring preferences</li>
                <li>• Security and authentication</li>
                <li>• Performance optimization</li>
                <li>• User interface preferences</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Provider Settings</h3>
              <ul className="text-secondary">
                <li>• TMDB, TVDB, and IMDB configuration</li>
                <li>• MusicBrainz and music providers</li>
                <li>• Arr integration (Sonarr, Radarr, Lidarr)</li>
                <li>• API keys and authentication</li>
                <li>• Rate limiting and retry policies</li>
                <li>• Fallback provider priorities</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">File Management</h3>
              <ul className="text-secondary">
                <li>• Naming conventions and patterns</li>
                <li>• Directory structure preferences</li>
                <li>• NFO and metadata file settings</li>
                <li>• Watch folder monitoring</li>
                <li>• File organization rules</li>
                <li>• Duplicate handling policies</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Media Player Integration</h3>
              <ul className="text-secondary">
                <li>• Kodi JSON-RPC configuration</li>
                <li>• Jellyfin server integration</li>
                <li>• Plex Media Server settings</li>
                <li>• Emby and other players</li>
                <li>• Library update triggers</li>
                <li>• Metadata sync preferences</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Notification Settings</h3>
              <ul className="text-secondary">
                <li>• Email and SMTP configuration</li>
                <li>• Discord and Slack webhooks</li>
                <li>• Push notification services</li>
                <li>• Event triggers and filtering</li>
                <li>• Message templates and formatting</li>
                <li>• Delivery preferences and scheduling</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
  );
};