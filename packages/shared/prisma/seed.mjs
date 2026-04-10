import { PrismaClient } from '../client/index.js';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash('admin123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@adlogs.local' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@adlogs.local',
      passwordHash: adminPassword,
      role: 'SUPER_ADMIN',
      active: true,
    },
  });

  console.log(`Usuario admin criado: ${admin.email}`);
  console.log('Seed concluido.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
