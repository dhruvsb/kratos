// Auth + profile access. Screens use these (or the hooks) — never the supabase
// client directly.
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, Unit } from '@/types/db';

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(callback: (session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

/** Sends a 6-digit OTP code to the email. Creates the account on first sign-in. */
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
