import 'dotenv/config';
import { Client } from 'pg';

async function run(client: Client, sql: string) {
  await client.query(sql);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const schema = 'networksvc';

  const useSSL = /[?&]sslmode=require/i.test(url) || process.env.PGSSLMODE === 'require';
  const client = new Client({ connectionString: url, ssl: useSSL ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    console.log('Connecting to Postgres...');
    await run(client, `CREATE SCHEMA IF NOT EXISTS ${schema};`);
    await run(client, `SET search_path TO ${schema};`);
    await run(client, `CREATE EXTENSION IF NOT EXISTS citext;`);

    // Enums (idempotent)
    await run(client, `DO $$ BEGIN CREATE TYPE ${schema}."Visibility" AS ENUM ('PUBLIC','COLLEGE'); EXCEPTION WHEN duplicate_object THEN NULL; END$$;`);
    await run(client, `DO $$ BEGIN CREATE TYPE ${schema}."PostType" AS ENUM ('STANDARD','BADGE_AWARD','SHARE','AD'); EXCEPTION WHEN duplicate_object THEN NULL; END$$;`);
    await run(client, `DO $$ BEGIN CREATE TYPE ${schema}."ModerationStatus" AS ENUM ('PENDING','APPROVED','HIDDEN','REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END$$;`);
    await run(client, `DO $$ BEGIN CREATE TYPE ${schema}."ReactionType" AS ENUM ('LIKE'); EXCEPTION WHEN duplicate_object THEN NULL; END$$;`);
    await run(client, `DO $$ BEGIN CREATE TYPE ${schema}."ConnectionRequestStatus" AS ENUM ('PENDING','ACCEPTED','REJECTED','CANCELED','BLOCKED'); EXCEPTION WHEN duplicate_object THEN NULL; END$$;`);
    await run(client, `DO $$ BEGIN CREATE TYPE ${schema}."AdStatus" AS ENUM ('ACTIVE','PAUSED','ENDED','EXHAUSTED'); EXCEPTION WHEN duplicate_object THEN NULL; END$$;`);

    // Tables
    await run(client, `CREATE TABLE IF NOT EXISTS ${schema}."Post" (
      id TEXT PRIMARY KEY,
      "authorId" TEXT NOT NULL,
      "authorDisplayName" TEXT NOT NULL,
      "authorAvatarUrl" TEXT,
      "authorCollegeId" TEXT NOT NULL,
      visibility ${schema}."Visibility" NOT NULL,
      type ${schema}."PostType" NOT NULL,
      content TEXT,
      "shareOfPostId" TEXT,
      "likeCount" INTEGER NOT NULL DEFAULT 0,
      "commentCount" INTEGER NOT NULL DEFAULT 0,
      "shareCount" INTEGER NOT NULL DEFAULT 0,
      "moderationStatus" ${schema}."ModerationStatus" NOT NULL DEFAULT 'APPROVED',
      "deletedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

      -- Badge award
      "badgeAwardJson" TEXT,
      "sourceEventId" TEXT,
      "isContentLocked" BOOLEAN NOT NULL DEFAULT true,

      -- Ads
      "adCampaignId" TEXT,
      "adMetaJson" TEXT,
      "adTargetJson" TEXT,
      "adBudgetJson" TEXT,
      "adStatus" ${schema}."AdStatus"
    );`);

    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS "Post_sourceEventId_unique" ON ${schema}."Post" ("sourceEventId") WHERE "sourceEventId" IS NOT NULL;`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Post_authorId_createdAt_idx" ON ${schema}."Post" ("authorId","createdAt");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Post_college_visibility_createdAt_idx" ON ${schema}."Post" ("authorCollegeId", visibility, "createdAt");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Post_shareOfPostId_idx" ON ${schema}."Post" ("shareOfPostId");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Post_type_createdAt_idx" ON ${schema}."Post" (type, "createdAt");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Post_moderation_createdAt_idx" ON ${schema}."Post" ("moderationStatus", "createdAt");`);

    await run(client, `CREATE TABLE IF NOT EXISTS ${schema}."Media" (
      id TEXT PRIMARY KEY,
      "ownerUserId" TEXT NOT NULL,
      "storageKey" TEXT NOT NULL,
      url TEXT NOT NULL,
      "mimeType" TEXT NOT NULL,
      "sizeBytes" INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      blurhash TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Media_owner_createdAt_idx" ON ${schema}."Media" ("ownerUserId","createdAt");`);

    await run(client, `CREATE TABLE IF NOT EXISTS ${schema}."PostMedia" (
      id TEXT PRIMARY KEY,
      "postId" TEXT NOT NULL,
      "mediaId" TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "PostMedia_post_fk" FOREIGN KEY ("postId") REFERENCES ${schema}."Post"(id) ON DELETE CASCADE,
      CONSTRAINT "PostMedia_media_fk" FOREIGN KEY ("mediaId") REFERENCES ${schema}."Media"(id) ON DELETE CASCADE
    );`);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS "PostMedia_unique_post_media" ON ${schema}."PostMedia" ("postId","mediaId");`);

    await run(client, `CREATE TABLE IF NOT EXISTS ${schema}."Reaction" (
      id TEXT PRIMARY KEY,
      "postId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      type ${schema}."ReactionType" NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "Reaction_post_fk" FOREIGN KEY ("postId") REFERENCES ${schema}."Post"(id) ON DELETE CASCADE
    );`);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS "Reaction_unique_post_user_type" ON ${schema}."Reaction" ("postId","userId",type);`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Reaction_post_createdAt_idx" ON ${schema}."Reaction" ("postId","createdAt");`);

    await run(client, `CREATE TABLE IF NOT EXISTS ${schema}."Comment" (
      id TEXT PRIMARY KEY,
      "postId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "userDisplayName" TEXT NOT NULL,
      "userAvatarUrl" TEXT,
      "userCollegeId" TEXT NOT NULL,
      content TEXT NOT NULL,
      "moderationStatus" ${schema}."ModerationStatus" NOT NULL DEFAULT 'APPROVED',
      "deletedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "Comment_post_fk" FOREIGN KEY ("postId") REFERENCES ${schema}."Post"(id) ON DELETE CASCADE
    );`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Comment_post_createdAt_idx" ON ${schema}."Comment" ("postId","createdAt");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Comment_user_createdAt_idx" ON ${schema}."Comment" ("userId","createdAt");`);

    // Bookmark table
    await run(client, `CREATE TABLE IF NOT EXISTS ${schema}."Bookmark" (
      id TEXT PRIMARY KEY,
      "postId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "Bookmark_post_fk" FOREIGN KEY ("postId") REFERENCES ${schema}."Post"(id) ON DELETE CASCADE
    );`);
    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS "Bookmark_unique_post_user" ON ${schema}."Bookmark" ("postId","userId");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Bookmark_post_createdAt_idx" ON ${schema}."Bookmark" ("postId","createdAt");`);

    await run(client, `CREATE TABLE IF NOT EXISTS ${schema}."Follow" (
      "followerId" TEXT NOT NULL,
      "followeeId" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY ("followerId","followeeId")
    );`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Follow_followee_createdAt_idx" ON ${schema}."Follow" ("followeeId","createdAt");`);

    await run(client, `CREATE TABLE IF NOT EXISTS ${schema}."ConnectionRequest" (
      id TEXT PRIMARY KEY,
      "requesterId" TEXT NOT NULL,
      "addresseeId" TEXT NOT NULL,
      status ${schema}."ConnectionRequestStatus" NOT NULL DEFAULT 'PENDING',
      note TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "decidedAt" TIMESTAMPTZ
    );`);
    await run(client, `CREATE INDEX IF NOT EXISTS "ConnectionRequest_requester_createdAt_idx" ON ${schema}."ConnectionRequest" ("requesterId","createdAt");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "ConnectionRequest_addressee_createdAt_idx" ON ${schema}."ConnectionRequest" ("addresseeId","createdAt");`);

    await run(client, `CREATE TABLE IF NOT EXISTS ${schema}."Connection" (
      "userA" TEXT NOT NULL,
      "userB" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY ("userA","userB")
    );`);

    await run(client, `CREATE TABLE IF NOT EXISTS ${schema}."AdImpression" (
      id TEXT PRIMARY KEY,
      "postId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );`);
    await run(client, `CREATE INDEX IF NOT EXISTS "AdImpression_post_createdAt_idx" ON ${schema}."AdImpression" ("postId","createdAt");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "AdImpression_user_createdAt_idx" ON ${schema}."AdImpression" ("userId","createdAt");`);

    await run(client, `CREATE TABLE IF NOT EXISTS ${schema}."AdClick" (
      id TEXT PRIMARY KEY,
      "postId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );`);
    await run(client, `CREATE INDEX IF NOT EXISTS "AdClick_post_createdAt_idx" ON ${schema}."AdClick" ("postId","createdAt");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "AdClick_user_createdAt_idx" ON ${schema}."AdClick" ("userId","createdAt");`);

    console.log('Migration completed for schema', schema);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
