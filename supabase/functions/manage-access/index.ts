// Équipe360 — gestion des comptes d'accès par téléphone
// Actions : create (donner un accès), reset_password, remove
// Appelée depuis l'appli par un responsable (owner/manager) ou un admin Équipe360.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PHONE_DOMAIN = "tel.equipe360.app";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function fail(message: string, status = 400) {
  return json({ error: message }, status);
}

// 622 12 34 56 / +224 622123456 / 00224… → 224622123456
function normalizePhone(raw: string): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9) d = "224" + d;
  if (!/^\d{11,15}$/.test(d)) return null;
  return d;
}

const ROLES = ["owner", "manager", "agent"] as const;
type Role = (typeof ROLES)[number];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Méthode non autorisée", 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: userData } = await userClient.auth.getUser();
  const caller = userData?.user;
  if (!caller) return fail("Connexion requise", 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("Requête invalide");
  }

  const action = String(body.action ?? "");
  const companyId = String(body.company_id ?? "");
  if (!companyId) return fail("Entreprise manquante");

  // Droits de l'appelant dans cette entreprise
  const { data: isAdmin } = await userClient.rpc("am_i_platform_admin");
  let callerRole: Role | "admin" | null = isAdmin ? "admin" : null;
  if (!callerRole) {
    const { data: m } = await admin
      .from("company_members")
      .select("role, companies!inner(status)")
      .eq("company_id", companyId)
      .eq("user_id", caller.id)
      .maybeSingle();
    // deno-lint-ignore no-explicit-any
    const status = (m as any)?.companies?.status;
    if (m && status === "active" && (m.role === "owner" || m.role === "manager")) {
      callerRole = m.role as Role;
    }
  }
  if (!callerRole) return fail("Action réservée aux responsables", 403);

  // Un responsable (manager) ne gère que les agents ; le propriétaire et l'admin gèrent tout
  const canHandle = (role: Role) =>
    callerRole === "admin" || callerRole === "owner" || role === "agent";

  if (action === "create") {
    const role = String(body.role ?? "agent") as Role;
    if (!ROLES.includes(role)) return fail("Rôle inconnu");
    if (!canHandle(role)) return fail("Vous ne pouvez créer que des accès agent", 403);

    const phone = normalizePhone(String(body.phone ?? ""));
    if (!phone) return fail("Numéro de téléphone invalide");
    const password = String(body.password ?? "");
    if (password.length < 6) return fail("Le mot de passe doit faire au moins 6 caractères");
    const displayName = String(body.display_name ?? "").trim() || null;
    const employeeId = body.employee_id ? String(body.employee_id) : null;

    if (employeeId) {
      const { data: emp } = await admin
        .from("employees")
        .select("id")
        .eq("id", employeeId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!emp) return fail("Employé introuvable dans cette entreprise");
    }

    const email = `${phone}@${PHONE_DOMAIN}`;
    const { data: existing } = await admin.rpc("service_user_id_by_email", { p_email: email });
    if (existing) {
      return fail("Ce numéro a déjà un compte Équipe360. Utilisez « Nouveau mot de passe » si besoin.");
    }

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { phone, display_name: displayName },
    });
    if (cErr || !created.user) return fail("Création du compte impossible : " + (cErr?.message ?? ""));

    const { error: mErr } = await admin.from("company_members").insert({
      company_id: companyId,
      user_id: created.user.id,
      role,
      employee_id: employeeId,
      phone,
      display_name: displayName,
    });
    if (mErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return fail("Liaison à l'entreprise impossible : " + mErr.message);
    }
    return json({ ok: true, user_id: created.user.id, phone });
  }

  if (action === "reset_password" || action === "remove") {
    const targetId = String(body.user_id ?? "");
    const { data: target } = await admin
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", targetId)
      .maybeSingle();
    if (!target) return fail("Compte introuvable dans cette entreprise");
    if (!canHandle(target.role as Role)) return fail("Action non autorisée sur ce compte", 403);
    if (targetId === caller.id && action === "remove") return fail("Vous ne pouvez pas retirer votre propre accès");

    const { data: tu } = await admin.auth.admin.getUserById(targetId);
    const isPhoneAccount = tu?.user?.email?.endsWith("@" + PHONE_DOMAIN) ?? false;

    if (action === "reset_password") {
      if (!isPhoneAccount) return fail("Ce compte se connecte par e-mail : mot de passe à changer par son titulaire");
      const password = String(body.password ?? "");
      if (password.length < 6) return fail("Le mot de passe doit faire au moins 6 caractères");
      const { error } = await admin.auth.admin.updateUserById(targetId, { password });
      if (error) return fail(error.message);
      return json({ ok: true });
    }

    const { error: dErr } = await admin
      .from("company_members")
      .delete()
      .eq("company_id", companyId)
      .eq("user_id", targetId);
    if (dErr) return fail(dErr.message);
    const { count } = await admin
      .from("company_members")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", targetId);
    if (isPhoneAccount && !count) await admin.auth.admin.deleteUser(targetId);
    return json({ ok: true });
  }

  return fail("Action inconnue");
});
