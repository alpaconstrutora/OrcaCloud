import React from 'react';
import { proService } from '../services/proService';
import { ProOrcamento, ProServico } from '../types';
import { AlertTriangle, HandCoins, MessageCircle, RefreshCw, Clock, MapPin, Plus } from 'lucide-react';
import { resumirPainelPro, diasDesde, mensagemDeCobranca, linkWhatsApp } from '../utils/proPainelResumo';
import { separarAgenda } from '../utils/proAgenda';
import { montarPixCopiaECola } from '../utils/pixCopiaECola';

interface ProDashboardProps {
  userId: string;
  onNewOrcamento: () => void;
  onEditOrcamento: (id: string) => void;
  onViewServico: (id: string, opcoes?: { abrirRecebimento?: boolean }) => void;
  onNavigate: (view: string) => void;
}

// Cidade vazia em Ajustes cai neste padrão (campo 60 do Pix é obrigatório). Mesmo valor do ProServicoView.
const CIDADE_RECEBEDOR_PADRAO = 'BRASILIA';
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

// Status na voz do usuário (§8: texto colorido simples, sem pílula). Fallback = valor cru.
const ROTULO_STATUS_SERVICO: Record<string, { rotulo: string; cor: string }> = {
  PENDENTE: { rotulo: 'Agendado', cor: 'text-slate-700' },
  EM_ANDAMENTO: { rotulo: 'Em andamento', cor: 'text-blue-700' },
  BLOQUEADO: { rotulo: 'Bloqueado', cor: 'text-red-700' },
  CONCLUIDO: { rotulo: 'Concluído', cor: 'text-emerald-700' },
};
const ROTULO_STATUS_ORCAMENTO: Record<string, { rotulo: string; cor: string }> = {
  RASCUNHO: { rotulo: 'Rascunho', cor: 'text-slate-700' },
  ENVIADO: { rotulo: 'Enviado', cor: 'text-blue-700' },
  APROVADO: { rotulo: 'Aprovado', cor: 'text-emerald-700' },
  RECUSADO: { rotulo: 'Recusado', cor: 'text-red-700' },
};
const statusDe = (mapa: Record<string, { rotulo: string; cor: string }>, status: string) =>
  mapa[status] || { rotulo: status, cor: 'text-slate-700' };

// Linguagem visual do app (§16/§17): cartão, botão secundário e foco visível.
const CARTAO = 'bg-white border border-slate-200 rounded-[10px] p-4';
const AREA_CLICAVEL = 'w-full flex items-start justify-between gap-3 text-left rounded-[6px] hover:bg-slate-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600';
const BOTAO_SECUNDARIO = 'h-11 px-3 flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-[6px] font-medium text-sm transition-colors';
const VAZIO = 'text-center py-8 px-4 bg-white border border-dashed border-slate-300 rounded-[10px] text-sm text-slate-600';

const textoDiasAguardando =(dias: number | null) =>
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
  // Falha de rede vira aviso com saída — antes virava "R$ 0,00 / Nenhum serviço", que mente.
  const [erro, setErro] = React.useState<string | null>(null);
  const [verTodosOrcamentos, setVerTodosOrcamentos] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      setErro(null);
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
    } catch (error: any) {
      console.error('Erro ao buscar dados do dashboard:', error);
      setErro(error?.message || 'Sem conexão.');
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
      ? montarPixCopiaECola({ tipo: config.pix_key_type, chave: config.pix_key, valor, nome: config.template_header || '', cidade: config.cidade || CIDADE_RECEBEDOR_PADRAO })
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

  // Agenda (utils/proAgenda.ts): atrasados no topo de "Hoje"; sem data vai para o fim de "Próximos".
  const agenda = separarAgenda(servicos);
  const atrasados = new Set(agenda.atrasados.map(s => s.id));
  const servicosHoje = [...agenda.atrasados, ...agenda.hoje];
  const proximosServicos = [...agenda.proximos, ...agenda.semData];
  const ORCAMENTOS_VISIVEIS = 3;
  const orcamentosVisiveis = verTodosOrcamentos ? orcamentos : orcamentos.slice(0, ORCAMENTOS_VISIVEIS);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-sm text-slate-600">Carregando agenda…</span>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="bg-white border border-red-200 rounded-[10px] p-4 space-y-3" role="alert">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">Não foi possível carregar a agenda</h2>
            <p className="text-sm text-slate-700 mt-0.5">Confira a internet e tente de novo.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="w-full h-11 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[6px] font-medium text-sm transition-colors"
        >
          <RefreshCw className="w-4 h-4" aria-hidden />
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header — no computador quem mostra é a casca (ProModule) */}
      <div className="flex items-center justify-between md:hidden">
        <div>
          <h1 className="text-xl font-black text-slate-900">ÒPURA Pro</h1>
          <p className="text-xs font-semibold text-slate-600">Seu controle diário de campo</p>
        </div>
        <button
          type="button"
          onClick={fetchData}
          aria-label="Recarregar"
          title="Recarregar"
          className="w-11 h-11 flex items-center justify-center bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-[6px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <RefreshCw className="w-4 h-4" aria-hidden />
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
      <section aria-labelledby="titulo-hoje" className="space-y-3">
        <h2 id="titulo-hoje" className="text-sm font-semibold text-slate-900">Serviços para hoje</h2>
        {servicosHoje.length === 0 ? (
          <div className={VAZIO}>
            Nenhum serviço agendado para hoje.
          </div>
        ) : (
          <div className="space-y-3">
            {servicosHoje.map(s => {
              const st = statusDe(ROTULO_STATUS_SERVICO, s.status);
              return (
                <div key={s.id} className={`${CARTAO} space-y-3`}>
                  <button type="button" onClick={() => onViewServico(s.id)} className={AREA_CLICAVEL}>
                    <span className="min-w-0 space-y-1">
                      <span className="block font-semibold text-sm text-slate-900 truncate">
                        {s.pro_orcamentos?.pro_clientes?.nome || 'Cliente sem nome'}
                      </span>
                      {s.data_agendamento && (
                        <span className={`flex items-center gap-1 text-xs font-medium ${atrasados.has(s.id) ? 'text-red-700' : 'text-slate-700'}`}>
                          <Clock className="w-4 h-4 shrink-0" aria-hidden />
                          {atrasados.has(s.id) && 'Atrasado · '}
                          {new Date(s.data_agendamento).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      )}
                      <span className="block text-xs text-slate-600 truncate">
                        {s.pro_orcamentos?.descricao}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-600 min-w-0">
                        <MapPin className="w-4 h-4 shrink-0" aria-hidden />
                        <span className="truncate">{s.pro_orcamentos?.pro_clientes?.endereco || 'Sem endereço'}</span>
                      </span>
                    </span>
                    <span className="text-right space-y-1 shrink-0">
                      <span className="block font-semibold text-slate-900 text-sm tabular-nums">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.pro_orcamentos?.valor || 0)}
                      </span>
                      <span className={`block text-sm font-medium ${st.cor}`}>{st.rotulo}</span>
                    </span>
                  </button>
                  <div className="border-t border-slate-100 pt-3 flex justify-start">
                    <button
                      type="button"
                      onClick={() => handleWhatsAppConfirmarServico(s)}
                      className={BOTAO_SECUNDARIO}
                    >
                      <MessageCircle className="w-4 h-4" aria-hidden />
                      Confirmar no WhatsApp
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Serviços para Oferecer de Novo (Recorrência) */}
      {recorrentes.length > 0 && (
        <section aria-labelledby="titulo-recorrentes" className="space-y-3">
          <h2 id="titulo-recorrentes" className="text-sm font-semibold text-slate-900">
            Serviços para oferecer de novo
          </h2>
          <div className="space-y-3">
            {recorrentes.map(s => (
              <div
                key={s.id}
                className={`${CARTAO} flex items-center justify-between gap-3`}
              >
                <div className="space-y-1 min-w-0">
                  <span className="block font-semibold text-sm text-slate-900 truncate">
                    {s.pro_orcamentos?.pro_clientes?.nome}
                  </span>
                  <span className="block text-xs text-slate-700 font-medium truncate">
                    Revisão em: {new Date(s.proximo_agendamento).toLocaleDateString('pt-BR')}
                  </span>
                  <span className="block text-xs text-slate-600 truncate">
                    Serviço anterior: {s.pro_orcamentos?.descricao}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleWhatsAppRecorrencia(s)}
                  className={`${BOTAO_SECUNDARIO} shrink-0`}
                >
                  <MessageCircle className="w-4 h-4" aria-hidden />
                  Oferecer
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Orçamentos Recentes */}
      <section aria-labelledby="titulo-orcamentos" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="titulo-orcamentos" className="text-sm font-semibold text-slate-900">Orçamentos enviados</h2>
          <button
            type="button"
            onClick={onNewOrcamento}
            className="inline-flex items-center gap-1 min-h-11 px-2 text-sm font-medium text-blue-700 hover:text-blue-800"
          >
            <Plus className="w-4 h-4" aria-hidden />
            Criar
          </button>
        </div>
        {orcamentos.length === 0 ? (
          <div className={VAZIO}>
            Nenhum orçamento criado ainda.
          </div>
        ) : (
          <div className="space-y-3">
            {orcamentosVisiveis.map(o => {
              // Verifica se já tem OS correspondente
              const hasOS = servicos.find(s => s.orcamento_id === o.id);
              const st = statusDe(ROTULO_STATUS_ORCAMENTO, o.status);
              return (
                <div key={o.id} className={`${CARTAO} space-y-3`}>
                  <button
                    type="button"
                    onClick={() => hasOS ? onViewServico(hasOS.id) : onEditOrcamento(o.id)}
                    className={AREA_CLICAVEL}
                  >
                    <span className="min-w-0 space-y-1">
                      <span className="block font-semibold text-sm text-slate-900 truncate">
                        {o.pro_clientes?.nome || 'Cliente sem nome'}
                      </span>
                      <span className="block text-xs text-slate-600 truncate">
                        {o.descricao}
                      </span>
                      <span className="block text-xs text-slate-600">
                        Garantia: {o.garantia_dias ? `${o.garantia_dias} dias` : 'Não informada'}
                      </span>
                    </span>
                    <span className="text-right space-y-1 shrink-0">
                      <span className="block font-semibold text-slate-900 text-sm tabular-nums">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(o.valor)}
                      </span>
                      <span className={`block text-sm font-medium ${st.cor}`}>{st.rotulo}</span>
                    </span>
                  </button>
                  {o.status === 'ENVIADO' && (
                    <div className="border-t border-slate-100 pt-3 flex justify-start">
                      <button
                        type="button"
                        onClick={() => handleWhatsAppLembrarOrcamento(o)}
                        className={BOTAO_SECUNDARIO}
                      >
                        <MessageCircle className="w-4 h-4" aria-hidden />
                        Cobrar resposta
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {orcamentos.length > ORCAMENTOS_VISIVEIS && (
              <button
                type="button"
                onClick={() => setVerTodosOrcamentos(v => !v)}
                aria-expanded={verTodosOrcamentos}
                className="inline-flex items-center gap-1 min-h-11 px-2 text-sm font-medium text-blue-700 hover:text-blue-800"
              >
                {verTodosOrcamentos ? 'Mostrar só os 3 mais recentes' : `Ver todos os ${orcamentos.length} orçamentos`}
              </button>
            )}
          </div>
        )}
      </section>

      {/* Próximos Serviços */}
      {proximosServicos.length > 0 && (
        <section aria-labelledby="titulo-proximos" className="space-y-3">
          <h2 id="titulo-proximos" className="text-sm font-semibold text-slate-900">Próximos serviços</h2>
          <div className="space-y-3">
            {proximosServicos.map(s => (
              <div key={s.id} className={`${CARTAO} space-y-3`}>
                <button type="button" onClick={() => onViewServico(s.id)} className={AREA_CLICAVEL}>
                  <span className="min-w-0 space-y-1">
                    <span className="block font-semibold text-sm text-slate-900 truncate">
                      {s.pro_orcamentos?.pro_clientes?.nome}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-medium text-slate-700">
                      <Clock className="w-4 h-4 shrink-0" aria-hidden />
                      {s.data_agendamento
                        ? new Date(s.data_agendamento).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                        : 'Sem data marcada'}
                    </span>
                    <span className="block text-xs text-slate-600 truncate">
                      {s.pro_orcamentos?.descricao}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block font-semibold text-slate-900 text-sm tabular-nums">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.pro_orcamentos?.valor || 0)}
                    </span>
                  </span>
                </button>
                <div className="border-t border-slate-100 pt-3 flex justify-start">
                  <button
                    type="button"
                    onClick={() => handleWhatsAppConfirmarServico(s)}
                    className={BOTAO_SECUNDARIO}
                  >
                    <MessageCircle className="w-4 h-4" aria-hidden />
                    Confirmar no WhatsApp
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default ProDashboard;
