import logo from '@/assets/logo.svg';
import { useAuth } from '@/contexts/AuthContext';

export const Header = () => {
  const { clinicName } = useAuth();
  const displayName = (clinicName || 'Usuário').split(' ').slice(0, 2).join(' ');

  return (
    <header className="bg-background border-b border-border p-4 flex items-center justify-between">
      <img src={logo} alt="SecretáriaPlus — Central de notificações" className="h-7 md:h-8" />
      <span className="text-xs md:text-sm text-muted-foreground">{displayName}</span>
    </header>
  );
};