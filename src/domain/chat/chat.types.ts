import { Language } from '@prisma/client';

export type ChatMessageDto = {
  id: string;
  senderId: string;
  username: string;
  message: string;
  originalLang: Language;
  translations?: Partial<Record<Language, string>>;
  timestamp: Date;
};

export function parseChatSourceLang(input: unknown): Language | null {
  if (input === Language.KO || input === Language.EN || input === Language.JA) {
    return input;
  }
  if (typeof input === 'string') {
    const u = input.toUpperCase();
    if (u === 'KO' || u === 'EN' || u === 'JA') {
      return u as Language;
    }
  }
  return null;
}
