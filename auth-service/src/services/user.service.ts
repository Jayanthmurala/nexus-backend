import { Prisma, Role, UserStatus } from "@prisma/client";
import { prisma } from "../db";

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export async function createUser(input: { email: string; passwordHash?: string | null; displayName: string; avatarUrl?: string | null; roles?: Role[]; status?: UserStatus; }) {
  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash: input.passwordHash ?? null,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl ?? null,
      roles: input.roles ?? [Role.STUDENT],
      status: input.status ?? UserStatus.PENDING_VERIFICATION,
    },
  });
}

export async function markLogin(userId: string) {
  return prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
}

export async function incrementTokenVersion(userId: string) {
  return prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
}
