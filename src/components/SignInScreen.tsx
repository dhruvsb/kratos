// Sign in (mockup 13) — the one screen every stranger sees, so it never breaks
// character: dark LED theme, no password. Stage one takes an email and mails a
// code; stage two is the same screen with a segmented code field that
// auto-advances and verifies on the last digit (CODE_LEN must match the Supabase
// project's configured email-OTP length). On success the auth listener in
// _layout swaps to the app.
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Caret } from '@/components/workout/Caret';
import { sendOtp, verifyOtp } from '@/data/auth';
import { color, font, radius, space, tracking } from '@/theme/tokens';

const CODE_LEN = 8; // must match the Supabase project's email-OTP length (currently 8 digits)

export function SignInScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeInput = useRef<TextInput>(null);

  const emailOk = /.+@.+\..+/.test(email.trim());

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await sendOtp(email.trim());
      setStage('code');
      setCode('');
      // Give the sheet a frame to mount before grabbing focus.
      setTimeout(() => codeInput.current?.focus(), 120);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(token: string) {
    setBusy(true);
    setError(null);
    try {
      await verifyOtp(email.trim(), token);
      // No navigation here — the auth listener in _layout swaps the tree.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code did not match.');
      setCode('');
      codeInput.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  // Verify the moment the sixth digit lands — no separate submit tap.
  useEffect(() => {
    if (stage === 'code' && code.length === CODE_LEN && !busy) void verify(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, stage]);

  const boxes = Array.from({ length: CODE_LEN }, (_, i) => code[i] ?? '');
  const activeBox = Math.min(code.length, CODE_LEN - 1);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.body}>
        <Text style={styles.logo}>
          REPVOICE<Text style={{ color: color.acc }}>.</Text>
        </Text>
        <Text style={styles.lede}>
          No password. We email a code — after that the app stays signed in.
        </Text>

        {stage === 'email' ? (
          <>
            <Text style={styles.fieldLabel}>EMAIL</Text>
            <View style={styles.emailField}>
              <TextInput
                style={styles.emailInput}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (error) setError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={color.t3}
                returnKeyType="go"
                onSubmitEditing={() => emailOk && !busy && send()}
              />
            </View>
            <Pressable
              style={[styles.cta, (!emailOk || busy) && styles.ctaOff]}
              onPress={send}
              disabled={!emailOk || busy}
            >
              <Text style={[styles.ctaText, (!emailOk || busy) && { color: color.t3 }]}>
                {busy ? 'SENDING…' : 'SEND CODE'}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.fieldLabel}>ENTER CODE</Text>
            <Text style={styles.sentTo}>
              Sent to <Text style={{ color: color.t2 }}>{email.trim()}</Text>
            </Text>

            {/* Hidden input drives the visible boxes; tapping the row focuses it. */}
            <Pressable style={styles.boxRow} onPress={() => codeInput.current?.focus()}>
              {boxes.map((digit, i) => {
                const on = i === activeBox && code.length < CODE_LEN;
                return (
                  <View
                    key={i}
                    style={[
                      styles.box,
                      digit !== '' && styles.boxFilled,
                      on && styles.boxActive,
                    ]}
                  >
                    {digit !== '' ? (
                      <Text style={styles.boxDigit}>{digit}</Text>
                    ) : on && !busy ? (
                      <Caret height={20} />
                    ) : null}
                  </View>
                );
              })}
              <TextInput
                ref={codeInput}
                style={styles.hiddenInput}
                value={code}
                onChangeText={(v) => {
                  setCode(v.replace(/\D/g, '').slice(0, CODE_LEN));
                  if (error) setError(null);
                }}
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                maxLength={CODE_LEN}
                caretHidden
                editable={!busy}
              />
            </Pressable>

            <Text style={styles.codeHint}>
              {busy ? 'Verifying…' : 'Auto-advances and verifies on the last digit.'}
            </Text>

            <View style={styles.codeFooter}>
              <Pressable onPress={send} disabled={busy} hitSlop={8}>
                <Text style={styles.footerLink}>RESEND CODE</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setStage('email');
                  setCode('');
                  setError(null);
                }}
                hitSlop={8}
              >
                <Text style={styles.footerLinkDim}>DIFFERENT EMAIL</Text>
              </Pressable>
            </View>
          </>
        )}

        {error != null && <Text style={styles.error}>{error}</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 30 },
  logo: { fontFamily: font.uiBold, fontSize: 26, color: color.t1, letterSpacing: 0.4 },
  lede: {
    fontFamily: font.num,
    fontSize: 11.5,
    lineHeight: 20,
    color: color.t3,
    marginTop: 14,
    maxWidth: 260,
  },

  fieldLabel: {
    fontFamily: font.numSemibold,
    fontSize: 8,
    letterSpacing: tracking.wide,
    color: color.t3,
    marginTop: 46,
  },
  emailField: {
    marginTop: 11,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: color.acc35,
  },
  emailInput: { fontFamily: font.numMedium, fontSize: 16, color: color.t1, padding: 0 },

  cta: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.s2,
    borderWidth: 1,
    borderColor: color.acc35,
    borderRadius: radius.ctl + 1,
    marginTop: 26,
  },
  ctaOff: { borderColor: color.line2, backgroundColor: color.s0 },
  ctaText: { fontFamily: font.uiSemibold, fontSize: 11, letterSpacing: tracking.label, color: color.acc },

  sentTo: { fontFamily: font.num, fontSize: 11.5, color: color.t3, marginTop: 11 },
  boxRow: { flexDirection: 'row', gap: 7, marginTop: 16 },
  box: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.line2,
    borderRadius: radius.key + 1,
    backgroundColor: color.sin,
  },
  boxFilled: { borderColor: color.line2 },
  boxActive: { borderColor: color.acc },
  boxDigit: { fontFamily: font.numBold, fontSize: 20, color: color.t1 },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },

  codeHint: { fontFamily: font.num, fontSize: 10.5, lineHeight: 17, color: color.t3, marginTop: 12 },
  codeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: color.line,
  },
  footerLink: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.acc },
  footerLinkDim: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.t3 },

  error: { fontFamily: font.num, fontSize: 11, lineHeight: 17, color: color.warn, marginTop: 18 },
});
