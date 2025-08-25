import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import { ZodTypeProvider, serializerCompiler, validatorCompiler, jsonSchemaTransform } from "fastify-type-provider-zod";
import { env } from "./config/env";
import projectsRoutes from "./routes/projects.routes";

async function buildServer() {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, { origin: true, credentials: true });

  await app.register(swagger, {
    openapi: {
      info: { title: "Nexus Projects Service", version: "0.1.0" },
      servers: [{ url: `http://localhost:${env.PORT}` }],
      tags: [
        { name: "projects", description: "Projects endpoints" },
        { name: "applications", description: "Applications endpoints" },
        { name: "tasks", description: "Tasks endpoints" },
        { name: "attachments", description: "Attachments endpoints" },
        { name: "comments", description: "Comments endpoints" },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUI, { routePrefix: "/docs" });

  app.get("/", async () => ({ message: "Nexus Projects Service" }));
  app.get("/health", async () => ({ status: "ok" }));

  await app.register(projectsRoutes);

  return app;
}

buildServer()
  .then((app) => app.listen({ port: env.PORT, host: "0.0.0.0" }))
  .then((address) => {
    console.log(`Projects service listening at ${address}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
