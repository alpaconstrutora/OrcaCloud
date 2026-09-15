import React, { useMemo } from 'react';
import HierarchicalSelect, { HierarchicalSelectItem } from './HierarchicalSelect';
import { useStore } from '../store/useStore';

/**
 * Seletor de Plano de Contas — irmão do `CostCenterSelect` (2026-09-15).
 *
 * Abre o mesmo drawer lateral com busca, e a lista tem o MESMO desenho da
 * tela Minha Organização › Centro de Custo: accordion por nível (chevron),
 * código em texto simples, sem badge colorido. A diferença é só de onde vem
 * a hierarquia: o plano de contas não tem `parent_id`, ela está no código
 * pontilhado ("1.2.3" é filho de "1.2", que é filho de "1"). Resolvemos isso
 * aqui, uma vez, e o `HierarchicalSelect` desenha a árvore — com quantos
 * níveis houver.
 *
 * Tela nova usa este componente e nasce no padrão; não monte os itens à mão.
 */
export interface PlanoContasOption {
    id: string;
    name: string;
    code?: string | null;
    /** Em "Todas as organizações" cada org tem o próprio "1.1.1" — a
     *  hierarquia se resolve dentro da mesma org quando o campo vem. */
    organization_id?: string | null;
}

interface Props {
    planoContas: PlanoContasOption[];
    value: string;
    onChange: (value: string) => void;
    /** Texto do campo vazio e da primeira linha ("limpar") do drawer. */
    placeholder?: string;
    size?: 'md' | 'sm';
    disabled?: boolean;
    /** Gatilho de célula de tabela — ver HierarchicalSelect. */
    triggerClassName?: string;
    compact?: boolean;
    fallbackLabel?: string;
    hoverCls?: string;
}

/** Itens do drawer a partir da lista crua: pai = a conta cujo código é o
 *  deste sem o último segmento (sobe quantos segmentos precisar se houver
 *  buraco na numeração — "1.2.3.9" sem "1.2.3" pendura em "1.2").
 *
 *  Quando a lista junta MAIS DE UMA organização ("Todas as organizações"),
 *  cada org tem o próprio "1", "1.1", "1.1.1" — lado a lado parecem itens
 *  duplicados (reportado em 2026-09-15). Aí a árvore ganha um nível acima:
 *  um cabeçalho por organização (não selecionável), com o plano dela dentro
 *  — o mesmo que a tela Minha Organização › Plano de Contas faz com a coluna
 *  Organização. `orgNames` dá o nome; sem ele o cabeçalho sai "Organização". */
export function planoContasSelectItems(
    planoContas: PlanoContasOption[],
    orgNames: ReadonlyMap<string, string> = new Map(),
): HierarchicalSelectItem[] {
    const chave = (org: string | null | undefined, code: string) => `${org ?? ''}|${code}`;
    const porCodigo = new Map<string, PlanoContasOption>();
    for (const pc of planoContas) {
        const code = pc.code?.trim();
        if (code && !porCodigo.has(chave(pc.organization_id, code))) porCodigo.set(chave(pc.organization_id, code), pc);
    }
    const orgs = [...new Set(planoContas.map(pc => pc.organization_id ?? ''))];
    const agruparPorOrg = orgs.length > 1;
    const orgNodeId = (org: string | null | undefined) => `org:${org ?? ''}`;

    const itens: HierarchicalSelectItem[] = planoContas.map(pc => {
        let pai: PlanoContasOption | null = null;
        const partes = (pc.code?.trim() ?? '').split('.').filter(Boolean);
        while (partes.length > 1 && !pai) {
            partes.pop();
            pai = porCodigo.get(chave(pc.organization_id, partes.join('.'))) ?? null;
        }
        if (pai?.id === pc.id) pai = null;
        if (pai) return { id: pc.id, code: pc.code ?? null, name: pc.name, parentId: pai.id, parentName: pai.name };
        if (agruparPorOrg) {
            return { id: pc.id, code: pc.code ?? null, name: pc.name, parentId: orgNodeId(pc.organization_id), parentName: orgNames.get(pc.organization_id ?? '') ?? 'Organização' };
        }
        return { id: pc.id, code: pc.code ?? null, name: pc.name, parentId: null, parentName: null };
    });
    if (!agruparPorOrg) return itens;
    const cabecalhos: HierarchicalSelectItem[] = orgs.map(org => ({
        id: orgNodeId(org), code: null, name: orgNames.get(org) ?? 'Organização', parentId: null, parentName: null, selecionavel: false,
    }));
    return [...cabecalhos, ...itens];
}

const PlanoContasSelect: React.FC<Props> = ({
    planoContas, value, onChange, placeholder = '—', size, disabled,
    triggerClassName, compact, fallbackLabel,
    hoverCls = 'hover:bg-gray-50',
}) => {
    const organizations = useStore(s => s.organizations);
    const orgNames = useMemo(() => new Map(organizations.map(o => [o.id, o.name])), [organizations]);
    const items = useMemo(() => planoContasSelectItems(planoContas, orgNames), [planoContas, orgNames]);
    return (
        <HierarchicalSelect
            items={items}
            value={value}
            onChange={onChange}
            valueField="id"
            placeholder={placeholder}
            hoverCls={hoverCls}
            panelVariant="drawer"
            agrupado
            drawerTitle="Selecionar Plano de Contas"
            drawerDescription="Busque por código ou nome da conta."
            searchPlaceholder="Buscar por código ou nome da conta..."
            size={size}
            disabled={disabled}
            triggerClassName={triggerClassName}
            compact={compact}
            fallbackLabel={fallbackLabel}
        />
    );
};

export default PlanoContasSelect;
