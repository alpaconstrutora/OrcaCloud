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
    const targetDate = s.data_agendamento || s.pro_orcamentos?.created_at;
    const sDate = targetDate ? new Date(targetDate).toDateString() : '';
    return sDate === hoje || s.status === 'EM_ANDAMENTO';
  });

  const proximosServicos = servicos.filter(s => {
    if (s.status === 'CONCLUIDO') return false;
    const targetDate = s.data_agendamento || s.pro_orcamentos?.created_at;
    const sDate = targetDate ? new Date(targetDate).toDateString() : '';
    return sDate !== hoje && s.status !== 'EM_ANDAMENTO';
  });

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#F3F7F9]">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Carregando Agenda...</span>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-6 bg-[#F3F7F9]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-800 tracking-tight">ÒPURA Pro</h1>
          <p className="text-xs font-semibold text-slate-500">Seu controle diário de campo</p>
        </div>
        <button
          onClick={fetchData}
          className="w-8 h-8 rounded-xl bg-white border border-slate-200/60 shadow-sm flex items-center justify-center text-button active:scale-95 transition-transform hover:bg-slate-50"
          title="Recarregar"
        >
          🔄
        </button>
      </div>

      {/* Resumo Financeiro - Stripe Light Style */}
      <div className="grid grid-cols-2 gap-4 bg-white border border-slate-200/50 p-4 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
        <div className="space-y-1">
          <span className="block text-xs font-black uppercase tracking-widest text-teal-600">Faturamento</span>
          <span className="text-lg font-black text-slate-800">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(faturamento)}
          </span>
          <span className="block text-[9px] text-slate-500">Serviços concluídos</span>
        </div>
        <div className="space-y-1 border-l border-slate-100 pl-4">
          <span className="block text-xs font-black uppercase tracking-widest text-cyan-600">A Receber</span>
          <span className="text-lg font-black text-slate-800">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pendente)}
          </span>
          <span className="block text-[9px] text-slate-500">Em andamento</span>
        </div>
      </div>

      {/* Serviços de Hoje (Agenda) */}
      <div className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Serviços para Hoje</h2>
        {servicosHoje.length === 0 ? (
          <div className="text-center py-8 px-4 bg-white border border-dashed border-slate-200 rounded-[24px] text-xs text-slate-400">
            Nenhum serviço agendado para hoje.
          </div>
        ) : (
          <div className="space-y-3">
            {servicosHoje.map(s => (
              <div
                key={s.id}
                onClick={() => onViewServico(s.id)}
                className="bg-white hover:bg-slate-50/50 border border-slate-200/30 p-4 rounded-[24px] flex flex-col gap-2.5 cursor-pointer transition-all shadow-[0_8px_30px_rgb(0,0,0,0.03)] active:scale-[0.99] duration-150"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="space-y-1 max-w-[70%]">
                    <span className="block font-black text-sm text-slate-800 truncate">
                      {s.pro_orcamentos?.pro_clientes?.nome || 'Cliente sem nome'}
                    </span>
                    {s.data_agendamento && (
                      <span className="block text-xs font-black uppercase text-teal-600 flex items-center gap-1">
                        🕒 {new Date(s.data_agendamento).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    )}
                    <span className="block text-xs text-slate-500 truncate font-medium">
                      {s.pro_orcamentos?.descricao}
                    </span>
                    <span className="block text-[9px] font-black uppercase tracking-wider text-teal-600">
                      📍 {s.pro_orcamentos?.pro_clientes?.endereco || 'Sem endereço'}
                    </span>
                  </div>
                  <div className="text-right space-y-1">
                    <span className="block font-black text-slate-800 text-sm">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.pro_orcamentos?.valor || 0)}
                    </span>
                    <span className={`inline-block text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full ${
                      s.status === 'EM_ANDAMENTO' ? 'bg-cyan-50 text-cyan-600' : 'bg-amber-50 text-amber-600'
                    }`}>
                      {s.status === 'EM_ANDAMENTO' ? 'Em Andamento' : 'Pendente'}
                    </span>
                  </div>
                </div>
                <div className="border-t border-slate-100 pt-2 flex justify-start">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleWhatsAppConfirmarServico(s);
                    }}
                    className="text-[9px] font-black uppercase tracking-widest bg-emerald-50 hover:bg-emerald-100/70 text-emerald-600 border border-emerald-200/50 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 active:scale-95"
                  >
                    💬 Confirmar via WhatsApp
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
          <h2 className="text-xs font-black uppercase tracking-widest text-teal-600 flex items-center gap-1.5">
            🔔 Serviços para Oferecer de Novo
          </h2>
          <div className="space-y-3">
            {recorrentes.map(s => (
              <div
                key={s.id}
                className="bg-white border border-slate-200/30 p-4 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] flex items-center justify-between transition-all hover:bg-slate-50/50"
              >
                <div className="space-y-1 max-w-[65%]">
                  <span className="block font-black text-sm text-slate-800 truncate">
                    {s.pro_orcamentos?.pro_clientes?.nome}
                  </span>
                  <span className="block text-xs text-teal-600 font-semibold truncate">
                    Revisão em: {new Date(s.proximo_agendamento).toLocaleDateString('pt-BR')}
                  </span>
                  <span className="block text-xs text-slate-400 truncate">
                    Serviço anterior: {s.pro_orcamentos?.descricao}
                  </span>
                </div>
                <button
                  onClick={() => handleWhatsAppRecorrencia(s)}
                  className="bg-gradient-to-tr from-teal-500 to-cyan-400 hover:from-teal-600 hover:to-cyan-500 text-white px-3.5 py-2 rounded-xl text-button font-black uppercase tracking-widest transition-all shadow-md shadow-teal-500/10 active:scale-95"
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
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Orçamentos Enviados</h2>
          <button
            onClick={onNewOrcamento}
            className="text-xs font-black uppercase tracking-widest text-teal-600 hover:text-teal-500"
          >
            + Criar
          </button>
        </div>
        {orcamentos.length === 0 ? (
          <div className="text-center py-8 px-4 bg-white border border-dashed border-slate-200 rounded-[24px] text-xs text-slate-400">
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
                  className="bg-white hover:bg-slate-50/50 border border-slate-200/30 p-4 rounded-[24px] flex flex-col gap-2.5 cursor-pointer transition-all shadow-[0_8px_30px_rgb(0,0,0,0.03)] active:scale-[0.99] duration-150"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="space-y-1 max-w-[70%]">
                      <span className="block font-black text-sm text-slate-800 truncate">
                        {o.pro_clientes?.nome || 'Cliente sem nome'}
                      </span>
                      <span className="block text-xs text-slate-500 truncate font-medium">
                        {o.descricao}
                      </span>
                      <span className="block text-[9px] text-slate-400">
                        Garantia: {o.garantia_dias ? `${o.garantia_dias} dias` : 'Não informada'}
                      </span>
                    </div>
                    <div className="text-right space-y-1">
                      <span className="block font-black text-slate-800 text-sm">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(o.valor)}
                      </span>
                      <span className={`inline-block text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full ${
                        o.status === 'APROVADO' ? 'bg-emerald-50 text-emerald-600' :
                        o.status === 'ENVIADO' ? 'bg-teal-50 text-teal-600' :
                        o.status === 'RECUSADO' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {o.status}
                      </span>
                    </div>
                  </div>
                  {o.status === 'ENVIADO' && (
                    <div className="border-t border-slate-100 pt-2 flex justify-start">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleWhatsAppLembrarOrcamento(o);
                        }}
                        className="text-[9px] font-black uppercase tracking-widest bg-teal-50 hover:bg-teal-100/70 text-teal-600 border border-teal-200/50 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 active:scale-95"
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
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Próximos Serviços</h2>
          <div className="space-y-3">
            {proximosServicos.slice(0, 3).map(s => (
              <div
                key={s.id}
                onClick={() => onViewServico(s.id)}
                className="bg-white hover:bg-slate-50/50 border border-slate-200/30 p-4 rounded-[24px] flex flex-col gap-2.5 cursor-pointer transition-all shadow-[0_8px_30px_rgb(0,0,0,0.03)] active:scale-[0.99] duration-150"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="space-y-1 max-w-[70%]">
                    <span className="block font-black text-sm text-slate-800 truncate">
                      {s.pro_orcamentos?.pro_clientes?.nome}
                    </span>
                    {s.data_agendamento && (
                      <span className="block text-xs font-black uppercase text-teal-600 flex items-center gap-1">
                        🕒 {new Date(s.data_agendamento).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    )}
                    <span className="block text-xs text-slate-500 truncate font-medium">
                      {s.pro_orcamentos?.descricao}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block font-black text-slate-800 text-sm">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.pro_orcamentos?.valor || 0)}
                    </span>
                  </div>
                </div>
                <div className="border-t border-slate-100 pt-2 flex justify-start">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleWhatsAppConfirmarServico(s);
                    }}
                    className="text-[9px] font-black uppercase tracking-widest bg-emerald-50 hover:bg-emerald-100/70 text-emerald-600 border border-emerald-200/50 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 active:scale-95"
                  >
                    💬 Confirmar via WhatsApp
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
