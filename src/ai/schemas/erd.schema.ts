import { z } from 'zod';

export const ErdDraftSchema = z.object({
  schema_version: z.string().default('1.0'),
  entities: z.array(
    z.object({
      name: z.string(),
      description: z.string().default(''),
      columns: z.array(
        z.object({
          name: z.string(),
          type: z.string(),
          nullable: z.enum(['yes', 'no']),
          pk: z.enum(['yes', 'no']),
          unique: z.enum(['yes', 'no']),
          default: z.string().nullable().default(null),
          comment: z.string().default(''),
        }),
      ),
      indexes: z
        .array(
          z.object({
            name: z.string(),
            columns: z.array(z.string()),
            unique: z.enum(['yes', 'no']),
          }),
        )
        .default([]),
    }),
  ),
  relationships: z
    .array(
      z.object({
        from_entity: z.string(),
        from_column: z.string(),
        to_entity: z.string(),
        to_column: z.string(),
        cardinality: z.enum(['1:1', '1:N', 'N:M']),
        on_delete: z
          .enum(['CASCADE', 'RESTRICT', 'SET_NULL', 'NO_ACTION', 'unknown'])
          .default('unknown'),
        notes: z.string().default(''),
      }),
    )
    .default([]),
  common_conventions: z.object({
    id_strategy: z.enum(['uuid', 'cuid', 'int', 'unknown']).default('cuid'),
    timestamps: z
      .enum(['createdAt/updatedAt', 'none', 'unknown'])
      .default('createdAt/updatedAt'),
    soft_delete: z.enum(['yes', 'no', 'unknown']).default('unknown'),
  }),
  assumptions: z.array(z.string()).default([]),
  open_questions: z.array(z.string()).default([]),
});

export type ErdDraft = z.infer<typeof ErdDraftSchema>;
