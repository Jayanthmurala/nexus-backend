import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { verifySignedRequest } from "../utils/hmac";
import { env } from "../config/env";
import { prisma } from "../db";
import { requireAuth } from "../middlewares/auth";

export default async function adsRoutes(app: FastifyInstance) {
  // Internal: Create AD post (HMAC)
  app.post("/internal/ads", {
    schema: {
      tags: ["ads"],
      body: z.object({
        adCampaignId: z.string(),
        sponsorName: z.string().default("Sponsored"),
        creative: z.object({
          headline: z.string().min(1).max(120),
          body: z.string().max(2000).optional(),
          mediaId: z.string().optional(),
          clickUrl: z.string().url().optional(),
        }),
        target: z.object({
          collegeIds: z.array(z.string()).optional(),
          roles: z.array(z.string()).optional(),
        }).optional(),
        budget: z.object({
          totalImpressions: z.number().int().positive().optional(),
          overallDailyCap: z.number().int().positive().optional(),
          perUserDailyCap: z.number().int().positive().optional(),
          startAt: z.string().datetime().optional(),
          endAt: z.string().datetime().optional(),
        }).optional(),
        status: z.enum(["ACTIVE", "PAUSED", "ENDED", "EXHAUSTED"]).default("ACTIVE"),
      }),
      response: {
        201: z.object({ id: z.string(), status: z.string() })
      }
    }
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    verifySignedRequest(req, env.ADVANCEMENT_HMAC_SECRET);
    const body = req.body as any;

    const content = [body.creative.headline, body.creative.body].filter(Boolean).join("\n\n");

    const created = await prisma.$transaction(async (tx: any) => {
      const post = await tx.post.create({
        data: {
          authorId: "ads-system",
          authorDisplayName: body.sponsorName || "Sponsored",
          authorAvatarUrl: null,
          authorCollegeId: "global",
          visibility: "PUBLIC" as any,
          type: "AD" as any,
          content,
          adCampaignId: body.adCampaignId,
          adMetaJson: JSON.stringify(body.creative),
          adTargetJson: body.target ? JSON.stringify(body.target) : null,
          adBudgetJson: body.budget ? JSON.stringify(body.budget) : null,
          adStatus: body.status as any,
        } as any,
      });

      if (body.creative.mediaId) {
        await tx.postMedia.create({
          data: {
            postId: post.id,
            mediaId: body.creative.mediaId,
            order: 0,
          } as any,
        });
      }

      return post;
    });

    return reply.code(201).send({ id: created.id, status: created.adStatus || "ACTIVE" });
  });

  // Internal: Update AD (status/target/budget)
  app.patch("/internal/ads/:id", {
    schema: {
      tags: ["ads"],
      params: z.object({ id: z.string() }),
      body: z.object({
        status: z.enum(["ACTIVE", "PAUSED", "ENDED", "EXHAUSTED"]).optional(),
        target: z.any().optional(),
        budget: z.any().optional(),
      }),
      response: { 200: z.object({ id: z.string(), status: z.string() }) }
    }
  }, async (req: FastifyRequest) => {
    verifySignedRequest(req, env.ADVANCEMENT_HMAC_SECRET);
    const { id } = (req.params as any);
    const body = req.body as any;

    const updated = await prisma.post.update({
      where: { id },
      data: {
        adStatus: body.status as any,
        adTargetJson: body.target ? JSON.stringify(body.target) : undefined,
        adBudgetJson: body.budget ? JSON.stringify(body.budget) : undefined,
      } as any,
      select: { id: true, adStatus: true },
    });

    return { id: updated.id, status: updated.adStatus || "" };
  });

  // Internal: Stats
  app.get("/internal/ads/:id/stats", {
    schema: {
      tags: ["ads"],
      params: z.object({ id: z.string() }),
      querystring: z.object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      }),
      response: {
        200: z.object({ impressions: z.number(), clicks: z.number() })
      }
    }
  }, async (req: FastifyRequest) => {
    verifySignedRequest(req, env.ADVANCEMENT_HMAC_SECRET);
    const { id } = (req.params as any);
    const q = req.query as any;

    const whereRange: any = {};
    if (q.from || q.to) {
      whereRange.createdAt = {} as any;
      if (q.from) whereRange.createdAt.gte = new Date(q.from);
      if (q.to) whereRange.createdAt.lte = new Date(q.to);
    }

    const [impressions, clicks] = await Promise.all([
      prisma.adImpression.count({ where: { postId: id, ...whereRange } }),
      prisma.adClick.count({ where: { postId: id, ...whereRange } }),
    ]);

    return { impressions, clicks };
  });

  // Public: Record impression (JWT)
  app.post("/v1/ads/:id/impression", {
    schema: {
      tags: ["ads"],
      params: z.object({ id: z.string() }),
      response: { 204: z.null() }
    }
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAuth(req as any);
    const { id } = (req.params as any);

    const post = await prisma.post.findUnique({ where: { id }, select: { id: true, type: true, adStatus: true } });
    if (!post || post.type !== ("AD" as any) || post.adStatus !== ("ACTIVE" as any)) {
      reply.code(404);
      return null;
    }

    await prisma.adImpression.create({ data: { postId: id, userId: user.sub } });
    reply.code(204);
    return null;
  });

  // Public: Record click (JWT)
  app.post("/v1/ads/:id/click", {
    schema: {
      tags: ["ads"],
      params: z.object({ id: z.string() }),
      response: { 204: z.null() }
    }
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAuth(req as any);
    const { id } = (req.params as any);

    const post = await prisma.post.findUnique({ where: { id }, select: { id: true, type: true, adStatus: true } });
    if (!post || post.type !== ("AD" as any) || post.adStatus !== ("ACTIVE" as any)) {
      reply.code(404);
      return null;
    }

    await prisma.adClick.create({ data: { postId: id, userId: user.sub } });
    reply.code(204);
    return null;
  });
}
