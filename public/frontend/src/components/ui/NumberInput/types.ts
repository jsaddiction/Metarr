export interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  id?: string;
  title?: string;
}

export interface NumberInputWithLockProps extends NumberInputProps {
  locked: boolean;
  onToggleLock: () => void;
}
