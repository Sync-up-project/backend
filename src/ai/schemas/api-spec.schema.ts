import { z } from 'zod';

export const ApiSpecDraftSchema = z.object({
  schema_version: z.string().default('1.0'),
  base_url_hint: z.string().default('/api'),
  auth: z.object({
    strategy: z.enum(['session', 'jwt', 'oauth', 'unknown']).default('unknown'),
    notes: z.array(z.string()).default([]),
  }),
  endpoints: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      path: z.string(),
      summary: z.string(),
      auth_required: z.enum(['yes', 'no']),
      roles_allowed: z.array(z.string()).default([]),
      rate_limit_hint: z.string().nullable().default(null),
      request: z.object({
        headers: z
          .array(
            z.object({
              name: z.string(),
              required: z.enum(['yes', 'no']),
              example: z.string().optional().default(''),
            }),
          )
          .default([]),
        query: z
          .array(
            z.object({
              name: z.string(),
              type: z.string(),
              required: z.enum(['yes', 'no']),
              example: z.string().optional().default(''),
            }),
          )
          .default([]),
        params: z
          .array(
            z.object({
              name: z.string(),
              type: z.string(),
              required: z.enum(['yes', 'no']),
              example: z.string().optional().default(''),
            }),
          )
          .default([]),
        body: z.object({
          content_type: z
            .enum(['application/json', 'multipart/form-data', 'none'])
            .default('application/json'),
          schema: z.string().default('object'),
          example: z.record(z.string(), z.any()).default({}),
        }),
      }),
      responses: z
        .array(
          z.object({
            status: z.number(),
            description: z.string(),
            schema: z.string().default('object'),
            example: z.record(z.string(), z.any()).default({}),
          }),
        )
        .default([]),
      errors: z
        .array(
          z.object({
            status: z.number(),
            code: z.string(),
            message: z.string(),
            when: z.string(),
          }),
        )
        .default([]),
      related_screens: z.array(z.string()).default([]),
      notes: z.array(z.string()).default([]),
    }),
  ),
  assumptions: z.array(z.string()).default([]),
  open_questions: z.array(z.string()).default([]),
});

export type ApiSpecDraft = z.infer<typeof ApiSpecDraftSchema>;
