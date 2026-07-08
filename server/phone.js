/**
 * Phone number normalization to E.164 (e.g. "+491761234567").
 *
 * Storing one canonical form fixes three problems at once:
 *  - the per-customer booking limit can no longer be bypassed by re-typing the
 *    same number in a different format ("+49 176…" vs "0176…"),
 *  - lookups (cancel, GDPR) can match on an indexed exact value instead of a
 *    full-table REGEXP scan,
 *  - a person's data is findable by a single canonical key.
 *
 * Defaults to German (+49) for numbers written in national form, which is the
 * only ambiguous case for a German salon tool.
 */

function normalizePhone(input, defaultCc = "49") {
  const hasPlus = String(input ?? "").trim().startsWith("+");
  const digits = String(input ?? "").replace(/\D/g, "");
  if (!digits) return "";

  if (hasPlus)             return "+" + digits;              // already international
  if (digits.startsWith("00")) return "+" + digits.slice(2); // 00 → international prefix
  if (digits.startsWith("0"))  return "+" + defaultCc + digits.slice(1); // national → +49
  if (digits.startsWith(defaultCc)) return "+" + digits;     // country code without +
  return "+" + defaultCc + digits;                            // bare national number
}

module.exports = { normalizePhone };
