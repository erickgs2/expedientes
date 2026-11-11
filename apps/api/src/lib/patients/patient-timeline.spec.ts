import type { TimelineEvent } from '@expedientes/shared-types';
import { orderTimeline, pickThumbnails } from './patient-timeline';

const NOW = new Date('2026-11-11T12:00:00');

function appt(id: string, date: string): TimelineEvent {
  return { kind: 'appointment', id, date, status: 'SCHEDULED', treatmentTypeNames: [], notes: null };
}
function created(id: string, date: string): TimelineEvent {
  return { kind: 'created', id, date };
}

describe('orderTimeline', () => {
  it('puts upcoming appointments first, soonest first, then the past newest first', () => {
    const ordered = orderTimeline(
      [
        created('old', '2025-03-12T10:00:00'),
        appt('later', '2026-12-01T10:00:00'),
        created('recent', '2026-08-14T10:00:00'),
        appt('soon', '2026-11-11T09:00:00'),
      ],
      NOW
    );
    expect(ordered.map((e) => e.id)).toEqual(['soon', 'later', 'recent', 'old']);
  });

  it('treats an appointment earlier today as upcoming, and yesterday as past', () => {
    const ordered = orderTimeline(
      [appt('yesterday', '2026-11-10T18:00:00'), appt('this-morning', '2026-11-11T08:00:00')],
      NOW
    );
    expect(ordered.map((e) => e.id)).toEqual(['this-morning', 'yesterday']);
  });
});

describe('pickThumbnails', () => {
  it('leads with one before and one after, then fills up to the limit', () => {
    const photos = [
      { path: 'b1', tag: 'BEFORE' as const },
      { path: 'b2', tag: 'BEFORE' as const },
      { path: 'a1', tag: 'AFTER' as const },
    ];
    expect(pickThumbnails(photos, 2).map((p) => p.path)).toEqual(['b1', 'a1']);
    expect(pickThumbnails(photos).map((p) => p.path)).toEqual(['b1', 'a1', 'b2']);
  });
});
