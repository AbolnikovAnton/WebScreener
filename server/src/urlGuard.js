import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

// Protection against SSRF (Server-Side Request Forgery): without it anyone could
// make our headless browser open http://localhost, the office LAN, or the cloud
// metadata endpoint (169.254.169.254) and read the response through the results.

export class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const blockedRanges = new BlockList();

// IPv4 ranges that must never be reachable from the scanner.
for (const [network, prefix] of [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
]) {
  blockedRanges.addSubnet(network, prefix, "ipv4");
}

// IPv6 ranges. IPv4-mapped addresses (::ffff:127.0.0.1) are matched against
// the IPv4 rules above by BlockList itself.
for (const [network, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["64:ff9b::", 96], // NAT64, can point at private IPv4
  ["100::", 64], // discard
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
]) {
  blockedRanges.addSubnet(network, prefix, "ipv6");
}

export function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 0) {
    return false;
  }
  return !blockedRanges.check(address, family === 6 ? "ipv6" : "ipv4");
}

function stripBrackets(hostname) {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

async function resolveAll(hostname, lookupFn) {
  if (isIP(hostname)) {
    return [hostname];
  }
  const records = await lookupFn(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

/**
 * Returns true when every address the hostname resolves to is public.
 * A hostname with several A/AAAA records is rejected if any of them is private.
 */
export async function isPublicHostname(hostname, { lookupFn = lookup } = {}) {
  try {
    const addresses = await resolveAll(stripBrackets(hostname), lookupFn);
    return addresses.length > 0 && addresses.every(isPublicAddress);
  } catch {
    return false;
  }
}

/**
 * Parses and validates a user-supplied URL. Throws UnsafeUrlError with a
 * message that is safe to show to the user.
 */
export async function assertSafeUrl(rawUrl, { allowPrivateHosts = false, lookupFn = lookup } = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("Invalid URL. Use a full address like https://example.com.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http:// and https:// addresses can be scanned.");
  }

  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with a username or password are not allowed.");
  }

  if (allowPrivateHosts) {
    return url;
  }

  const hostname = stripBrackets(url.hostname);
  let addresses;
  try {
    addresses = await resolveAll(hostname, lookupFn);
  } catch {
    throw new UnsafeUrlError(`Could not resolve host "${hostname}".`);
  }

  if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
    throw new UnsafeUrlError("This address points to a local or private network and cannot be scanned.");
  }

  return url;
}

/**
 * Memoized per-scan checker for the request interceptor: a page can fire
 * hundreds of requests to the same few hosts, so each host is resolved once.
 */
export function createHostChecker({ allowPrivateHosts = false, lookupFn = lookup } = {}) {
  const cache = new Map();

  return function isAllowedHost(hostname) {
    if (allowPrivateHosts) {
      return Promise.resolve(true);
    }
    if (!cache.has(hostname)) {
      cache.set(hostname, isPublicHostname(hostname, { lookupFn }));
    }
    return cache.get(hostname);
  };
}
