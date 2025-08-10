import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Bell, 
  ExternalLink,
  ChevronRight
} from 'lucide-react';

const Settings = () => {
  const navigate = useNavigate();

  const settingsOptions = [
    {
      icon: Bell,
      title: 'Ajustes de Notificação',
      description: 'Gerencie quais notificações você deseja receber',
      action: () => navigate('/notification-settings'),
      showArrow: true
    },
    {
      icon: ExternalLink,
      title: 'Acessar Sistema',
      description: 'Acesse o sistema completo para editar sua IA, procedimentos, pausar conversas e muito mais.',
      action: () => { window.open('https://web.secretariaplus.com.br', '_blank', 'noopener,noreferrer'); },
      showArrow: false
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-6">Ajustes</h1>
        
        <div className="space-y-3">
          {settingsOptions.map((option, index) => {
            const IconComponent = option.icon;
            const isNotification = option.title === 'Ajustes de Notificação';
            
            return (
              <Card key={index} className="overflow-hidden">
                <CardContent className="p-0">
                  <button
                    onClick={option.action}
                    className="w-full p-4 text-left hover:bg-muted/50 transition-colors flex items-center gap-4"
                  >
                    <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                      <IconComponent className={"h-5 w-5 text-primary"} />
                    </div>
                    <div className="flex-1">
                      <h3 className={"font-medium text-primary flex items-center gap-2"}>
                        {option.title}
                        {isNotification && (
                          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                            em breve
                          </span>
                        )}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {isNotification
                          ? 'Todas as notificações de eventos da IA estão ligadas - em breve, você poderá customizar quais deseja receber.'
                          : option.description}
                      </p>
                    </div>
                    {option.showArrow && (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Settings;