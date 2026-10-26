import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';

export const ForbiddenPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-border/80 text-center p-6 shadow-elevation">
        <CardContent className="space-y-4 pt-4">
          <div className="w-14 h-14 rounded-2xl bg-warning/15 text-warning mx-auto flex items-center justify-center">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-foreground">Access Scope Restricted (403)</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your active role or institutional scope does not permit accessing this action or resource.
              Institutional users may only inspect records within their assigned institution.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-muted/60 text-[11px] text-muted-foreground text-left">
            <span className="font-semibold block text-foreground mb-0.5">Recommended Actions:</span>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Use the Institutional Scope Switcher in the top bar to switch institutions.</li>
              <li>Verify that your account has been granted the required operational permission.</li>
              <li>Contact your Regulatory Authority Administrator if you require broader oversight.</li>
            </ul>
          </div>

          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Go Back
            </Button>
            <Button size="sm" onClick={() => navigate('/scorecard')}>
              <Home className="w-4 h-4 mr-1.5" />
              Return to Scorecard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
