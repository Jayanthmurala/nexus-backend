import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db";
import { verifyAccessToken } from "../utils/jwt";

const profileSchema = z.object({
  collegeId: z.string(),
  department: z.string(),
  year: z.number().int().optional(),
  skills: z.array(z.string()).optional(),
  expertise: z.array(z.string()).optional(),
  linkedIn: z.string().url().optional(),
  github: z.string().url().optional(),
  twitter: z.string().url().optional(),
  resumeUrl: z.string().url().optional(),
  bio: z.string().optional(),
  avatar: z.string().url().optional(),
  contactInfo: z.string().optional(),
  collegeMemberId: z.string().optional(),
});

const publicationSchema = z.object({
  title: z.string().min(1),
  link: z.string().url().optional(),
  year: z.number().int(),
});

const projectSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  github: z.string().url().optional(),
  demoLink: z.string().url().optional(),
  image: z.string().url().optional(),
});

// Badges
const badgeDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().optional(),
  color: z.string().optional(),
  category: z.string().optional(),
  rarity: z.enum(["common", "rare", "epic", "legendary"]),
  criteria: z.string().optional(),
});

const awardBadgeSchema = z.object({
  studentId: z.string().min(1),
  badgeId: z.string().min(1),
  reason: z.string().min(1),
  projectId: z.string().optional(),
  eventId: z.string().optional(),
});

async function requireAuth(req: any) {
  const auth = req.headers["authorization"] as string | undefined;
  if (!auth?.startsWith("Bearer ")) {
    const err: any = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
  const token = auth.slice("Bearer ".length);
  return verifyAccessToken(token);
}

function requireRole(payload: { roles?: string[] }, allowed: string[]) {
  const has = (payload.roles || []).some((r) => allowed.includes(r));
  if (!has) {
    const err: any = new Error("Forbidden");
    err.statusCode = 403;
    throw err;
  }
}

export default async function profileRoutes(app: FastifyInstance) {
  // Public: List colleges (no auth required)
  app.get("/v1/colleges", {
    schema: {
      tags: ["colleges"],
      response: { 200: z.any() },
    },
  }, async (_req: any, reply: any) => {
    const colleges = await prisma.college.findMany({ orderBy: { name: "asc" } });
    return reply.send({ colleges });
  });

  // GET my profile
  app.get("/v1/profile/me", {
    schema: {
      tags: ["profile"],
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const profile = await prisma.profile.findUnique({ where: { userId: payload.sub } });
    return reply.send({ profile });
  });

  // PUT upsert my profile
  app.put("/v1/profile/me", {
    schema: {
      tags: ["profile"],
      body: profileSchema,
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const body = profileSchema.parse((req as any).body);
    // Validate collegeId exists
    const college = await prisma.college.findUnique({ where: { id: body.collegeId } });
    if (!college) {
      return reply.code(400).send({ message: "Invalid collegeId" });
    }
    const profile = await prisma.profile.upsert({
      where: { userId: payload.sub },
      update: (body as any),
      create: ({ userId: payload.sub, ...body, skills: body.skills ?? [], expertise: (body as any).expertise ?? [] } as any),
    });
    return reply.send({ profile });
  });

  // GET a student's profile by userId (FACULTY)
  app.get("/v1/profile/:userId", {
    schema: {
      tags: ["profile"],
      params: z.object({ userId: z.string() }),
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["FACULTY"]);
    const { userId } = (req.params as any) as { userId: string };
    const profile = await prisma.profile.findUnique({ where: { userId } });
    return reply.send({ profile });
  });

  // Publications
  app.get("/v1/profile/me/publications", {
    schema: {
      tags: ["publications"],
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["FACULTY"]);
    const items = await prisma.publication.findMany({ where: { userId: payload.sub }, orderBy: { year: "desc" } });
    return reply.send({ publications: items });
  });

  app.post("/v1/profile/me/publications", {
    schema: {
      tags: ["publications"],
      body: publicationSchema,
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["FACULTY"]);
    const body = publicationSchema.parse((req as any).body);
    const created = await prisma.publication.create({ data: { userId: payload.sub, ...body } });
    return reply.send({ publication: created });
  });

  app.put("/v1/profile/me/publications/:id", {
    schema: {
      tags: ["publications"],
      params: z.object({ id: z.string() }),
      body: publicationSchema.partial(),
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["FACULTY"]);
    const { id } = (req.params as any) as { id: string };
    const body = publicationSchema.partial().parse((req as any).body);
    const existing = await prisma.publication.findFirst({ where: { id, userId: payload.sub } });
    if (!existing) return reply.code(404).send({ message: "Not found" });
    const updated = await prisma.publication.update({ where: { id }, data: body });
    return reply.send({ publication: updated });
  });

  app.delete("/v1/profile/me/publications/:id", {
    schema: {
      tags: ["publications"],
      params: z.object({ id: z.string() }),
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["FACULTY"]);
    const { id } = (req.params as any) as { id: string };
    const existing = await prisma.publication.findFirst({ where: { id, userId: payload.sub } });
    if (!existing) return reply.code(404).send({ message: "Not found" });
    await prisma.publication.delete({ where: { id } });
    return reply.send({ success: true });
  });

  // Personal Projects
  app.get("/v1/profile/me/projects", {
    schema: {
      tags: ["projects"],
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["STUDENT"]);
    const items = await prisma.personalProject.findMany({ where: { userId: payload.sub }, orderBy: { createdAt: "desc" } });
    return reply.send({ projects: items });
  });

  app.post("/v1/profile/me/projects", {
    schema: {
      tags: ["projects"],
      body: projectSchema,
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["STUDENT"]);
    const body = projectSchema.parse((req as any).body);
    const created = await prisma.personalProject.create({ data: { userId: payload.sub, ...body } });
    return reply.send({ project: created });
  });

  app.put("/v1/profile/me/projects/:id", {
    schema: {
      tags: ["projects"],
      params: z.object({ id: z.string() }),
      body: projectSchema.partial(),
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["STUDENT"]);
    const { id } = (req.params as any) as { id: string };
    const body = projectSchema.partial().parse((req as any).body);
    const existing = await prisma.personalProject.findFirst({ where: { id, userId: payload.sub } });
    if (!existing) return reply.code(404).send({ message: "Not found" });
    const updated = await prisma.personalProject.update({ where: { id }, data: body });
    return reply.send({ project: updated });
  });

  app.delete("/v1/profile/me/projects/:id", {
    schema: {
      tags: ["projects"],
      params: z.object({ id: z.string() }),
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["STUDENT"]);
    const { id } = (req.params as any) as { id: string };
    const existing = await prisma.personalProject.findFirst({ where: { id, userId: payload.sub } });
    if (!existing) return reply.code(404).send({ message: "Not found" });
    await prisma.personalProject.delete({ where: { id } });
    return reply.send({ success: true });
  });

  // Badge Definitions - list (any authenticated)
  app.get("/v1/badges/definitions", {
    schema: {
      tags: ["badges"],
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    await requireAuth(req);
    const items = await prisma.badgeDefinition.findMany({ orderBy: { name: "asc" } });
    return reply.send({ definitions: items });
  });

  // Badge Definitions - create (FACULTY)
  app.post("/v1/badges/definitions", {
    schema: {
      tags: ["badges"],
      body: badgeDefinitionSchema,
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["FACULTY"]);
    const body = badgeDefinitionSchema.parse((req as any).body);
    const created = await prisma.badgeDefinition.create({ data: { ...body, createdBy: payload.sub } });
    return reply.send({ definition: created });
  });

  // Badge Definitions - update (FACULTY)
  app.put("/v1/badges/definitions/:id", {
    schema: {
      tags: ["badges"],
      params: z.object({ id: z.string() }),
      body: badgeDefinitionSchema.partial(),
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["FACULTY"]);
    const { id } = (req.params as any) as { id: string };
    const body = badgeDefinitionSchema.partial().parse((req as any).body);
    const existing = await prisma.badgeDefinition.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Not found" });
    const updated = await prisma.badgeDefinition.update({ where: { id }, data: body });
    return reply.send({ definition: updated });
  });

  // Badge Definitions - delete (FACULTY)
  app.delete("/v1/badges/definitions/:id", {
    schema: {
      tags: ["badges"],
      params: z.object({ id: z.string() }),
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["FACULTY"]);
    const { id } = (req.params as any) as { id: string };
    const count = await prisma.studentBadge.count({ where: { badgeId: id } });
    if (count > 0) return reply.code(400).send({ message: "Cannot delete a badge that has awards" });
    await prisma.badgeDefinition.delete({ where: { id } });
    return reply.send({ success: true });
  });

  // Award a badge (FACULTY)
  app.post("/v1/badges/awards", {
    schema: {
      tags: ["badges"],
      body: awardBadgeSchema,
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["FACULTY"]);
    const body = awardBadgeSchema.parse((req as any).body);
    const badge = await prisma.badgeDefinition.findUnique({ where: { id: body.badgeId } });
    if (!badge) return reply.code(400).send({ message: "Invalid badgeId" });
    const student = await prisma.profile.findUnique({ where: { userId: body.studentId } });
    if (!student) return reply.code(400).send({ message: "Invalid studentId" });
    const created = await prisma.studentBadge.create({
      data: {
        studentId: body.studentId,
        badgeId: body.badgeId,
        reason: body.reason,
        projectId: body.projectId,
        eventId: body.eventId,
        awardedBy: payload.sub,
        awardedByName: payload.name || null,
      },
    });
    return reply.send({ award: created });
  });

  // Get awards for a student (students can view their own; faculty can view any by studentId)
  app.get("/v1/badges/awards", {
    schema: {
      tags: ["badges"],
      querystring: z.object({ studentId: z.string().optional() }),
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const { studentId } = (req.query as any) as { studentId?: string };
    let targetId = payload.sub;
    if (studentId && studentId !== payload.sub) {
      requireRole(payload, ["FACULTY"]);
      targetId = studentId;
    }
    const awards = await prisma.studentBadge.findMany({ where: { studentId: targetId }, orderBy: { awardedAt: "desc" } });
    return reply.send({ awards });
  });

  // Recent awards (FACULTY)
  app.get("/v1/badges/awards/recent", {
    schema: {
      tags: ["badges"],
      querystring: z.object({ limit: z.string().optional() }),
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["FACULTY"]);
    const { limit } = (req.query as any) as { limit?: string };
    const take = Math.min(Math.max(parseInt(limit || "10", 10) || 10, 1), 50);
    const awards = await prisma.studentBadge.findMany({ orderBy: { awardedAt: "desc" }, take });
    return reply.send({ awards });
  });

  // Award counts per badge (FACULTY)
  app.get("/v1/badges/stats/award-counts", {
    schema: {
      tags: ["badges"],
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["FACULTY"]);
    const grouped = await prisma.studentBadge.groupBy({
      by: ["badgeId"],
      _count: { badgeId: true },
    });
    const counts = Object.fromEntries(grouped.map((g) => [g.badgeId, (g as any)._count.badgeId as number]));
    return reply.send({ counts });
  });
}
