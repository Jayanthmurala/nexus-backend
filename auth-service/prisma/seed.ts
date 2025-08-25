/// <reference types="node" />
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const displayName = process.env.ADMIN_DISPLAY_NAME || "Head Admin";

  if (!email || !password) {
    console.log("[seed] Skipping admin seed: ADMIN_EMAIL or ADMIN_PASSWORD not set");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] Admin user already exists: ${email}`);
    return;
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const user = await prisma.user.create({
    data: {
      email,
      displayName,
      passwordHash,
      emailVerifiedAt: new Date(),
      status: "ACTIVE",
      roles: ["HEAD_ADMIN"],
      preferences: { create: {} },
    },
  });

  console.log(`[seed] Created admin user ${user.email} (${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
