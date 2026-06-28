/**
 * Test script for AI-powered WhatsApp intent classification.
 *
 * Usage:
 *   node scripts/test-ai-classify.js ANTHROPIC_API_KEY
 *   -- or --
 *   set ANTHROPIC_API_KEY=sk-ant-... in your .env, then:
 *   node scripts/test-ai-classify.js
 *
 * Prints intent for each sample message so you can verify the AI
 * is classifying correctly before going live.
 */

require("dotenv").config();

const key = process.argv[2] || process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error("Usage: node scripts/test-ai-classify.js YOUR_API_KEY");
  process.exit(1);
}
process.env.ANTHROPIC_API_KEY = key;

const { classifyIntent } = require("../server/ai");

const TEST_MESSAGES = [
  // ── Should be BOOK ───────────────────────────────────────────────────────────
  { text: "Ich möchte einen Termin buchen",                  expected: "book" },
  { text: "Habt ihr morgen noch was frei?",                  expected: "book" },
  { text: "Wann kann ich nächste Woche vorbeikommen?",       expected: "book" },
  { text: "Ich hätte gerne einen Haarschnitt am Freitag",    expected: "book" },
  { text: "Can I book an appointment for Saturday?",         expected: "book" },
  { text: "Ist um 14 Uhr noch ein Platz frei?",             expected: "book" },

  // ── Should be CANCEL ─────────────────────────────────────────────────────────
  { text: "Ich muss leider meinen Termin absagen",           expected: "cancel" },
  { text: "Kannst du meinen Termin stornieren?",             expected: "cancel" },
  { text: "Ich kann heute nicht mehr kommen",               expected: "cancel" },
  { text: "Bitte sagt meinen Termin ab",                    expected: "cancel" },
  { text: "Ich will meinen Termin verschieben",              expected: "cancel" },

  // ── Should be OTHER ──────────────────────────────────────────────────────────
  { text: "Was kostet ein Haarschnitt?",                    expected: "other" },
  { text: "Wo seid ihr genau?",                             expected: "other" },
  { text: "Bis wann habt ihr heute offen?",                 expected: "other" },
  { text: "Danke, war super!",                              expected: "other" },
  { text: "Macht ihr auch Färben?",                         expected: "other" },
  { text: "👍",                                             expected: "other" },
];

const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";

async function run() {
  console.log(`\n${BOLD}Testing AI intent classification...${RESET}\n`);
  const usingAI = !!process.env.ANTHROPIC_API_KEY;
  console.log(`Mode: ${usingAI ? `${GREEN}Claude Haiku (AI)${RESET}` : `${YELLOW}Keyword fallback${RESET}`}\n`);

  let passed = 0;
  let failed = 0;

  for (const { text, expected } of TEST_MESSAGES) {
    const result = await classifyIntent(text);
    const ok = result === expected;
    if (ok) passed++; else failed++;

    const icon   = ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    const intent = ok ? result : `${RED}${result}${RESET} (expected ${expected})`;
    console.log(`${icon} [${intent}] "${text}"`);
  }

  console.log(`\n${BOLD}Results: ${passed}/${TEST_MESSAGES.length} passed${RESET}`);
  if (failed > 0) {
    console.log(`${RED}${failed} failed — review the AI prompt in server/ai.js if needed${RESET}`);
    process.exit(1);
  } else {
    console.log(`${GREEN}All passed — AI classification is working correctly!${RESET}`);
  }
}

run().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
