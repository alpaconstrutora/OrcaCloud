import React from 'react';
import ProDashboard from './ProDashboard';
import ProOrcamentoForm from './ProOrcamentoForm';
import ProServicoView from './ProServicoView';
import ProClientesLista from './ProClientesLista';
import ProConfigForm from './ProConfigForm';

interface ProModuleProps {
  activeView: string;
  onChangeView: (view: string) => void;
  userId: string;
}

export const ProModule: React.FC<ProModuleProps> = ({ activeView, onChangeView, userId }) => {
  // Estados para navegação interna de registros
  const [selectedOrcamentoId, setSelectedOrcamentoId] = React.useState<string | null>(null);
  const [selectedServicoId, setSelectedServicoId] = React.useState<string | null>(null);

  // Manipuladores de transição rápidos
  const handleEditOrcamento = (id: string) => {
    setSelectedOrcamentoId(id);
    onChangeView('pro-orcamento-form');
  };

  const handleCreateOrcamento = () => {
    setSelectedOrcamentoId(null);
    onChangeView('pro-orcamento-form');
  };

  const handleViewServico = (id: string) => {
    setSelectedServicoId(id);
    onChangeView('pro-servico-detalhe');
  };

  return (
    <div className="min-h-full bg-slate-900 text-slate-100 flex flex-col md:max-w-md md:mx-auto md:shadow-2xl md:border md:border-slate-800 md:rounded-3xl md:my-4 md:overflow-hidden relative pb-16">
      {/* Container Principal */}
      <div className="flex-1 flex flex-col overflow-y-auto scrollbar-hide">
        {activeView === 'pro-dashboard' && (
          <ProDashboard
            userId={userId}
            onNewOrcamento={handleCreateOrcamento}
            onEditOrcamento={handleEditOrcamento}
            onViewServico={handleViewServico}
            onNavigate={onChangeView}
          />
        )}

        {activeView === 'pro-orcamento-form' && (
          <ProOrcamentoForm
            userId={userId}
            orcamentoId={selectedOrcamentoId}
            onBack={() => onChangeView('pro-dashboard')}
            onSave={() => onChangeView('pro-dashboard')}
          />
        )}

        {activeView === 'pro-servico-detalhe' && (
          <ProServicoView
            userId={userId}
            servicoId={selectedServicoId}
            onBack={() => onChangeView('pro-dashboard')}
            onSave={() => onChangeView('pro-dashboard')}
          />
        )}

        {activeView === 'pro-clientes-lista' && (
          <ProClientesLista
            userId={userId}
            onBack={() => onChangeView('pro-dashboard')}
          />
        )}

        {activeView === 'pro-config' && (
          <ProConfigForm
            userId={userId}
            onBack={() => onChangeView('pro-dashboard')}
          />
        )}
      </div>

      {/* Menu Inferior Fixo (Mobile Bottom Bar) */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-slate-950/90 backdrop-blur-md border-t border-slate-800/80 flex items-center justify-around z-40 px-2">
        <button
          onClick={() => onChangeView('pro-dashboard')}
          className={`flex flex-col items-center justify-center w-12 h-12 transition-colors ${
            activeView === 'pro-dashboard' ? 'text-orange-500' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="text-xl">📅</span>
          <span className="text-[9px] font-black uppercase mt-0.5 tracking-tighter">Agenda</span>
        </button>

        <button
          onClick={() => onChangeView('pro-clientes-lista')}
          className={`flex flex-col items-center justify-center w-12 h-12 transition-colors ${
            activeView === 'pro-clientes-lista' ? 'text-orange-500' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="text-xl">👤</span>
          <span className="text-[9px] font-black uppercase mt-0.5 tracking-tighter">Clientes</span>
        </button>

        <button
          onClick={handleCreateOrcamento}
          className={`flex flex-col items-center justify-center w-14 h-14 bg-gradient-to-tr from-orange-600 to-amber-500 text-white rounded-full -translate-y-4 shadow-lg shadow-orange-950/40 border-4 border-slate-900 active:scale-95 transition-transform`}
        >
          <span className="text-xl font-bold">+</span>
        </button>

        <button
          onClick={() => onChangeView('pro-config')}
          className={`flex flex-col items-center justify-center w-12 h-12 transition-colors ${
            activeView === 'pro-config' ? 'text-orange-500' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="text-xl">⚙️</span>
          <span className="text-[9px] font-black uppercase mt-0.5 tracking-tighter">Ajustes</span>
        </button>
      </div>
    </div>
  );
};

export default ProModule;
