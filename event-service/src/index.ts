import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import { ZodTypeProvider, serializerCompiler, validatorCompiler, jsonSchemaTransform } from "fastify-type-provider-zod";
import eventsRoutes from "./routes/events.routes";
import { env } from "./config/env";

async function buildServer() {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: true,
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type"],
    exposedHeaders: ["Content-Disposition"],
  });

  await app.register(swagger, {
    openapi: {
      info: { title: "Nexus Event Service", version: "0.1.0" },
      servers: [{ url: `http://localhost:${env.PORT}` }],
      tags: [
        { name: "events", description: "Event endpoints" },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUI, { routePrefix: "/docs" });

  app.get("/", async () => ({ message: "Nexus Event Service" }));
  app.get("/health", async () => ({ status: "ok" }));

  await app.register(eventsRoutes);

  return app;
}

buildServer()
  .then((app) => app.listen({ port: env.PORT, host: "0.0.0.0" }))
  .then((address) => {
    console.log(`Event service listening at ${address}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
