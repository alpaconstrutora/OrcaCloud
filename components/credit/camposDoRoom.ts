/**
 * Classes e textos dos campos de parâmetros da capacidade, compartilhados entre
 * o formulário do Credit Room e o painel "Simular parâmetros" da aba Capacidade.
 * Arquivo à parte (sem hook, store nem serviço) para a aba — que também roda no
 * portal do credor — não arrastar o formulário inteiro.
 */

/** Classes de campo/rótulo do formulário do Credit Room (h-9, rótulo sem caixa alta). */
export const campo = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';
export const rotulo = 'text-xs font-semibold text-slate-500';
/** Campo travado: o valor segue escuro (§32); o estado se diz pelo fundo, cursor e texto de apoio. */
export const campoTravado = `${campo} text-gray-900 disabled:bg-slate-50 disabled:cursor-not-allowed`;

export const MOTIVO_PRAZO_DA_OPERACAO = 'Vem do prazo da operação (Solicitação) — para mudar, altere o prazo lá ou deixe-o vazio.';
export const MOTIVO_CARENCIA_DA_OPERACAO = 'Vem da carência da operação (Solicitação) — para mudar, altere a carência lá ou deixe-a vazia.';
