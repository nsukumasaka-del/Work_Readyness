import assert from "node:assert/strict";
import test from "node:test";
import { handleLogout } from "./auth";

const EXPIRED_COOKIE =
  "bonlist_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax";

function envWithRun(run: (token: string) => Promise<unknown>) {
  let prepared = false;
  return {
    env: {
      DB: {
        prepare(sql: string) {
          prepared = true;
          assert.equal(sql, "DELETE FROM sessions WHERE token = ?");
          return {
            bind(token: string) {
              return { run: () => run(token) };
            },
          };
        },
      },
    },
    wasPrepared: () => prepared,
  };
}

test("logout revokes the token and preserves the expired Set-Cookie header", async () => {
  let revokedToken = "";
  const { env } = envWithRun(async token => {
    revokedToken = token;
    return { success: true };
  });
  const request = new Request("https://example.test/api/auth/logout", {
    method: "POST",
    headers: { cookie: "bonlist_session=valid-token" },
  });

  const response = await handleLogout(request, env as never);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), '{"ok":true}');
  assert.equal(revokedToken, "valid-token");
  assert.equal(response.headers.get("set-cookie"), EXPIRED_COOKIE);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("logout clears the cookie when no usable token is supplied", async () => {
  const { env, wasPrepared } = envWithRun(async () => ({ success: true }));
  const response = await handleLogout(
    new Request("https://example.test/api/auth/logout", { method: "POST" }),
    env as never,
  );

  assert.equal(wasPrepared(), false);
  assert.equal(response.headers.get("set-cookie"), EXPIRED_COOKIE);
});

test("logout still clears the cookie when D1 revocation fails", async () => {
  const { env } = envWithRun(async () => {
    throw new Error("D1 unavailable");
  });
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    const response = await handleLogout(
      new Request("https://example.test/api/auth/logout", {
        method: "POST",
        headers: { authorization: "Bearer malformed-token" },
      }),
      env as never,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("set-cookie"), EXPIRED_COOKIE);
  } finally {
    console.warn = originalWarn;
  }
});

test("logout expires the same parent-domain cookie used by production login", async () => {
  const { env } = envWithRun(async () => ({ success: true }));
  const response = await handleLogout(
    new Request("https://www.bonlist.site/api/auth/logout", {
      method: "POST",
      headers: { cookie: "bonlist_session=valid-token" },
    }),
    env as never,
  );

  const cookies = response.headers.getSetCookie();
  assert.deepEqual(cookies, [
    EXPIRED_COOKIE,
    "bonlist_session=; Path=/; Domain=.bonlist.site; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax",
  ]);
});

test("logout revokes distinct bearer and cookie sessions", async () => {
  const revoked: string[] = [];
  const { env } = envWithRun(async token => {
    revoked.push(token);
    return { success: true };
  });
  const response = await handleLogout(
    new Request("https://www.bonlist.site/api/auth/logout", {
      method: "POST",
      headers: {
        authorization: "Bearer bearer-token",
        cookie: "bonlist_session=cookie-token",
      },
    }),
    env as never,
  );

  assert.deepEqual(revoked, ["bearer-token", "cookie-token"]);
  assert.equal(response.status, 200);
});
