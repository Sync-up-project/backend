import {
  PrismaClient,
  Language,
  UserRole,
  TechLevel,
  ProjectMode,
  Difficulty,
  ProjectStatus,
  PositionType,
  InviteStatus,
  ApplicationStatus,
  ChatRoomType,
  KanbanCardStatus,
} from "@prisma/client";

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const hashPassword = async (password: string): Promise<string> => {
  try {
    const bcrypt = require("bcryptjs");
    return await bcrypt.hash(password, 10);
  } catch (error) {
    console.warn("⚠️  bcryptjs가 설치되지 않았습니다. 임시 해시를 사용합니다.");
    return `temp_hash_${password}`;
  }
};

/**
 * ✅ 중요: 이 프로젝트는 Prisma Driver Adapter 방식(engine type "client")을 사용 중이라
 * PrismaClient 생성 시 adapter(또는 accelerateUrl)가 반드시 필요합니다.
 *
 * Nest 서버에서는 PrismaService에서 adapter를 주입해서 동작하고,
 * seed.ts는 직접 adapter를 만들어 주입해야 합니다.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);

// ✅ 여기에서 adapter를 주입합니다.
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 시드 데이터 생성을 시작합니다...");

  console.log("🗑️  기존 데이터 삭제 중...");
  await prisma.chatMessageI18n.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.chatRoomMember.deleteMany();
  await prisma.chatRoom.deleteMany();
  await prisma.kanbanCardAssignee.deleteMany();
  await prisma.kanbanCard.deleteMany();
  await prisma.kanbanColumn.deleteMany();
  await prisma.kanbanBoard.deleteMany();
  await prisma.projectSuccessStoryI18n.deleteMany();
  await prisma.projectSuccessStory.deleteMany();
  await prisma.trendArticleI18n.deleteMany();
  await prisma.trendArticle.deleteMany();
  await prisma.userBadge.deleteMany();
  await prisma.badge.deleteMany();
  await prisma.projectEvaluation.deleteMany();
  await prisma.notificationI18n.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.application.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.projectPositionNeed.deleteMany();
  await prisma.projectTechStack.deleteMany();
  await prisma.projectI18n.deleteMany();
  await prisma.project.deleteMany();
  await prisma.userTechStack.deleteMany();
  await prisma.techStack.deleteMany();
  await prisma.user.deleteMany();

  console.log("📚 기술 스택 생성 중...");
  const techStacks = await Promise.all([
    prisma.techStack.create({ data: { name: "REACT" } }),
    prisma.techStack.create({ data: { name: "NestJS" } }),
    prisma.techStack.create({ data: { name: "TypeScript" } }),
    prisma.techStack.create({ data: { name: "Node.js" } }),
    prisma.techStack.create({ data: { name: "PostgreSQL" } }),
    prisma.techStack.create({ data: { name: "MongoDB" } }),
    prisma.techStack.create({ data: { name: "Vue.js" } }),
    prisma.techStack.create({ data: { name: "Python" } }),
    prisma.techStack.create({ data: { name: "Django" } }),
    prisma.techStack.create({ data: { name: "Flutter" } }),
    prisma.techStack.create({ data: { name: "Swift" } }),
    prisma.techStack.create({ data: { name: "Kotlin" } }),
    prisma.techStack.create({ data: { name: "Docker" } }),
    prisma.techStack.create({ data: { name: "AWS" } }),
    prisma.techStack.create({ data: { name: "Figma" } }),
  ]);

  console.log("👥 사용자 생성 중...");
  const passwordHash = await hashPassword("password123");

  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: "planner1@example.com",
        passwordHash,
        nickname: "HB_Kwon",
        role: UserRole.PLANNER,
        primaryLanguage: Language.KO,
        bio: "기획자입니다. 좋은 프로젝트를 만들어보고 싶어요!",
        githubUsername: "hbkwon",
        githubUrl: "https://github.com/hbkwon",
        githubCommits: 150,
        githubRepoCount: 10,
      },
    }),
    prisma.user.create({
      data: {
        email: "dev1@example.com",
        passwordHash,
        nickname: "DevMaster",
        role: UserRole.DEV,
        primaryLanguage: Language.KO,
        bio: "풀스택 개발자입니다.",
        githubUsername: "devmaster",
        githubUrl: "https://github.com/devmaster",
        githubCommits: 500,
        githubRepoCount: 25,
      },
    }),
    prisma.user.create({
      data: {
        email: "dev2@example.com",
        passwordHash,
        nickname: "CodeNinja",
        role: UserRole.DEV,
        primaryLanguage: Language.EN,
        bio: "React와 Node.js 전문가입니다.",
        githubUsername: "codeninja",
        githubUrl: "https://github.com/codeninja",
        githubCommits: 300,
        githubRepoCount: 15,
      },
    }),
    prisma.user.create({
      data: {
        email: "design1@example.com",
        passwordHash,
        nickname: "DesignPro",
        role: UserRole.DESIGN,
        primaryLanguage: Language.KO,
        bio: "UI/UX 디자이너입니다.",
        githubUsername: "designpro",
        githubUrl: "https://github.com/designpro",
        githubCommits: 50,
        githubRepoCount: 5,
      },
    }),
    prisma.user.create({
      data: {
        email: "dev3@example.com",
        passwordHash,
        nickname: "BackendGuru",
        role: UserRole.DEV,
        primaryLanguage: Language.KO,
        bio: "백엔드 개발에 집중하고 있습니다.",
        githubUsername: "backendguru",
        githubUrl: "https://github.com/backendguru",
        githubCommits: 200,
        githubRepoCount: 12,
      },
    }),
    prisma.user.create({
      data: {
        email: "planner2@example.com",
        passwordHash,
        nickname: "ProjectManager",
        role: UserRole.PLANNER,
        primaryLanguage: Language.KO,
        bio: "프로젝트 관리 전문가입니다.",
        githubUsername: "pm",
        githubUrl: "https://github.com/pm",
        githubCommits: 80,
        githubRepoCount: 8,
      },
    }),
  ]);

  console.log("🔧 사용자 기술 스택 생성 중...");
  await Promise.all([
    prisma.userTechStack.create({
      data: {
        userId: users[0].id,
        techStackId: techStacks[0].id,
        level: TechLevel.INTERMEDIATE,
        years: 2,
      },
    }),
    prisma.userTechStack.create({
      data: {
        userId: users[1].id,
        techStackId: techStacks[0].id,
        level: TechLevel.ADVANCED,
        years: 5,
      },
    }),
    prisma.userTechStack.create({
      data: {
        userId: users[1].id,
        techStackId: techStacks[1].id,
        level: TechLevel.EXPERT,
        years: 4,
      },
    }),
    prisma.userTechStack.create({
      data: {
        userId: users[2].id,
        techStackId: techStacks[0].id,
        level: TechLevel.ADVANCED,
        years: 3,
      },
    }),
    prisma.userTechStack.create({
      data: {
        userId: users[2].id,
        techStackId: techStacks[3].id,
        level: TechLevel.ADVANCED,
        years: 3,
      },
    }),
    prisma.userTechStack.create({
      data: {
        userId: users[4].id,
        techStackId: techStacks[1].id,
        level: TechLevel.EXPERT,
        years: 6,
      },
    }),
    prisma.userTechStack.create({
      data: {
        userId: users[4].id,
        techStackId: techStacks[4].id,
        level: TechLevel.ADVANCED,
        years: 4,
      },
    }),
  ]);

  console.log("🚀 프로젝트 생성 중...");
  const projects = await Promise.all([
    prisma.project.create({
      data: {
        ownerId: users[0].id,
        originalLang: Language.KO,
        titleOriginal: "디자이너, 기획자 모집",
        summaryOriginal: "캡스톤 디자인 아이디어를 실현할 팀원을 모집합니다.",
        descriptionOriginal:
          "대학 캡스톤 디자인 프로젝트로, 혁신적인 웹 애플리케이션을 개발하려고 합니다. 디자이너와 기획자 분들을 모집하고 있으며, 함께 멋진 프로젝트를 만들어가고 싶습니다.",
        mode: ProjectMode.ONLINE,
        difficulty: Difficulty.MEDIUM,
        status: ProjectStatus.PLANNING,
        capacity: 5,
        deadline: new Date("2025-12-09"),
        likeCount: 10,
        viewCount: 150,
      },
    }),
    prisma.project.create({
      data: {
        ownerId: users[1].id,
        originalLang: Language.KO,
        titleOriginal: "풀스택 개발자 모집",
        summaryOriginal:
          "React와 NestJS를 활용한 웹 애플리케이션 개발 프로젝트입니다.",
        descriptionOriginal:
          "최신 기술 스택을 활용하여 실무에 가까운 프로젝트를 진행하려고 합니다. 프론트엔드와 백엔드 개발 경험이 있는 개발자를 모집합니다.",
        mode: ProjectMode.ONLINE,
        difficulty: Difficulty.HARD,
        status: ProjectStatus.IN_PROGRESS,
        capacity: 4,
        deadline: new Date("2025-11-30"),
        startDate: new Date("2025-10-01"),
        likeCount: 25,
        viewCount: 300,
      },
    }),
    prisma.project.create({
      data: {
        ownerId: users[3].id,
        originalLang: Language.KO,
        titleOriginal: "UI/UX 디자인 프로젝트",
        summaryOriginal: "사용자 경험을 중시하는 디자인 프로젝트입니다.",
        descriptionOriginal:
          "디자인 시스템을 구축하고 사용자 친화적인 인터페이스를 설계하는 프로젝트입니다. 디자이너와 개발자가 협업하여 진행합니다.",
        mode: ProjectMode.OFFLINE,
        difficulty: Difficulty.EASY,
        status: ProjectStatus.PLANNING,
        capacity: 3,
        deadline: new Date("2025-12-31"),
        likeCount: 5,
        viewCount: 80,
      },
    }),
  ]);

  console.log("🌐 프로젝트 다국어 데이터 생성 중...");
  for (const project of projects) {
    await Promise.all([
      prisma.projectI18n.create({
        data: {
          projectId: project.id,
          lang: Language.KO,
          title: project.titleOriginal,
          summary: project.summaryOriginal,
          description: project.descriptionOriginal,
        },
      }),
      prisma.projectI18n.create({
        data: {
          projectId: project.id,
          lang: Language.EN,
          title: `${project.titleOriginal} (EN)`,
          summary: `${project.summaryOriginal} (EN)`,
          description: `${project.descriptionOriginal} (EN)`,
        },
      }),
    ]);
  }

  console.log("💻 프로젝트 기술 스택 생성 중...");
  await Promise.all([
    prisma.projectTechStack.create({
      data: {
        projectId: projects[0].id,
        techStackId: techStacks[0].id,
      },
    }),
    prisma.projectTechStack.create({
      data: {
        projectId: projects[0].id,
        techStackId: techStacks[1].id,
      },
    }),
    prisma.projectTechStack.create({
      data: {
        projectId: projects[1].id,
        techStackId: techStacks[0].id,
      },
    }),
    prisma.projectTechStack.create({
      data: {
        projectId: projects[1].id,
        techStackId: techStacks[1].id,
      },
    }),
    prisma.projectTechStack.create({
      data: {
        projectId: projects[1].id,
        techStackId: techStacks[2].id,
      },
    }),
    prisma.projectTechStack.create({
      data: {
        projectId: projects[2].id,
        techStackId: techStacks[14].id,
      },
    }),
  ]);

  console.log("👔 프로젝트 포지션 필요 생성 중...");
  await Promise.all([
    prisma.projectPositionNeed.create({
      data: {
        projectId: projects[0].id,
        position: PositionType.DEV,
        headcount: 2,
      },
    }),
    prisma.projectPositionNeed.create({
      data: {
        projectId: projects[0].id,
        position: PositionType.DESIGN,
        headcount: 1,
      },
    }),
    prisma.projectPositionNeed.create({
      data: {
        projectId: projects[1].id,
        position: PositionType.DEV,
        headcount: 2,
      },
    }),
    prisma.projectPositionNeed.create({
      data: {
        projectId: projects[2].id,
        position: PositionType.DESIGN,
        headcount: 1,
      },
    }),
  ]);

  console.log("👨‍👩‍👧‍👦 프로젝트 멤버 생성 중...");
  await Promise.all([
    prisma.projectMember.create({
      data: {
        projectId: projects[1].id,
        userId: users[2].id,
        roleInProject: "Frontend Developer",
      },
    }),
    prisma.projectMember.create({
      data: {
        projectId: projects[1].id,
        userId: users[4].id,
        roleInProject: "Backend Developer",
      },
    }),
  ]);

  console.log("📨 초대 생성 중...");
  await Promise.all([
    prisma.invitation.create({
      data: {
        projectId: projects[0].id,
        inviterId: users[0].id,
        inviteeId: users[2].id,
        status: InviteStatus.PENDING,
        message: "프로젝트에 참여해주세요!",
      },
    }),
    prisma.invitation.create({
      data: {
        projectId: projects[0].id,
        inviterId: users[0].id,
        inviteeId: users[3].id,
        status: InviteStatus.ACCEPTED,
        message: "디자이너로 참여해주세요!",
      },
    }),
  ]);

  console.log("📝 지원서 생성 중...");
  await Promise.all([
    prisma.application.create({
      data: {
        projectId: projects[0].id,
        applicantId: users[4].id,
        status: ApplicationStatus.PENDING,
      },
    }),
    prisma.application.create({
      data: {
        projectId: projects[2].id,
        applicantId: users[2].id,
        status: ApplicationStatus.ACCEPTED,
      },
    }),
  ]);

  console.log("💬 채팅방 생성 중...");
  const chatRooms = await Promise.all(
    projects.map((project) =>
      prisma.chatRoom.create({
        data: {
          type: ChatRoomType.PROJECT_GROUP,
          projectId: project.id,
        },
      })
    )
  );

  console.log("👥 채팅방 멤버 생성 중...");
  await Promise.all([
    prisma.chatRoomMember.create({
      data: {
        roomId: chatRooms[0].id,
        userId: users[0].id,
      },
    }),
    prisma.chatRoomMember.create({
      data: {
        roomId: chatRooms[1].id,
        userId: users[1].id,
      },
    }),
    prisma.chatRoomMember.create({
      data: {
        roomId: chatRooms[1].id,
        userId: users[2].id,
      },
    }),
    prisma.chatRoomMember.create({
      data: {
        roomId: chatRooms[1].id,
        userId: users[4].id,
      },
    }),
  ]);

  console.log("💬 채팅 메시지 생성 중...");
  const chatMessages = await Promise.all([
    prisma.chatMessage.create({
      data: {
        roomId: chatRooms[1].id,
        senderId: users[1].id,
        originalText: "안녕하세요! 프로젝트에 오신 것을 환영합니다.",
        originalLang: Language.KO,
      },
    }),
    prisma.chatMessage.create({
      data: {
        roomId: chatRooms[1].id,
        senderId: users[2].id,
        originalText: "네, 반갑습니다! 잘 부탁드립니다.",
        originalLang: Language.KO,
      },
    }),
    prisma.chatMessage.create({
      data: {
        roomId: chatRooms[1].id,
        senderId: users[4].id,
        originalText: "프로젝트 일정은 언제부터 시작하나요?",
        originalLang: Language.KO,
      },
    }),
  ]);

  console.log("🌐 채팅 메시지 번역 생성 중...");
  for (const message of chatMessages) {
    await prisma.chatMessageI18n.create({
      data: {
        messageId: message.id,
        targetLang: Language.EN,
        translatedText: `[EN Translation] ${message.originalText}`,
      },
    });
  }

  console.log("📋 칸반 보드 생성 중...");
  const kanbanBoards = await Promise.all(
    projects.map((project) =>
      prisma.kanbanBoard.create({
        data: {
          projectId: project.id,
        },
      })
    )
  );

  console.log("📊 칸반 컬럼 생성 중...");
  const columns = await Promise.all([
    prisma.kanbanColumn.create({
      data: {
        boardId: kanbanBoards[0].id,
        title: "할 일",
        position: 0,
      },
    }),
    prisma.kanbanColumn.create({
      data: {
        boardId: kanbanBoards[0].id,
        title: "진행 중",
        position: 1,
      },
    }),
    prisma.kanbanColumn.create({
      data: {
        boardId: kanbanBoards[0].id,
        title: "완료",
        position: 2,
      },
    }),
    prisma.kanbanColumn.create({
      data: {
        boardId: kanbanBoards[1].id,
        title: "TODO",
        position: 0,
      },
    }),
    prisma.kanbanColumn.create({
      data: {
        boardId: kanbanBoards[1].id,
        title: "IN PROGRESS",
        position: 1,
      },
    }),
    prisma.kanbanColumn.create({
      data: {
        boardId: kanbanBoards[1].id,
        title: "DONE",
        position: 2,
      },
    }),
  ]);

  console.log("📝 칸반 카드 생성 중...");
  const cards = await Promise.all([
    prisma.kanbanCard.create({
      data: {
        columnId: columns[0].id,
        title: "프로젝트 기획서 작성",
        description: "프로젝트의 목표와 범위를 정의합니다.",
        status: KanbanCardStatus.TODO,
        position: 0,
      },
    }),
    prisma.kanbanCard.create({
      data: {
        columnId: columns[1].id,
        title: "UI 디자인 작업",
        description: "메인 화면 디자인을 진행합니다.",
        status: KanbanCardStatus.IN_PROGRESS,
        position: 0,
      },
    }),
    prisma.kanbanCard.create({
      data: {
        columnId: columns[3].id,
        title: "API 설계",
        description: "RESTful API 엔드포인트를 설계합니다.",
        status: KanbanCardStatus.TODO,
        position: 0,
      },
    }),
    prisma.kanbanCard.create({
      data: {
        columnId: columns[4].id,
        title: "인증 시스템 구현",
        description: "JWT 기반 인증을 구현합니다.",
        status: KanbanCardStatus.IN_PROGRESS,
        position: 0,
      },
    }),
  ]);

  console.log("👤 칸반 카드 담당자 생성 중...");
  await Promise.all([
    prisma.kanbanCardAssignee.create({
      data: {
        cardId: cards[0].id,
        userId: users[0].id,
      },
    }),
    prisma.kanbanCardAssignee.create({
      data: {
        cardId: cards[1].id,
        userId: users[3].id,
      },
    }),
    prisma.kanbanCardAssignee.create({
      data: {
        cardId: cards[2].id,
        userId: users[1].id,
      },
    }),
    prisma.kanbanCardAssignee.create({
      data: {
        cardId: cards[3].id,
        userId: users[4].id,
      },
    }),
  ]);

  console.log("🏅 배지 생성 중...");
  const badges = await Promise.all([
    prisma.badge.create({
      data: {
        code: "GOOD_COMMUNICATION",
        name: "소통왕",
      },
    }),
    prisma.badge.create({
      data: {
        code: "TEAM_PLAYER",
        name: "팀플레이어",
      },
    }),
    prisma.badge.create({
      data: {
        code: "HARD_WORKER",
        name: "성실한 개발자",
      },
    }),
  ]);

  console.log("👤 사용자 배지 생성 중...");
  await Promise.all([
    prisma.userBadge.create({
      data: {
        userId: users[1].id,
        badgeId: badges[0].id,
        reason: "프로젝트에서 활발한 소통을 보여주셨습니다.",
      },
    }),
    prisma.userBadge.create({
      data: {
        userId: users[2].id,
        badgeId: badges[1].id,
        reason: "팀워크가 뛰어난 멤버입니다.",
      },
    }),
  ]);

  console.log("🔔 알림 생성 중...");
  const invitation = await prisma.invitation.findFirst({
    where: { inviteeId: users[2].id },
  });

  const notifications = await Promise.all([
    prisma.notification.create({
      data: {
        userId: users[2].id,
        invitationId: invitation?.id,
        type: "INVITE",
        isRead: false,
        originalLang: Language.KO,
        titleOriginal: "프로젝트 초대",
        bodyOriginal: `${users[0].nickname}님이 프로젝트에 초대했습니다.`,
      },
    }),
    prisma.notification.create({
      data: {
        userId: users[4].id,
        type: "APPLICATION_STATUS",
        isRead: true,
        originalLang: Language.KO,
        titleOriginal: "지원 상태 업데이트",
        bodyOriginal: "지원하신 프로젝트의 상태가 업데이트되었습니다.",
      },
    }),
  ]);

  console.log("🌐 알림 번역 생성 중...");
  for (const notification of notifications) {
    await prisma.notificationI18n.create({
      data: {
        notificationId: notification.id,
        lang: Language.EN,
        title: `[EN] ${notification.titleOriginal}`,
        body: `[EN] ${notification.bodyOriginal}`,
      },
    });
  }

  console.log("✅ 시드 데이터 생성이 완료되었습니다!");
  console.log(`📊 생성된 데이터:`);
  console.log(`   - 사용자: ${users.length}명`);
  console.log(`   - 기술 스택: ${techStacks.length}개`);
  console.log(`   - 프로젝트: ${projects.length}개`);
  console.log(`   - 채팅방: ${chatRooms.length}개`);
  console.log(`   - 칸반 보드: ${kanbanBoards.length}개`);
}

main()
  .catch((e) => {
    console.error("❌ 시드 데이터 생성 중 오류 발생:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
