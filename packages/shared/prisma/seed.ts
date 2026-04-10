import { PrismaClient, Role } from '../client/index.js';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.warn('Seeding database...');

  const adminPassword = await bcrypt.hash('admin123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@adlogs.local' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@adlogs.local',
      passwordHash: adminPassword,
      role: Role.SUPER_ADMIN,
      active: true,
    },
  });

  console.warn(`Usuário admin criado: ${admin.email}`);
  console.warn('Seed concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
