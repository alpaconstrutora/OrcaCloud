import React from 'react';
import { proService } from '../services/proService';
import { ProOrcamento, ProServico } from '../types';
import { HandCoins, MessageCircle } from 'lucide-react';
import { resumirPainelPro, diasDesde, mensagemDeCobranca, linkWhatsApp } from '../utils/proPainelResumo';
import { montarPixCopiaECola } from '../utils/pixCopiaECola';

interface ProDashboardProps {
  userId: string;
  onNewOrcamento: () => void;
  onEditOrcamento: (id: string) => void;
  onViewServico: (id: string, opcoes?: { abrirRecebimento?: boolean }) => void;
  onNavigate: (view: string) => void;
}

// Mesmo valor de utils/pixCopiaECola + ProServicoView: o cadastro do Pro ainda não tem cidade.
const CIDADE_RECEBEDOR_PADRAO = 'BRASILIA';
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const textoDiasAguardando = (dias: number | null) =>
  dias === null ? 'Concluído' : dias === 0 ? 'Concluído hoje' : dias === 1 ? 'Concluído ontem' : `Concluído há ${dias} dias`;

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
  const [config, setConfig] = React.useState<any>(null);

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [orcData, servData, configData] = await Promise.all([
        proService.listOrcamentos(userId),
        proService.listServicos(userId),
        proService.getConfig(userId).catch(() => null),
      ]);

      setOrcamentos(orcData);
      setServicos(servData);
      setConfig(configData);

      // Filtrar serviços recorrentes vencidos ou próximos (proximo_agendamento definido e no passado ou nos próximos 7 dias)
      const rec = servData.filter((s: any) => {
        if (!s.proximo_agendamento || s.status !== 'CONCLUIDO') return false;
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() + 7);
        return new Date(s.proximo_agendamento) <= limitDate;
      });

      setRecorrentes(rec);
    } catch (error) {
      console.error('Erro ao buscar dados do dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Números do topo e lista "Aguardando pagamento" (utils/proPainelResumo.ts).
  const resumo = React.useMemo(() => resumirPainelPro(servicos, orcamentos), [servicos, orcamentos]);

  const cobrarNoWhatsApp = (s: any) => {
    const valor = Number(s.pro_orcamentos?.valor || 0);
    const pix = config?.pix_key
      ? montarPixCopiaECola({ tipo: config.pix_key_type, chave: config.pix_key, valor, nome: config.template_header || '', cidade: CIDADE_RECEBEDOR_PADRAO })
      : null;
    const msg = mensagemDeCobranca({
      cliente: s.pro_orcamentos?.pro_clientes?.nome || '',
      descricao: s.pro_orcamentos?.descricao || '',
      valor,
      pixCopiaECola: pix?.ok ? pix.payload : '',
    });
    window.open(linkWhatsApp(s.pro_orcamentos?.pro_clientes?.telefone, msg), '_blank');
  };

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

      {/* Resumo financeiro: o que entrou, o que falta cobrar, o que ainda vai ser feito */}
      <dl className="grid grid-cols-3 bg-white border border-slate-200 rounded-[10px] divide-x divide-slate-100">
        {[
          { rotulo: 'Recebido', valor: resumo.recebidoNoMes, apoio: 'neste mês', destaque: 'text-emerald-700' },
          { rotulo: 'A receber', valor: resumo.aReceber, apoio: 'concluídos', destaque: resumo.aReceber > 0 ? 'text-amber-700' : 'text-slate-900' },
          { rotulo: 'Em execução', valor: resumo.emExecucao, apoio: 'por fazer', destaque: 'text-slate-900' },
        ].map(k => (
          <div key={k.rotulo} className="px-3 py-3 min-w-0">
            <dt className="text-xs font-semibold text-slate-600">{k.rotulo}</dt>
            <dd className={`mt-1 text-sm font-semibold tabular-nums truncate ${k.destaque}`} title={brl(k.valor)}>{brl(k.valor)}</dd>
            <dd className="text-xs text-slate-600">{k.apoio}</dd>
          </div>
        ))}
      </dl>

      {/* Aguardando pagamento: concluídos sem recebimento, do mais antigo ao mais novo, sem corte */}
      {resumo.aguardandoPagamento.length > 0 && (
        <section aria-labelledby="titulo-aguardando" className="space-y-2">
          <h2 id="titulo-aguardando" className="text-sm font-semibold text-slate-900">
            Aguardando pagamento <span className="text-slate-600 font-normal">({resumo.aguardandoPagamento.length})</span>
          </h2>
          <ul className="bg-white border border-slate-200 rounded-[10px] divide-y divide-slate-100">
            {resumo.aguardandoPagamento.map((s: any) => (
              <li key={s.id} className="p-3 space-y-2.5">
                <button
                  type="button"
                  onClick={() => onViewServico(s.id)}
                  className="w-full flex items-start justify-between gap-3 text-left rounded-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 truncate">{s.pro_orcamentos?.pro_clientes?.nome || 'Cliente sem nome'}</span>
                    <span className="block text-xs text-slate-600 truncate">{s.pro_orcamentos?.descricao}</span>
                    <span className="block text-xs text-amber-700">{textoDiasAguardando(diasDesde(s.concluido_em))}</span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-slate-900 shrink-0">{brl(Number(s.pro_orcamentos?.valor || 0))}</span>
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => cobrarNoWhatsApp(s)}
                    className="h-11 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[6px] font-medium text-sm transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" aria-hidden />
                    Cobrar
                  </button>
                  <button
                    type="button"
                    onClick={() => onViewServico(s.id, { abrirRecebimento: true })}
                    className="h-11 flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-[6px] font-medium text-sm transition-colors"
                  >
                    <HandCoins className="w-4 h-4" aria-hidden />
                    Recebi
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Serviços de Hoje (Agenda) */}
      <div className="space-y-3">
        <h2 className="text-xs font-black text-slate-500">Serviços para Hoje</h2>
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
          <h2 className="text-xs font-black text-teal-600 flex items-center gap-1.5">
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
          <h2 className="text-xs font-black text-slate-500">Orçamentos Enviados</h2>
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
          <h2 className="text-xs font-black text-slate-500">Próximos Serviços</h2>
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
