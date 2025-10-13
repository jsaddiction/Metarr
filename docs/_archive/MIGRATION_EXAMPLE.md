# shadcn/ui Migration Example

## Overview

This document demonstrates migrating an existing feature from legacy components to shadcn/ui components. We'll use a **Provider Configuration Form** as our example - a realistic component that includes buttons, inputs, cards, and conditional UI.

## Before Migration (Legacy Components)

### Original Component Structure

```tsx
// components/provider/ProviderConfigForm.tsx (Legacy)
import React, { useState } from 'react';
import { TestButton } from '@/components/ui/TestButton';

interface ProviderConfigFormProps {
  provider: {
    name: string;
    apiKey?: string;
    enabled: boolean;
  };
  onSave: (config: any) => Promise<void>;
}

export function ProviderConfigForm({ provider, onSave }: ProviderConfigFormProps) {
  const [apiKey, setApiKey] = useState(provider.apiKey || '');
  const [enabled, setEnabled] = useState(provider.enabled);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ apiKey, enabled });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="card">
      {/* Card Header */}
      <div className="card-header">
        <h3 className="text-xl font-semibold">Configure {provider.name}</h3>
        <p className="text-sm text-neutral-400 mt-1">
          Configure API credentials and settings
        </p>
      </div>

      {/* Card Body */}
      <div className="card-body">
        {/* Warning Alert */}
        {!apiKey && (
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-4 mb-4">
            <div className="flex items-start">
              <span className="text-yellow-400 mr-3">⚠️</span>
              <div>
                <p className="text-yellow-400 font-medium">API Key Required</p>
                <p className="text-neutral-300 text-sm mt-1">
                  Please enter your API key to enable this provider
                </p>
              </div>
            </div>
          </div>
        )}

        {/* API Key Input */}
        <div className="form-group">
          <label className="form-label">API Key</label>
          <input
            type="password"
            className="form-input"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your API key"
          />
          <p className="text-xs text-neutral-400 mt-1">
            Get your API key from {provider.name} website
          </p>
        </div>

        {/* Enable Toggle */}
        <div className="form-group">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm">Enable this provider</span>
          </label>
        </div>
      </div>

      {/* Card Footer */}
      <div className="card-footer flex justify-between items-center">
        <TestButton
          onTest={async () => {
            // Test logic
            return { success: true, message: 'Connection successful' };
          }}
        />

        <div className="flex gap-2">
          <button
            className="btn btn-ghost"
            onClick={() => window.history.back()}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!apiKey || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Problems with Legacy Approach:**
1. ❌ String-based class names (`"card"`, `"btn-primary"`) - no type safety
2. ❌ Manual disabled state styling (`disabled={!apiKey}` but no visual feedback)
3. ❌ Inconsistent spacing and layout
4. ❌ Checkbox input has no proper styling - uses native HTML
5. ❌ Alert box uses custom classes - not reusable
6. ❌ No proper focus management
7. ❌ Accessibility issues (no proper ARIA labels on checkbox)

## After Migration (shadcn/ui Components)

### Migrated Component

```tsx
// components/provider/ProviderConfigForm.tsx (Migrated)
import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { TestButton } from '@/components/ui/TestButton';

interface ProviderConfigFormProps {
  provider: {
    name: string;
    apiKey?: string;
    enabled: boolean;
  };
  onSave: (config: any) => Promise<void>;
}

export function ProviderConfigForm({ provider, onSave }: ProviderConfigFormProps) {
  const [apiKey, setApiKey] = useState(provider.apiKey || '');
  const [enabled, setEnabled] = useState(provider.enabled);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ apiKey, enabled });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configure {provider.name}</CardTitle>
        <CardDescription>
          Configure API credentials and settings
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Warning Alert */}
        {!apiKey && (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>API Key Required</AlertTitle>
            <AlertDescription>
              Please enter your API key to enable this provider
            </AlertDescription>
          </Alert>
        )}

        {/* API Key Input */}
        <div className="space-y-2">
          <Label htmlFor="api-key">API Key</Label>
          <Input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your API key"
          />
          <p className="text-sm text-muted-foreground">
            Get your API key from {provider.name} website
          </p>
        </div>

        {/* Enable Toggle */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="enable-provider" className="text-base">
              Enable Provider
            </Label>
            <p className="text-sm text-muted-foreground">
              Activate this provider for metadata enrichment
            </p>
          </div>
          <Switch
            id="enable-provider"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>
      </CardContent>

      <CardFooter className="flex justify-between">
        <TestButton
          onTest={async () => {
            // Test logic
            return { success: true, message: 'Connection successful' };
          }}
        />

        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => window.history.back()}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!apiKey || isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
```

**Improvements with shadcn/ui:**
1. ✅ **Type-safe components** - `<Card>` component with proper TypeScript
2. ✅ **Semantic structure** - `CardHeader`, `CardContent`, `CardFooter` are explicit
3. ✅ **Built-in accessibility** - `Label` properly associates with `Input` via `htmlFor`
4. ✅ **Consistent spacing** - `space-y-4` utility for vertical rhythm
5. ✅ **Professional Switch** - Accessible toggle with proper ARIA
6. ✅ **Reusable Alert** - `variant="warning"` with icon support
7. ✅ **Automatic theming** - All components adapt to dark/light mode
8. ✅ **Better disabled states** - Button component handles this internally
9. ✅ **Icon integration** - lucide-react icons work seamlessly

## Component-by-Component Breakdown

### 1. Card Component Migration

**Before:**
```tsx
<div className="card">
  <div className="card-header">
    <h3 className="text-xl font-semibold">Title</h3>
    <p className="text-sm text-neutral-400 mt-1">Description</p>
  </div>
  <div className="card-body">
    {/* Content */}
  </div>
  <div className="card-footer">
    {/* Footer */}
  </div>
</div>
```

**After:**
```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
  <CardFooter>
    {/* Footer */}
  </CardFooter>
</Card>
```

**Benefits:**
- Semantic component names (self-documenting)
- Consistent internal spacing
- Proper heading hierarchy (`CardTitle` uses correct heading level)

### 2. Button Migration

**Before:**
```tsx
<button className="btn btn-primary" onClick={handleClick}>
  Save
</button>
<button className="btn btn-ghost">Cancel</button>
<button className="btn btn-error" disabled={isLoading}>
  Delete
</button>
```

**After:**
```tsx
<Button onClick={handleClick}>Save</Button>
<Button variant="ghost">Cancel</Button>
<Button variant="destructive" disabled={isLoading}>
  Delete
</Button>
```

**Benefits:**
- Type-safe variants (`variant="destructive"` autocompletes)
- Automatic disabled styling
- Consistent sizing and spacing
- Built-in focus management

### 3. Input + Label Migration

**Before:**
```tsx
<div className="form-group">
  <label className="form-label">Email</label>
  <input
    type="email"
    className="form-input"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
  />
</div>
```

**After:**
```tsx
<div className="space-y-2">
  <Label htmlFor="email">Email</Label>
  <Input
    id="email"
    type="email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
  />
</div>
```

**Benefits:**
- Proper `htmlFor` association (accessibility)
- Screen readers announce label when input is focused
- Consistent spacing with `space-y-2`
- Better focus ring styling

### 4. Checkbox → Switch Migration

**Before:**
```tsx
<label className="flex items-center cursor-pointer">
  <input
    type="checkbox"
    checked={enabled}
    onChange={(e) => setEnabled(e.target.checked)}
    className="mr-2"
  />
  <span className="text-sm">Enable feature</span>
</label>
```

**After:**
```tsx
<div className="flex items-center justify-between rounded-lg border p-4">
  <div className="space-y-0.5">
    <Label htmlFor="feature" className="text-base">Enable feature</Label>
    <p className="text-sm text-muted-foreground">
      Description of what this enables
    </p>
  </div>
  <Switch
    id="feature"
    checked={enabled}
    onCheckedChange={setEnabled}
  />
</div>
```

**Benefits:**
- Professional toggle UI (better than checkbox for enable/disable)
- Proper ARIA roles and keyboard navigation
- Supports helper text
- Visual feedback on state change

### 5. Alert/Warning Migration

**Before:**
```tsx
<div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-4">
  <div className="flex items-start">
    <span className="text-yellow-400 mr-3">⚠️</span>
    <div>
      <p className="text-yellow-400 font-medium">Warning Title</p>
      <p className="text-neutral-300 text-sm mt-1">Warning message</p>
    </div>
  </div>
</div>
```

**After:**
```tsx
<Alert variant="warning">
  <AlertTriangle className="h-4 w-4" />
  <AlertTitle>Warning Title</AlertTitle>
  <AlertDescription>Warning message</AlertDescription>
</Alert>
```

**Benefits:**
- Reusable variant system (`warning`, `destructive`, `default`)
- Proper icon sizing and alignment
- Semantic HTML (`role="alert"`)
- Consistent styling across app

## Dialog/Modal Migration Example

### Before (Legacy Modal)

```tsx
{isOpen && (
  <div className="modal-overlay" onClick={onClose}>
    <div className="modal-container" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <h3>Confirm Delete</h3>
        <button className="modal-close-btn" onClick={onClose}>×</button>
      </div>
      <div className="modal-body">
        <p>Are you sure you want to delete this item?</p>
      </div>
      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-error" onClick={onConfirm}>Delete</button>
      </div>
    </div>
  </div>
)}
```

### After (shadcn Dialog)

```tsx
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Confirm Delete</DialogTitle>
      <DialogDescription>
        Are you sure you want to delete this item? This action cannot be undone.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="ghost" onClick={() => setIsOpen(false)}>
        Cancel
      </Button>
      <Button variant="destructive" onClick={onConfirm}>
        Delete
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Benefits:**
- Automatic focus trap (can't tab outside dialog)
- Escape key handling (closes dialog)
- Proper ARIA attributes (`role="dialog"`, `aria-modal="true"`)
- Backdrop click handling
- Scroll lock on body when open
- Animation/transition support

## Select Dropdown Migration

### Before (Native Select)

```tsx
<div className="form-group">
  <label className="form-label">Quality Profile</label>
  <select
    className="form-input"
    value={profile}
    onChange={(e) => setProfile(e.target.value)}
  >
    <option value="">Select profile</option>
    <option value="1080p">1080p</option>
    <option value="4k">4K</option>
  </select>
</div>
```

### After (shadcn Select)

```tsx
<div className="space-y-2">
  <Label htmlFor="profile">Quality Profile</Label>
  <Select value={profile} onValueChange={setProfile}>
    <SelectTrigger id="profile">
      <SelectValue placeholder="Select profile" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="1080p">1080p</SelectItem>
      <SelectItem value="4k">4K</SelectItem>
    </SelectContent>
  </Select>
</div>
```

**Benefits:**
- Custom styled dropdown (not native browser UI)
- Keyboard navigation (Arrow keys, type to search)
- Proper focus management
- Consistent theming
- Better mobile experience

## Migration Checklist

When migrating a component to shadcn/ui, follow these steps:

### 1. Identify Legacy Components
- [ ] Find all instances of `className="card"`, `className="btn-*"`, etc.
- [ ] List all form elements (inputs, checkboxes, selects)
- [ ] Identify custom modals/dialogs

### 2. Install Required Components
```bash
npx shadcn@latest add button card input label
```

### 3. Update Imports
```tsx
// Remove:
// (no imports needed for legacy components)

// Add:
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
```

### 4. Replace Component Usage
- [ ] Replace `<div className="card">` → `<Card>`
- [ ] Replace `<button className="btn btn-*">` → `<Button variant="*">`
- [ ] Replace `<input className="form-input">` → `<Input>`
- [ ] Replace `<label className="form-label">` → `<Label htmlFor="...">`

### 5. Update Accessibility
- [ ] Add `id` to inputs
- [ ] Add `htmlFor` to labels
- [ ] Use semantic component structure
- [ ] Test keyboard navigation

### 6. Test Theme Compatibility
- [ ] Verify component works in dark mode
- [ ] Verify component works in light mode
- [ ] Check contrast ratios
- [ ] Test hover/focus states

### 7. Clean Up Legacy CSS (Optional)
- [ ] Remove unused `card`, `btn`, `form-*` classes from globals.css
- [ ] Keep only essential base styles
- [ ] Document removed classes in migration notes

## Common Patterns

### Form with Validation

```tsx
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  return (
    <form className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!error}
        />
      </div>

      <Button type="submit" className="w-full">
        Sign In
      </Button>
    </form>
  );
}
```

### Settings Panel with Switch

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

function SettingsPanel() {
  const [notifications, setNotifications] = useState(true);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Settings</CardTitle>
        <CardDescription>Manage how you receive notifications</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="notifications">Enable Notifications</Label>
          <Switch
            id="notifications"
            checked={notifications}
            onCheckedChange={setNotifications}
          />
        </div>
      </CardContent>
    </Card>
  );
}
```

## Next Steps

1. **Start Small**: Migrate one component at a time
2. **Test Thoroughly**: Verify functionality and accessibility
3. **Document Changes**: Update component documentation
4. **Share Learnings**: Document any issues or patterns discovered
5. **Iterate**: Apply learnings to next migration

## Resources

- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Radix UI Primitives](https://www.radix-ui.com)
- [Accessibility Testing Guide](./TESTING.md)
