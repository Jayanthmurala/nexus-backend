import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import { ZodTypeProvider, serializerCompiler, validatorCompiler, jsonSchemaTransform } from "fastify-type-provider-zod";
import { env } from "./config/env";
import networkRoutes from "./routes/network.routes";
import adsRoutes from "./routes/ads.routes";

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
      info: { title: "Nexus Network Service", version: "0.1.0" },
      servers: [{ url: `http://localhost:${env.PORT}` }],
      tags: [
        { name: "network", description: "Feed and network endpoints" },
        { name: "posts", description: "Posts endpoints" },
        { name: "comments", description: "Comments endpoints" },
        { name: "reactions", description: "Reactions endpoints" },
        { name: "follows", description: "Follow endpoints" },
        { name: "connections", description: "Connection endpoints" },
        { name: "ads", description: "Advertising endpoints" },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUI, { routePrefix: "/docs" });

  app.get("/", async () => ({ message: "Nexus Network Service" }));
  app.get("/health", async () => ({ status: "ok" }));

  await app.register(networkRoutes);
  await app.register(adsRoutes);

  return app;
}

buildServer()
  .then((app) => app.listen({ port: env.PORT, host: "0.0.0.0" }))
  .then((address) => {
    console.log(`Network service listening at ${address}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
