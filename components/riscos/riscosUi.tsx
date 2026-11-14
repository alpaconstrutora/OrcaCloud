/**
 * Módulo Riscos — régua de formulário e peças pequenas compartilhadas pelas telas
 * de `components/riscos/`. Uma fonte só para não divergir entre a ficha, a
 * avaliação, a ação e o catálogo (§21/§30/§32 de docs/ui_ux_guia_unificado.md).
 */
import React from 'react';
import { Flame } from 'lucide-react';
import { useStore } from '../../store/useStore';
import type { OrganizationMember } from '../../types/users';
import type { RiskNivel } from '../../types/risk';
import { RISK_ROTULO } from '../../types/risk';
import { COR_TEXTO_NIVEL } from '../../utils/riskScoring';

/** §21 — rótulo de campo. `block` porque `<label>` é inline e ignora o `space-y-1.5` (§30). */
export const ROTULO = 'block text-xs font-semibold text-slate-500';
/** §30/§32 — campo h-9, valor sempre escuro; cinza só no placeholder; desligado pelo fundo. */
export const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all';
/** Área de texto: sem h-9 (§30, "textarea não leva h-9"). */
export const AREA = 'w-full px-3 py-2 min-h-[72px] bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all';
/** Campo com erro (CA03 — validação por campo, UI_PATTERNS §6.4). */
export const COM_ERRO = 'border-red-300 focus:border-red-500 focus:ring-red-500/20';
/** §17 — botão primário compacto. */
export const BOTAO_PRIMARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 shrink-0';
/** Botão secundário (Voltar, Cancelar, ações de apoio). */
export const BOTAO_SECUNDARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-white text-gray-700 border border-gray-200 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0';
/** Ação destrutiva/crítica (encerrar, excluir) — vermelho só aqui (UI_PATTERNS §6.1). */
export const BOTAO_PERIGO = 'flex items-center gap-1.5 h-9 px-3.5 bg-white text-red-600 border border-red-200 rounded-[6px] hover:bg-red-50 font-medium text-[13px] transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0';

/** Mensagem de erro sob o campo (§6.4 do UI_PATTERNS). */
export const ErroDoCampo: React.FC<{ id: string; erro?: string }> = ({ id, erro }) =>
    erro ? <p id={id} className="text-xs text-red-600 mt-1">{erro}</p> : null;

/**
 * Nível como TEXTO colorido (§8 — sem pílula, sem fundo). O gatilho crítico (CA04)
 * aparece como ícone + texto ao lado, para a cor nunca ser o único sinal.
 */
export const NivelTexto: React.FC<{ nivel: RiskNivel | null; gatilho?: boolean; className?: string }> = ({ nivel, gatilho, className = '' }) => {
    if (!nivel) return <span className={`text-sm font-normal text-gray-500 ${className}`}>Sem avaliação</span>;
    return (
        <span className={`inline-flex items-center gap-1 whitespace-nowrap text-sm font-normal ${COR_TEXTO_NIVEL[nivel]} ${className}`}
            title={gatilho ? 'Gatilho crítico: tratado como crítico qualquer que seja a pontuação' : undefined}>
            {gatilho && <Flame className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
            {RISK_ROTULO.nivel[nivel]}
            {gatilho && <span className="text-red-700">· gatilho</span>}
        </span>
    );
};

/** Probabilidade 1–5 com o nome da escala (seção 3.3 da especificação). */
export const ROTULO_PROBABILIDADE: Record<number, string> = {
    1: 'Raro', 2: 'Improvável', 3: 'Possível', 4: 'Provável', 5: 'Quase certo',
};

/** Rótulo de campo da ficha, para o Histórico (auditoria grava o nome da coluna). */
export const ROTULO_CAMPO: Record<string, string> = {
    titulo: 'Título', tipo: 'Tipo', causa: 'Causa', evento: 'Evento', consequencia: 'Consequência', tags: 'Tags',
    dimensoes: 'Dimensões', category_id: 'Categoria', escopo: 'Escopo', empreendimento_id: 'Empreendimento',
    project_id: 'Obra', contract_id: 'Contrato', frente: 'Frente', localizacao: 'Localização', fase: 'Fase',
    partes_afetadas: 'Partes afetadas', owner_user_id: 'Dono (id)', owner_nome: 'Dono', avaliador_user_id: 'Avaliador',
    aprovador_user_id: 'Aprovador', data_identificacao: 'Data de identificação', proxima_revisao: 'Próxima revisão',
    controles_existentes: 'Controles existentes', estrategia: 'Estratégia', plano_resposta: 'Plano de resposta',
    contingencia: 'Contingência', justificativa_aceite: 'Justificativa do aceite', status: 'Status',
    encerramento_motivo: 'Motivo do encerramento', gatilho_critico: 'Gatilho crítico', gatilho_motivo: 'Motivo do gatilho',
    sst_document_tipo: 'Tipo do documento do SST', sst_document_id: 'Documento do SST',
    // ações
    descricao: 'Descrição', responsavel_user_id: 'Responsável (id)', responsavel_nome: 'Responsável', prazo: 'Prazo',
    custo_previsto: 'Custo previsto', custo_realizado: 'Custo realizado', concluida_em: 'Concluída em',
    evidencia_url: 'Evidência (link)', evidencia_descricao: 'Evidência (descrição)', eficacia: 'Eficácia',
    eficacia_observacao: 'Observação da eficácia',
};

/** Data local de hoje + N dias, "AAAA-MM-DD" (sem `toISOString`, que vira o dia seguinte à noite em UTC-3). */
export function diasAPartirDeHoje(n: number, agora: Date = new Date()): string {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Membros da organização DO RISCO que podem ser dono/responsável: só quem tem conta
 * (`userId`) — convite antigo só por e-mail não tem `auth.users.id` para gravar.
 */
export function useMembrosComConta(orgId: string | null): (OrganizationMember & { userId: string })[] {
    const organizations = useStore(s => s.organizations);
    return React.useMemo(() => {
        if (!orgId) return [];
        const membros = organizations.find(o => o.id === orgId)?.members ?? [];
        return membros
            .filter((m): m is OrganizationMember & { userId: string } => !!m.userId)
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }, [organizations, orgId]);
}

/** O membro que sou eu nesta organização (para "dono" sugerido e autor da avaliação). */
export function useEuNaOrg(orgId: string | null): (OrganizationMember & { userId: string }) | null {
    const membros = useMembrosComConta(orgId);
    const email = useStore(s => s.currentProfile.email)?.toLowerCase();
    const userId = useStore(s => s.session?.user?.id);
    return React.useMemo(
        () => membros.find(m => m.userId === userId || (!!email && m.email?.toLowerCase() === email)) ?? null,
        [membros, userId, email],
    );
}

/**
 * Obras da organização do risco. `useStore().projects` já é só OBRA e sem projeto de
 * sistema (REGRAS #2/#3) — aqui só se recorta a organização. A coluna nativa
 * `organization_id` vem antes de `settings.organizationId`: obra ligada a empresa
 * só tem a organização na coluna.
 */
export function useObrasDaOrg(orgId: string | null): { id: string; name: string }[] {
    const projects = useStore(s => s.projects);
    return React.useMemo(() => projects
        .filter(p => !!p.id && (!orgId || (p.organization_id ?? p.settings?.organizationId) === orgId))
        .map(p => ({ id: p.id as string, name: p.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [projects, orgId]);
}

/** Lista "uma por linha" ⇄ array (catálogo próprio). */
export const linhasParaLista = (t: string) => t.split('\n').map(s => s.trim()).filter(Boolean);
export const listaParaLinhas = (l: string[] | null | undefined) => (l ?? []).join('\n');
