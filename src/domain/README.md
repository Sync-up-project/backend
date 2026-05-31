# Domain Layer

비즈니스 규칙과 도메인 타입을 인프라(Prisma, HTTP, WebSocket)와 분리합니다.

| 경로 | 역할 |
|------|------|
| `auth/password.policy.ts` | 비밀번호·이메일·닉네임 검증 (순수 함수) |
| `project/project-access.service.ts` | 프로젝트 멤버/오너 접근 규칙 |
| `chat/chat.types.ts` | 채팅 DTO·언어 파싱 |
| `chat/chat-message.mapper.ts` | DB → DTO 변환 |

## 계층 구조

```
HTTP / WebSocket (controllers, gateways)
    ↓
Application (auth.service, calendar-events.service)
    ↓
Domain (project-access, password.policy)
    ↓
Infrastructure (chat.repository, prisma)
```

새 기능 추가 시 접근 규칙은 `ProjectAccessService`를 재사용하고,
채팅 DB 접근은 `ChatRepository`에 모읍니다.
