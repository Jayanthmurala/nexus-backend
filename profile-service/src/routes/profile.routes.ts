import { FastifyInstance } from "fastify";
import { z } from "zod";
import axios from "axios";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { errorResponseSchema, messageResponseSchema } from "../schemas/profile.schemas";

// Badge award post creation function
async function createBadgeAwardPost(badge: any, awardedBy: any, studentInfo: any) {
  const networkServiceUrl = process.env.NETWORK_SERVICE_URL || 'http://localhost:4005';
  
  // Check if auto-post is enabled (could be a user preference or system setting)
  const autoPostEnabled = process.env.BADGE_AUTO_POST_ENABLED !== 'false';
  if (!autoPostEnabled) return;

  const postData = {
    type: 'BADGE_AWARD',
    content: `🎉 Congratulations to ${studentInfo?.displayName || studentInfo?.name || 'Student'} for earning the "${badge.badge.name}" badge!\n\n${badge.reason}`,
    visibility: 'COLLEGE',
    badgeData: {
      badgeId: badge.badge.id,
      badgeName: badge.badge.name,
      description: badge.badge.description,
      criteria: badge.badge.criteria || badge.reason,
      rarity: badge.badge.rarity?.toLowerCase() || 'common',
      awardedTo: studentInfo?.displayName || studentInfo?.name || 'Student',
      awardedToId: badge.studentId,
      awardedAt: badge.awardedAt,
      awardedByName: badge.awardedByName || awardedBy.displayName || awardedBy.name
    },
    tags: ['badge', 'achievement', badge.badge.category?.toLowerCase()].filter(Boolean)
  };

  try {
    const response = await fetch(`${networkServiceUrl}/v1/posts/specialized`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${awardedBy.token || ''}`
      },
      body: JSON.stringify(postData)
    });

    if (!response.ok) {
      throw new Error(`Network service returned ${response.status}`);
    }

    const result = await response.json();
    console.log('Badge award post created successfully:', result.id);
    return result;
  } catch (error) {
    console.error('Failed to create badge award post:', error);
    throw error;
  }
}

// Validation schemas
const updateProfileSchema = z.object({
  // User model fields (displayName and avatarUrl are editable)
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional().or(z.literal("")),
  
  // User model fields that need to be updated via auth service
  year: z.number().int().min(1).max(6).optional(),
  department: z.string().max(100).optional(),
  
  // Profile model fields (all editable)
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(1000).optional(),
  skills: z.array(z.string()).optional(),
  expertise: z.array(z.string()).optional(),
  linkedIn: z.string().url().optional().or(z.literal("")),
  github: z.string().url().optional().or(z.literal("")),
  twitter: z.string().url().optional().or(z.literal("")),
  resumeUrl: z.string().url().optional().or(z.literal("")),
  contactInfo: z.string().max(500).optional(),
  phoneNumber: z.string().max(20).optional(),
  alternateEmail: z.string().email().optional(),
});

const createProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(1000).optional(),
  skills: z.array(z.string()).optional(),
  linkedIn: z.string().url().optional().or(z.literal("")),
  github: z.string().url().optional().or(z.literal("")),
  twitter: z.string().url().optional().or(z.literal("")),
  resumeUrl: z.string().url().optional().or(z.literal("")),
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
  icon: z.string().optional(), // Allow any string (emojis or URLs)
  color: z.string().optional(),
  category: z.string().optional(),
  criteria: z.string().optional(), // Add missing criteria field
  rarity: z.enum(["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"]).default("COMMON"),
});

const awardBadgeSchema = z.object({
  badgeDefinitionId: z.string().cuid(),
  userId: z.string().cuid(),
  reason: z.string().min(1, "Reason is required"),
  projectId: z.string().cuid().optional(),
  eventId: z.string().cuid().optional(),
  awardedByName: z.string().optional(),
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
          skills: [],
          expertise: [],
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
    const { displayName, avatarUrl, year, department, ...profileData } = data;

    // Update user model fields in auth service if provided
    if (displayName || avatarUrl || year !== undefined || department) {
      try {
        const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
        const updateData: any = {};
        if (displayName) updateData.displayName = displayName;
        if (avatarUrl) updateData.avatarUrl = avatarUrl;
        if (year !== undefined) updateData.year = year;
        if (department) updateData.department = department;
        
        await axios.put(`${authServiceUrl}/v1/users/${userId}`, 
          updateData,
          {
            headers: {
              'Authorization': req.headers.authorization || '',
            },
            timeout: 5000,
          }
        );
      } catch (error) {
        console.error('Failed to update user data in auth service:', error);
        return reply.code(500).send({ message: "Failed to update user data" });
      }
    }

    // Update profile data in profile service
    const profile = await prisma.profile.upsert({
      where: { userId },
      update: profileData,
      create: {
        userId,
        skills: [],
        expertise: [],
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
          skills: [],
          expertise: [],
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
        skills: [],
        expertise: [],
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
        skills: [],
        expertise: [],
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
        skills: [],
        expertise: [],
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
      create: { 
        userId,
        skills: [],
        expertise: [],
      },
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
      tags: ["profiles"],
      params: z.object({ id: z.string().cuid() }),
      response: { 200: z.any(), 404: errorResponseSchema },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.user!.sub;

    // Check if experience exists and belongs to user
    const experience = await prisma.experience.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!experience || experience.profile.userId !== userId) {
      return reply.code(404).send({ message: "Experience not found" });
    }

    await prisma.experience.delete({
      where: { id },
    });

    return reply.send({ message: "Experience deleted successfully" });
  });

  // Skills CRUD endpoints
  
  // Protected: Get my skills
  app.get("/v1/profile/me/skills", {
    preHandler: requireAuth,
    schema: {
      tags: ["profiles"],
      response: { 200: z.object({ skills: z.array(z.string()) }) },
    },
  }, async (req, reply) => {
    const userId = req.user!.sub;

    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: { skills: true },
    });

    return reply.send({ skills: profile?.skills || [] });
  });

  // Protected: Update my skills
  app.put("/v1/profile/me/skills", {
    preHandler: requireAuth,
    schema: {
      tags: ["profiles"],
      body: z.object({ skills: z.array(z.string()) }),
      response: { 200: z.object({ skills: z.array(z.string()) }) },
    },
  }, async (req, reply) => {
    const { skills } = req.body as { skills: string[] };
    const userId = req.user!.sub;

    // Validate and clean skills
    const cleanedSkills = skills
      .map(skill => skill.trim())
      .filter(skill => skill.length > 0)
      .slice(0, 50); // Limit to 50 skills

    const profile = await prisma.profile.upsert({
      where: { userId },
      update: { skills: cleanedSkills },
      create: {
        userId,
        skills: cleanedSkills,
        expertise: [],
      },
      select: { skills: true },
    });

    return reply.send({ skills: profile.skills });
  });

  // Protected: Add a skill
  app.post("/v1/profile/me/skills", {
    preHandler: requireAuth,
    schema: {
      tags: ["profiles"],
      body: z.object({ skill: z.string().min(1).max(100) }),
      response: { 200: z.object({ skills: z.array(z.string()) }) },
    },
  }, async (req, reply) => {
    const { skill } = req.body as { skill: string };
    const userId = req.user!.sub;

    const cleanedSkill = skill.trim();
    if (!cleanedSkill) {
      return reply.code(400).send({ message: "Skill cannot be empty" });
    }

    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: { skills: true },
    });

    const currentSkills = profile?.skills || [];
    
    // Check if skill already exists (case insensitive)
    if (currentSkills.some(s => s.toLowerCase() === cleanedSkill.toLowerCase())) {
      return reply.code(400).send({ message: "Skill already exists" });
    }

    // Limit to 50 skills
    if (currentSkills.length >= 50) {
      return reply.code(400).send({ message: "Maximum 50 skills allowed" });
    }

    const updatedSkills = [...currentSkills, cleanedSkill];

    const updatedProfile = await prisma.profile.upsert({
      where: { userId },
      update: { skills: updatedSkills },
      create: {
        userId,
        skills: updatedSkills,
        expertise: [],
      },
      select: { skills: true },
    });

    return reply.send({ skills: updatedProfile.skills });
  });

  // Protected: Remove a skill
  app.delete("/v1/profile/me/skills/:skill", {
    preHandler: requireAuth,
    schema: {
      tags: ["profiles"],
      params: z.object({ skill: z.string() }),
      response: { 200: z.object({ skills: z.array(z.string()) }) },
    },
  }, async (req, reply) => {
    const { skill } = req.params as { skill: string };
    const userId = req.user!.sub;

    const decodedSkill = decodeURIComponent(skill);

    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: { skills: true },
    });

    const currentSkills = profile?.skills || [];
    const updatedSkills = currentSkills.filter(s => s !== decodedSkill);

    const updatedProfile = await prisma.profile.upsert({
      where: { userId },
      update: { skills: updatedSkills },
      create: {
        userId,
        skills: updatedSkills,
        expertise: [],
      },
      select: { skills: true },
    });

    return reply.send({ skills: updatedProfile.skills });
  });

  // Protected: Get users directory for network discovery
  app.get("/v1/users", {
    preHandler: requireAuth,
    schema: {
      tags: ["users"],
      querystring: z.object({
        offset: z.string().transform(Number).optional(),
        limit: z.string().transform(Number).optional(),
        search: z.string().optional(),
        collegeId: z.string().optional(),
      }),
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const { offset = 0, limit = 20, search, collegeId } = req.query as any;

    try {
      // Get users from auth service
      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
      const queryParams = new URLSearchParams();
      queryParams.append('offset', offset.toString());
      queryParams.append('limit', Math.min(limit, 100).toString()); // Cap at 100
      if (search) queryParams.append('search', search);
      if (collegeId) queryParams.append('collegeId', collegeId);

      const response = await axios.get(`${authServiceUrl}/v1/users?${queryParams}`, {
        headers: {
          'Authorization': req.headers.authorization || '',
        },
        timeout: 10000,
      });

      if (!response.data || !response.data.users) {
        return reply.send({
          users: [],
          nextOffset: offset,
          hasMore: false,
          totalCount: 0
        });
      }

      // Enhance users with profile data
      const enhancedUsers = await Promise.all(
        response.data.users.map(async (user: any) => {
          try {
            const profile = await prisma.profile.findUnique({
              where: { userId: user.id },
              select: {
                name: true,
                bio: true,
                skills: true,
              },
            });

            return {
              id: user.id,
              name: profile?.name || user.displayName || user.name,
              email: user.email,
              avatarUrl: user.avatarUrl,
              college: user.collegeName,
              collegeId: user.collegeId,
              department: user.department,
              year: user.year,
              bio: profile?.bio,
              skills: profile?.skills || [],
            };
          } catch (error) {
            console.error(`Error enhancing user ${user.id}:`, error);
            return {
              id: user.id,
              name: user.displayName || user.name,
              email: user.email,
              avatarUrl: user.avatarUrl,
              college: user.collegeName,
              collegeId: user.collegeId,
              department: user.department,
              year: user.year,
              bio: '',
              skills: [],
            };
          }
        })
      );

      return reply.send({
        users: enhancedUsers,
        nextOffset: response.data.nextOffset || offset + limit,
        hasMore: response.data.hasMore || false,
        totalCount: response.data.totalCount || enhancedUsers.length
      });
    } catch (error) {
      console.error('Error fetching users directory:', error);
      return reply.code(500).send({
        message: 'Failed to fetch users directory'
      });
    }
  });

  // Protected: Get user suggestions for follow recommendations
  app.get("/v1/users/suggestions", {
    preHandler: requireAuth,
    schema: {
      tags: ["users"],
      querystring: z.object({
        userId: z.string().optional(),
        limit: z.string().transform(Number).optional(),
      }),
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const { userId, limit = 10 } = req.query as any;
    const currentUserId = userId || req.user!.sub;

    try {
      // Get user's college info for better suggestions
      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
      const userResponse = await axios.get(`${authServiceUrl}/v1/users/${currentUserId}`, {
        headers: {
          'Authorization': req.headers.authorization || '',
        },
        timeout: 5000,
      });

      const currentUser = userResponse.data.user;
      
      // Get users from same college
      const queryParams = new URLSearchParams();
      queryParams.append('limit', Math.min(limit * 2, 50).toString()); // Get more to filter
      if (currentUser?.collegeId) {
        queryParams.append('collegeId', currentUser.collegeId);
      }

      const suggestionsResponse = await axios.get(`${authServiceUrl}/v1/users?${queryParams}`, {
        headers: {
          'Authorization': req.headers.authorization || '',
        },
        timeout: 10000,
      });

      if (!suggestionsResponse.data || !suggestionsResponse.data.users) {
        return reply.send({ users: [] });
      }

      // Filter out current user and enhance with profile data
      const suggestions = suggestionsResponse.data.users
        .filter((user: any) => user.id !== currentUserId)
        .slice(0, limit);

      const enhancedSuggestions = await Promise.all(
        suggestions.map(async (user: any) => {
          try {
            const profile = await prisma.profile.findUnique({
              where: { userId: user.id },
              select: {
                name: true,
                bio: true,
                skills: true,
              },
            });

            return {
              id: user.id,
              name: profile?.name || user.displayName || user.name,
              avatarUrl: user.avatarUrl,
              college: user.collegeName,
              department: user.department,
              bio: profile?.bio,
              skills: profile?.skills || [],
            };
          } catch (error) {
            return {
              id: user.id,
              name: user.displayName || user.name,
              avatarUrl: user.avatarUrl,
              college: user.collegeName,
              department: user.department,
              bio: '',
              skills: [],
            };
          }
        })
      );

      return reply.send({ users: enhancedSuggestions });
    } catch (error) {
      console.error('Error fetching user suggestions:', error);
      return reply.send({ users: [] });
    }
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
    
    console.log('Badge creation request body:', JSON.stringify(req.body, null, 2));
    console.log('Validated data:', JSON.stringify(data, null, 2));

    // Explicitly handle optional fields to ensure they're saved properly
    const createData: any = {
      name: data.name,
      description: data.description,
      rarity: data.rarity,
      createdBy: req.user!.sub,
    };

    // Add optional fields only if they exist and are not empty
    if (data.icon && data.icon.trim()) {
      createData.icon = data.icon;
    }
    if (data.color && data.color.trim()) {
      createData.color = data.color;
    }
    if (data.category && data.category.trim()) {
      createData.category = data.category;
    }
    if (data.criteria && data.criteria.trim()) {
      createData.criteria = data.criteria;
    }

    console.log('Final create data:', JSON.stringify(createData, null, 2));

    const badgeDefinition = await prisma.badgeDefinition.create({
      data: createData,
    });

    console.log('Created badge definition:', JSON.stringify(badgeDefinition, null, 2));
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
    
    console.log('Badge award request body:', JSON.stringify(req.body, null, 2));
    console.log('Validated data:', JSON.stringify(data, null, 2));
    
    // Verify the target user exists in auth service and get user info
    const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
    let studentInfo: any = null;
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
      
      studentInfo = userResponse.data.user;
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
        skills: [],
        expertise: [],
      },
    });

    const badge = await prisma.studentBadge.create({
      data: {
        studentId: data.userId,
        badgeId: data.badgeDefinitionId,
        awardedBy: req.user!.sub,
        reason: data.reason,
        projectId: data.projectId,
        eventId: data.eventId,
        awardedByName: data.awardedByName,
      },
      include: {
        badge: true,
      },
    });

    // Auto-create badge award post (if enabled)
    try {
      await createBadgeAwardPost(badge, req.user!, studentInfo);
    } catch (error) {
      console.error('Failed to create badge award post:', error);
      // Don't fail the badge creation if post creation fails
    }

    return reply.code(201).send({ badge });
  });

  // Protected: Export badge awards data (Faculty/Admin only)
  app.get("/v1/badges/export", {
    preHandler: [requireAuth, requireRole(["FACULTY", "DEPT_ADMIN", "HEAD_ADMIN"])],
    schema: {
      tags: ["badges"],
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    try {
      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
      
      // Fetch all badge awards with badge definitions 
      const awards = await prisma.studentBadge.findMany({
        include: {
          badge: true,
        },
        orderBy: {
          awardedAt: 'desc',
        },
      });

      // Fetch student details from auth service for each unique student
      const studentIds = [...new Set(awards.map(award => award.studentId))];
      const studentDetails = new Map();

      for (const studentId of studentIds) {
        try {
          const userResponse = await axios.get(`${authServiceUrl}/v1/users/${studentId}`, {
            headers: {
              Authorization: req.headers.authorization,
            },
          });
          if (userResponse.data && userResponse.data.user) {
            studentDetails.set(studentId, userResponse.data.user);
          }
        } catch (error) {
          console.error(`Failed to fetch details for student ${studentId}:`, error);
        }
      }

      // Format export data
      const exportData = awards.map(award => {
        const studentInfo = studentDetails.get(award.studentId);
        console.log(`Export mapping for ${award.studentId}:`, studentInfo);
        return {
          badgeName: award.badge.name,
          studentName: studentInfo?.displayName || studentInfo?.name || 'Unknown',
          collegeMemberId: studentInfo?.collegeMemberId || 'N/A',
          department: studentInfo?.department || 'N/A',
          awardedAt: award.awardedAt,
          awardedByName: award.awardedByName || 'Unknown',
          reason: award.reason,
          badgeCategory: award.badge.category || 'N/A',
          badgeRarity: award.badge.rarity,
          projectName: award.projectId ? `Project-${award.projectId}` : 'N/A', // TODO: Fetch actual project name
          eventName: award.eventId ? `Event-${award.eventId}` : 'N/A', // TODO: Fetch actual event name
        };
      });

      return reply.send(exportData);
    } catch (error) {
      console.error('Export error:', error);
      return reply.code(500).send({
        error: 'Export failed',
        message: 'Failed to export badge data',
      });
    }
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

  // Protected: Get recent badge awards (Faculty/Admin only)
  app.get("/v1/badges/recent", {
    preHandler: [requireAuth, requireRole(["FACULTY", "DEPT_ADMIN", "HEAD_ADMIN"])],
    schema: {
      tags: ["badges"],
      querystring: z.object({
        limit: z.string().optional(),
      }),
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const { limit } = req.query as { limit?: string };
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
    
    if (!req.user?.id) {
      return reply.code(401).send({ error: "User not authenticated" });
    }
    const userId = req.user.id;

    // Filter awards by the faculty member who awarded them
    const awards = await prisma.studentBadge.findMany({
      where: {
        awardedBy: userId, // Only show badges awarded by this faculty member
      },
      take: limitNum,
      orderBy: { awardedAt: "desc" },
      include: {
        badge: true,
      },
    });

    // Fetch student details for display names and college member IDs
    const studentIds = [...new Set(awards.map(award => award.studentId))];
    const studentDetails = new Map();

    for (const studentId of studentIds) {
      try {
        const userResponse = await axios.get(`${authServiceUrl}/v1/users/${studentId}`, {
          headers: {
            Authorization: req.headers.authorization,
          },
        });
        console.log(`Auth service response for student ${studentId}:`, userResponse.data);
        if (userResponse.data && userResponse.data.user) {
          studentDetails.set(studentId, userResponse.data.user);
        }
      } catch (error) {
        console.error(`Failed to fetch details for student ${studentId}:`, error);
      }
    }

    // Enhance awards with student details
    const enhancedAwards = awards.map(award => {
      const studentInfo = studentDetails.get(award.studentId);
      console.log(`Student ${award.studentId} details:`, studentInfo);
      return {
        ...award,
        studentName: studentInfo?.displayName || studentInfo?.name,
        collegeMemberId: studentInfo?.collegeMemberId,
      };
    });

    return reply.send({ awards: enhancedAwards });
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

  // Check event creation eligibility for a user
  app.get("/v1/badges/eligibility/:userId", {
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
    const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';

    try {
      // Get user's college info from auth service
      const userResponse = await axios.get(`${authServiceUrl}/v1/users/${userId}`, {
        headers: {
          Authorization: req.headers.authorization,
        },
      });
      
      const user = userResponse.data?.user;
      if (!user?.collegeId) {
        return reply.code(400).send({ 
          error: "User college information not found",
          canCreate: false,
          missing: []
        });
      }

      // Check cache first
      const cached = await prisma.badgeEligibilityCache.findUnique({
        where: { userId },
      });

      if (cached && cached.expiresAt > new Date()) {
        return reply.send({
          canCreate: cached.canCreate,
          badgeCount: cached.badgeCount,
          categories: cached.categories,
          lastChecked: cached.lastChecked,
        });
      }

      // Get badge policy for user's college
      const policy = await prisma.badgePolicy.findUnique({
        where: { collegeId: user.collegeId },
      });

      const requiredBadges = policy?.eventCreationRequired || 8;
      const requiredCategories = policy?.categoryDiversityMin || 4;

      // Get user's badges with categories
      const userBadges = await prisma.studentBadge.findMany({
        where: { studentId: userId },
        include: {
          badge: {
            select: { category: true, isActive: true },
          },
        },
      });

      const activeBadges = userBadges.filter(award => award.badge.isActive);
      const categories = [...new Set(activeBadges.map(award => award.badge.category).filter((cat): cat is string => Boolean(cat)))];
      
      const canCreate = activeBadges.length >= requiredBadges && categories.length >= requiredCategories;

      // Update cache
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      await prisma.badgeEligibilityCache.upsert({
        where: { userId },
        update: {
          canCreate,
          badgeCount: activeBadges.length,
          categories,
          lastChecked: new Date(),
          expiresAt,
        },
        create: {
          userId,
          canCreate,
          badgeCount: activeBadges.length,
          categories,
          expiresAt,
        },
      });

      return reply.send({
        canCreate,
        badgeCount: activeBadges.length,
        requiredBadges,
        categories,
        requiredCategories,
        lastChecked: new Date(),
      });

    } catch (error) {
      console.error('Badge eligibility check failed:', error);
      return reply.code(500).send({
        error: "Failed to check badge eligibility",
        canCreate: false,
      });
    }
  });

  // Manage badge policies (Admin only)
  app.post("/v1/badges/policies", {
    preHandler: [requireAuth, requireRole(["HEAD_ADMIN"])],
    schema: {
      tags: ["badges"],
      body: z.object({
        collegeId: z.string().cuid(),
        departmentId: z.string().optional(),
        eventCreationRequired: z.number().int().min(1).default(8),
        categoryDiversityMin: z.number().int().min(1).default(4),
      }),
      response: { 201: z.any() },
    },
  }, async (req, reply) => {
    const data = req.body as any;

    const policy = await prisma.badgePolicy.create({
      data,
    });

    return reply.code(201).send({ policy });
  });

  // Get badge policy for a college
  app.get("/v1/badges/policies/:collegeId", {
    preHandler: [requireAuth],
    schema: {
      tags: ["badges"],
      params: z.object({
        collegeId: z.string().cuid(),
      }),
      response: { 200: z.any() },
    },
  }, async (req, reply) => {
    const { collegeId } = req.params as { collegeId: string };

    const policy = await prisma.badgePolicy.findUnique({
      where: { collegeId },
    });

    if (!policy) {
      // Return default policy
      return reply.send({
        policy: {
          collegeId,
          eventCreationRequired: 8,
          categoryDiversityMin: 4,
          isActive: true,
        }
      });
    }

    return reply.send({ policy });
  });

}
