import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middlewares/auth";
import { verifyAccessToken } from "../utils/jwt";
import { Prisma } from "@prisma/client";

export default async function networkRoutes(app: FastifyInstance) {
  app.get("/v1/network/health", {
    schema: {
      tags: ["network"],
      response: {
        200: z.object({ status: z.literal("ok") })
      }
    }
  }, async () => ({ status: "ok" }));

  app.get("/v1/network/feed", {
    schema: {
      tags: ["network"],
      querystring: z.object({
        scope: z.enum(["following", "college", "global"]).default("college"),
        cursor: z.string().optional(), // ISO date string of last item.createdAt
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }),
      response: {
        200: z.object({
          items: z.array(z.any()), // TODO: tighten when feed item shape stabilizes
          nextCursor: z.string().optional(),
        })
      }
    }
  }, async (req) => {
    const { scope = "college", cursor, limit = 20 } = (req.query as any) as {
      scope: "following" | "college" | "global";
      cursor?: string;
      limit: number;
    };

    // Base filters
    const where: any = {
      deletedAt: null,
      moderationStatus: "APPROVED",
    };

    // Pagination by createdAt (simple, stable enough for MVP)
    let cursorDate: Date | undefined;
    if (cursor) {
      const d = new Date(cursor);
      if (!isNaN(d.getTime())) cursorDate = d;
    }
    if (cursorDate) {
      where.createdAt = { lt: cursorDate };
    }

    if (scope === "global") {
      where.visibility = "PUBLIC";
    } else if (scope === "college") {
      // NOTE: Without user collegeId in JWT, we filter to COLLEGE-visible posts globally for now.
      where.visibility = "COLLEGE";
    } else if (scope === "following") {
      const payload = await requireAuth(req);
      const followees = await prisma.follow.findMany({
        where: { followerId: payload.sub },
        select: { followeeId: true },
        take: 1000,
      });
      const ids = followees.map((f: { followeeId: string }) => f.followeeId);
      if (ids.length === 0) return { items: [], nextCursor: undefined };
      where.authorId = { in: ids };
    }

    // Optionally parse Authorization header to personalize liked/bookmarked flags
    let userId: string | undefined;
    const auth = (req.headers as any)["authorization"] as string | undefined;
    if (auth?.startsWith("Bearer ")) {
      try {
        const payload = await verifyAccessToken(auth.slice("Bearer ".length));
        userId = payload.sub;
      } catch {}
    }

    const rows = await prisma.post.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        authorId: true,
        authorDisplayName: true,
        authorAvatarUrl: true,
        content: true,
        createdAt: true,
        visibility: true,
        type: true,
        likeCount: true,
        commentCount: true,
        shareCount: true,
        media: {
          select: {
            order: true,
            mediaRef: {
              select: {
                id: true,
                url: true,
                mimeType: true,
                width: true,
                height: true,
              },
            },
          },
        },
        tags: {
          select: { tag: true },
        },
        links: {
          select: { url: true, title: true, order: true },
          orderBy: { order: 'asc' },
        },
      },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, -1) : rows;

    // Personalization lookups for current page
    let likedSet = new Set<string>();
    let bookmarkedSet = new Set<string>();
    if (userId && pageRows.length > 0) {
      const postIds = pageRows.map((r) => r.id);
      const [likes, bookmarks] = await Promise.all([
        prisma.reaction.findMany({
          where: { userId, type: "LIKE" as any, postId: { in: postIds } },
          select: { postId: true },
        }),
        prisma.bookmark.findMany({
          where: { userId, postId: { in: postIds } },
          select: { postId: true },
        }),
      ]);
      likedSet = new Set(likes.map((l: { postId: string }) => l.postId));
      bookmarkedSet = new Set(bookmarks.map((b: { postId: string }) => b.postId));
    }

    const items = pageRows.map((r: any) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      likedByMe: userId ? likedSet.has(r.id) : false,
      bookmarkedByMe: userId ? bookmarkedSet.has(r.id) : false,
      media: Array.isArray(r.media)
        ? r.media
            .slice()
            .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
            .map((m: any) => ({
              id: m.mediaRef?.id,
              url: m.mediaRef?.url,
              mimeType: m.mediaRef?.mimeType,
              width: m.mediaRef?.width ?? null,
              height: m.mediaRef?.height ?? null,
            }))
        : [],
      tags: Array.isArray(r.tags) ? r.tags.map((t: any) => t.tag) : [],
      links: Array.isArray(r.links) ? r.links.map((l: any) => ({
        url: l.url,
        title: l.title,
        order: l.order,
      })) : [],
    }));
    const nextCursor = hasMore ? items[items.length - 1]?.createdAt : undefined;

    return { items, nextCursor };
  });

  // Create a new post
  app.post("/v1/posts", {
    schema: {
      tags: ["posts"],
      body: z.object({
        content: z.string().min(1).max(5000),
        visibility: z.enum(["PUBLIC", "COLLEGE"]).default("COLLEGE").optional(),
        type: z.enum(["STANDARD", "BADGE_AWARD", "SHARE"]).default("STANDARD").optional(),
        mediaIds: z.array(z.string()).max(10).optional(),
        tags: z.array(z.string()).max(20).optional(),
        links: z.array(z.object({
          url: z.string().url(),
          title: z.string().optional(),
        })).max(5).optional(),
      }),
      response: {
        201: z.object({
          id: z.string(),
          authorId: z.string(),
          authorDisplayName: z.string(),
          authorAvatarUrl: z.string().nullable().optional(),
          content: z.string().nullable().optional(),
          createdAt: z.string(),
          visibility: z.string(),
          type: z.string(),
          likeCount: z.number(),
          commentCount: z.number(),
          shareCount: z.number(),
          likedByMe: z.boolean(),
          bookmarkedByMe: z.boolean(),
          media: z
            .array(
              z.object({
                id: z.string(),
                url: z.string(),
                mimeType: z.string(),
                width: z.number().nullable().optional(),
                height: z.number().nullable().optional(),
              })
            )
            .optional(),
        })
      }
    }
  }, async (req, reply) => {
    const payload = await requireAuth(req);
    const { content, visibility = "COLLEGE", type = "STANDARD", mediaIds, tags, links } = (req.body as any) as {
      content: string;
      visibility?: "PUBLIC" | "COLLEGE";
      type?: "STANDARD" | "BADGE_AWARD" | "SHARE";
      mediaIds?: string[];
      tags?: string[];
      links?: Array<{ url: string; title?: string }>;
    };

    const authorDisplayName = (payload as any).displayName || payload.name || "User";
    const authorAvatarUrl = (payload as any).avatarUrl || (payload as any).picture || null;
    const authorCollegeId = (payload as any).collegeId || "unknown";

    const created = await prisma.$transaction(async (tx) => {
      // Validate provided media IDs belong to the user
      const ids = Array.isArray(mediaIds) ? mediaIds.filter(Boolean) : [];
      if (ids.length > 0) {
        const owned = await tx.media.findMany({
          where: { id: { in: ids }, ownerUserId: payload.sub },
          select: { id: true },
        });
        if (owned.length !== ids.length) {
          const err: any = new Error("Invalid mediaIds");
          err.statusCode = 400;
          throw err;
        }
      }

      const post = await tx.post.create({
        data: {
          authorId: payload.sub,
          authorDisplayName,
          authorAvatarUrl,
          authorCollegeId,
          visibility: visibility as any,
          type: type as any,
          content,
        },
        select: { id: true },
      });

      // Create media associations
      if (Array.isArray(mediaIds) && mediaIds.length > 0) {
        await tx.postMedia.createMany({
          data: mediaIds.map((mid, idx) => ({ postId: post.id, mediaId: mid, order: idx })),
          skipDuplicates: true,
        });
      }

      // Create tags
      if (Array.isArray(tags) && tags.length > 0) {
        await tx.postTag.createMany({
          data: tags.map((tag) => ({ postId: post.id, tag: tag.trim() })),
          skipDuplicates: true,
        });
      }

      // Create links
      if (Array.isArray(links) && links.length > 0) {
        await tx.postLink.createMany({
          data: links.map((link, idx) => ({ 
            postId: post.id, 
            url: link.url, 
            title: link.title || null,
            order: idx 
          })),
          skipDuplicates: true,
        });
      }

      // Return the full shape expected by client (including media info)
      const full = await tx.post.findUnique({
        where: { id: post.id },
        select: {
          id: true,
          authorId: true,
          authorDisplayName: true,
          authorAvatarUrl: true,
          content: true,
          createdAt: true,
          visibility: true,
          type: true,
          likeCount: true,
          commentCount: true,
          shareCount: true,
          media: {
            select: {
              order: true,
              mediaRef: { select: { id: true, url: true, mimeType: true, width: true, height: true } },
            },
          },
          tags: {
            select: { tag: true },
          },
          links: {
            select: { url: true, title: true, order: true },
            orderBy: { order: 'asc' },
          },
        },
      });
      return full as any;
    });

    const responseBody: any = {
      ...created,
      createdAt: created.createdAt.toISOString(),
      likedByMe: false,
      bookmarkedByMe: false,
      media: Array.isArray((created as any).media)
        ? (created as any).media
            .slice()
            .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
            .map((m: any) => ({
              id: m.mediaRef?.id,
              url: m.mediaRef?.url,
              mimeType: m.mediaRef?.mimeType,
              width: m.mediaRef?.width ?? null,
              height: m.mediaRef?.height ?? null,
            }))
        : [],
      tags: Array.isArray((created as any).tags) ? (created as any).tags.map((t: any) => t.tag) : [],
      links: Array.isArray((created as any).links) ? (created as any).links.map((l: any) => ({
        url: l.url,
        title: l.title,
        order: l.order,
      })) : [],
    };

    return reply.code(201).send(responseBody);
  });

  // Create a Media record (after uploading to storage/CDN)
  app.post("/v1/media", {
    schema: {
      tags: ["media"],
      body: z.object({
        storageKey: z.string().min(1),
        url: z.string().url(),
        mimeType: z.string().min(1),
        sizeBytes: z.number().int().positive(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
      response: {
        201: z.object({
          id: z.string(),
          url: z.string(),
          mimeType: z.string(),
          width: z.number().nullable().optional(),
          height: z.number().nullable().optional(),
        }),
      },
    },
  }, async (req, reply) => {
    const payload = await requireAuth(req);
    const { storageKey, url, mimeType, sizeBytes, width, height } = (req.body as any) as {
      storageKey: string;
      url: string;
      mimeType: string;
      sizeBytes: number;
      width?: number;
      height?: number;
    };

    const created = await prisma.media.create({
      data: {
        ownerUserId: payload.sub,
        storageKey,
        url,
        mimeType,
        sizeBytes,
        width,
        height,
      },
      select: { id: true, url: true, mimeType: true, width: true, height: true },
    });

    return reply.code(201).send(created);
  });

  // Like a post
  app.post("/v1/posts/:postId/like", {
    schema: {
      tags: ["reactions"],
      params: z.object({ postId: z.string().min(1) }),
      response: {
        200: z.object({ ok: z.literal(true), liked: z.boolean(), likeCount: z.number() })
      }
    }
  }, async (req) => {
    const payload = await requireAuth(req);
    const { postId } = (req.params as any) as { postId: string };
    const exists = await prisma.reaction.findFirst({ where: { postId, userId: payload.sub, type: "LIKE" } });
    if (exists) {
      const post = await prisma.post.findUnique({ where: { id: postId }, select: { likeCount: true } });
      return { ok: true, liked: false, likeCount: post?.likeCount || 0 };
    }
    await prisma.$transaction([
      prisma.reaction.create({ data: { postId, userId: payload.sub, type: "LIKE" as any } }),
      prisma.post.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } }),
    ]);
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { likeCount: true } });
    return { ok: true, liked: true, likeCount: post?.likeCount || 0 };
  });

  // Unlike a post
  app.delete("/v1/posts/:postId/like", {
    schema: {
      tags: ["reactions"],
      params: z.object({ postId: z.string().min(1) }),
      response: {
        200: z.object({ ok: z.literal(true), unliked: z.boolean(), likeCount: z.number() })
      }
    }
  }, async (req) => {
    const payload = await requireAuth(req);
    const { postId } = (req.params as any) as { postId: string };
    const del = await prisma.reaction.deleteMany({ where: { postId, userId: payload.sub, type: "LIKE" } });
    if (del.count > 0) {
      await prisma.post.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } });
    }
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { likeCount: true } });
    return { ok: true, unliked: del.count > 0, likeCount: post?.likeCount || 0 };
  });

  // Bookmark a post
  app.post("/v1/posts/:postId/bookmark", {
    schema: {
      tags: ["posts"],
      params: z.object({ postId: z.string().min(1) }),
      response: { 200: z.object({ ok: z.literal(true), bookmarked: z.boolean() }) }
    }
  }, async (req) => {
    const payload = await requireAuth(req);
    const { postId } = (req.params as any) as { postId: string };
    const exists = await prisma.bookmark.findFirst({ where: { postId, userId: payload.sub } });
    if (exists) return { ok: true, bookmarked: false };
    await prisma.bookmark.create({ data: { postId, userId: payload.sub } });
    return { ok: true, bookmarked: true };
  });

  // Remove bookmark
  app.delete("/v1/posts/:postId/bookmark", {
    schema: {
      tags: ["posts"],
      params: z.object({ postId: z.string().min(1) }),
      response: { 200: z.object({ ok: z.literal(true), unbookmarked: z.boolean() }) }
    }
  }, async (req) => {
    const payload = await requireAuth(req);
    const { postId } = (req.params as any) as { postId: string };
    const res = await prisma.bookmark.deleteMany({ where: { postId, userId: payload.sub } });
    return { ok: true, unbookmarked: res.count > 0 };
  });

  // List comments for a post
  app.get("/v1/posts/:postId/comments", {
    schema: {
      tags: ["comments"],
      params: z.object({ postId: z.string().min(1) }),
      querystring: z.object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }),
      response: {
        200: z.object({
          items: z.array(z.any()),
          nextCursor: z.string().optional(),
        })
      }
    }
  }, async (req) => {
    const { postId } = (req.params as any) as { postId: string };
    const { cursor, limit = 20 } = (req.query as any) as { cursor?: string; limit: number };

    const where: any = { postId, deletedAt: null, moderationStatus: "APPROVED" };
    let cursorDate: Date | undefined;
    if (cursor) {
      const d = new Date(cursor);
      if (!isNaN(d.getTime())) cursorDate = d;
    }
    if (cursorDate) where.createdAt = { lt: cursorDate };

    const rows = await prisma.comment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        postId: true,
        userId: true,
        userDisplayName: true,
        userAvatarUrl: true,
        content: true,
        createdAt: true,
      },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, -1) : rows).map((r: any) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    }));
    const nextCursor = hasMore ? items[items.length - 1]?.createdAt : undefined;
    return { items, nextCursor };
  });

  // Create a comment
  app.post("/v1/posts/:postId/comments", {
    schema: {
      tags: ["comments"],
      params: z.object({ postId: z.string().min(1) }),
      body: z.object({ content: z.string().min(1).max(2000) }),
      response: {
        201: z.object({
          id: z.string(),
          postId: z.string(),
          userId: z.string(),
          userDisplayName: z.string(),
          userAvatarUrl: z.string().nullable().optional(),
          content: z.string(),
          createdAt: z.string(),
        })
      }
    }
  }, async (req, reply) => {
    const payload = await requireAuth(req);
    const { postId } = (req.params as any) as { postId: string };
    const { content } = (req.body as any) as { content: string };

    const created = await prisma.$transaction(async (tx) => {
      const c = await tx.comment.create({
        data: {
          postId,
          userId: payload.sub,
          userDisplayName: (payload as any).displayName || payload.name || "User",
          userAvatarUrl: (payload as any).avatarUrl || (payload as any).picture || null,
          userCollegeId: (payload as any).collegeId || "unknown",
          content,
        },
        select: {
          id: true,
          postId: true,
          userId: true,
          userDisplayName: true,
          userAvatarUrl: true,
          content: true,
          createdAt: true,
        },
      });
      await tx.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });
      return c;
    });

    return reply.code(201).send({ ...created, createdAt: created.createdAt.toISOString() });
  });

  // Delete a comment (soft delete)
  app.delete("/v1/comments/:commentId", {
    schema: {
      tags: ["comments"],
      params: z.object({ commentId: z.string().min(1) }),
      response: {
        200: z.object({ ok: z.literal(true), deleted: z.boolean() })
      }
    }
  }, async (req) => {
    const payload = await requireAuth(req);
    const { commentId } = (req.params as any) as { commentId: string };
    const c = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!c || c.deletedAt) return { ok: true, deleted: false };
    if (c.userId !== payload.sub) {
      const err: any = new Error("Forbidden");
      err.statusCode = 403;
      throw err;
    }
    await prisma.$transaction(async (tx) => {
      await tx.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
      await tx.post.update({ where: { id: c.postId }, data: { commentCount: { decrement: 1 } } });
    });
    return { ok: true, deleted: true };
  });

  // Update a post
  app.put("/v1/posts/:postId", {
    schema: {
      tags: ["posts"],
      params: z.object({ postId: z.string().min(1) }),
      body: z.object({
        content: z.string().min(1).max(5000),
        visibility: z.enum(["PUBLIC", "COLLEGE"]).optional(),
        type: z.enum(["STANDARD", "BADGE_AWARD", "SHARE"]).optional(),
      }),
      response: {
        200: z.object({
          id: z.string(),
          content: z.string(),
          visibility: z.string(),
          type: z.string(),
          updatedAt: z.string(),
        })
      }
    }
  }, async (req, reply) => {
    const payload = await requireAuth(req);
    const { postId } = (req.params as any) as { postId: string };
    const { content, visibility, type } = (req.body as any) as {
      content: string;
      visibility?: "PUBLIC" | "COLLEGE";
      type?: "STANDARD" | "BADGE_AWARD" | "SHARE";
    };

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.deletedAt) {
      const err: any = new Error("Post not found");
      err.statusCode = 404;
      throw err;
    }
    if (post.authorId !== payload.sub) {
      const err: any = new Error("Forbidden");
      err.statusCode = 403;
      throw err;
    }

    const updated = await prisma.post.update({
      where: { id: postId },
      data: {
        content,
        visibility: visibility || post.visibility,
        type: type || post.type,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        content: true,
        visibility: true,
        type: true,
        updatedAt: true,
      },
    });

    return reply.send({
      ...updated,
      updatedAt: updated.updatedAt.toISOString(),
    });
  });

  // Delete a post (soft delete)
  app.delete("/v1/posts/:postId", {
    schema: {
      tags: ["posts"],
      params: z.object({ postId: z.string().min(1) }),
      response: {
        200: z.object({ ok: z.literal(true), deleted: z.boolean() })
      }
    }
  }, async (req) => {
    const payload = await requireAuth(req);
    const { postId } = (req.params as any) as { postId: string };
    
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.deletedAt) return { ok: true, deleted: false };
    if (post.authorId !== payload.sub) {
      const err: any = new Error("Forbidden");
      err.statusCode = 403;
      throw err;
    }

    await prisma.post.update({
      where: { id: postId },
      data: { deletedAt: new Date() },
    });

    return { ok: true, deleted: true };
  });

  // Follow a user
  app.post("/v1/network/follow", {
    schema: {
      tags: ["network"],
      body: z.object({ userId: z.string().min(1) }),
      response: {
        200: z.object({ ok: z.literal(true), followed: z.boolean() })
      }
    }
  }, async (req) => {
    const payload = await requireAuth(req);
    const { userId } = (req.body as any) as { userId: string };
    if (!userId) {
      const err: any = new Error("userId is required");
      err.statusCode = 400;
      throw err;
    }
    if (userId === payload.sub) {
      const err: any = new Error("Cannot follow yourself");
      err.statusCode = 400;
      throw err;
    }

    const exists = await prisma.follow.findFirst({ where: { followerId: payload.sub, followeeId: userId } });
    if (exists) return { ok: true, followed: false };

    await prisma.follow.create({ data: { followerId: payload.sub, followeeId: userId } });
    return { ok: true, followed: true };
  });

  // Unfollow a user
  app.delete("/v1/network/follow/:userId", {
    schema: {
      tags: ["network"],
      params: z.object({ userId: z.string().min(1) }),
      response: {
        200: z.object({ ok: z.literal(true), deleted: z.boolean() })
      }
    }
  }, async (req) => {
    const payload = await requireAuth(req);
    const { userId } = (req.params as any) as { userId: string };
    const res = await prisma.follow.deleteMany({ where: { followerId: payload.sub, followeeId: userId } });
    return { ok: true, deleted: res.count > 0 };
  });

  // Followers/following stats for a user
  app.get("/v1/network/followers/:userId/stats", {
    schema: {
      tags: ["network"],
      params: z.object({ userId: z.string().min(1) }),
      response: {
        200: z.object({
          userId: z.string(),
          followers: z.number(),
          following: z.number(),
          isFollowing: z.boolean(),
          followsMe: z.boolean(),
        })
      }
    }
  }, async (req) => {
    const payload = await requireAuth(req);
    const { userId } = (req.params as any) as { userId: string };

    const [followersCount, followingCount, iFollowYou, youFollowMe] = await Promise.all([
      prisma.follow.count({ where: { followeeId: userId } }),
      prisma.follow.count({ where: { followerId: userId } }),
      prisma.follow.count({ where: { followerId: payload.sub, followeeId: userId } }),
      prisma.follow.count({ where: { followerId: userId, followeeId: payload.sub } }),
    ]);

    return {
      userId,
      followers: followersCount,
      following: followingCount,
      isFollowing: iFollowYou > 0,
      followsMe: youFollowMe > 0,
    };
  });

  // List followers of a user
  app.get("/v1/network/followers/:userId", {
    schema: {
      tags: ["network"],
      params: z.object({ userId: z.string().min(1) }),
      querystring: z.object({
        cursor: z.string().optional(), // ISO date of follow.createdAt
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }),
      response: {
        200: z.object({
          items: z.array(z.object({
            userId: z.string(),
            followedAt: z.string(),
            iFollow: z.boolean(),
            followsMe: z.boolean(),
          })),
          nextCursor: z.string().optional(),
        })
      }
    }
  }, async (req) => {
    const viewer = await requireAuth(req);
    const { userId } = (req.params as any) as { userId: string };
    const { cursor, limit = 20 } = (req.query as any) as { cursor?: string; limit: number };

    const where: any = { followeeId: userId };
    let cursorDate: Date | undefined;
    if (cursor) {
      const d = new Date(cursor);
      if (!isNaN(d.getTime())) cursorDate = d;
    }
    if (cursorDate) where.createdAt = { lt: cursorDate };

    const rows = await prisma.follow.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { followerId: "asc" }],
      select: { followerId: true, createdAt: true },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, -1) : rows;
    const ids = page.map((r: any) => r.followerId);
    let iFollowSet = new Set<string>();
    let followsMeSet = new Set<string>();
    if (ids.length > 0) {
      const [iFollow, theyFollowMe] = await Promise.all([
        prisma.follow.findMany({ where: { followerId: viewer.sub, followeeId: { in: ids } }, select: { followeeId: true } }),
        prisma.follow.findMany({ where: { followerId: { in: ids }, followeeId: viewer.sub }, select: { followerId: true } }),
      ]);
      iFollowSet = new Set(iFollow.map((f: any) => f.followeeId));
      followsMeSet = new Set(theyFollowMe.map((f: any) => f.followerId));
    }
    const items = page.map((r: any) => ({
      userId: r.followerId,
      followedAt: r.createdAt.toISOString(),
      iFollow: iFollowSet.has(r.followerId),
      followsMe: followsMeSet.has(r.followerId),
    }));
    const nextCursor = hasMore ? items[items.length - 1]?.followedAt : undefined;
    return { items, nextCursor };
  });

  // List following of a user
  app.get("/v1/network/following/:userId", {
    schema: {
      tags: ["network"],
      params: z.object({ userId: z.string().min(1) }),
      querystring: z.object({
        cursor: z.string().optional(), // ISO date of follow.createdAt
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }),
      response: {
        200: z.object({
          items: z.array(z.object({
            userId: z.string(),
            followedAt: z.string(),
            iFollow: z.boolean(),
            followsMe: z.boolean(),
          })),
          nextCursor: z.string().optional(),
        })
      }
    }
  }, async (req) => {
    const viewer = await requireAuth(req);
    const { userId } = (req.params as any) as { userId: string };
    const { cursor, limit = 20 } = (req.query as any) as { cursor?: string; limit: number };

    const where: any = { followerId: userId };
    let cursorDate: Date | undefined;
    if (cursor) {
      const d = new Date(cursor);
      if (!isNaN(d.getTime())) cursorDate = d;
    }
    if (cursorDate) where.createdAt = { lt: cursorDate };

    const rows = await prisma.follow.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { followeeId: "asc" }],
      select: { followeeId: true, createdAt: true },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, -1) : rows;
    const ids = page.map((r: any) => r.followeeId);
    let iFollowSet = new Set<string>();
    let followsMeSet = new Set<string>();
    if (ids.length > 0) {
      const [iFollow, theyFollowMe] = await Promise.all([
        prisma.follow.findMany({ where: { followerId: viewer.sub, followeeId: { in: ids } }, select: { followeeId: true } }),
        prisma.follow.findMany({ where: { followerId: { in: ids }, followeeId: viewer.sub }, select: { followerId: true } }),
      ]);
      iFollowSet = new Set(iFollow.map((f: any) => f.followeeId));
      followsMeSet = new Set(theyFollowMe.map((f: any) => f.followerId));
    }
    const items = page.map((r: any) => ({
      userId: r.followeeId,
      followedAt: r.createdAt.toISOString(),
      iFollow: iFollowSet.has(r.followeeId),
      followsMe: followsMeSet.has(r.followeeId),
    }));
    const nextCursor = hasMore ? items[items.length - 1]?.followedAt : undefined;
    return { items, nextCursor };
  });

  // Suggestions: who to follow
  app.get("/v1/network/suggestions", {
    schema: {
      tags: ["network"],
      querystring: z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }),
      response: {
        200: z.object({ items: z.array(z.object({ userId: z.string(), displayName: z.string().nullable().optional(), avatarUrl: z.string().nullable().optional() })) })
      }
    }
  }, async (req) => {
    const payload = await requireAuth(req);
    const { limit = 10 } = (req.query as any) as { limit: number };

    // Exclude already-following and self
    const existing = await prisma.follow.findMany({ where: { followerId: payload.sub }, select: { followeeId: true }, take: 2000 });
    const exclude = new Set<string>([payload.sub, ...existing.map((f: any) => f.followeeId)]);

    // Heuristic: top recent authors by likeCount / recency
    const recent = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30); // 30 days
    const posts = await prisma.post.findMany({
      where: { createdAt: { gt: recent }, deletedAt: null, moderationStatus: "APPROVED" },
      orderBy: [{ likeCount: "desc" }, { createdAt: "desc" }],
      select: { authorId: true, authorDisplayName: true, authorAvatarUrl: true },
      take: 300,
    });
    const picked: { userId: string; displayName?: string | null; avatarUrl?: string | null }[] = [];
    const seen = new Set<string>();
    for (const p of posts) {
      if (exclude.has(p.authorId)) continue;
      if (seen.has(p.authorId)) continue;
      picked.push({ userId: p.authorId, displayName: p.authorDisplayName, avatarUrl: p.authorAvatarUrl ?? null });
      seen.add(p.authorId);
      if (picked.length >= limit) break;
    }
    return { items: picked };
  });

  // List my bookmarks (posts)
  app.get("/v1/network/bookmarks", {
    schema: {
      tags: ["network"],
      querystring: z.object({
        cursor: z.string().optional(), // ISO of bookmark.createdAt
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }),
      response: {
        200: z.object({ items: z.array(z.any()), nextCursor: z.string().optional() })
      }
    }
  }, async (req) => {
    const payload = await requireAuth(req);
    const { cursor, limit = 20 } = (req.query as any) as { cursor?: string; limit: number };

    const where: any = { userId: payload.sub, post: { deletedAt: null, moderationStatus: "APPROVED" } };
    let cursorDate: Date | undefined;
    if (cursor) {
      const d = new Date(cursor);
      if (!isNaN(d.getTime())) cursorDate = d;
    }
    if (cursorDate) where.createdAt = { lt: cursorDate };

    const rows = await prisma.bookmark.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        createdAt: true,
        post: {
          select: {
            id: true,
            authorId: true,
            authorDisplayName: true,
            authorAvatarUrl: true,
            content: true,
            createdAt: true,
            visibility: true,
            type: true,
            likeCount: true,
            commentCount: true,
            shareCount: true,
            media: {
              select: { order: true, mediaRef: { select: { id: true, url: true, mimeType: true, width: true, height: true } } },
            },
          },
        },
      },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, -1) : rows;
    const postIds = page.map((r: any) => r.post.id);
    let likedSet = new Set<string>();
    if (postIds.length > 0) {
      const likes = await prisma.reaction.findMany({ where: { userId: payload.sub, type: "LIKE" as any, postId: { in: postIds } }, select: { postId: true } });
      likedSet = new Set(likes.map((l: any) => l.postId));
    }
    const items = page.map((r: any) => ({
      ...r.post,
      createdAt: r.post.createdAt.toISOString(),
      likedByMe: likedSet.has(r.post.id),
      bookmarkedByMe: true,
      media: Array.isArray(r.post.media)
        ? r.post.media
            .slice()
            .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
            .map((m: any) => ({ id: m.mediaRef?.id, url: m.mediaRef?.url, mimeType: m.mediaRef?.mimeType, width: m.mediaRef?.width ?? null, height: m.mediaRef?.height ?? null }))
        : [],
    }));
    const nextCursor = hasMore ? page[page.length - 1]?.createdAt.toISOString() : undefined;
    return { items, nextCursor };
  });

  // Trending posts
  app.get("/v1/network/trending", {
    schema: {
      tags: ["network"],
      querystring: z.object({
        sinceDays: z.coerce.number().int().min(1).max(90).default(7),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }),
      response: {
        200: z.object({ items: z.array(z.any()), nextCursor: z.string().optional() })
      }
    }
  }, async (req) => {
    // Optional auth for personalization flags
    let userId: string | undefined;
    const auth = (req.headers as any)["authorization"] as string | undefined;
    if (auth?.startsWith("Bearer ")) {
      try {
        const payload = await verifyAccessToken(auth.slice("Bearer ".length));
        userId = payload.sub;
      } catch {}
    }
    const { sinceDays = 7, cursor, limit = 20 } = (req.query as any) as { sinceDays: number; cursor?: string; limit: number };
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

    const where: any = {
      deletedAt: null,
      moderationStatus: "APPROVED",
      createdAt: { gt: since },
    };
    let cursorDate: Date | undefined;
    if (cursor) {
      const d = new Date(cursor);
      if (!isNaN(d.getTime())) cursorDate = d;
    }
    if (cursorDate) where.createdAt = { gt: since, lt: cursorDate };

    const rows = await prisma.post.findMany({
      where,
      orderBy: [{ likeCount: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        authorId: true,
        authorDisplayName: true,
        authorAvatarUrl: true,
        content: true,
        createdAt: true,
        visibility: true,
        type: true,
        likeCount: true,
        commentCount: true,
        shareCount: true,
        media: { select: { order: true, mediaRef: { select: { id: true, url: true, mimeType: true, width: true, height: true } } } },
      },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, -1) : rows;
    let likedSet = new Set<string>();
    let bookmarkedSet = new Set<string>();
    if (userId && pageRows.length > 0) {
      const postIds = pageRows.map((r) => r.id);
      const [likes, bookmarks] = await Promise.all([
        prisma.reaction.findMany({ where: { userId, type: "LIKE" as any, postId: { in: postIds } }, select: { postId: true } }),
        prisma.bookmark.findMany({ where: { userId, postId: { in: postIds } }, select: { postId: true } }),
      ]);
      likedSet = new Set(likes.map((l: any) => l.postId));
      bookmarkedSet = new Set(bookmarks.map((b: any) => b.postId));
    }
    const items = pageRows.map((r: any) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      likedByMe: userId ? likedSet.has(r.id) : false,
      bookmarkedByMe: userId ? bookmarkedSet.has(r.id) : false,
      media: Array.isArray(r.media)
        ? r.media
            .slice()
            .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
            .map((m: any) => ({ id: m.mediaRef?.id, url: m.mediaRef?.url, mimeType: m.mediaRef?.mimeType, width: m.mediaRef?.width ?? null, height: m.mediaRef?.height ?? null }))
        : [],
    }));
    const nextCursor = hasMore ? items[items.length - 1]?.createdAt : undefined;
    return { items, nextCursor };
  });

  // Messaging endpoints
  
  // Get conversations for current user
  app.get("/v1/messages/conversations", {
    schema: {
      tags: ["messaging"],
      querystring: z.object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }),
      response: {
        200: z.object({
          conversations: z.array(z.any()),
          nextCursor: z.string().optional(),
          hasMore: z.boolean(),
        })
      }
    }
  }, async (req) => {
    const payload = await requireAuth(req);
    const { cursor, limit = 20 } = (req.query as any) as { cursor?: string; limit: number };

    // Get conversations from messages table
    const conversations = await prisma.$queryRaw<any[]>`
      WITH latest_messages AS (
        SELECT DISTINCT ON (
          CASE 
            WHEN "senderId" = ${payload.sub} THEN "receiverId"
            ELSE "senderId"
          END
        )
        CASE 
          WHEN "senderId" = ${payload.sub} THEN "receiverId"
          ELSE "senderId"
        END as "userId",
        content as "lastMessage",
        "createdAt" as "lastMessageTime",
        "senderId" != ${payload.sub} as "isFromOther"
        FROM networksvc."Message"
        WHERE "senderId" = ${payload.sub} OR "receiverId" = ${payload.sub}
        ORDER BY 
          CASE 
            WHEN "senderId" = ${payload.sub} THEN "receiverId"
            ELSE "senderId"
          END,
          "createdAt" DESC
      )
      SELECT 
        lm."userId",
        u."displayName",
        u."avatarUrl",
        lm."lastMessage",
        lm."lastMessageTime",
        COALESCE(unread.count, 0) as "unreadCount",
        false as "isOnline"
      FROM latest_messages lm
      JOIN authsvc."User" u ON u.id = lm."userId"
      LEFT JOIN (
        SELECT "senderId", COUNT(*) as count
        FROM networksvc."Message"
        WHERE "receiverId" = ${payload.sub} AND "readAt" IS NULL
        GROUP BY "senderId"
      ) unread ON unread."senderId" = lm."userId"
      ORDER BY lm."lastMessageTime" DESC
      LIMIT ${limit}
    `;

    return {
      conversations: conversations.map(c => ({
        id: c.userId,
        userId: c.userId,
        displayName: c.displayName,
        avatarUrl: c.avatarUrl,
        lastMessage: c.lastMessage,
        lastMessageTime: c.lastMessageTime,
        unreadCount: parseInt(c.unreadCount) || 0,
        isOnline: c.isOnline
      })),
      nextCursor: undefined,
      hasMore: false
    };
  });

  // Get messages with a specific user
  app.get("/v1/messages/:userId", {
    schema: {
      tags: ["messaging"],
      params: z.object({ userId: z.string() }),
      querystring: z.object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
      response: {
        200: z.object({
          messages: z.array(z.any()),
          nextCursor: z.string().optional(),
          hasMore: z.boolean(),
        })
      }
    }
  }, async (req) => {
    const payload = await requireAuth(req);
    const { userId } = (req.params as any) as { userId: string };
    const { cursor, limit = 50 } = (req.query as any) as { cursor?: string; limit: number };

    let cursorDate: Date | undefined;
    if (cursor) {
      const d = new Date(cursor);
      if (!isNaN(d.getTime())) cursorDate = d;
    }

    const messages = await (prisma as any).message.findMany({
      where: {
        OR: [
          { senderId: payload.sub, receiverId: userId },
          { senderId: userId, receiverId: payload.sub }
        ],
        ...(cursorDate && { createdAt: { lt: cursorDate } })
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, -1) : messages;
    const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : undefined;

    return {
      messages: items.reverse().map((m: any) => ({
        id: m.id,
        senderId: m.senderId,
        receiverId: m.receiverId,
        content: m.content,
        timestamp: m.createdAt.toISOString(),
        type: m.type || 'text',
        status: m.readAt ? 'read' : 'delivered'
      })),
      nextCursor,
      hasMore
    };
  });

  // Send a message
  app.post("/v1/messages", {
    schema: {
      tags: ["messaging"],
      body: z.object({
        receiverId: z.string(),
        content: z.string().min(1),
        type: z.enum(['text', 'image', 'file']).default('text')
      }),
      response: {
        200: z.object({
          message: z.any()
        })
      }
    }
  }, async (req) => {
    const payload = await requireAuth(req);
    const { receiverId, content, type = 'text' } = (req.body as any) as {
      receiverId: string;
      content: string;
      type: 'text' | 'image' | 'file';
    };

    const message = await (prisma as any).message.create({
      data: {
        senderId: payload.sub,
        receiverId,
        content,
        type
      }
    });

    return {
      message: {
        id: message.id,
        senderId: message.senderId,
        receiverId: message.receiverId,
        content: message.content,
        timestamp: message.createdAt.toISOString(),
        type: message.type || 'text',
        status: 'sent'
      }
    };
  });

  // Mark messages as read
  app.put("/v1/messages/:userId/read", {
    schema: {
      tags: ["messaging"],
      params: z.object({ userId: z.string() }),
      response: {
        200: z.object({
          success: z.boolean()
        })
      }
    }
  }, async (req) => {
    const payload = await requireAuth(req);
    const { userId } = (req.params as any) as { userId: string };

    await (prisma as any).message.updateMany({
      where: {
        senderId: userId,
        receiverId: payload.sub,
        readAt: null
      },
      data: {
        readAt: new Date()
      }
    });

    return { success: true };
  });

// Get online users (placeholder - would need Redis/Socket.IO integration)
app.get("/v1/messages/online", {
  schema: {
    tags: ["messaging"],
    response: {
      200: z.object({
        users: z.array(z.string())
      })
    }
  }
}, async (req) => {
  await requireAuth(req);
  
  // Placeholder - would integrate with Redis/Socket.IO for real online status
  return { users: [] };
});

// Connection Request endpoints

// Send connection request
app.post("/v1/connections/request", {
  schema: {
    tags: ["connections"],
    body: z.object({
      addresseeId: z.string().min(1),
      note: z.string().optional()
    }),
    response: {
      201: z.object({ ok: z.literal(true), requestId: z.string() })
    }
  }
}, async (req, reply) => {
  const payload = await requireAuth(req);
  const { addresseeId, note } = (req.body as any) as { addresseeId: string; note?: string };

  // Check if request already exists
  const existing = await prisma.connectionRequest.findFirst({
    where: {
      requesterId: payload.sub,
      addresseeId,
      status: 'PENDING'
    }
  });

  if (existing) {
    const err: any = new Error('Connection request already sent');
    err.statusCode = 409;
    throw err;
  }

  // Check if already connected
  const connection = await prisma.connection.findFirst({
    where: {
      OR: [
        { userA: payload.sub, userB: addresseeId },
        { userA: addresseeId, userB: payload.sub }
      ]
    }
  });

  if (connection) {
    const err: any = new Error('Already connected');
    err.statusCode = 409;
    throw err;
  }

  const request = await prisma.connectionRequest.create({
    data: {
      requesterId: payload.sub,
      addresseeId,
      note: note || null
    }
  });

  return reply.code(201).send({ ok: true, requestId: request.id });
});

// Get connection requests (received)
app.get("/v1/connections/requests/received", {
  schema: {
    tags: ["connections"],
    querystring: z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20)
    }),
    response: {
      200: z.object({
        items: z.array(z.any()),
        nextCursor: z.string().optional(),
        hasMore: z.boolean()
      })
    }
  }
}, async (req) => {
  const payload = await requireAuth(req);
  const { cursor, limit } = (req.query as any) as { cursor?: string; limit: number };

  const where: any = {
    addresseeId: payload.sub,
    status: 'PENDING'
  };

  let cursorDate: Date | undefined;
  if (cursor) {
    const d = new Date(cursor);
    if (!isNaN(d.getTime())) cursorDate = d;
  }
  if (cursorDate) where.createdAt = { lt: cursorDate };

  const rows = await prisma.connectionRequest.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true,
      requesterId: true,
      note: true,
      createdAt: true
    }
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, -1) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : undefined;

  return {
    items: items.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString()
    })),
    nextCursor,
    hasMore
  };
});

// Get connection requests (sent)
app.get("/v1/connections/requests/sent", {
  schema: {
    tags: ["connections"],
    querystring: z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20)
    }),
    response: {
      200: z.object({
        items: z.array(z.any()),
        nextCursor: z.string().optional(),
        hasMore: z.boolean()
      })
    }
  }
}, async (req) => {
  const payload = await requireAuth(req);
  const { cursor, limit } = (req.query as any) as { cursor?: string; limit: number };

  const where: any = {
    requesterId: payload.sub
  };

  let cursorDate: Date | undefined;
  if (cursor) {
    const d = new Date(cursor);
    if (!isNaN(d.getTime())) cursorDate = d;
  }
  if (cursorDate) where.createdAt = { lt: cursorDate };

  const rows = await prisma.connectionRequest.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true,
      addresseeId: true,
      status: true,
      note: true,
      createdAt: true,
      decidedAt: true
    }
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, -1) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : undefined;

  return {
    items: items.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      decidedAt: r.decidedAt?.toISOString()
    })),
    nextCursor,
    hasMore
  };
});

// Accept connection request
app.put("/v1/connections/requests/:requestId/accept", {
  schema: {
    tags: ["connections"],
    params: z.object({ requestId: z.string().min(1) }),
    response: {
      200: z.object({ ok: z.literal(true), connected: z.boolean() })
    }
  }
}, async (req) => {
  const payload = await requireAuth(req);
  const { requestId } = (req.params as any) as { requestId: string };

  const request = await prisma.connectionRequest.findUnique({
    where: { id: requestId }
  });

  if (!request || request.addresseeId !== payload.sub || request.status !== 'PENDING') {
    const err: any = new Error('Invalid request');
    err.statusCode = 404;
    throw err;
  }

  await prisma.$transaction(async (tx) => {
    // Update request status
    await tx.connectionRequest.update({
      where: { id: requestId },
      data: {
        status: 'ACCEPTED',
        decidedAt: new Date()
      }
    });

    // Create connection (ensure userA < userB for consistency)
    const userA = request.requesterId < payload.sub ? request.requesterId : payload.sub;
    const userB = request.requesterId < payload.sub ? payload.sub : request.requesterId;

    await tx.connection.create({
      data: { userA, userB }
    });
  });

  return { ok: true, connected: true };
});

// Reject connection request
app.put("/v1/connections/requests/:requestId/reject", {
  schema: {
    tags: ["connections"],
    params: z.object({ requestId: z.string().min(1) }),
    response: {
      200: z.object({ ok: z.literal(true), rejected: z.boolean() })
    }
  }
}, async (req) => {
  const payload = await requireAuth(req);
  const { requestId } = (req.params as any) as { requestId: string };

  const request = await prisma.connectionRequest.findUnique({
    where: { id: requestId }
  });

  if (!request || request.addresseeId !== payload.sub || request.status !== 'PENDING') {
    const err: any = new Error('Invalid request');
    err.statusCode = 404;
    throw err;
  }

  await prisma.connectionRequest.update({
    where: { id: requestId },
    data: {
      status: 'REJECTED',
      decidedAt: new Date()
    }
  });

  return { ok: true, rejected: true };
});

// Get connections list
app.get("/v1/connections", {
  schema: {
    tags: ["connections"],
    querystring: z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20)
    }),
    response: {
      200: z.object({
        items: z.array(z.any()),
        nextCursor: z.string().optional(),
        hasMore: z.boolean()
      })
    }
  }
}, async (req) => {
  const payload = await requireAuth(req);
  const { cursor, limit } = (req.query as any) as { cursor?: string; limit: number };

  const where: any = {
    OR: [
      { userA: payload.sub },
      { userB: payload.sub }
    ]
  };

  let cursorDate: Date | undefined;
  if (cursor) {
    const d = new Date(cursor);
    if (!isNaN(d.getTime())) cursorDate = d;
  }
  if (cursorDate) where.createdAt = { lt: cursorDate };

  const rows = await prisma.connection.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    take: limit + 1
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, -1) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : undefined;

  return {
    items: items.map(c => ({
      userId: c.userA === payload.sub ? c.userB : c.userA,
      connectedAt: c.createdAt.toISOString()
    })),
    nextCursor,
    hasMore
  };
});

// Remove connection
app.delete("/v1/connections/:userId", {
  schema: {
    tags: ["connections"],
    params: z.object({ userId: z.string().min(1) }),
    response: {
      200: z.object({ ok: z.literal(true), removed: z.boolean() })
    }
  }
}, async (req) => {
  const payload = await requireAuth(req);
  const { userId } = (req.params as any) as { userId: string };

  const result = await prisma.connection.deleteMany({
    where: {
      OR: [
        { userA: payload.sub, userB: userId },
        { userA: userId, userB: payload.sub }
      ]
    }
  });

  return { ok: true, removed: result.count > 0 };
});
}
