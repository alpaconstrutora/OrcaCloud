// components/condominio/assembleia/comum.ts
// Peças comuns da tela da assembleia (Task A7): a régua do formulário (§21/§30),
// as cores de status (§8) e as contas que SÓ a tela faz para dizer o motivo de um
// botão desligado antes de chamar o banco. A regra que vale é a do banco (A2) —
// estas contas existem para o gestor ler o porquê sem precisar errar primeiro.
//
// ⚠️ Nada aqui sabe a organização: quem grava é `ops` (B2 — gestor com orgDoCondominio,
// síndico pela Edge Function). A catraca orgDoCondominioGuard só lê a pasta de cima,
// então esta pasta não pode nem tocar no empreendimento cru.

import type {
    ImpedimentoUnidade, ItemAssembleia, OpcaoVoto, StatusAssembleia, UnidadeNaAssembleia, VotoAssembleia,
} from '../../../services/condominioAssembleiaService';

// ─── régua (§16, §21, §30, §32) ──────────────────────────────────────────────

export const ROTULO = 'block text-xs font-semibold text-slate-500';
export const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 '
    + 'placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none '
    + 'disabled:bg-gray-50 disabled:cursor-not-allowed';
export const AREA_DE_TEXTO = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 '
    + 'placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none';
/** §17 — o único azul sólido da linha. */
export const BOTAO_PRIMARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 '
    + 'font-medium text-[13px] transition-all active:scale-95 shrink-0 whitespace-nowrap '
    + 'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';
export const BOTAO_PERIGO = 'flex items-center gap-1.5 h-9 px-3.5 bg-red-600 text-white rounded-[6px] hover:bg-red-700 '
    + 'font-medium text-[13px] transition-all active:scale-95 shrink-0 whitespace-nowrap '
    + 'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';
export const BOTAO_SECUNDARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 '
    + 'rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 shrink-0 whitespace-nowrap '
    + 'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';
export const BOTAO_VOLTAR = 'h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all';
/** Motivo de botão desligado — à vista, não só no `title` (regra do usuário). */
export const MOTIVO = 'text-xs text-amber-700';
export const CARD = 'bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4';

// ─── acento (§24 — tela compartilhada app × portal) ──────────────────────────
// A tela da assembleia serve o gestor (app, 'indigo') e o síndico (Portal do Síndico,
// 'portal', coral). Só a COR DE IDENTIDADE muda (ação primária, foco, marcação, link);
// a cor que significa algo (status, impedida, aviso âmbar, perigo vermelho) é igual nos
// dois. Cada classe por extenso: o JIT do Tailwind não enxerga classe montada em runtime.

export type AcentoDaAssembleia = 'indigo' | 'portal';

export interface Acento {
    /** Botão da ação principal (§17 no app; PrimaryButton coral no portal). */
    primario: string;
    campo: string;
    areaDeTexto: string;
    /** Rádio e caixa de marcar (cor da marcação e do foco). */
    marca: string;
    /** Link de texto. */
    link: string;
    /** Botão de escolha marcado (a cédula da sala). */
    escolhida: string;
    spinner: string;
}

export const ACCENTS: Record<AcentoDaAssembleia, Acento> = {
    indigo: {
        primario: BOTAO_PRIMARIO,
        campo: CAMPO,
        areaDeTexto: AREA_DE_TEXTO,
        marca: 'text-blue-600 focus:ring-blue-500',
        link: 'text-blue-600 hover:text-blue-800',
        escolhida: 'border-blue-300 bg-blue-50 text-blue-700',
        spinner: 'text-blue-600',
    },
    portal: {
        primario: 'flex items-center gap-1.5 h-9 px-3.5 bg-[#E1553C] text-white rounded-[8px] hover:bg-[#C8452E] '
            + 'font-semibold text-[13px] transition-all active:scale-95 shrink-0 whitespace-nowrap '
            + 'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        campo: 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 '
            + 'placeholder:text-gray-400 focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C] outline-none '
            + 'disabled:bg-gray-50 disabled:cursor-not-allowed',
        areaDeTexto: 'w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 '
            + 'placeholder:text-gray-400 focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C] outline-none',
        marca: 'text-[#E1553C] focus:ring-[#E1553C]',
        link: 'text-[#C24428] hover:text-[#E1553C]',
        escolhida: 'border-[#F4B8A9] bg-[#FDEDE8] text-[#C24428]',
        spinner: 'text-[#E1553C]',
    },
};

/** §8 — texto colorido, sem pílula. */
export const COR_STATUS: Record<StatusAssembleia, string> = {
    RASCUNHO: 'text-gray-600',
    CONVOCADA: 'text-blue-700',
    INSTALADA: 'text-indigo-700',
    ENCERRADA: 'text-emerald-700',
    CANCELADA: 'text-red-600',
};

// ─── impedimento (R3 + A10) ──────────────────────────────────────────────────

/**
 * A10: sem cota cobrada pelo app, a regra automática não confere ninguém — o aviso (que não
 * bloqueia nada) sai nas gavetas Convocar e Instalar e no topo da seção Unidades.
 */
export const AVISO_COTAS_NAO_CONFERIDAS =
    'Este condomínio não tem cotas cobradas pelo Òpura: a inadimplência não é conferida automaticamente. '
    + 'Marque à mão a unidade impedida.';

/** O impedimento de agora, sem o unitId. */
export type ImpedimentoAgora = Pick<ImpedimentoUnidade, 'motivo' | 'origem'>;

/**
 * 'Impedida (marcada à mão): <motivo>' × 'Impedida: <motivo automático>'. "À mão", não "pelo
 * gestor": desde a B2 o síndico também marca, e impedimento_manual não guarda o papel.
 */
export const textoImpedimento = (i: ImpedimentoAgora): string =>
    i.origem === 'MANUAL' ? `Impedida (marcada à mão): ${i.motivo}` : `Impedida: ${i.motivo}`;

// ─── hora em Brasília ────────────────────────────────────────────────────────

const DIA_SP = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** 'AAAA-MM-DD' do instante no fuso de Brasília (o CI roda em UTC). */
export function diaBrasilia(iso: string | Date): string {
    return DIA_SP.format(typeof iso === 'string' ? new Date(iso) : iso);
}

const diaEmMs = (dia: string) => {
    const [a, m, d] = dia.split('-').map(Number);
    return Date.UTC(a, m - 1, d);
};

/** Dias de calendário (Brasília) entre hoje e a data marcada. Negativo = já passou. */
export function diasDeAntecedencia(iso: string, agora: Date = new Date()): number {
    return Math.round((diaEmMs(diaBrasilia(iso)) - diaEmMs(diaBrasilia(agora))) / 86_400_000);
}

const HORA_SP = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** ISO → valor de `<input type="datetime-local">` no relógio de Brasília. */
export function paraCampoDataHora(iso: string | null | undefined): string {
    if (!iso) return '';
    return `${diaBrasilia(iso)}T${HORA_SP.format(new Date(iso))}`;
}

/**
 * Valor do `datetime-local` (relógio de Brasília) → ISO com fuso. Brasília não tem
 * horário de verão desde 2019: o deslocamento é -03:00 o ano inteiro.
 */
export function deCampoDataHora(valor: string): string | null {
    const v = (valor ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
    return `${v}:00-03:00`;
}

// ─── cédula ──────────────────────────────────────────────────────────────────

/** Opções da cédula (R8): Aprovação = Sim · Não · Abstenção; Escolha = as cadastradas · Abstenção. */
export function opcoesDoItem(item: Pick<ItemAssembleia, 'tipo' | 'opcoes'>): OpcaoVoto[] {
    return item.tipo === 'APROVACAO' ? ['SIM', 'NAO', 'ABSTENCAO'] : [...(item.opcoes ?? []), 'ABSTENCAO'];
}

// ─── presença para a instalação (R3/R6) ──────────────────────────────────────

/** Folga do float: no banco a soma é numeric exato; aqui 8 × 0,00125 pode dar 0,010000000000000002. */
const FOLGA = 1e-12;

export interface Presentes {
    total: number;
    fracao: number;
    unidades: number;
    totalUnidades: number;
}

/**
 * Presentes APTOS agora — a mesma conta do banco ao Instalar (R6): presença na sala
 * (pessoalmente ou por procurador) OU voto pelo portal, e não impedida.
 */
export function presentesAptos(
    unidades: UnidadeNaAssembleia[], votos: VotoAssembleia[], impedidas: Set<string>,
): Presentes {
    const votouPeloPortal = new Set(votos.filter(v => v.origem === 'PORTAL').map(v => v.unitId));
    let fracao = 0;
    let n = 0;
    for (const u of unidades) {
        if (impedidas.has(u.unitId)) continue;
        if (u.presenca || votouPeloPortal.has(u.unitId)) { fracao += u.fracao; n += 1; }
    }
    return { total: unidades.reduce((s, u) => s + u.fracao, 0), fracao, unidades: n, totalUnidades: unidades.length };
}

/** 1ª convocação exige metade das frações (CC 1.352): 2·presentes ≥ total. */
export const temMetade = (p: Pick<Presentes, 'fracao' | 'total'>) => 2 * p.fracao >= p.total - FOLGA;
