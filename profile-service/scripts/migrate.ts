import 'dotenv/config';
import { Client } from 'pg';

async function run(client: Client, sql: string) {
  await client.query(sql);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const schema = 'profilesvc';

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log('Connecting to Neon...');
    await run(client, `CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await run(client, `SET search_path TO ${schema}`);
    await run(client, `CREATE EXTENSION IF NOT EXISTS citext`);

    // Tables
    await run(
      client,
      `CREATE TABLE IF NOT EXISTS "Profile" (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL UNIQUE,
        skills TEXT[] NOT NULL DEFAULT '{}',
        expertise TEXT[] NOT NULL DEFAULT '{}',
        "linkedIn" TEXT,
        github TEXT,
        twitter TEXT,
        "resumeUrl" TEXT,
        bio TEXT,
        avatar TEXT,
        "contactInfo" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "Url" TEXT
      );`
    );

    // Ensure new columns exist if the table was created previously without them
    await run(
      client,
      `ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS bio TEXT;`
    );
    await run(
      client,
      `ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS avatar TEXT;`
    );
    await run(
      client,
      `ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS expertise TEXT[] NOT NULL DEFAULT '{}';`
    );
    await run(
      client,
      `ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS twitter TEXT;`
    );
    await run(
      client,
      `ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "contactInfo" TEXT;`
    );
    await run(
      client,
      `ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "Url" TEXT;`
    );

    await run(
      client,
      `CREATE TABLE IF NOT EXISTS "Publication" (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        title TEXT NOT NULL,
        link TEXT,
        year INTEGER NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "Publication_profile_fk" FOREIGN KEY ("userId") REFERENCES "Profile"("userId") ON DELETE CASCADE
      );`
    );

    await run(
      client,
      `CREATE INDEX IF NOT EXISTS "Publication_userId_idx" ON "Publication" ("userId");
       CREATE INDEX IF NOT EXISTS "Publication_year_idx" ON "Publication" (year);`
    );

    await run(
      client,
      `CREATE TABLE IF NOT EXISTS "PersonalProject" (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        github TEXT,
        "demoLink" TEXT,
        image TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PersonalProject_profile_fk" FOREIGN KEY ("userId") REFERENCES "Profile"("userId") ON DELETE CASCADE
      );`
    );

    await run(
      client,
      `CREATE INDEX IF NOT EXISTS "PersonalProject_userId_idx" ON "PersonalProject" ("userId");`
    );

    // BadgeDefinition
    await run(
      client,
      `CREATE TABLE IF NOT EXISTS "BadgeDefinition" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        icon TEXT,
        color TEXT,
        category TEXT,
        rarity TEXT NOT NULL,
        criteria TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "createdBy" TEXT
      );`
    );

    // StudentBadge
    await run(
      client,
      `CREATE TABLE IF NOT EXISTS "StudentBadge" (
        id TEXT PRIMARY KEY,
        "studentId" TEXT NOT NULL,
        "badgeId" TEXT NOT NULL,
        "awardedBy" TEXT NOT NULL,
        "awardedByName" TEXT,
        reason TEXT NOT NULL,
        "awardedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "projectId" TEXT,
        "eventId" TEXT,
        CONSTRAINT "StudentBadge_badge_fk" FOREIGN KEY ("badgeId") REFERENCES "BadgeDefinition"(id),
        CONSTRAINT "StudentBadge_student_fk" FOREIGN KEY ("studentId") REFERENCES "Profile"("userId") ON DELETE CASCADE
      );`
    );

    await run(
      client,
      `CREATE INDEX IF NOT EXISTS "StudentBadge_studentId_idx" ON "StudentBadge" ("studentId");
       CREATE INDEX IF NOT EXISTS "StudentBadge_badgeId_idx" ON "StudentBadge" ("badgeId");
       CREATE INDEX IF NOT EXISTS "StudentBadge_awardedBy_idx" ON "StudentBadge" ("awardedBy");
       CREATE INDEX IF NOT EXISTS "StudentBadge_awardedAt_idx" ON "StudentBadge" ("awardedAt");`
    );

    console.log('Migration completed for schema', schema);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
