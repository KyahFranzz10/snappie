// Explicit, opt-in staging verification. Creates anonymous identities and ephemeral rooms.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { loadEnv } from "vite";
import { createClient } from "@supabase/supabase-js";
const env = {
  ...loadEnv("development", process.cwd(), "STAGING_"),
  ...process.env,
};
if (!env.STAGING_SUPABASE_URL || !env.STAGING_SUPABASE_ANON_KEY)
  throw new Error(
    "Set STAGING_SUPABASE_URL and STAGING_SUPABASE_ANON_KEY explicitly.",
  );
async function identity() {
  const client = createClient(
    env.STAGING_SUPABASE_URL,
    env.STAGING_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInAnonymously();
  if (error) throw error;
  return client;
}
function channel(client, id, isPrivate = true) {
  return client.channel(`room:${id}`, {
    config: { private: isPrivate, broadcast: { ack: true } },
  });
}
function subscribe(ch) {
  return new Promise((resolve) => ch.subscribe(resolve, 8000));
}
const clients = await Promise.all(Array.from({ length: 6 }, identity));
const [host, guest, extra] = clients;
const secret = randomBytes(32).toString("hex");
const { data: id, error: createError } = await host.rpc("create_room", {
  p_name: "Staging authorization test",
  p_nickname: "Host",
  p_secret: secret,
  p_passcode: "staging-test-4826",
});
if (createError) throw createError;
try {
  for (const isPrivate of [true, false]) {
    const outsider = channel(extra, id, isPrivate);
    try {
      assert.equal(
        await subscribe(outsider),
        "CHANNEL_ERROR",
        isPrivate
          ? "Nonmember must be denied"
          : "Public channels must be disabled",
      );
    } finally {
      await extra.removeChannel(outsider);
    }
  }
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
      ).data?.includes("passcode does not match"),
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
    clients.slice(1).map((c) =>
      c.rpc("join_room", {
        p_id: id,
        p_secret: secret,
        p_passcode: "staging-test-4826",
        p_nickname: "Guest",
      }),
    ),
  );
  assert.equal(
    attempts.filter((a) => !a.error && a.data === null).length,
    4,
    "Exactly four concurrent guests can join",
  );
  const joined =
    clients[
      1 +
        attempts.findIndex((attempt) => !attempt.error && attempt.data === null)
    ];
  const { data: status, error } = await joined.rpc("room_status", { p_id: id });
  if (error) throw error;
  assert.equal(status.members.length, 5);
  assert.ok(
    (await joined.rpc("close_room", { p_id: id })).error,
    "Guest cannot close room",
  );
  const hostChannel = channel(host, id);
  const guestChannel = channel(joined, id);
  let receiveProbe;
  guestChannel.on("broadcast", { event: "closure-test" }, () =>
    receiveProbe?.(),
  );
  assert.deepEqual(
    await Promise.all([subscribe(hostChannel), subscribe(guestChannel)]),
    ["SUBSCRIBED", "SUBSCRIBED"],
  );
  async function probe() {
    let timer;
    const received = new Promise((resolve) => {
      receiveProbe = () => resolve(true);
      timer = setTimeout(() => resolve(false), 3000);
    });
    try {
      await hostChannel.send({
        type: "broadcast",
        event: "closure-test",
        payload: {},
      });
      return await received;
    } finally {
      clearTimeout(timer);
      receiveProbe = undefined;
    }
  }
  assert.ok(await probe(), "Live members must receive signaling broadcasts");
  const closed = await host.rpc("close_room", { p_id: id });
  if (closed.error) throw closed.error;
  assert.ok(
    (await joined.rpc("room_status", { p_id: id })).error,
    "Closed room status must be denied",
  );
  assert.ok(
    (await joined.rpc("preview_room", { p_id: id, p_secret: secret })).error,
    "Closed invitations must be denied",
  );
  console.log(
    (await probe())
      ? "Existing subscribers could still exchange a broadcast immediately after closure."
      : "The post-closure broadcast did not reach the existing subscriber.",
  );
  await joined.removeChannel(guestChannel);
  assert.equal(
    await subscribe(channel(joined, id)),
    "CHANNEL_ERROR",
    "Closed room must deny a fresh subscription",
  );

  const creations = await Promise.all(
    Array.from({ length: 5 }, () =>
      host.rpc("create_room", {
        p_name: "Staging rate-limit test",
        p_nickname: "Host",
        p_secret: secret,
        p_passcode: "staging-test-4826",
      }),
    ),
  );
  const created = creations.filter((result) => !result.error);
  try {
    assert.equal(
      created.length,
      3,
      "Concurrent creates must honor the active room cap",
    );
    const args = {
      p_id: created[0].data,
      p_secret: secret,
      p_nickname: "Guest",
    };
    for (const result of await Promise.all(
      Array.from({ length: 8 }, () =>
        guest.rpc("join_room", { ...args, p_passcode: "wrong" }),
      ),
    )) {
      assert.match(result.data ?? "", /passcode does not match/);
    }
    const limited = await extra.rpc("join_room", {
      ...args,
      p_passcode: "staging-test-4826",
    });
    assert.match(limited.data ?? "", /Too many passcode attempts/);
  } finally {
    await Promise.all(
      created.map(({ data }) => host.rpc("close_room", { p_id: data })),
    );
  }
  console.log(
    "Passed: private signaling, invitation and passcode authorization, atomic capacity, room creation cap, and host-only closure.",
  );
} finally {
  await host.rpc("close_room", { p_id: id });
  for (const client of clients) {
    await client.removeAllChannels();
    await client.auth.signOut();
  }
}
