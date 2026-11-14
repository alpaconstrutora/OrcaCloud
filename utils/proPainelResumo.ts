/**
 * Números e listas do painel do ÒPURA Pro — e a mensagem de cobrança.
 *
 * Desde 14/11/2026 (passo 2 da crítica de design, docs/planos/2026-11-14-opura-pro-critica.md):
 *  - Recebido no mês = serviços com `pago_em` neste mês (o dinheiro que entrou);
 *  - A receber       = CONCLUIDO e ainda sem `pago_em` (o que o autônomo tem de ir buscar);
 *  - Em execução     = PENDENTE/EM_ANDAMENTO/BLOQUEADO + orçamento APROVADO ainda sem OS.
 * Antes, "Faturamento" somava o concluído sem saber se fora pago e "A receber" deixava
 * de fora justamente o concluído não pago.
 *
 * Testes: `__tests__/proPainelResumo.test.ts`.
 */

type ServicoDoPainel = {
  id: string;
  orcamento_id: string;
  status: string;
  concluido_em?: string | null;
  pago_em?: string | null;
  pro_orcamentos?: { valor?: number | string | null } | null;
};

type OrcamentoDoPainel = { id: string; status: string; valor?: number | string | null };

export const FORMAS_DE_PAGAMENTO = [
  { valor: 'PIX', rotulo: 'Pix' },
  { valor: 'DINHEIRO', rotulo: 'Dinheiro' },
  { valor: 'CARTAO', rotulo: 'Cartão' },
  { valor: 'TRANSFERENCIA', rotulo: 'Transferência' },
] as const;

export type FormaDePagamento = (typeof FORMAS_DE_PAGAMENTO)[number]['valor'];

export const rotuloDaForma = (forma?: string | null) =>
  FORMAS_DE_PAGAMENTO.find(f => f.valor === forma)?.rotulo ?? '';

const valorDe = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v : 0;
};

const STATUS_EM_EXECUCAO = new Set(['PENDENTE', 'EM_ANDAMENTO', 'BLOQUEADO']);

export function resumirPainelPro<S extends ServicoDoPainel>(
  servicos: S[],
  orcamentos: OrcamentoDoPainel[],
  agora: Date = new Date(),
) {
  let recebidoNoMes = 0;
  let aReceber = 0;
  let emExecucao = 0;
  const aguardandoPagamento: S[] = [];

  for (const s of servicos) {
    const valor = valorDe(s.pro_orcamentos?.valor);
    if (s.pago_em) {
      const pago = new Date(s.pago_em);
      if (pago.getFullYear() === agora.getFullYear() && pago.getMonth() === agora.getMonth()) recebidoNoMes += valor;
    } else if (s.status === 'CONCLUIDO') {
      aReceber += valor;
      aguardandoPagamento.push(s);
    }
    if (STATUS_EM_EXECUCAO.has(s.status)) emExecucao += valor;
  }

  const comOS = new Set(servicos.map(s => s.orcamento_id));
  for (const o of orcamentos) {
    if (o.status === 'APROVADO' && !comOS.has(o.id)) emExecucao += valorDe(o.valor);
  }

  // O mais antigo primeiro: quem espera há mais tempo é quem se cobra primeiro.
  aguardandoPagamento.sort((a, b) => (a.concluido_em || '').localeCompare(b.concluido_em || ''));

  return { recebidoNoMes, aReceber, emExecucao, aguardandoPagamento };
}

/** Dias de calendário entre a data e hoje (0 = hoje). */
export function diasDesde(iso: string | null | undefined, agora: Date = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const inicio = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  return Math.max(0, Math.round((hoje - inicio) / 86_400_000));
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export function mensagemDeCobranca(args: { cliente: string; descricao: string; valor: number; pixCopiaECola?: string }) {
  const linhas = [
    `Olá, ${args.cliente || 'tudo bem'}! O serviço de *${args.descricao || 'manutenção'}* foi concluído.`,
    '',
    `*Valor:* ${brl(args.valor)}`,
  ];
  if (args.pixCopiaECola) {
    linhas.push('', 'Para pagar pelo Pix, copie o código abaixo e cole no app do seu banco (Pix Copia e Cola):', '', args.pixCopiaECola);
  }
  linhas.push('', 'Obrigado pela confiança!');
  return linhas.join('\n');
}

export function linkWhatsApp(telefone: string | null | undefined, mensagem: string) {
  const digitos = (telefone || '').replace(/\D/g, '');
  const numero = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
