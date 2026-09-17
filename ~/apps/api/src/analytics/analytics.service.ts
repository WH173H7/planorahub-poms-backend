import { BadRequestException, Injectable } from '@nestjs/common';
import { AnalyticsRepository } from './analytics.repository.js';

@Injectable()
export class AnalyticsService {
  constructor(private readonly analytics: AnalyticsRepository) {}

  async overview(from?: string, to?: string) {
    const now = new Date();

    const defaultTo = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );

    const defaultFrom = new Date(defaultTo);
    defaultFrom.setDate(defaultFrom.getDate() - 30);

    const fromDate = from ? new Date(from) : defaultFrom;
    const toDate = to ? new Date(to) : defaultTo;

    if (
      Number.isNaN(fromDate.getTime()) ||
      Number.isNaN(toDate.getTime())
    ) {
      throw new BadRequestException('Invalid analytics date range');
    }

    if (fromDate >= toDate) {
      throw new BadRequestException(
        'Analytics start date must be before the end date',
      );
    }

    return this.analytics.overview({
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    });
  }
}
