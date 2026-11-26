// components/condominio/assembleia/comum.ts
// Peças comuns da tela da assembleia (Task A7): a régua do formulário (§21/§30),
// as cores de status (§8) e as contas que SÓ a tela faz para dizer o motivo de um
// botão desligado antes de chamar o banco. A regra que vale é a do banco (A2) —
// estas contas existem para o gestor ler o porquê sem precisar errar primeiro.
//
// ⚠️ Nada aqui sabe a organização: quem grava recebe `orgId` pronto de
// AssembleiaDetalheView (orgDoCondominio). A catraca orgDoCondominioGuard só lê a
// pasta de cima, então esta pasta não pode nem tocar no empreendimento cru.

import type {
    ItemAssembleia, OpcaoVoto, StatusAssembleia, UnidadeNaAssembleia, VotoAssembleia,
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

/** §8 — texto colorido, sem pílula. */
export const COR_STATUS: Record<StatusAssembleia, string> = {
    RASCUNHO: 'text-gray-600',
    CONVOCADA: 'text-blue-700',
    INSTALADA: 'text-indigo-700',
    ENCERRADA: 'text-emerald-700',
    CANCELADA: 'text-red-600',
};

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
