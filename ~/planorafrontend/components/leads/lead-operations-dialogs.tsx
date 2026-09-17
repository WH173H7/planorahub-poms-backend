"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { listAssignmentStaff } from "@/lib/leads/api";
import type {
  AssignmentStaff,
  Contact,
  CreateActivityInput,
  LeadStage,
} from "@/lib/leads/types";
import { stageLabel } from "@/lib/leads/helpers";

const transitions: Record<LeadStage, LeadStage[]> = {
  NEW: ["ASSIGNED"],
  ASSIGNED: ["RESEARCHING", "DISQUALIFIED"],
  RESEARCHING: ["CONTACT_FOUND", "DISQUALIFIED"],
  CONTACT_FOUND: ["CONTACTED", "RESEARCHING", "DISQUALIFIED"],
  CONTACTED: ["AWAITING_REPLY", "FOLLOW_UP", "ENGAGED", "DISQUALIFIED"],
  AWAITING_REPLY: ["FOLLOW_UP", "ENGAGED", "CONTACTED", "DISQUALIFIED"],
  FOLLOW_UP: ["CONTACTED", "AWAITING_REPLY", "ENGAGED", "DISQUALIFIED"],
  ENGAGED: ["FOLLOW_UP", "READY_FOR_PROSPECT_REVIEW", "DISQUALIFIED"],
  READY_FOR_PROSPECT_REVIEW: ["ENGAGED", "FOLLOW_UP"],
  QUALIFIED: [],
  NURTURE: ["FOLLOW_UP", "DISQUALIFIED"],
  UNQUALIFIED: [],
  DISQUALIFIED: [],
};

function DialogFrame({
  title,
  description,
  saving,
  onClose,
  children,
}: {
  title: string;
  description: string;
  saving: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", key);
    queueMicrotask(() =>
      panel.current
        ?.querySelector<HTMLElement>("input,select,textarea,button")
        ?.focus(),
    );
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", key);
    };
  }, [onClose, saving]);
  return (
    <div
      className="lead-dialog-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        ref={panel}
        className="lead-dialog"
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button
            type="button"
            className="row-action"
            onClick={onClose}
            disabled={saving}
            aria-label="Close dialog"
          >
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function ReassignLeadDialog({
  currentOwnerId,
  currentOwner,
  onClose,
  onConfirm,
}: {
  currentOwnerId: string | null;
  currentOwner: string;
  onClose: () => void;
  onConfirm: (input: { assignedToId: string; reason: string }) => Promise<void>;
}) {
  const [staff, setStaff] = useState<AssignmentStaff[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void listAssignmentStaff()
      .then((rows) =>
        setStaff(
          rows.filter(
            (user) =>
              user.status === "ACTIVE" &&
              user.id !== currentOwnerId &&
              !["SUPER_ADMIN", "ADMIN"].includes(user.role_code),
          ),
        ),
      )
      .catch((caught) =>
        setError(
          caught instanceof Error ? caught.message : "Unable to load staff.",
        ),
      );
  }, [currentOwnerId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await onConfirm({
        assignedToId: String(data.get("assignedToId") ?? ""),
        reason: String(data.get("reason") ?? "").trim(),
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to reassign lead.",
      );
      setSaving(false);
    }
  }
  const assigning = !currentOwnerId;
  return (
    <DialogFrame
      title={assigning ? "Assign Lead" : "Reassign Lead"}
      description={assigning ? "Choose the staff member who should own and work this Lead." : `Current owner: ${currentOwner}`}
      saving={saving}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="lead-form-body">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <NativeSelect
            id="reassign-owner"
            name="assignedToId"
            label={assigning ? "Lead owner" : "New owner"}
            required
            defaultValue=""
          >
            <option value="" disabled>
              Select active staff
            </option>
            {staff.map((user) => (
              <option key={user.id} value={user.id}>
                {user.first_name} {user.last_name} ·{" "}
                {user.job_title || user.role_name}
              </option>
            ))}
          </NativeSelect>
          <Textarea
            id="reassign-reason"
            name="reason"
            label={assigning ? "Assignment note" : "Reason"}
            required
            rows={4}
          />
          <Alert tone="info">
            {assigning
              ? "The default Lead pursuit workflow will be created automatically for the selected staff member."
              : "Existing pursuit progress, evidence and Lead history will be preserved."}
          </Alert>
        </div>
        <footer>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {assigning ? "Assign Lead" : "Confirm Reassignment"}
          </Button>
        </footer>
      </form>
    </DialogFrame>
  );
}

export function ChangeStageDialog({
  stage,
  onClose,
  onConfirm,
}: {
  stage: LeadStage;
  onClose: () => void;
  onConfirm: (next: LeadStage, reason: string | null, expectedRevenue?: number | null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = transitions[stage];
  const [nextStage, setNextStage] = useState<LeadStage>(allowed[0] ?? stage);
  const prospectReview = nextStage === 'READY_FOR_PROSPECT_REVIEW';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const expectedRaw = String(data.get('expectedRevenue') ?? '').trim();
    const expectedRevenue: number | null = prospectReview && expectedRaw ? Number(expectedRaw) : null;

    if (prospectReview && (expectedRevenue === null || !Number.isFinite(expectedRevenue) || expectedRevenue <= 0)) {
      setError('Enter the expected revenue before submitting this Lead for Prospect Review.');
      setSaving(false);
      return;
    }

    try {
      await onConfirm(
        nextStage,
        String(data.get('reason') ?? '').trim() || null,
        expectedRevenue,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to change stage.');
      setSaving(false);
    }
  }

  return (
    <DialogFrame
      title={prospectReview ? 'Submit for Prospect Review' : 'Change Stage'}
      description={prospectReview
        ? 'This is the commercial handoff point. Add the expected value of the opportunity before Admin reviews it as a Prospect.'
        : `Current stage: ${stageLabel(stage)}`}
      saving={saving}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="lead-form-body">
          {error ? <Alert tone="error">{error}</Alert> : null}
          {allowed.length ? (
            <>
              <NativeSelect
                id="next-stage"
                name="stage"
                label="Move to"
                value={nextStage}
                onChange={(event) => setNextStage(event.target.value as LeadStage)}
                required
              >
                {allowed.map((next) => (
                  <option key={next} value={next}>{stageLabel(next)}</option>
                ))}
              </NativeSelect>

              {prospectReview ? (
                <div className="prospect-gate-field">
                  <Input
                    id="expected-revenue"
                    name="expectedRevenue"
                    label="Expected revenue (₦) *"
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="e.g. 2500000"
                    required
                    help="This value starts at Prospect Review. Lead intake and ordinary Lead work remain non-financial."
                  />
                  <div className="prospect-gate-note">
                    <strong>What happens next?</strong>
                    <span>Admin receives the Prospect recommendation in-app and by email. If approved, this expected value moves with the relationship into Prospects.</span>
                  </div>
                </div>
              ) : null}

              <Textarea
                id="stage-reason"
                name="reason"
                label={prospectReview ? 'Recommendation note (optional)' : 'Note / reason (optional)'}
                rows={3}
              />
            </>
          ) : (
            <Alert tone="info">No next stage is available from the current state.</Alert>
          )}
        </div>
        <footer>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          {allowed.length ? (
            <Button type="submit" loading={saving}>
              {prospectReview ? 'Submit for Review' : 'Change Stage'}
            </Button>
          ) : null}
        </footer>
      </form>
    </DialogFrame>
  );
}

export function LogActivityDialog({
  contacts,
  onClose,
  onConfirm,
}: {
  contacts: Contact[];
  onClose: () => void;
  onConfirm: (input: CreateActivityInput) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await onConfirm({
        title: String(data.get("title") ?? "").trim(),
        activityType: String(
          data.get("activityType"),
        ) as CreateActivityInput["activityType"],
        status: String(data.get("status")) as CreateActivityInput["status"],
        contactId: String(data.get("contactId") ?? "") || null,
        scheduledAt: String(data.get("scheduledAt") ?? "") || null,
        nextFollowUpAt: String(data.get("nextFollowUpAt") ?? "") || null,
        description: String(data.get("description") ?? "").trim() || null,
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to log activity.",
      );
      setSaving(false);
    }
  }
  return (
    <DialogFrame
      title="Log Activity"
      description="Record completed work or schedule an operational follow-up."
      saving={saving}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="lead-form-body">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Input
            id="activity-title"
            name="title"
            label="Title / summary"
            required
          />
          <div className="lead-form-grid">
            <NativeSelect id="activity-type" name="activityType" label="Type">
              {["CALL", "MEETING", "EMAIL", "FOLLOW_UP", "NOTE", "OTHER"].map(
                (type) => (
                  <option key={type}>{type.replace("_", " ")}</option>
                ),
              )}
            </NativeSelect>
            <NativeSelect id="activity-status" name="status" label="Status">
              <option>COMPLETED</option>
              <option>PLANNED</option>
              <option>IN_PROGRESS</option>
              <option>CANCELLED</option>
            </NativeSelect>
            <NativeSelect
              id="activity-contact"
              name="contactId"
              label="Contact (optional)"
            >
              <option value="">No contact</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.first_name} {contact.last_name}
                </option>
              ))}
            </NativeSelect>
            <Input
              id="activity-date"
              name="scheduledAt"
              label="Activity date/time"
              type="datetime-local"
            />
            <Input
              id="activity-follow-up"
              name="nextFollowUpAt"
              label="Next follow-up"
              type="datetime-local"
            />
          </div>
          <Textarea
            id="activity-notes"
            name="description"
            label="Notes"
            rows={4}
          />
        </div>
        <footer>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save Activity
          </Button>
        </footer>
      </form>
    </DialogFrame>
  );
}
