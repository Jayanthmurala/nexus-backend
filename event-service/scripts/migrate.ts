import 'dotenv/config';
import { Client } from 'pg';

async function run(client: Client, sql: string) {
  await client.query(sql);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  const useSSL = /[?&]sslmode=require/i.test(url) || process.env.PGSSLMODE === 'require';
  const client = new Client({ connectionString: url, ssl: useSSL ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    console.log('Connecting to Postgres...');

    await run(client, `CREATE SCHEMA IF NOT EXISTS eventsvc;`);

    // Create enum types (idempotent)
    await run(client, `DO $$
    BEGIN
      CREATE TYPE eventsvc."EventType" AS ENUM ('WORKSHOP', 'SEMINAR', 'HACKATHON', 'MEETUP');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END$$;`);
    await run(client, `DO $$
    BEGIN
      CREATE TYPE eventsvc."EventMode" AS ENUM ('ONLINE', 'ONSITE', 'HYBRID');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END$$;`);
    await run(client, `DO $$
    BEGIN
      CREATE TYPE eventsvc."ModerationStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END$$;`);

    await run(client, `CREATE TABLE IF NOT EXISTS eventsvc."Event" (
      id TEXT PRIMARY KEY,
      "collegeId" TEXT NOT NULL,
      "authorId" TEXT NOT NULL,
      "authorName" TEXT NOT NULL,
      "authorRole" TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      "startAt" TIMESTAMPTZ NOT NULL,
      "endAt" TIMESTAMPTZ NOT NULL,
      type eventsvc."EventType" NOT NULL,
      mode eventsvc."EventMode" NOT NULL,
      location TEXT,
      "meetingUrl" TEXT,
      capacity INTEGER,
      "visibleToAllDepts" BOOLEAN NOT NULL DEFAULT false,
      departments TEXT[] NOT NULL DEFAULT '{}',
      tags TEXT[] NOT NULL DEFAULT '{}',
      "moderationStatus" eventsvc."ModerationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
      "monitorId" TEXT,
      "monitorName" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "archivedAt" TIMESTAMPTZ
    );`);

    // In case the table existed previously with TEXT columns, alter them to enum types
    await run(client, `DO $$
    BEGIN
      ALTER TABLE eventsvc."Event"
        ALTER COLUMN type TYPE eventsvc."EventType" USING type::eventsvc."EventType",
        ALTER COLUMN mode TYPE eventsvc."EventMode" USING mode::eventsvc."EventMode",
        ALTER COLUMN "moderationStatus" TYPE eventsvc."ModerationStatus" USING "moderationStatus"::eventsvc."ModerationStatus";
    EXCEPTION WHEN others THEN NULL;
    END$$;`);

    await run(client, `CREATE INDEX IF NOT EXISTS "Event_collegeId_idx" ON eventsvc."Event" ("collegeId");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Event_type_idx" ON eventsvc."Event" (type);`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Event_startAt_idx" ON eventsvc."Event" ("startAt");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Event_moderation_idx" ON eventsvc."Event" ("moderationStatus");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Event_createdAt_idx" ON eventsvc."Event" ("createdAt");`);

    await run(client, `CREATE TABLE IF NOT EXISTS eventsvc."EventRegistration" (
      id TEXT PRIMARY KEY,
      "eventId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "EventRegistration_event_fk" FOREIGN KEY ("eventId") REFERENCES eventsvc."Event"(id) ON DELETE CASCADE
    );`);

    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS "EventRegistration_unique_event_user" ON eventsvc."EventRegistration" ("eventId", "userId");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "EventRegistration_eventId_idx" ON eventsvc."EventRegistration" ("eventId");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "EventRegistration_userId_idx" ON eventsvc."EventRegistration" ("userId");`);

    console.log('Migration completed for Event tables (eventsvc schema)');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
