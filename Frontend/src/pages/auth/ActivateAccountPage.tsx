import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { authApi } from '@/api/modules/auth.api';
import { mapErrorCodeToMessage } from '@/api/adapters';
import { ShieldCheck, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { toast } from 'sonner';

export const ActivateAccountPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setErrorMessage('Missing account activation token. Please verify the URL link from your invitation email.');
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await authApi.activateAccount({ token, password });
      setIsSuccess(true);
      toast.success('Your account has been activated successfully!');
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { error?: { code?: string; message?: string } } };
      };
      const code = axiosErr.response?.data?.error?.code;
      const message = axiosErr.response?.data?.error?.message;
      const friendlyMsg = mapErrorCodeToMessage(code, message);
      setErrorMessage(friendlyMsg);
      toast.error(friendlyMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-foreground">
            Account Activation
          </h1>
          <p className="text-xs text-muted-foreground">
            Configure your password to initialize your institutional or authority access.
          </p>
        </div>

        <Card className="border-border/80 shadow-elevation">
          <CardHeader>
            <CardTitle className="text-base text-center">
              {isSuccess ? 'Activation Complete' : 'Set Account Password'}
            </CardTitle>
            <CardDescription className="text-center text-xs">
              {isSuccess
                ? 'Your credentials have been securely stored. You may now sign in.'
                : 'Choose a strong password with at least 8 characters.'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {isSuccess ? (
              <div className="text-center space-y-4 py-3">
                <div className="w-12 h-12 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Your credentials have been verified and your cryptographic account record is now active.
                </p>
                <Button onClick={() => navigate('/login')} className="w-full">
                  Proceed to Sign In
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {errorMessage && (
                  <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">New Password</label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    icon={<Lock className="w-4 h-4" />}
                    required
                    minLength={8}
                    disabled={!token}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Confirm Password</label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    icon={<Lock className="w-4 h-4" />}
                    required
                    minLength={8}
                    disabled={!token}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full mt-2"
                  isLoading={isLoading}
                  disabled={!token || password.length < 8}
                >
                  Activate Account
                </Button>

                <div className="text-center pt-2">
                  <Link to="/login" className="text-xs text-primary hover:underline font-medium">
                    Already activated? Sign In
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
