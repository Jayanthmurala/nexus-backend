import { z } from "zod";

export const ProjectType = z.enum(["PROJECT", "RESEARCH", "PAPER_PUBLISH", "OTHER"]);
export const ModerationStatus = z.enum(["PENDING_APPROVAL", "APPROVED", "REJECTED"]);
export const ProgressStatus = z.enum(["OPEN", "IN_PROGRESS", "COMPLETED"]);
export const ApplicationStatus = z.enum(["PENDING", "ACCEPTED", "REJECTED"]);
export const TaskStatus = z.enum(["TODO", "IN_PROGRESS", "DONE"]);

export const createProjectSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  projectDuration: z.string().optional(),
  skills: z.array(z.string()).default([]),
  projectType: ProjectType,
  visibleToAllDepts: z.boolean().default(false),
  departments: z.array(z.string()).default([]),
  maxStudents: z.number().int().min(1),
  deadline: z.string().datetime().optional(),
  tags: z.array(z.string()).default([]),
  requirements: z.array(z.string()).default([]),
  outcomes: z.array(z.string()).default([]),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  progressStatus: ProgressStatus.optional(),
});

export const applyProjectSchema = z.object({
  message: z.string().max(2000).optional(),
});

export const updateApplicationStatusSchema = z.object({
  status: ApplicationStatus, // PENDING->ACCEPTED/REJECTED only (enforced server-side)
});

export const createTaskSchema = z.object({
  title: z.string().min(1),
  assignedToId: z.string().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  assignedToId: z.string().nullable().optional(),
  status: TaskStatus.optional(),
});

export const createAttachmentSchema = z.object({
  fileName: z.string().min(1),
  fileUrl: z.string().url(),
  fileType: z.string().min(1),
});
