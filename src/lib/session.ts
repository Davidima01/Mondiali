import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const KEY = "pool_user";

export type SessionUser = { id: string; username: string; is_admin: boolean };

export function getSession(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function setSession(u: SessionUser | null) {
  if (typeof window === "undefined") return;
  if (u) localStorage.setItem(KEY, JSON.stringify(u));
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("pool-session"));
}

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setUser(getSession());
    setReady(true);
    const h = () => setUser(getSession());
    window.addEventListener("pool-session", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("pool-session", h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return { user, ready };
}

export async function loginOrCreate(rawUsername: string): Promise<SessionUser> {
  const username = rawUsername.trim().toLowerCase();
  if (!username) throw new Error("Username is required");
  if (!/^[a-z0-9_]{2,20}$/.test(username))
    throw new Error("Use 2–20 lowercase letters, numbers or _");

  const { data: existing, error: selErr } = await supabase
    .from("users")
    .select("id, username, is_admin")
    .eq("username", username)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    setSession(existing as SessionUser);
    return existing as SessionUser;
  }

  const isAdmin = username === "admin";
  const { data, error } = await supabase
    .from("users")
    .insert({ username, is_admin: isAdmin })
    .select("id, username, is_admin")
    .single();
  if (error) throw error;
  setSession(data as SessionUser);
  return data as SessionUser;
}
