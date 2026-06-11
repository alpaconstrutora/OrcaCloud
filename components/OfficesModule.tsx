import React from 'react';
import OfficesDashboard from './OfficesDashboard';
import OfficesCRM from './OfficesCRM';
import OfficesEspecificador from './OfficesEspecificador';
import OfficesTimeTracking from './OfficesTimeTracking';
import { LayoutDashboard, Users, Palette, Clock } from 'lucide-react';

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
    <div className="flex flex-col h-full bg-[#121315] text-slate-100 min-h-[calc(100vh-4rem)] relative pb-20">
      {/* Conteúdo Principal */}
      <div className="flex-1 overflow-y-auto">
        {renderContent()}
      </div>

      {/* Bottom Bar para Navegação Móvel (Notion/Premium Glassmorphic Style) */}
      <nav className="fixed bottom-0 left-0 right-0 md:absolute md:bottom-0 bg-[#17181A]/90 backdrop-blur-lg border-t border-white/5 px-6 py-3 flex justify-between items-center z-40 max-w-full">
        {/* Dashboard Link */}
        <button
          onClick={() => handleTabChange('DASHBOARD')}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === 'DASHBOARD' ? 'text-[#D47A55] scale-105' : 'text-slate-500 hover:text-slate-350'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[8px] font-black uppercase tracking-widest">Painel</span>
        </button>

        {/* CRM Link */}
        <button
          onClick={() => handleTabChange('CRM')}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === 'CRM' ? 'text-[#D47A55] scale-105' : 'text-slate-500 hover:text-slate-350'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[8px] font-black uppercase tracking-widest">Clientes</span>
        </button>

        {/* Especificador Link */}
        <button
          onClick={() => handleTabChange('ESPECIFICADOR')}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === 'ESPECIFICADOR' ? 'text-[#D47A55] scale-105' : 'text-slate-500 hover:text-slate-350'
          }`}
        >
          <Palette className="w-5 h-5" />
          <span className="text-[8px] font-black uppercase tracking-widest">Projetos</span>
        </button>

        {/* Timesheet Link */}
        <button
          onClick={() => handleTabChange('TIMESHEET')}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === 'TIMESHEET' ? 'text-[#D47A55] scale-105' : 'text-slate-500 hover:text-slate-350'
          }`}
        >
          <Clock className="w-5 h-5" />
          <span className="text-[8px] font-black uppercase tracking-widest">Horas</span>
        </button>
      </nav>
    </div>
  );
};

export default OfficesModule;
