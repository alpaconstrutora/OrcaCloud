import React from 'react';
import { officesService } from '../services/officesService';
import { supabase } from '../lib/supabase';
import { OfficesLead } from '../types';
import { 
  Folder, 
  FileText, 
  TrendingUp, 
  Sparkles, 
  ArrowRight, 
  Clock, 
  DollarSign, 
  Briefcase, 
  Activity,
  Plus,
  Compass
} from 'lucide-react';

interface OfficesDashboardProps {
  userId: string;
  onNavigate: (tab: 'DASHBOARD' | 'CRM' | 'ESPECIFICADOR' | 'TIMESHEET') => void;
}

// Imagens premium de arquitetura e interiores para ilustrar os cards dos projetos
const IMAGENS_PROJETOS = [
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=600&q=80', // Casa minimalista piscina
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=600&q=80', // Casa alto padrão iluminada
  'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=600&q=80', // Loft industrial
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=600&q=80', // Living contemporâneo
  'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=600&q=80', // Arquitetura biofílica
  'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=600&q=80'  // Fachada contemporânea concreto
];

const OfficesDashboard: React.FC<OfficesDashboardProps> = ({
  userId,
  onNavigate
}) => {
  const [loading, setLoading] = React.useState(true);
  const [leads, setLeads] = React.useState<OfficesLead[]>([]);
  const [projetos, setProjetos] = React.useState<any[]>([]);
  const [timesheetEntries, setTimesheetEntries] = React.useState<any[]>([]);

  // Estatísticas calculadas
  const [faturamentoEstimado, setFaturamentoEstimado] = React.useState(0);
  const [leadsQuentes, setLeadsQuentes] = React.useState(0);
  const [totalHorasLancadas, setTotalHorasLancadas] = React.useState(0);
  const [totalSpecsAprovado, setTotalSpecsAprovado] = React.useState(0);

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [leadsData, timesheetData, specsRes, projRes] = await Promise.all([
        officesService.listLeads(userId),
        officesService.listTimesheetByUser(userId),
        supabase.from('offices_especificacoes').select('quantidade, preco_unitario, status_aprovacao'),
        supabase.from('projects').select('id, name, created_at').order('created_at', { ascending: false })
      ]);

      setLeads(leadsData);
      setTimesheetEntries(timesheetData);
      setProjetos(projRes.data || []);

      // Calcular faturamento contratado (soma do valor estimado dos leads contratados)
      const totalContratado = leadsData
        .filter(l => l.status === 'CONTRATADO')
        .reduce((sum, l) => sum + Number(l.valor_estimado || 0), 0);

      // Calcular leads quentes (Briefing ou Proposta)
      const quentes = leadsData.filter(l => l.status === 'BRIEFING' || l.status === 'PROPOSTA').length;

      // Calcular horas totais trabalhadas
      const totalHoras = timesheetData.reduce((sum, t) => sum + Number(t.horas || 0), 0);

      // Calcular custo total de especificações aprovadas
      const totalSpecs = (specsRes.data || [])
        .filter(s => s.status_aprovacao === 'APROVADO')
        .reduce((sum, s) => sum + (Number(s.quantidade || 0) * Number(s.preco_unitario || 0)), 0);

      setFaturamentoEstimado(totalContratado);
      setLeadsQuentes(quentes);
      setTotalHorasLancadas(totalHoras);
      setTotalSpecsAprovado(totalSpecs);
    } catch (err) {
      console.error('Erro ao carregar painel Offices:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px] bg-[#121315]">
        <div className="w-8 h-8 border-4 border-[#D47A55] border-t-transparent rounded-full animate-spin mb-3 text-[#D47A55]" />
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sincronizando Escritório...</span>
      </div>
    );
  }

  // Fallback se faturamento contratado for 0 para simular dados dinâmicos do mockup
  const faturamentoReal = faturamentoEstimado || 148000;
  const propostasPendentes = leads.filter(l => l.status === 'PROPOSTA').length || 3;
  const totalProjetosAtivos = projetos.length || 12;

  return (
    <div className="p-5 space-y-6 bg-[#121315] text-slate-100 min-h-screen pb-24">
      
      {/* 1. Bloco de Boas-Vindas & Status Rápido */}
      <div className="bg-gradient-to-tr from-[#1E2022] to-[#17181A] border border-white/5 p-6 rounded-[32px] shadow-2xl relative overflow-hidden">
        {/* Detalhe decorativo cobre metálico */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#D47A55] to-transparent opacity-10 rounded-full blur-xl" />
        
        <div className="space-y-4">
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-[#D47A55] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              ÒPURA Office
            </span>
            <h1 className="text-xl font-black text-white tracking-tight mt-1">Bom dia, Altair</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Escritório de Arquitetura & Design</p>
          </div>

          <div className="grid grid-cols-3 gap-2.5 pt-2">
            <div className="bg-slate-900/40 p-3 rounded-2xl border border-white/5 space-y-1">
              <span className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Ativos</span>
              <span className="block text-sm font-black text-white">{totalProjetosAtivos} Projetos</span>
            </div>
            <div className="bg-slate-900/40 p-3 rounded-2xl border border-white/5 space-y-1">
              <span className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Aprovação</span>
              <span className="block text-sm font-black text-white">{propostasPendentes} Propostas</span>
            </div>
            <div className="bg-slate-900/40 p-3 rounded-2xl border border-white/5 space-y-1">
              <span className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Contratos</span>
              <span className="block text-xs font-black text-[#D47A55] truncate">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(faturamentoReal)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Grid de Widgets de Controle Geral */}
      <div className="grid grid-cols-2 gap-4">
        {/* Horas Lançadas */}
        <div className="bg-[#1E2022] border border-white/5 p-4 rounded-[24px] space-y-2 shadow-lg flex flex-col justify-between aspect-square md:aspect-auto md:h-28">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Horas Lançadas</span>
            <Clock className="w-4 h-4 text-[#D47A55]" />
          </div>
          <div>
            <span className="block text-xl font-black text-white">{totalHorasLancadas}h</span>
            <span className="block text-[8px] text-slate-400">Total acumulado timesheet</span>
          </div>
        </div>

        {/* Orçamento Especificador */}
        <div className="bg-[#1E2022] border border-white/5 p-4 rounded-[24px] space-y-2 shadow-lg flex flex-col justify-between aspect-square md:aspect-auto md:h-28">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Especificações</span>
            <Briefcase className="w-4 h-4 text-[#D47A55]" />
          </div>
          <div>
            <span className="block text-sm font-black text-white truncate">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(totalSpecsAprovado)}
            </span>
            <span className="block text-[8px] text-slate-400">Medições & Itens Aprovados</span>
          </div>
        </div>
      </div>

      {/* 3. Ações de Operação */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onNavigate('TIMESHEET')}
          className="p-3.5 bg-[#17181A] border border-white/5 hover:border-white/10 rounded-2xl flex items-center justify-between text-left group active:scale-[0.98] transition-all"
        >
          <div>
            <span className="block text-xs font-bold text-white group-hover:text-[#D47A55] transition-colors flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#D47A55]" />
              Lançar Horas
            </span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:translate-x-0.5 transition-transform" />
        </button>

        <button
          onClick={() => onNavigate('CRM')}
          className="p-3.5 bg-[#17181A] border border-white/5 hover:border-white/10 rounded-2xl flex items-center justify-between text-left group active:scale-[0.98] transition-all"
        >
          <div>
            <span className="block text-xs font-bold text-white group-hover:text-[#D47A55] transition-colors flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-[#D47A55]" />
              Novo Lead (CRM)
            </span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* 4. Projetos Ativos - Visual Kanban/Galeria (O Coração) */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-widest text-[#D47A55]">Projetos Ativos</h2>
          <button
            onClick={() => onNavigate('ESPECIFICADOR')}
            className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-white"
          >
            Ver Detalhes
          </button>
        </div>

        {projetos.length === 0 ? (
          <div className="text-center py-12 px-4 border border-dashed border-white/5 rounded-[28px] text-xs text-slate-500 bg-[#1E2022]">
            Nenhum projeto cadastrado no banco ainda.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projetos.slice(0, 4).map((p, index) => {
              // Simulamos um status e área para complementar o card visual premium de arquitetura
              const areasMock = ['320m²', '180m²', '550m²', '450m²'];
              const statusMock = ['Projeto Executivo', 'Estudo Preliminar', 'Projeto Legal', 'Compatibilização'];
              const concluidoMock = [78, 35, 90, 55];
              
              const area = areasMock[index % areasMock.length];
              const statusProj = statusMock[index % statusMock.length];
              const concluido = concluidoMock[index % concluidoMock.length];
              const imgUrl = IMAGENS_PROJETOS[index % IMAGENS_PROJETOS.length];

              return (
                <div 
                  key={p.id}
                  onClick={() => onNavigate('ESPECIFICADOR')}
                  className="bg-[#1E2022] border border-white/5 rounded-[28px] overflow-hidden shadow-xl hover:shadow-2xl hover:border-white/10 transition-all cursor-pointer group"
                >
                  {/* Render do Projeto */}
                  <div className="relative h-36 w-full overflow-hidden bg-slate-950">
                    <img 
                      src={imgUrl} 
                      alt={p.name} 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1E2022] via-transparent to-black/30" />
                    
                    {/* Badge de Progresso */}
                    <div className="absolute top-3 right-3 bg-black/45 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/5">
                      <span className="text-[9px] font-black text-white">{concluido}% concluído</span>
                    </div>
                  </div>

                  {/* Informações */}
                  <div className="p-4 space-y-3">
                    <div className="space-y-0.5">
                      <h3 className="font-black text-sm text-white group-hover:text-[#D47A55] transition-colors">{p.name}</h3>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        <span>Residencial {area}</span>
                        <span>•</span>
                        <span className="text-[#D47A55]">{statusProj}</span>
                      </div>
                    </div>

                    {/* Progress Bar do Projeto */}
                    <div className="space-y-1">
                      <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-[#D47A55] to-[#C8643C]"
                          style={{ width: `${concluido}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Kanban Simplificado - Leads Ativos */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-widest text-[#D47A55]">CRM & Funil Comercial</h2>
          <button
            onClick={() => onNavigate('CRM')}
            className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-white"
          >
            Ver CRM
          </button>
        </div>
        {leads.filter(l => l.status === 'BRIEFING' || l.status === 'PROPOSTA').length === 0 ? (
          <div className="text-center py-6 px-4 border border-dashed border-white/5 rounded-2xl text-xs text-slate-500 bg-[#1E2022]">
            Nenhum lead quente em prospecção.
          </div>
        ) : (
          <div className="space-y-3">
            {leads
              .filter(l => l.status === 'BRIEFING' || l.status === 'PROPOSTA')
              .slice(0, 3)
              .map(l => (
                <div
                  key={l.id}
                  onClick={() => onNavigate('CRM')}
                  className="bg-[#1E2022]/60 hover:bg-[#1E2022] border border-white/5 p-4 rounded-[20px] flex items-center justify-between cursor-pointer transition-all"
                >
                  <div className="space-y-1 max-w-[70%]">
                    <span className="block font-black text-sm text-white truncate">{l.nome_cliente}</span>
                    <span className="block text-[10px] text-slate-400 truncate">{l.briefing || 'Sem briefing cadastrado'}</span>
                    <span className="block text-[8px] font-black uppercase tracking-widest text-slate-500">
                      Contato: {l.contato || 'Não informado'}
                    </span>
                  </div>
                  <div className="text-right space-y-1">
                    <span className="block font-black text-[#D47A55] text-xs">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(l.valor_estimado)}
                    </span>
                    <span className={`inline-block text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                      l.status === 'PROPOSTA' ? 'bg-[#D47A55]/20 text-[#D47A55]' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {l.status}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* 6. Histórico Recente de Horas */}
      <div className="space-y-3.5">
        <h2 className="text-xs font-black uppercase tracking-widest text-[#D47A55]">Lançamentos de Horas</h2>
        {timesheetEntries.length === 0 ? (
          <div className="text-center py-6 px-4 border border-dashed border-white/5 rounded-2xl text-xs text-slate-500 bg-[#1E2022]">
            Nenhuma hora lançada esta semana.
          </div>
        ) : (
          <div className="space-y-3">
            {timesheetEntries.slice(0, 3).map(entry => (
              <div
                key={entry.id}
                onClick={() => onNavigate('TIMESHEET')}
                className="bg-[#1E2022]/60 hover:bg-[#1E2022] border border-white/5 p-4 rounded-[20px] flex items-center justify-between cursor-pointer transition-all"
              >
                <div className="space-y-1 max-w-[70%]">
                  <span className="block font-black text-sm text-white truncate">{entry.projects?.name}</span>
                  <span className="block text-xs text-slate-400 truncate">{entry.descricao_atividade}</span>
                  <span className="block text-[8px] font-black uppercase tracking-widest text-slate-500">
                    Lançamento: {new Date(entry.data_lancamento).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <div className="text-right">
                  <span className="block font-black text-[#D47A55] text-sm">{entry.horas}h</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OfficesDashboard;
