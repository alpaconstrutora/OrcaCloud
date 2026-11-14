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
     *  Sem valor: GRUPO (`parent_id === null`) não é escolhível, centro de custo é
     *  — grupo não recebe lançamento (09/11/2026; o banco também recusa, gatilho
     *  `trg_cc_bloquear_lancamento_em_grupo`). `permitirGrupo` no seletor libera
     *  para filtro/relatório. Lista sem `parent_id` (campo ausente) não sabe quem
     *  é grupo e deixa tudo escolhível. */
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
    /** `id` do rótulo visível — ver HierarchicalSelect. */
    labelledBy?: string;
    disabled?: boolean;
    /** Gatilho de célula de tabela — ver HierarchicalSelect. */
    triggerClassName?: string;
    compact?: boolean;
    fallbackLabel?: string;
    hoverCls?: string;
    /** Linha de "limpar" com rótulo/valor próprios — ver HierarchicalSelect. */
    clearLabel?: string;
    clearValue?: string;
    /** Grupo escolhível — SÓ para filtro e relatório ("ver tudo do grupo Obra").
     *  Campo que grava lançamento nunca passa isto: grupo não recebe lançamento. */
    permitirGrupo?: boolean;
}

/** Itens do drawer a partir da lista crua. Exportado para quem precisa da
 *  mesma resolução fora do seletor (ex.: rótulo em célula). */
export function costCenterSelectItems(
    todos: CostCenterOption[],
    orgNames: ReadonlyMap<string, string> = new Map(),
    opts: { permitirGrupo?: boolean; /** id (ou nome, com valueField 'name') gravado no campo — nunca some. */ valorAtual?: string } = {},
): HierarchicalSelectItem[] {
    const selecionavelDe = (cc: CostCenterOption): boolean | undefined =>
        cc.selecionavel ?? (!opts.permitirGrupo && cc.parent_id === null ? false : undefined);
    // Grupo sem nenhum centro de custo dentro e que não pode ser escolhido não tem o que
    // oferecer: abria para o vazio e parecia um centro de custo que "não foi excluído"
    // (13/11/2026 — "001 Condomínio" do Condomínio Portinari, cujo filho tinha sido
    // excluído; a tela Centro de Custo agrupada não mostra grupo vazio, o drawer mostrava).
    // Fica se for o valor gravado no campo, para o gatilho não perder o rótulo.
    const temFilho = new Set(todos.map(c => c.parent_id).filter(Boolean));
    const costCenters = todos.filter(cc =>
        !(cc.parent_id === null && !temFilho.has(cc.id) && selecionavelDe(cc) === false)
        || (!!opts.valorAtual && (cc.id === opts.valorAtual || cc.name === opts.valorAtual)),
    );
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
            return { id: cc.id, code: cc.code ?? null, name, parentId: orgNodeId(cc.organization_id), parentName: orgNames.get(cc.organization_id ?? '') ?? 'Organização', fullName: cc.name, selecionavel: selecionavelDe(cc) };
        }
        return { id: cc.id, code: cc.code ?? null, name, parentId, parentName, fullName: cc.name, selecionavel: selecionavelDe(cc) };
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
    labelledBy,
    clearLabel, clearValue, permitirGrupo,
}) => {
    const organizations = useStore(s => s.organizations);
    const orgNames = useMemo(() => new Map(organizations.map(o => [o.id, o.name])), [organizations]);
    const items = useMemo(() => costCenterSelectItems(costCenters, orgNames, { permitirGrupo, valorAtual: value }), [costCenters, orgNames, permitirGrupo, value]);
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
            clearLabel={clearLabel}
            clearValue={clearValue}
            labelledBy={labelledBy}
        />
    );
};

export default CostCenterSelect;
