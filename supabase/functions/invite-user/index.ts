import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // Be generous here to avoid header-mismatch preflight failures
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-user-agent",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function noContent(status = 204) {
  return new Response(null, { status, headers: { ...corsHeaders } });
}

function bad(msg: string, status = 400) {
  return json({ ok: false, error: msg }, status);
}

function escapeHtml(s: string) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

serve(async (req) => {
  // ✅ Preflight must succeed without auth
  if (req.method === "OPTIONS") return noContent(204);
  if (req.method !== "POST") return bad("Method not allowed", 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
    const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://www.warehouseintelligence.co.uk").replace(/\/$/, "");
    const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Warehouse Intelligence <noreply@warehouseintelligence.co.uk>";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return bad("Missing Supabase env vars", 500);
    if (!RESEND_API_KEY) return bad("Missing RESEND_API_KEY secret", 500);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return bad("Not authenticated", 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Identify caller from the incoming user token
    const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
    const caller = callerData?.user;
    if (callerErr || !caller) return bad("Invalid session", 401);

    const payload = await req.json().catch(() => ({} as any));
    const emailRaw = String(payload?.email ?? "").trim().toLowerCase();
    const fullNameRaw = String(payload?.full_name ?? "").trim();

    if (!emailRaw || !emailRaw.includes("@")) return bad(`Invalid email "${emailRaw}"`, 400);
    if (!fullNameRaw) return bad("Full name is required", 400);

    // Load inviter profile
    const { data: inviterRow, error: inviterRowErr } = await admin
      .from("users")
      .select("id, email, full_name, role, account_id, account_type, is_active")
      .eq("id", caller.id)
      .single();

    if (inviterRowErr || !inviterRow) return bad("Inviter profile not found in users table", 403);
    if (inviterRow.is_active === false) return bad("Inviter is deactivated", 403);

    const isAdmin = inviterRow.role === "admin";
    const isBusiness = inviterRow.account_type === "business";
    if (!isAdmin) return bad("Only admins can invite users", 403);
    if (!isBusiness) return bad("Invites are only available for business accounts", 403);

    // Generate Supabase invite link
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email: emailRaw,
      options: {
        redirectTo: `${SITE_URL}/`,
        data: { full_name: fullNameRaw },
      },
    });

    if (linkErr) return bad(`Failed to generate invite link: ${linkErr.message}`, 500);

    const actionLink =
      (linkData as any)?.properties?.action_link ||
      (linkData as any)?.action_link ||
      "";

    if (!actionLink) return bad("Invite link not returned by Supabase", 500);

    // Upsert invited user row (tenant-scoped)
    const userRow = {
      email: emailRaw,
      full_name: fullNameRaw,
      role: "standard",
      account_type: "business",
      account_id: inviterRow.account_id,
      business_owner_id: inviterRow.id,
      is_active: true,
    };

    const { error: upsertErr } = await admin.from("users").upsert(userRow, { onConflict: "email" });
    if (upsertErr) return bad(`Failed to upsert invited user row: ${upsertErr.message}`, 500);

    // Send email via Resend
    const safeName = escapeHtml(fullNameRaw);
    const safeInviter = escapeHtml(inviterRow.full_name || inviterRow.email || "Warehouse Intelligence");

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height:1.5;">
        <h2 style="margin:0 0 12px;">You’ve been invited to Warehouse Intelligence</h2>
        <p style="margin:0 0 12px;">Hello ${safeName},</p>
        <p style="margin:0 0 12px;">${safeInviter} has invited you to join their business account.</p>
        <p style="margin:0 0 18px;">Click below to accept the invite and set your password.</p>
        <p style="margin:0 0 24px;">
          <a href="${actionLink}" style="display:inline-block; padding:10px 14px; background:#2563eb; color:#fff; text-decoration:none; border-radius:8px;">
            Accept invite
          </a>
        </p>
        <p style="margin:0 0 6px; color:#6b7280; font-size:12px;">
          If you did not expect this invitation, you can ignore this email.
        </p>
      </div>
    `;

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: emailRaw,
        subject: "You’ve been invited to Warehouse Intelligence",
        html,
      }),
    });

    if (!resendResp.ok) {
      const t = await resendResp.text().catch(() => "");
      return bad(`Resend send failed: ${resendResp.status} ${t}`, 502);
    }

    return json({ ok: true });
  } catch (e) {
    return bad((e as any)?.message || "Unexpected error", 500);
  }
});
