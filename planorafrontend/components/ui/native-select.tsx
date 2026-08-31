import type { SelectHTMLAttributes } from 'react';
export function NativeSelect({label,id,children,...props}:SelectHTMLAttributes<HTMLSelectElement>&{label?:string}){return <label className="ui-field" htmlFor={id}>{label?<span className="ui-label">{label}</span>:null}<select id={id} className="ui-input" {...props}>{children}</select></label>}
