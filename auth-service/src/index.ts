import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import { ZodTypeProvider, serializerCompiler, validatorCompiler, jsonSchemaTransform } from "fastify-type-provider-zod";
import { env } from "./config/env";
import authRoutes from "./routes/auth.routes";
import collegeRoutes from "./routes/college.routes";
import backendAdminRoutes from "./routes/backendAdmin.routes";
import { getJWKS } from "./utils/jwt";

async function buildServer() {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  // Enable Zod validation/serialization
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: true,
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type"],
  });

  await app.register(cookie);

  await app.register(swagger, {
    openapi: {
      info: { title: "Nexus Auth Service", version: "0.1.0" },
      servers: [{ url: `http://localhost:${env.PORT}` }],
      components: {},
      tags: [
        { name: "auth", description: "Authentication endpoints" },
        { name: "colleges", description: "College management endpoints" },
        { name: "backend-admin", description: "Backend admin endpoints" },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUI, { routePrefix: "/docs" });
 app.get("/", async()=>({messege:"WElcome To NexUs🤝"}))
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/.well-known/jwks.json", async () => await getJWKS());

  await app.register(authRoutes);
  await app.register(collegeRoutes);
  await app.register(backendAdminRoutes);

  return app;
}

buildServer()
  .then((app) => app.listen({ port: env.PORT, host: "0.0.0.0" }))
  .then((address) => {
    console.log(`Auth service listening at ${address}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
