import "server-only";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Workspace codes: short, human-typeable, unambiguous characters
 * (no 0/O, 1/I/L). A workspace replaces "sign up" — the extension gets a
 * code on first run and the dashboard opens via /login?code=XXXX.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function generateWorkspaceCode(length = CODE_LENGTH) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

export async function createWorkspace() {
  // Retry on the (very unlikely) code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateWorkspaceCode();
    const existing = await prisma.user.findUnique({ where: { code } });
    if (!existing) {
      return prisma.user.create({
        data: { code, name: `Workspace ${code.slice(0, 4)}` },
      });
    }
  }
  throw new Error("Could not generate a unique workspace code");
}

export async function findUserByCode(code: string | null | undefined) {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  return prisma.user.findUnique({ where: { code: normalized } });
}
