// Auth + profile access. Screens use these (or the hooks) — never the supabase
// client directly.
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { profileSchema, type Profile, type Unit } from '@/types/db';

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

/** Sign in with an email + password (the everyday path). */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * Create an account with an email + password. If the Supabase project has email
 * confirmations enabled, `signUp` returns no session until the user confirms — we
 * surface that to the caller so it can tell "you're in" from "check your email".
 */
export async function signUpWithPassword(
  email: string,
  password: string
): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return { needsConfirmation: data.session == null };
}

/**
 * Set (or change) the signed-in user's password. Used by Settings → ACCOUNT and
 * as the second half of the forgot-password flow. Works whether or not a password
 * was set before (accounts created via the old email-code flow have none).
 */
export async function setPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/**
 * Forgot-password path, kept fully in-app (no email deep links). We email a
 * one-time sign-in code with `shouldCreateUser: false` (never conjure an empty
 * account from a typo), the user enters it to sign in, then sets a new password
 * from Settings. `verifyRecoveryCode` completes the sign-in.
 */
export async function sendRecoveryCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
}

export async function verifyRecoveryCode(email: string, token: string): Promise<void> {
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
  return data ? profileSchema.parse(data) : null;
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
