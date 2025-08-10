import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const NotificationSettings = () => {
  const navigate = useNavigate();
  
  const [notifications, setNotifications] = useState({
    emergency: true,
    appointment: true,
    complaint: true,
    refund: true,
    nonExistentProcedure: false,
    priceNegotiation: true,
    offHours: true,
    aggression: true,
    vip: true,
    supplier: false,
  });

  const notificationTypes = [
    {
      key: 'emergency',
      title: 'Emergências Médicas',
      description: 'Quando um paciente relata emergência ou intercorrência médica'
    },
    {
      key: 'appointment',
      title: 'Consultas Agendadas',
      description: 'Quando uma nova consulta é agendada com sucesso'
    },
    {
      key: 'complaint',
      title: 'Reclamações e Críticas',
      description: 'Quando pacientes demonstram insatisfação ou fazem críticas'
    },
    {
      key: 'refund',
      title: 'Solicitações de Reembolso',
      description: 'Quando pacientes solicitam devolução do dinheiro'
    },
    {
      key: 'nonExistentProcedure',
      title: 'Procedimentos Inexistentes',
      description: 'Quando pacientes perguntam sobre serviços que não oferecemos'
    },
    {
      key: 'priceNegotiation',
      title: 'Tentativas de Barganha',
      description: 'Quando pacientes tentam negociar preços'
    },
    {
      key: 'offHours',
      title: 'Agendamentos Fora do Horário',
      description: 'Tentativas de marcar consultas fora do horário comercial'
    },
    {
      key: 'aggression',
      title: 'Comportamento Agressivo',
      description: 'Quando detectamos tom ofensivo ou agressivo'
    },
    {
      key: 'vip',
      title: 'Leads VIP',
      description: 'Quando identificamos pacientes importantes ou influentes'
    },
    {
      key: 'supplier',
      title: 'Mensagens de Fornecedores',
      description: 'Quando recebemos ofertas comerciais ou de fornecedores'
    }
  ];

  const handleToggle = (key: string) => {
    setNotifications(prev => ({
      ...prev,
      [key]: !prev[key as keyof typeof prev]
    }));
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      
      <div className="p-4">
        <div className="flex items-center gap-3 mb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/settings')}
            className="p-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Ajustes de Notificação</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Todas as notificações de eventos da IA estão ligadas - em breve, você poderá customizar quais deseja receber.
        </p>
        

        <div className="relative max-h-[50vh] overflow-hidden">
          <div className="space-y-3 opacity-40 pointer-events-none select-none">
            {notificationTypes.map((type) => (
              <Card key={type.key}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 pr-4">
                      <h3 className="font-medium text-primary">
                        {type.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {type.description}
                      </p>
                    </div>
                    <Switch
                      checked={notifications[type.key as keyof typeof notifications]}
                      onCheckedChange={() => handleToggle(type.key)}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-background/80 to-background" aria-hidden="true" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full px-4 py-2 bg-background/90 backdrop-blur border border-border text-muted-foreground">
              em breve
            </div>
          </div>
        </div>

      </div>

      <BottomNav />
    </div>
  );
};

export default NotificationSettings;