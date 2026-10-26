import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/auth/AuthContext';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { ErrorBoundary } from '@/pages/errors/ErrorBoundary';
import { Toaster } from 'sonner';
import { router } from '@/routes';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: false,
      retry: (failureCount, error: unknown) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        // Do not retry 401, 403, or 404 client errors
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 1;
      },
    },
  },
});

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider delayDuration={300}>
            <RouterProvider router={router} />
            <Toaster
              position="top-right"
              richColors
              closeButton
              theme="system"
              toastOptions={{
                duration: 4000,
                className: 'text-xs font-medium',
              }}
            />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
