import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Eye, EyeOff, ArrowRight, Fingerprint } from 'lucide-react';
import { apiUrl } from '@/lib/api-base';
import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import {
  authFetch,
  completeAuthSession,
  friendlyClientError,
  hasProfile,
  isAdminUser,
  readApiJson,
} from '@/lib/auth-session';

function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative min-h-[calc(100dvh-4rem)] overflow-hidden px-5 py-10 sm:py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(15,118,110,0.12),_transparent_55%),linear-gradient(180deg,#f8fafc_0%,#eef6f4_100%)]"
      />
      <div className="mx-auto w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <Link href="/" className="display text-3xl font-semibold tracking-tight text-foreground">
            BonList
          </Link>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-border/80 bg-white/90 p-6 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.35)] backdrop-blur sm:p-7">
          {children}
        </div>
        {footer ? <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div> : null}
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  testId,
  autoComplete = 'current-password',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  testId: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-foreground">{label}</span>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="field-input pr-11"
          data-testid={testId}
          required
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </label>
  );
}

function LinkedInIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#0A66C2"
        d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.73V1.73C24 .77 23.21 0 22.23 0z"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 36 26.8 37 24 37c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l.1.1 6.2 5.2C39.2 36.3 44 31 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.49 0-1.95.93-1.95 1.89v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.09 24 18.1 24 12.07z"
      />
    </svg>
  );
}

type SocialConfig = {
  google: boolean;
  linkedin: boolean;
  facebook: boolean;
};

function oauthConfigErrorMessage() {
  return 'Google sign-in needs a Client ID and Client Secret on the Worker, the correct OAuth redirect URI in Google Cloud, and your account added as a test user on the consent screen (app is in Testing). Use email for now, or try again after setup.';
}

function SocialAuthButtons({ returnTo = '/' }: { returnTo?: string }) {
  const start = (provider: keyof SocialConfig) => {
    // Always navigate; Worker redirects to the IdP when configured, or back with ?error=oauth_config.
    window.location.href = apiUrl(
      `/api/auth/oauth/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`,
    );
  };

  return (
    <div className="space-y-2.5" data-testid="social-auth-buttons">
      <button
        type="button"
        onClick={() => start('linkedin')}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary/60"
        data-testid="button-continue-linkedin"
      >
        <LinkedInIcon /> Continue with LinkedIn
      </button>
      <button
        type="button"
        onClick={() => start('google')}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary/60"
        data-testid="button-continue-google"
      >
        <GoogleIcon /> Continue with Google
      </button>
      <button
        type="button"
        onClick={() => start('facebook')}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary/60"
        data-testid="button-continue-facebook"
      >
        <FacebookIcon /> Continue with Facebook
      </button>
    </div>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      or
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function OtpBoxes({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <InputOTP maxLength={6} value={value} onChange={onChange} containerClassName="justify-center">
      <InputOTPGroup className="gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <InputOTPSlot
            key={i}
            index={i}
            className="h-12 w-10 rounded-lg border border-border text-base font-semibold"
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}

function afterAuthNavigate(
  setLocation: (path: string) => void,
  payload: Record<string, any>,
  fallback = '/',
) {
  // Prefer admin home when we already have admin access (MFA is not required for login).
  if (payload.isAdmin && payload.adminToken) {
    setLocation('/admin');
    return;
  }
  if (payload.adminRequiresMfaSetup) {
    setLocation('/security/admin-mfa');
    return;
  }
  if (payload.requiresMfa && payload.mfaToken) {
    setLocation(`/login?mfaToken=${payload.mfaToken}`);
    return;
  }
  setLocation(fallback);
}

export function SignupPage() {
  const [location, setLocation] = useLocation();
  const oauthError = useMemo(
    () => new URLSearchParams(location.split('?')[1] || '').get('error'),
    [location],
  );
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState(
    oauthError === 'oauth_config'
      ? oauthConfigErrorMessage()
      : oauthError
        ? "We couldn't complete social sign-in. Please try again or use email."
        : '',
  );
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (isAdminUser()) setLocation('/admin');
    else if (hasProfile()) setLocation('/');
  }, [setLocation]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  const submitDetails = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const response = await authFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: email.trim().split('@')[0] || 'BonList user',
        }),
      });
      const payload = await readApiJson(response);
      if (!response.ok) throw new Error(payload.error || 'Sign up failed');
      if (!payload.challengeId) {
        throw new Error(payload.error || 'Could not start email verification.');
      }
      setChallengeId(String(payload.challengeId));
      setMaskedEmail(String(payload.maskedEmail || email));
      if (payload.verificationCode && payload.devOtp) {
        setCode(String(payload.verificationCode));
        setInfo(
          `Dev mode: email delivery is not configured yet. Your signup verification code is ${payload.verificationCode}.`,
        );
      } else {
        setInfo('We emailed a 6-digit code. It expires in 15 minutes.');
      }
      setResendIn(30);
      setStep('otp');
    } catch (err) {
      setError(friendlyClientError(err, "We couldn't create your account. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await authFetch('/api/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ challengeId, code: code.trim() }),
      });
      const payload = await readApiJson(response);
      if (!response.ok) throw new Error(payload.error || 'Verification failed');
      await completeAuthSession(payload as any);
      afterAuthNavigate(setLocation, payload, '/');
    } catch (err) {
      setError(friendlyClientError(err, 'That code was incorrect or expired.'));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (resendIn > 0 || !challengeId) return;
    setLoading(true);
    setError('');
    try {
      const response = await authFetch('/api/auth/resend', {
        method: 'POST',
        body: JSON.stringify({ challengeId, email: email.trim() }),
      });
      const payload = await readApiJson(response);
      if (!response.ok) throw new Error(payload.error || 'Could not resend');
      setChallengeId(String(payload.challengeId || challengeId));
      setMaskedEmail(String(payload.maskedEmail || email));
      if (payload.verificationCode && payload.devOtp) {
        setCode(String(payload.verificationCode));
        setInfo('Dev mode: use the new code shown below.');
      } else {
        setInfo('A new code was sent. Check your inbox and spam folder.');
      }
      setResendIn(30);
    } catch (err) {
      setError(friendlyClientError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={step === 'details' ? 'Create your account' : 'Check your email'}
      description={
        step === 'details'
          ? 'Start reviewing CVs and matching roles in minutes. We will email a verification code to confirm your address.'
          : `Enter the 6-digit code we sent to ${maskedEmail || email}. Wrong email? Change it below and resend.`
      }
      footer={
        step === 'details' ? (
          <>
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-primary">
              Sign in
            </Link>
          </>
        ) : (
          <button
            type="button"
            className="font-semibold text-primary"
            onClick={() => {
              setStep('details');
              setCode('');
              setError('');
              setInfo('');
            }}
          >
            Change email
          </button>
        )
      }
    >
      {step === 'details' ? (
        <>
          <SocialAuthButtons returnTo="/" />
          <Divider />
          <form onSubmit={submitDetails} className="space-y-4" data-testid="form-signup">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-foreground">Email</span>
              <input
                type="email"
                className="field-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                data-testid="input-signup-email"
              />
            </label>
            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              placeholder="At least 8 characters"
              testId="input-signup-password"
              autoComplete="new-password"
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <button
              type="submit"
              disabled={loading || !email.trim() || password.length < 8}
              className="btn-primary w-full disabled:opacity-50"
              data-testid="button-signup-submit"
            >
              {loading ? 'Sending code…' : 'Continue'} <ArrowRight size={15} />
            </button>
            <p className="text-center text-[11px] leading-5 text-muted-foreground">
              By continuing, you agree to BonList&apos;s Terms of Service and Privacy Policy.
            </p>
          </form>
        </>
      ) : (
        <form onSubmit={submitOtp} className="space-y-5" data-testid="form-signup-otp">
          {info ? <p className="text-xs text-muted-foreground">{info}</p> : null}
          {code.length === 6 && info.includes('verification code is') ? (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-center text-lg font-semibold tracking-[0.35em]">
              {code}
            </p>
          ) : null}
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-foreground">
              Email for this code
            </span>
            <input
              type="email"
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              data-testid="input-signup-otp-email"
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Mistyped your address? Fix it here, then tap Resend code.
            </span>
          </label>
          <OtpBoxes value={code} onChange={setCode} />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="btn-primary w-full disabled:opacity-50"
          >
            {loading ? 'Verifying…' : 'Verify email'}
          </button>
          <p className="text-center text-sm text-muted-foreground">
            Didn&apos;t receive the code?{' '}
            <button
              type="button"
              className="font-semibold text-primary disabled:opacity-50"
              disabled={resendIn > 0 || loading}
              onClick={() => void resend()}
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
            </button>
          </p>
        </form>
      )}
    </AuthShell>
  );
}

export function LoginPage() {
  const [location, setLocation] = useLocation();
  const params = useMemo(() => new URLSearchParams(location.split('?')[1] || ''), [location]);
  const initialMfa = params.get('mfaToken') || '';
  const oauthError = params.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(
    oauthError
      ? oauthError === 'oauth_config'
        ? oauthConfigErrorMessage()
        : oauthError === 'oauth_denied'
          ? 'Social sign-in was cancelled. Try again, or use email.'
          : "We couldn't complete social sign-in. Please try again or use email."
      : '',
  );
  const [loading, setLoading] = useState(false);
  const [mfaToken, setMfaToken] = useState(initialMfa);
  const [mfaCode, setMfaCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [mode, setMode] = useState<'password' | 'magic'>(initialMfa ? 'password' : 'password');
  const [magicChallenge, setMagicChallenge] = useState('');
  const [magicCode, setMagicCode] = useState('');
  const [passkeysOn, setPasskeysOn] = useState(false);

  useEffect(() => {
    if (!initialMfa && isAdminUser()) setLocation('/admin');
    else if (!initialMfa && hasProfile()) setLocation('/');
  }, [setLocation, initialMfa]);

  useEffect(() => {
    void authFetch('/api/career/auth/config')
      .then((r) => r.json())
      .then((d) => setPasskeysOn(Boolean(d.passkeys)))
      .catch(() => undefined);
  }, []);

  const finish = async (payload: Record<string, any>) => {
    if (payload.requiresMfa && payload.mfaToken) {
      setMfaToken(payload.mfaToken);
      return;
    }
    await completeAuthSession(payload as any);
    afterAuthNavigate(setLocation, payload, '/');
  };

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await authFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const payload = await readApiJson(response);
      if (!response.ok) throw new Error(payload.error || 'Login failed');
      await finish(payload);
    } catch (err) {
      setError(friendlyClientError(err, "We couldn't sign you in. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const submitMfa = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await authFetch('/api/career/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify(
          useRecovery
            ? { mfaToken, recoveryCode: mfaCode.trim() }
            : { mfaToken, code: mfaCode.trim() },
        ),
      });
      const payload = await readApiJson(response);
      if (!response.ok) throw new Error(payload.error || 'Verification failed');
      await completeAuthSession(payload as any);
      afterAuthNavigate(setLocation, payload, '/');
    } catch (err) {
      setError(friendlyClientError(err, 'That code was incorrect.'));
    } finally {
      setLoading(false);
    }
  };

  const requestMagic = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await authFetch('/api/career/auth/magic-link', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      const payload = await readApiJson(response);
      if (!response.ok) throw new Error(payload.error || 'Could not send code');
      setMagicChallenge(payload.challengeId);
      if (payload.verificationCode) setMagicCode(String(payload.verificationCode));
      setMode('magic');
    } catch (err) {
      setError(friendlyClientError(err));
    } finally {
      setLoading(false);
    }
  };

  const verifyMagic = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await authFetch('/api/career/auth/magic-verify', {
        method: 'POST',
        body: JSON.stringify({ challengeId: magicChallenge, code: magicCode.trim() }),
      });
      const payload = await readApiJson(response);
      if (!response.ok) throw new Error(payload.error || 'Verification failed');
      await finish(payload);
    } catch (err) {
      setError(friendlyClientError(err));
    } finally {
      setLoading(false);
    }
  };

  const passkeyLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const optRes = await authFetch('/api/career/auth/passkey/login/options', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() || undefined }),
      });
      const options = (await readApiJson(optRes)) as PublicKeyCredentialRequestOptionsJSON;
      if (!optRes.ok) throw new Error((options as any).error || 'Passkeys unavailable');
      const credential = await startAuthentication({ optionsJSON: options });
      const verifyRes = await authFetch('/api/career/auth/passkey/login/verify', {
        method: 'POST',
        body: JSON.stringify({ credential }),
      });
      const payload = await readApiJson(verifyRes);
      if (!verifyRes.ok) throw new Error(payload.error || 'Passkey failed');
      await finish(payload);
    } catch (err) {
      setError(friendlyClientError(err, "We couldn't complete passkey sign-in."));
    } finally {
      setLoading(false);
    }
  };

  if (mfaToken) {
    return (
      <AuthShell title="Enter your authentication code" description="Open your authenticator app for a 6-digit code.">
        <form onSubmit={submitMfa} className="space-y-5">
          {useRecovery ? (
            <label className="block">
              <span className="mb-2 block text-xs font-semibold">Recovery code</span>
              <input
                className="field-input"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="XXXX-XXXX-XXXX"
                required
              />
            </label>
          ) : (
            <OtpBoxes value={mfaCode} onChange={setMfaCode} />
          )}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Verifying…' : 'Verify'}
          </button>
          <div className="flex justify-between text-sm">
            <button type="button" className="text-primary font-semibold" onClick={() => setUseRecovery((v) => !v)}>
              {useRecovery ? 'Use authenticator code' : 'Use recovery code'}
            </button>
            <button
              type="button"
              className="text-muted-foreground"
              onClick={() => {
                setMfaToken('');
                setMfaCode('');
              }}
            >
              Back
            </button>
          </div>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Sign in"
      description="Welcome back to BonList."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-semibold text-primary">
            Create account
          </Link>
        </>
      }
    >
      <SocialAuthButtons returnTo="/" />
      {passkeysOn ? (
        <button
          type="button"
          onClick={() => void passkeyLogin()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold"
        >
          <Fingerprint size={16} /> Sign in with passkey
        </button>
      ) : null}
      <Divider />

      {mode === 'magic' && magicChallenge ? (
        <form onSubmit={verifyMagic} className="space-y-4">
          <p className="text-sm text-muted-foreground">Enter the code we emailed you.</p>
          <OtpBoxes value={magicCode} onChange={setMagicCode} />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <button type="submit" className="btn-primary w-full" disabled={loading || magicCode.length !== 6}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      ) : (
        <form onSubmit={submitLogin} className="space-y-4" data-testid="form-login">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold">Email</span>
            <input
              type="email"
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              data-testid="input-login-email"
            />
          </label>
          <PasswordField
            label="Password"
            value={password}
            onChange={setPassword}
            placeholder="Your password"
            testId="input-login-password"
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <button type="submit" className="btn-primary w-full" disabled={loading} data-testid="button-login-submit">
            {loading ? 'Signing in…' : 'Sign in'} <ArrowRight size={15} />
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Link href="/forgot-password" className="font-semibold text-primary">
              Forgot password?
            </Link>
            <button type="button" className="text-muted-foreground" onClick={(e) => void requestMagic(e as any)}>
              Sign in with email link
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setDevResetUrl('');
    try {
      const response = await authFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      const payload = await readApiJson(response);
      if (!response.ok) {
        if (response.status === 503) {
          throw new Error(
            payload.error ||
              'Password reset email is temporarily unavailable. Email delivery is not configured on the server.',
          );
        }
        throw new Error(payload.error || 'Request failed');
      }
      if (payload.resetUrl && payload.devOtp) {
        setDevResetUrl(String(payload.resetUrl));
      }
      setDone(true);
    } catch (err) {
      setError(friendlyClientError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      description="We'll email you a secure link if an account exists for that address."
      footer={
        <Link href="/login" className="font-semibold text-primary">
          Back to sign in
        </Link>
      }
    >
      {done ? (
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            If an account exists for that email, we sent password reset instructions. Check your inbox and spam
            folder.
          </p>
          {devResetUrl ? (
            <p>
              Dev mode (email not configured):{' '}
              <a href={devResetUrl} className="font-semibold text-primary break-all">
                Open reset link
              </a>
            </p>
          ) : null}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold">Email</span>
            <input
              type="email"
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [location, setLocation] = useLocation();
  const token = useMemo(() => new URLSearchParams(location.split('?')[1] || '').get('token') || '', [location]);
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await authFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      const payload = await readApiJson(response);
      if (!response.ok) throw new Error(payload.error || 'Reset failed');
      setDone(true);
      window.setTimeout(() => setLocation('/login'), 1600);
    } catch (err) {
      setError(friendlyClientError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Choose a new password" description="Use at least 8 characters.">
      {done ? (
        <p className="text-sm text-muted-foreground">Password updated. Taking you to sign in…</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <PasswordField
            label="New password"
            value={password}
            onChange={setPassword}
            placeholder="At least 8 characters"
            testId="input-reset-password"
            autoComplete="new-password"
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <button type="submit" className="btn-primary w-full" disabled={loading || password.length < 8 || !token}>
            {loading ? 'Saving…' : 'Update password'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export function AuthCallbackPage() {
  const [location, setLocation] = useLocation();
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1] || '');
    const code = params.get('code');
    const returnTo = params.get('returnTo') || '/';
    if (!code) {
      setError('Sign-in expired. Please try again.');
      return;
    }
    void (async () => {
      try {
        const response = await authFetch('/api/career/auth/exchange', {
          method: 'POST',
          body: JSON.stringify({ code }),
        });
        const payload = await readApiJson(response);
        if (!response.ok) throw new Error(payload.error || 'Sign-in failed');
        await completeAuthSession(payload as any);
        afterAuthNavigate(setLocation, payload, returnTo);
      } catch (err) {
        setError(friendlyClientError(err));
      }
    })();
  }, [location, setLocation]);

  return (
    <AuthShell title="Signing you in…">
      {error ? (
        <div className="space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <Link href="/login" className="btn-primary inline-flex">
            Back to sign in
          </Link>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Please wait a moment.</p>
      )}
    </AuthShell>
  );
}

export function SecuritySettingsPage() {
  const [, setLocation] = useLocation();
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [mfaSetup, setMfaSetup] = useState<{ qrDataUrl: string; manualKey: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const response = await authFetch('/api/auth/me');
    const payload = await readApiJson(response);
    if (!response.ok) {
      setLocation('/login');
      return;
    }
    setData(payload);
  };

  useEffect(() => {
    void load();
  }, []);

  const startMfa = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await authFetch('/api/career/auth/mfa/setup/start', { method: 'POST', body: '{}' });
      const payload = await readApiJson(response);
      if (!response.ok) throw new Error(payload.error);
      setMfaSetup({ qrDataUrl: payload.qrDataUrl, manualKey: payload.manualKey });
    } catch (err) {
      setError(friendlyClientError(err));
    } finally {
      setLoading(false);
    }
  };

  const confirmMfa = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await authFetch('/api/career/auth/mfa/setup/confirm', {
        method: 'POST',
        body: JSON.stringify({ code: mfaCode }),
      });
      const payload = await readApiJson(response);
      if (!response.ok) throw new Error(payload.error);
      setRecoveryCodes(payload.recoveryCodes);
      setMfaSetup(null);
      setMfaCode('');
      await load();
    } catch (err) {
      setError(friendlyClientError(err));
    } finally {
      setLoading(false);
    }
  };

  const addPasskey = async () => {
    setLoading(true);
    setError('');
    try {
      const optRes = await authFetch('/api/career/auth/passkey/register/options', {
        method: 'POST',
        body: '{}',
      });
      const options = (await readApiJson(optRes)) as PublicKeyCredentialCreationOptionsJSON;
      if (!optRes.ok) throw new Error((options as any).error);
      const credential = await startRegistration({ optionsJSON: options });
      const verifyRes = await authFetch('/api/career/auth/passkey/register/verify', {
        method: 'POST',
        body: JSON.stringify({ credential, nickname: 'This device' }),
      });
      const payload = await readApiJson(verifyRes);
      if (!verifyRes.ok) throw new Error(payload.error);
      setInfo('Passkey added.');
      await load();
    } catch (err) {
      setError(friendlyClientError(err, 'Could not add passkey on this device.'));
    } finally {
      setLoading(false);
    }
  };

  const logoutAll = async () => {
    await authFetch('/api/auth/logout', { method: 'POST', body: '{}' });
    setInfo('Signed out of other devices.');
    await load();
  };

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 text-sm text-muted-foreground">Loading security settings…</div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
      <p className="mt-2 text-sm text-muted-foreground">Manage how you sign in to BonList.</p>

      <div className="mt-8 space-y-4">
        <SecurityRow title="Email" value={data.email} badge={data.emailVerified ? 'Verified' : 'Unverified'} />
        <SecurityRow title="Google" value={data.googleConnected ? 'Connected' : 'Not connected'} badge={data.googleConnected ? 'Connected' : undefined} />
        <SecurityRow title="Password" value={data.hasPassword ? 'Set' : 'Not set'} />
        <SecurityRow
          title="Passkeys"
          value={`${(data.passkeys || []).length} saved`}
          action={
            <button type="button" className="text-sm font-semibold text-primary" onClick={() => void addPasskey()} disabled={loading}>
              + Add passkey
            </button>
          }
        />
        <SecurityRow
          title="Two-factor authentication"
          value={data.mfaEnabled ? 'Authenticator app enabled' : 'Not enabled'}
          badge={data.mfaEnabled ? 'Enabled' : undefined}
          action={
            !data.mfaEnabled ? (
              <button type="button" className="text-sm font-semibold text-primary" onClick={() => void startMfa()}>
                Add
              </button>
            ) : null
          }
        />
        {data.mfaEnabled ? (
          <SecurityRow title="Recovery codes" value={`${data.recoveryCodesRemaining || 0} remaining`} />
        ) : null}
        <SecurityRow
          title="Active sessions"
          value={`${(data.sessions || []).length} device(s)`}
          action={
            <button type="button" className="text-sm font-semibold text-primary" onClick={() => void logoutAll()}>
              Log out of all devices
            </button>
          }
        />
      </div>

      {mfaSetup ? (
        <div className="mt-8 rounded-2xl border border-border bg-white p-5">
          <h2 className="font-semibold">Set up authenticator app</h2>
          <p className="mt-1 text-sm text-muted-foreground">Scan the QR code, then enter the 6-digit code.</p>
          <img src={mfaSetup.qrDataUrl} alt="Authenticator QR code" className="mx-auto mt-4 h-48 w-48" />
          <p className="mt-3 break-all text-center text-xs text-muted-foreground">Manual key: {mfaSetup.manualKey}</p>
          <div className="mt-4">
            <OtpBoxes value={mfaCode} onChange={setMfaCode} />
          </div>
          <button type="button" className="btn-primary mt-4 w-full" disabled={loading || mfaCode.length !== 6} onClick={() => void confirmMfa()}>
            Verify and enable
          </button>
        </div>
      ) : null}

      {recoveryCodes ? (
        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-950">Save your recovery codes</h2>
          <p className="mt-1 text-sm text-amber-900/80">Store these somewhere safe. They will not be shown again.</p>
          <ul className="mt-4 grid gap-2 font-mono text-sm sm:grid-cols-2">
            {recoveryCodes.map((c) => (
              <li key={c} className="rounded-lg bg-white px-3 py-2">
                {c}
              </li>
            ))}
          </ul>
          <button type="button" className="btn-primary mt-4" onClick={() => setRecoveryCodes(null)}>
            I saved them
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      {info ? <p className="mt-4 text-sm text-primary">{info}</p> : null}
    </div>
  );
}

function SecurityRow({
  title,
  value,
  badge,
  action,
}: {
  title: string;
  value: string;
  badge?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-white px-4 py-3.5">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{value}</p>
      </div>
      <div className="flex items-center gap-3">
        {badge ? (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">✓ {badge}</span>
        ) : null}
        {action}
      </div>
    </div>
  );
}

export function AdminMfaSetupPage() {
  const [, setLocation] = useLocation();
  const [setup, setSetup] = useState<{ qrDataUrl: string; manualKey: string } | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await authFetch('/api/career/auth/admin/mfa/setup/start', { method: 'POST', body: '{}' });
      const payload = await readApiJson(response);
      if (!response.ok) {
        setError(payload.error || 'Could not start admin MFA setup.');
        return;
      }
      setSetup({ qrDataUrl: payload.qrDataUrl, manualKey: payload.manualKey });
    })();
  }, []);

  const confirm = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await authFetch('/api/career/auth/admin/mfa/setup/confirm', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      const payload = await readApiJson(response);
      if (!response.ok) throw new Error(payload.error);
      await completeAuthSession(payload as any);
      setRecovery(payload.recoveryCodes);
    } catch (err) {
      setError(friendlyClientError(err));
    } finally {
      setLoading(false);
    }
  };

  if (recovery) {
    return (
      <AuthShell title="Admin recovery codes">
        <p className="text-sm text-muted-foreground">Save these codes before opening the admin dashboard.</p>
        <ul className="mt-4 grid gap-2 font-mono text-sm">
          {recovery.map((c) => (
            <li key={c} className="rounded-lg bg-secondary px-3 py-2">
              {c}
            </li>
          ))}
        </ul>
        <button type="button" className="btn-primary mt-5 w-full" onClick={() => setLocation('/admin')}>
          Continue to admin
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Protect your admin account" description="Administrators must enable an authenticator app before accessing the dashboard.">
      {setup ? (
        <>
          <img src={setup.qrDataUrl} alt="Admin MFA QR" className="mx-auto h-48 w-48" />
          <p className="mt-3 break-all text-center text-xs text-muted-foreground">{setup.manualKey}</p>
          <div className="mt-4">
            <OtpBoxes value={code} onChange={setCode} />
          </div>
          {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
          <button type="button" className="btn-primary mt-4 w-full" disabled={loading || code.length !== 6} onClick={() => void confirm()}>
            Verify and continue
          </button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{error || 'Preparing setup…'}</p>
      )}
    </AuthShell>
  );
}

export function SecurityNudgeBanner({ onSecure, onLater }: { onSecure: () => void; onLater: () => void }) {
  return (
    <div className="border-b border-border bg-teal-50 px-5 py-3">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-950">Protect your BonList account</p>
          <p className="text-xs text-teal-900/80">Add a passkey or authenticator app to make your account more secure.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-primary" onClick={onSecure}>
            Set up now
          </button>
          <button type="button" className="rounded-xl px-3 py-2 text-sm font-semibold text-teal-900" onClick={onLater}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
