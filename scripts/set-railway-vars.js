/**
 * Updates Railway environment variables via GraphQL API.
 * Run AFTER domain is live and you have the service/environment IDs from Railway dashboard.
 *
 * Usage:
 *   node scripts/set-railway-vars.js <serviceId> <environmentId> <domain> <metaAppSecret>
 *
 * Get serviceId + environmentId:
 *   Railway dashboard → your service → Settings → copy from URL or IDs section
 */

require("dotenv").config();

const [, , serviceId, environmentId, domain, metaAppSecret] = process.argv;

if (!serviceId || !environmentId || !domain) {
  console.error("Usage: node scripts/set-railway-vars.js <serviceId> <environmentId> <domain> [metaAppSecret]");
  console.error("Example: node scripts/set-railway-vars.js abc123 def456 barberbook.de myAppSecret");
  process.exit(1);
}

const RAILWAY_TOKEN = process.env.RAILWAY_API_TOKEN;
if (!RAILWAY_TOKEN) {
  console.error("RAILWAY_API_TOKEN missing from .env");
  process.exit(1);
}

const vars = {
  ALLOWED_ORIGIN: `https://${domain}`,
  SUPER_ADMIN_PASSWORD: "superbarber2025",
};

if (metaAppSecret) vars.META_APP_SECRET = metaAppSecret;

// SALON_SLUG must be deleted (not just set to empty)
const deleteVars = ["SALON_SLUG"];

async function upsertVars() {
  const variables = Object.entries(vars).map(([name, value]) => ({ name, value }));

  const mutation = `
    mutation UpsertVariables($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `;

  const res = await fetch("https://backboard.railway.app/graphql/v2", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RAILWAY_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        input: {
          serviceId,
          environmentId,
          projectId: null,
          variables: Object.fromEntries(variables.map(v => [v.name, v.value])),
        },
      },
    }),
  });

  const json = await res.json();
  if (json.errors) {
    console.error("GraphQL errors:", JSON.stringify(json.errors, null, 2));
    return false;
  }
  return true;
}

async function deleteVar(name) {
  const mutation = `
    mutation DeleteVariable($input: VariableDeleteInput!) {
      variableDelete(input: $input)
    }
  `;
  const res = await fetch("https://backboard.railway.app/graphql/v2", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RAILWAY_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: mutation,
      variables: { input: { serviceId, environmentId, name } },
    }),
  });
  const json = await res.json();
  if (json.errors) {
    const notFound = json.errors.some(e => e.message.includes("not found") || e.message.includes("does not exist"));
    if (notFound) { console.log(`${name}: already absent`); return; }
    console.error(`Failed to delete ${name}:`, json.errors);
  } else {
    console.log(`${name}: deleted`);
  }
}

(async () => {
  console.log(`Setting Railway vars for service ${serviceId} / env ${environmentId}`);
  console.log("Variables to set:", vars);

  const ok = await upsertVars();
  if (ok) {
    console.log("Variables upserted successfully");
    for (const name of deleteVars) await deleteVar(name);
    console.log("\nDone. Redeploy Railway service to pick up the new vars.");
  }
})();
