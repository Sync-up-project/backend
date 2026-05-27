/** 프로젝트 일정 초안 이벤트의 시작·종료를 [windowStart, windowEnd] 안으로 보정합니다. */

const MIN_DURATION_MS = 60 * 60 * 1000;

function clampTimeMs(t: number, min: number, max: number): number {
  return Math.min(Math.max(t, min), max);
}

export function computeScheduleWindow(opts: {
  startDate?: Date | null;
  endDate?: Date | null;
  deadline?: Date | null;
  createdAt: Date;
}): { windowStart: Date; windowEnd: Date } {
  let windowStart = opts.startDate ?? opts.createdAt ?? new Date();
  let windowEnd =
    opts.endDate ??
    opts.deadline ??
    new Date(windowStart.getTime() + 60 * 24 * 3600 * 1000); // +60일

  if (opts.endDate && opts.deadline) {
    windowEnd =
      opts.endDate.getTime() <= opts.deadline.getTime()
        ? opts.endDate
        : opts.deadline;
  } else if (opts.deadline && !opts.endDate) {
    windowEnd = opts.deadline;
  }

  if (windowEnd.getTime() <= windowStart.getTime()) {
    windowEnd = new Date(windowStart.getTime() + 14 * 24 * 3600 * 1000);
  }

  return { windowStart, windowEnd };
}

export type DraftEventDates = {
  startAt: string;
  endAt: string;
};

export function clampScheduleDraftEventDates(
  event: DraftEventDates,
  windowStart: Date,
  windowEnd: Date,
): DraftEventDates {
  const ws = windowStart.getTime();
  const we = windowEnd.getTime();

  let s = new Date(event.startAt).getTime();
  let e = new Date(event.endAt).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) {
    s = ws;
    e = Math.min(we, ws + MIN_DURATION_MS);
    return {
      startAt: new Date(s).toISOString(),
      endAt: new Date(e).toISOString(),
    };
  }

  if (e < s) {
    [s, e] = [e, s];
  }

  const duration = Math.max(MIN_DURATION_MS, e - s);

  if (s < ws) {
    const delta = ws - s;
    s += delta;
    e += delta;
  }
  if (e > we) {
    e = we;
    s = Math.max(ws, e - duration);
    if (s >= e) {
      s = Math.max(ws, we - MIN_DURATION_MS);
      e = we;
    }
  }

  if (s < ws) {
    s = ws;
    e = Math.min(we, Math.max(ws + MIN_DURATION_MS, ws + duration));
  }
  if (e <= s) {
    e = Math.min(we, s + MIN_DURATION_MS);
  }

  s = clampTimeMs(s, ws, we);
  e = clampTimeMs(e, ws, we);
  if (e <= s) {
    e = Math.min(we, s + MIN_DURATION_MS);
    e = clampTimeMs(e, ws, we);
    if (e <= s) {
      return {
        startAt: new Date(ws).toISOString(),
        endAt: new Date(Math.min(we, ws + MIN_DURATION_MS)).toISOString(),
      };
    }
  }

  return {
    startAt: new Date(s).toISOString(),
    endAt: new Date(e).toISOString(),
  };
}
