import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getUserScope, getProfileByUserId } from "../clients/profile";
import { getUserIdentity } from "../clients/auth";
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
  endAt: z.string().datetime().optional(),
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
  mentorId: z.string().optional(),
  mentorName: z.string().optional(),
  rejectionReason: z.string().optional(),
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

async function createApprovalFlow(req: any, eventId: string, collegeId: string, department: string) {
  try {
    // Find department admin for assignment
    const deptAdmin = await findDepartmentAdmin(req, collegeId, department);
    
    await prisma.eventApprovalFlow.create({
      data: {
        eventId,
        assignedTo: deptAdmin?.id,
        assignedToName: deptAdmin?.displayName,
      },
    });

    // TODO: Send real-time notification to dept admin
    console.log(`Event ${eventId} assigned to dept admin: ${deptAdmin?.displayName || 'None found'}`);
  } catch (error) {
    console.error('Failed to create approval flow:', error);
  }
}

async function findDepartmentAdmin(req: any, collegeId: string, department: string) {
  try {
    const auth = req.headers["authorization"] as string | undefined;
    if (!auth) return null;

    // Call auth service to find dept admin for this college/department
    const res = await fetch(`${env.AUTH_BASE_URL}/v1/users/search?role=DEPT_ADMIN&collegeId=${encodeURIComponent(collegeId)}&department=${encodeURIComponent(department)}`, {
      headers: { Authorization: auth },
    });

    if (!res.ok) return null;
    
    const data = await res.json();
    const admins = data?.users || [];
    
    // Return first available dept admin
    return admins.length > 0 ? admins[0] : null;
  } catch (error) {
    console.error('Failed to find department admin:', error);
    return null;
  }
}

async function checkEscalation(eventId: string) {
  const flow = await prisma.eventApprovalFlow.findUnique({
    where: { eventId },
    include: { event: true },
  });

  if (!flow || flow.isEscalated || flow.approvedAt || flow.rejectedAt) {
    return; // Already processed or escalated
  }

  // Get escalation policy
  const policy = await prisma.escalationPolicy.findUnique({
    where: { collegeId: flow.event.collegeId },
  });

  const escalationHours = policy?.escalationDelayHours || 72;
  const escalationTime = new Date(flow.submittedAt.getTime() + escalationHours * 60 * 60 * 1000);

  if (new Date() >= escalationTime) {
    // Time to escalate
    await escalateEvent(eventId, policy);
  }
}

async function escalateEvent(eventId: string, policy: any) {
  try {
    const flow = await prisma.eventApprovalFlow.findUnique({
      where: { eventId },
      include: { event: true },
    });

    if (!flow) return;

    let escalatedTo = null;
    let escalatedToName = null;

    // Try backup approvers first
    if (policy?.backupApprovers?.length > 0) {
      // TODO: Check if backup approvers are available
      escalatedTo = policy.backupApprovers[0];
    }

    // If no backup or auto-escalate to head admin
    if (!escalatedTo && policy?.autoEscalateToHead) {
      // Find head admin for this college
      const headAdmin = await findHeadAdmin(flow.event.collegeId);
      escalatedTo = headAdmin?.id;
      escalatedToName = headAdmin?.displayName;
    }

    if (escalatedTo) {
      await (prisma as any).eventApprovalFlow.update({
        where: { eventId },
        data: {
          isEscalated: true,
          escalatedAt: new Date(),
          escalatedTo,
          escalatedToName,
          assignedTo: escalatedTo,
          assignedToName: escalatedToName,
        },
      });

      console.log(`Event ${eventId} escalated to: ${escalatedToName || escalatedTo}`);
      // TODO: Send real-time notification
    }
  } catch (error) {
    console.error('Failed to escalate event:', error);
  }
}

async function findHeadAdmin(collegeId: string): Promise<{ id: string; displayName: string } | null> {
  try {
    // TODO: Implement auth service integration to find HEAD_ADMIN for the college
    // This should call auth service API to find users with HEAD_ADMIN role for the collegeId
    // For now, return null until auth service user search is implemented
    console.warn(`findHeadAdmin not implemented for collegeId: ${collegeId}`);
    return null;
  } catch (error) {
    console.error('Failed to find head admin:', error);
    return null;
  }
}

async function ensureStudentEligibility(req: any, payload: AccessTokenPayload) {
  if (!hasRole(payload, "STUDENT")) return { canCreate: true, missing: [] as string[] };
  
  try {
    // Use the new badge eligibility endpoint from profile service
    const auth = req.headers["authorization"] as string | undefined;
    if (!auth) throw new Error("Missing Authorization header");

    const res = await fetch(`${env.PROFILE_BASE_URL}/v1/badges/eligibility/${encodeURIComponent(payload.sub)}`, {
      headers: { Authorization: auth },
    });

    if (!res.ok) {
      console.error(`Badge eligibility check failed: ${res.status}`);
      return { canCreate: false, missing: ["Badge eligibility check failed"] };
    }

    const data = await res.json();
    return { 
      canCreate: data.canCreate || false, 
      missing: data.canCreate ? [] : [`Need ${data.requiredBadges || 8} badges across ${data.requiredCategories || 4} categories`]
    };
  } catch (error) {
    console.error('Badge eligibility check error:', error);
    return { canCreate: false, missing: ["Badge eligibility check failed"] };
  }
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
          where: { userId: payload.sub, eventId: { in: items.map((i: { id: any; }) => i.id) } },
          select: { eventId: true },
        })
      ).map((r: { eventId: any; }) => r.eventId)
    );

    const augmented = items.map((e: { id: unknown; }) => ({
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
    const identity = await getUserIdentity(req, payload.sub);
    if (!identity) {
      return reply.code(404).send({ message: "User not found" });
    }
    const body = createEventSchema.parse((req as any).body);

    const startAt = new Date(body.startAt);
    if (!(startAt instanceof Date) || isNaN(startAt.getTime())) {
      return reply.code(400).send({ message: "Invalid startAt" });
    }
    
    let endAt = startAt; // Default to same day if not provided
    if (body.endAt) {
      endAt = new Date(body.endAt);
      if (!(endAt instanceof Date) || isNaN(endAt.getTime())) {
        return reply.code(400).send({ message: "Invalid endAt" });
      }
      if (endAt < startAt) return reply.code(400).send({ message: "endAt must be after or equal to startAt" });
    }

    if (body.mode !== "ONSITE" && !body.meetingUrl) {
      return reply.code(400).send({ message: "meetingUrl is required for ONLINE/HYBRID" });
    }
    if (body.mode !== "ONLINE" && !body.location) {
      return reply.code(400).send({ message: "location is required for ONSITE/HYBRID" });
    }

    const isStudent = identity.roles.includes("STUDENT");
    if (isStudent) {
      const { canCreate, missing } = await ensureStudentEligibility(req, payload);
      if (!canCreate) return reply.code(403).send({ message: "Missing required badges", missingBadges: missing });
    }

    const moderationStatus = isStudent ? "PENDING_REVIEW" : "APPROVED";

    const created = await prisma.event.create({
      data: {
        collegeId: identity.collegeId,
        authorId: identity.id,
        authorName: identity.displayName,
        authorRole: isStudent ? "STUDENT" : (identity.roles[0] || "UNKNOWN"),
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

    // Create approval flow for student events
    if (isStudent) {
      await createApprovalFlow(req, created.id, identity.collegeId, identity.department);
    }

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
    if (updateData.startAt && updateData.endAt && updateData.endAt < updateData.startAt) return reply.code(400).send({ message: "endAt must be after or equal to startAt" });
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
      // Update event status
      const updated = await prisma.event.update({ 
        where: { id }, 
        data: { 
          moderationStatus: "APPROVED",
          monitorId: body.mentorId,
          monitorName: body.mentorName,
        } 
      });

      // Update approval flow
      try {
        await prisma.eventApprovalFlow.update({
          where: { eventId: id },
          data: {
            approvedAt: new Date(),
            approvedBy: payload.sub,
            approvedByName: payload.displayName || "",
            mentorAssigned: body.mentorId,
            mentorName: body.mentorName,
          },
        });
      } catch (error) {
        console.error('Failed to update approval flow:', error);
      }

      const [count, myReg] = await Promise.all([
        prisma.eventRegistration.count({ where: { eventId: updated.id } }),
        prisma.eventRegistration.findFirst({ where: { eventId: updated.id, userId: payload.sub } }),
      ]);
      
      // TODO: Send real-time notification to student and mentor
      return reply.send({ event: { ...updated, registrationCount: count, isRegistered: !!myReg } });
    }
    
    if (body.action === "REJECT") {
      const updated = await prisma.event.update({ 
        where: { id }, 
        data: { moderationStatus: "REJECTED" } 
      });

      // Update approval flow
      try {
        await prisma.eventApprovalFlow.update({
          where: { eventId: id },
          data: {
            rejectedAt: new Date(),
            rejectedBy: payload.sub,
            rejectedByName: payload.displayName || "",
            rejectionReason: body.rejectionReason,
          },
        });
      } catch (error) {
        console.error('Failed to update approval flow:', error);
      }

      const [count, myReg] = await Promise.all([
        prisma.eventRegistration.count({ where: { eventId: updated.id } }),
        prisma.eventRegistration.findFirst({ where: { eventId: updated.id, userId: payload.sub } }),
      ]);
      
      // TODO: Send real-time notification to student
      return reply.send({ event: { ...updated, registrationCount: count, isRegistered: !!myReg } });
    }

    if (body.action === "ASSIGN") {
      // Update approval flow assignment
      try {
        await prisma.eventApprovalFlow.update({
          where: { eventId: id },
          data: {
            assignedTo: body.monitorId,
            assignedToName: body.monitorName,
          },
        });
      } catch (error) {
        console.error('Failed to reassign approval:', error);
      }

      // TODO: Send real-time notification to new assignee
      return reply.send({ success: true, message: "Event reassigned successfully" });
    }

    return reply.code(400).send({ message: "Invalid action" });
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
    const headers = ["studentName", "collegeMemberId", "department", "year"] as const;

    const rows = await Promise.all(regs.map(async (r: { userId: string; joinedAt: { toISOString: () => any; }; }) => {
      try {
        // Use the enhanced profile endpoint that combines auth + profile data
        const auth = req.headers["authorization"] as string | undefined;
        const profileRes = await fetch(`${env.PROFILE_BASE_URL}/v1/profile/user/${encodeURIComponent(r.userId)}`, {
          headers: { Authorization: auth || "" },
        });
        
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          const profile = profileData.profile;
          return {
            studentName: profile?.displayName ?? "Unknown",
            collegeMemberId: profile?.collegeMemberId ?? "",
            department: profile?.department ?? "",
            year: profile?.year?.toString() ?? "",
          } as const;
        } else {
          // Fallback to separate calls
          const userIdentity = await getUserIdentity(req, r.userId);
          const profile = await getProfileByUserId(req, r.userId);
          return {
            studentName: userIdentity?.displayName ?? "Unknown",
            collegeMemberId: profile?.collegeMemberId ?? "",
            department: userIdentity?.department ?? profile?.department ?? "",
            year: profile?.year?.toString() ?? "",
          } as const;
        }
      } catch (error) {
        console.error(`Failed to get profile for user ${r.userId}:`, error);
        return {
          studentName: "Unknown",
          collegeMemberId: "",
          department: "",
          year: "",
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
      ...rows.map((row: any) => headers.map((h) => csvEscape((row as any)[h])).join(",")),
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
          where: { userId: payload.sub, eventId: { in: items.map((i: { id: any; }) => i.id) } },
          select: { eventId: true },
        })
      ).map((r: { eventId: any; }) => r.eventId)
    );
    const augmented = items.map((e: { id: unknown; }) => ({
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
