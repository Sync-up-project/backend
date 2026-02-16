import * as fs from 'fs';
import * as path from 'path';
import { AiProvider, ProviderName, MockPresetValue } from './ai.provider';

export class MockAiProvider implements AiProvider {
  readonly name: ProviderName = 'mock';

  /**
   * fixtures JSON 로드
   */
  private loadFixture(preset: MockPresetValue, fileName: string): any {
    const filePath = path.join(
      process.cwd(),
      'src',
      'ai',
      'fixtures',
      preset,
      fileName,
    );

    if (!fs.existsSync(filePath)) {
      throw new Error(`[MockAiProvider] Fixture not found: ${filePath}`);
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  }

  /**
   * A. 아이디어 정규화
   */
  async normalizeIdea(input: {
    ideaText: string;
    language: 'ko' | 'en' | 'ja';
    preset?: MockPresetValue;
  }): Promise<unknown> {
    const preset = input.preset ?? 'medium';
    const json = this.loadFixture(preset, 'idea.json');

    // 입력값에 따라 일부 필드만 동적으로 덮어쓰기
    if (json?.project_meta) {
      json.project_meta.primary_language = input.language;
      json.project_meta.title =
        json.project_meta.title || this.deriveTitle(input.ideaText);
    }

    return json;
  }

  /**
   * B-1. 화면 목록 생성
   */
  async generateScreens(input: {
    ideaNormalized: unknown;
    preset?: MockPresetValue;
  }): Promise<unknown> {
    const preset = input.preset ?? 'medium';
    return this.loadFixture(preset, 'screens.json');
  }

  /**
   * B-2. API 명세 초안 생성
   */
  async generateApiSpec(input: {
    ideaNormalized: unknown;
    screens: unknown;
    preset?: MockPresetValue;
  }): Promise<unknown> {
    const preset = input.preset ?? 'medium';
    return this.loadFixture(preset, 'api.json');
  }

  /**
   * B-3. ERD 초안 생성
   */
  async generateErd(input: {
    ideaNormalized: unknown;
    preset?: MockPresetValue;
  }): Promise<unknown> {
    const preset = input.preset ?? 'medium';
    return this.loadFixture(preset, 'erd.json');
  }

  /**
   * C. 추가 확인 질문 생성 (최대 5개)
   */
  async generateClarifyingQuestions(input: {
    ideaNormalized: unknown;
    screens: unknown;
    apiSpec: unknown;
    erd: unknown;
    preset?: MockPresetValue;
  }): Promise<unknown> {
    const preset = input.preset ?? 'medium';
    return this.loadFixture(preset, 'questions.json');
  }

  /**
   * 아이디어 텍스트에서 간단한 제목 파생
   */
  private deriveTitle(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return '새 프로젝트';
    return trimmed.length > 32 ? `${trimmed.slice(0, 32)}…` : trimmed;
  }
}
