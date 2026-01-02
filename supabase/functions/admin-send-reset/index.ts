// ==============================
// supabase/functions/admin-send-reset/index.ts
// ==============================

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Payload = { email: string; redirectTo?: string };

Deno.serve(async (req) => {
  try {
    const url = Deno.env.get("https://lwsddsbizqwsdmrcgnwm.supabase.co");
    const anonKey = Deno.env.get("sb_publishable_otgRLtgXtaZgj-c2pxov1A_SQBpaxVB");
    const serviceKey = Deno.env.get("sb_secret_9qnjnIifUeM1v4dn60QxIw_N_AhBbF1");

    if (!url || !anonKey || !serviceKey) {
      return json(500, {
        message:
          "Missing required secrets. Ensure SB_URL, SB_ANON_KEY, SB_SERVICE_ROLE_KEY are set.",
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json(401, { message: "Missing Authorization token" });

    const authed = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: meAuth, error: meAuthErr } = await authed.auth.getUser();
    if (meAuthErr || !meAuth?.user) return json(401, { message: "Unauthenticated" });

    const callerId = meAuth.user.id;

    const admin = createClient(url, serviceKey);

    const { data: caller, error: callerErr } = await admin
      .from("users")
      .select("id, role, is_active")
      .eq("id", callerId)
      .single();

    if (callerErr || !caller) return json(403, { message: "Caller profile not found" });
    if (!caller.is_active) return json(403, { message: "Caller inactive" });
    if (caller.role !== "admin") return json(403, { message: "Admin required" });

    const body = (await req.json()) as Payload;
    const email = (body.email || "").trim().toLowerCase();
    if (!email) return json(400, { message: "Missing email" });

    // Default local redirect; override from client for production
    const redirectTo = body.redirectTo || "http://localhost:5173/password-reset";

    const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return json(400, { message: error.message });

    return json(200, { message: `Reset email sent to ${email}` });
  } catch (e) {
    console.error(e);
    return json(500, { message: "Server error" });
  }
});

function json(status: number, data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
