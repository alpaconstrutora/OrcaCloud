import React, { useMemo } from 'react';
import HierarchicalSelect, { HierarchicalSelectItem } from './HierarchicalSelect';

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
    hoverCls?: string;
}

/** Itens do drawer a partir da lista crua. Exportado para quem precisa da
 *  mesma resolução fora do seletor (ex.: rótulo em célula). */
export function costCenterSelectItems(costCenters: CostCenterOption[]): HierarchicalSelectItem[] {
    const porId = new Map(costCenters.map(c => [c.id, c]));
    return costCenters.map(cc => {
        const parentId = cc.parent_id ?? null;
        const parentName = cc.parent_name ?? (parentId ? porId.get(parentId)?.name ?? null : null);
        // `listCostCenters` já devolve "Grupo > Filho"; o grupo vira a linha de
        // cima / o prefixo em cinza, então o nome volta a ser só o filho.
        const prefixo = parentName ? `${parentName} > ` : null;
        const name = prefixo && cc.name.startsWith(prefixo) ? cc.name.slice(prefixo.length) : cc.name;
        return { id: cc.id, code: cc.code ?? null, name, parentId, parentName, fullName: cc.name };
    });
}

const CostCenterSelect: React.FC<Props> = ({
    costCenters, value, onChange, placeholder = '—', valueField = 'id', size, disabled,
    hoverCls = 'hover:bg-gray-50',
}) => {
    const items = useMemo(() => costCenterSelectItems(costCenters), [costCenters]);
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
        />
    );
};

export default CostCenterSelect;
