import React from 'react';

export const Notifications: React.FC = () => {
  return (
    <div className="content-spacing">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Email Notifications</h3>
              <ul className="text-secondary">
                <li>• SMTP server configuration</li>
                <li>• Email templates and formatting</li>
                <li>• Recipient management</li>
                <li>• Email frequency settings</li>
                <li>• HTML vs plain text preferences</li>
                <li>• Authentication and security</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Instant Messaging</h3>
              <ul className="text-secondary">
                <li>• Discord webhook integration</li>
                <li>• Slack channel notifications</li>
                <li>• Telegram bot configuration</li>
                <li>• Microsoft Teams webhooks</li>
                <li>• Custom webhook endpoints</li>
                <li>• Message formatting options</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Push Notifications</h3>
              <ul className="text-secondary">
                <li>• Pushover service integration</li>
                <li>• Pushbullet configuration</li>
                <li>• Gotify self-hosted notifications</li>
                <li>• Ntfy push service settings</li>
                <li>• Mobile app notifications</li>
                <li>• Priority and sound settings</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Event Configuration</h3>
              <ul className="text-secondary">
                <li>• Notification trigger events</li>
                <li>• Event filtering and conditions</li>
                <li>• Notification scheduling</li>
                <li>• Retry and failure handling</li>
                <li>• Rate limiting and throttling</li>
                <li>• Custom event definitions</li>
              </ul>
            </div>
          </div>
      </div>
    </div>
  );
};