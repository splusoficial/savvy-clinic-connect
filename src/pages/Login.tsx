import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simula delay de autenticação
    await new Promise(resolve => setTimeout(resolve, 1000));

    const success = login(email, password);
    
    if (success) {
      navigate('/dashboard');
    } else {
      toast({
        title: "Erro no login",
        description: "Email ou senha inválidos. Tente: admin@clinica.com / 123456",
        variant: "destructive",
      });
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <div className="font-bold text-2xl">SECRETÁRIA</div>
            <div className="bg-accent px-3 py-1 text-sm font-medium text-primary italic rounded">
              PLUS
            </div>
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Entrar</h1>
            <p className="text-muted-foreground">Acesse com sua conta</p>
          </div>
        </div>

        {/* Form */}
        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="acesso@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-muted/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-muted/50"
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-accent hover:bg-accent/90 text-primary font-medium"
            >
              {isLoading ? (
                "Entrando..."
              ) : (
                <>
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Entrar
                </>
              )}
            </Button>
          </form>
        </Card>

        {/* Credenciais de teste */}
        <div className="text-center text-xs text-muted-foreground bg-muted/50 p-3 rounded">
          <p>Credenciais de teste:</p>
          <p>admin@clinica.com / 123456</p>
        </div>
      </div>
    </div>
  );
};

export default Login;