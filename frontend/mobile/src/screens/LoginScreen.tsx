import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { COLORS } from '../constants/colors';
import { apiPost, saveToken, saveUserId, errorMessage } from '../utils/api';
import { registerForPush } from '../utils/push';
import { validateEmail, validateLoginPassword } from '../utils/validation';

// ── Google OAuth ─────────────────────────────────────────────────────────────
// Web Client ID is required by GoogleSignin to obtain an ID token on Android.
// Google Console → OAuth 2.0 Client ID → Web application
const GOOGLE_WEB_CLIENT_ID = '279020382757-qpht0e5cnq7ne1liof6sk0h8ptt4vkuj.apps.googleusercontent.com';

GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
// ────────────────────────────────────────────────────────────────────────────

interface LoginScreenProps {
  navigation: any;
}

interface AuthResponse {
  token: string;
  userId: number;
  name: string;
  email: string;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Per-field messages shown under the input; formError is the server's answer
  // (wrong password, throttled), which belongs to the form rather than a field.
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [formError, setFormError] = useState<string>();

  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;
      if (!idToken) throw new Error('No ID token returned from Google');
      const res = await apiPost<AuthResponse>('/api/auth/google', { idToken });
      await saveToken(res.token);
      await saveUserId(res.userId);
      // Now that a session exists the device token has something to attach to.
      // Deliberately not awaited: push is optional and must never delay sign-in.
      registerForPush();
      navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
    } catch (e: any) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return;
      setFormError(errorMessage(e, 'Google sign-in failed. Please try again.'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSignIn = async () => {
    // Format and presence are knowable here, so check them before spending a
    // round trip; anything that depends on server state is the server's to say.
    const nextEmailError = validateEmail(email);
    const nextPasswordError = validateLoginPassword(password);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError(undefined);
    if (nextEmailError || nextPasswordError) return;

    try {
      setLoading(true);
      const res = await apiPost<AuthResponse>('/api/auth/login', {
        email: email.trim(),
        password,
      });
      await saveToken(res.token);
      await saveUserId(res.userId);
      // Now that a session exists the device token has something to attach to.
      // Deliberately not awaited: push is optional and must never delay sign-in.
      registerForPush();
      navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
    } catch (e) {
      setFormError(errorMessage(e, 'Invalid email or password'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Decorative blobs */}
        <View style={styles.blobOrange} />
        <View style={styles.blobPurple} />

        {/* Logo */}
        <View style={styles.logoWrap}>
          <View style={styles.logoBg}>
            <Text style={styles.logoPaw}>🐾</Text>
          </View>
          <Text style={styles.appName}>PawPal</Text>
          <Text style={styles.welcomeText}>Welcome back!</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          {/* Google Button */}
          <TouchableOpacity
            style={[styles.googleBtn, googleLoading && styles.btnDisabled]}
            onPress={handleGoogleSignIn}
            activeOpacity={0.8}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator color={COLORS.text} style={{ marginRight: 12 }} />
            ) : (
              <Text style={styles.googleG}>G</Text>
            )}
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Server-side failure: wrong password, throttled, backend unreachable */}
          {formError ? (
            <View style={styles.formErrorBox}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          {/* Email */}
          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            style={[styles.input, emailError ? styles.inputError : null]}
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (emailError) setEmailError(undefined);
            }}
            placeholder="your@email.com"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}

          {/* Password */}
          <Text style={styles.fieldLabel}>Password</Text>
          <View style={[styles.passwordWrap, passwordError ? styles.inputError : null]}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (passwordError) setPasswordError(undefined);
              }}
              placeholder="••••••••"
              placeholderTextColor={COLORS.textMuted}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>
          {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}

          {/* Forgot password */}
          <TouchableOpacity style={styles.forgotWrap}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          {/* Sign In */}
          <TouchableOpacity style={styles.signInBtn} onPress={handleSignIn} activeOpacity={0.85} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.signInText}>Sign In →</Text>
            }
          </TouchableOpacity>

          {/* Sign Up link */}
          <TouchableOpacity style={styles.signUpWrap} onPress={() => navigation.navigate('SignUp')}>
            <Text style={styles.signUpText}>
              Don't have an account?{'  '}
              <Text style={styles.signUpLink}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  container: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 20 },

  blobOrange: {
    position: 'absolute', width: 480, height: 480, borderRadius: 240,
    backgroundColor: COLORS.primary, opacity: 0.1, top: -120, left: -80,
  },
  blobPurple: {
    position: 'absolute', width: 280, height: 280, borderRadius: 140,
    backgroundColor: COLORS.purple, opacity: 0.08, bottom: 60, right: -60,
  },

  logoWrap: { alignItems: 'center', marginBottom: 28 },
  logoBg: {
    width: 100, height: 100, borderRadius: 28, backgroundColor: COLORS.card,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 20, elevation: 6,
  },
  logoPaw: { fontSize: 46 },
  appName: { fontSize: 32, fontWeight: '800', color: COLORS.primary, marginBottom: 4 },
  welcomeText: { fontSize: 16, color: COLORS.textSub },

  card: {
    width: '100%', backgroundColor: COLORS.card, borderRadius: 24, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 20, elevation: 4,
  },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 20,
  },
  btnDisabled: { opacity: 0.6 },
  googleG: {
    fontSize: 18, fontWeight: '700', color: '#4285F4',
    marginRight: 12, width: 22, textAlign: 'center',
  },
  googleBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.text },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { fontSize: 13, color: COLORS.textMuted },

  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSub, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.bg, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: COLORS.text, marginBottom: 16,
  },
  inputError: { borderColor: COLORS.red },
  // Pulled up under the input it belongs to, which the field's own marginBottom
  // would otherwise push away.
  fieldError: { fontSize: 12, color: COLORS.red, marginTop: -10, marginBottom: 12 },
  formErrorBox: {
    backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 18,
  },
  formErrorText: { fontSize: 13, color: '#B91C1C', lineHeight: 18 },
  passwordWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  passwordInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: COLORS.text },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 13 },
  eyeIcon: { fontSize: 18 },

  forgotWrap: { alignSelf: 'flex-end', marginBottom: 24, marginTop: 4 },
  forgotText: { fontSize: 13, color: COLORS.primary },

  signInBtn: {
    backgroundColor: COLORS.primary, borderRadius: 100, paddingVertical: 16, alignItems: 'center',
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 14, elevation: 5,
  },
  signInText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  signUpWrap: { marginTop: 16, alignItems: 'center' },
  signUpText: { fontSize: 14, color: COLORS.textSub },
  signUpLink: { color: COLORS.primary, fontWeight: '700' },
});
