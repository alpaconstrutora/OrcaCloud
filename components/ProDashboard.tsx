import React from 'react';
import { proService } from '../services/proService';
import { ProOrcamento, ProServico } from '../types';

interface ProDashboardProps {
  userId: string;
  onNewOrcamento: () => void;
  onEditOrcamento: (id: string) => void;
  onViewServico: (id: string) => void;
  onNavigate: (view: string) => void;
}

const ProDashboard: React.FC<ProDashboardProps> = ({
  userId,
  onNewOrcamento,
  onEditOrcamento,
  onViewServico,
  onNavigate
}) => {
  const [loading, setLoading] = React.useState(true);
  const [orcamentos, setOrcamentos] = React.useState<any[]>([]);
  const [servicos, setServicos] = React.useState<any[]>([]);
  const [recorrentes, setRecorrentes] = React.useState<any[]>([]);
  const [faturamento, setFaturamento] = React.useState(0);
  const [pendente, setPendente] = React.useState(0);

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [orcData, servData] = await Promise.all([
        proService.listOrcamentos(userId),
        proService.listServicos(userId)
      ]);

      setOrcamentos(orcData);
      setServicos(servData);

      // Calcular faturamento (concluídos) e valores pendentes
      let fatSum = 0;
      let pendSum = 0;

      servData.forEach((s: any) => {
        const value = s.pro_orcamentos?.valor || 0;
        if (s.status === 'CONCLUIDO') {
          fatSum += Number(value);
        } else {
          pendSum += Number(value);
        }
      });

      // Inclui também orçamentos aprovados que ainda não viraram OS ou estão pendentes
      orcData.forEach((o: any) => {
        if (o.status === 'APROVADO') {
          // Se não houver serviço criado ainda, conta como pendente
          const hasOS = servData.some((s: any) => s.orcamento_id === o.id);
          if (!hasOS) {
            pendSum += Number(o.valor);
          }
        }
      });

      // Filtrar serviços recorrentes vencidos ou próximos (proximo_agendamento definido e no passado ou nos próximos 7 dias)
      const rec = servData.filter((s: any) => {
        if (!s.proximo_agendamento || s.status !== 'CONCLUIDO') return false;
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() + 7);
        return new Date(s.proximo_agendamento) <= limitDate;
      });

      setRecorrentes(rec);
      setFaturamento(fatSum);
      setPendente(pendSum);
    } catch (error) {
      console.error('Erro ao buscar dados do dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Mensagens rápidas de WhatsApp
  const handleWhatsAppLembrarOrcamento = (o: any) => {
    const cliName = o.pro_clientes?.nome || 'Cliente';
    const cliPhone = o.pro_clientes?.telefone || '';
    const desc = o.descricao || '';
    const val = o.valor || 0;

    const formattedVal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val));
    const message = `Olá, ${cliName}! Passando para saber se você conseguiu analisar o orçamento que enviei para o serviço de *${desc}* no valor de ${formattedVal}. Fico à disposição para tirar qualquer dúvida e agendarmos!`;

    const encoded = encodeURIComponent(message);
    const cleanPhone = cliPhone.replace(/\D/g, '');
    const targetPhone = cleanPhone.length === 11 || cleanPhone.length === 10 ? `55${cleanPhone}` : cleanPhone;
    const waUrl = `https://wa.me/${targetPhone}?text=${encoded}`;
    window.open(waUrl, '_blank');
  };

  const handleWhatsAppRecorrencia = (s: any) => {
    const cliName = s.pro_orcamentos?.pro_clientes?.nome || 'Cliente';
    const cliPhone = s.pro_orcamentos?.pro_clientes?.telefone || '';
    const desc = s.pro_orcamentos?.descricao || 'serviço';
    const val = s.pro_orcamentos?.valor || 0;

    const formattedVal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val));
    const message = `Olá, ${cliName}! Faz um tempo que realizamos o serviço de *${desc}* no valor de ${formattedVal}. Já está na hora de programarmos a próxima manutenção preventiva para garantir o bom funcionamento. Vamos agendar para esta semana?`;

    const encoded = encodeURIComponent(message);
    const cleanPhone = cliPhone.replace(/\D/g, '');
    const targetPhone = cleanPhone.length === 11 || cleanPhone.length === 10 ? `55${cleanPhone}` : cleanPhone;
    const waUrl = `https://wa.me/${targetPhone}?text=${encoded}`;
    window.open(waUrl, '_blank');
  };

  const handleWhatsAppConfirmarServico = (s: any) => {
    const cliName = s.pro_orcamentos?.pro_clientes?.nome || 'Cliente';
    const cliPhone = s.pro_orcamentos?.pro_clientes?.telefone || '';
    const desc = s.pro_orcamentos?.descricao || '';

    const message = `Olá, ${cliName}! Passando para confirmar o nosso agendamento para o serviço de *${desc}*. Está tudo certo para nos encontrarmos no horário combinado?`;
    const encoded = encodeURIComponent(message);
    const cleanPhone = cliPhone.replace(/\D/g, '');
    const targetPhone = cleanPhone.length === 11 || cleanPhone.length === 10 ? `55${cleanPhone}` : cleanPhone;
    const waUrl = `https://wa.me/${targetPhone}?text=${encoded}`;
    window.open(waUrl, '_blank');
  };

  // Filtrar serviços da agenda
  const hoje = new Date().toDateString();
  const servicosHoje = servicos.filter(s => {
    if (s.status === 'CONCLUIDO') return false;
    const sDate = s.pro_orcamentos?.created_at ? new Date(s.pro_orcamentos.created_at).toDateString() : '';
    return sDate === hoje || s.status === 'EM_ANDAMENTO';
  });

  const proximosServicos = servicos.filter(s => {
    if (s.status === 'CONCLUIDO') return false;
    const sDate = s.pro_orcamentos?.created_at ? new Date(s.pro_orcamentos.created_at).toDateString() : '';
    return sDate !== hoje && s.status !== 'EM_ANDAMENTO';
  });

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Carregando Agenda...</span>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight">ÒPURA Pro</h1>
          <p className="text-xs font-semibold text-slate-400">Seu controle diário de campo</p>
        </div>
        <button
          onClick={fetchData}
          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-xs active:scale-95 transition-transform"
          title="Recarregar"
        >
          🔄
        </button>
      </div>

      {/* Resumo Financeiro - Stripe Style */}
      <div className="grid grid-cols-2 gap-4 bg-gradient-to-tr from-slate-950 to-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div className="space-y-1">
          <span className="block text-[10px] font-black uppercase tracking-widest text-emerald-500">Faturamento</span>
          <span className="text-lg font-black text-white">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(faturamento)}
          </span>
          <span className="block text-[9px] text-slate-400">Serviços concluídos</span>
        </div>
        <div className="space-y-1 border-l border-slate-800 pl-4">
          <span className="block text-[10px] font-black uppercase tracking-widest text-amber-500">A Receber</span>
          <span className="text-lg font-black text-white">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pendente)}
          </span>
          <span className="block text-[9px] text-slate-400">Serviços em andamento</span>
        </div>
      </div>

      {/* Serviços de Hoje (Agenda) */}
      <div className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Serviços para Hoje</h2>
        {servicosHoje.length === 0 ? (
          <div className="text-center py-6 px-4 border border-dashed border-slate-800 rounded-2xl text-xs text-slate-500">
            Nenhum serviço agendado para hoje.
          </div>
        ) : (
          <div className="space-y-3">
            {servicosHoje.map(s => (
              <div
                key={s.id}
                onClick={() => onViewServico(s.id)}
                className="bg-slate-950/40 hover:bg-slate-950/80 border border-slate-800 p-4 rounded-2xl flex flex-col gap-2 cursor-pointer transition-colors active:scale-[0.99] duration-150"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="space-y-1 max-w-[70%]">
                    <span className="block font-black text-sm text-white truncate">
                      {s.pro_orcamentos?.pro_clientes?.nome || 'Cliente sem nome'}
                    </span>
                    <span className="block text-xs text-slate-400 truncate">
                      {s.pro_orcamentos?.descricao}
                    </span>
                    <span className="block text-[9px] font-black uppercase tracking-wider text-orange-400">
                      📍 {s.pro_orcamentos?.pro_clientes?.endereco || 'Sem endereço'}
                    </span>
                  </div>
                  <div className="text-right space-y-1">
                    <span className="block font-black text-white text-sm">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.pro_orcamentos?.valor || 0)}
                    </span>
                    <span className={`inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                      s.status === 'EM_ANDAMENTO' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {s.status === 'EM_ANDAMENTO' ? 'Em Andamento' : 'Pendente'}
                    </span>
                  </div>
                </div>
                <div className="border-t border-slate-900 pt-2 flex justify-start">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleWhatsAppConfirmarServico(s);
                    }}
                    className="text-[9px] font-black uppercase tracking-widest bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 active:scale-95"
                  >
                    💬 Confirmar Agendamento via WhatsApp
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Serviços para Oferecer de Novo (Recorrência) */}
      {recorrentes.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-black uppercase tracking-widest text-orange-500 flex items-center gap-1.5">
            🔔 Serviços para Oferecer de Novo
          </h2>
          <div className="space-y-3">
            {recorrentes.map(s => (
              <div
                key={s.id}
                className="bg-slate-950/40 border border-slate-800 p-4 rounded-2xl flex items-center justify-between transition-colors hover:bg-slate-950/80"
              >
                <div className="space-y-1 max-w-[65%]">
                  <span className="block font-black text-sm text-white truncate">
                    {s.pro_orcamentos?.pro_clientes?.nome}
                  </span>
                  <span className="block text-xs text-slate-400 truncate">
                    Próxima revisão recomendada: {new Date(s.proximo_agendamento).toLocaleDateString('pt-BR')}
                  </span>
                  <span className="block text-[10px] text-slate-500 truncate">
                    Último serviço: {s.pro_orcamentos?.descricao}
                  </span>
                </div>
                <button
                  onClick={() => handleWhatsAppRecorrencia(s)}
                  className="bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-1 shadow-lg shadow-emerald-950/20 active:scale-95"
                >
                  💬 Oferecer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orçamentos Recentes */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Orçamentos Enviados</h2>
          <button
            onClick={onNewOrcamento}
            className="text-[10px] font-black uppercase tracking-widest text-orange-500 hover:text-orange-400"
          >
            + Criar
          </button>
        </div>
        {orcamentos.length === 0 ? (
          <div className="text-center py-6 px-4 border border-dashed border-slate-800 rounded-2xl text-xs text-slate-500">
            Nenhum orçamento criado ainda.
          </div>
        ) : (
          <div className="space-y-3">
            {orcamentos.slice(0, 3).map(o => {
              // Verifica se já tem OS correspondente
              const hasOS = servicos.find(s => s.orcamento_id === o.id);
              return (
                <div
                  key={o.id}
                  onClick={() => hasOS ? onViewServico(hasOS.id) : onEditOrcamento(o.id)}
                  className="bg-slate-950/40 hover:bg-slate-950/80 border border-slate-800 p-4 rounded-2xl flex flex-col gap-2 cursor-pointer transition-colors active:scale-[0.99] duration-150"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="space-y-1 max-w-[70%]">
                      <span className="block font-black text-sm text-white truncate">
                        {o.pro_clientes?.nome || 'Cliente sem nome'}
                      </span>
                      <span className="block text-xs text-slate-400 truncate">
                        {o.descricao}
                      </span>
                      <span className="block text-[9px] text-slate-500">
                        Garantia: {o.garantia_dias ? `${o.garantia_dias} dias` : 'Não informada'}
                      </span>
                    </div>
                    <div className="text-right space-y-1">
                      <span className="block font-black text-white text-sm">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(o.valor)}
                      </span>
                      <span className={`inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                        o.status === 'APROVADO' ? 'bg-emerald-500/20 text-emerald-400' :
                        o.status === 'ENVIADO' ? 'bg-blue-500/20 text-blue-400' :
                        o.status === 'RECUSADO' ? 'bg-red-500/20 text-red-400' : 'bg-slate-700/40 text-slate-400'
                      }`}>
                        {o.status}
                      </span>
                    </div>
                  </div>
                  {o.status === 'ENVIADO' && (
                    <div className="border-t border-slate-900 pt-2 flex justify-start">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleWhatsAppLembrarOrcamento(o);
                        }}
                        className="text-[9px] font-black uppercase tracking-widest bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 border border-orange-500/30 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 active:scale-95"
                      >
                        💬 Cobrar Resposta via WhatsApp
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Próximos Serviços */}
      {proximosServicos.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Próximos Serviços</h2>
          <div className="space-y-3">
            {proximosServicos.slice(0, 3).map(s => (
              <div
                key={s.id}
                onClick={() => onViewServico(s.id)}
                className="bg-slate-950/40 hover:bg-slate-950/80 border border-slate-800 p-4 rounded-2xl flex flex-col gap-2 cursor-pointer transition-colors active:scale-[0.99] duration-150"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="space-y-1 max-w-[70%]">
                    <span className="block font-black text-sm text-white truncate">
                      {s.pro_orcamentos?.pro_clientes?.nome}
                    </span>
                    <span className="block text-xs text-slate-400 truncate">
                      {s.pro_orcamentos?.descricao}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block font-black text-white text-sm">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.pro_orcamentos?.valor || 0)}
                    </span>
                  </div>
                </div>
                <div className="border-t border-slate-900 pt-2 flex justify-start">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleWhatsAppConfirmarServico(s);
                    }}
                    className="text-[9px] font-black uppercase tracking-widest bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 active:scale-95"
                  >
                    💬 Confirmar Agendamento via WhatsApp
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProDashboard;
