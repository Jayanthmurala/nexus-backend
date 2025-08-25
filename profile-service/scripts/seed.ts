import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const colleges = [
    { name: 'Vishnu Institution of Technology' },
  ];

  for (const c of colleges) {
    const rec = await prisma.college.upsert({
      where: { name: c.name },
      update: {},
      create: { name: c.name },
    });
    console.log(`Ensured college: ${rec.name} (${rec.id})`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
