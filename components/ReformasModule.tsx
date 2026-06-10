import React from 'react';
import { LayoutDashboard, BookOpen, Calendar } from 'lucide-react';
import ReformasDashboard from './ReformasDashboard';
import ReformasDiarios from './ReformasDiarios';
import ReformasCronograma from './ReformasCronograma';

interface ReformasModuleProps {
  activeView: string;
  onChangeView: (view: string) => void;
  userId: string;
}

const ReformasModule: React.FC<ReformasModuleProps> = ({
  activeView,
  onChangeView,
  userId
}) => {
  // Estado local para a aba ativa da vertical Reformas
  const [activeTab, setActiveTab] = React.useState<'DASHBOARD' | 'DIARIOS' | 'CRONOGRAMA'>('DASHBOARD');

  // Sincronizar activeView do roteador geral com o activeTab interno
  React.useEffect(() => {
    if (activeView === 'reformas-dashboard') setActiveTab('DASHBOARD');
    else if (activeView === 'reformas-diarios') setActiveTab('DIARIOS');
    else if (activeView === 'reformas-cronograma') setActiveTab('CRONOGRAMA');
  }, [activeView]);

  const handleTabChange = (tab: 'DASHBOARD' | 'DIARIOS' | 'CRONOGRAMA') => {
    setActiveTab(tab);
    if (tab === 'DASHBOARD') onChangeView('reformas-dashboard');
    else if (tab === 'DIARIOS') onChangeView('reformas-diarios');
    else if (tab === 'CRONOGRAMA') onChangeView('reformas-cronograma');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'DASHBOARD':
        return <ReformasDashboard userId={userId} onNavigate={handleTabChange} />;
      case 'DIARIOS':
        return <ReformasDiarios userId={userId} />;
      case 'CRONOGRAMA':
        return <ReformasCronograma userId={userId} />;
      default:
        return <ReformasDashboard userId={userId} onNavigate={handleTabChange} />;
    }
  };

  return (
    <div className="flex justify-center bg-[#070913] min-h-screen text-slate-100 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[350px] h-[350px] bg-orange-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[350px] h-[350px] bg-amber-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Container Mobile-First Simulado */}
      <div className="w-full max-w-md bg-[#0A0D1A] border-x border-white/5 flex flex-col min-h-screen relative shadow-2xl">
        {/* Conteúdo Principal */}
        <div className="flex-1 overflow-y-auto pb-24 scrollbar-hide">
          {renderContent()}
        </div>

        {/* Barra de Navegação Inferior (Bottom Bar) de Luxo */}
        <nav className="absolute bottom-0 left-0 right-0 bg-[#0A0D1A]/90 backdrop-blur-md border-t border-white/5 py-3 px-6 flex justify-around items-center z-40">
          <button
            onClick={() => handleTabChange('DASHBOARD')}
            className={`flex flex-col items-center gap-1 transition-all ${
              activeTab === 'DASHBOARD' ? 'text-orange-500 scale-105' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-wider">Painel</span>
          </button>

          <button
            onClick={() => handleTabChange('DIARIOS')}
            className={`flex flex-col items-center gap-1 transition-all ${
              activeTab === 'DIARIOS' ? 'text-orange-500 scale-105' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <BookOpen className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-wider">Diário</span>
          </button>

          <button
            onClick={() => handleTabChange('CRONOGRAMA')}
            className={`flex flex-col items-center gap-1 transition-all ${
              activeTab === 'CRONOGRAMA' ? 'text-orange-500 scale-105' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Calendar className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-wider">Etapas</span>
          </button>
        </nav>
      </div>
    </div>
  );
};

export default ReformasModule;
