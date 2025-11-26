export interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  title?: string;
  locked?: boolean;
  onToggleLock?: () => void;
}
