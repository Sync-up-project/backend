import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import { AiProvider, ProviderName } from './ai.provider';

export class OpenAiProvider implements AiProvider {
  readonly name: ProviderName = 'openai';
  private client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  private model = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';

  // NOTE: We do not use the stepwise methods for LLM in MVP.
  // AiService will call generateBundle() once and validate with Zod.
  async normalizeIdea(): Promise<unknown> {
    throw new Error(
      'OpenAiProvider: normalizeIdea() is not used. Call generateBundle() instead.',
    );
  }

  async generateScreens(): Promise<unknown> {
    throw new Error(
      'OpenAiProvider: generateScreens() is not used. Call generateBundle() instead.',
    );
  }

  async generateApiSpec(): Promise<unknown> {
    throw new Error(
      'OpenAiProvider: generateApiSpec() is not used. Call generateBundle() instead.',
    );
  }

  async generateErd(): Promise<unknown> {
    throw new Error(
      'OpenAiProvider: generateErd() is not used. Call generateBundle() instead.',
    );
  }

  async generateClarifyingQuestions(): Promise<unknown> {
    throw new Error(
      'OpenAiProvider: generateClarifyingQuestions() is not used. Call generateBundle() instead.',
    );
  }

  // ✅ one-shot bundle generation (preferred)
  async generateBundle(input: {
    ideaText: string;
    language: 'ko' | 'en' | 'ja';
  }) {
    const prompt = renderPrompt('bundle_generate.txt', {
      language: input.language,
      ideaText: input.ideaText,
    });

    // NOTE: Some openai SDK versions don't type `response_format` on Responses API.
    // We still pass it at runtime and cast to any to avoid TS overload errors.
    const response = await (this.client.responses as any).create({
      model: this.model,
      input: prompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'project_bundle_v1',
          strict: true,
          schema: BUNDLE_SCHEMA,
        },
      },
      temperature: 0,
    } as any);

    const text = (response as any).output_text ?? '';
    const raw = (text || extractOutputText(response) || '').trim();

    if (!raw) {
      throw new Error('OpenAiProvider: empty model output');
    }
    // Quick sanity check: top-level must be an object
    // (JSON mode should guarantee this, but we keep a guard.)

    // JSON mode should return valid JSON, but we still guard against edge cases.
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const extracted = extractJsonObject(raw);
      if (!extracted) {
        throw new Error(
          `OpenAiProvider: output is not valid JSON. sample=${raw.slice(0, 200)}`,
        );
      }
      parsed = JSON.parse(extracted);
    }

    // ✅ Some models sometimes put JSON *strings* inside these keys.
    // Coerce them to real objects so AiService Zod validation receives objects.
    const keys = [
      'ideaNormalized',
      'screens',
      'apiSpec',
      'erd',
      'questions',
    ] as const;
    for (const k of keys) {
      parsed[k] = parseMaybeJson(parsed[k], k);
    }

    return parsed;
  }

  async reviseBundle(input: {
    language: 'ko' | 'en' | 'ja';
    instruction: string;
    baseJson: unknown;
  }) {
    const prompt = renderPrompt('bundle_revise.txt', {
      language: input.language,
      instruction: input.instruction,
      baseJson: JSON.stringify(input.baseJson),
    });

    const response = await (this.client.responses as any).create({
      model: this.model,
      input: prompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'project_bundle_v1',
          strict: true,
          schema: BUNDLE_SCHEMA,
        },
      },
      temperature: 0,
    } as any);

    const text = (response as any).output_text ?? '';
    const raw = (text || extractOutputText(response) || '').trim();

    if (!raw) {
      throw new Error('OpenAiProvider: empty model output');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const extracted = extractJsonObject(raw);
      if (!extracted) {
        throw new Error(
          `OpenAiProvider: output is not valid JSON. sample=${raw.slice(0, 200)}`,
        );
      }
      parsed = JSON.parse(extracted);
    }

    const keys = [
      'ideaNormalized',
      'screens',
      'apiSpec',
      'erd',
      'questions',
    ] as const;
    for (const k of keys) {
      parsed[k] = parseMaybeJson(parsed[k], k);
    }

    return parsed;
  }
}

function extractOutputText(resp: any): string {
  const out = resp?.output;
  if (!Array.isArray(out)) return '';
  for (const item of out) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c?.type === 'output_text' && typeof c?.text === 'string') {
        return c.text;
      }
    }
  }
  return '';
}

function renderPrompt(fileName: string, vars: Record<string, string>): string {
  const filePath = path.join(process.cwd(), 'src', 'ai', 'prompts', fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`OpenAiProvider: prompt not found: ${filePath}`);
  }
  const template = fs.readFileSync(filePath, 'utf-8');
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
    template,
  );
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function parseMaybeJson(value: any, label: string) {
  if (typeof value !== 'string') return value;

  let t = value.trim();
  if (!t) return value;

  // Try up to 3 times to unwrap nested JSON strings.
  for (let i = 0; i < 3; i++) {
    const candidate = extractJsonObject(t) ?? t;
    try {
      const parsed = JSON.parse(candidate);

      // If it parsed into a string, it may be a double-encoded JSON object.
      if (typeof parsed === 'string') {
        const next = parsed.trim();
        // If the next string still looks like JSON, continue; otherwise return the string.
        if (next.includes('{') && next.includes('}')) {
          t = next;
          continue;
        }
        return parsed;
      }

      return parsed;
    } catch {
      // Not valid JSON at this layer
      break;
    }
  }

  throw new Error(
    `OpenAiProvider: ${label} is string but not valid JSON. sample=${t.slice(0, 200)}`,
  );
}

const ANY_OBJECT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {},
  required: [],
} as const;

const BUNDLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ideaNormalized', 'screens', 'apiSpec', 'erd', 'questions'],
  properties: {
    ideaNormalized: {
      type: 'object',
      additionalProperties: false,
      required: [
        'schema_version',
        'project_meta',
        'problem_solution',
        'users_and_roles',
        'core_user_flows',
        'features',
        'data_sensitivity',
        'non_functional_requirements',
        'assumptions',
        'constraints',
        'open_questions',
        'quality_flags',
      ],
      properties: {
        schema_version: { type: 'string' },
        project_meta: {
          type: 'object',
          additionalProperties: false,
          required: [
            'title',
            'one_liner',
            'domain',
            'target_platforms',
            'primary_language',
            'reference_links',
          ],
          properties: {
            title: { type: 'string' },
            one_liner: { type: 'string' },
            domain: { type: 'string' },
            target_platforms: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['web', 'mobile_web', 'ios', 'android', 'desktop'],
              },
            },
            primary_language: {
              type: 'string',
              enum: ['ko', 'en', 'ja'],
            },
            reference_links: { type: 'array', items: { type: 'string' } },
          },
        },
        problem_solution: {
          type: 'object',
          additionalProperties: false,
          required: ['problem_statement', 'solution_summary', 'unique_value'],
          properties: {
            problem_statement: { type: 'string' },
            solution_summary: { type: 'string' },
            unique_value: { type: 'array', items: { type: 'string' } },
          },
        },
        users_and_roles: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['role', 'description', 'key_permissions'],
            properties: {
              role: { type: 'string' },
              description: { type: 'string' },
              key_permissions: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        core_user_flows: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'actor_role', 'steps'],
            properties: {
              name: { type: 'string' },
              actor_role: { type: 'string' },
              steps: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        features: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'name',
              'description',
              'priority',
              'complexity_triggers',
              'acceptance_criteria',
            ],
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              priority: {
                type: 'string',
                enum: ['must', 'should', 'could', 'wont'],
              },
              complexity_triggers: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: [
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
                  ],
                },
              },
              acceptance_criteria: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
        data_sensitivity: {
          type: 'object',
          additionalProperties: false,
          required: ['contains_pii', 'contains_payment_data', 'notes'],
          properties: {
            contains_pii: {
              type: 'string',
              enum: ['yes', 'no', 'unknown'],
            },
            contains_payment_data: {
              type: 'string',
              enum: ['yes', 'no', 'unknown'],
            },
            notes: { type: 'string' },
          },
        },
        non_functional_requirements: {
          type: 'object',
          additionalProperties: false,
          required: ['security', 'performance', 'availability', 'scalability'],
          properties: {
            security: { type: 'array', items: { type: 'string' } },
            performance: { type: 'array', items: { type: 'string' } },
            availability: { type: 'array', items: { type: 'string' } },
            scalability: { type: 'array', items: { type: 'string' } },
          },
        },
        assumptions: { type: 'array', items: { type: 'string' } },
        constraints: {
          type: 'object',
          additionalProperties: false,
          required: [
            'deadline',
            'team_size_limit',
            'must_use_tech',
            'cannot_use_tech',
          ],
          properties: {
            deadline: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            team_size_limit: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            must_use_tech: { type: 'array', items: { type: 'string' } },
            cannot_use_tech: { type: 'array', items: { type: 'string' } },
          },
        },
        open_questions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['question', 'why_it_matters', 'options'],
            properties: {
              question: { type: 'string' },
              why_it_matters: { type: 'string' },
              options: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        quality_flags: {
          type: 'object',
          additionalProperties: false,
          required: [
            'missing_role_definitions',
            'ambiguous_scope',
            'high_risk_uncertainty',
          ],
          properties: {
            missing_role_definitions: {
              type: 'string',
              enum: ['yes', 'no'],
            },
            ambiguous_scope: {
              type: 'string',
              enum: ['yes', 'no'],
            },
            high_risk_uncertainty: {
              type: 'string',
              enum: ['yes', 'no'],
            },
          },
        },
      },
    },

    screens: {
      type: 'object',
      additionalProperties: false,
      required: [
        'schema_version',
        'screens',
        'navigation',
        'assumptions',
        'open_questions',
      ],
      properties: {
        schema_version: { type: 'string' },
        screens: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'id',
              'name',
              'route',
              'actor_roles',
              'goal',
              'main_components',
              'states',
              'required_apis',
              'permissions',
              'notes',
            ],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              route: { type: 'string' },
              actor_roles: { type: 'array', items: { type: 'string' } },
              goal: { type: 'string' },
              main_components: { type: 'array', items: { type: 'string' } },
              states: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['empty', 'loading', 'error', 'success'],
                },
              },
              required_apis: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['method', 'path', 'purpose'],
                  properties: {
                    method: {
                      type: 'string',
                      enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
                    },
                    path: { type: 'string' },
                    purpose: { type: 'string' },
                  },
                },
              },
              permissions: {
                type: 'object',
                additionalProperties: false,
                required: ['auth_required', 'roles_allowed'],
                properties: {
                  auth_required: { type: 'string', enum: ['yes', 'no'] },
                  roles_allowed: { type: 'array', items: { type: 'string' } },
                },
              },
              notes: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        navigation: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['from_screen_id', 'to_screen_id', 'trigger'],
            properties: {
              from_screen_id: { type: 'string' },
              to_screen_id: { type: 'string' },
              trigger: { type: 'string' },
            },
          },
        },
        assumptions: { type: 'array', items: { type: 'string' } },
        open_questions: { type: 'array', items: { type: 'string' } },
      },
    },

    apiSpec: {
      type: 'object',
      additionalProperties: false,
      required: [
        'schema_version',
        'base_url_hint',
        'auth',
        'endpoints',
        'assumptions',
        'open_questions',
      ],
      properties: {
        schema_version: { type: 'string' },
        base_url_hint: { type: 'string' },
        auth: {
          type: 'object',
          additionalProperties: false,
          required: ['strategy', 'notes'],
          properties: {
            strategy: {
              type: 'string',
              enum: ['session', 'jwt', 'oauth', 'unknown'],
            },
            notes: { type: 'array', items: { type: 'string' } },
          },
        },
        endpoints: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'id',
              'name',
              'method',
              'path',
              'summary',
              'auth_required',
              'roles_allowed',
              'rate_limit_hint',
              'request',
              'responses',
              'errors',
              'related_screens',
              'notes',
            ],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              method: {
                type: 'string',
                enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
              },
              path: { type: 'string' },
              summary: { type: 'string' },
              auth_required: { type: 'string', enum: ['yes', 'no'] },
              roles_allowed: { type: 'array', items: { type: 'string' } },
              rate_limit_hint: {
                anyOf: [{ type: 'string' }, { type: 'null' }],
              },
              request: {
                type: 'object',
                additionalProperties: false,
                required: ['headers', 'query', 'params', 'body'],
                properties: {
                  headers: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['name', 'required', 'example'],
                      properties: {
                        name: { type: 'string' },
                        required: { type: 'string', enum: ['yes', 'no'] },
                        example: { type: 'string' },
                      },
                    },
                  },
                  query: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['name', 'type', 'required', 'example'],
                      properties: {
                        name: { type: 'string' },
                        type: { type: 'string' },
                        required: { type: 'string', enum: ['yes', 'no'] },
                        example: { type: 'string' },
                      },
                    },
                  },
                  params: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['name', 'type', 'required', 'example'],
                      properties: {
                        name: { type: 'string' },
                        type: { type: 'string' },
                        required: { type: 'string', enum: ['yes', 'no'] },
                        example: { type: 'string' },
                      },
                    },
                  },
                  body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['content_type', 'schema', 'example'],
                    properties: {
                      content_type: {
                        type: 'string',
                        enum: [
                          'application/json',
                          'multipart/form-data',
                          'none',
                        ],
                      },
                      schema: { type: 'string' },
                      example: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {},
                        required: [],
                      },
                    },
                  },
                },
              },
              responses: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['status', 'description', 'schema', 'example'],
                  properties: {
                    status: { type: 'number' },
                    description: { type: 'string' },
                    schema: { type: 'string' },
                    example: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {},
                      required: [],
                    },
                  },
                },
              },
              errors: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['status', 'code', 'message', 'when'],
                  properties: {
                    status: { type: 'number' },
                    code: { type: 'string' },
                    message: { type: 'string' },
                    when: { type: 'string' },
                  },
                },
              },
              related_screens: { type: 'array', items: { type: 'string' } },
              notes: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        assumptions: { type: 'array', items: { type: 'string' } },
        open_questions: { type: 'array', items: { type: 'string' } },
      },
    },

    erd: {
      type: 'object',
      additionalProperties: false,
      required: [
        'schema_version',
        'entities',
        'relationships',
        'common_conventions',
        'assumptions',
        'open_questions',
      ],
      properties: {
        schema_version: { type: 'string' },
        entities: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'description', 'columns', 'indexes'],
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              columns: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'name',
                    'type',
                    'nullable',
                    'pk',
                    'unique',
                    'default',
                    'comment',
                  ],
                  properties: {
                    name: { type: 'string' },
                    type: { type: 'string' },
                    nullable: { type: 'string', enum: ['yes', 'no'] },
                    pk: { type: 'string', enum: ['yes', 'no'] },
                    unique: { type: 'string', enum: ['yes', 'no'] },
                    default: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                    comment: { type: 'string' },
                  },
                },
              },
              indexes: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['name', 'columns', 'unique'],
                  properties: {
                    name: { type: 'string' },
                    columns: { type: 'array', items: { type: 'string' } },
                    unique: { type: 'string', enum: ['yes', 'no'] },
                  },
                },
              },
            },
          },
        },
        relationships: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'from_entity',
              'from_column',
              'to_entity',
              'to_column',
              'cardinality',
              'on_delete',
              'notes',
            ],
            properties: {
              from_entity: { type: 'string' },
              from_column: { type: 'string' },
              to_entity: { type: 'string' },
              to_column: { type: 'string' },
              cardinality: { type: 'string', enum: ['1:1', '1:N', 'N:M'] },
              on_delete: {
                type: 'string',
                enum: [
                  'CASCADE',
                  'RESTRICT',
                  'SET_NULL',
                  'NO_ACTION',
                  'unknown',
                ],
              },
              notes: { type: 'string' },
            },
          },
        },
        common_conventions: {
          type: 'object',
          additionalProperties: false,
          required: ['id_strategy', 'timestamps', 'soft_delete'],
          properties: {
            id_strategy: {
              type: 'string',
              enum: ['uuid', 'cuid', 'int', 'unknown'],
            },
            timestamps: {
              type: 'string',
              enum: ['createdAt/updatedAt', 'none', 'unknown'],
            },
            soft_delete: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          },
        },
        assumptions: { type: 'array', items: { type: 'string' } },
        open_questions: { type: 'array', items: { type: 'string' } },
      },
    },

    questions: {
      type: 'object',
      additionalProperties: false,
      required: ['schema_version', 'questions', 'limit_policy'],
      properties: {
        schema_version: { type: 'string' },
        questions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'id',
              'question',
              'type',
              'options',
              'default',
              'why_it_matters',
              'impacts',
            ],
            properties: {
              id: { type: 'string' },
              question: { type: 'string' },
              type: {
                type: 'string',
                enum: ['single_choice', 'multi_choice', 'free_text', 'boolean'],
              },
              options: { type: 'array', items: { type: 'string' } },
              default: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              why_it_matters: { type: 'string' },
              impacts: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['erd', 'api', 'screens', 'timeline', 'team'],
                },
              },
            },
          },
        },
        limit_policy: {
          type: 'object',
          additionalProperties: false,
          required: ['max_questions', 'rule'],
          properties: {
            max_questions: { type: 'number' },
            rule: { type: 'string' },
          },
        },
      },
    },
  },
} as const;
