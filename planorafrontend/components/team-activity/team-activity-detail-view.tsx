'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageErrorState, PageLoadingState } from '@/components/ui/page-state';
import {
  getTeamActivity,
  updateTeamActivityReview,
  type TeamActivityItem,
} from '@/lib/team-activity/api';
import {
  teamActivityActor,
  teamActivityDateTime,
  teamActivityDetail,
  teamActivityLabels,
} from './team-activity-view';

function relatedLinks(item: TeamActivityItem) {
  return [
    item.lead_id ? { label: item.lead_title || 'Open Lead', href: `/leads/${item.lead_id}`, kind: 'Lead' } : null,
    item.task_id ? { label: item.task_title || 'Open Task', href: `/tasks/${item.task_id}`, kind: 'Task' } : null,
  ].filter(Boolean) as Array<{ label: string; href: string; kind: string }>;
}

function friendlyValue(value: Record<string, unknown> | null) {
  if (!value || !Object.keys(value).length) return 'No additional event data was recorded.';
  return JSON.stringify(value, null, 2);
}

export function TeamActivityDetailView({ activityId }: { activityId: string }) {
  const [item, setItem] = useState<TeamActivityItem | null>(null);
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const value = await getTeamActivity(activityId);
      setItem(value);
      setResponse(value.review_note ?? '');
      return value;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load activity details.');
      return null;
    }
  }, [activityId]);

  useEffect(() => {
    let cancelled = false;

    getTeamActivity(activityId)
      .then((value) => {
        if (cancelled) return;
        setItem(value);
        setResponse(value.review_note ?? '');
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : 'Unable to load activity details.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activityId]);

  if (loading && !item) return <PageLoadingState />;
  if (error && !item) return <PageErrorState message={error} />;
  if (!item) return <PageErrorState message="Activity not found." />;

  const links = relatedLinks(item);

  async function saveReview(input: { reviewed?: boolean; response?: string | null }, success: string) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await updateTeamActivityReview(activityId, input);
      setMessage(success);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update activity review.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Link href="/team-activity" style={{ color: '#6F2C7F', textDecoration: 'none', fontWeight: 700 }}>← Team Activity</Link>
        <span style={{ fontSize: 12, color: '#7a707d' }}>{teamActivityDateTime(item.created_at)}</span>
      </div>

      <Card style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 820 }}>
            <span className="eyebrow">Activity detail</span>
            <h2 style={{ margin: '6px 0 8px' }}>{teamActivityLabels[item.action] ?? item.action}</h2>
            <p style={{ margin: 0, color: '#514a54', fontSize: 16 }}>{teamActivityDetail(item)}</p>
          </div>
          <span style={{ borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 700, background: item.reviewed ? '#edf6ef' : '#f1e7f4', color: item.reviewed ? '#2f6b3e' : '#6F2C7F' }}>
            {item.reviewed ? 'Reviewed' : 'Needs review'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginTop: 22 }}>
          {[
            ['Staff', teamActivityActor(item)],
            ['Type', teamActivityLabels[item.action] ?? item.action],
            ['Lead', item.lead_title || '—'],
            ['Organization', item.organization_name || '—'],
          ].map(([label, value]) => (
            <div key={label} style={{ padding: 14, border: '1px solid #eee8f0', borderRadius: 14, background: '#fcfbfc' }}>
              <span style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#827986' }}>{label}</span>
              <strong style={{ display: 'block', marginTop: 6, color: '#28102F' }}>{value}</strong>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(300px,.8fr)', gap: 18, alignItems: 'start' }}>
        <Card style={{ padding: 22 }}>
          <span className="eyebrow">Admin review</span>
          <h3 style={{ margin: '6px 0' }}>Review and respond</h3>
          <p style={{ margin: '0 0 16px', color: '#6f6872' }}>Leave an internal response about this completed activity. Saving a response marks the activity as reviewed.</p>

          <label style={{ display: 'grid', gap: 7 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Response</span>
            <textarea
              value={response}
              onChange={(event) => setResponse(event.target.value)}
              rows={6}
              placeholder="Add feedback, follow-up direction, acknowledgement or a review note…"
              style={{ width: '100%', resize: 'vertical', border: '1px solid #ded5e1', borderRadius: 12, padding: 12, font: 'inherit', background: '#fff', color: '#1D1920' }}
            />
          </label>

          {message ? <p style={{ margin: '12px 0 0', color: '#2f6b3e', fontWeight: 600 }}>{message}</p> : null}
          {error ? <p style={{ margin: '12px 0 0', color: '#a12d3b', fontWeight: 600 }}>{error}</p> : null}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            <Button loading={saving} onClick={() => void saveReview({ response }, 'Response saved and activity marked reviewed.')}>Save response</Button>
            <Button variant="outline" loading={saving} onClick={() => void saveReview({ reviewed: !item.reviewed }, item.reviewed ? 'Activity marked unreviewed.' : 'Activity marked reviewed.')}>
              {item.reviewed ? 'Mark unreviewed' : 'Mark reviewed'}
            </Button>
          </div>
        </Card>

        <div style={{ display: 'grid', gap: 18 }}>
          <Card style={{ padding: 22 }}>
            <span className="eyebrow">Related work</span>
            <h3 style={{ margin: '6px 0 14px' }}>Open related records</h3>
            {links.length ? <div style={{ display: 'grid', gap: 10 }}>
              {links.map((link) => <Link key={link.href} href={link.href} style={{ display: 'grid', gap: 3, padding: 12, border: '1px solid #e8e0ea', borderRadius: 12, textDecoration: 'none', color: '#28102F' }}>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#817584', fontWeight: 700 }}>{link.kind}</span>
                <strong>{link.label}</strong>
              </Link>)}
            </div> : <p className="muted">No directly related Lead or Task was resolved for this event.</p>}
          </Card>

          <Card style={{ padding: 22 }}>
            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#4A1857' }}>Event data</summary>
              <p style={{ color: '#746d76', fontSize: 12 }}>Audit snapshot captured when the activity occurred.</p>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.6, background: '#faf8fb', border: '1px solid #eee8f0', borderRadius: 12, padding: 12, maxHeight: 320, overflow: 'auto' }}>{friendlyValue(item.new_values)}</pre>
            </details>
          </Card>
        </div>
      </div>
    </div>
  );
}
