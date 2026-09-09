'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {directContacts,directConversation,getDirectAttachment,sendDirect,uploadDirectAttachment,type DirectContact,type DirectMessage} from '@/lib/workspace/ops-api';

const time=(x:string)=>new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(x));
const dayLabel=(x:string)=>{const d=new Date(x),today=new Date(),y=new Date();y.setDate(today.getDate()-1);if(d.toDateString()===today.toDateString())return'Today';if(d.toDateString()===y.toDateString())return'Yesterday';return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:d.getFullYear()===today.getFullYear()?undefined:'numeric'}).format(d)};
const emojiGroups={Recent:['😀','😂','😍','🥰','😊','😭','😅','😎','🤔','😴','🥳','😬'],People:['👍','👎','👏','🙏','💪','🤝','👀','🙌','🤞','✌️','🫶','👋'],Hearts:['❤️','💜','💙','💚','🧡','💛','🤍','🖤','💯','✨','🔥','🎉'],Work:['✅','❌','⚠️','📌','📎','📅','📣','💡','🚀','📝','📊','🔒']};
type EmojiGroup=keyof typeof emojiGroups;

export function FloatingChat(){
 const[open,setOpen]=useState(false),[contacts,setContacts]=useState<DirectContact[]>([]),[selected,setSelected]=useState<DirectContact|null>(null),[messages,setMessages]=useState<DirectMessage[]>([]),[body,setBody]=useState(''),[sending,setSending]=useState(false),[emoji,setEmoji]=useState(false),[emojiGroup,setEmojiGroup]=useState<EmojiGroup>('Recent'),[error,setError]=useState<string|null>(null);
 const fileRef=useRef<HTMLInputElement>(null),end=useRef<HTMLDivElement>(null),compose=useRef<HTMLTextAreaElement>(null);
 async function loadContacts(){try{setContacts(await directContacts())}catch{}}
 useEffect(()=>{void loadContacts();const t=setInterval(()=>void loadContacts(),8000);return()=>clearInterval(t)},[]);
 useEffect(()=>{if(!selected)return;let alive=true;const load=async()=>{try{const x=await directConversation(selected.id);if(alive)setMessages(x.messages);await loadContacts()}catch{}};void load();const t=setInterval(()=>void load(),2500);return()=>{alive=false;clearInterval(t)}},[selected]);
 useEffect(()=>{end.current?.scrollIntoView({behavior:'smooth'})},[messages]);
 const unread=contacts.reduce((n,c)=>n+(c.unread_count||0),0);
 const grouped=useMemo(()=>messages.map((m,i)=>({m,showDay:i===0||new Date(messages[i-1].created_at).toDateString()!==new Date(m.created_at).toDateString()})),[messages]);
 async function send(){if(!selected||!body.trim()||sending)return;const text=body;setBody('');setSending(true);setError(null);try{await sendDirect(selected.id,text);const x=await directConversation(selected.id);setMessages(x.messages);await loadContacts()}catch{setBody(text);setError('Message could not be sent. Try again.')}finally{setSending(false);compose.current?.focus()}}
 async function upload(file?:File){if(!file||!selected)return;setSending(true);setError(null);try{await uploadDirectAttachment(selected.id,file);const x=await directConversation(selected.id);setMessages(x.messages);await loadContacts()}catch{setError('Attachment could not be uploaded.')}finally{setSending(false);if(fileRef.current)fileRef.current.value=''}}
 async function openAttachment(id:string){try{const x=await getDirectAttachment(id);window.open(x.url,'_blank','noopener,noreferrer')}catch{setError('Attachment could not be opened.')}}
 return <>
  <button className="floating-chat-button" aria-label="Open staff chat" onClick={()=>setOpen(v=>!v)}><span className="chat-button-icon">💬</span><span>Chat</span>{unread?<b className="chat-unread-badge">{unread>99?'99+':unread}</b>:null}</button>
  {open?<section className="floating-chat-panel chat-pro">
   <header className="floating-chat-head chat-pro-head"><div className="chat-head-main">{selected?<button className="chat-back" onClick={()=>{setSelected(null);setMessages([]);setEmoji(false)}}>←</button>:null}<div>{selected?<><strong>{selected.first_name} {selected.last_name}</strong><span>{selected.job_title||'PlanoraHub staff'}</span></>:<><strong>Messages</strong><span>{unread?`${unread} unread`:'All caught up'}</span></>}</div></div><button className="chat-close" onClick={()=>setOpen(false)}>×</button></header>
   {selected?<>
    <div className="floating-chat-messages chat-pro-messages">{grouped.map(({m,showDay})=>{const mine=m.sender_user_id!==selected.id;return <div key={m.id}>{showDay?<div className="chat-day"><span>{dayLabel(m.created_at)}</span></div>:null}<div className={mine?'dm mine':'dm theirs'}><div className="dm-bubble"><p>{m.body}</p>{m.attachments?.map(a=><button className="dm-attachment" key={a.id} onClick={()=>void openAttachment(a.id)}><span className="dm-file-icon">{a.mime_type?.startsWith('image/')?'🖼️':'📄'}</span><span><strong>{a.file_name}</strong><small>{Math.ceil(a.file_size/1024)} KB · Tap to open</small></span></button>)}<div className="dm-meta"><span>{time(m.created_at)}</span>{mine?<span className={m.read_at?'dm-ticks read':'dm-ticks'} title={m.read_at?'Read':m.delivered_at?'Delivered':'Sent'}>{m.read_at?'✓✓':m.delivered_at?'✓✓':'✓'}</span>:null}</div></div></div></div>})}<div ref={end}/></div>
    {error?<div className="chat-error">{error}</div>:null}
    <div className="floating-chat-compose chat-pro-compose"><input ref={fileRef} type="file" hidden multiple={false} onChange={e=>void upload(e.target.files?.[0])}/><div className="chat-compose-actions"><button type="button" className="chat-tool" title="Attach file" onClick={()=>fileRef.current?.click()}>＋</button><button type="button" className="chat-tool" title="Emoji" onClick={()=>setEmoji(v=>!v)}>☺</button></div><textarea ref={compose} rows={1} value={body} onChange={e=>setBody(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}}} placeholder="Message…"/><button className="chat-send" disabled={sending||!body.trim()} onClick={()=>void send()}>{sending?'…':'➤'}</button>
     {emoji?<div className="emoji-picker"><div className="emoji-tabs">{(Object.keys(emojiGroups) as EmojiGroup[]).map(g=><button key={g} className={emojiGroup===g?'is-active':''} onClick={()=>setEmojiGroup(g)}>{g}</button>)}</div><div className="emoji-grid">{emojiGroups[emojiGroup].map(x=><button key={x} onClick={()=>{setBody(b=>b+x);compose.current?.focus()}}>{x}</button>)}</div></div>:null}
    </div>
   </>:<div className="floating-chat-contacts chat-pro-contacts">{contacts.map(c=><button key={c.id} onClick={()=>setSelected(c)}><span className="dm-avatar">{c.first_name[0]}{c.last_name[0]}</span><span className="chat-contact-copy"><strong>{c.first_name} {c.last_name}</strong><small>{c.last_message||c.job_title||'Staff member'}</small></span><span className="chat-contact-side">{c.last_message_at?<small>{time(c.last_message_at)}</small>:null}{c.unread_count?<b>{c.unread_count}</b>:null}</span></button>)}{!contacts.length?<div className="chat-empty"><span>💬</span><strong>No conversations yet</strong><small>Available staff will appear here.</small></div>:null}</div>}
  </section>:null}
 </>
}
