// Sign in (mockup 13) — the one screen every stranger sees, so it never breaks
// character: dark LED theme. Everyday path is email + password (SIGN IN / CREATE
// ACCOUNT). "Forgot password?" drops to a fully in-app recovery: we email a
// one-time code (no deep links), the user enters it in the segmented field to
// sign in, then sets a new password from Settings. On success the auth listener
// in _layout swaps to the app — no navigation here.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
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
import {
  sendRecoveryCode,
  signInWithPassword,
  signUpWithPassword,
  verifyRecoveryCode,
} from '@/data/auth';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { userMessage } from '@/lib/errors';

const CODE_LEN = 8; // must match the Supabase project's email-OTP length (currently 8 digits)
const MIN_PASSWORD = 6; // Supabase's default minimum

type Mode = 'signIn' | 'signUp';

export function SignInScreen() {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Forgot-password recovery is a self-contained sub-flow layered over sign-in.
  const [reset, setReset] = useState<null | 'email' | 'code'>(null);
  const [code, setCode] = useState('');
  const codeInput = useRef<TextInput>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const emailOk = /.+@.+\..+/.test(email.trim());
  const passwordOk = password.length >= MIN_PASSWORD;

  function clearFeedback() {
    if (error) setError(null);
    if (notice) setNotice(null);
  }

  async function submit() {
    if (!emailOk || !passwordOk) return;
    setBusy(true);
    clearFeedback();
    try {
      if (mode === 'signIn') {
        await signInWithPassword(email.trim(), password);
        // Auth listener in _layout swaps the tree on success.
      } else {
        const { needsConfirmation } = await signUpWithPassword(email.trim(), password);
        if (needsConfirmation) {
          setNotice('Check your email to confirm your account, then sign in.');
          setMode('signIn');
          setPassword('');
        }
      }
    } catch (e) {
      setError(userMessage(e, 'Something went wrong. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    if (!emailOk) return;
    setBusy(true);
    clearFeedback();
    try {
      await sendRecoveryCode(email.trim());
      setReset('code');
      setCode('');
      setTimeout(() => codeInput.current?.focus(), 120);
    } catch (e) {
      setError(userMessage(e, 'Could not send the code. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function verify(token: string) {
    setBusy(true);
    clearFeedback();
    try {
      await verifyRecoveryCode(email.trim(), token);
      // Signed in — _layout swaps the tree. Set a new password from Settings.
    } catch (e) {
      setError(userMessage(e, 'That code did not match. Check it and try again.'));
      setCode('');
      codeInput.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  // Verify the moment the last digit lands — no separate submit tap.
  useEffect(() => {
    if (reset === 'code' && code.length === CODE_LEN && !busy) void verify(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, reset]);

  function exitReset() {
    setReset(null);
    setCode('');
    clearFeedback();
  }

  const boxes = Array.from({ length: CODE_LEN }, (_, i) => code[i] ?? '');
  const activeBox = Math.min(code.length, CODE_LEN - 1);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.body}>
        <Text style={styles.logo}>
          KRATOS<Text style={{ color: color.acc }}>.</Text>
        </Text>

        {reset ? (
          <ResetFlow
            styles={styles}
            color={color}
            stage={reset}
            email={email.trim()}
            busy={busy}
            emailOk={emailOk}
            code={code}
            boxes={boxes}
            activeBox={activeBox}
            codeInput={codeInput}
            onEmailChange={(v) => {
              setEmail(v);
              clearFeedback();
            }}
            onCodeChange={(v) => {
              setCode(v.replace(/\D/g, '').slice(0, CODE_LEN));
              clearFeedback();
            }}
            onSend={sendCode}
            onBack={exitReset}
          />
        ) : (
          <>
            <Text style={styles.lede}>
              {mode === 'signIn'
                ? 'Sign in with your email and password.'
                : 'Create an account to start logging.'}
            </Text>

            <Text style={styles.fieldLabel}>EMAIL</Text>
            <View style={styles.field}>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  clearFeedback();
                }}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={color.t3}
                returnKeyType="next"
              />
            </View>

            <Text style={styles.fieldLabel}>PASSWORD</Text>
            <View style={styles.field}>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  clearFeedback();
                }}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
                secureTextEntry={!showPassword}
                placeholder={mode === 'signUp' ? `At least ${MIN_PASSWORD} characters` : '••••••••'}
                placeholderTextColor={color.t3}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
              <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={8}>
                <Text style={styles.showToggle}>{showPassword ? 'HIDE' : 'SHOW'}</Text>
              </Pressable>
            </View>

            <Pressable
              style={[styles.cta, (!emailOk || !passwordOk || busy) && styles.ctaOff]}
              onPress={submit}
              disabled={!emailOk || !passwordOk || busy}
            >
              <Text style={[styles.ctaText, (!emailOk || !passwordOk || busy) && { color: color.t3 }]}>
                {busy
                  ? mode === 'signIn'
                    ? 'SIGNING IN…'
                    : 'CREATING…'
                  : mode === 'signIn'
                    ? 'SIGN IN'
                    : 'CREATE ACCOUNT'}
              </Text>
            </Pressable>

            <View style={styles.footerRow}>
              <Pressable
                onPress={() => {
                  setMode(mode === 'signIn' ? 'signUp' : 'signIn');
                  clearFeedback();
                }}
                disabled={busy}
                hitSlop={8}
              >
                <Text style={styles.footerLink}>
                  {mode === 'signIn' ? 'CREATE ACCOUNT' : 'HAVE AN ACCOUNT? SIGN IN'}
                </Text>
              </Pressable>
              {mode === 'signIn' && (
                <Pressable
                  onPress={() => {
                    setReset('email');
                    clearFeedback();
                  }}
                  disabled={busy}
                  hitSlop={8}
                >
                  <Text style={styles.footerLinkDim}>FORGOT PASSWORD?</Text>
                </Pressable>
              )}
            </View>
          </>
        )}

        {notice != null && <Text style={styles.notice}>{notice}</Text>}
        {error != null && <Text style={styles.error}>{error}</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}

function ResetFlow({
  styles,
  color,
  stage,
  email,
  busy,
  emailOk,
  code,
  boxes,
  activeBox,
  codeInput,
  onEmailChange,
  onCodeChange,
  onSend,
  onBack,
}: {
  styles: ReturnType<typeof makeStyles>;
  color: Theme['color'];
  stage: 'email' | 'code';
  email: string;
  busy: boolean;
  emailOk: boolean;
  code: string;
  boxes: string[];
  activeBox: number;
  codeInput: RefObject<TextInput | null>;
  onEmailChange: (v: string) => void;
  onCodeChange: (v: string) => void;
  onSend: () => void;
  onBack: () => void;
}) {
  if (stage === 'email') {
    return (
      <>
        <Text style={styles.lede}>
          Forgot your password? We'll email a one-time code to sign in — then set a new password in
          Settings.
        </Text>
        <Text style={styles.fieldLabel}>EMAIL</Text>
        <View style={styles.field}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={onEmailChange}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={color.t3}
            returnKeyType="go"
            onSubmitEditing={() => emailOk && !busy && onSend()}
          />
        </View>
        <Pressable
          style={[styles.cta, (!emailOk || busy) && styles.ctaOff]}
          onPress={onSend}
          disabled={!emailOk || busy}
        >
          <Text style={[styles.ctaText, (!emailOk || busy) && { color: color.t3 }]}>
            {busy ? 'SENDING…' : 'EMAIL ME A CODE'}
          </Text>
        </Pressable>
        <View style={styles.footerRow}>
          <Pressable onPress={onBack} disabled={busy} hitSlop={8}>
            <Text style={styles.footerLinkDim}>BACK TO SIGN IN</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <>
      <Text style={styles.lede}>Enter the code we sent — you'll be signed straight in.</Text>
      <Text style={styles.fieldLabel}>ENTER CODE</Text>
      <Text style={styles.sentTo}>
        Sent to <Text style={{ color: color.t2 }}>{email}</Text>
      </Text>

      {/* Hidden input drives the visible boxes; tapping the row focuses it. */}
      <Pressable style={styles.boxRow} onPress={() => codeInput.current?.focus()}>
        {boxes.map((digit, i) => {
          const on = i === activeBox && code.length < CODE_LEN;
          return (
            <View
              key={i}
              style={[styles.box, digit !== '' && styles.boxFilled, on && styles.boxActive]}
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
          onChangeText={onCodeChange}
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

      <View style={styles.footerRow}>
        <Pressable onPress={onSend} disabled={busy} hitSlop={8}>
          <Text style={styles.footerLink}>RESEND CODE</Text>
        </Pressable>
        <Pressable onPress={onBack} disabled={busy} hitSlop={8}>
          <Text style={styles.footerLinkDim}>BACK TO SIGN IN</Text>
        </Pressable>
      </View>
    </>
  );
}

const makeStyles = (color: Theme['color']) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 30 },
  logo: { fontFamily: font.uiSemibold, fontSize: 26, color: color.t1, letterSpacing: 0.4 },
  lede: {
    fontFamily: font.num,
    fontSize: 11.5,
    lineHeight: 20,
    color: color.t3,
    marginTop: 14,
    maxWidth: 280,
  },

  fieldLabel: {
    fontFamily: font.numSemibold,
    fontSize: 8,
    letterSpacing: tracking.wide,
    color: color.t3,
    marginTop: 26,
  },
  field: {
    marginTop: 11,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: color.acc35,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: { flex: 1, fontFamily: font.numMedium, fontSize: 16, color: color.t1, padding: 0 },
  showToggle: {
    fontFamily: font.numSemibold,
    fontSize: 9,
    letterSpacing: tracking.label,
    color: color.t3,
  },

  cta: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.ctaBg,
    borderWidth: 1,
    borderColor: color.ctaBorder,
    borderRadius: radius.ctl + 1,
    marginTop: 26,
  },
  ctaOff: { borderColor: color.line2, backgroundColor: color.s0 },
  ctaText: { fontFamily: font.uiMedium, fontSize: 11, letterSpacing: tracking.label, color: color.ctaFg },

  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 26,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: color.line,
  },
  footerLink: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.acc },
  footerLinkDim: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.t3 },

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

  codeHint: { fontFamily: font.num, fontSize: 10.5, lineHeight: 18, color: color.t3, marginTop: 12 },

  notice: { fontFamily: font.num, fontSize: 11, lineHeight: 18, color: color.acc, marginTop: 18 },
  error: { fontFamily: font.num, fontSize: 11, lineHeight: 18, color: color.warn, marginTop: 18 },
});
