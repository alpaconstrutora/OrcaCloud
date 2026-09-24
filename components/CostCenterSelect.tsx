import React, { useMemo } from 'react';
import HierarchicalSelect, { HierarchicalSelectItem } from './HierarchicalSelect';
import { useStore } from '../store/useStore';

/**
 * Seletor de Centro de Custo — o padrão do app inteiro (2026-09-10, ver
 * `docs/planos/2026-09-10-seletor-centro-de-custo-padrao.md`).
 *
 * Abre um drawer lateral com busca, e a lista tem o MESMO desenho da tela
 * Minha Organização › Centro de Custo (`CostCenterModule`): accordion por
 * grupo (chevron), código em texto simples, sem badge colorido; buscando,
 * lista chata com o grupo em cinza antes do nome.
 *
 * Aceita a lista como cada service devolve — `financialRegistryService.
 * listCostCenters` (nome já achatado "Grupo > Filho" + `parent_name`),
 * `costCenterService.list` (`CostCenterV2`, só `parent_id`) ou
 * `payrollService.listCostCenters` — e resolve grupo/filho aqui, uma vez.
 * Tela nova usa este componente e nasce no padrão; não monte os itens à mão.
 */
export interface CostCenterOption {
    id: string;
    name: string;
    code?: string | null;
    parent_id?: string | null;
    parent_name?: string | null;
    /** Quando a lista junta mais de uma org (conta que "atende também" outras), a
     *  árvore ganha um cabeçalho por organização — mesmo desenho do PlanoContasSelect. */
    organization_id?: string | null;
    /** `false` = só agrupa, não é escolhível (clicar abre/fecha os filhos).
     *  Default: escolhível, que é como todo chamador anterior se comporta.
     *  Existe para quem monta uma lista PARCIAL da árvore e precisa incluir o
     *  grupo só para o accordion existir — caso do vínculo de condomínio, em
     *  que o grupo não pode virar o centro de custo do caixa. */
    selecionavel?: boolean;
}

interface Props {
    costCenters: CostCenterOption[];
    value: string;
    onChange: (value: string) => void;
    /** Texto do campo vazio e da primeira linha ("limpar") do drawer. */
    placeholder?: string;
    /** 'id' (padrão) grava o UUID. 'name' grava o nome ACHATADO "Grupo > Filho"
     *  — só para o campo legado em texto (`FinancialOrderDetails`). */
    valueField?: 'id' | 'name';
    size?: 'md' | 'sm';
    disabled?: boolean;
    /** Gatilho de célula de tabela — ver HierarchicalSelect. */
    triggerClassName?: string;
    compact?: boolean;
    fallbackLabel?: string;
    hoverCls?: string;
}

/** Itens do drawer a partir da lista crua. Exportado para quem precisa da
 *  mesma resolução fora do seletor (ex.: rótulo em célula). */
export function costCenterSelectItems(costCenters: CostCenterOption[], orgNames: ReadonlyMap<string, string> = new Map()): HierarchicalSelectItem[] {
    const porId = new Map(costCenters.map(c => [c.id, c]));
    const orgs = [...new Set(costCenters.map(c => c.organization_id ?? ''))];
    const agruparPorOrg = orgs.length > 1;
    const orgNodeId = (org: string | null | undefined) => `org:${org ?? ''}`;
    const itens: HierarchicalSelectItem[] = costCenters.map(cc => {
        const parentId = cc.parent_id ?? null;
        const parentName = cc.parent_name ?? (parentId ? porId.get(parentId)?.name ?? null : null);
        // `listCostCenters` já devolve "Grupo > Filho"; o grupo vira a linha de
        // cima / o prefixo em cinza, então o nome volta a ser só o filho.
        const prefixo = parentName ? `${parentName} > ` : null;
        const name = prefixo && cc.name.startsWith(prefixo) ? cc.name.slice(prefixo.length) : cc.name;
        if (!parentId && agruparPorOrg) {
            return { id: cc.id, code: cc.code ?? null, name, parentId: orgNodeId(cc.organization_id), parentName: orgNames.get(cc.organization_id ?? '') ?? 'Organização', fullName: cc.name, selecionavel: cc.selecionavel };
        }
        return { id: cc.id, code: cc.code ?? null, name, parentId, parentName, fullName: cc.name, selecionavel: cc.selecionavel };
    });
    if (!agruparPorOrg) return itens;
    const cabecalhos: HierarchicalSelectItem[] = orgs.map(org => ({
        id: orgNodeId(org), code: null, name: orgNames.get(org) ?? 'Organização', parentId: null, parentName: null, selecionavel: false,
    }));
    return [...cabecalhos, ...itens];
}

const CostCenterSelect: React.FC<Props> = ({
    costCenters, value, onChange, placeholder = '—', valueField = 'id', size, disabled,
    triggerClassName, compact, fallbackLabel,
    hoverCls = 'hover:bg-gray-50',
}) => {
    const organizations = useStore(s => s.organizations);
    const orgNames = useMemo(() => new Map(organizations.map(o => [o.id, o.name])), [organizations]);
    const items = useMemo(() => costCenterSelectItems(costCenters, orgNames), [costCenters, orgNames]);
    return (
        <HierarchicalSelect
            items={items}
            value={value}
            onChange={onChange}
            valueField={valueField}
            placeholder={placeholder}
            hoverCls={hoverCls}
            panelVariant="drawer"
            drawerTitle="Selecionar Centro de Custo"
            drawerDescription="Busque por código, grupo ou centro de custo."
            searchPlaceholder="Buscar por código, grupo ou centro de custo..."
            size={size}
            disabled={disabled}
            triggerClassName={triggerClassName}
            compact={compact}
            fallbackLabel={fallbackLabel}
        />
    );
};

export default CostCenterSelect;
