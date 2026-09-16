'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { NativeSelect } from '@/components/ui/native-select';
import {
  deleteManagedDepartment,
  deleteManagedTeam,
  getManagedDepartmentOverview,
  getManagedTeamOverview,
  patchManagedDepartment,
  patchManagedTeam,
} from '@/lib/workspace/ops-api';

type DepartmentOption = { id: string; name: string; is_active?: boolean };
type TeamOption = { id: string; name: string; is_active?: boolean; department_name?: string | null };

type StructureTarget =
  | { kind: 'DEPARTMENT'; id: string; name: string; is_active: boolean }
  | { kind: 'TEAM'; id: string; name: string; is_active: boolean; manager_id?: string | null };

export function StructureOverviewModal({
  target,
  departments,
  teams,
  onClose,
  onChanged,
}: {
  target: StructureTarget;
  departments: DepartmentOption[];
  teams: TeamOption[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [replacementId, setReplacementId] = useState('');
  const [confirmText, setConfirmText] = useState('');

  async function loadOverview() {
    setLoading(true);
    setError(null);
    try {
      setOverview(
        target.kind === 'DEPARTMENT'
          ? await getManagedDepartmentOverview(target.id)
          : await getManagedTeamOverview(target.id),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load this workspace group.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, [target.id, target.kind]);

  const entity = target.kind === 'DEPARTMENT' ? overview?.department : overview?.team;
  const activity = Array.isArray(overview?.activity) ? overview.activity : [];
  const associations = overview?.associations || {};
  const people = target.kind === 'DEPARTMENT'
    ? (Array.isArray(overview?.staff) ? overview.staff : [])
    : (Array.isArray(overview?.members) ? overview.members : []);
  const nestedTeams = target.kind === 'DEPARTMENT' && Array.isArray(overview?.teams) ? overview.teams : [];

  const dependencyCount = useMemo(() => {
    if (!overview) return 0;
    if (target.kind === 'DEPARTMENT') {
      return Number(entity?.staff_count || 0)
        + Number(entity?.team_count || 0)
        + Number(associations.tasks || 0)
        + Number(associations.workflows || 0);
    }
    return Number(entity?.member_count || 0)
      + Number(associations.crm_records || 0)
      + Number(associations.tasks || 0)
      + Number(associations.workflows || 0)
      + Number(associations.mail_threads || 0);
  }, [associations, entity, overview, target.kind]);

  const replacements = target.kind === 'DEPARTMENT'
    ? departments.filter((row) => row.id !== target.id && row.is_active !== false)
    : teams.filter((row) => row.id !== target.id && row.is_active !== false);

  async function toggleStatus() {
    if (!entity) return;
    setBusy(true);
    setError(null);
    try {
      if (target.kind === 'DEPARTMENT') {
        await patchManagedDepartment(target.id, { isActive: !entity.is_active });
      } else {
        await patchManagedTeam(target.id, { isActive: !entity.is_active, managerId: entity.manager_id || null });
      }
      await onChanged();
      await loadOverview();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update status.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (confirmText !== 'DELETE') return;
    if (dependencyCount > 0 && !replacementId) {
      setError(`Choose a replacement ${target.kind === 'DEPARTMENT' ? 'department' : 'team'} before deleting this one.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (target.kind === 'DEPARTMENT') {
        await deleteManagedDepartment(target.id, replacementId || null);
      } else {
        await deleteManagedTeam(target.id, replacementId || null);
      }
      await onChanged();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete this workspace group.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${target.name} · ${target.kind === 'DEPARTMENT' ? 'Department' : 'Team'}`} className="structure-overview-dialog">
      {loading ? (
        <div className="structure-overview-loading">Loading workspace connections…</div>
      ) : error && !overview ? (
        <div className="structure-overview-error"><strong>Unable to load details.</strong><span>{error}</span></div>
      ) : (
        <div className="structure-overview">
          <section className="structure-overview-hero">
            <div>
              <span className="eyebrow">{target.kind === 'DEPARTMENT' ? 'Department workspace' : 'Team workspace'}</span>
              <h3>{entity?.name || target.name}</h3>
              <p>{entity?.description || 'No description has been added yet.'}</p>
            </div>
            <Badge tone={entity?.is_active ? 'success' : 'warning'}>{entity?.is_active ? 'Active' : 'Suspended'}</Badge>
          </section>

          <section className="structure-overview-stat-grid">
            {target.kind === 'DEPARTMENT' ? (
              <>
                <Stat label="Staff" value={entity?.staff_count || people.length} />
                <Stat label="Teams" value={entity?.team_count || nestedTeams.length} />
                <Stat label="Tasks" value={associations.tasks || 0} />
                <Stat label="Workflows" value={associations.workflows || 0} />
                <Stat label="CRM ownership" value={associations.owned_crm_records || 0} />
                <Stat label="Shared items" value={associations.shared_items || 0} />
              </>
            ) : (
              <>
                <Stat label="Members" value={entity?.member_count || people.length} />
                <Stat label="CRM records" value={associations.crm_records || 0} />
                <Stat label="Tasks" value={associations.tasks || 0} />
                <Stat label="Workflows" value={associations.workflows || 0} />
                <Stat label="Mail threads" value={associations.mail_threads || 0} />
                <Stat label="Shared items" value={associations.shared_items || 0} />
              </>
            )}
          </section>

          <div className="structure-overview-columns">
            <section className="structure-overview-panel">
              <div className="structure-overview-panel__head">
                <div><span className="eyebrow">People</span><h4>{target.kind === 'DEPARTMENT' ? 'Staff in this department' : 'Team members'}</h4></div>
                <span>{people.length}</span>
              </div>
              <div className="structure-overview-list">
                {people.slice(0, 8).map((person: any) => (
                  <div key={person.id}>
                    <span className="structure-overview-avatar">{initials(person.first_name, person.last_name)}</span>
                    <span><strong>{person.first_name} {person.last_name}</strong><small>{person.job_title || person.role_name || person.email || 'Staff member'}</small></span>
                    {person.status ? <Badge tone={person.status === 'ACTIVE' ? 'success' : 'neutral'}>{person.status}</Badge> : null}
                  </div>
                ))}
                {!people.length ? <p className="ui-help">No people are currently attached.</p> : null}
              </div>
            </section>

            <section className="structure-overview-panel">
              <div className="structure-overview-panel__head">
                <div><span className="eyebrow">Connections</span><h4>{target.kind === 'DEPARTMENT' ? 'Teams & access' : 'Team placement'}</h4></div>
              </div>
              {target.kind === 'DEPARTMENT' ? (
                <div className="structure-overview-list">
                  {nestedTeams.slice(0, 8).map((team: any) => (
                    <div key={team.id}>
                      <span className="structure-overview-icon">T</span>
                      <span><strong>{team.name}</strong><small>{team.member_count || 0} members · {team.manager_name || 'No team lead'}</small></span>
                      <Badge tone={team.is_active ? 'success' : 'neutral'}>{team.is_active ? 'Active' : 'Suspended'}</Badge>
                    </div>
                  ))}
                  {!nestedTeams.length ? <p className="ui-help">No teams are attached to this department.</p> : null}
                </div>
              ) : (
                <div className="structure-overview-facts">
                  <div><span>Department</span><strong>{entity?.department_name || 'Cross-department'}</strong></div>
                  <div><span>Team lead</span><strong>{[entity?.manager_first_name, entity?.manager_last_name].filter(Boolean).join(' ') || 'Not assigned'}</strong></div>
                  <div><span>Approval exemptions</span><strong>{associations.letter_exemptions || 0}</strong></div>
                </div>
              )}
            </section>
          </div>

          <section className="structure-overview-panel structure-overview-panel--activity">
            <div className="structure-overview-panel__head">
              <div><span className="eyebrow">Activity</span><h4>Recent workspace activity</h4></div>
              <span>{activity.length}</span>
            </div>
            <div className="structure-activity-list">
              {activity.slice(0, 10).map((item: any) => (
                <div key={item.id}>
                  <i aria-hidden="true" />
                  <span><strong>{humanAction(item.action)}</strong><small>{[item.first_name, item.last_name].filter(Boolean).join(' ') || 'System'} · {formatDate(item.created_at)}</small></span>
                </div>
              ))}
              {!activity.length ? <p className="ui-help">No recent logged activity for this group yet.</p> : null}
            </div>
          </section>

          {error ? <div className="structure-overview-inline-error">{error}</div> : null}

          <section className="structure-overview-admin">
            <div>
              <span className="eyebrow">Admin controls</span>
              <h4>Lifecycle & cleanup</h4>
              <p>Suspending keeps history intact. Permanent deletion can reassign connected work first.</p>
            </div>
            <div className="structure-overview-admin__actions">
              <Button variant="outline" loading={busy} onClick={() => void toggleStatus()}>
                {entity?.is_active ? 'Suspend' : 'Reactivate'}
              </Button>
              <Button variant="danger" onClick={() => setDeleting((value) => !value)}>
                {deleting ? 'Cancel delete' : `Delete ${target.kind === 'DEPARTMENT' ? 'department' : 'team'}`}
              </Button>
            </div>
          </section>

          {deleting ? (
            <section className="structure-delete-panel">
              <div>
                <strong>Permanent deletion</strong>
                <p>
                  {dependencyCount > 0
                    ? `This ${target.kind.toLowerCase()} has connected work. Choose where it should move before deletion.`
                    : `This ${target.kind.toLowerCase()} has no blocking work connections. You can delete it without reassignment.`}
                </p>
              </div>
              {dependencyCount > 0 ? (
                <NativeSelect label={`Replacement ${target.kind === 'DEPARTMENT' ? 'department' : 'team'} *`} value={replacementId} onChange={(event) => setReplacementId(event.target.value)}>
                  <option value="">Choose replacement…</option>
                  {replacements.map((row) => <option value={row.id} key={row.id}>{row.name}</option>)}
                </NativeSelect>
              ) : null}
              <Input label="Type DELETE to confirm" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoComplete="off" />
              <div className="structure-delete-panel__actions">
                <Button variant="outline" onClick={() => { setDeleting(false); setConfirmText(''); setReplacementId(''); }}>Keep it</Button>
                <Button variant="danger" loading={busy} disabled={confirmText !== 'DELETE' || (dependencyCount > 0 && !replacementId)} onClick={() => void remove()}>Permanently delete</Button>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function initials(first?: string, last?: string) {
  return `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase() || 'PH';
}

function humanAction(value?: string) {
  return (value || 'Activity').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value?: string) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
