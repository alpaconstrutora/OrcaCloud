import React from 'react';
import { History } from 'lucide-react';
import type { RiskAuditLog } from '../../types/risk';
import { RISK_ROTULO } from '../../types/risk';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { formatDateBR, formatDateTimeBR, formatMoney } from '../ui/Format';
import { ROTULO_CAMPO } from './riscosUi';

/**
 * Histórico da ficha (F1.11): `risk_audit_logs` — quem, quando, o quê, de → para.
 * Um evento por campo alterado (CA12, parte auditoria), gravado pelo `riskService`.
 * Tabela dentro de `Sheet` → `dense` (§6.9). Busca escopada pelo risco
 * (`searchScope`): some ao abrir outra ficha.
 */
const COLUNAS: StandardTableColumn[] = [
    { key: 'quando', label: 'Quando', sortable: true, width: 130 },
    { key: 'quem', label: 'Quem', sortable: true, width: 150 },
    { key: 'oque', label: 'O quê', sortable: true, width: 160 },
    { key: 'de', label: 'De', sortable: true, width: 170 },
    { key: 'para', label: 'Para', sortable: true, width: 170 },
];

const ACAO: Record<RiskAuditLog['action'], string> = {
    create: 'Criação', update: 'Alteração', delete: 'Exclusão', evaluate: 'Avaliação', close: 'Encerramento',
    reopen: 'Reabertura', link: 'Vínculo', unlink: 'Vínculo desfeito',
};
const ENTIDADE: Record<RiskAuditLog['entity_type'], string> = {
    risk: 'Ficha', evaluation: 'Avaliação', action: 'Ação', catalog: 'Catálogo', config: 'Configuração',
};

/** Valor legível: rótulo do enum quando o campo tem um, data em dd/mm/aaaa, lista com vírgula. */
export function valorLegivel(campo: string | null, v: unknown): string {
    if (v == null || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (Array.isArray(v)) {
        if (!v.length) return '—';
        const mapa = campo === 'dimensoes' ? RISK_ROTULO.dimensao : null;
        return v.map(x => (mapa ? (mapa as Record<string, string>)[String(x)] ?? String(x) : String(x))).join(', ');
    }
    if (typeof v === 'object') {
        const o = v as Record<string, unknown>;
        if ('pontuacao' in o) return `${o.tipo === 'residual' ? 'Residual' : 'Inerente'}: ${o.probabilidade} × ${o.impacto} = ${o.pontuacao}`;
        return JSON.stringify(v);
    }
    const s = String(v);
    const enumDe: Record<string, Record<string, string>> = {
        status: { ...RISK_ROTULO.status, ...RISK_ROTULO.acaoStatus },
        escopo: RISK_ROTULO.escopo, estrategia: RISK_ROTULO.estrategia, fase: RISK_ROTULO.fase, eficacia: RISK_ROTULO.eficacia,
        tipo: { ameaca: 'Ameaça', oportunidade: 'Oportunidade', preventiva: 'Preventiva', resposta: 'Resposta' },
    };
    if (campo && enumDe[campo]?.[s]) return enumDe[campo][s];
    if (campo && /custo/.test(campo) && !Number.isNaN(Number(s))) return formatMoney(Number(s));
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return formatDateBR(s);
    return s;
}

export const RiscoHistorico: React.FC<{ riskId: string; eventos: RiskAuditLog[]; carregando: boolean }> = ({ riskId, eventos, carregando }) => {
    const oQue = (e: RiskAuditLog) => {
        const base = e.field_name ? (ROTULO_CAMPO[e.field_name] ?? e.field_name) : ACAO[e.action];
        return e.entity_type === 'risk' ? base : `${ENTIDADE[e.entity_type]} · ${base}`;
    };
    return (
        <StandardTable<RiskAuditLog>
            storageKey="riscos:ficha:historico"
            searchScope={riskId}
            columns={COLUNAS}
            rows={eventos}
            rowKey={e => e.id}
            loading={carregando}
            dense
            maxHeight="60vh"
            defaultSort={{ column: 'quando', direction: 'desc' }}
            searchText={e => `${e.user_email ?? ''} ${oQue(e)} ${valorLegivel(e.field_name, e.old_value)} ${valorLegivel(e.field_name, e.new_value)} ${e.entity_label ?? ''}`}
            searchPlaceholder="Buscar no histórico..."
            sortValue={(k, e) => k === 'quando' ? e.created_at : k === 'quem' ? e.user_email ?? '' : k === 'oque' ? oQue(e)
                : k === 'de' ? valorLegivel(e.field_name, e.old_value) : valorLegivel(e.field_name, e.new_value)}
            renderCell={(k, e) => {
                switch (k) {
                    case 'quando': return <span className="text-sm font-normal text-gray-600">{formatDateTimeBR(e.created_at)}</span>;
                    case 'quem': return <span className="block truncate text-sm font-normal text-gray-700" title={e.user_email ?? undefined}>{e.user_email ?? '—'}</span>;
                    case 'oque': {
                        const t = `${ACAO[e.action]} · ${oQue(e)}${e.reason ? ` — ${e.reason}` : ''}`;
                        return <span className="block truncate text-sm font-normal text-gray-700" title={t}>{oQue(e)}</span>;
                    }
                    case 'de': { const t = valorLegivel(e.field_name, e.old_value); return <span className="block truncate text-sm font-normal text-gray-600" title={t}>{t}</span>; }
                    case 'para': {
                        const t = e.action === 'create' || e.action === 'delete' ? ACAO[e.action] : valorLegivel(e.field_name, e.new_value);
                        return <span className="block truncate text-sm font-normal text-gray-700" title={t}>{t}</span>;
                    }
                    default: return null;
                }
            }}
            empty={{ icon: <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum evento ainda', subtitle: 'Cada alteração da ficha, avaliação e ação aparece aqui com o valor antigo e o novo.' }}
        />
    );
};

export default RiscoHistorico;
