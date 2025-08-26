import { FastifyInstance } from "fastify";
import { z } from "zod";

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
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }),
      response: {
        200: z.object({ items: z.array(z.any()), nextCursor: z.string().optional() })
      }
    }
  }, async (_req) => {
    return { items: [], nextCursor: undefined };
  });
}
