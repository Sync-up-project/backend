import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { AccountRole, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  const nickname = process.env.ADMIN_NICKNAME?.trim() || 'SyncUp Admin';

  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (!email) throw new Error('ADMIN_EMAIL is required');
  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      nickname,
      accountRole: AccountRole.ADMIN,
    },
    create: {
      email,
      passwordHash,
      nickname,
      accountRole: AccountRole.ADMIN,
    },
    select: {
      id: true,
      email: true,
      nickname: true,
      accountRole: true,
    },
  });

  await prisma.$disconnect();

  console.log(
    `Admin account is ready: ${user.email} (${user.accountRole}, id=${user.id})`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
