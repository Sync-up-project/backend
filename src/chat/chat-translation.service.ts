import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { Language } from '@prisma/client';

/**
 * 프로젝트 채팅 메시지를 한·영·일 간 번역합니다.
 * OPENAI_API_KEY 가 없으면 빈 객체를 반환하고 원문만 사용합니다.
 */
@Injectable()
export class ChatTranslationService {
  private readonly client: OpenAI | null;
  private readonly maxChars = Number(
    process.env.CHAT_TRANSLATION_MAX_CHARS ?? 8000,
  );

  constructor() {
    const key = process.env.OPENAI_API_KEY;
    this.client = key ? new OpenAI({ apiKey: key }) : null;
  }

  /**
   * 원문 언어를 제외한 KO/EN/JA 번역문을 반환합니다 (DB의 ChatMessageI18n 용).
   */
  async translateMessage(
    text: string,
    sourceLang: Language,
  ): Promise<Partial<Record<Language, string>>> {
    if (!this.client || !text.trim()) {
      return {};
    }
    if (text.length > this.maxChars) {
      console.warn(
        'ChatTranslationService: message too long, skipping translation',
      );
      return {};
    }

    const enabled =
      (process.env.CHAT_TRANSLATION_ENABLED ?? 'true').toLowerCase() !==
      'false';
    if (!enabled) {
      return {};
    }

    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

    const userPayload = {
      text,
      sourceLanguage: sourceLang,
      task: `Return ONLY valid JSON with keys "KO", "EN", "JA" (string values).
For the key equal to sourceLanguage (${sourceLang}), copy the original text exactly (do not translate).
For the other two keys, provide natural, accurate translations suitable for live chat.`,
    };

    try {
      const res = await this.client.chat.completions.create({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You translate chat lines between Korean, English, and Japanese. Be concise. JSON only.',
          },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
      });

      const raw = res.choices[0]?.message?.content?.trim();
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: Partial<Record<Language, string>> = {};

      for (const lang of [Language.KO, Language.EN, Language.JA]) {
        if (lang === sourceLang) {
          continue;
        }
        const v = parsed[lang];
        if (typeof v === 'string' && v.trim().length > 0) {
          out[lang] = v.trim();
        }
      }

      return out;
    } catch (e) {
      console.error('ChatTranslationService.translateMessage failed', e);
      return {};
    }
  }
}
