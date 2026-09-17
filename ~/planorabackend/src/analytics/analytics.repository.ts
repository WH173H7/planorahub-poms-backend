import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export type AnalyticsRange = {
  from: string;
  to: string;
};

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly db: DatabaseService) {}

  async overview(range: AnalyticsRange) {
    const params = [range.from, range.to];

    const [
      taskSummary,
      taskStatuses,
      leadSummary,
      leadStages,
      organizationTypes,
      activitySummary,
      activityTypes,
      staffPerformance,
      recentActivity,
    ] = await Promise.all([
      this.db.query(
        `
          SELECT
            COUNT(*)::int AS total_tasks,
            COUNT(*) FILTER (
              WHERE status NOT IN ('COMPLETED', 'CANCELLED')
            )::int AS active_tasks,
            COUNT(*) FILTER (
              WHERE status = 'COMPLETED'
            )::int AS completed_tasks,
            COUNT(*) FILTER (
              WHERE status NOT IN ('COMPLETED', 'CANCELLED')
                AND due_at IS NOT NULL
                AND due_at < NOW()
            )::int AS overdue_tasks,
            ROUND(
              (
                COUNT(*) FILTER (WHERE status = 'COMPLETED')::numeric
                / NULLIF(COUNT(*), 0)
              ) * 100,
              1
            ) AS completion_rate
          FROM tasks
          WHERE created_at >= $1::timestamptz
            AND created_at < $2::timestamptz
        `,
        params,
      ),
      this.db.query(
        `
          SELECT status, COUNT(*)::int AS count
          FROM tasks
          WHERE created_at >= $1::timestamptz
            AND created_at < $2::timestamptz
          GROUP BY status
          ORDER BY count DESC, status
        `,
        params,
      ),
      this.db.query(
        `
          SELECT
            COUNT(*)::int AS total_leads,
            COUNT(*) FILTER (
              WHERE stage::text NOT IN ('WON', 'LOST', 'UNQUALIFIED', 'CONVERTED')
            )::int AS active_leads,
            COUNT(*) FILTER (
              WHERE stage::text IN ('WON', 'CONVERTED')
            )::int AS converted_leads,
            COUNT(*) FILTER (
              WHERE stage::text = 'LOST'
            )::int AS lost_leads,
            COALESCE(SUM(estimated_value), 0)::numeric AS pipeline_value,
            COALESCE(
              SUM(estimated_value) FILTER (
                WHERE stage::text IN ('WON', 'CONVERTED')
              ),
              0
            )::numeric AS converted_value,
            ROUND(
              (
                COUNT(*) FILTER (
                  WHERE stage::text IN ('WON', 'CONVERTED')
                )::numeric
                / NULLIF(
                    COUNT(*) FILTER (
                      WHERE stage::text IN ('WON', 'CONVERTED', 'LOST')
                    ),
                    0
                  )
              ) * 100,
              1
            ) AS conversion_rate
          FROM leads
          WHERE created_at >= $1::timestamptz
            AND created_at < $2::timestamptz
        `,
        params,
      ),
      this.db.query(
        `
          SELECT
            stage::text AS stage,
            COUNT(*)::int AS count,
            COALESCE(SUM(estimated_value), 0)::numeric AS value
          FROM leads
          WHERE created_at >= $1::timestamptz
            AND created_at < $2::timestamptz
          GROUP BY stage
          ORDER BY count DESC, stage
        `,
        params,
      ),
      this.db.query(
        `
          SELECT
            organization_type AS type,
            COUNT(*)::int AS count
          FROM organizations
          WHERE created_at >= $1::timestamptz
            AND created_at < $2::timestamptz
          GROUP BY organization_type
          ORDER BY count DESC, organization_type
        `,
        params,
      ),
      this.db.query(
        `
          SELECT
            COUNT(*)::int AS total_activities,
            COUNT(*) FILTER (
              WHERE status = 'COMPLETED'
            )::int AS completed_activities,
            COUNT(*) FILTER (
              WHERE status NOT IN ('COMPLETED', 'CANCELLED')
                AND scheduled_at IS NOT NULL
                AND scheduled_at < NOW()
            )::int AS overdue_activities,
            COUNT(*) FILTER (
              WHERE status = 'PLANNED'
                AND scheduled_at IS NOT NULL
                AND scheduled_at >= NOW()
            )::int AS upcoming_activities,
            ROUND(
              (
                COUNT(*) FILTER (WHERE status = 'COMPLETED')::numeric
                / NULLIF(COUNT(*), 0)
              ) * 100,
              1
            ) AS completion_rate
          FROM activities
          WHERE created_at >= $1::timestamptz
            AND created_at < $2::timestamptz
        `,
        params,
      ),
      this.db.query(
        `
          SELECT
            activity_type AS type,
            COUNT(*)::int AS count
          FROM activities
          WHERE created_at >= $1::timestamptz
            AND created_at < $2::timestamptz
          GROUP BY activity_type
          ORDER BY count DESC, activity_type
        `,
        params,
      ),
      this.db.query(
        `
          SELECT
            u.id,
            u.first_name,
            u.last_name,
            COUNT(DISTINCT t.id)::int AS assigned_tasks,
            COUNT(DISTINCT t.id) FILTER (
              WHERE t.status = 'COMPLETED'
            )::int AS completed_tasks,
            COUNT(DISTINCT t.id) FILTER (
              WHERE t.status NOT IN ('COMPLETED', 'CANCELLED')
                AND t.due_at IS NOT NULL
                AND t.due_at < NOW()
            )::int AS overdue_tasks,
            COUNT(DISTINCT a.id)::int AS assigned_activities,
            COUNT(DISTINCT a.id) FILTER (
              WHERE a.status = 'COMPLETED'
            )::int AS completed_activities
          FROM users u
          LEFT JOIN tasks t
            ON t.assigned_to_id = u.id
           AND t.created_at >= $1::timestamptz
           AND t.created_at < $2::timestamptz
          LEFT JOIN activities a
            ON a.assigned_to_id = u.id
           AND a.created_at >= $1::timestamptz
           AND a.created_at < $2::timestamptz
          WHERE u.status = 'ACTIVE'
          GROUP BY u.id, u.first_name, u.last_name
          HAVING
            COUNT(DISTINCT t.id) > 0
            OR COUNT(DISTINCT a.id) > 0
          ORDER BY
            (
              COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'COMPLETED')
              + COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'COMPLETED')
            ) DESC,
            u.first_name,
            u.last_name
          LIMIT 10
        `,
        params,
      ),
      this.db.query(
        `
          SELECT
            a.id,
            a.title,
            a.activity_type,
            a.status,
            a.scheduled_at,
            a.created_at,
            o.name AS organization_name,
            u.first_name AS assignee_first_name,
            u.last_name AS assignee_last_name
          FROM activities a
          LEFT JOIN organizations o ON o.id = a.organization_id
          LEFT JOIN users u ON u.id = a.assigned_to_id
          WHERE a.created_at >= $1::timestamptz
            AND a.created_at < $2::timestamptz
          ORDER BY a.created_at DESC
          LIMIT 8
        `,
        params,
      ),
    ]);

    return {
      range,
      tasks: {
        summary: taskSummary.rows[0],
        statuses: taskStatuses.rows,
      },
      leads: {
        summary: leadSummary.rows[0],
        stages: leadStages.rows,
      },
      organizations: {
        types: organizationTypes.rows,
      },
      activities: {
        summary: activitySummary.rows[0],
        types: activityTypes.rows,
        recent: recentActivity.rows,
      },
      staff: {
        performance: staffPerformance.rows,
      },
    };
  }
}
