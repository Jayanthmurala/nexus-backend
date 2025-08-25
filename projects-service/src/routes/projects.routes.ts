import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { createProjectSchema, updateProjectSchema, applyProjectSchema, updateApplicationStatusSchema, createTaskSchema, updateTaskSchema, createAttachmentSchema } from "../schemas/projects";
import { prisma } from "../db";
import { getUserScope } from "../clients/profile";
import type { Prisma, $Enums } from "@prisma/client";

export default async function projectsRoutes(app: FastifyInstance) {
  // List projects in my college (scoped; visibility enforced later)
  app.get("/v1/projects", {
    schema: {
      tags: ["projects"],
      querystring: z.object({
        q: z.string().optional(),
        projectType: z.string().optional(),
        progressStatus: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
      }),
      response: { 200: z.any() },
    },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const { collegeId, department } = await getUserScope(req, payload);
    const roles = (payload.roles || []) as string[];
    const isStudent = roles.includes("STUDENT");
    const isFaculty = roles.includes("FACULTY");

    const { q, projectType, progressStatus } = (req.query as any) as {
      q?: string; projectType?: string; progressStatus?: string; page?: number; limit?: number;
    };
    const page = Math.max(1, Number((req.query as any).page || 1));
    const limit = Math.min(100, Math.max(1, Number((req.query as any).limit || 20)));

    const andConditions: any[] = [
      { collegeId, archivedAt: null },
    ];
    if (projectType) andConditions.push({ projectType });
    if (progressStatus) andConditions.push({ progressStatus });
    if (q) andConditions.push({ OR: [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ] });
    if (isStudent) {
      andConditions.push({ moderationStatus: "APPROVED" });
      andConditions.push({ OR: [
        { visibleToAllDepts: true },
        { departments: { has: department } },
      ] });
    }
    // Faculty can see all projects within college (including pending); others same visibility as students

    const where: any = { AND: andConditions };
    const total = await prisma.project.count({ where });
    const projects = await prisma.project.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });
    if (isStudent && projects.length > 0) {
      const ids = projects.map((p: any) => p.id);
      const myApps = await prisma.appliedProject.findMany({
        where: { projectId: { in: ids }, studentId: payload.sub },
        select: { projectId: true, status: true },
      });
      const statusByProjectId: Record<string, $Enums.ApplicationStatus> = {} as any;
      for (const a of myApps) statusByProjectId[a.projectId] = a.status as $Enums.ApplicationStatus;
      const projectsOut = projects.map((p: any) => ({
        ...p,
        hasApplied: !!statusByProjectId[p.id],
        myApplicationStatus: (statusByProjectId[p.id] ?? null),
      }));
      return reply.send({ projects: projectsOut, page, total });
    }
    return reply.send({ projects, page, total });
  });

  // My projects (FACULTY)
  app.get("/v1/projects/mine", {
    schema: { tags: ["projects"], response: { 200: z.any() } },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["FACULTY"]);
    const { collegeId } = await getUserScope(req, payload);
    const projects = await prisma.project.findMany({
      where: { authorId: payload.sub, collegeId, archivedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ projects });
  });

  // Create project (FACULTY)
  app.post("/v1/projects", {
    schema: { tags: ["projects"], body: createProjectSchema, response: { 200: z.any() } },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["FACULTY"]);
    const { collegeId, avatar: avatarFromProfile, displayName: nameFromProfile } = await getUserScope(req, payload);
    const body = createProjectSchema.parse((req as any).body);
    if (!body.visibleToAllDepts && (!body.departments || body.departments.length === 0)) {
      return reply.code(400).send({ message: "Specify at least one department when visibleToAllDepts=false" });
    }
    const tokenName = (payload as any).name ?? (payload as any).displayName ?? null;
    const tokenAvatar = (payload as any).picture ?? (payload as any).avatarUrl ?? null;
    const authorName = tokenName ?? nameFromProfile ?? "";
    const authorAvatar = tokenAvatar ?? avatarFromProfile ?? null;
    const created = await prisma.project.create({
      data: {
        collegeId,
        authorId: payload.sub,
        authorName: authorName,
        authorAvatar: authorAvatar,
        title: body.title,
        description: body.description,
        projectDuration: body.projectDuration ?? null,
        skills: body.skills ?? [],
        departments: body.departments ?? [],
        visibleToAllDepts: body.visibleToAllDepts ?? false,
        projectType: body.projectType as $Enums.ProjectType,
        maxStudents: body.maxStudents,
        deadline: body.deadline ? new Date(body.deadline) : null,
        tags: body.tags ?? [],
        moderationStatus : 'APPROVED',
        requirements: body.requirements ?? [],
        outcomes: body.outcomes ?? [],
      },
    });
    return reply.send({ project: created });
  });

  // Update project (FACULTY owner)
  app.put("/v1/projects/:id", {
    schema: { tags: ["projects"], params: z.object({ id: z.string() }), body: updateProjectSchema, response: { 200: z.any() } },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["FACULTY"]);
    const { id } = (req.params as any) as { id: string };
    const { collegeId } = await getUserScope(req, payload);
    const body = updateProjectSchema.parse((req as any).body);
    const existing = await prisma.project.findFirst({ where: { id, collegeId, authorId: payload.sub, archivedAt: null } });
    if (!existing) return reply.code(404).send({ message: "Not found" });
    const data: any = { ...body };
    if (body.deadline !== undefined) data.deadline = body.deadline ? new Date(body.deadline) : null;
    const updated = await prisma.project.update({ where: { id }, data });
    return reply.send({ project: updated });
  });

  // Delete project (FACULTY owner)
  app.delete("/v1/projects/:id", {
    schema: { tags: ["projects"], params: z.object({ id: z.string() }), response: { 200: z.any() } },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["FACULTY"]);
    const { id } = (req.params as any) as { id: string };
    const { collegeId } = await getUserScope(req, payload);
    const existing = await prisma.project.findFirst({ where: { id, collegeId, authorId: payload.sub, archivedAt: null } });
    if (!existing) return reply.code(404).send({ message: "Not found" });
    await prisma.project.update({ where: { id }, data: { archivedAt: new Date() } });
    return reply.send({ success: true });
  });

  // Apply to a project (STUDENT)
  app.post("/v1/projects/:id/applications", {
    schema: { tags: ["applications"], params: z.object({ id: z.string() }), body: applyProjectSchema, response: { 200: z.any() } },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["STUDENT"]);
    const { id } = (req.params as any) as { id: string };
    const { collegeId, department, displayName: nameFromProfile } = await getUserScope(req, payload);
    const body = applyProjectSchema.parse((req as any).body);

    const project = await prisma.project.findFirst({ where: { id, collegeId, archivedAt: null } });
    if (!project) return reply.code(404).send({ message: "Project not found" });
    if (project.moderationStatus !== "APPROVED") return reply.code(403).send({ message: "Project not open for applications" });
    if (project.progressStatus === "COMPLETED") return reply.code(400).send({ message: "Project already completed" });
    if (!(project.visibleToAllDepts || project.departments.includes(department))) {
      return reply.code(403).send({ message: "Not visible to your department" });
    }
    if (project.deadline && new Date() > project.deadline) {
      return reply.code(400).send({ message: "Application deadline has passed" });
    }
    const existing = await prisma.appliedProject.findUnique({
      where: { projectId_studentId: { projectId: id, studentId: payload.sub } },
    });
    if (existing) return reply.code(409).send({ message: "Already applied" });
    const created = await prisma.appliedProject.create({
      data: {
        projectId: id,
        studentId: payload.sub,
        studentName: ((payload as any).name ?? (payload as any).displayName ?? nameFromProfile ?? ""),
        studentDepartment: department,
        status: "PENDING" as $Enums.ApplicationStatus,
        message: body.message ?? null,
      },
    });
    return reply.send({ application: created });
  });

  // List applications for a project (FACULTY owner)
  app.get("/v1/projects/:id/applications", {
    schema: { tags: ["applications"], params: z.object({ id: z.string() }), querystring: z.object({ status: z.string().optional() }), response: { 200: z.any() } },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["FACULTY"]);
    const { id } = (req.params as any) as { id: string };
    const { collegeId } = await getUserScope(req, payload);
    const project = await prisma.project.findFirst({ where: { id, collegeId, authorId: payload.sub } });
    if (!project) return reply.code(404).send({ message: "Project not found" });
    const { status } = (req.query as any) as { status?: string };
    const statusEnum = (status as $Enums.ApplicationStatus | undefined);
    const applications = await prisma.appliedProject.findMany({
      where: { projectId: id, ...(statusEnum ? { status: statusEnum } : {}) },
      orderBy: { appliedAt: "desc" },
    });
    return reply.send({ applications });
  });

  // My applications (STUDENT)
  app.get("/v1/applications/mine", {
    schema: { tags: ["applications"], querystring: z.object({ status: z.string().optional() }), response: { 200: z.any() } },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["STUDENT"]);
    const { collegeId } = await getUserScope(req, payload);
    const { status } = (req.query as any) as { status?: string };
    const statusEnum = (status as $Enums.ApplicationStatus | undefined);
    const applications = await prisma.appliedProject.findMany({
      where: {
        studentId: payload.sub,
        ...(statusEnum ? { status: statusEnum } : {}),
        project: { collegeId, archivedAt: null },
      },
      include: { project: true },
      orderBy: { appliedAt: "desc" },
    });
    return reply.send({ applications });
  });

  // Update application status (FACULTY owner)
  app.put("/v1/applications/:id/status", {
    schema: { tags: ["applications"], params: z.object({ id: z.string() }), body: updateApplicationStatusSchema, response: { 200: z.any() } },
  }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["FACULTY"]);
    const { id } = (req.params as any) as { id: string };
    const body = updateApplicationStatusSchema.parse((req as any).body);
    const { collegeId } = await getUserScope(req, payload);
    const application = await prisma.appliedProject.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!application || !application.project || application.project.collegeId !== collegeId || application.project.authorId !== payload.sub) {
      return reply.code(404).send({ message: "Application not found" });
    }
    if (application.status !== "PENDING") return reply.code(400).send({ message: "Only pending applications can be updated" });
    if (body.status === "ACCEPTED") {
      const acceptedCount = await prisma.appliedProject.count({ where: { projectId: application.projectId, status: "ACCEPTED" as $Enums.ApplicationStatus } });
      if (acceptedCount >= application.project.maxStudents) {
        return reply.code(400).send({ message: "Project capacity reached" });
      }
    }
    const updated = await prisma.appliedProject.update({ where: { id }, data: { status: body.status as $Enums.ApplicationStatus } });
    return reply.send({ application: updated });
  });

  // Comments (Collaboration)
  app.get("/v1/projects/:id/comments", { schema: { tags: ["comments"], params: z.object({ id: z.string() }), querystring: z.object({ taskId: z.string().optional() }), response: { 200: z.any() } } }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const { id } = (req.params as any) as { id: string };
    const { collegeId } = await getUserScope(req, payload);
    const project = await prisma.project.findFirst({ where: { id, collegeId, archivedAt: null } });
    if (!project) return reply.code(404).send({ message: "Project not found" });
    if (project.authorId !== payload.sub) {
      const member = await prisma.appliedProject.findFirst({ where: { projectId: id, studentId: payload.sub, status: "ACCEPTED" as $Enums.ApplicationStatus } });
      if (!member) return reply.code(403).send({ message: "Forbidden" });
    }
    const { taskId } = (req.query as any) as { taskId?: string };
    const comments = await prisma.comment.findMany({
      where: { projectId: id, ...(taskId ? { taskId } : {}) },
      orderBy: { createdAt: "asc" },
    });
    return reply.send({ comments });
  });

  app.post("/v1/projects/:id/comments", { schema: { tags: ["comments"], params: z.object({ id: z.string() }), body: z.object({ body: z.string().min(1), taskId: z.string().optional() }), response: { 200: z.any() } } }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const { id } = (req.params as any) as { id: string };
    const { collegeId, displayName: nameFromProfile } = await getUserScope(req, payload);
    const project = await prisma.project.findFirst({ where: { id, collegeId, archivedAt: null } });
    if (!project) return reply.code(404).send({ message: "Project not found" });
    if (project.authorId !== payload.sub) {
      const member = await prisma.appliedProject.findFirst({ where: { projectId: id, studentId: payload.sub, status: "ACCEPTED" as $Enums.ApplicationStatus } });
      if (!member) return reply.code(403).send({ message: "Forbidden" });
    }
    const body = (z.object({ body: z.string().min(1), taskId: z.string().optional() })).parse((req as any).body);
    const created = await prisma.comment.create({
      data: {
        projectId: id,
        taskId: body.taskId ?? null,
        authorId: payload.sub,
        authorName: ((payload as any).name ?? (payload as any).displayName ?? nameFromProfile ?? ""),
        body: body.body,
      },
    });
    return reply.send({ comment: created });
  });

  // Tasks
  app.get("/v1/projects/:id/tasks", { schema: { tags: ["tasks"], params: z.object({ id: z.string() }), response: { 200: z.any() } } }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const { id } = (req.params as any) as { id: string };
    const { collegeId } = await getUserScope(req, payload);
    const project = await prisma.project.findFirst({ where: { id, collegeId, archivedAt: null } });
    if (!project) return reply.code(404).send({ message: "Project not found" });
    if (project.authorId !== payload.sub) {
      const member = await prisma.appliedProject.findFirst({ where: { projectId: id, studentId: payload.sub, status: "ACCEPTED" as $Enums.ApplicationStatus } });
      if (!member) return reply.code(403).send({ message: "Forbidden" });
    }
    const tasks = await prisma.projectTask.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } });
    return reply.send({ tasks });
  });

  app.post("/v1/projects/:id/tasks", { schema: { tags: ["tasks"], params: z.object({ id: z.string() }), body: createTaskSchema, response: { 200: z.any() } } }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    requireRole(payload, ["FACULTY"]);
    const { id } = (req.params as any) as { id: string };
    const { collegeId } = await getUserScope(req, payload);
    const project = await prisma.project.findFirst({ where: { id, collegeId, authorId: payload.sub, archivedAt: null } });
    if (!project) return reply.code(404).send({ message: "Project not found" });
    const body = createTaskSchema.parse((req as any).body);
    if (body.assignedToId) {
      const member = await prisma.appliedProject.findFirst({ where: { projectId: id, studentId: body.assignedToId, status: "ACCEPTED" as $Enums.ApplicationStatus } });
      if (!member) return reply.code(400).send({ message: "assignedToId must be an accepted member" });
    }
    const created = await prisma.projectTask.create({ data: { projectId: id, title: body.title, assignedToId: body.assignedToId ?? null } });
    return reply.send({ task: created });
  });

  app.put("/v1/tasks/:taskId", { schema: { tags: ["tasks"], params: z.object({ taskId: z.string() }), body: updateTaskSchema, response: { 200: z.any() } } }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const { taskId } = (req.params as any) as { taskId: string };
    const body = updateTaskSchema.parse((req as any).body);
    const { collegeId } = await getUserScope(req, payload);
    const task = await prisma.projectTask.findUnique({ where: { id: taskId }, include: { project: true } });
    if (!task || !task.project || task.project.collegeId !== collegeId || task.project.archivedAt) {
      return reply.code(404).send({ message: "Task not found" });
    }
    const roles = (payload.roles || []) as string[];
    const isOwner = task.project.authorId === payload.sub;
    if (roles.includes("FACULTY") && isOwner) {
      if (body.assignedToId) {
        const member = await prisma.appliedProject.findFirst({ where: { projectId: task.projectId, studentId: body.assignedToId, status: "ACCEPTED" as $Enums.ApplicationStatus } });
        if (!member) return reply.code(400).send({ message: "assignedToId must be an accepted member" });
      }
      const updateData: Prisma.ProjectTaskUpdateInput = {};
      if (body.title !== undefined) updateData.title = body.title;
      if (body.assignedToId !== undefined) updateData.assignedToId = body.assignedToId;
      if (body.status !== undefined) updateData.status = body.status as $Enums.TaskStatus;
      const updated = await prisma.projectTask.update({ where: { id: taskId }, data: updateData });
      return reply.send({ task: updated });
    }
    // Students can only update status of tasks assigned to them
    if (roles.includes("STUDENT") && task.assignedToId === payload.sub) {
      if (body.status === undefined || body.title !== undefined || body.assignedToId !== undefined) {
        return reply.code(403).send({ message: "Students can only update status of their assigned tasks" });
      }
      const updated = await prisma.projectTask.update({ where: { id: taskId }, data: { status: body.status as $Enums.TaskStatus } });
      return reply.send({ task: updated });
    }
    return reply.code(403).send({ message: "Forbidden" });
  });

  app.delete("/v1/tasks/:taskId", { schema: { tags: ["tasks"], params: z.object({ taskId: z.string() }), response: { 200: z.any() } } }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const { taskId } = (req.params as any) as { taskId: string };
    const { collegeId } = await getUserScope(req, payload);
    const task = await prisma.projectTask.findUnique({ where: { id: taskId }, include: { project: true } });
    if (!task || !task.project || task.project.collegeId !== collegeId || task.project.archivedAt) {
      return reply.code(404).send({ message: "Task not found" });
    }
    requireRole(payload, ["FACULTY"]);
    if (task.project.authorId !== payload.sub) return reply.code(403).send({ message: "Forbidden" });
    await prisma.projectTask.delete({ where: { id: taskId } });
    return reply.send({ success: true });
  });

  // Attachments
  app.get("/v1/projects/:id/attachments", { schema: { tags: ["attachments"], params: z.object({ id: z.string() }), response: { 200: z.any() } } }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const { id } = (req.params as any) as { id: string };
    const { collegeId } = await getUserScope(req, payload);
    const project = await prisma.project.findFirst({ where: { id, collegeId, archivedAt: null } });
    if (!project) return reply.code(404).send({ message: "Project not found" });
    if (project.authorId !== payload.sub) {
      const member = await prisma.appliedProject.findFirst({ where: { projectId: id, studentId: payload.sub, status: "ACCEPTED" as $Enums.ApplicationStatus } });
      if (!member) return reply.code(403).send({ message: "Forbidden" });
    }
    const attachments = await prisma.projectAttachment.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" } });
    return reply.send({ attachments });
  });

  app.post("/v1/projects/:id/attachments", { schema: { tags: ["attachments"], params: z.object({ id: z.string() }), body: createAttachmentSchema, response: { 200: z.any() } } }, async (req: any, reply: any) => {
    const payload = await requireAuth(req);
    const { id } = (req.params as any) as { id: string };
    const { collegeId } = await getUserScope(req, payload);
    const project = await prisma.project.findFirst({ where: { id, collegeId, archivedAt: null } });
    if (!project) return reply.code(404).send({ message: "Project not found" });
    if (project.authorId !== payload.sub) {
      const member = await prisma.appliedProject.findFirst({ where: { projectId: id, studentId: payload.sub, status: "ACCEPTED" as $Enums.ApplicationStatus } });
      if (!member) return reply.code(403).send({ message: "Forbidden" });
    }
    const body = createAttachmentSchema.parse((req as any).body);
    const created = await prisma.projectAttachment.create({
      data: {
        projectId: id,
        uploaderId: payload.sub,
        fileName: body.fileName,
        fileUrl: body.fileUrl,
        fileType: body.fileType,
      },
    });
    return reply.send({ attachment: created });
  });
}
