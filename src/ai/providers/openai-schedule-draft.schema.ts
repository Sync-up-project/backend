/**
 * OpenAI Responses API `response_format.json_schema.strict` 스키마
 * (@see AiService + OpenAiProvider.generateProjectScheduleDraft)
 */
export const PROJECT_SCHEDULE_DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schema_version', 'events'],
  properties: {
    schema_version: { type: 'string' },
    events: {
      type: 'array',
      minItems: 1,
      maxItems: 40,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'description',
          'memo',
          'startAt',
          'endAt',
          'type',
          'status',
          'priority',
          'progress',
          'isAllDay',
        ],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          memo: { type: 'string' },
          startAt: { type: 'string' },
          endAt: { type: 'string' },
          type: {
            type: 'string',
            enum: ['TASK', 'MEETING', 'MILESTONE'],
          },
          status: {
            type: 'string',
            enum: ['TODO'],
          },
          priority: {
            type: 'string',
            enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
          },
          progress: { type: 'integer', minimum: 0, maximum: 0 },
          isAllDay: { type: 'boolean' },
        },
      },
    },
  },
} as const;
