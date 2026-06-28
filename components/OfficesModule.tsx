import React from 'react';
import OfficesDashboard from './OfficesDashboard';
import OfficesCRM from './OfficesCRM';
import OfficesEspecificador from './OfficesEspecificador';
import OfficesTimeTracking from './OfficesTimeTracking';
import OfficesBiblioteca from './OfficesBiblioteca';
import { OfficesAI } from './OfficesAI';
import OfficesFinanceiro from './OfficesFinanceiro';
import { officesService } from '../services/officesService';
import { LayoutDashboard, Users, Folder, Palette, Clock, DollarSign, LogOut } from 'lucide-react';

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
  const [activeTab, setActiveTab] = React.useState<'DASHBOARD' | 'CRM' | 'ESPECIFICADOR' | 'BIBLIOTECA' | 'TIMESHEET' | 'FINANCEIRO'>('DASHBOARD');
  const [leadsQuentes, setLeadsQuentes] = React.useState(0);

  // Sincroniza a aba baseando-se no activeView que vem do roteador principal
  React.useEffect(() => {
    if (activeView === 'offices-crm') setActiveTab('CRM');
    else if (activeView === 'offices-especificador') setActiveTab('ESPECIFICADOR');
    else if (activeView === 'offices-biblioteca') setActiveTab('BIBLIOTECA');
    else if (activeView === 'offices-timesheet') setActiveTab('TIMESHEET');
    else if (activeView === 'offices-financeiro') setActiveTab('FINANCEIRO');
    else setActiveTab('DASHBOARD');
  }, [activeView]);

  // Carrega leads quentes para o badge comercial da sidebar
  React.useEffect(() => {
    const loadLeads = async () => {
      try {
        const data = await officesService.listLeads(userId);
        const quentes = data.filter(l => l.status === 'BRIEFING' || l.status === 'PROPOSTA').length;
        setLeadsQuentes(quentes);
      } catch (err) {
        console.error('Erro ao carregar leads para a sidebar:', err);
      }
    };
    if (userId) {
      loadLeads();
    }
  }, [userId, activeTab]);

  const handleTabChange = (tab: 'DASHBOARD' | 'CRM' | 'ESPECIFICADOR' | 'BIBLIOTECA' | 'TIMESHEET' | 'FINANCEIRO') => {
    setActiveTab(tab);
    if (tab === 'CRM') onChangeView('offices-crm');
    else if (tab === 'ESPECIFICADOR') onChangeView('offices-especificador');
    else if (tab === 'BIBLIOTECA') onChangeView('offices-biblioteca');
    else if (tab === 'TIMESHEET') onChangeView('offices-timesheet');
    else if (tab === 'FINANCEIRO') onChangeView('offices-financeiro');
    else onChangeView('offices-dashboard');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'CRM':
        return <OfficesCRM userId={userId} />;
      case 'ESPECIFICADOR':
        return <OfficesEspecificador userId={userId} />;
      case 'BIBLIOTECA':
        return <OfficesBiblioteca userId={userId} />;
      case 'TIMESHEET':
        return <OfficesTimeTracking userId={userId} />;
      case 'FINANCEIRO':
        return <OfficesFinanceiro />;
      case 'DASHBOARD':
      default:
        return (
          <OfficesDashboard
            userId={userId}
            onNavigate={(tab) => handleTabChange(tab as any)}
          />
        );
    }
  };

  return (
    <div className="flex h-full min-h-[calc(100vh-4rem)] bg-[#F3F7F9] text-slate-800 relative">
      
      {/* Sidebar Lateral para Desktop (Semelhante ao mockup de referência) */}
      <aside className="hidden md:flex flex-col w-64 bg-[#0F172A] text-slate-200 border-r border-slate-800/20 p-5 shrink-0 justify-between">
        <div className="space-y-6">
          {/* Logo / Branding */}
          <div className="flex items-center gap-2.5 px-2 py-1">
            <div className="w-7 h-7 bg-[#D47A55] rounded-xl flex items-center justify-center font-black text-white text-xs shadow-md shadow-[#D47A55]/15">
              Ò
            </div>
            <div>
              <span className="block text-xs font-black tracking-widest text-white">ÒPURA</span>
              <span className="block text-[8px] font-black tracking-widest text-slate-400 uppercase">Offices</span>
            </div>
          </div>

          {/* Links da Navegação */}
          <nav className="space-y-1">
            <button
              onClick={() => handleTabChange('DASHBOARD')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === 'DASHBOARD'
                  ? 'bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white shadow-md shadow-[#D47A55]/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Painel</span>
            </button>

            <button
              onClick={() => handleTabChange('CRM')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === 'CRM'
                  ? 'bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white shadow-md shadow-[#D47A55]/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <Users className="w-4 h-4" />
                <span>Clientes</span>
              </div>
              {leadsQuentes > 0 && (
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-black ${
                  activeTab === 'CRM' ? 'bg-white text-[#D47A55]' : 'bg-[#D47A55] text-white'
                }`}>
                  {leadsQuentes}
                </span>
              )}
            </button>

            <button
              onClick={() => handleTabChange('ESPECIFICADOR')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === 'ESPECIFICADOR'
                  ? 'bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white shadow-md shadow-[#D47A55]/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
              }`}
            >
              <Folder className="w-4 h-4" />
              <span>Projetos</span>
            </button>

            <button
              onClick={() => handleTabChange('BIBLIOTECA')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === 'BIBLIOTECA'
                  ? 'bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white shadow-md shadow-[#D47A55]/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
              }`}
            >
              <Palette className="w-4 h-4" />
              <span>Moodboard</span>
            </button>

            <button
              onClick={() => handleTabChange('TIMESHEET')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === 'TIMESHEET'
                  ? 'bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white shadow-md shadow-[#D47A55]/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Horas</span>
            </button>

            <button
              onClick={() => handleTabChange('FINANCEIRO')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === 'FINANCEIRO'
                  ? 'bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white shadow-md shadow-[#D47A55]/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              <span>Financeiro</span>
            </button>
          </nav>
        </div>

        {/* Rodapé da Sidebar - Perfil do Profissional */}
        <div className="border-t border-slate-800/60 pt-4 space-y-3">
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-8 h-8 rounded-full bg-slate-800 overflow-hidden flex items-center justify-center font-black text-[#D47A55] text-xs border border-white/5">
              AS
            </div>
            <div>
              <span className="block text-xs font-bold text-white leading-none">Altair Silva</span>
              <span className="block text-[8px] text-slate-450 font-bold uppercase tracking-wider mt-1">Sócio Diretor</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Área Principal de Conteúdo (Fundo Claro com Cartões Brancos) */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#F3F7F9] pb-16 md:pb-0">
        
        {/* Cabeçalho superior Desktop (Semelhante ao mockup de referência) */}
        <header className="hidden md:flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200/50 shadow-sm shrink-0">
          <div>
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none">
              {activeTab === 'DASHBOARD' && 'Painel Geral'}
              {activeTab === 'CRM' && 'Funil Comercial / CRM'}
              {activeTab === 'ESPECIFICADOR' && 'Projetos & Especificações'}
              {activeTab === 'BIBLIOTECA' && 'Moodboard & Referências'}
              {activeTab === 'TIMESHEET' && 'Gestão de Horas / Timesheet'}
              {activeTab === 'FINANCEIRO' && 'Financeiro / Fluxo de Caixa'}
            </h2>
            <span className="text-[9px] text-slate-400 uppercase font-black tracking-widest mt-1 block">
              ÒPURA Offices
            </span>
          </div>

          <div className="flex items-center gap-5">
            {/* Lupa / Busca */}
            <div className="relative">
              <input 
                type="text" 
                placeholder="Buscar no escritório..." 
                className="bg-slate-50 border border-slate-200/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-700 outline-none focus:border-[#D47A55] font-medium w-48 transition-all"
              />
              <span className="absolute left-2.5 top-2 text-slate-400 text-xs">🔍</span>
            </div>

            {/* Notificações */}
            <button className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors relative">
              <span className="text-xs">🔔</span>
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#D47A55] rounded-full" />
            </button>

            {/* Perfil */}
            <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200/80">
              <span className="text-xs font-bold text-slate-500">Olá, Altair!</span>
              <div className="w-7 h-7 rounded-full bg-[#D47A55]/15 border border-[#D47A55]/20 flex items-center justify-center font-black text-[#D47A55] text-xs">
                AS
              </div>
            </div>
          </div>
        </header>

        {/* Painel Interno de Conteúdo */}
        <div className="flex-1 overflow-y-auto">
          {renderContent()}
        </div>
      </div>

      {/* Bottom Bar para Navegação Móvel (Mantido para telas pequenas) */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-[#17181A]/95 backdrop-blur-lg border-t border-white/5 px-6 py-3 flex justify-between items-center z-40 max-w-full">
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

        {/* Projetos Link */}
        <button
          onClick={() => handleTabChange('ESPECIFICADOR')}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === 'ESPECIFICADOR' ? 'text-[#D47A55] scale-105' : 'text-slate-500 hover:text-slate-350'
          }`}
        >
          <Folder className="w-5 h-5" />
          <span className="text-[8px] font-black uppercase tracking-widest">Projetos</span>
        </button>

        {/* Moodboard Link */}
        <button
          onClick={() => handleTabChange('BIBLIOTECA')}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === 'BIBLIOTECA' ? 'text-[#D47A55] scale-105' : 'text-slate-500 hover:text-slate-350'
          }`}
        >
          <Palette className="w-5 h-5" />
          <span className="text-[8px] font-black uppercase tracking-widest">Moodboard</span>
        </button>

        {/* Horas Link */}
        <button
          onClick={() => handleTabChange('TIMESHEET')}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === 'TIMESHEET' ? 'text-[#D47A55] scale-105' : 'text-slate-500 hover:text-slate-350'
          }`}
        >
          <Clock className="w-5 h-5" />
          <span className="text-[8px] font-black uppercase tracking-widest">Horas</span>
        </button>

        {/* Financeiro Link */}
        <button
          onClick={() => handleTabChange('FINANCEIRO')}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === 'FINANCEIRO' ? 'text-[#D47A55] scale-105' : 'text-slate-500 hover:text-slate-350'
          }`}
        >
          <DollarSign className="w-5 h-5" />
          <span className="text-[8px] font-black uppercase tracking-widest">Financeiro</span>
        </button>
      </nav>

      {/* Assistente de IA Flutuante (ÒPURA AI) */}
      <OfficesAI />
    </div>
  );
};

export default OfficesModule;
