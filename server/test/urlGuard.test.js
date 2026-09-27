import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertSafeUrl, createHostChecker, isPublicAddress, UnsafeUrlError } from "../src/urlGuard.js";

const fakeLookup = (table) => async (hostname) => {
  if (!(hostname in table)) {
    throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
  }
  return table[hostname].map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
};

describe("isPublicAddress", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "255.255.255.255",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:a9fe:a9fe",
  ]) {
    it(`blocks ${address}`, () => {
      assert.equal(isPublicAddress(address), false);
    });
  }

  for (const address of ["93.184.215.14", "8.8.8.8", "172.32.0.1", "2606:4700::1111"]) {
    it(`allows ${address}`, () => {
      assert.equal(isPublicAddress(address), true);
    });
  }

  it("rejects things that are not IPs", () => {
    assert.equal(isPublicAddress("example.com"), false);
  });
});

describe("assertSafeUrl", () => {
  const lookupFn = fakeLookup({
    "example.com": ["93.184.215.14"],
    "localhost": ["127.0.0.1", "::1"],
    "sneaky.example": ["93.184.215.14", "10.0.0.5"],
  });

  it("accepts a public http(s) URL", async () => {
    const url = await assertSafeUrl("https://example.com/path?q=1", { lookupFn });
    assert.equal(url.href, "https://example.com/path?q=1");
  });

  const rejected = {
    "garbage": "not a url",
    "non-http scheme": "file:///etc/passwd",
    "javascript scheme": "javascript:alert(1)",
    "credentials in URL": "https://user:pass@example.com",
    "localhost": "http://localhost:3001",
    "loopback IP": "http://127.0.0.1/",
    "loopback in hex form": "http://0x7f000001/",
    "IPv6 loopback": "http://[::1]/",
    "cloud metadata": "http://169.254.169.254/latest/meta-data/",
    "host with one private record": "https://sneaky.example",
    "unresolvable host": "https://does-not-exist.example",
  };

  for (const [name, url] of Object.entries(rejected)) {
    it(`rejects ${name}`, async () => {
      await assert.rejects(assertSafeUrl(url, { lookupFn }), UnsafeUrlError);
    });
  }

  it("allows private hosts only when explicitly enabled", async () => {
    const url = await assertSafeUrl("http://localhost:3001", { lookupFn, allowPrivateHosts: true });
    assert.equal(url.hostname, "localhost");
  });
});

describe("createHostChecker", () => {
  it("resolves each hostname once", async () => {
    let calls = 0;
    const lookupFn = async () => {
      calls += 1;
      return [{ address: "93.184.215.14", family: 4 }];
    };
    const isAllowed = createHostChecker({ lookupFn });

    assert.equal(await isAllowed("example.com"), true);
    assert.equal(await isAllowed("example.com"), true);
    assert.equal(calls, 1);
  });

  it("blocks private hosts", async () => {
    const isAllowed = createHostChecker({ lookupFn: fakeLookup({ internal: ["192.168.0.10"] }) });
    assert.equal(await isAllowed("internal"), false);
    assert.equal(await isAllowed("127.0.0.1"), false);
  });
});
