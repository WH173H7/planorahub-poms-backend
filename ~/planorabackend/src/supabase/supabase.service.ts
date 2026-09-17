import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

function cleanSecret(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

@Injectable()
export class SupabaseService {
  readonly admin: SupabaseClient;
  private readonly logger = new Logger(SupabaseService.name);

  constructor() {
    const url = cleanSecret(process.env.SUPABASE_URL);
    const serviceRoleKey = cleanSecret(
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
    );

    if (!url || !serviceRoleKey) {
      throw new Error(
        'Supabase configuration is incomplete. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).',
      );
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
        throw new Error('SUPABASE_URL must use HTTPS in production.');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'SUPABASE_URL must use HTTPS in production.') throw error;
      throw new Error('SUPABASE_URL is not a valid URL.');
    }

    if (serviceRoleKey.split('.').length === 3) {
      try {
        const payload = JSON.parse(
          Buffer.from(serviceRoleKey.split('.')[1], 'base64url').toString('utf8'),
        ) as { role?: string };
        if (payload.role && payload.role !== 'service_role') {
          this.logger.error(
            `SUPABASE_SERVICE_ROLE_KEY contains a "${payload.role}" JWT instead of a service_role key.`,
          );
        }
      } catch {
        // Opaque Supabase secret keys are valid too.
      }
    }

    this.admin = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
}
