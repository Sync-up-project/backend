import { validationException } from '../../common/exceptions/app.exception';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

/** 비밀번호 정책 (도메인 규칙, 인프라 무관) */
export function assertPasswordPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw validationException(
      `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`,
    );
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw validationException('비밀번호가 너무 깁니다.');
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeNickname(nickname: string): string {
  return nickname.trim();
}

export function assertEmailFormat(email: string): void {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw validationException('유효한 이메일 주소를 입력해 주세요.');
  }
}

export function assertNicknameFormat(nickname: string): void {
  if (nickname.length < 2) {
    throw validationException('닉네임은 2자 이상이어야 합니다.');
  }
  if (nickname.length > 30) {
    throw validationException('닉네임은 30자 이하여야 합니다.');
  }
}
