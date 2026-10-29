import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth';
import { authApi } from '@/api/modules/auth.api';
import { mapErrorCodeToMessage } from '@/api/adapters';
import {
  ShieldCheck,
  Mail,
  Lock,
  ArrowRight,
  RefreshCw,
  KeyRound,
  AlertCircle,
  HelpCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { toast } from 'sonner';

export const LoginPage: React.FC = () => {
  const { loginSuccess, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/scorecard';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  // Step state: 1 = credentials, 2 = 6-digit OTP challenge
  const [step, setStep] = useState<1 | 2>(1);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Challenge state
  const [challengeId, setChallengeId] = useState('');
  const [otp, setOtp] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  // Loading & error state
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);

  // Timer countdown effect for active OTP
  useEffect(() => {
    if (step !== 2 || !expiresAt) return;

    const expiryTime = new Date(expiresAt).getTime();

    const updateTimer = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expiryTime - now) / 1000));
      setSecondsRemaining(diff);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [step, expiresAt]);

  // Step A: Submit credentials to receive MFA OTP challenge
  const handleSubmitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setErrorRequestId(null);
    setIsLoading(true);

    try {
      const data = await authApi.login(email.trim(), password);
      setChallengeId(data.challengeId);
      setMaskedEmail(data.maskedEmail);
      setExpiresAt(data.expiresAt);
      if (data.devOtp) {
        setOtp(data.devOtp);
      }
      setStep(2);
      toast.info(`Verification code dispatched to ${data.maskedEmail}`);
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: {
          data?: {
            error?: { code?: string; message?: string; details?: { attemptsRemaining?: number } };
            requestId?: string;
          };
        };
      };
      const code = axiosErr.response?.data?.error?.code;
      const message = axiosErr.response?.data?.error?.message;
      const reqId = axiosErr.response?.data?.requestId || null;

      const friendlyMsg = mapErrorCodeToMessage(code, message);
      setErrorMessage(friendlyMsg);
      setErrorRequestId(reqId);
      toast.error(friendlyMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Step B: Submit 6-digit OTP code to complete session establishment
  const handleSubmitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setErrorMessage('Please enter all 6 digits of your verification code.');
      return;
    }

    setErrorMessage(null);
    setErrorRequestId(null);
    setIsLoading(true);

    try {
      const data = await authApi.verifyLoginOtp(challengeId, otp.trim());
      loginSuccess(data.user, data.accessToken, data.permissions);
      toast.success(`Welcome back, ${data.user.name}`);

      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/scorecard';
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: {
          data?: {
            error?: { code?: string; message?: string; details?: { attemptsRemaining?: number } };
            requestId?: string;
          };
        };
      };
      const code = axiosErr.response?.data?.error?.code;
      const message = axiosErr.response?.data?.error?.message;
      const reqId = axiosErr.response?.data?.requestId || null;
      const rem = axiosErr.response?.data?.error?.details?.attemptsRemaining ?? null;

      setAttemptsRemaining(rem);
      const friendlyMsg = mapErrorCodeToMessage(code, message);
      setErrorMessage(friendlyMsg);
      setErrorRequestId(reqId);
      toast.error(friendlyMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Resend OTP code
  const handleResendOtp = async () => {
    if (!challengeId) return;
    setIsResending(true);
    setErrorMessage(null);

    try {
      const data = await authApi.resendLoginOtp(challengeId);
      setChallengeId(data.challengeId);
      setExpiresAt(data.expiresAt);
      setAttemptsRemaining(null);
      if (data.devOtp) {
        setOtp(data.devOtp);
      } else {
        setOtp('');
      }
      toast.success('A fresh verification code has been dispatched.');
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: {
          data?: { error?: { code?: string; message?: string }; requestId?: string };
        };
      };
      const code = axiosErr.response?.data?.error?.code;
      const message = axiosErr.response?.data?.error?.message;
      const friendlyMsg = mapErrorCodeToMessage(code, message);
      setErrorMessage(friendlyMsg);
      toast.error(friendlyMsg);
    } finally {
      setIsResending(false);
    }
  };

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  const setDemoAccount = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('DemoSeed2026!Secure');
    setStep(1);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 selection:bg-primary/20">
      <div className="w-full max-w-md space-y-6">
        {/* Brand identity */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/25 mb-1">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            SeatSeal
          </h1>
          <p className="text-sm font-semibold text-primary tracking-wide">
            Every Seat Is Seal
          </p>
          <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
            AICTE / Higher Education Seat Matrix, Cryptographic Audit Trail & Institutional Reliability Scorecard
          </p>
        </div>

        {/* Main Login Card */}
        <Card className="border-border/80 shadow-elevation">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-semibold text-center">
              {step === 1 ? 'Official Platform Sign In' : 'Two-Factor Authentication'}
            </CardTitle>
            <CardDescription className="text-center text-xs">
              {step === 1
                ? 'Enter your institutional or authority credentials to continue.'
                : `Enter the 6-digit code dispatched to ${maskedEmail || 'your email'}.`}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* Error banner */}
            {errorMessage && (
              <div className="mb-4 p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-start gap-2.5 animate-in fade-in-50">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <p className="font-medium">{errorMessage}</p>
                  {attemptsRemaining !== null && (
                    <p className="text-[11px] font-semibold text-danger/80">
                      Attempts remaining: {attemptsRemaining}
                    </p>
                  )}
                  {errorRequestId && (
                    <p className="text-[10px] text-muted-foreground font-mono">
                      Reference: {errorRequestId}
                    </p>
                  )}
                </div>
              </div>
            )}

            {step === 1 ? (
              /* Step 1: Credentials Form */
              <form onSubmit={handleSubmitCredentials} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    Official Email Address
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.test"
                    icon={<Mail className="w-4 h-4" />}
                    required
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">Password</label>
                  </div>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    icon={<Lock className="w-4 h-4" />}
                    required
                    autoComplete="current-password"
                  />
                </div>

                <Button type="submit" className="w-full mt-2" isLoading={isLoading}>
                  <span>Continue to Verification</span>
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </form>
            ) : (
              /* Step 2: 6-digit OTP Form */
              <form onSubmit={handleSubmitOtp} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">
                      6-Digit Security Code
                    </label>
                    <span
                      className={`text-xs font-mono font-medium flex items-center gap-1 ${
                        secondsRemaining < 60 ? 'text-danger font-bold animate-pulse' : 'text-muted-foreground'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      {formatTimer(secondsRemaining)}
                    </span>
                  </div>

                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    icon={<KeyRound className="w-4 h-4" />}
                    className="text-center font-mono text-lg tracking-widest font-semibold"
                    autoFocus
                    required
                  />

                  {secondsRemaining === 0 && (
                    <p className="text-xs text-danger font-medium text-center">
                      Code expired. Please request a new verification code.
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full mt-2"
                  isLoading={isLoading}
                  disabled={otp.length !== 6 || secondsRemaining === 0}
                >
                  Verify & Sign In
                </Button>

                <div className="flex items-center justify-between pt-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setOtp('');
                      setErrorMessage(null);
                    }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ← Back to credentials
                  </button>

                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={isResending}
                    className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isResending ? 'animate-spin' : ''}`} />
                    Resend Code
                  </button>
                </div>
              </form>
            )}

            {/* Development OTP Terminal Hint */}
            <div className="mt-5 pt-4 border-t border-border/60 text-center">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/60 text-muted-foreground text-[11px]">
                <HelpCircle className="w-3 h-3 shrink-0 text-primary" />
                <span>Dev Hint: In local dev, OTP is printed in the backend terminal.</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Demo Accounts Quick-Fill Picker */}
        <div className="bg-card/70 border border-border/70 rounded-xl p-3 shadow-subtle text-xs space-y-2">
          <div className="flex items-center justify-between font-semibold text-foreground">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              Demo Roles Quick-Fill
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">Password: DemoSeed2026!Secure</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => setDemoAccount('platform-admin@example.test')}
              className="p-1.5 rounded-lg border border-border/60 bg-muted/40 hover:bg-muted text-left truncate transition-colors"
            >
              <span className="font-semibold block truncate">Platform Admin</span>
              <span className="text-[10px] text-muted-foreground truncate block">platform-admin@example.test</span>
            </button>
            <button
              type="button"
              onClick={() => setDemoAccount('authority-admin@example.test')}
              className="p-1.5 rounded-lg border border-border/60 bg-muted/40 hover:bg-muted text-left truncate transition-colors"
            >
              <span className="font-semibold block truncate">Authority Admin</span>
              <span className="text-[10px] text-muted-foreground truncate block">authority-admin@example.test</span>
            </button>
            <button
              type="button"
              onClick={() => setDemoAccount('authority-officer@example.test')}
              className="p-1.5 rounded-lg border border-border/60 bg-muted/40 hover:bg-muted text-left truncate transition-colors"
            >
              <span className="font-semibold block truncate">Authority Officer</span>
              <span className="text-[10px] text-muted-foreground truncate block">authority-officer@example.test</span>
            </button>
            <button
              type="button"
              onClick={() => setDemoAccount('auditor@example.test')}
              className="p-1.5 rounded-lg border border-border/60 bg-muted/40 hover:bg-muted text-left truncate transition-colors"
            >
              <span className="font-semibold block truncate">Auditor (Read-Only)</span>
              <span className="text-[10px] text-muted-foreground truncate block">auditor@example.test</span>
            </button>
            <button
              type="button"
              onClick={() => setDemoAccount('inst-admin-01@example.test')}
              className="p-1.5 rounded-lg border border-border/60 bg-muted/40 hover:bg-muted text-left truncate transition-colors"
            >
              <span className="font-semibold block truncate">Apex Inst Admin</span>
              <span className="text-[10px] text-muted-foreground truncate block">inst-admin-01@example.test</span>
            </button>
            <button
              type="button"
              onClick={() => setDemoAccount('inst-operator-01@example.test')}
              className="p-1.5 rounded-lg border border-border/60 bg-muted/40 hover:bg-muted text-left truncate transition-colors"
            >
              <span className="font-semibold block truncate">Apex Inst Operator</span>
              <span className="text-[10px] text-muted-foreground truncate block">inst-operator-01@example.test</span>
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          SIH 2026 PS3 — Ministry of Education / AICTE Approved System
        </p>
      </div>
    </div>
  );
};
