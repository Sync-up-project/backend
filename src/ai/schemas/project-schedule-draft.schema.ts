import { z } from 'zod';

/** AI가 반환하는 캘린더 초안 한 건 (assigneeIds는 모델이 알 수 없어 제외) */
export const ScheduleDraftEventSchema = z.object({
  title: z.string().min(1).max(240),
  description: z.string().max(6000).default(''),
  memo: z.string().max(6000).default(''),
  startAt: z.string(),
  endAt: z.string(),
  type: z.enum(['TASK', 'MEETING', 'MILESTONE']),
  /** OpenAI strict 스키마와 동일: 초안은 모두 미착수 */
  status: z.literal('TODO'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  progress: z.literal(0),
  isAllDay: z.boolean().default(false),
});

export const ProjectScheduleDraftSchema = z.object({
  schema_version: z.string().default('1.0'),
  events: z.array(ScheduleDraftEventSchema).min(1).max(40),
});

export type ProjectScheduleDraftParsed = z.infer<typeof ProjectScheduleDraftSchema>;
export type ScheduleDraftEventParsed = z.infer<typeof ScheduleDraftEventSchema>;
