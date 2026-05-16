/**
 * adminAuth.ts — MPL AUTH V2
 * Auth    : Supabase signInWithPassword (email + mot de passe)
 * Rôle    : lu depuis public.profiles après login
 *
 * Mapping rôles Supabase → UIRole :
 *   'superadmin' → 'full'
 *   'admin'      → 'full'
 *   'readonly'   → 'viewer'
 *   autre/absent → accès refusé (null)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type UIRole = 'full' | 'viewer';

export interface UserProfile {
  id:        string;
  email:     string;
  full_name: string;
  role:      string;
  uiRole:    UIRole;
}

export function mapSupabaseRole(rawRole: string | null | undefined): UIRole | null {
  switch (rawRole?.toLowerCase().trim()) {
    case 'superadmin':
    case 'admin':
      return 'full';
    case 'readonly':
      return 'viewer';
    default:
      return null;
  }
}

export async function fetchUserProfile(
  client: SupabaseClient,
  userId: string,
  email: string
): Promise<UserProfile | null> {
  const { data, error } = await client
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .single();

  if (error || !data) {
    console.warn('[adminAuth] Profil introuvable:', userId, error?.message);
    return null;
  }

  const uiRole = mapSupabaseRole(data.role);
  if (!uiRole) {
    console.warn('[adminAuth] Rôle non autorisé:', data.role);
    return null;
  }

  return {
    id:        data.id,
    email:     data.email ?? email,
    full_name: data.full_name ?? email,
    role:      data.role,
    uiRole,
  };
}

export async function adminSignOut(client: SupabaseClient): Promise<void> {
  await client.auth.signOut();
}
