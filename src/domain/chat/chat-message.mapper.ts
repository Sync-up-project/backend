import { Language } from '@prisma/client';
import { ChatMessageDto } from './chat.types';

type DbMessageRow = {
  id: string;
  senderId: string;
  originalText: string;
  originalLang: Language;
  createdAt: Date;
  sender: { nickname: string | null };
  i18n?: { targetLang: Language; translatedText: string }[];
};

export function mapDbMessageToDto(msg: DbMessageRow): ChatMessageDto {
  const translations: Partial<Record<Language, string>> = {};
  for (const row of msg.i18n ?? []) {
    translations[row.targetLang] = row.translatedText;
  }

  return {
    id: msg.id,
    senderId: msg.senderId,
    username: msg.sender.nickname ?? 'User',
    message: msg.originalText,
    originalLang: msg.originalLang,
    translations:
      Object.keys(translations).length > 0 ? translations : undefined,
    timestamp: msg.createdAt,
  };
}
