// Auth + profile access. Screens use these (or the hooks) — never the supabase
// client directly.
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, Unit } from '@/types/db';

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

// The event is forwarded so callers can tell a real sign-out / account switch
// (which must clear the persisted cache) apart from a silent token refresh.
export function onAuthStateChange(
  callback: (session: Session | null, event: AuthChangeEvent) => void
) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(session, event));
  return () => data.subscription.unsubscribe();
}

/** Sends the project's configured email OTP. Creates the account on first sign-in. */
export async function sendOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifyOtp(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Permanently deletes the signed-in user's account and everything on it —
 * required in-app by App Store Review Guideline 5.1.1(v) (deactivation doesn't
 * count). The server side is `public.delete_own_account()` (migration 0005), a
 * security-definer RPC that acts only on `auth.uid()`, so this call can never
 * touch another account.
 *
 * The sign-out is `scope: 'local'` on purpose: the user row is already gone, so
 * a server-side logout would fail — but the local clear still emits SIGNED_OUT,
 * which is what wipes the persisted cache in `_layout`.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_own_account');
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' });
}

export async function getProfile(): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function updateProfile(patch: {
  display_name?: string;
  default_unit?: Unit;
}): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('Not signed in');
  const { error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('user_id', session.user.id);
  if (error) throw error;
}

export async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error('Not signed in');
  return session.user.id;
}
