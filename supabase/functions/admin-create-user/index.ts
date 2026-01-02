// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Payload = {
  full_name?: string;
  email: string;
  password: string;
};

Deno.serve(async (req) => {
  try {
    // --- Secrets (Edge Function env vars) ---
    const url = Deno.env.get("https://lwsddsbizqwsdmrcgnwm.supabase.co");
    const anonKey = Deno.env.get("sb_publishable_otgRLtgXtaZgj-c2pxov1A_SQBpaxVB");
    const serviceKey = Deno.env.get("sb_secret_9qnjnIifUeM1v4dn60QxIw_N_AhBbF1");

    if (!url || !anonKey || !serviceKey) {
      return json(500, {
        message:
          "Missing required secrets. Ensure SB_URL, SB_ANON_KEY, SB_SERVICE_ROLE_KEY are set.",
      });
    }

    // --- Identify caller (JWT passed from browser) ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return json(401, { message: "Missing Authorization token" });
    }

    // Client that represents the caller (used only to read who they are)
    const authed = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: meAuth, error: meAuthErr } = await authed.auth.getUser();
    if (meAuthErr || !meAuth?.user) {
      return json(401, { message: "Unauthenticated" });
    }

    const callerId = meAuth.user.id;

    // Admin client (service role) - do privileged actions server-side
    const admin = createClient(url, serviceKey);

    // --- Load caller profile from public.users (service role bypasses RLS) ---
    const { data: caller, error: callerErr } = await admin
      .from("users")
      .select("id, role, account_type, business_owner_id, is_active")
      .eq("id", callerId)
      .single();

    if (callerErr || !caller) {
      return json(403, { message: "Caller profile not found in public.users" });
    }

    if (!caller.is_active) {
      return json(403, { message: "Caller is inactive" });
    }

    if (caller.role !== "admin") {
      return json(403, { message: "Admin required" });
    }

    if (caller.account_type !== "business") {
      return json(403, { message: "Business account required" });
    }

    // --- Parse input ---
    const body = (await req.json()) as Payload;

    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    const full_name = body.full_name?.trim() || null;

    if (!email || !password) {
      return json(400, { message: "Missing email or password" });
    }

    // Force business scope to caller’s owner id
    const ownerId = caller.business_owner_id ?? caller.id;

    // --- Create Auth user ---
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr || !created?.user) {
      return json(400, { message: createErr?.message ?? "Create user failed" });
    }

    const newId = created.user.id;

    // --- Insert row into public.users ---
    const { error: insertErr } = await admin.from("users").insert({
      id: newId,
      email,
      full_name,
      role: "standard",
      account_type: "business",
      business_owner_id: ownerId,
      is_active: true,
    });

    if (insertErr) {
      // Rollback auth user if profile insert fails (best effort)
      await admin.auth.admin.deleteUser(newId);
      return json(400, { message: insertErr.message });
    }

    return json(200, {
      message: "User created",
      user_id: newId,
      email,
    });
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
