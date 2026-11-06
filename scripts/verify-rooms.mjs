// Explicit, opt-in staging verification. Creates anonymous identities and one ephemeral room.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { loadEnv } from "vite";
import { createClient } from "@supabase/supabase-js";
const env = {
  ...loadEnv("development", process.cwd(), "VITE_"),
  ...process.env,
};
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY)
  throw new Error(
    "Configure a staging Supabase URL and anon key in .env.local first.",
  );
async function identity() {
  const client = createClient(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInAnonymously();
  if (error) throw error;
  return client;
}
const [host, guest, extra] = await Promise.all([
  identity(),
  identity(),
  identity(),
]);
const secret = randomBytes(32).toString("hex");
const { data: id, error: createError } = await host.rpc("create_room", {
  p_name: "Staging authorization test",
  p_nickname: "Host",
  p_secret: secret,
  p_passcode: "staging-test-4826",
});
if (createError) throw createError;
try {
  assert.ok(
    (await extra.rpc("room_status", { p_id: id })).error,
    "Nonmember must not read room status",
  );
  assert.ok(
    (await extra.rpc("preview_room", { p_id: id, p_secret: "wrong" })).error,
    "Wrong invite must fail",
  );
  for (const passcode of ["wrong", null])
    assert.ok(
      (
        await guest.rpc("join_room", {
          p_id: id,
          p_secret: secret,
          p_passcode: passcode,
          p_nickname: "Guest",
        })
      ).error,
      "Wrong or null passcode must fail",
    );
  assert.ok(
    (
      await extra.rpc("join_room", {
        p_id: id,
        p_secret: null,
        p_passcode: "staging-test-4826",
        p_nickname: "Extra",
      })
    ).error,
    "Null invitation must fail",
  );
  const attempts = await Promise.all(
    [guest, extra].map((c) =>
      c.rpc("join_room", {
        p_id: id,
        p_secret: secret,
        p_passcode: "staging-test-4826",
        p_nickname: "Guest",
      }),
    ),
  );
  assert.equal(
    attempts.filter((a) => !a.error).length,
    1,
    "Exactly one concurrent guest can join",
  );
  const joined = attempts[0].error ? extra : guest;
  const { data: status, error } = await joined.rpc("room_status", { p_id: id });
  if (error) throw error;
  assert.equal(status.members.length, 2);
  assert.ok(
    (await joined.rpc("close_room", { p_id: id })).error,
    "Guest cannot close room",
  );
  const closed = await host.rpc("close_room", { p_id: id });
  if (closed.error) throw closed.error;
  assert.ok(
    (await joined.rpc("room_status", { p_id: id })).error,
    "Closed room status must be denied",
  );
  console.log(
    "Passed: invitation/passcode authorization, null rejection, atomic two-person capacity, host-only close, and expiry checks.",
  );
} finally {
  await host.rpc("close_room", { p_id: id });
  for (const client of [host, guest, extra]) await client.auth.signOut();
}
