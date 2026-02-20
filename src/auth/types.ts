// src/auth/types.ts
export type JwtAccessPayload = {
  sub: string; // ✅ User.id is String(cuid)
  accountRole?: string;
};

export type JwtRefreshPayload = {
  sub: string; // ✅ User.id
  sid: string; // ✅ RefreshSession.id
};
