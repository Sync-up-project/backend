import { z } from 'zod';

export const IdeaNormalizedSchema = z.object({
  schema_version: z.string().default('1.0'),
  project_meta: z.object({
    title: z.string(),
    one_liner: z.string(),
    domain: z.string().optional().default('general'),
    target_platforms: z.array(
      z.enum(['web', 'mobile_web', 'ios', 'android', 'desktop']),
    ),
    primary_language: z.enum(['ko', 'en', 'ja']).default('ko'),
    reference_links: z.array(z.string()).default([]),
  }),
  problem_solution: z.object({
    problem_statement: z.string(),
    solution_summary: z.string(),
    unique_value: z.array(z.string()).default([]),
  }),
  users_and_roles: z.array(
    z.object({
      role: z.string(),
      description: z.string(),
      key_permissions: z.array(z.string()).default([]),
    }),
  ),
  core_user_flows: z.array(
    z.object({
      name: z.string(),
      actor_role: z.string(),
      steps: z.array(z.string()),
    }),
  ),
  features: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      priority: z.enum(['must', 'should', 'could', 'wont']),
      complexity_triggers: z.array(
        z.enum([
          'auth',
          'rbac',
          'payment',
          'realtime',
          'file_upload',
          'search',
          'recommendation',
          'external_api',
          'notifications',
          'admin_console',
          'analytics',
          'multilingual',
        ]),
      ),
      acceptance_criteria: z.array(z.string()).default([]),
    }),
  ),
  data_sensitivity: z.object({
    contains_pii: z.enum(['yes', 'no', 'unknown']),
    contains_payment_data: z.enum(['yes', 'no', 'unknown']),
    notes: z.string().default(''),
  }),
  non_functional_requirements: z.object({
    security: z.array(z.string()).default([]),
    performance: z.array(z.string()).default([]),
    availability: z.array(z.string()).default([]),
    scalability: z.array(z.string()).default([]),
  }),
  assumptions: z.array(z.string()).default([]),
  constraints: z.object({
    deadline: z.string().nullable().default(null),
    team_size_limit: z.number().nullable().default(null),
    must_use_tech: z.array(z.string()).default([]),
    cannot_use_tech: z.array(z.string()).default([]),
  }),
  open_questions: z
    .array(
      z.object({
        question: z.string(),
        why_it_matters: z.string(),
        options: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  quality_flags: z.object({
    missing_role_definitions: z.enum(['yes', 'no']),
    ambiguous_scope: z.enum(['yes', 'no']),
    high_risk_uncertainty: z.enum(['yes', 'no']),
  }),
});

export type IdeaNormalized = z.infer<typeof IdeaNormalizedSchema>;
