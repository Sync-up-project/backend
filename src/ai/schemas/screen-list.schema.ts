import { z } from 'zod';

export const ScreenListDraftSchema = z.object({
  schema_version: z.string().default('1.0'),
  screens: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      route: z.string(),
      actor_roles: z.array(z.string()),
      goal: z.string(),
      main_components: z.array(z.string()).default([]),
      states: z
        .array(z.enum(['empty', 'loading', 'error', 'success']))
        .default(['loading', 'success']),
      required_apis: z
        .array(
          z.object({
            method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
            path: z.string(),
            purpose: z.string(),
          }),
        )
        .default([]),
      permissions: z.object({
        auth_required: z.enum(['yes', 'no']),
        roles_allowed: z.array(z.string()).default([]),
      }),
      notes: z.array(z.string()).default([]),
    }),
  ),
  navigation: z
    .array(
      z.object({
        from_screen_id: z.string(),
        to_screen_id: z.string(),
        trigger: z.string(),
      }),
    )
    .default([]),
  assumptions: z.array(z.string()).default([]),
  open_questions: z.array(z.string()).default([]),
});

export type ScreenListDraft = z.infer<typeof ScreenListDraftSchema>;
