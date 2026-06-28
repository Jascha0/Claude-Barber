/**
 * AI-powered message classification using Claude Haiku.
 * Falls back to keyword matching if ANTHROPIC_API_KEY is not set.
 *
 * Returns: "book" | "cancel" | "other"
 */

const Anthropic = require("@anthropic-ai/sdk");

let client = null;
function getClient() {
  if (!client && process.env.ANTHROPIC_API_KEY) {
    client = new Anthropic.Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const SYSTEM_PROMPT = `You are a message classifier for a barbershop / hair salon booking system.
A customer just sent a WhatsApp message. Classify it into exactly one of these three categories:

- book   → customer wants to make, schedule, or inquire about booking a new appointment
- cancel → customer wants to cancel, reschedule, or remove an existing appointment
- other  → anything else: questions about prices, hours, directions, complaints, greetings, thanks, unclear messages, etc.

Rules:
- Reply with exactly one word: book, cancel, or other
- No punctuation, no explanation
- When in doubt, prefer "other" so a human can handle it`;

async function classifyWithAI(text) {
  const ai = getClient();
  if (!ai) return null; // no key → fall back to keywords

  try {
    const msg = await ai.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 5,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    });

    const result = msg.content[0]?.text?.trim().toLowerCase();
    if (result === "book" || result === "cancel" || result === "other") return result;
    return "other"; // unexpected output → safe default
  } catch (err) {
    console.error("[ai] classifyIntent failed:", err.message);
    return null; // failure → fall back to keywords
  }
}

// Keyword fallback — used when AI is unavailable
// More specific phrases first to avoid false positives (e.g. "heute" alone is too broad)
const CANCEL_KEYWORDS = [
  "absagen", "absage", "abgesagt", "sagt ab", "termin ab", "sage ab",
  "stornieren", "storno", "storniert",
  "abmelden", "abbestellen",
  "verschieben", "umbuchen", "umplanen",
  "cancel", "nicht mehr kommen", "kann nicht kommen", "kann leider nicht",
  "muss leider absagen", "komme nicht",
];
const BOOK_KEYWORDS = [
  "termin buchen", "termin machen", "termin anfragen", "termin reserv",
  "buchen", "buchung", "reservier", "appointment", "book",
  "noch was frei", "noch frei", "noch platz frei", "noch ein platz",
  "verfügbar", "nächste woche", "diese woche",
  "wann kann ich", "wann habt ihr noch",
  "hätte gerne", "würde gerne",
];

function classifyWithKeywords(text) {
  const lower = text.toLowerCase();
  if (CANCEL_KEYWORDS.some(kw => lower.includes(kw))) return "cancel";
  if (BOOK_KEYWORDS.some(kw => lower.includes(kw)))   return "book";
  return "other";
}

async function classifyIntent(text) {
  const aiResult = await classifyWithAI(text);
  if (aiResult !== null) return aiResult;
  return classifyWithKeywords(text);
}

module.exports = { classifyIntent };
