export type ProviderName = 'mock' | 'openai' | 'gemini';

// Mock provider용 preset 타입 (내부적으로 사용)
export type MockPresetValue = 'easy' | 'medium' | 'hard';

export interface AiProvider {
  readonly name: ProviderName;

  normalizeIdea(input: {
    ideaText: string;
    language: 'ko' | 'en' | 'ja';
    preset?: MockPresetValue;
  }): Promise<unknown>;
  generateScreens(input: {
    ideaNormalized: unknown;
    preset?: MockPresetValue;
  }): Promise<unknown>;
  generateApiSpec(input: {
    ideaNormalized: unknown;
    screens: unknown;
    preset?: MockPresetValue;
  }): Promise<unknown>;
  generateErd(input: {
    ideaNormalized: unknown;
    preset?: MockPresetValue;
  }): Promise<unknown>;
  generateClarifyingQuestions(input: {
    ideaNormalized: unknown;
    screens: unknown;
    apiSpec: unknown;
    erd: unknown;
    preset?: MockPresetValue;
  }): Promise<unknown>;
}
