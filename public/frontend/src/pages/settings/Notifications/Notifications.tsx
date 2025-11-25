import React from 'react';
import { PageContainer } from '@/components/ui/PageContainer/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Notifications: React.FC = () => {
  return (
    <PageContainer title="Notifications">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Email Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-secondary space-y-2">
              <li>• SMTP server configuration</li>
              <li>• Email templates and formatting</li>
              <li>• Recipient management</li>
              <li>• Email frequency settings</li>
              <li>• HTML vs plain text preferences</li>
              <li>• Authentication and security</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Instant Messaging</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-secondary space-y-2">
              <li>• Discord webhook integration</li>
              <li>• Slack channel notifications</li>
              <li>• Telegram bot configuration</li>
              <li>• Microsoft Teams webhooks</li>
              <li>• Custom webhook endpoints</li>
              <li>• Message formatting options</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Push Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-secondary space-y-2">
              <li>• Pushover service integration</li>
              <li>• Pushbullet configuration</li>
              <li>• Gotify self-hosted notifications</li>
              <li>• Ntfy push service settings</li>
              <li>• Mobile app notifications</li>
              <li>• Priority and sound settings</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Event Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-secondary space-y-2">
              <li>• Notification trigger events</li>
              <li>• Event filtering and conditions</li>
              <li>• Notification scheduling</li>
              <li>• Retry and failure handling</li>
              <li>• Rate limiting and throttling</li>
              <li>• Custom event definitions</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
};
