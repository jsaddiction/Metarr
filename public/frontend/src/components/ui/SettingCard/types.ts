export interface SettingCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'subtle';
  children: React.ReactNode;
}
