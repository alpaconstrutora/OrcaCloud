/**
 * Diretoria (ÒPURA CEO) — régua de formulário e pequenas regras de texto compartilhadas pelas
 * telas de `components/diretoria/`. Uma fonte só para a fila, a visão por responsável, a reunião,
 * o formulário de determinação e o cadastro de responsáveis não divergirem
 * (§17/§21/§30/§32 de docs/ui_ux_guia_unificado.md).
 */
import type { Severidade } from '../../utils/diretoria';
import { errorMessage } from '../../hooks/useOrgContext';

/** §21 — rótulo de campo. `block` porque `<label>` é inline e ignora o `space-y-1.5` (§30). */
export const ROTULO = 'block text-xs font-semibold text-slate-500';
/** §30/§32 — campo h-9, valor sempre escuro; cinza só no placeholder; desligado pelo fundo. */
export const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all';
/** Campo com erro de validação. */
export const COM_ERRO = 'border-red-300 focus:border-red-500 focus:ring-red-500/20';
/** §17 — botão primário compacto (o único azul sólido de cada bloco). */
export const BOTAO_PRIMARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 shrink-0';
/** Botão secundário (Cancelar, Responsáveis, Silenciados). */
export const BOTAO_SECUNDARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-white text-gray-700 border border-gray-200 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0';
/**
 * §9 — ação dominante de uma linha em texto azul (Cobrar, Atualizar, Concluir). Desligada
 * fica cinza sem hover; o motivo vai num `<span title>` em volta (§9.2).
 */
export const LINK_ACAO = 'inline-flex items-center gap-1 h-8 px-2 rounded-[6px] text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-all disabled:text-gray-500 disabled:hover:bg-transparent disabled:cursor-not-allowed whitespace-nowrap';

/** Bolinha da gravidade — o nome da gravidade vai sempre junto (texto ou `sr-only`): a cor nunca é o único sinal. */
export const COR_SEVERIDADE: Record<Severidade, string> = {
    critico: 'bg-red-500',
    atencao: 'bg-amber-400',
    acompanhar: 'bg-gray-400',
};

/** Sem responsável o grupo não tem para quem ir a tarefa — o botão desliga com este motivo. */
export const MOTIVO_SEM_RESPONSAVEL =
    'Ninguém responde por este grupo: cadastre o responsável da área (botão "Responsáveis") para poder cobrar.';

/** 'AAAA-MM-DD' + n dias, sem fuso (a data de hoje vem do banco). */
export function somarDias(iso: string, n: number): string {
    const ms = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
}

/** Instante (timestamp) → "dd/mm" no fuso de quem olha. Para datas puras use `dataBr`. */
export function dataCurta(instante: string): string {
    const d = new Date(instante);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** "há 3 dias" / "em 2 dias" / "hoje" — `dias` é o atraso; negativo = quanto falta. */
export function quandoEmDias(dias: number): string {
    if (dias === 0) return 'hoje';
    const n = Math.abs(dias);
    return dias > 0 ? `há ${n} ${n === 1 ? 'dia' : 'dias'}` : `em ${n} ${n === 1 ? 'dia' : 'dias'}`;
}

/**
 * Os dias de um item da fila. Aprovação parada já vencida ganha a marca "já venceu": desde 18/11 a
 * conta vencida que espera aprovação conta só ali, não em "Conta a pagar vencida".
 */
export function quandoDoItem(tipo: string, dias: number): string {
    return tipo === 'aprovacao_parada' && dias > 0 ? `já venceu ${quandoEmDias(dias)}` : quandoEmDias(dias);
}

export function plural(n: number, um: string, varios: string): string {
    return `${n} ${n === 1 ? um : varios}`;
}

/**
 * Erro de gravação legível. O 42501 da PERMISSÃO Diretoria (`_diretoria_exige_editar`) vira o motivo
 * em português; outro 42501 (ex.: create_task recusando quem não é membro) mostra a mensagem do banco
 * — antes todo 42501 virava "sem permissão", e o diretor lia que não tinha a permissão que tinha.
 */
export function mensagemDeErro(e: unknown, fallback: string): string {
    const erro = e as { code?: string; message?: string } | null;
    if (erro?.code === '42501' && /permissão "Diretoria \(CEO\)/.test(erro.message ?? '')) {
        return 'Sem a permissão "Diretoria (CEO) · editar" nesta organização. Peça a um administrador.';
    }
    return errorMessage(e, fallback);
}
