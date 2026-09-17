import type { TextareaHTMLAttributes } from 'react';
export function Textarea({label,id,...props}:TextareaHTMLAttributes<HTMLTextAreaElement>&{label?:string}){return <label className="ui-field" htmlFor={id}>{label?<span className="ui-label">{label}</span>:null}<textarea id={id} className="ui-input" {...props}/></label>}
