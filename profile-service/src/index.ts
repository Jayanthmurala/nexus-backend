import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import { ZodTypeProvider, serializerCompiler, validatorCompiler, jsonSchemaTransform } from "fastify-type-provider-zod";
import { env } from "./config/env";
import profileRoutes from "./routes/profile.routes";

async function buildServer() {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: true,
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type"],
  });

  await app.register(swagger, {
    openapi: {
      info: { title: "Nexus Profile Service", version: "0.1.0" },
      servers: [{ url: `http://localhost:${env.PORT}` }],
      tags: [
        { name: "profile", description: "Profile endpoints" },
        { name: "publications", description: "Publications endpoints" },
        { name: "projects", description: "Personal projects endpoints" },
        { name: "badges", description: "Badges endpoints" },
        { name: "colleges", description: "Colleges endpoints" },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUI, { routePrefix: "/docs" });

  app.get("/", async () => ({ message: "Nexus Profile Service" }));
  app.get("/health", async () => ({ status: "ok" }));

  await app.register(profileRoutes);

  return app;
}

buildServer()
  .then((app) => app.listen({ port: env.PORT, host: "0.0.0.0" }))
  .then((address) => {
    console.log(`Profile service listening at ${address}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
