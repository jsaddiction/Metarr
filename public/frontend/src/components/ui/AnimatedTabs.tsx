import React, { useRef, useEffect, useState } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../../utils/cn';

export interface Tab {
  value: string;
  label: React.ReactNode;
  badge?: React.ReactNode;
}

interface AnimatedTabsProps {
  tabs: Tab[];
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export const AnimatedTabs: React.FC<AnimatedTabsProps> = ({
  tabs,
  value,
  onValueChange,
  children,
  className,
}) => {
  const [indicatorStyle, setIndicatorStyle] = useState({ width: 0, left: 0 });
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const activeIndex = tabs.findIndex((tab) => tab.value === value);
    const activeTab = tabsRef.current[activeIndex];

    if (activeTab) {
      setIndicatorStyle({
        width: activeTab.offsetWidth,
        left: activeTab.offsetLeft,
      });
    }
  }, [value, tabs]);

  return (
    <TabsPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      className={cn('w-full', className)}
    >
      <TabsPrimitive.List className="relative flex border-b border-neutral-700">
        {/* Animated indicator */}
        <div
          className="absolute bottom-0 h-0.5 bg-primary-500 transition-all duration-300 ease-out"
          style={{
            width: indicatorStyle.width,
            transform: `translateX(${indicatorStyle.left}px)`,
          }}
        />

        {tabs.map((tab, index) => {
          const isActive = tab.value === value;

          return (
            <TabsPrimitive.Trigger
              key={tab.value}
              value={tab.value}
              ref={(el) => (tabsRef.current[index] = el)}
              className={cn(
                'relative px-4 py-3 text-sm font-medium transition-colors duration-200',
                'hover:text-neutral-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900',
                'disabled:pointer-events-none disabled:opacity-50',
                isActive ? 'text-primary-400' : 'text-neutral-400'
              )}
            >
              <span className="flex items-center gap-2">
                {tab.label}
                {tab.badge}
              </span>
            </TabsPrimitive.Trigger>
          );
        })}
      </TabsPrimitive.List>

      {children}
    </TabsPrimitive.Root>
  );
};

export const AnimatedTabsContent: React.FC<
  TabsPrimitive.TabsContentProps
> = ({ className, ...props }) => {
  return (
    <TabsPrimitive.Content
      className={cn(
        'mt-6',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900',
        'data-[state=inactive]:animate-fadeOut data-[state=active]:animate-fadeIn',
        className
      )}
      {...props}
    />
  );
};
