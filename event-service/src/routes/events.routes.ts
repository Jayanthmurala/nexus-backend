import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getUserScope, getBadgeDefinitions, getMyBadgeAwards, getProfileByUserId } from "../clients/profile";
import type { AccessTokenPayload } from "../utils/jwt";
import { env } from "../config/env";
import { Prisma } from "@prisma/client";

const EventType = z.enum(["WORKSHOP", "SEMINAR", "HACKATHON", "MEETUP"]);
const EventMode = z.enum(["ONLINE", "ONSITE", "HYBRID"]);
const ModerationStatus = z.enum(["PENDING_REVIEW", "APPROVED", "REJECTED"]);

const createEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  type: EventType,
  mode: EventMode,
  location: z.string().optional(),
  meetingUrl: z.string().url().optional(),
  capacity: z.number().int().positive().optional(),
  visibleToAllDepts: z.boolean().default(true),
  departments: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

const updateEventSchema = createEventSchema.partial();

const moderateSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "ASSIGN"]),
  monitorId: z.string().optional(),
  monitorName: z.string().optional(),
});

const listQuerySchema = z.object({
  q: z.string().optional(),
  department: z.string().optional(),
  type: EventType.optional(),
  mode: EventMode.optional(),
  status: ModerationStatus.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  upcomingOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function hasRole(payload: AccessTokenPayload, role: string) {
  return (payload.roles || []).includes(role);
}

async function ensureStudentEligibility(req: any, payload: AccessTokenPayload) {
  if (!hasRole(payload, "STUDENT")) return { canCreate: true, missing: [] as string[] };
  // Fetch badge definitions and my awards, match by name
  const [defs, awards] = await Promise.all([
    getBadgeDefinitions(req),
    getMyBadgeAwards(req, payload),
  ]);
  const defById = new Map(defs.map((d) => [d.id, d]));
  const myBadgeNames = new Set(
    awards
      .map((a) => defById.get(a.badgeId)?.name?.trim().toLowerCase())
      .filter((v): v is string => !!v)
  );
  const required = env.EVENT_REQUIRED_BADGE_NAMES.map((n: string) => n.toLowerCase());
  const missing = required.filter((r: string) => !myBadgeNames.has(r));
  return { canCreate: missing.length === 0, missing };
}

export default async function eventsRoutes(app: FastifyInstance) {
  // List events
  app.get("/v1/events", {
    schema: { tags: ["events"], querystring: listQuerySchema, response: { 200: z.any() } },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const scope = await getUserScope(req, payload);
    const q = listQuerySchema.parse((req as any).query);

    const now = new Date();

    const where: any = {
      collegeId: scope.collegeId,
    };

    const isStudent = hasRole(payload, "STUDENT");
    if (isStudent) {
      where.moderationStatus = "APPROVED";
      where.OR = [
        { visibleToAllDepts: true },
        { departments: { has: scope.department } },
      ];
    } else {
      if (q.status) where.moderationStatus = q.status;
    }

    if (q.q) {
      where.OR = [
        ...(where.OR || []),
        { title: { contains: q.q, mode: "insensitive" } },
        { description: { contains: q.q, mode: "insensitive" } },
      ];
    }
    if (q.type) where.type = q.type;
    if (q.mode) where.mode = q.mode;
    if (q.department) {
      where.OR = [
        ...(where.OR || []),
        { visibleToAllDepts: true },
        { departments: { has: q.department } },
      ];
    }
    if (q.from || q.to || q.upcomingOnly) {
      where.startAt = {} as any;
      if (q.from) (where.startAt as any).gte = new Date(q.from);
      if (q.to) (where.startAt as any).lte = new Date(q.to);
      if (q.upcomingOnly) (where.startAt as any).gte = now;
    }

    const skip = (q.page - 1) * q.limit;
    const [items, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: { startAt: "asc" },
        skip,
        take: q.limit,
        include: { _count: { select: { registrations: true } } },
      }),
      prisma.event.count({ where }),
    ]);

    // Compute isRegistered set for current user for these events in a single query
    const regSet = new Set(
      (
        await prisma.eventRegistration.findMany({
          where: { userId: payload.sub, eventId: { in: items.map((i) => i.id) } },
          select: { eventId: true },
        })
      ).map((r) => r.eventId)
    );

    const augmented = items.map((e) => ({
      ...e,
      registrationCount: (e as any)._count?.registrations ?? 0,
      isRegistered: regSet.has(e.id),
    }));

    return reply.send({ events: augmented, total, page: q.page, limit: q.limit });
  });

  // Get event by id with visibility rules
  app.get("/v1/events/:id", {
    schema: { tags: ["events"], params: z.object({ id: z.string() }), response: { 200: z.any() } },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const scope = await getUserScope(req, payload);
    const { id } = (req.params as any) as { id: string };

    const ev = await prisma.event.findFirst({ where: { id, collegeId: scope.collegeId } });
    if (!ev) return reply.code(404).send({ message: "Not found" });

    const isStudent = hasRole(payload, "STUDENT");
    if (isStudent) {
      const visible = ev.moderationStatus === "APPROVED" && (ev.visibleToAllDepts || (ev.departments || []).includes(scope.department));
      if (!visible) return reply.code(404).send({ message: "Not found" });
    }
    // Attach registrationCount and isRegistered
    const [count, myReg] = await Promise.all([
      prisma.eventRegistration.count({ where: { eventId: ev.id } }),
      prisma.eventRegistration.findFirst({ where: { eventId: ev.id, userId: payload.sub } }),
    ]);

    return reply.send({ event: { ...ev, registrationCount: count, isRegistered: !!myReg } });
  });

  // Create event (students need all required badges; faculty/admin auto-approved)
  app.post("/v1/events", {
    schema: { tags: ["events"], body: createEventSchema, response: { 200: z.any() } },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const scope = await getUserScope(req, payload);
    const body = createEventSchema.parse((req as any).body);

    const startAt = new Date(body.startAt);
    const endAt = new Date(body.endAt);
    if (!(startAt instanceof Date) || !(endAt instanceof Date) || isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      return reply.code(400).send({ message: "Invalid startAt or endAt" });
    }
    if (endAt <= startAt) return reply.code(400).send({ message: "endAt must be after startAt" });

    if (body.mode !== "ONSITE" && !body.meetingUrl) {
      return reply.code(400).send({ message: "meetingUrl is required for ONLINE/HYBRID" });
    }
    if (body.mode !== "ONLINE" && !body.location) {
      return reply.code(400).send({ message: "location is required for ONSITE/HYBRID" });
    }

    const isStudent = hasRole(payload, "STUDENT");
    if (isStudent) {
      const { canCreate, missing } = await ensureStudentEligibility(req, payload);
      if (!canCreate) return reply.code(403).send({ message: "Missing required badges", missingBadges: missing });
    }

    const moderationStatus = isStudent ? "PENDING_REVIEW" : "APPROVED";

    const created = await prisma.event.create({
      data: {
        collegeId: scope.collegeId,
        authorId: payload.sub,
        authorName: payload.name || (payload as any).displayName || "",
        authorRole: isStudent ? "STUDENT" : ((payload.roles || [])[0] || "UNKNOWN"),
        title: body.title,
        description: body.description,
        startAt,
        endAt,
        type: body.type,
        mode: body.mode,
        location: body.location,
        meetingUrl: body.meetingUrl,
        capacity: body.capacity,
        visibleToAllDepts: body.visibleToAllDepts,
        departments: body.visibleToAllDepts ? [] : (body.departments || []),
        tags: body.tags || [],
        moderationStatus,
      },
    });

    return reply.send({ event: { ...created, registrationCount: 0, isRegistered: false } });
  });

  // Update event
  app.put("/v1/events/:id", {
    schema: { tags: ["events"], params: z.object({ id: z.string() }), body: updateEventSchema, response: { 200: z.any() } },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const scope = await getUserScope(req, payload);
    const { id } = (req.params as any) as { id: string };
    const body = updateEventSchema.parse((req as any).body);

    const ev = await prisma.event.findFirst({ where: { id, collegeId: scope.collegeId } });
    if (!ev) return reply.code(404).send({ message: "Not found" });

    const isStudent = hasRole(payload, "STUDENT");
    const isOwner = ev.authorId === payload.sub;
    const canStudentEdit = isStudent && isOwner && ev.moderationStatus === "PENDING_REVIEW";

    if (!canStudentEdit) {
      // Faculty, Dept Admin, Head Admin can edit within college
      const isPrivileged = hasRole(payload, "FACULTY") || hasRole(payload, "DEPT_ADMIN") || hasRole(payload, "HEAD_ADMIN");
      if (!isPrivileged) return reply.code(403).send({ message: "Forbidden" });
    }

    const updateData: any = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.startAt !== undefined) {
      const d = new Date(body.startAt); if (isNaN(d.getTime())) return reply.code(400).send({ message: "Invalid startAt" }); updateData.startAt = d;
    }
    if (body.endAt !== undefined) {
      const d = new Date(body.endAt); if (isNaN(d.getTime())) return reply.code(400).send({ message: "Invalid endAt" }); updateData.endAt = d;
    }
    if (updateData.startAt && updateData.endAt && updateData.endAt <= updateData.startAt) return reply.code(400).send({ message: "endAt must be after startAt" });
    if (body.type !== undefined) updateData.type = body.type;
    if (body.mode !== undefined) updateData.mode = body.mode;
    if (body.location !== undefined) updateData.location = body.location;
    if (body.meetingUrl !== undefined) updateData.meetingUrl = body.meetingUrl;
    if (body.capacity !== undefined) updateData.capacity = body.capacity;
    if (body.visibleToAllDepts !== undefined) updateData.visibleToAllDepts = body.visibleToAllDepts;
    if (body.departments !== undefined) updateData.departments = (updateData.visibleToAllDepts ?? ev.visibleToAllDepts) ? [] : body.departments;
    if (body.tags !== undefined) updateData.tags = body.tags;

    const updated = await prisma.event.update({ where: { id }, data: updateData });
    const [count, myReg] = await Promise.all([
      prisma.eventRegistration.count({ where: { eventId: updated.id } }),
      prisma.eventRegistration.findFirst({ where: { eventId: updated.id, userId: payload.sub } }),
    ]);
    return reply.send({ event: { ...updated, registrationCount: count, isRegistered: !!myReg } });
  });

  // Delete event
  app.delete("/v1/events/:id", {
    schema: { tags: ["events"], params: z.object({ id: z.string() }), response: { 200: z.any() } },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const scope = await getUserScope(req, payload);
    const { id } = (req.params as any) as { id: string };

    const ev = await prisma.event.findFirst({ where: { id, collegeId: scope.collegeId } });
    if (!ev) return reply.code(404).send({ message: "Not found" });

    const isStudent = hasRole(payload, "STUDENT");
    const isOwner = ev.authorId === payload.sub;
    const canStudentDelete = isStudent && isOwner && ev.moderationStatus === "PENDING_REVIEW";

    if (!canStudentDelete) {
      const isPrivileged = hasRole(payload, "FACULTY") || hasRole(payload, "DEPT_ADMIN") || hasRole(payload, "HEAD_ADMIN");
      if (!isPrivileged) return reply.code(403).send({ message: "Forbidden" });
    }

    await prisma.event.delete({ where: { id } });
    return reply.send({ success: true });
  });

  // Moderate event (Dept Admin or Head Admin)
  app.patch("/v1/events/:id/moderate", {
    schema: { tags: ["events"], params: z.object({ id: z.string() }), body: moderateSchema, response: { 200: z.any() } },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["DEPT_ADMIN", "HEAD_ADMIN"]);
    const scope = await getUserScope(req, payload);
    const { id } = (req.params as any) as { id: string };
    const body = moderateSchema.parse((req as any).body);

    const ev = await prisma.event.findFirst({ where: { id, collegeId: scope.collegeId } });
    if (!ev) return reply.code(404).send({ message: "Not found" });

    if (body.action === "APPROVE") {
      const updated = await prisma.event.update({ where: { id }, data: { moderationStatus: "APPROVED" } });
      const [count, myReg] = await Promise.all([
        prisma.eventRegistration.count({ where: { eventId: updated.id } }),
        prisma.eventRegistration.findFirst({ where: { eventId: updated.id, userId: payload.sub } }),
      ]);
      return reply.send({ event: { ...updated, registrationCount: count, isRegistered: !!myReg } });
    }
    if (body.action === "REJECT") {
      const updated = await prisma.event.update({ where: { id }, data: { moderationStatus: "REJECTED" } });
      const [count, myReg] = await Promise.all([
        prisma.eventRegistration.count({ where: { eventId: updated.id } }),
        prisma.eventRegistration.findFirst({ where: { eventId: updated.id, userId: payload.sub } }),
      ]);
      return reply.send({ event: { ...updated, registrationCount: count, isRegistered: !!myReg } });
    }
    // ASSIGN
    if (!body.monitorId) return reply.code(400).send({ message: "monitorId is required for ASSIGN" });
    const updated = await prisma.event.update({ where: { id }, data: { monitorId: body.monitorId, monitorName: body.monitorName ?? null } });
    const [count, myReg] = await Promise.all([
      prisma.eventRegistration.count({ where: { eventId: updated.id } }),
      prisma.eventRegistration.findFirst({ where: { eventId: updated.id, userId: payload.sub } }),
    ]);
    return reply.send({ event: { ...updated, registrationCount: count, isRegistered: !!myReg } });
  });

  // Register for event (any authenticated), capacity enforced, only on APPROVED events
  app.post("/v1/events/:id/register", {
    schema: { tags: ["events"], params: z.object({ id: z.string() }), response: { 200: z.any() } },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const scope = await getUserScope(req, payload);
    const { id } = (req.params as any) as { id: string };

    const ev = await prisma.event.findFirst({ where: { id, collegeId: scope.collegeId } });
    if (!ev) return reply.code(404).send({ message: "Not found" });
    if (ev.moderationStatus !== "APPROVED") return reply.code(400).send({ message: "Event not open for registration" });

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (typeof ev.capacity === "number") {
        const regCount = await tx.eventRegistration.count({ where: { eventId: ev.id } });
        if (regCount >= ev.capacity) return { full: true as const };
      }
      try {
        const created = await tx.eventRegistration.create({ data: { eventId: ev.id, userId: payload.sub } });
        return { created } as const;
      } catch (e: any) {
        if (e?.code === "P2002") return { already: true as const };
        throw e;
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if ((result as any).full) return reply.code(400).send({ message: "Event is full" });
    if ((result as any).already) return reply.code(409).send({ message: "Already registered" });
    return reply.send({ registration: (result as any).created });
  });

  // Unregister
  app.delete("/v1/events/:id/register", {
    schema: { tags: ["events"], params: z.object({ id: z.string() }), response: { 200: z.any() } },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const scope = await getUserScope(req, payload);
    const { id } = (req.params as any) as { id: string };

    const ev = await prisma.event.findFirst({ where: { id, collegeId: scope.collegeId } });
    if (!ev) return reply.code(404).send({ message: "Not found" });

    await prisma.eventRegistration.deleteMany({ where: { eventId: ev.id, userId: payload.sub } });
    return reply.send({ success: true });
  });

  // Export registrations as CSV (FACULTY only)
  app.get("/v1/events/:id/export", {
    schema: { tags: ["events"], params: z.object({ id: z.string() }), response: { 200: z.any() } },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["FACULTY"]);
    const scope = await getUserScope(req, payload);
    const { id } = (req.params as any) as { id: string };

    const ev = await prisma.event.findFirst({ where: { id, collegeId: scope.collegeId } });
    if (!ev) return reply.code(404).send({ message: "Not found" });

    const regs = await prisma.eventRegistration.findMany({ where: { eventId: ev.id }, orderBy: { joinedAt: "asc" } });
    const headers = ["userId", "department", "year", "collegeMemberId", "joinedAt", "linkedIn", "github", "twitter", "resumeUrl", "contactInfo"] as const;

    const rows = await Promise.all(regs.map(async (r) => {
      try {
        const profile = await getProfileByUserId(req, r.userId);
        return {
          userId: r.userId,
          department: profile?.department ?? "",
          year: profile?.year ?? "",
          collegeMemberId: profile?.collegeMemberId ?? "",
          joinedAt: r.joinedAt.toISOString(),
          linkedIn: profile?.linkedIn ?? "",
          github: profile?.github ?? "",
          twitter: profile?.twitter ?? "",
          resumeUrl: profile?.resumeUrl ?? "",
          contactInfo: profile?.contactInfo ?? "",
        } as const;
      } catch {
        return {
          userId: r.userId,
          department: "",
          year: "",
          collegeMemberId: "",
          joinedAt: r.joinedAt.toISOString(),
          linkedIn: "",
          github: "",
          twitter: "",
          resumeUrl: "",
          contactInfo: "",
        } as const;
      }
    }));

    const csvEscape = (v: any) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const lines = [
      headers.join(","),
      ...rows.map((row) => headers.map((h) => csvEscape((row as any)[h])).join(",")),
    ];
    const csv = "\uFEFF" + lines.join("\n");

    reply.header("Content-Type", "text/csv; charset=utf-8");
    const safeTitle = (ev.title || "event").replace(/[^a-z0-9\-]+/gi, "_").slice(0, 50) || "event";
    reply.header("Content-Disposition", `attachment; filename="${safeTitle}_registrations.csv"`);
    return reply.send(csv);
  });

  // My events
  app.get("/v1/events/mine", {
    schema: { tags: ["events"], response: { 200: z.any() } },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const scope = await getUserScope(req, payload);

    let where: any = { collegeId: scope.collegeId };
    if (hasRole(payload, "STUDENT")) {
      where = {
        collegeId: scope.collegeId,
        OR: [
          { registrations: { some: { userId: payload.sub } } },
          { authorId: payload.sub },
        ],
      };
    } else if (hasRole(payload, "FACULTY")) {
      where = {
        collegeId: scope.collegeId,
        OR: [
          { authorId: payload.sub },
          { monitorId: payload.sub },
        ],
      };
    } else if (hasRole(payload, "DEPT_ADMIN") || hasRole(payload, "HEAD_ADMIN")) {
      // Admin portals may want all authored/monitored in college
      where = { collegeId: scope.collegeId };
    }

    const items = await prisma.event.findMany({
      where,
      orderBy: { startAt: "desc" },
      include: { _count: { select: { registrations: true } } },
    });
    const regSet = new Set(
      (
        await prisma.eventRegistration.findMany({
          where: { userId: payload.sub, eventId: { in: items.map((i) => i.id) } },
          select: { eventId: true },
        })
      ).map((r) => r.eventId)
    );
    const augmented = items.map((e) => ({
      ...e,
      registrationCount: (e as any)._count?.registrations ?? 0,
      isRegistered: regSet.has(e.id),
    }));
    return reply.send({ events: augmented });
  });

  // Eligibility (student)
  app.get("/v1/events/eligibility", {
    schema: { tags: ["events"], response: { 200: z.any() } },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const { canCreate, missing } = await ensureStudentEligibility(req, payload);
    return reply.send({ canCreate, missingBadges: missing });
  });
}
