/**
 * Unit tests for phone normalization. Pure function — no server or DB needed.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizePhone } = require("../server/phone");

test("German national forms map to +49", () => {
  assert.equal(normalizePhone("0176 1234567"), "+491761234567");
  assert.equal(normalizePhone("0176-123 45 67"), "+491761234567");
  assert.equal(normalizePhone("(0176) 1234567"), "+491761234567");
});

test("already-international forms are preserved", () => {
  assert.equal(normalizePhone("+49 176 1234567"), "+491761234567");
  assert.equal(normalizePhone("+491761234567"), "+491761234567");
  assert.equal(normalizePhone("+1 555 205 1927"), "+15552051927"); // non-German kept
});

test("00 international prefix becomes +", () => {
  assert.equal(normalizePhone("0049 176 1234567"), "+491761234567");
});

test("country code without + is recognized", () => {
  assert.equal(normalizePhone("49 176 1234567"), "+491761234567");
});

test("the same number in different formats normalizes identically", () => {
  const forms = ["0176 1234567", "+49 176 1234567", "0049-176-1234567", "491761234567"];
  const normalized = forms.map((f) => normalizePhone(f));
  assert.equal(new Set(normalized).size, 1, "all formats collapse to one canonical value");
});

test("empty / junk input returns empty string", () => {
  assert.equal(normalizePhone(""), "");
  assert.equal(normalizePhone(null), "");
  assert.equal(normalizePhone("   "), "");
});
