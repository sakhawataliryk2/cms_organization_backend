require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const baseUrl = process.argv[2] || "http://localhost:8080";
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("Missing CRON_SECRET in .env. Add: CRON_SECRET=your-secret");
  process.exit(1);
}

const routes = [
  "/api/cron/archive-cleanup",
  "/api/cron/task-reminders",
  "/api/cron/delete-retry",
];

async function test(path) {
  const url = baseUrl + path;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
    });
    const data = await res.json().catch(() => ({}));
    const ok = res.ok ? "OK" : "FAIL";
    console.log(`${ok} ${res.status} ${path}`, data.message || data.error || data);
    return res.ok;
  } catch (err) {
    console.error(`ERR ${path}`, err.message);
    return false;
  }
}

(async () => {
  console.log("Testing cron routes at", baseUrl, "\n");
  for (const path of routes) {
    await test(path);
  }
  console.log("\nDone.");
})();
