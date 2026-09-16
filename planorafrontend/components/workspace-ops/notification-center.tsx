'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import {
  listNotifications,
  readAllNotices,
  readNotice,
  type Notice,
} from '@/lib/workspace/ops-api';

const noticeIcon=(kind:string)=>kind==='LETTER_APPROVAL'?'✉':kind.includes('TASK')?'✓':kind.includes('LEAD')||kind.includes('PROSPECT')||kind.includes('CLIENT')?'◎':kind==='BROADCAST'?'📣':kind==='CHAT'?'💬':kind.includes('MAIL')?'@':'•';

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Notice[]>([]);
  const [tab, setTab] = useState<'ALL' | 'UNREAD'>('ALL');
  const wrap = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      setRows(await listNotifications());
    } catch {
      // Notification polling should never interrupt the rest of the CRM shell.
    }
  }

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', keyboard);
    };
  }, [open]);

  const unread = rows.filter((item) => !item.read_at).length;
  const visible = tab === 'UNREAD' ? rows.filter((item) => !item.read_at) : rows;

  return (
    <div className="notify-wrap" ref={wrap}>
      <Button
        variant="ghost"
        iconOnly
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="notifications" />
      </Button>
      {unread ? <span className="notify-badge">{unread > 99 ? '99+' : unread}</span> : null}

      {open ? (
        <div className="notify-panel" role="dialog" aria-label="Notifications">
          <div className="notify-head">
            <div>
              <strong>Notifications</strong>
              <span>{unread} unread</span>
            </div>
            {unread ? (
              <button
                type="button"
                onClick={async () => {
                  await readAllNotices();
                  await load();
                }}
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="notify-tabs" role="tablist" aria-label="Notification filters">
            {(['ALL', 'UNREAD'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
              >
                {value === 'ALL' ? 'All' : `Unread (${unread})`}
              </button>
            ))}
          </div>

          <div className="notify-list">
            {visible.length ? (
              visible.map((notice) => (
                <Link
                  href={notice.href || '#'}
                  key={notice.id}
                  className={notice.read_at ? 'notify-item' : 'notify-item is-unread'}
                  onClick={async () => {
                    if (!notice.read_at) await readNotice(notice.id);
                    setOpen(false);
                  }}
                >
                  <span className="notify-kind-icon">{noticeIcon(notice.kind)}</span>
                  <span className="notify-item-copy"><strong>{notice.title}</strong>
                  {notice.body ? <span>{notice.body}</span> : null}
                  <small>{notice.kind.replaceAll('_',' ').toLowerCase()} · {new Intl.DateTimeFormat(undefined, {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    }).format(new Date(notice.created_at))}</small></span>
                </Link>
              ))
            ) : (
              <div className="notify-empty">You’re all caught up.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
