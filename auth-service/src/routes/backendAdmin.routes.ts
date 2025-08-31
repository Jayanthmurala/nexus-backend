import type { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../db";
import { verifyAccessToken } from "../utils/jwt";
import bcrypt from "bcrypt";
import { Role, UserStatus } from "@prisma/client";

// Validation schemas
const createCollegeSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(2).max(10).toUpperCase(),
  location: z.string().optional(),
  website: z.string().url().optional(),
  departments: z.array(z.string().min(1)).min(1),
  isActive: z.boolean().optional().default(true),
});

const createUserSchema = z.object({
  displayName: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  roles: z.array(z.enum(["STUDENT", "FACULTY", "DEPT_ADMIN", "PLACEMENTS_ADMIN", "HEAD_ADMIN", "SUPER_ADMIN"])).min(1),
  collegeId: z.string().cuid(),
  department: z.string().min(1),
  year: z.number().min(1).max(6).optional(),
  collegeMemberId: z.string().optional(),
  status: z.enum(["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED", "DELETED"]).optional().default("ACTIVE"),
  emailVerifiedAt: z.string().datetime().optional(),
});

const bulkCreateUsersSchema = z.object({
  users: z.array(createUserSchema).min(1).max(1000), // Limit to 1000 users per batch
  defaultPassword: z.string().min(8).optional(),
  autoVerifyEmails: z.boolean().optional().default(false),
});

const bulkCreateCollegesSchema = z.object({
  colleges: z.array(createCollegeSchema).min(1).max(100), // Limit to 100 colleges per batch
});

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

const userResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  roles: z.array(z.string()),
  status: z.string(),
  collegeId: z.string().nullable(),
  department: z.string().nullable(),
  year: z.number().nullable(),
  collegeMemberId: z.string().nullable(),
  emailVerifiedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const bulkUserResponseSchema = z.object({
  created: z.array(userResponseSchema),
  failed: z.array(z.object({
    email: z.string(),
    error: z.string(),
  })),
  summary: z.object({
    total: z.number(),
    successful: z.number(),
    failed: z.number(),
  }),
});

const bulkCollegeResponseSchema = z.object({
  created: z.array(collegeResponseSchema),
  failed: z.array(z.object({
    name: z.string(),
    code: z.string(),
    error: z.string(),
  })),
  summary: z.object({
    total: z.number(),
    successful: z.number(),
    failed: z.number(),
  }),
});

const errorResponseSchema = z.object({
  message: z.string(),
  details: z.any().optional(),
});

// Middleware to verify HEAD_ADMIN access
async function requireHeadAdmin(request: any) {
  const auth = request.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) {
    throw new Error("Missing authorization header");
  }

  const token = auth.slice("Bearer ".length);
  const payload = await verifyAccessToken(token);
  const userId = String(payload.sub);
  
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || (!user.roles.includes("HEAD_ADMIN" as any) && !user.roles.includes("SUPER_ADMIN" as any))) {
    throw new Error("Insufficient permissions - HEAD_ADMIN or SUPER_ADMIN required");
  }
  
  return { userId, user };
}

// Middleware to verify SUPER_ADMIN access
async function requireSuperAdmin(request: any) {
  const auth = request.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) {
    throw new Error("Missing authorization header");
  }

  const token = auth.slice("Bearer ".length);
  const payload = await verifyAccessToken(token);
  const userId = String(payload.sub);
  
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.roles.includes("SUPER_ADMIN" as any )) {
    throw new Error("Insufficient permissions - SUPER_ADMIN required");
  }
  
  return { userId, user };
}

// Middleware to verify DEPT_ADMIN access
async function requireDeptAdmin(request: any) {
  const auth = request.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) {
    throw new Error("Missing authorization header");
  }

  const token = auth.slice("Bearer ".length);
  const payload = await verifyAccessToken(token);
  const userId = String(payload.sub);
  
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.roles.includes("DEPT_ADMIN" as any)) {
    throw new Error("Insufficient permissions - DEPT_ADMIN required");
  }
  
  return { userId, user };
}

// Middleware to verify admin access (SUPER_ADMIN, HEAD_ADMIN, or DEPT_ADMIN)
async function requireAdminAccess(request: any) {
  const auth = request.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) {
    throw new Error("Missing authorization header");
  }

  const token = auth.slice("Bearer ".length);
  const payload = await verifyAccessToken(token);
  const userId = String(payload.sub);
  
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.roles.some(role => ["SUPER_ADMIN", "HEAD_ADMIN", "DEPT_ADMIN"].includes(role))) {
    throw new Error("Insufficient permissions - Admin access required");
  }
  
  return { userId, user };
}

// Check if user can create specific role
function canCreateRole(userRoles: string[], targetRole: string, userCollegeId?: string, targetCollegeId?: string): boolean {
  if (userRoles.includes("SUPER_ADMIN")) {
    return true; // Super admin can create any role
  }
  
  if (userRoles.includes("HEAD_ADMIN")) {
    // Head admin can create all roles except HEAD_ADMIN and SUPER_ADMIN
    if (["HEAD_ADMIN", "SUPER_ADMIN"].includes(targetRole)) {
      return false;
    }
    // Must be in same college
    return userCollegeId === targetCollegeId;
  }
  
  if (userRoles.includes("DEPT_ADMIN")) {
    // Dept admin can only create STUDENT and FACULTY
    if (!["STUDENT", "FACULTY"].includes(targetRole)) {
      return false;
    }
    // Must be in same college
    return userCollegeId === targetCollegeId;
  }
  
  return false;
}

// Check if user can manage (update/delete) another user
function canManageUser(adminRoles: string[], adminCollegeId: string | null, adminDepartment: string | null, 
                      targetUser: any): boolean {
  if (adminRoles.includes("SUPER_ADMIN")) {
    return true; // Super admin can manage anyone
  }
  
  if (adminRoles.includes("HEAD_ADMIN")) {
    // Head admin can manage users in their college (except other HEAD_ADMIN and SUPER_ADMIN)
    if (targetUser.roles.some((role: string) => ["HEAD_ADMIN", "SUPER_ADMIN"].includes(role))) {
      return false;
    }
    return adminCollegeId === targetUser.collegeId;
  }
  
  if (adminRoles.includes("DEPT_ADMIN")) {
    // Dept admin can only manage STUDENT and FACULTY in their department
    if (targetUser.roles.some((role: string) => !["STUDENT", "FACULTY"].includes(role))) {
      return false;
    }
    return adminCollegeId === targetUser.collegeId && adminDepartment === targetUser.department;
  }
  
  return false;
}

export async function backendAdminRoutes(app: FastifyInstance) {
  const f = app.withTypeProvider<ZodTypeProvider>();

  // POST /v1/admin/colleges - Create college (SUPER_ADMIN only)
  f.post("/v1/admin/colleges", {
    schema: {
      tags: ["backend-admin"],
      summary: "Create a new college",
      description: "Create a new college with departments. Requires SUPER_ADMIN role.",
      body: createCollegeSchema,
      response: { 
        201: collegeResponseSchema, 
        400: errorResponseSchema, 
        401: errorResponseSchema, 
        403: errorResponseSchema, 
        409: errorResponseSchema 
      },
    },
  }, async (req, reply) => {
    try {
      await requireSuperAdmin(req);
    } catch (error) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    
    const data = req.body as z.infer<typeof createCollegeSchema>;
    
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

  // POST /v1/admin/colleges/bulk - Create multiple colleges (SUPER_ADMIN only)
  f.post("/v1/admin/colleges/bulk", {
    schema: {
      tags: ["backend-admin"],
      summary: "Create multiple colleges in bulk",
      description: "Create multiple colleges at once. Requires SUPER_ADMIN role. Maximum 100 colleges per request.",
      body: bulkCreateCollegesSchema,
      response: { 
        200: bulkCollegeResponseSchema, 
        400: errorResponseSchema, 
        401: errorResponseSchema, 
        403: errorResponseSchema 
      },
    },
  }, async (req, reply) => {
    try {
      await requireSuperAdmin(req);
    } catch (error) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    
    const { colleges } = req.body as z.infer<typeof bulkCreateCollegesSchema>;
    
    const created: any[] = [];
    const failed: { name: string; code: string; error: string }[] = [];
    
    for (const collegeData of colleges) {
      try {
        const college = await prisma.college.create({ data: collegeData });
        created.push(college);
      } catch (error: any) {
        let errorMessage = "Unknown error";
        if (error.code === "P2002") {
          const field = error.meta?.target?.[0] === "name" ? "name" : "code";
          errorMessage = `College ${field} already exists`;
        } else {
          errorMessage = error.message || "Database error";
        }
        failed.push({ 
          name: collegeData.name, 
          code: collegeData.code, 
          error: errorMessage 
        });
      }
    }
    
    const response = {
      created,
      failed,
      summary: {
        total: colleges.length,
        successful: created.length,
        failed: failed.length,
      },
    };
    
    return reply.send(response);
  });

  // POST /v1/admin/users - Create single user (SUPER_ADMIN, HEAD_ADMIN, or DEPT_ADMIN)
  f.post("/v1/admin/users", {
    schema: {
      tags: ["admin"],
      body: createUserSchema,
      response: { 201: z.object({
        id: z.string(),
        email: z.string(),
        displayName: z.string(),
        roles: z.array(z.string()),
        avatarUrl: z.string().nullable(),
      }), 400: errorResponseSchema, 403: errorResponseSchema },
    },
  }, async (req, reply) => {
    try {
      const { userId } = await requireAdminAccess(req);
      const { displayName, email, password, roles, collegeId, department, collegeMemberId, year } = req.body as z.infer<typeof createUserSchema>;
      const role = roles[0]; // Use first role for validation logic

      // Get admin user details for permission checks
      const adminUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!adminUser) {
        return reply.code(403).send({ 
          message: "User creation failed: Admin user not found. Please log in again." 
        });
      }

      // Check if admin can create this role
      if (!canCreateRole(adminUser.roles, role, adminUser.collegeId || undefined, collegeId)) {
        const adminRoleNames = adminUser.roles.join(", ");
        return reply.code(403).send({ 
          message: `User creation failed: Your role (${adminRoleNames}) does not have permission to create ${role} users. Please contact your administrator.` 
        });
      }

      // Check if email already exists
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return reply.code(400).send({ 
          message: `User creation failed: The email address '${email}' is already registered. Please use a different email address.` 
        });
      }

      // Validate college exists and is active (except for SUPER_ADMIN)
      if (role !== "SUPER_ADMIN") {
        const college = await prisma.college.findUnique({ where: { id: collegeId } });
        if (!college) {
          return reply.code(400).send({ 
            message: `User creation failed: College with ID '${collegeId}' not found. Please verify the college ID.` 
          });
        }
        if (!college.isActive) {
          return reply.code(400).send({ 
            message: `User creation failed: College '${college.name}' is currently inactive. Please contact your administrator.` 
          });
        }

        // Validate department exists in college
        if (!college.departments.includes(department)) {
          return reply.code(400).send({ 
            message: `User creation failed: Department '${department}' is not available in '${college.name}'. Available departments: ${college.departments.join(', ')}.` 
          });
        }
      }

      // Check if collegeMemberId is unique within the college (if provided)
      if (collegeMemberId && collegeId) {
        const existingMember = await prisma.user.findFirst({
          where: {
            collegeId,
            collegeMemberId,
          },
        });
        if (existingMember) {
          const college = await prisma.college.findUnique({ where: { id: collegeId } });
          return reply.code(400).send({ 
            message: `User creation failed: College member ID '${collegeMemberId}' already exists in '${college?.name || 'the selected college'}'. Please use a different member ID.` 
          });
        }
      }

      // Validate year is provided for students
      if (role === "STUDENT" && !year) {
        return reply.code(400).send({ 
          message: "User creation failed: Year is required for student role. Please provide the academic year (1-6)." 
        });
      }

      // Hash password (password is required for user creation)
      if (!password) {
        return reply.code(400).send({ 
          message: "User creation failed: Password is required for user creation." 
        });
      }
      const passwordHash = await bcrypt.hash(password, 12);

      const userData = {
        email: email.toLowerCase(),
        displayName: displayName,
        passwordHash,
        roles: [role],
        status: "ACTIVE" as UserStatus,
        collegeId: collegeId,
        department: department,
        year: year,
        collegeMemberId: collegeMemberId,
        emailVerifiedAt: new Date(),
      };

      const user = await prisma.user.create({ 
        data: userData as any,
        select: {
          id: true,
          email: true,
          displayName: true,
          roles: true,
          avatarUrl: true,
        },
      });

      return reply.code(201).send(user);
    } catch (error: any) {
      if (error.message?.includes("Missing authorization header")) {
        return reply.code(401).send({ 
          message: "User creation failed: Authentication required. Please provide a valid authorization token." 
        });
      }
      if (error.message?.includes("Insufficient permissions")) {
        return reply.code(403).send({ 
          message: "User creation failed: You do not have sufficient permissions to create users. Please contact your administrator." 
        });
      }
      if (error.code === "P2002") {
        if (error.meta?.target?.includes("email")) {
          return reply.code(409).send({ 
            message: "User creation failed: Email address already exists. Please use a different email." 
          });
        }
        if (error.meta?.target?.includes("collegeMemberId")) {
          return reply.code(409).send({ 
            message: "User creation failed: College member ID already exists. Please use a different member ID." 
          });
        }
      }
      return reply.code(400).send({ 
        message: "User creation failed: Invalid request data. Please check all required fields and try again." 
      });
    }
  });

  // POST /v1/admin/users/bulk - Create multiple users (HEAD_ADMIN only)
  f.post("/v1/admin/users/bulk", {
    schema: {
      tags: ["backend-admin"],
      summary: "Create multiple users in bulk",
      description: "Create multiple user accounts at once. Requires HEAD_ADMIN role. Maximum 1000 users per request.",
      body: bulkCreateUsersSchema,
      response: { 
        200: bulkUserResponseSchema, 
        400: errorResponseSchema, 
        401: errorResponseSchema, 
        403: errorResponseSchema 
      },
    },
  }, async (req, reply) => {
    try {
      await requireHeadAdmin(req);
    } catch (error) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    
    const { users, defaultPassword, autoVerifyEmails } = req.body as z.infer<typeof bulkCreateUsersSchema>;
    
    // Validate all colleges exist
    const collegeIds = [...new Set(users.map(u => u.collegeId))];
    const colleges = await prisma.college.findMany({
      where: { id: { in: collegeIds } },
    });
    
    const collegeMap = new Map(colleges.map(c => [c.id, c]));
    
    const created: any[] = [];
    const failed: { email: string; error: string }[] = [];
    
    for (const userData of users) {
      try {
        // Validate college
        const college = collegeMap.get(userData.collegeId);
        if (!college) {
          failed.push({ email: userData.email, error: `College not found: ${userData.collegeId}` });
          continue;
        }
        
        // Validate department
        if (!college.departments.includes(userData.department)) {
          failed.push({ 
            email: userData.email, 
            error: `Department '${userData.department}' not found in college '${college.name}'` 
          });
          continue;
        }
        
        // Hash password
        const password = userData.password || defaultPassword || Math.random().toString(36).slice(-12);
        const passwordHash = await bcrypt.hash(password, 12);
        
        const createData = {
          email: userData.email.toLowerCase(),
          displayName: userData.displayName,
          passwordHash,
          roles: userData.roles,
          status: (userData.status || "ACTIVE") as UserStatus,
          collegeId: userData.collegeId,
          department: userData.department,
          year: userData.year,
          collegeMemberId: userData.collegeMemberId,
          emailVerifiedAt: autoVerifyEmails || userData.emailVerifiedAt ? 
            (userData.emailVerifiedAt ? new Date(userData.emailVerifiedAt) : new Date()) : 
            undefined,
        };
        
        const user = await prisma.user.create({ 
          data: createData as any,
          select: {
            id: true,
            email: true,
            displayName: true,
            roles: true,
            status: true,
            collegeId: true,
            department: true,
            year: true,
            collegeMemberId: true,
            emailVerifiedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        
        created.push(user);
      } catch (error: any) {
        let errorMessage = "Unknown error";
        if (error.code === "P2002") {
          if (error.meta?.target?.includes("email")) {
            errorMessage = "Email already exists";
          } else if (error.meta?.target?.includes("collegeMemberId")) {
            errorMessage = "College member ID already exists";
          }
        } else {
          errorMessage = error.message || "Database error";
        }
        failed.push({ email: userData.email, error: errorMessage });
      }
    }
    
    const response = {
      created,
      failed,
      summary: {
        total: users.length,
        successful: created.length,
        failed: failed.length,
      },
    };
    
    return reply.send(response);
  });

  // GET /v1/admin/colleges - List all colleges with user counts (HEAD_ADMIN only)
  f.get("/v1/admin/colleges", {
    schema: {
      tags: ["backend-admin"],
      summary: "List all colleges with statistics",
      description: "Get all colleges with user counts. Requires HEAD_ADMIN role.",
      querystring: z.object({
        includeInactive: z.enum(["true", "false"]).optional(),
      }),
      response: { 
        200: z.object({
          colleges: z.array(collegeResponseSchema.extend({
            userCount: z.number(),
            studentCount: z.number(),
            facultyCount: z.number(),
          })),
        }),
        401: errorResponseSchema,
        403: errorResponseSchema,
      },
    },
  }, async (req, reply) => {
    try {
      await requireHeadAdmin(req);
    } catch (error) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    
    const { includeInactive } = req.query as any;
    
    const where: any = {};
    if (includeInactive !== "true") {
      where.isActive = true;
    }
    
    const colleges = await prisma.college.findMany({
      where,
      include: {
        users: {
          select: {
            id: true,
            roles: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });
    
    const collegesWithStats = colleges.map(college => ({
      id: college.id,
      name: college.name,
      code: college.code,
      location: college.location,
      website: college.website,
      departments: college.departments,
      isActive: college.isActive,
      createdAt: college.createdAt,
      updatedAt: college.updatedAt,
      userCount: college.users.length,
      studentCount: college.users.filter(u => u.roles.includes("STUDENT")).length,
      facultyCount: college.users.filter(u => u.roles.includes("FACULTY")).length,
    }));
    
    return reply.send({ colleges: collegesWithStats });
  });
}

export default backendAdminRoutes;
