/**
 * Which salons the suite runs against.
 *
 * Each entry is just a name + the Host header to send. The Host's first label
 * is the salon *slug* (e.g. "next-level-salon.test" → slug "next-level-salon"),
 * which the tenant middleware uses to resolve the salon.
 *
 * ── Scaling to more shops ─────────────────────────────────────────────────────
 * When you onboard a new salon, add its slug here — the same battery of tests
 * then runs against it automatically. No test logic changes needed, because the
 * assertions read each salon's services/hours from its own API.
 *
 * You can also override at runtime without editing this file:
 *   TEST_SALON_SLUGS="next-level-salon,acme-cuts" npm test
 *
 * The default is the slug created by the demo seed in server/db.js, which is
 * what a fresh CI database always contains.
 */

const DEFAULT_SLUGS = ["next-level-salon"];

const slugs = (process.env.TEST_SALON_SLUGS
  ? process.env.TEST_SALON_SLUGS.split(",").map((s) => s.trim()).filter(Boolean)
  : DEFAULT_SLUGS);

// The Host domain suffix is arbitrary — only the first label (the slug) matters.
const SUFFIX = process.env.TEST_HOST_SUFFIX || "test";

module.exports = slugs.map((slug) => ({
  name: slug,
  host: `${slug}.${SUFFIX}`,
}));
