'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Modal} from '@/components/ui/modal';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {NativeSelect} from '@/components/ui/native-select';
import {Button} from '@/components/ui/button';
import {getCurrentCrmUser} from '@/lib/auth/current-user';
import {hasAdministrativeAccess} from '@/lib/auth/routing';
import {
  createChatChannel,
  deleteChatMessage,
  getChatAttachment,
  listChatChannels,
  listChatMessages,
  sendChatMessage,
  uploadChatAttachment,
  type ChatChannel,
  type ChatMessage,
} from '@/lib/workspace/api';
import {
  directContacts,
  directConversation,
  getDirectAttachment,
  sendDirect,
  uploadDirectAttachment,
  type DirectContact,
  type DirectMessage,
} from '@/lib/workspace/ops-api';

type Selection={kind:'CHANNEL';id:string}|{kind:'DIRECT';id:string};
type Filter='UNREAD'|'DIRECT'|'TEAM'|'DEPARTMENT'|'CHANNEL';
type EmojiGroup=keyof typeof emojiGroups;
type ConversationItem={
  key:string;
  kind:'CHANNEL'|'DIRECT';
  id:string;
  title:string;
  subtitle:string;
  last:string;
  time:string;
  unread:number;
  type:'DIRECT'|'TEAM'|'DEPARTMENT'|'CHANNEL';
  sortAt:number;
};

const emojiGroups={
  Recent:['😀','😂','😍','🥰','😊','😭','😅','😎','🤔','😴','🥳','😬'],
  People:['👍','👎','👏','🙏','💪','🤝','👀','🙌','🤞','✌️','🫶','👋'],
  Hearts:['❤️','💜','💙','💚','🧡','💛','🤍','🖤','💯','✨','🔥','🎉'],
  Work:['✅','❌','⚠️','📌','📎','📅','📣','💡','🚀','📝','📊','🔒'],
};

const channelIcon:Record<ConversationItem['type'],string>={DIRECT:'💬',TEAM:'◎',DEPARTMENT:'◇',CHANNEL:'#'};
const clock=(value?:string|null)=>value?new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(value)):'';
const dateKey=(value:string)=>new Date(value).toDateString();
const dayLabel=(value:string)=>{
  const date=new Date(value),today=new Date(),yesterday=new Date();
  yesterday.setDate(today.getDate()-1);
  if(date.toDateString()===today.toDateString())return'Today';
  if(date.toDateString()===yesterday.toDateString())return'Yesterday';
  return new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric'}).format(date);
};
const channelGroup=(channelType?:string|null):Extract<Filter,'TEAM'|'DEPARTMENT'|'CHANNEL'>=>channelType==='TEAM'?'TEAM':channelType==='DEPARTMENT'?'DEPARTMENT':'CHANNEL';
const channelLabel=(channelType?:string|null)=>channelType==='TEAM'?'Team room':channelType==='DEPARTMENT'?'Department room':'Channel';

export function FloatingChat(){
  const[open,setOpen]=useState(false);
  const[admin,setAdmin]=useState(false);
  const[me,setMe]=useState<any>(null);
  const[channels,setChannels]=useState<ChatChannel[]>([]);
  const[contacts,setContacts]=useState<DirectContact[]>([]);
  const[selection,setSelection]=useState<Selection|null>(null);
  const[groupMessages,setGroupMessages]=useState<ChatMessage[]>([]);
  const[directMessages,setDirectMessages]=useState<DirectMessage[]>([]);
  const[filter,setFilter]=useState<Filter>('DIRECT');
  const[search,setSearch]=useState('');
  const[body,setBody]=useState('');
  const[reply,setReply]=useState<ChatMessage|null>(null);
  const[sending,setSending]=useState(false);
  const[emoji,setEmoji]=useState(false);
  const[emojiGroup,setEmojiGroup]=useState<EmojiGroup>('Recent');
  const[createOpen,setCreateOpen]=useState(false);
  const[error,setError]=useState<string|null>(null);
  const fileRef=useRef<HTMLInputElement>(null);
  const endRef=useRef<HTMLDivElement>(null);
  const composeRef=useRef<HTMLTextAreaElement>(null);

  const loadLists=useCallback(async()=>{
    const[chatsResult,contactsResult]=await Promise.allSettled([listChatChannels(),directContacts()]);
    if(chatsResult.status==='fulfilled')setChannels(chatsResult.value.filter(item=>item.channel_type!=='COMPANY'));
    if(contactsResult.status==='fulfilled')setContacts(contactsResult.value);
  },[]);

  useEffect(()=>{
    let alive=true;
    void getCurrentCrmUser().then(async user=>{
      if(!alive)return;
      setMe(user);
      setAdmin(hasAdministrativeAccess(user));
      try{await loadLists()}catch{}
    }).catch(()=>{});
    const onOpen=()=>setOpen(true);
    window.addEventListener('planorahub:open-messenger',onOpen);
    const timer=setInterval(()=>void loadLists(),8000);
    return()=>{alive=false;clearInterval(timer);window.removeEventListener('planorahub:open-messenger',onOpen)};
  },[loadLists]);

  useEffect(()=>{
    if(!open||!selection)return;
    let alive=true;
    const load=async()=>{
      try{
        if(selection.kind==='CHANNEL'){
          const rows=await listChatMessages(selection.id);
          if(alive){setGroupMessages(rows);setDirectMessages([])}
        }else{
          const result=await directConversation(selection.id);
          if(alive){setDirectMessages(result.messages);setGroupMessages([])}
        }
        await loadLists();
      }catch(caught){if(alive)setError(caught instanceof Error?caught.message:'Unable to load this conversation.')}
    };
    void load();
    const timer=setInterval(()=>void load(),3000);
    return()=>{alive=false;clearInterval(timer)};
  },[open,selection,loadLists]);

  useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth'})},[groupMessages,directMessages]);
  useEffect(()=>{
    if(!open)return;
    const previous=document.body.style.overflow;
    const onKey=(event:KeyboardEvent)=>{
      if(event.key!=='Escape')return;
      if(emoji){setEmoji(false);return}
      if(selection&&window.matchMedia('(max-width: 760px)').matches){setSelection(null);return}
      setOpen(false);
    };
    if(window.matchMedia('(max-width: 768px)').matches)document.body.style.overflow='hidden';
    document.addEventListener('keydown',onKey);
    return()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',onKey)};
  },[open,selection,emoji]);

  const channel=selection?.kind==='CHANNEL'?channels.find(item=>item.id===selection.id):undefined;
  const contact=selection?.kind==='DIRECT'?contacts.find(item=>item.id===selection.id):undefined;
  const unread=channels.reduce((sum,item)=>sum+Number(item.unread_count||0),0)+contacts.reduce((sum,item)=>sum+Number(item.unread_count||0),0);

  const conversations=useMemo(()=>{
    const q=search.trim().toLowerCase();
    const rows:ConversationItem[]=[];

    for(const item of contacts){
      const unreadCount=Number(item.unread_count||0);
      if(filter==='UNREAD'&&unreadCount<=0)continue;
      if(filter!=='UNREAD'&&filter!=='DIRECT')continue;
      rows.push({
        key:`D-${item.id}`,
        kind:'DIRECT',
        id:item.id,
        title:`${item.first_name} ${item.last_name}`.trim(),
        subtitle:item.job_title||'Staff member',
        last:item.last_message||'Start a conversation',
        time:clock(item.last_message_at),
        unread:unreadCount,
        type:'DIRECT',
        sortAt:item.last_message_at?new Date(item.last_message_at).getTime():0,
      });
    }

    for(const item of channels){
      const group=channelGroup(item.channel_type);
      const unreadCount=Number(item.unread_count||0);
      if(filter==='UNREAD'&&unreadCount<=0)continue;
      if(filter!=='UNREAD'&&filter!==group)continue;
      rows.push({
        key:`C-${item.id}`,
        kind:'CHANNEL',
        id:item.id,
        title:item.name.replace(/^Team · |^Department · /,''),
        subtitle:channelLabel(item.channel_type),
        last:item.last_message||item.description||'No messages yet',
        time:clock(item.last_message_at),
        unread:unreadCount,
        type:group,
        sortAt:item.last_message_at?new Date(item.last_message_at).getTime():0,
      });
    }

    return rows
      .filter(item=>!q||`${item.title} ${item.subtitle} ${item.last}`.toLowerCase().includes(q))
      .sort((a,b)=>(b.unread-a.unread)||(b.sortAt-a.sortAt)||a.title.localeCompare(b.title));
  },[channels,contacts,filter,search]);

  async function refreshConversation(){
    if(!selection)return;
    if(selection.kind==='CHANNEL')setGroupMessages(await listChatMessages(selection.id));
    else setDirectMessages((await directConversation(selection.id)).messages);
    await loadLists();
  }

  async function send(){
    if(!selection||!body.trim()||sending)return;
    const text=body.trim();
    setBody('');
    setSending(true);
    setError(null);
    try{
      if(selection.kind==='CHANNEL'){
        await sendChatMessage(selection.id,text,reply?.id);
        setReply(null);
      }else await sendDirect(selection.id,text);
      await refreshConversation();
    }catch(caught){
      setBody(text);
      setError(caught instanceof Error?caught.message:'Message could not be sent.');
    }finally{
      setSending(false);
      composeRef.current?.focus();
    }
  }

  async function upload(file?:File){
    if(!file||!selection)return;
    setSending(true);
    setError(null);
    try{
      if(selection.kind==='CHANNEL')await uploadChatAttachment(selection.id,file);
      else await uploadDirectAttachment(selection.id,file);
      await refreshConversation();
    }catch(caught){
      setError(caught instanceof Error?caught.message:'Attachment could not be sent.');
    }finally{
      setSending(false);
      if(fileRef.current)fileRef.current.value='';
    }
  }

  async function openAttachment(id:string,direct=false){
    try{
      const item=direct?await getDirectAttachment(id):await getChatAttachment(id);
      window.open(item.url,'_blank','noopener,noreferrer');
    }catch{
      setError('Attachment could not be opened.');
    }
  }

  function choose(next:Selection){
    setSelection(next);
    setReply(null);
    setEmoji(false);
    setError(null);
  }

  const directCount=contacts.length;

  return <>
    <button className="floating-chat-button ph-messenger-launcher" aria-label="Open PlanoraHub Messenger" onClick={()=>setOpen(v=>!v)}>
      <span className="ph-messenger-launcher-icon">💬</span>
      {unread?<b className="chat-unread-badge">{unread>99?'99+':unread}</b>:null}
    </button>

    {open?<section className="ph-messenger-panel" aria-label="PlanoraHub Messenger">
      <header className="ph-messenger-topbar">
        <div className="ph-messenger-title"><span className="ph-messenger-mark" aria-hidden="true">💬</span><div><strong>PlanoraHub Messenger</strong><small>{unread?`${unread} unread message${unread===1?'':'s'}`:`${directCount} staff available for direct chat`}</small></div></div>
        <div className="ph-messenger-top-actions">{admin?<button type="button" title="Create channel" onClick={()=>setCreateOpen(true)}>＋</button>:null}<button type="button" aria-label="Close Messenger" onClick={()=>setOpen(false)}>×</button></div>
      </header>

      <div className="ph-messenger-layout" data-has-selection={selection?'true':'false'}>
        <aside className="ph-messenger-rail">
          <div className="ph-messenger-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={filter==='DIRECT'?'Search staff':'Search conversations'}/></div>
          <div className="ph-messenger-filters">{(['UNREAD','DIRECT','TEAM','DEPARTMENT','CHANNEL'] as Filter[]).map(value=><button type="button" key={value} className={filter===value?'is-active':''} onClick={()=>setFilter(value)}>{value==='UNREAD'?'Unread':value==='DIRECT'?'Direct':value==='TEAM'?'Teams':value==='DEPARTMENT'?'Departments':'Channels'}</button>)}</div>
          <div className="ph-messenger-list">
            {conversations.map(item=><button type="button" key={item.key} className={selection?.kind===item.kind&&selection.id===item.id?'ph-messenger-row is-active':'ph-messenger-row'} onClick={()=>choose({kind:item.kind,id:item.id})}>
              <span className={`ph-messenger-avatar type-${item.type.toLowerCase()}`}>{item.kind==='DIRECT'?item.title.split(' ').slice(0,2).map(part=>part[0]).join(''):channelIcon[item.type]}</span>
              <span className="ph-messenger-row-copy"><span><strong>{item.title}</strong><time>{item.time}</time></span><small>{item.subtitle}</small><p>{item.last}</p></span>
              {item.unread?<b className="ph-messenger-unread">{item.unread}</b>:null}
            </button>)}
            {!conversations.length?<div className="ph-messenger-empty"><span>💬</span><strong>{filter==='UNREAD'?'No unread conversations':'No conversations here'}</strong><small>{filter==='DIRECT'?'Your staff directory will appear here for direct chat.':'Try another filter or search term.'}</small></div>:null}
          </div>
        </aside>

        <main className="ph-messenger-main">
          {selection?<>
            <header className="ph-messenger-conversation-head">
              <button className="ph-messenger-mobile-back" type="button" onClick={()=>setSelection(null)}>←</button>
              <span className="ph-messenger-head-avatar">{selection.kind==='DIRECT'?(contact?`${contact.first_name[0]}${contact.last_name[0]}`:'DM'):channelIcon[channelGroup(channel?.channel_type)]}</span>
              <div><strong>{selection.kind==='DIRECT'?`${contact?.first_name||''} ${contact?.last_name||''}`.trim():channel?.name.replace(/^Team · |^Department · /,'')}</strong><small>{selection.kind==='DIRECT'?(contact?.role_code==='SUPER_ADMIN'?'Super Admin':contact?.job_title||contact?.role_name||'Staff member'):(channel?`${channelLabel(channel.channel_type)} · ${channel.member_count||0} members`:'')}</small></div>
              <span className="ph-messenger-live">● Live</span>
            </header>

            <div className="ph-messenger-messages">
              {selection.kind==='CHANNEL'?groupMessages.map((message,index)=>{
                const mine=message.sender_user_id===me?.id;
                const showDay=index===0||dateKey(groupMessages[index-1].created_at)!==dateKey(message.created_at);
                return <div key={message.id}>{showDay?<div className="ph-messenger-day"><span>{dayLabel(message.created_at)}</span></div>:null}<article className={mine?'ph-messenger-message mine':'ph-messenger-message'}>
                  {!mine?<span className="ph-messenger-message-avatar">{`${message.first_name?.[0]||'?'}${message.last_name?.[0]||''}`}</span>:null}
                  <div className="ph-messenger-bubble-wrap"><div className="ph-messenger-meta"><strong>{mine?'You':`${message.first_name||''} ${message.last_name||''}`.trim()||'Former staff'}</strong><time>{clock(message.created_at)}{message.edited_at?' · edited':''}</time></div><div className={message.deleted_at?'ph-messenger-bubble is-deleted':'ph-messenger-bubble'}>
                    {message.reply_body&&!message.deleted_at?<div className="ph-messenger-quote"><strong>{`${message.reply_first_name||''} ${message.reply_last_name||''}`.trim()||'Message'}</strong><span>{message.reply_body}</span></div>:null}
                    <p>{message.deleted_at?'Message removed':message.body}</p>
                    {!message.deleted_at?message.attachments?.map(item=><button type="button" className="ph-messenger-attachment" key={item.id} onClick={()=>void openAttachment(item.id)}><span>📎</span><span><strong>{item.file_name}</strong><small>{Math.ceil(Number(item.file_size||0)/1024)} KB</small></span></button>):null}
                  </div>{!message.deleted_at?<div className="ph-messenger-message-actions"><button type="button" onClick={()=>setReply(message)}>Reply</button>{mine?<button type="button" onClick={async()=>{if(window.confirm('Remove this message?')){await deleteChatMessage(message.id);await refreshConversation()}}}>Remove</button>:null}</div>:null}</div>
                </article></div>
              }):directMessages.map((message,index)=>{
                const mine=message.sender_user_id!==selection.id;
                const showDay=index===0||dateKey(directMessages[index-1].created_at)!==dateKey(message.created_at);
                return <div key={message.id}>{showDay?<div className="ph-messenger-day"><span>{dayLabel(message.created_at)}</span></div>:null}<article className={mine?'ph-messenger-message mine':'ph-messenger-message'}>
                  {!mine?<span className="ph-messenger-message-avatar">{`${message.first_name?.[0]||'?'}${message.last_name?.[0]||''}`}</span>:null}
                  <div className="ph-messenger-bubble-wrap"><div className="ph-messenger-meta"><strong>{mine?'You':`${message.first_name||''} ${message.last_name||''}`.trim()}</strong><time>{clock(message.created_at)}</time></div><div className="ph-messenger-bubble"><p>{message.body}</p>{message.attachments?.map(item=><button type="button" className="ph-messenger-attachment" key={item.id} onClick={()=>void openAttachment(item.id,true)}><span>📎</span><span><strong>{item.file_name}</strong><small>{Math.ceil(item.file_size/1024)} KB</small></span></button>)}</div>{mine?<small className="ph-messenger-delivery">{message.read_at?'Read':message.delivered_at?'Delivered':'Sent'}</small>:null}</div>
                </article></div>
              })}
              <div ref={endRef}/>
            </div>

            {reply?<div className="ph-messenger-replying"><div><strong>Replying to {reply.sender_user_id===me?.id?'your message':`${reply.first_name||''} ${reply.last_name||''}`.trim()}</strong><span>{reply.body}</span></div><button type="button" onClick={()=>setReply(null)}>×</button></div>:null}
            {error?<div className="ph-messenger-error">{error}</div>:null}
            <div className="ph-messenger-compose"><input ref={fileRef} hidden type="file" onChange={e=>void upload(e.target.files?.[0])}/><button type="button" className="ph-messenger-tool" title="Attach file" onClick={()=>fileRef.current?.click()}>＋</button><button type="button" className="ph-messenger-tool" title="Emoji" onClick={()=>setEmoji(v=>!v)}>☺</button><textarea ref={composeRef} value={body} rows={1} onChange={e=>setBody(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}}} placeholder={selection.kind==='CHANNEL'?`Message ${channel?.name?.replace(/^Team · |^Department · /,'')||'channel'}…`:`Message ${contact?.first_name||''}…`}/><button type="button" className="ph-messenger-send" disabled={!body.trim()||sending} onClick={()=>void send()}>{sending?'…':'➤'}</button>{emoji?<div className="ph-messenger-emoji"><div>{(Object.keys(emojiGroups) as EmojiGroup[]).map(group=><button type="button" key={group} className={emojiGroup===group?'is-active':''} onClick={()=>setEmojiGroup(group)}>{group}</button>)}</div><section>{emojiGroups[emojiGroup].map(item=><button type="button" key={item} onClick={()=>{setBody(value=>value+item);composeRef.current?.focus()}}>{item}</button>)}</section></div>:null}</div>
          </>:<div className="ph-messenger-welcome"><span className="ph-messenger-welcome-icon">💬</span><h2>Messenger, where the work happens.</h2><p>Chat directly with staff or continue conversations inside team rooms, department rooms and internal channels.</p><div><span>Direct messages</span><span>Team rooms</span><span>Department rooms</span><span>Internal channels</span></div></div>}
        </main>
      </div>
    </section>:null}

    {createOpen?<ChannelModal onClose={()=>setCreateOpen(false)} onSaved={async()=>{setCreateOpen(false);await loadLists()}}/>:null}
  </>;
}

function ChannelModal({onClose,onSaved}:{onClose:()=>void;onSaved:()=>Promise<void>}){
  const[name,setName]=useState(''),[description,setDescription]=useState(''),[visibility,setVisibility]=useState('ALL_STAFF'),[saving,setSaving]=useState(false);
  return <Modal open onClose={onClose} title="New internal channel"><form className="premium-form" onSubmit={async event=>{event.preventDefault();setSaving(true);try{await createChatChannel({name,description,visibility});await onSaved()}finally{setSaving(false)}}}><div className="ui-help">Team and Department rooms are created automatically. Use an internal channel for cross-functional conversations.</div><Input label="Channel name *" value={name} onChange={event=>setName(event.target.value)} required/><Textarea label="Purpose" value={description} onChange={event=>setDescription(event.target.value)} rows={3}/><NativeSelect label="Audience" value={visibility} onChange={event=>setVisibility(event.target.value)}><option value="ALL_STAFF">All staff</option><option value="ADMIN_ONLY">Super Admin only</option></NativeSelect><div className="task-form-actions"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Create channel</Button></div></form></Modal>;
}
