import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="max-w-md w-full border-border/80 text-center p-6 shadow-elevation">
            <CardContent className="space-y-4 pt-4">
              <div className="w-14 h-14 rounded-2xl bg-danger/10 text-danger mx-auto flex items-center justify-center">
                <AlertTriangle className="w-8 h-8" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  A client-side application error occurred. The cryptographic state has been secured.
                </p>
              </div>

              {this.state.error && (
                <div className="p-3 rounded-lg bg-muted text-[11px] font-mono text-muted-foreground text-left max-h-32 overflow-auto">
                  {this.state.error.message}
                </div>
              )}

              <div className="pt-2">
                <Button size="sm" onClick={() => window.location.reload()}>
                  <RefreshCcw className="w-4 h-4 mr-1.5" />
                  Reload Application
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
