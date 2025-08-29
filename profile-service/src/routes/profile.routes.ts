import { FastifyInstance } from "fastify";
import { z } from "zod";
import axios from "axios";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

// Validation schemas
const updateProfileSchema = z.object({
  // User model fields (only displayName is editable)
  displayName: z.string().min(1).max(100).optional(),
  
  // Profile model fields (all editable)
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(1000).optional(),
  skills: z.array(z.string()).optional(),
  expertise: z.array(z.string()).optional(),
  linkedIn: z.string().url().optional().or(z.literal("")),
  github: z.string().url().optional().or(z.literal("")),
  twitter: z.string().url().optional().or(z.literal("")),
  resumeUrl: z.string().url().optional().or(z.literal("")),
  avatar: z.string().url().optional().or(z.literal("")),
  contactInfo: z.string().max(500).optional(),
  phoneNumber: z.string().max(20).optional(),
  alternateEmail: z.string().email().optional(),
  year: z.number().int().min(1).max(6).optional(),
  department: z.string().max(100).optional(),
});

const createProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(1000).optional(),
  skills: z.array(z.string()).optional(),
  linkedIn: z.string().url().optional().or(z.literal("")),
  github: z.string().url().optional().or(z.literal("")),
  twitter: z.string().url().optional().or(z.literal("")),
  resumeUrl: z.string().url().optional().or(z.literal("")),
  avatar: z.string().url().optional().or(z.literal("")),
  contactInfo: z.string().max(500).optional(),
  phoneNumber: z.string().max(20).optional(),
  alternateEmail: z.string().email().optional(),
});

const personalProjectSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  github: z.string().url().optional().or(z.literal("")),
  demoLink: z.string().url().optional().or(z.literal("")),
  image: z.string().url().optional().or(z.literal("")),
});

const experienceSchema = z.object({
  area: z.string().min(1), // AI, IoT, Machine Learning, etc.
  level: z.enum(["Beginner", "Intermediate", "Advanced", "Expert"]),
  yearsExp: z.number().min(0).max(50).optional(),
  description: z.string().optional(),
});

const publicationSchema = z.object({
  title: z.string().min(1),
  year: z.number().min(1900).max(new Date().getFullYear()),
  link: z.string().url().optional().or(z.literal("")),
});

const badgeDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().url().optional(),
  color: z.string().optional(),
  category: z.string().optional(),
  rarity: z.enum(["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"]).default("COMMON"),
});

const awardBadgeSchema = z.object({
  badgeDefinitionId: z.string().cuid(),
  userId: z.string().cuid(),
  reason: z.string().min(1, "Reason is required"),
});

export default async function profileRoutes(app: FastifyInstance) {
  // Public: List colleges (no auth required)
  app.get("/v1/colleges", {
    schema: {
      tags: ["colleges"],
      response: { 200: z.any() },
    },
  }, async (_req, reply) => {
    try {
      // Forward request to auth-service
      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
      const response = await fetch(`${authServiceUrl}/v1/colleges`);
      
      if (!response.ok) {
        return reply.code(response.status).send({ 
          message: "Failed to fetch colleges from auth service" 
        });
      }
      
      const data = await response.json();
      return reply.send(data);
    } catch (error) {
      return reply.code(500).send({ 
        message: "Internal server error while fetching colleges" 
      });
    }
  });

  // Protected: Get my profile (frontend compatible endpoint with enhanced data)
  app.get("/v1/profile/me", {
    preHandler: requireAuth,
    schema: {
      tags: ["profiles"],
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const userId = req.user!.sub;

    // Get profile from database
    const initialProfile = await prisma.profile.findUnique({
      where: { userId },
      include: {
        personalProjects: true,
        publications: true,
        experiences: true,
        studentBadges: {
          include: {
            badge: true,
          },
        },
      },
    });

    // Get user info from auth service
    let userInfo: any = null;
    let collegeName: string | null = null;
    try {
      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
      console.log(`Fetching user info from: ${authServiceUrl}/v1/users/${userId}`);
      
      const response = await axios.get(`${authServiceUrl}/v1/users/${userId}`, {
        headers: {
          'Authorization': req.headers.authorization || '',
        },
        timeout: 5000,
      });
      
      console.log('Auth service response:', response.status, response.data);
      userInfo = response.data.user;

      // Fetch college name if collegeId exists
      if (userInfo?.collegeId) {
        try {
          const collegeResponse = await axios.get(`${authServiceUrl}/v1/colleges/${userInfo.collegeId}`, {
            headers: {
              'Authorization': req.headers.authorization || '',
            },
            timeout: 5000,
          });
          collegeName = collegeResponse.data?.name || null;
        } catch (collegeError) {
          console.error('Failed to fetch college info:', collegeError);
        }
      }
    } catch (error) {
      console.error('Failed to fetch user info:', error);
      if (axios.isAxiosError(error)) {
        console.error('Axios error details:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message
        });
      }
    }

    // Auto-populate name from displayName if null and userInfo is available
    let profile = initialProfile;
    if (userInfo?.displayName && (!initialProfile || !(initialProfile as any)?.name)) {
      profile = await prisma.profile.upsert({
        where: { userId },
        update: { name: userInfo.displayName },
        create: { 
          userId,
          name: userInfo.displayName,
        },
        include: {
          personalProjects: true,
          publications: true,
          experiences: true,
          studentBadges: {
            include: {
              badge: true,
            },
          },
        },
      });
    }

    // Combine profile and user data (use auth service avatarUrl as primary source)
    const enhancedProfile = {
      id: profile?.id || '',
      userId,
      name: (profile as any)?.name || userInfo?.displayName || '',
      displayName: userInfo?.displayName || '',
      email: userInfo?.email || '',
      avatarUrl: userInfo?.avatarUrl || '',
      bio: (profile as any)?.bio || '',
      skills: (profile as any)?.skills || [],
      linkedIn: (profile as any)?.linkedIn || '',
      github: (profile as any)?.github || '',
      twitter: (profile as any)?.twitter || '',
      resumeUrl: (profile as any)?.resumeUrl || '',
      contactInfo: (profile as any)?.contactInfo || '',
      phoneNumber: (profile as any)?.phoneNumber || '',
      alternateEmail: (profile as any)?.alternateEmail || '',
      collegeName: collegeName,
      collegeId: userInfo?.collegeId || '',
      collegeMemberId: userInfo?.collegeMemberId || '',
      department: (profile as any)?.department || userInfo?.department || '',
      year: (profile as any)?.year || userInfo?.year || null,
      roles: userInfo?.roles || [],
      joinedAt: userInfo?.createdAt || profile?.createdAt,
      experiences: profile?.experiences || [],
      badges: profile?.studentBadges || [],
      projects: profile?.personalProjects || [],
      publications: profile?.publications || [],
    };

    return reply.send({ profile: enhancedProfile });
  });

  // Protected: Create/Update my profile (frontend compatible endpoint)
  app.put("/v1/profile/me", {
    preHandler: requireAuth,
    schema: {
      tags: ["profiles"],
      body: updateProfileSchema,
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const data = req.body as z.infer<typeof updateProfileSchema>;
    const userId = req.user!.sub;

    // Separate user model fields from profile model fields
    const { displayName, ...profileData } = data;

    // Update displayName in auth service if provided
    if (displayName) {
      try {
        const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
        await axios.put(`${authServiceUrl}/v1/users/${userId}`, 
          { displayName },
          {
            headers: {
              'Authorization': req.headers.authorization || '',
            },
            timeout: 5000,
          }
        );
      } catch (error) {
        console.error('Failed to update displayName in auth service:', error);
        return reply.code(500).send({ message: "Failed to update display name" });
      }
    }

    // Update profile data in profile service
    const profile = await prisma.profile.upsert({
      where: { userId },
      update: profileData,
      create: {
        userId,
        ...profileData,
      },
      include: {
        personalProjects: true,
        publications: true,
        experiences: true,
        studentBadges: {
          include: {
            badge: true,
          },
        },
      },
    });

    return reply.send({ profile });
  });

  // Protected: Get user profile by ID (frontend compatible endpoint)
  app.get("/v1/profile/:userId", {
    preHandler: requireAuth,
    schema: {
      tags: ["profiles"],
      params: z.object({ userId: z.string().cuid() }),
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const { userId } = req.params as { userId: string };

    const profile = await prisma.profile.findUnique({
      where: { userId },
      include: {
        personalProjects: true,
        publications: true,
        experiences: true,
        studentBadges: {
          include: {
            badge: true,
          },
        },
      },
    });

    return reply.send({ profile });
  });

  // Protected: Get enhanced user profile (with auth service data)
  app.get("/v1/profile/user/:userId", {
    preHandler: requireAuth,
    schema: {
      tags: ["profiles"],
      params: z.object({ userId: z.string().cuid() }),
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const { userId } = req.params as { userId: string };

    // Get profile from database
    const initialProfile = await prisma.profile.findUnique({
      where: { userId },
      include: {
        personalProjects: true,
        publications: true,
        experiences: true,
        studentBadges: {
          include: {
            badge: true,
          },
        },
      },
    });

    // Get user info from auth service
    let userInfo: any = null;
    let collegeName: string | null = null;
    try {
      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
      console.log(`Fetching user info from: ${authServiceUrl}/v1/users/${userId}`);
      
      const response = await axios.get(`${authServiceUrl}/v1/users/${userId}`, {
        headers: {
          'Authorization': req.headers.authorization || '',
        },
        timeout: 5000,
      });
      
      console.log('Auth service response:', response.status, response.data);
      userInfo = response.data.user;

      // Fetch college name if collegeId exists
      if (userInfo?.collegeId) {
        try {
          const collegeResponse = await axios.get(`${authServiceUrl}/v1/colleges/${userInfo.collegeId}`, {
            headers: {
              'Authorization': req.headers.authorization || '',
            },
            timeout: 5000,
          });
          collegeName = collegeResponse.data?.name || null;
        } catch (collegeError) {
          console.error('Failed to fetch college info:', collegeError);
        }
      }
    } catch (error) {
      console.error('Failed to fetch user info:', error);
      if (axios.isAxiosError(error)) {
        console.error('Axios error details:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message
        });
      }
    }

    // Auto-populate name from displayName if null and userInfo is available
    let profile = initialProfile;
    if (userInfo?.displayName && (!initialProfile || !(initialProfile as any)?.name)) {
      profile = await prisma.profile.upsert({
        where: { userId },
        update: { name: userInfo.displayName },
        create: { 
          userId,
          name: userInfo.displayName,
        },
        include: {
          personalProjects: true,
          publications: true,
          experiences: true,
          studentBadges: {
            include: {
              badge: true,
            },
          },
        },
      });
    }

    // Combine profile and user data (use auth service avatarUrl as primary source)
    const enhancedProfile = {
      id: profile?.id || '',
      userId,
      name: (profile as any)?.name || userInfo?.displayName || '',
      displayName: userInfo?.displayName || '',
      email: userInfo?.email || '',
      avatarUrl: userInfo?.avatarUrl || '',
      bio: (profile as any)?.bio || '',
      skills: (profile as any)?.skills || [],
      linkedIn: (profile as any)?.linkedIn || '',
      github: (profile as any)?.github || '',
      twitter: (profile as any)?.twitter || '',
      resumeUrl: (profile as any)?.resumeUrl || '',
      contactInfo: (profile as any)?.contactInfo || '',
      phoneNumber: (profile as any)?.phoneNumber || '',
      alternateEmail: (profile as any)?.alternateEmail || '',
      collegeName: collegeName,
      collegeId: userInfo?.collegeId || '',
      collegeMemberId: userInfo?.collegeMemberId || '',
      department: (profile as any)?.department || userInfo?.department || '',
      year: (profile as any)?.year || userInfo?.year || null,
      roles: userInfo?.roles || [],
      joinedAt: userInfo?.createdAt || profile?.createdAt,
      experiences: profile?.experiences || [],
      badges: profile?.studentBadges || [],
      projects: profile?.personalProjects || [],
      publications: profile?.publications || [],
    };

    return reply.send({ profile: enhancedProfile });
  });

  // Protected: Update my profile (legacy endpoint)
  app.put("/v1/profiles/me", {
    preHandler: requireAuth,
    schema: {
      tags: ["profiles"],
      body: updateProfileSchema,
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const data = req.body as z.infer<typeof updateProfileSchema>;
    const userId = req.user!.sub;

    const profile = await prisma.profile.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      },
      include: {
        personalProjects: true,
        publications: true,
        experiences: true,
        studentBadges: {
          include: {
            badge: true,
          },
        },
      },
    });

    return reply.send({ profile });
  });

  // Protected: Get user profile by ID
  app.get("/v1/profiles/:userId", {
    preHandler: requireAuth,
    schema: {
      tags: ["profiles"],
      params: z.object({ userId: z.string().cuid() }),
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const { userId } = req.params as { userId: string };

    const profile = await prisma.profile.findUnique({
      where: { userId },
      include: {
        personalProjects: true,
        publications: true,
        experiences: true,
        studentBadges: {
          include: {
            badge: true,
          },
        },
      },
    });

    if (!profile) {
      return reply.code(404).send({ message: "Profile not found" });
    }

    return reply.send({ profile });
  });

  // Protected: Get my personal projects
  app.get("/v1/profile/me/projects", {
    preHandler: requireAuth,
    schema: {
      tags: ["projects"],
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const userId = req.user!.sub;

    const projects = await prisma.personalProject.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ projects });
  });

  // Protected: Get my publications
  app.get("/v1/profile/me/publications", {
    preHandler: requireAuth,
    schema: {
      tags: ["publications"],
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const userId = req.user!.sub;

    const publications = await prisma.publication.findMany({
      where: { userId },
      orderBy: { year: 'desc' },
    });

    return reply.send({ publications });
  });

  // Protected: Create personal project
  app.post("/v1/profiles/me/projects", {
    preHandler: requireAuth,
    schema: {
      tags: ["projects"],
      body: personalProjectSchema,
      response: { 201: z.any() },
    },
  }, async (req, reply) => {
    const data = req.body as z.infer<typeof personalProjectSchema>;

    // Ensure profile exists
    await prisma.profile.upsert({
      where: { userId: req.user!.sub },
      update: {},
      create: { 
        userId: req.user!.sub,
      },
    });

    const project = await prisma.personalProject.create({
      data: {
        ...data,
        profile: { connect: { userId: req.user!.sub } },
      },
    });

    return reply.code(201).send({ project });
  });

  // Protected: Update personal project
  app.put("/v1/profiles/me/projects/:projectId", {
    preHandler: requireAuth,
    schema: {
      tags: ["projects"],
      params: z.object({ projectId: z.string().cuid() }),
      body: personalProjectSchema,
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const data = req.body as z.infer<typeof personalProjectSchema>;

    // Check ownership
    const existingProject = await prisma.personalProject.findFirst({
      where: { 
        id: projectId,
        profile: { userId: req.user!.sub },
      },
    });

    if (!existingProject) {
      return reply.code(404).send({ message: "Project not found" });
    }

    const project = await prisma.personalProject.update({
      where: { id: projectId },
      data,
    });

    return reply.send({ project });
  });

  // Protected: Delete personal project
  app.delete("/v1/profiles/me/projects/:projectId", {
    preHandler: requireAuth,
    schema: {
      tags: ["projects"],
      params: z.object({ projectId: z.string().cuid() }),
      response: { 204: z.any() },
    },
  }, async (req, reply) => {
    const { projectId } = req.params as { projectId: string };

    // Check ownership
    const existingProject = await prisma.personalProject.findFirst({
      where: { 
        id: projectId,
        profile: { userId: req.user!.sub },
      },
    });

    if (!existingProject) {
      return reply.code(404).send({ message: "Project not found" });
    }

    await prisma.personalProject.delete({
      where: { id: projectId },
    });

    return reply.code(204).send();
  });

  // Protected: Create publication (Faculty only)
  app.post("/v1/profiles/me/publications", {
    preHandler: [requireAuth, requireRole(["FACULTY", "HEAD_ADMIN"])],
    schema: {
      tags: ["publications"],
      body: publicationSchema,
      response: { 201: z.any() },
    },
  }, async (req, reply) => {
    const data = req.body as z.infer<typeof publicationSchema>;

    // Ensure profile exists
    await prisma.profile.upsert({
      where: { userId: req.user!.sub },
      update: {},
      create: { 
        userId: req.user!.sub,
      },
    });

    const publication = await prisma.publication.create({
      data: {
        ...data,
        profile: { connect: { userId: req.user!.sub } },
      },
    });

    return reply.code(201).send({ publication });
  });

  // Protected: Update publication (Faculty only)
  app.put("/v1/profiles/me/publications/:publicationId", {
    preHandler: [requireAuth, requireRole(["FACULTY", "HEAD_ADMIN"])],
    schema: {
      tags: ["publications"],
      params: z.object({ publicationId: z.string().cuid() }),
      body: publicationSchema,
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const { publicationId } = req.params as { publicationId: string };
    const data = req.body as z.infer<typeof publicationSchema>;

    // Check ownership
    const existingPublication = await prisma.publication.findFirst({
      where: { 
        id: publicationId,
        profile: { userId: req.user!.sub },
      },
    });

    if (!existingPublication) {
      return reply.code(404).send({ message: "Publication not found" });
    }

    const publication = await prisma.publication.update({
      where: { id: publicationId },
      data,
    });

    return reply.send({ publication });
  });

  // Protected: Delete publication (Faculty only)
  app.delete("/v1/profiles/me/publications/:publicationId", {
    preHandler: [requireAuth, requireRole(["FACULTY", "HEAD_ADMIN"])],
    schema: {
      tags: ["publications"],
      params: z.object({ publicationId: z.string().cuid() }),
      response: { 204: z.any() },
    },
  }, async (req, reply) => {
    const { publicationId } = req.params as { publicationId: string };

    // Check ownership
    const existingPublication = await prisma.publication.findFirst({
      where: { 
        id: publicationId,
        profile: { userId: req.user!.sub },
      },
    });

    if (!existingPublication) {
      return reply.code(404).send({ message: "Publication not found" });
    }

    await prisma.publication.delete({
      where: { id: publicationId },
    });

    return reply.code(204).send({ message: "Publication deleted successfully" });
  });

  // Protected: Get my experiences
  app.get("/v1/profile/me/experiences", {
    preHandler: requireAuth,
    schema: {
      tags: ["experiences"],
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const userId = req.user!.sub;

    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: { experiences: true },
    });

    return reply.send({ experiences: profile?.experiences || [] });
  });

  // Protected: Create experience
  app.post("/v1/profile/experiences", {
    preHandler: requireAuth,
    schema: {
      tags: ["experiences"],
      body: experienceSchema,
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const data = req.body as z.infer<typeof experienceSchema>;
    const userId = req.user!.sub;

    // Ensure profile exists
    await prisma.profile.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    const experience = await prisma.experience.create({
      data: {
        ...data,
        profile: { connect: { userId } },
      },
    });

    return reply.send({ experience });
  });

  // Protected: Update experience
  app.put("/v1/profile/experiences/:id", {
    preHandler: requireAuth,
    schema: {
      tags: ["experiences"],
      params: z.object({ id: z.string().cuid() }),
      body: experienceSchema,
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = req.body as z.infer<typeof experienceSchema>;
    const userId = req.user!.sub;

    // Verify ownership through profile
    const existingExperience = await prisma.experience.findFirst({
      where: { 
        id,
        profile: { userId }
      },
    });

    if (!existingExperience) {
      return reply.code(404).send({ message: "Experience not found or access denied" });
    }

    const experience = await prisma.experience.update({
      where: { id },
      data,
    });

    return reply.send({ experience });
  });

  // Protected: Delete experience
  app.delete("/v1/profile/experiences/:id", {
    preHandler: requireAuth,
    schema: {
      tags: ["experiences"],
      params: z.object({ id: z.string().cuid() }),
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.user!.sub;

    // Verify ownership through profile
    const existingExperience = await prisma.experience.findFirst({
      where: { 
        id,
        profile: { userId }
      },
    });

    if (!existingExperience) {
      return reply.code(404).send({ message: "Experience not found or access denied" });
    }

    await prisma.experience.delete({
      where: { id },
    });

    return reply.send({ message: "Experience deleted successfully" });
  });

  // Protected: Create badge definition (Faculty/Admin only)
  app.post("/v1/badge-definitions", {
    preHandler: [requireAuth, requireRole(["FACULTY", "DEPT_ADMIN", "HEAD_ADMIN"])],
    schema: {
      tags: ["badges"],
      body: badgeDefinitionSchema,
      response: { 201: z.any() },
    },
  }, async (req, reply) => {
    const data = req.body as z.infer<typeof badgeDefinitionSchema>;

    const badgeDefinition = await prisma.badgeDefinition.create({
      data: {
        ...data,
        createdBy: req.user!.sub,
      },
    });

    return reply.code(201).send({ badgeDefinition });
  });

  // Protected: Award badge (Faculty/Admin only)
  app.post("/v1/badges/award", {
    preHandler: [requireAuth, requireRole(["FACULTY", "DEPT_ADMIN", "HEAD_ADMIN"])],
    schema: {
      tags: ["badges"],
      body: awardBadgeSchema,
      response: { 201: z.any() },
    },
  }, async (req, reply) => {
    const data = req.body as z.infer<typeof awardBadgeSchema>;
    // Verify the target user exists in auth service
    const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
    try {
      const userResponse = await axios.get(`${authServiceUrl}/v1/users/${data.userId}`, {
        headers: {
          Authorization: req.headers.authorization,
        },
      });
      
      if (!userResponse.data) {
        return reply.code(404).send({
          error: "User not found",
          message: `User with ID ${data.userId} does not exist`,
        });
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        return reply.code(404).send({
          error: "User not found", 
          message: `User with ID ${data.userId} does not exist`,
        });
      }
      return reply.code(500).send({
        error: "Failed to verify user",
        message: "Could not verify user existence",
      });
    }

    // Ensure target user's profile exists
    await prisma.profile.upsert({
      where: { userId: data.userId },
      update: {},
      create: { 
        userId: data.userId,
      },
    });

    const badge = await prisma.studentBadge.create({
      data: {
        studentId: data.userId,
        badgeId: data.badgeDefinitionId,
        awardedBy: req.user!.sub,
        reason: data.reason,
      },
      include: {
        badge: true,
      },
    });

    return reply.code(201).send({ badge });
  });

  // Public: List badge definitions
  app.get("/v1/badge-definitions", {
    schema: {
      tags: ["badges"],
      response: { 200: z.any() },
    },
  }, async (_req, reply) => {
    const badgeDefinitions = await prisma.badgeDefinition.findMany({
      orderBy: { createdAt: "desc" },
    });
    reply.code(200).send({ badgeDefinitions });
  });

  // Get badges for a specific user
  app.get("/v1/profile/badges/:userId", {
    preHandler: [requireAuth],
    schema: {
      tags: ["badges"],
      params: z.object({
        userId: z.string().cuid(),
      }),
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const { userId } = req.params as { userId: string };

    const badges = await prisma.studentBadge.findMany({
      where: { studentId: userId },
      include: {
        badge: true,
      },
      orderBy: { awardedAt: "desc" },
    });

    reply.code(200).send({ badges });
  });

  // Get recent badge awards
  app.get("/v1/badges/recent", {
    preHandler: [requireAuth],
    schema: {
      tags: ["badges"],
      querystring: z.object({
        limit: z.coerce.number().min(1).max(100).default(10),
      }),
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const { limit } = req.query as { limit: number };

    const awards = await prisma.studentBadge.findMany({
      take: limit,
      include: {
        badge: true,
      },
      orderBy: { awardedAt: "desc" },
    });

    reply.code(200).send({ awards });
  });

  // Get badge award counts
  app.get("/v1/badges/counts", {
    preHandler: [requireAuth],
    schema: {
      tags: ["badges"],
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const badgeDefinitions = await prisma.badgeDefinition.findMany({
      select: { id: true },
    });

    const counts: Record<string, number> = {};
    
    for (const badge of badgeDefinitions) {
      const count = await prisma.studentBadge.count({
        where: { badgeId: badge.id },
      });
      counts[badge.id] = count;
    }

    reply.code(200).send({ counts });
  });
}
