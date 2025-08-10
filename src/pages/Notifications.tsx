import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { Card, CardContent } from '@/components/ui/card';

import { 
  AlertTriangle, 
  MessageSquare, 
  DollarSign, 
  Package,
  UserCheck,
  CalendarCheck
} from 'lucide-react';

const Notifications = () => {
  const notifications = [
    {
      id: 1,
      type: 'emergency',
      icon: AlertTriangle,
      title: 'Emergência Médica',
      message: 'URGENTE: Emergência médica relatada pelo paciente. Clique para abrir a conversa.',
      time: 'agora',
      barClass: 'bg-destructive/30'
    },
    {
      id: 2,
      type: 'appointment',
      icon: CalendarCheck,
      title: 'Consulta Agendada',
      message: 'Nova consulta agendada com sucesso para o paciente.',
      time: '1h atrás',
      barClass: 'bg-success/30'
    },
    {
      id: 3,
      type: 'complaint',
      icon: MessageSquare,
      title: 'Reclamação/Crítica',
      message: 'Paciente demonstrou insatisfação com o atendimento. Atenção necessária.',
      time: '2h atrás',
      barClass: 'bg-accent/30'
    },
    {
      id: 4,
      type: 'vip',
      icon: UserCheck,
      title: 'Lead de Alta Prioridade',
      message: 'Lead importante detectado. Dar atenção especial ao atendimento.',
      time: 'hoje',
      barClass: 'bg-primary/30'
    }
  ];


  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-1">Historico de Notificações</h1>
        <p className="text-sm text-muted-foreground mb-6">Em breve você poderá ver todo o histórico de notificações recebidas.</p>
        
        <div className="relative overflow-hidden">
          <div className="space-y-4 opacity-40 pointer-events-none select-none overflow-hidden">
            {notifications.map((notification) => {
              const IconComponent = notification.icon;
              
              return (
                <Card 
                  key={notification.id}
                  className={`relative cursor-pointer hover:shadow-md transition-shadow`}
                >
                  <div className={`absolute left-0 top-0 h-full w-1 ${notification.barClass}`} aria-hidden="true" />
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <IconComponent className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-foreground mb-1">
                          {notification.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-2">
                          {notification.message}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {notification.time}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-background/80 to-background" aria-hidden="true" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full px-4 py-2 bg-background/90 backdrop-blur border border-border text-muted-foreground">
              em breve
            </div>
          </div>
        </div>

        
        {notifications.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-muted-foreground">Nenhuma notificação</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Todas as notificações aparecerão aqui
            </p>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default Notifications;