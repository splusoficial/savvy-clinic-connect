import { Home, Bell, Settings } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

export const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { icon: Home, label: 'Home', path: '/dashboard' },
    { icon: Bell, label: 'Notificações', path: '/notifications' },
    { icon: Settings, label: 'Ajustes', path: '/settings' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-3 min-h-16 pt-2.5 pb-10">
        {navItems.map(({ icon: Icon, label, path }) => {
          const isActive = location.pathname === path;

          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`w-full h-full flex flex-col items-center justify-center gap-1.5 transition-colors ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:bg-muted/50'
              }`}
              aria-pressed={isActive}
            >
              <Icon size={20} />
              <span className="text-xs">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};