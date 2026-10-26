import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileQuestion, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-border/80 text-center p-6 shadow-elevation">
        <CardContent className="space-y-4 pt-4">
          <div className="w-14 h-14 rounded-2xl bg-muted text-muted-foreground mx-auto flex items-center justify-center">
            <FileQuestion className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-foreground">Page Not Found (404)</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The requested path does not exist on the platform. Please check the address or return to the main dashboard.
            </p>
          </div>

          <div className="pt-2">
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
