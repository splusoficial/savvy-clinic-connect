
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import Dashboard from "./pages/Dashboard";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import NotificationSettings from "./pages/NotificationSettings";
import NotFound from "./pages/NotFound";
import ApiGenerateLink from "./pages/ApiGenerateLink";
import Setup from "./pages/Setup";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

const UnauthScreen = () => (
  <div className="min-h-screen bg-background flex items-center justify-center p-6">
    <main className="max-w-md text-center space-y-4">
      <h1 className="text-2xl font-semibold">Acesso indisponível</h1>
      <p className="text-muted-foreground">
        Exclua este app e reinstale através do sistema principal no seu navegador.
      </p>
      <Button asChild>
        <a href="https://web.secretariaplus.com.br" target="_blank" rel="noopener noreferrer">Ir para o sistema</a>
      </Button>
    </main>
  </div>
);

const LoadingScreen = () => (
  <div className="min-h-screen bg-background flex items-center justify-center p-6">
    <main className="max-w-md text-center space-y-4">
      <div className="flex items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando…</span>
      </div>
    </main>
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, authInitialized } = useAuth();
  const location = useLocation();
  if (!authInitialized) return <LoadingScreen />;
  if (isAuthenticated) return <>{children}</>;
  return <Navigate to={`/setup${location.search}`} replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <Sonner />
      <BrowserRouter>
          <Routes>
            {/* Página pública para preparar instalação e ativar login pós-instalação */}
            <Route path="/setup" element={<Setup />} />

            <Route path="/api/generate-link" element={<ApiGenerateLink />} />
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/notifications" 
              element={
                <ProtectedRoute>
                  <Notifications />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/settings" 
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/notification-settings" 
              element={
                <ProtectedRoute>
                  <NotificationSettings />
                </ProtectedRoute>
              } 
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
);

export default App;
