import { useState, useCallback, ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConfirmOptions {
  title?: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
}

interface ConfirmState extends ConfirmOptions {
  isOpen: boolean;
  resolver?: (value: boolean) => void;
}

/**
 * Accessible confirmation dialog hook
 *
 * ACCESSIBILITY IMPROVEMENTS:
 * - Replaces native confirm() with accessible AlertDialog
 * - Keyboard navigable (Tab, Enter, Escape)
 * - Screen reader friendly (ARIA labels, focus management)
 * - WCAG 2.1 Level A compliant
 *
 * USAGE:
 * ```tsx
 * const { confirm, ConfirmDialog } = useConfirm();
 *
 * const handleDelete = async () => {
 *   const confirmed = await confirm({
 *     title: 'Delete Item',
 *     description: 'Are you sure? This cannot be undone.',
 *     confirmText: 'Delete',
 *     variant: 'destructive'
 *   });
 *
 *   if (confirmed) {
 *     // proceed with deletion
 *   }
 * };
 *
 * return (
 *   <>
 *     <button onClick={handleDelete}>Delete</button>
 *     <ConfirmDialog />
 *   </>
 * );
 * ```
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({
    isOpen: false,
    title: 'Confirm',
    description: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    variant: 'default',
  });

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        title: options.title || 'Confirm',
        description: options.description,
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        variant: options.variant || 'default',
        resolver: resolve,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    state.resolver?.(true);
    setState((prev) => ({ ...prev, isOpen: false }));
  }, [state.resolver]);

  const handleCancel = useCallback(() => {
    state.resolver?.(false);
    setState((prev) => ({ ...prev, isOpen: false }));
  }, [state.resolver]);

  const ConfirmDialog = useCallback(
    () => (
      <AlertDialog open={state.isOpen} onOpenChange={(open) => !open && handleCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state.title}</AlertDialogTitle>
            <AlertDialogDescription>{state.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>{state.cancelText}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={
                state.variant === 'destructive'
                  ? 'bg-red-600 hover:bg-red-700 focus:ring-red-600'
                  : undefined
              }
            >
              {state.confirmText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
    [state, handleConfirm, handleCancel]
  );

  return { confirm, ConfirmDialog };
}
