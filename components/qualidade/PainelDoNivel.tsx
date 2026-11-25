import React from 'react';
import type { ItemControlado, NivelSiac, ProcedimentoResumo, TipoItemControlado } from '../../types/qualidadeSiac';
import { MINIMO_MATERIAIS, metaDoNivel, procedimentoConta } from '../../utils/qualidadeSiac';
import { MOTIVO_SEM_EDICAO_QUALIDADE } from '../../utils/permissaoQualidadeSiac';

/**
 * "Quanto falta para o nível" — o painel ACIMA da lista controlada (guia §6.14: nada abaixo
 * de tabela). Regras de docs/planos/2026-11-25-qualidade-siac-pbqph.md, "Regras de cálculo da tela":
 *
 *  - N = itens ATIVOS do tipo (dispensado sai de N);
 *  - "procedimento aprovado" conta só documento com versão ativa e aprovado (`procedimentoConta`);
 *  - "aplicados com registro" e "em obra em andamento" ainda não existem: aparecem com a META do nível e a
 *    fase em que começam (2 para serviços, 3 para materiais) — nunca com uma contagem zero, que seria o
 *    contador que mente;
 *  - materiais com menos de 20 ativos mostram o aviso do mínimo do Anexo 4.
 *
 * Nível alvo é POR ORGANIZAÇÃO (REGRA #5): com o topo em "Todas", uma linha por organização, com o
 * nome dela; com uma organização só, o nome não se repete (o topo já diz qual é — guia §18).
 */
export const ROTULO_NIVEL: Record<NivelSiac, string> = { B: 'Nível B', A: 'Nível A' };

const FASE_QUE_COMECA: Record<TipoItemControlado, number> = { SERVICO: 2, MATERIAL: 3 };
const NOME_DO_TIPO: Record<TipoItemControlado, string> = { SERVICO: 'Serviços', MATERIAL: 'Materiais' };

interface Props {
    itens: ItemControlado[];
    niveis: Record<string, NivelSiac>;
    procedimentos: Record<string, ProcedimentoResumo>;
    nomesDasOrgs: Record<string, string>;
    podeEditar: boolean;
    onNivel(orgId: string, nivel: NivelSiac): void;
}

/** A linha de um tipo (serviços ou materiais) para uma organização. */
function linhaDoTipo(
    itens: ItemControlado[], tipo: TipoItemControlado, nivel: NivelSiac, procedimentos: Record<string, ProcedimentoResumo>,
): { texto: string; abaixoDoMinimo: string | null } {
    const ativos = itens.filter(i => i.tipo === tipo && i.situacao === 'ATIVO');
    const n = ativos.length;
    const meta = metaDoNivel(n, tipo, nivel);
    const comProcedimento = ativos.filter(i =>
        procedimentoConta(i.procedure_document_id ? procedimentos[i.procedure_document_id] ?? null : null)).length;
    const fase = FASE_QUE_COMECA[tipo];
    const texto = `${NOME_DO_TIPO[tipo]} (${n}) · procedimento aprovado ${comProcedimento}/${meta.comProcedimento}`
        // A META das colunas futuras aparece; a contagem não (ainda não há o que contar — nunca zero).
        + ` · aplicados com registro: meta ${meta.aplicadosComRegistro} — começa na fase ${fase}`
        + ` · em obra em andamento: meta ${meta.emObraEmAndamento} — começa na fase ${fase}`;
    const abaixoDoMinimo = tipo === 'MATERIAL' && n < MINIMO_MATERIAIS
        ? `abaixo do mínimo do Anexo 4: ${n} de ${MINIMO_MATERIAIS}`
        : null;
    return { texto, abaixoDoMinimo };
}

export const PainelDoNivel: React.FC<Props> = ({ itens, niveis, procedimentos, nomesDasOrgs, podeEditar, onNivel }) => {
    const orgs = React.useMemo(() => {
        const ids = new Set<string>([...Object.keys(niveis), ...itens.map(i => i.organization_id)]);
        return [...ids].sort((a, b) => (nomesDasOrgs[a] ?? a).localeCompare(nomesDasOrgs[b] ?? b, 'pt-BR'));
    }, [itens, niveis, nomesDasOrgs]);

    if (orgs.length === 0) return null;
    const variasOrgs = orgs.length > 1;
    // Uma organização só (a do topo, ou a única com itens): o nível dela entra no título.
    const [unica] = orgs;
    const titulo = variasOrgs ? 'Quanto falta para o nível alvo' : `Quanto falta para o nível ${niveis[unica] ?? 'B'}`;

    return (
        <section aria-label={titulo} className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 mb-3">
            <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
            <ul className="mt-3 divide-y divide-gray-100">
                {orgs.map(org => {
                    const nivel = niveis[org] ?? 'B';
                    const doOrg = itens.filter(i => i.organization_id === org);
                    const nome = nomesDasOrgs[org] ?? 'Organização fora da lista';
                    const servicos = linhaDoTipo(doOrg, 'SERVICO', nivel, procedimentos);
                    const materiais = linhaDoTipo(doOrg, 'MATERIAL', nivel, procedimentos);
                    const idSeletor = `qualidade-nivel-${org}`;
                    return (
                        <li key={org} className="flex flex-col md:flex-row md:items-start gap-3 py-3 first:pt-0 last:pb-0">
                            <div className="min-w-0 flex-1 space-y-1 text-sm text-gray-700">
                                {variasOrgs && <p className="font-medium text-gray-900">{nome}</p>}
                                <p>{servicos.texto}</p>
                                <p>
                                    {materiais.texto}
                                    {materiais.abaixoDoMinimo && <span className="text-amber-700"> · {materiais.abaixoDoMinimo}</span>}
                                </p>
                            </div>
                            <div className="shrink-0 space-y-1.5">
                                <label htmlFor={idSeletor} className="block text-xs font-semibold text-slate-500">
                                    Nível alvo{variasOrgs ? <span className="sr-only"> de {nome}</span> : null}
                                </label>
                                <span className="inline-flex" title={podeEditar ? 'O nível do SiAC que esta organização persegue' : MOTIVO_SEM_EDICAO_QUALIDADE}>
                                    <select id={idSeletor} value={nivel} disabled={!podeEditar}
                                        onChange={e => onNivel(org, e.target.value as NivelSiac)}
                                        className="w-32 h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all">
                                        <option value="B">{ROTULO_NIVEL.B}</option>
                                        <option value="A">{ROTULO_NIVEL.A}</option>
                                    </select>
                                </span>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};

export default PainelDoNivel;
