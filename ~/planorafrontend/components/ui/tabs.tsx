'use client';

import type { ReactNode } from 'react';

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { value: string; label: string; content?: ReactNode }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="ui-tabs-wrap">
        <div className="ui-tabs" role="tablist">
          {items.map((item) => (
            <button
              key={item.value}
              className="ui-tab"
              role="tab"
              aria-selected={value === item.value}
              onClick={() => onChange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {items.find((item) => item.value === value)?.content}
    </div>
  );
}
