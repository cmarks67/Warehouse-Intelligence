// ==============================
// supabase/functions/admin-promote-user/index.ts
// ==============================

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Payload = { user_id: string };

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

    const { data: caller } = await admin
      .from("users")
      .select("id, role, account_type, business_owner_id, is_active")
      .eq("id", callerId)
      .single();

    if (!caller?.is_active) return json(403, { message: "Caller inactive" });
    if (caller.role !== "admin") return json(403, { message: "Admin required" });
    if (caller.account_type !== "business") return json(403, { message: "Business account required" });

    const body = (await req.json()) as Payload;
    if (!body.user_id) return json(400, { message: "Missing user_id" });

    const ownerId = caller.business_owner_id ?? caller.id;

    const { data: target } = await admin
      .from("users")
      .select("id, business_owner_id, role, is_active")
      .eq("id", body.user_id)
      .single();

    if (!target) return json(404, { message: "Target not found" });
    if (!target.is_active) return json(400, { message: "Target is inactive" });

    // Ensure target is within caller’s business scope
    if ((target.business_owner_id ?? target.id) !== ownerId) {
      return json(403, { message: "Target not in your business scope" });
    }

    // Promote to admin
    const { error } = await admin.from("users").update({ role: "admin" }).eq("id", body.user_id);
    if (error) return json(400, { message: error.message });

    return json(200, { message: "User promoted", user_id: body.user_id });
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
