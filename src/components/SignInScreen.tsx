import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput } from 'react-native';
import { sendOtp, verifyOtp } from '@/data/auth';
import { Btn, ErrorText } from './ui';

/** Email OTP sign-in. On success the auth listener in _layout swaps to the app. */
export function SignInScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>RepVoice</Text>
      {stage === 'email' ? (
        <>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor="#999"
          />
          <Btn
            title={busy ? 'Sending…' : 'Send code'}
            disabled={busy || !email.includes('@')}
            onPress={() =>
              run(async () => {
                await sendOtp(email.trim());
                setStage('code');
              })
            }
          />
        </>
      ) : (
        <>
          <Text style={styles.label}>Enter the 6-digit code sent to {email}</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="123456"
            placeholderTextColor="#999"
          />
          <Btn
            title={busy ? 'Verifying…' : 'Verify'}
            disabled={busy || code.length !== 6}
            onPress={() => run(() => verifyOtp(email.trim(), code.trim()))}
          />
          <Btn title="Use a different email" onPress={() => setStage('email')} />
        </>
      )}
      {error != null && <ErrorText error={error} />}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 24, textAlign: 'center', marginBottom: 24, color: '#000' },
  label: { color: '#000' },
  input: { borderWidth: 1, borderColor: '#000', padding: 10, fontSize: 16, color: '#000' },
});
