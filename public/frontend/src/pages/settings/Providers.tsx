import React from 'react';

export const Providers: React.FC = () => {
  return (
    <div className="content-spacing">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Movie & TV Providers</h3>
              <ul className="text-secondary">
                <li>• TMDB API key and configuration</li>
                <li>• IMDB data scraping settings</li>
                <li>• TVDB API credentials</li>
                <li>• Rate limiting and retry policies</li>
                <li>• Image quality preferences</li>
                <li>• Language and region settings</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Music Providers</h3>
              <ul className="text-secondary">
                <li>• MusicBrainz API configuration</li>
                <li>• Last.fm API credentials</li>
                <li>• Spotify integration settings</li>
                <li>• Album artwork preferences</li>
                <li>• Artist image quality settings</li>
                <li>• Music metadata priorities</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Arr Integration</h3>
              <ul className="text-secondary">
                <li>• Sonarr API keys and endpoints</li>
                <li>• Radarr integration settings</li>
                <li>• Lidarr music webhook config</li>
                <li>• Prowlarr indexer settings</li>
                <li>• Event filtering and routing</li>
                <li>• Webhook authentication tokens</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Additional Sources</h3>
              <ul className="text-secondary">
                <li>• FanArt.tv API configuration</li>
                <li>• TheTVDB subscription settings</li>
                <li>• Trakt.tv integration</li>
                <li>• OpenSubtitles API keys</li>
                <li>• Custom provider endpoints</li>
                <li>• Fallback provider priorities</li>
              </ul>
            </div>
          </div>
      </div>
    </div>
  );
};