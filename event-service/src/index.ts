import fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { env } from "./config/env";
import eventRoutes from "./routes/events.routes";
import { initializeSocketManager } from "./websocket/socketManager";
import cache from "./utils/cache";

const app = fastify().withTypeProvider<ZodTypeProvider>();

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.register(cors, {
  origin: true,
  credentials: true,
});

app.register(swagger, {
  openapi: {
    openapi: "3.0.0",
    info: {
      title: "Event Service API",
      description: "API for managing events with real-time notifications",
      version: "1.0.0",
    },
    servers: [
      {
        url: "http://localhost:4003",
        description: "Development server",
      },
    ],
  },
});

app.register(swaggerUi, {
  routePrefix: "/docs",
  uiConfig: {
    docExpansion: "full",
    deepLinking: false,
  },
  uiHooks: {
    onRequest: function (request, reply, next) {
      next();
    },
    preHandler: function (request, reply, next) {
      next();
    },
  },
  staticCSP: true,
  transformStaticCSP: (header) => header,
  transformSpecification: (swaggerObject, request, reply) => {
    return swaggerObject;
  },
  transformSpecificationClone: true,
});

app.register(eventRoutes);

app.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

const start = async () => {
  try {
    // Initialize Redis cache (optional)
    await cache.connect();

    // Start the HTTP server
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    console.log(`🚀 Event service running on port ${env.PORT}`);

    // Initialize Socket.IO with the HTTP server
    const socketManager = initializeSocketManager(app.server);
    console.log("✅ Socket.IO initialized for real-time notifications");

  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await cache.disconnect();
  process.exit(0);
});

start();
