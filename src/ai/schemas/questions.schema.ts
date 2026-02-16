import { z } from 'zod';

export const ClarifyingQuestionsSchema = z.object({
  schema_version: z.string().default('1.0'),
  questions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        type: z.enum(['single_choice', 'multi_choice', 'free_text', 'boolean']),
        options: z.array(z.string()).default([]),
        default: z.string().nullable().default(null),
        why_it_matters: z.string(),
        impacts: z.array(z.enum(['erd', 'api', 'screens', 'timeline', 'team'])),
      }),
    )
    .max(5),
  limit_policy: z.object({
    max_questions: z.number().default(5),
    rule: z.string().default('Exactly 5 unless already fully specified'),
  }),
});

export type ClarifyingQuestions = z.infer<typeof ClarifyingQuestionsSchema>;
