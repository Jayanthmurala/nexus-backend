import 'dotenv/config';
import { Client } from 'pg';

async function run(client: Client, sql: string) {
  await client.query(sql);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const schema = 'projectsvc';

  const useSSL = /[?&]sslmode=require/i.test(url) || process.env.PGSSLMODE === 'require';
  const client = new Client({ connectionString: url, ssl: useSSL ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    console.log('Connecting to Postgres...');
    await run(client, `CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await run(client, `SET search_path TO ${schema}`);
    await run(client, `CREATE EXTENSION IF NOT EXISTS citext`);

    await run(client, `CREATE TABLE IF NOT EXISTS "Project" (
      id TEXT PRIMARY KEY,
      "collegeId" TEXT NOT NULL,
      "authorId" TEXT NOT NULL,
      "authorName" TEXT NOT NULL,
      "authorAvatar" TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      "projectDuration" TEXT,
      skills TEXT[] NOT NULL DEFAULT '{}',
      departments TEXT[] NOT NULL DEFAULT '{}',
      "visibleToAllDepts" BOOLEAN NOT NULL DEFAULT false,
      "projectType" TEXT NOT NULL,
      "moderationStatus" TEXT NOT NULL,
      "progressStatus" TEXT NOT NULL,
      "maxStudents" INTEGER NOT NULL,
      deadline TIMESTAMPTZ,
      tags TEXT[] NOT NULL DEFAULT '{}',
      requirements TEXT[] NOT NULL DEFAULT '{}',
      outcomes TEXT[] NOT NULL DEFAULT '{}',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "archivedAt" TIMESTAMPTZ
    );`);

    await run(client, `CREATE INDEX IF NOT EXISTS "Project_collegeId_idx" ON "Project" ("collegeId");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Project_authorId_idx" ON "Project" ("authorId");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Project_projectType_idx" ON "Project" ("projectType");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Project_moderation_idx" ON "Project" ("moderationStatus");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Project_progress_idx" ON "Project" ("progressStatus");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Project_createdAt_idx" ON "Project" ("createdAt");`);

    await run(client, `CREATE TABLE IF NOT EXISTS "AppliedProject" (
      id TEXT PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "studentId" TEXT NOT NULL,
      "studentName" TEXT NOT NULL,
      "studentDepartment" TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "AppliedProject_project_fk" FOREIGN KEY ("projectId") REFERENCES "Project"(id) ON DELETE CASCADE
    );`);

    await run(client, `CREATE UNIQUE INDEX IF NOT EXISTS "AppliedProject_unique_project_student" ON "AppliedProject" ("projectId", "studentId");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "AppliedProject_projectId_idx" ON "AppliedProject" ("projectId");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "AppliedProject_studentId_idx" ON "AppliedProject" ("studentId");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "AppliedProject_status_idx" ON "AppliedProject" (status);`);

    await run(client, `CREATE TABLE IF NOT EXISTS "ProjectTask" (
      id TEXT PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      title TEXT NOT NULL,
      "assignedToId" TEXT,
      status TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "ProjectTask_project_fk" FOREIGN KEY ("projectId") REFERENCES "Project"(id) ON DELETE CASCADE
    );`);

    await run(client, `CREATE INDEX IF NOT EXISTS "ProjectTask_projectId_idx" ON "ProjectTask" ("projectId");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "ProjectTask_assignedToId_idx" ON "ProjectTask" ("assignedToId");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "ProjectTask_status_idx" ON "ProjectTask" (status);`);

    await run(client, `CREATE TABLE IF NOT EXISTS "ProjectAttachment" (
      id TEXT PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "uploaderId" TEXT NOT NULL,
      "fileName" TEXT NOT NULL,
      "fileUrl" TEXT NOT NULL,
      "fileType" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "ProjectAttachment_project_fk" FOREIGN KEY ("projectId") REFERENCES "Project"(id) ON DELETE CASCADE
    );`);

    await run(client, `CREATE INDEX IF NOT EXISTS "ProjectAttachment_projectId_idx" ON "ProjectAttachment" ("projectId");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "ProjectAttachment_uploaderId_idx" ON "ProjectAttachment" ("uploaderId");`);

    await run(client, `CREATE TABLE IF NOT EXISTS "Comment" (
      id TEXT PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "taskId" TEXT,
      "authorId" TEXT NOT NULL,
      "authorName" TEXT NOT NULL,
      body TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "Comment_project_fk" FOREIGN KEY ("projectId") REFERENCES "Project"(id) ON DELETE CASCADE
    );`);

    await run(client, `CREATE INDEX IF NOT EXISTS "Comment_projectId_idx" ON "Comment" ("projectId");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Comment_taskId_idx" ON "Comment" ("taskId");`);
    await run(client, `CREATE INDEX IF NOT EXISTS "Comment_authorId_idx" ON "Comment" ("authorId");`);

    console.log('Migration completed for schema', schema);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
