import type { InputHTMLAttributes } from 'react';
export function Input({label,help,id,...props}:InputHTMLAttributes<HTMLInputElement>&{label?:string;help?:string}){return <label className="ui-field" htmlFor={id}>{label?<span className="ui-label">{label}</span>:null}<input id={id} className="ui-input" {...props}/>{help?<span className="ui-help">{help}</span>:null}</label>}
