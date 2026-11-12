/**
 * One-command migration to email + password auth (12 Nov 2026).
 *
 * Before this, login needed a database whose schema already has
 * `passwordHash` + `Session` — and `prisma db push` refused to apply it
 * while 7 legacy workspace users still had NULL emails. Doing those
 * steps by hand (pgAdmin + 4 commands) is error-prone, so this script
 * runs them in order:
 *
 *   1. `npx prisma generate` (client must match the new schema)
 *      — with a guard: aborts if the Prisma CLI is NOT 6.19.x (a 7.x/8.x
 *      CLI, e.g. from a stale node_modules, cannot read this schema).
 *   2. Fill legacy users' NULL emails with placeholders derived from
 *      their workspace code (`<code>@applytrack.local`) — same SQL as
 *      the manual pgAdmin step. If the table doesn't exist yet (fresh
 *      database), this step is skipped and the push creates it.
 *   3. `npx prisma db push --accept-data-loss` — creates passwordHash +
 *      Session, drops the old `User.code` column and the
 *      `PlatformConnection` table (Glints cookies are gone anyway).
 *   4. `npm run db:seed` — demo account demo@applytrack.dev / demo12345.
 *
 * Run:  npm run db:migrate-auth        (after `npm ci` in a fresh folder)
 * Then: npm run dev, register on the dashboard, log in in the extension
 *       with the same email + password.
 *
 * NOTE: old workspace-code accounts lose their login method — they have
 * no password. Their applications stay in the database (under the old
 * user rows); to move them to a new account, ask or run the SQL in the
 * README ("Reclaiming old workspace data").
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

function run(cmd: string) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

async function main() {
  // Guard: the project ships Prisma 6.19.3; a 7.x/8.x CLI rejects this schema.
  const version = execSync("npx prisma --version", { encoding: "utf8" });
  if (!/prisma\s*:\s*6\./.test(version)) {
    console.error(
      "\nPrisma CLI is not 6.x — your node_modules is stale (this project pins Prisma 6.19.3).\n" +
        "Extract the zip into a FRESH folder and run `npm ci` first, then run this script again.\n" +
        version,
    );
    process.exit(1);
  }

  run("npx prisma generate");

  const prisma = new PrismaClient();
  try {
    const filled = await prisma.$executeRawUnsafe(
      `UPDATE "User" SET email = COALESCE(LOWER(code), 'workspace-' || LEFT(id::text, 8)) || '@applytrack.local' WHERE email IS NULL`,
    );
    console.log(`\nFilled ${filled} legacy user(s) with a placeholder email.`);
  } catch (err) {
    console.log(
      "\nCould not fill legacy emails (fresh database — no User table yet?) — continuing to push:",
      String((err as Error)?.message ?? err).split("\n")[0],
    );
  } finally {
    await prisma.$disconnect();
  }

  run("npx prisma db push --accept-data-loss");
  run("npm run db:seed");

  console.log(
    "\nDone. Now run `npm run dev`, register on the dashboard, then log in in the extension with the same email + password.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
