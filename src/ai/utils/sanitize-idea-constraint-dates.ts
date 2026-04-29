/** 기획 일정·모집 정원 제안 보정 (서울 캘린더 기준 날짜) */
const SEOUL_TZ = 'Asia/Seoul';

export function seoulCalendarTodayYyyyMmDd(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function extractYyyyMmDd(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const m = s.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function addCalendarDays(yyyyMmDd: string, deltaDays: number): string {
  const [y, mo, d] = yyyyMmDd.split('-').map((n) => Number(n));
  const t = Date.UTC(y, mo - 1, d, 12, 0, 0);
  const next = new Date(t + deltaDays * 86400000);
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function isBeforeCalendar(a: string, b: string): boolean {
  return a < b;
}

function fallbackRecruitCapacityFromIdea(idea: any): number {
  const features = Array.isArray(idea?.features) ? idea.features.length : 0;
  const roles = Array.isArray(idea?.users_and_roles)
    ? idea.users_and_roles.length
    : 1;
  const triggers: string[] = [];
  for (const f of idea?.features ?? []) {
    const t = f?.complexity_triggers;
    if (Array.isArray(t)) triggers.push(...t.map(String));
  }
  const heavy = triggers.some((x) =>
    ['payment', 'realtime', 'external_api', 'rbac'].includes(x),
  );
  let n =
    3 +
    Math.min(6, Math.ceil(features / 2)) +
    Math.min(3, Math.floor(roles / 2));
  if (heavy) n += 3;
  return Math.min(30, Math.max(2, n));
}

/**
 * LLM이 과거·역전 날짜·범위 밖 인원을 넣는 경우 보정한다. ideaNormalized.constraints 를 제자리에서 수정.
 */
export function sanitizeIdeaConstraintDatesInPlace(idea: any): void {
  if (!idea?.constraints || typeof idea.constraints !== 'object') return;
  const c = idea.constraints;
  const today = seoulCalendarTodayYyyyMmDd();

  const defaultRecruit = addCalendarDays(today, 14);
  const defaultEnd = addCalendarDays(today, 56);

  let recruit = extractYyyyMmDd(c.recruit_deadline_iso);
  let end =
    extractYyyyMmDd(c.project_end_iso) ?? extractYyyyMmDd(c.deadline);

  if (!end || isBeforeCalendar(end, today)) end = defaultEnd;
  if (!recruit || isBeforeCalendar(recruit, today)) recruit = defaultRecruit;

  // 모집 마감 ≤ 프로젝트 종료가 되도록
  if (isBeforeCalendar(end, recruit)) {
    end = addCalendarDays(recruit, 28);
  }

  c.recruit_deadline_iso = recruit;
  c.project_end_iso = end;
  c.deadline = end;

  let cap = Number(c.suggested_recruit_capacity);
  if (!Number.isFinite(cap) || cap < 2) {
    cap = fallbackRecruitCapacityFromIdea(idea);
  }
  cap = Math.floor(cap);
  if (cap > 40) cap = 40;
  if (cap < 2) cap = 2;
  c.suggested_recruit_capacity = cap;
}
