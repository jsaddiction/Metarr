export interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  title?: string;
}

export interface DateInputWithLockProps extends DateInputProps {
  locked: boolean;
  onToggleLock: () => void;
}
