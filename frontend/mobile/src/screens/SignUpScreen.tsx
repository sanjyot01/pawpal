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
import { COLORS } from '../constants/colors';
import { apiPost, saveToken, saveUserId, errorMessage } from '../utils/api';
import { registerForPush } from '../utils/push';
import { validateEmail, validateName, validateNewPassword } from '../utils/validation';

interface SignUpScreenProps {
  navigation: any;
}

interface AuthResponse {
  token: string;
  userId: number;
  name: string;
  email: string;
}

export const SignUpScreen: React.FC<SignUpScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Field-level messages mirror the backend's @NotBlank/@Email/@Size; formError
  // carries what only the server can know, such as the email already existing.
  const [nameError, setNameError] = useState<string>();
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [formError, setFormError] = useState<string>();

  const handleCreateAccount = async () => {
    const nextNameError = validateName(name);
    const nextEmailError = validateEmail(email);
    const nextPasswordError = validateNewPassword(password);
    setNameError(nextNameError);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError(undefined);
    if (nextNameError || nextEmailError || nextPasswordError) return;

    try {
      setLoading(true);
      const res = await apiPost<AuthResponse>('/api/auth/register', {
        name: name.trim(),
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
      setFormError(errorMessage(e, 'Could not create your account. Please try again.'));
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
          <Text style={styles.appName}>Create Account</Text>
          <Text style={styles.subText}>Join the PawPal community today!</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          {/* Server-side failure: email taken, throttled, backend unreachable */}
          {formError ? (
            <View style={styles.formErrorBox}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          {/* Full Name */}
          <Text style={styles.fieldLabel}>Full Name</Text>
          <TextInput
            style={[styles.input, nameError ? styles.inputError : null]}
            value={name}
            onChangeText={(t) => {
              setName(t);
              if (nameError) setNameError(undefined);
            }}
            placeholder="Jennifer T."
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="words"
          />
          {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}

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
              placeholder="Min. 6 characters"
              placeholderTextColor={COLORS.textMuted}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>
          {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}

          {/* Terms */}
          <Text style={styles.termsText}>
            By signing up, you agree to our{' '}
            <Text style={styles.termsLink}>Terms & Privacy Policy</Text>
          </Text>

          {/* Create Account button */}
          <TouchableOpacity style={styles.createBtn} onPress={handleCreateAccount} activeOpacity={0.85} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.createBtnText}>Create Account →</Text>
            }
          </TouchableOpacity>

          {/* Sign In link */}
          <TouchableOpacity style={styles.signInWrap} onPress={() => navigation.goBack()}>
            <Text style={styles.signInText}>
              Already have an account?{'  '}
              <Text style={styles.signInLink}>Sign In</Text>
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
    position: 'absolute', width: 260, height: 260, borderRadius: 130,
    backgroundColor: COLORS.purple, opacity: 0.07, bottom: 60, right: -60,
  },

  logoWrap: { alignItems: 'center', marginBottom: 24 },
  logoBg: {
    width: 90, height: 90, borderRadius: 26,
    backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 20, elevation: 6,
  },
  logoPaw: { fontSize: 42 },
  appName: { fontSize: 26, fontWeight: '800', color: COLORS.primary, marginBottom: 4 },
  subText: { fontSize: 14, color: COLORS.textSub },

  card: {
    width: '100%', backgroundColor: COLORS.card, borderRadius: 24, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 20, elevation: 4,
  },

  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSub, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.bg, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: COLORS.text, marginBottom: 16,
  },
  inputError: { borderColor: COLORS.red },
  fieldError: { fontSize: 12, color: COLORS.red, marginTop: -10, marginBottom: 12 },
  formErrorBox: {
    backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 18,
  },
  formErrorText: { fontSize: 13, color: '#B91C1C', lineHeight: 18 },
  passwordWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12,
  },
  passwordInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: COLORS.text },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 13 },
  eyeIcon: { fontSize: 18 },

  termsText: { fontSize: 12, color: COLORS.textSub, textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  termsLink: { color: COLORS.primary },

  createBtn: {
    backgroundColor: COLORS.primary, borderRadius: 100, paddingVertical: 16, alignItems: 'center',
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 14, elevation: 5,
  },
  createBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  signInWrap: { marginTop: 16, alignItems: 'center' },
  signInText: { fontSize: 14, color: COLORS.textSub },
  signInLink: { color: COLORS.primary, fontWeight: '700' },
});
