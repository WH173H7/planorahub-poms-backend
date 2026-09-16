'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AppShell} from '@/components/shell/app-shell';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {NativeSelect} from '@/components/ui/native-select';
import {getCurrentCrmUser} from '@/lib/auth/current-user';
import {hasAdministrativeAccess} from '@/lib/auth/routing';
import {
  createChatChannel,deleteChatMessage,getChatAttachment,listChatChannels,listChatMessages,sendChatMessage,uploadChatAttachment,
  type ChatChannel,type ChatMessage,
} from '@/lib/workspace/api';
import {
  directContacts,directConversation,getDirectAttachment,sendDirect,uploadDirectAttachment,
  type DirectContact,type DirectMessage,
} from '@/lib/workspace/ops-api';

type Selection={kind:'CHANNEL';id:string}|{kind:'DIRECT';id:string};
type Filter='ALL'|'DIRECT'|'TEAM'|'DEPARTMENT'|'COMPANY';
const clock=(value?:string|null)=>value?new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(value)):'';
const day=(value:string)=>new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric'}).format(new Date(value));
const icons:Record<string,string>={COMPANY:'✦',TEAM:'◎',DEPARTMENT:'◇',CUSTOM:'#',ADMIN:'◆'};

export function ChatView(){
  const[admin,setAdmin]=useState(false),[me,setMe]=useState<any>(null);
  const[channels,setChannels]=useState<ChatChannel[]>([]),[contacts,setContacts]=useState<DirectContact[]>([]),[selection,setSelection]=useState<Selection|null>(null);
  const[groupMessages,setGroupMessages]=useState<ChatMessage[]>([]),[directMessages,setDirectMessages]=useState<DirectMessage[]>([]);
  const[filter,setFilter]=useState<Filter>('ALL'),[search,setSearch]=useState(''),[body,setBody]=useState(''),[reply,setReply]=useState<ChatMessage|null>(null),[sending,setSending]=useState(false),[createOpen,setCreateOpen]=useState(false),[error,setError]=useState<string|null>(null);
  const endRef=useRef<HTMLDivElement|null>(null),fileRef=useRef<HTMLInputElement|null>(null),composeRef=useRef<HTMLTextAreaElement|null>(null);

  const loadLists=useCallback(async()=>{
    const[chs,people]=await Promise.all([listChatChannels(),directContacts()]);
    setChannels(chs);setContacts(people);
    setSelection(current=>{if(current)return current;if(typeof window!=='undefined'&&window.innerWidth<=760)return null;return chs[0]?{kind:'CHANNEL',id:chs[0].id}:people[0]?{kind:'DIRECT',id:people[0].id}:null});
  },[]);

  useEffect(()=>{void Promise.resolve().then(async()=>{const user=await getCurrentCrmUser();setMe(user);setAdmin(hasAdministrativeAccess(user));await loadLists()})},[loadLists]);
  useEffect(()=>{const timer=setInterval(()=>void loadLists(),7000);return()=>clearInterval(timer)},[loadLists]);
  useEffect(()=>{
    if(!selection)return;
    let alive=true;
    const load=async()=>{try{if(selection.kind==='CHANNEL'){const rows=await listChatMessages(selection.id);if(alive){setGroupMessages(rows);setDirectMessages([])}}else{const data=await directConversation(selection.id);if(alive){setDirectMessages(data.messages);setGroupMessages([])}}await loadLists()}catch(e){if(alive)setError(e instanceof Error?e.message:'Unable to load conversation')}};
    void load();const timer=setInterval(()=>void load(),3000);return()=>{alive=false;clearInterval(timer)};
  },[selection,loadLists]);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth'})},[groupMessages,directMessages]);

  const channel=selection?.kind==='CHANNEL'?channels.find(item=>item.id===selection.id):undefined;
  const contact=selection?.kind==='DIRECT'?contacts.find(item=>item.id===selection.id):undefined;
  const items=useMemo(()=>{
    const q=search.trim().toLowerCase();
    const result:Array<{key:string;kind:'CHANNEL'|'DIRECT';id:string;title:string;subtitle:string;last:string;time:string;unread:number;type:string}>=[];
    if(filter==='ALL'||filter==='DIRECT')for(const c of contacts)result.push({key:`D-${c.id}`,kind:'DIRECT',id:c.id,title:`${c.first_name} ${c.last_name}`,subtitle:c.job_title||'Direct message',last:c.last_message||'Start a conversation',time:clock(c.last_message_at),unread:Number(c.unread_count||0),type:'DIRECT'});
    for(const c of channels){if(filter==='DIRECT')continue;if(filter!=='ALL'&&filter!==c.channel_type)continue;result.push({key:`C-${c.id}`,kind:'CHANNEL',id:c.id,title:c.name.replace(/^Team · |^Department · /,''),subtitle:c.channel_type==='TEAM'?'Team group':c.channel_type==='DEPARTMENT'?'Department group':c.channel_type==='COMPANY'?'Company-wide':c.channel_type==='ADMIN'?'Admin room':'Channel',last:c.last_message||c.description||'No messages yet',time:clock(c.last_message_at),unread:Number(c.unread_count||0),type:c.channel_type});}
    return result.filter(item=>!q||`${item.title} ${item.subtitle} ${item.last}`.toLowerCase().includes(q)).sort((a,b)=>(b.unread-a.unread)||a.title.localeCompare(b.title));
  },[channels,contacts,filter,search]);
  const unread=channels.reduce((sum,c)=>sum+Number(c.unread_count||0),0)+contacts.reduce((sum,c)=>sum+Number(c.unread_count||0),0);

  async function refreshConversation(){if(!selection)return;if(selection.kind==='CHANNEL')setGroupMessages(await listChatMessages(selection.id));else setDirectMessages((await directConversation(selection.id)).messages);await loadLists()}
  async function send(){if(!selection||!body.trim()||sending)return;const text=body.trim();setBody('');setSending(true);setError(null);try{if(selection.kind==='CHANNEL'){await sendChatMessage(selection.id,text,reply?.id);setReply(null)}else await sendDirect(selection.id,text);await refreshConversation()}catch(e){setBody(text);setError(e instanceof Error?e.message:'Message could not be sent')}finally{setSending(false);composeRef.current?.focus()}}
  async function upload(file?:File){if(!file||!selection)return;setSending(true);setError(null);try{if(selection.kind==='CHANNEL')await uploadChatAttachment(selection.id,file);else await uploadDirectAttachment(selection.id,file);await refreshConversation()}catch(e){setError(e instanceof Error?e.message:'Attachment could not be sent')}finally{setSending(false);if(fileRef.current)fileRef.current.value=''}}
  async function openAttachment(id:string,direct=false){try{const file=direct?await getDirectAttachment(id):await getChatAttachment(id);window.open(file.url,'_blank','noopener,noreferrer')}catch{setError('Attachment could not be opened')}}

  return <AppShell area={admin?'admin':'staff'} title="Messenger" breadcrumb="Communication" description="Direct messages, Team rooms and Department conversations in one PlanoraHub workspace." actions={admin?<Button onClick={()=>setCreateOpen(true)}>+ Channel</Button>:undefined}>
    <div className="messenger-shell">
      <aside className="messenger-rail">
        <div className="messenger-brand"><div><span className="eyebrow">Messenger</span><strong>Conversations</strong></div>{unread?<b>{unread>99?'99+':unread}</b>:null}</div>
        <Input placeholder="Search conversations…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <div className="messenger-filters">{(['ALL','DIRECT','TEAM','DEPARTMENT','COMPANY'] as Filter[]).map(value=><button key={value} className={filter===value?'is-active':''} onClick={()=>setFilter(value)}>{value==='ALL'?'All':value==='DIRECT'?'Direct':value==='TEAM'?'Teams':value==='DEPARTMENT'?'Departments':'Company'}</button>)}</div>
        <div className="messenger-conversations">{items.map(item=><button key={item.key} className={selection?.kind===item.kind&&selection.id===item.id?'messenger-conversation is-active':'messenger-conversation'} onClick={()=>{setSelection({kind:item.kind,id:item.id});setReply(null)}}><span className={`messenger-avatar type-${item.type.toLowerCase()}`}>{item.kind==='DIRECT'?item.title.split(' ').slice(0,2).map(x=>x[0]).join(''):icons[item.type]||'#'}</span><span className="messenger-conversation-copy"><span><strong>{item.title}</strong><time>{item.time}</time></span><small>{item.subtitle}</small><p>{item.last}</p></span>{item.unread?<b className="messenger-count">{item.unread}</b>:null}</button>)}{!items.length?<div className="messenger-empty"><strong>No conversations</strong><span>Try another filter or start a channel.</span></div>:null}</div>
      </aside>

      <section className="messenger-main">
        {selection?<>
          <header className="messenger-header"><button className="messenger-mobile-back" type="button" aria-label="Back to conversations" onClick={()=>{setSelection(null);setReply(null)}}>‹</button><div><span className="messenger-header-avatar">{selection.kind==='DIRECT'?(contact?`${contact.first_name[0]}${contact.last_name[0]}`:'DM'):icons[channel?.channel_type||'CUSTOM']}</span><div><h2>{selection.kind==='DIRECT'?`${contact?.first_name||''} ${contact?.last_name||''}`.trim():channel?.name.replace(/^Team · |^Department · /,'')}</h2><p>{selection.kind==='DIRECT'?(contact?.job_title||'Direct conversation'):(channel?`${channel.channel_type==='TEAM'?'Team':channel.channel_type==='DEPARTMENT'?'Department':channel.channel_type==='COMPANY'?'Company-wide':'Channel'} · ${channel.member_count||0} members`:'')}</p></div></div><span className="messenger-live-dot">● Live</span></header>
          <div className="messenger-messages">
            {selection.kind==='CHANNEL'?groupMessages.map((m,index)=>{
              const mine=m.sender_user_id===me?.id,showDay=index===0||day(groupMessages[index-1].created_at)!==day(m.created_at);return <div key={m.id}>{showDay?<div className="messenger-day"><span>{day(m.created_at)}</span></div>:null}<article className={mine?'messenger-message mine':'messenger-message'}><span className="messenger-message-avatar">{`${m.first_name?.[0]||'?'}${m.last_name?.[0]||''}`}</span><div className="messenger-bubble-wrap"><div className="messenger-meta"><strong>{mine?'You':`${m.first_name||''} ${m.last_name||''}`.trim()||'Former staff'}</strong><time>{clock(m.created_at)}{m.edited_at?' · edited':''}</time></div><div className={m.deleted_at?'messenger-bubble is-deleted':'messenger-bubble'}>{m.reply_body&&!m.deleted_at?<button className="messenger-reply-quote" onClick={()=>{}}><strong>{`${m.reply_first_name||''} ${m.reply_last_name||''}`.trim()||'Message'}</strong><span>{m.reply_body}</span></button>:null}<p>{m.deleted_at?'Message removed':m.body}</p>{!m.deleted_at?m.attachments?.map(a=><button className="messenger-attachment" key={a.id} onClick={()=>void openAttachment(a.id)}><span>📎</span><span><strong>{a.file_name}</strong><small>{Math.ceil(Number(a.file_size||0)/1024)} KB</small></span></button>):null}</div>{!m.deleted_at?<div className="messenger-message-actions"><button onClick={()=>setReply(m)}>Reply</button>{mine?<button onClick={async()=>{if(confirm('Remove this message?')){await deleteChatMessage(m.id);await refreshConversation()}}}>Remove</button>:null}</div>:null}</div></article></div>
            }):directMessages.map((m,index)=>{const mine=m.sender_user_id!==selection.id,showDay=index===0||day(directMessages[index-1].created_at)!==day(m.created_at);return <div key={m.id}>{showDay?<div className="messenger-day"><span>{day(m.created_at)}</span></div>:null}<article className={mine?'messenger-message mine':'messenger-message'}><span className="messenger-message-avatar">{mine?'ME':`${m.first_name?.[0]||'?'}${m.last_name?.[0]||''}`}</span><div className="messenger-bubble-wrap"><div className="messenger-meta"><strong>{mine?'You':`${m.first_name||''} ${m.last_name||''}`.trim()}</strong><time>{clock(m.created_at)}</time></div><div className="messenger-bubble"><p>{m.body}</p>{m.attachments?.map(a=><button className="messenger-attachment" key={a.id} onClick={()=>void openAttachment(a.id,true)}><span>📎</span><span><strong>{a.file_name}</strong><small>{Math.ceil(Number(a.file_size||0)/1024)} KB</small></span></button>)}</div>{mine?<small className="messenger-delivery">{m.read_at?'Read':m.delivered_at?'Delivered':'Sent'}</small>:null}</div></article></div>})}
            <div ref={endRef}/>
          </div>
          {reply?<div className="messenger-replying"><div><strong>Replying to {reply.sender_user_id===me?.id?'yourself':`${reply.first_name||''} ${reply.last_name||''}`.trim()}</strong><span>{reply.body}</span></div><button onClick={()=>setReply(null)}>×</button></div>:null}
          {error?<div className="messenger-error">{error}</div>:null}
          <div className="messenger-compose"><input ref={fileRef} hidden type="file" onChange={e=>void upload(e.target.files?.[0])}/><button className="messenger-tool" type="button" title="Attach file" onClick={()=>fileRef.current?.click()}>＋</button><textarea ref={composeRef} value={body} rows={1} onChange={e=>setBody(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}}} placeholder={selection.kind==='CHANNEL'?`Message ${channel?.name||'channel'}…`:`Message ${contact?.first_name||''}…`}/><button className="messenger-send" type="button" disabled={!body.trim()||sending} onClick={()=>void send()}>{sending?'…':'Send'}</button></div>
        </>:<div className="messenger-welcome"><span>💬</span><h2>PlanoraHub Messenger</h2><p>Select a Direct, Team, Department or Company conversation.</p></div>}
      </section>
    </div>
    {createOpen?<ChannelModal onClose={()=>setCreateOpen(false)} onSaved={async()=>{setCreateOpen(false);await loadLists()}}/>:null}
  </AppShell>
}

function ChannelModal({onClose,onSaved}:{onClose:()=>void;onSaved:()=>Promise<void>}){const[name,setName]=useState(''),[description,setDescription]=useState(''),[visibility,setVisibility]=useState('ALL_STAFF'),[saving,setSaving]=useState(false);return <Modal open onClose={onClose} title="New company channel"><form className="premium-form" onSubmit={async e=>{e.preventDefault();setSaving(true);try{await createChatChannel({name,description,visibility});await onSaved()}finally{setSaving(false)}}}><div className="ui-help">Team and Department rooms are created automatically. Use custom channels for cross-company topics or an Admin-only room.</div><Input label="Channel name *" value={name} onChange={e=>setName(e.target.value)} required/><Textarea label="Purpose" value={description} onChange={e=>setDescription(e.target.value)} rows={3}/><NativeSelect label="Audience" value={visibility} onChange={e=>setVisibility(e.target.value)}><option value="ALL_STAFF">All staff</option><option value="ADMIN_ONLY">Super Admin only</option></NativeSelect><div className="task-form-actions"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Create channel</Button></div></form></Modal>}
