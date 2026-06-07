"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthSync() {
  useEffect(() => {
    // 1. Initial sync of session to cookie
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;
      } else {
        document.cookie = `sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax; Secure`;
      }
    });

    // 2. Listen for auth changes and sync to cookie
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;
      } else {
        document.cookie = `sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax; Secure`;
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
