import type { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../db";
import { verifyAccessToken } from "../utils/jwt";

const collegeSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(2).max(10).toUpperCase(),
  location: z.string().optional(),
  website: z.string().url().optional(),
  departments: z.array(z.string().min(1)).min(1),
  isActive: z.boolean().optional().default(true),
});

const updateCollegeSchema = collegeSchema.partial();

const collegeResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  location: z.string().nullable(),
  website: z.string().nullable(),
  departments: z.array(z.string()),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const collegesListSchema = z.object({
  colleges: z.array(collegeResponseSchema),
  total: z.number(),
});

const errorResponseSchema = z.object({
  message: z.string(),
});

// Middleware to verify admin access
async function requireHeadAdmin(request: any) {
  const auth = request.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) {
    throw new Error("Missing authorization token");
  }
  
  const token = auth.slice("Bearer ".length);
  const payload = await verifyAccessToken(token);
  const userId = String(payload.sub);
  
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.roles.includes("HEAD_ADMIN")) {
    throw new Error("Insufficient permissions - HEAD_ADMIN required");
  }
  
  return { userId, user };
}

export async function collegeRoutes(app: FastifyInstance) {
  const f = app.withTypeProvider<ZodTypeProvider>();

  // GET /v1/colleges - List all colleges (public)
  f.get("/v1/colleges", {
    schema: {
      tags: ["colleges"],
      querystring: z.object({
        active: z.enum(["true", "false"]).optional(),
        limit: z.string().regex(/^\d+$/).optional(),
        offset: z.string().regex(/^\d+$/).optional(),
      }),
      response: { 200: collegesListSchema, 500: errorResponseSchema },
    },
  }, async (req, reply) => {
    const { active, limit, offset } = req.query as any;
    
    const where: any = {};
    if (active !== undefined) {
      where.isActive = active === "true";
    }
    
    const take = limit ? Math.min(parseInt(limit), 100) : 50;
    const skip = offset ? parseInt(offset) : 0;
    
    const [colleges, total] = await Promise.all([
      prisma.college.findMany({
        where,
        take,
        skip,
        orderBy: { name: "asc" },
      }),
      prisma.college.count({ where }),
    ]);
    
    return reply.send({ colleges, total });
  });

  // GET /v1/colleges/:id - Get college by ID (public)
  f.get("/v1/colleges/:id", {
    schema: {
      tags: ["colleges"],
      params: z.object({ id: z.string() }),
      response: { 200: collegeResponseSchema, 404: errorResponseSchema },
    },
  }, async (req, reply) => {
    const { id } = req.params as any;
    
    const college = await prisma.college.findUnique({ where: { id } });
    if (!college) {
      return reply.code(404).send({ message: "College not found" });
    }
    
    return reply.send(college);
  });

  // POST /v1/colleges - Create college (HEAD_ADMIN only)
  f.post("/v1/colleges", {
    schema: {
      tags: ["colleges"],
      body: collegeSchema,
      response: { 201: collegeResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 409: errorResponseSchema },
    },
  }, async (req, reply) => {
    try {
      await requireHeadAdmin(req);
    } catch (error) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    
    const data = req.body as z.infer<typeof collegeSchema>;
    
    try {
      const college = await prisma.college.create({ data });
      return reply.code(201).send(college);
    } catch (error: any) {
      if (error.code === "P2002") {
        const field = error.meta?.target?.[0] === "name" ? "name" : "code";
        return reply.code(409).send({ message: `College ${field} already exists` });
      }
      throw error;
    }
  });

  // PUT /v1/colleges/:id - Update college (HEAD_ADMIN only)
  f.put("/v1/colleges/:id", {
    schema: {
      tags: ["colleges"],
      params: z.object({ id: z.string() }),
      body: updateCollegeSchema,
      response: { 200: collegeResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema },
    },
  }, async (req, reply) => {
    try {
      await requireHeadAdmin(req);
    } catch (error) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    
    const { id } = req.params as any;
    const data = req.body as z.infer<typeof updateCollegeSchema>;
    
    try {
      const college = await prisma.college.update({
        where: { id },
        data,
      });
      return reply.send(college);
    } catch (error: any) {
      if (error.code === "P2025") {
        return reply.code(404).send({ message: "College not found" });
      }
      if (error.code === "P2002") {
        const field = error.meta?.target?.[0] === "name" ? "name" : "code";
        return reply.code(409).send({ message: `College ${field} already exists` });
      }
      throw error;
    }
  });

  // DELETE /v1/colleges/:id - Delete college (HEAD_ADMIN only)
  f.delete("/v1/colleges/:id", {
    schema: {
      tags: ["colleges"],
      params: z.object({ id: z.string() }),
      response: { 204: z.null(), 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema },
    },
  }, async (req, reply) => {
    try {
      await requireHeadAdmin(req);
    } catch (error) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    
    const { id } = req.params as any;
    
    // Check if college has users
    const userCount = await prisma.user.count({ where: { collegeId: id } });
    if (userCount > 0) {
      return reply.code(409).send({ message: "Cannot delete college with existing users" });
    }
    
    try {
      await prisma.college.delete({ where: { id } });
      return reply.code(204).send();
    } catch (error: any) {
      if (error.code === "P2025") {
        return reply.code(404).send({ message: "College not found" });
      }
      throw error;
    }
  });

  // GET /v1/colleges/:id/departments - Get departments for college (public)
  f.get("/v1/colleges/:id/departments", {
    schema: {
      tags: ["colleges"],
      params: z.object({ id: z.string() }),
      response: { 
        200: z.object({ departments: z.array(z.string()) }), 
        404: errorResponseSchema 
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as any;
    
    const college = await prisma.college.findUnique({ 
      where: { id },
      select: { departments: true }
    });
    
    if (!college) {
      return reply.code(404).send({ message: "College not found" });
    }
    
    return reply.send({ departments: college.departments });
  });
}

export default collegeRoutes;
