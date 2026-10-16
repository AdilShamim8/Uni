import { afterAll, describe, expect, test } from "bun:test";
import { db } from "@/lib/db";

/**
 * Tenant-isolation integration test against a real (throwaway) SQLite DB —
 * exercises the exact query patterns the API routes use: every lookup is
 * scoped by userId, mirroring the `findFirst({ where: { id, userId } })`
 * guard in conversations/providers routes.
 */

const createdUserIds: string[] = [];

async function makeUser(email: string) {
  const user = await db.user.create({
    data: { email, name: email.split("@")[0], passwordHash: "scrypt$00$00" },
  });
  createdUserIds.push(user.id);
  return user;
}

afterAll(async () => {
  // Cascade removes sessions, providers, conversations, messages.
  await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("tenant isolation (two-user scenario)", () => {
  test("a user cannot read another user's conversation", async () => {
    const alice = await makeUser(`alice-${Date.now()}@test.local`);
    const bob = await makeUser(`bob-${Date.now()}@test.local`);

    const conv = await db.conversation.create({
      data: { userId: alice.id, title: "Alice's private thread" },
    });
    await db.message.create({
      data: { conversationId: conv.id, role: "user", content: "secret plans" },
    });

    // The tenant-scoped lookup Bob's request would perform:
    const asBob = await db.conversation.findFirst({
      where: { id: conv.id, userId: bob.id },
    });
    expect(asBob).toBeNull();

    // …and the one Alice's request performs:
    const asAlice = await db.conversation.findFirst({
      where: { id: conv.id, userId: alice.id },
      include: { messages: true },
    });
    expect(asAlice?.messages[0]?.content).toBe("secret plans");
  });

  test("a user cannot delete another user's conversation", async () => {
    const alice = await makeUser(`alice-del-${Date.now()}@test.local`);
    const bob = await makeUser(`bob-del-${Date.now()}@test.local`);

    const conv = await db.conversation.create({
      data: { userId: alice.id, title: "to keep" },
    });

    // Route pattern: findFirst scoped to the caller, then delete.
    const scoped = await db.conversation.findFirst({
      where: { id: conv.id, userId: bob.id },
    });
    expect(scoped).toBeNull(); // 404 path — never reaches the delete

    const stillThere = await db.conversation.findUnique({ where: { id: conv.id } });
    expect(stillThere?.title).toBe("to keep");
  });

  test("credentials are unique per user/provider/label but shared names across users are fine", async () => {
    const alice = await makeUser(`alice-cred-${Date.now()}@test.local`);
    const bob = await makeUser(`bob-cred-${Date.now()}@test.local`);

    await db.providerCredential.create({
      data: { userId: alice.id, provider: "openai", label: "Work", encryptedKey: "enc" },
    });
    await db.providerCredential.create({
      data: { userId: bob.id, provider: "openai", label: "Work", encryptedKey: "enc" },
    });

    let duplicateRejected = false;
    try {
      await db.providerCredential.create({
        data: { userId: alice.id, provider: "openai", label: "Work", encryptedKey: "enc2" },
      });
    } catch {
      duplicateRejected = true;
    }
    expect(duplicateRejected).toBe(true);
  });

  test("deleting a user cascades their data", async () => {
    const carol = await makeUser(`carol-${Date.now()}@test.local`);
    const conv = await db.conversation.create({
      data: { userId: carol.id, title: "carol thread" },
    });
    await db.message.create({
      data: { conversationId: conv.id, role: "user", content: "bye" },
    });

    await db.user.delete({ where: { id: carol.id } });
    createdUserIds.splice(createdUserIds.indexOf(carol.id), 1);

    expect(await db.conversation.findUnique({ where: { id: conv.id } })).toBeNull();
  });
});
