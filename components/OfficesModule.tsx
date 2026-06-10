import React from 'react';
import OfficesDashboard from './OfficesDashboard';
import OfficesCRM from './OfficesCRM';
import OfficesEspecificador from './OfficesEspecificador';
import OfficesTimeTracking from './OfficesTimeTracking';

interface OfficesModuleProps {
  activeView: string;
  onChangeView: (view: string) => void;
  userId: string;
}

export const OfficesModule: React.FC<OfficesModuleProps> = ({
  activeView,
  onChangeView,
  userId
}) => {
  // Mapeamento local de abas para simular o app mobile
  const [activeTab, setActiveTab] = React.useState<'DASHBOARD' | 'CRM' | 'ESPECIFICADOR' | 'TIMESHEET'>('DASHBOARD');

  // Sincroniza a aba baseando-se no activeView que vem do roteador principal
  React.useEffect(() => {
    if (activeView === 'offices-crm') setActiveTab('CRM');
    else if (activeView === 'offices-especificador') setActiveTab('ESPECIFICADOR');
    else if (activeView === 'offices-timesheet') setActiveTab('TIMESHEET');
    else setActiveTab('DASHBOARD');
  }, [activeView]);

  const handleTabChange = (tab: 'DASHBOARD' | 'CRM' | 'ESPECIFICADOR' | 'TIMESHEET') => {
    setActiveTab(tab);
    if (tab === 'CRM') onChangeView('offices-crm');
    else if (tab === 'ESPECIFICADOR') onChangeView('offices-especificador');
    else if (tab === 'TIMESHEET') onChangeView('offices-timesheet');
    else onChangeView('offices-dashboard');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'CRM':
        return <OfficesCRM userId={userId} />;
      case 'ESPECIFICADOR':
        return <OfficesEspecificador userId={userId} />;
      case 'TIMESHEET':
        return <OfficesTimeTracking userId={userId} />;
      case 'DASHBOARD':
      default:
        return (
          <OfficesDashboard
            userId={userId}
            onNavigate={(tab) => handleTabChange(tab)}
          />
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 min-h-[calc(100vh-4rem)] relative pb-16">
      {/* Conteúdo Principal */}
      <div className="flex-1 overflow-y-auto">
        {renderContent()}
      </div>

      {/* Bottom Bar para Navegação Móvel (Stripe/Glassmorphic Style) */}
      <nav className="fixed bottom-0 left-0 right-0 md:absolute md:bottom-0 bg-slate-950/80 backdrop-blur-md border-t border-slate-800/80 px-6 py-2.5 flex justify-between items-center z-40 max-w-full">
        {/* Dashboard Link */}
        <button
          onClick={() => handleTabChange('DASHBOARD')}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === 'DASHBOARD' ? 'text-orange-500 scale-105' : 'text-slate-400 hover:text-white'
          }`}
        >
          <span className="text-lg">📊</span>
          <span className="text-[9px] font-black uppercase tracking-wider">Painel</span>
        </button>

        {/* CRM Link */}
        <button
          onClick={() => handleTabChange('CRM')}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === 'CRM' ? 'text-orange-500 scale-105' : 'text-slate-400 hover:text-white'
          }`}
        >
          <span className="text-lg">🤝</span>
          <span className="text-[9px] font-black uppercase tracking-wider">CRM</span>
        </button>

        {/* Especificador Link */}
        <button
          onClick={() => handleTabChange('ESPECIFICADOR')}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === 'ESPECIFICADOR' ? 'text-orange-500 scale-105' : 'text-slate-400 hover:text-white'
          }`}
        >
          <span className="text-lg">🎨</span>
          <span className="text-[9px] font-black uppercase tracking-wider">Design</span>
        </button>

        {/* Timesheet Link */}
        <button
          onClick={() => handleTabChange('TIMESHEET')}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === 'TIMESHEET' ? 'text-orange-500 scale-105' : 'text-slate-400 hover:text-white'
          }`}
        >
          <span className="text-lg">⏱️</span>
          <span className="text-[9px] font-black uppercase tracking-wider">Horas</span>
        </button>
      </nav>
    </div>
  );
};

export default OfficesModule;
