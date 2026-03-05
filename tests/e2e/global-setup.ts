import { ADMIN_EMAIL, BASE_URL } from "./helpers/auth";

/**
 * Global setup: runs once before all tests.
 * Resets admin lockout and rate limits to ensure clean test state.
 */
async function globalSetup() {
  console.log("🔧 Global setup: resetting lockout and rate limits...");

  try {
    const res = await fetch(`${BASE_URL}/api/test/reset-lockout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL }),
    });

    if (res.ok) {
      const data = await res.json();
      console.log("✅ Reset successful:", JSON.stringify(data));
    } else {
      console.warn(`⚠️ Reset returned ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.warn("⚠️ Could not reset lockout:", err);
  }
}

export default globalSetup;
