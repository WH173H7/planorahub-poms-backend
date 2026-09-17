import type { SelectHTMLAttributes } from 'react';

export function NativeSelect({
  label,
  id,
  children,
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
}) {
  return (
    <label className="ui-field" htmlFor={id}>
      {label ? <span className="ui-label">{label}</span> : null}

      <span className="ui-select-wrap">
        <select
          id={id}
          className={`ui-input ui-select ${className}`.trim()}
          {...props}
        >
          {children}
        </select>

        <span className="ui-select-chevron" aria-hidden="true">
          ↓
        </span>
      </span>
    </label>
  );
}
