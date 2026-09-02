import React from 'react';
import { AlertTriangle, Plus, Trash2, TrendingDown } from 'lucide-react';
import { formatMoney } from '../ui/Format';
import { debtService } from '../../services/debtService';
import { companyService } from '../../services/companyService';
import { projectService } from '../../services/projectService';
import { empreendimentoService } from '../../services/empreendimentoService';
import { costCenterService } from '../../services/costCenterService';
import { assetService } from '../../services/assetService';
import { commercialService } from '../../services/commercialService';
import { financialRegistryService } from '../../services/financialRegistryService';
import {
    DEBT_ALLOCATION_TARGET_PT,
    type DebtAllocation,
    type DebtAllocationInput,
    type DebtAllocationTarget,
    type DebtContract,
} from '../../types/debt';

interface Props {
    contract: DebtContract;
    /** Saldo devedor, para mostrar quanto cada destino carrega em reais. */
    saldoDevedor: number;
    onSalvou: () => void;
}

/**
 * Os oito destinos do CHECK do banco (`debt_allocations_target_kind_check`),
 * agora todos com seletor de verdade. Ficaram sem seletor até 30/08 —
 * medido então: 93 imóveis e 85 unidades já cadastrados sem como serem
 * escolhidos como destino de rateio. Sem uma lista, o usuário teria de colar
 * um uuid à mão, o que produz rateio apontando para lugar nenhum — por isso a
 * espera até existir a lista, em vez de um campo de texto livre.
 */
const DESTINOS_COM_SELETOR: DebtAllocationTarget[] =
    ['COMPANY', 'PROJECT', 'EMPREENDIMENTO', 'COST_CENTER', 'ASSET', 'PROPERTY', 'UNIT', 'BANK_ACCOUNT'];

type Opcao = { id: string; rotulo: string };

/**
 * Unidades de TODOS os empreendimentos da organização, achatadas numa lista só.
 *
 * `empreendimento_units` e `empreendimento_towers` não têm `organization_id`
 * próprio — só `empreendimentos` tem (conferido no schema em 30/08) — então não
 * dá para filtrar direto. O caminho é o mesmo já usado em
 * `getCommercialDivergenceSummary`: empreendimentos da org →
 * `listAllUnitsForEmpreendimento` de cada um, em paralelo. Com ~18
 * empreendimentos por organização isso é uma rodada só, ao abrir a aba — não
 * por linha de tabela.
 */
async function carregarUnidades(org: string | undefined): Promise<Opcao[]> {
    const empreendimentos = await empreendimentoService.list(org);
    const porEmpreendimento = await Promise.all(
        empreendimentos.map(async e => {
            const unidades = await empreendimentoService.listAllUnitsForEmpreendimento(e.id);
            return unidades.map(u => ({
                id: u.id,
                rotulo: `${e.name} · ${u._tower_name} · ${u.name}`,
            }));
        }),
    );
    return porEmpreendimento.flat();
}

const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="text-xs font-semibold text-slate-500">{children}</label>
);
const campo = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';
const th = 'px-6 py-2 border-r border-gray-100 text-table-header font-semibold text-gray-500';
const td = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';

export default function DebtAllocations({ contract, saldoDevedor, onSalvou }: Props) {
    const [linhas, setLinhas] = React.useState<DebtAllocationInput[]>([]);
    const [opcoes, setOpcoes] = React.useState<Record<string, Opcao[]>>({});
    const [carregando, setCarregando] = React.useState(true);
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [aviso, setAviso] = React.useState<string | null>(null);

    const carregar = React.useCallback(async () => {
        setCarregando(true);
        setErro(null);
        try {
            const atuais: DebtAllocation[] = await debtService.listAllocations(contract.id);
            setLinhas(atuais.map(a => ({
                id: a.id, debtContractId: a.debtContractId, targetKind: a.targetKind,
                targetId: a.targetId, percent: a.percent, notes: a.notes,
            })));

            const org = contract.organizationId;
            // `allSettled`: um módulo indisponível (Bens, Empreendimentos,
            // Comercial) não pode impedir o rateio por obra de funcionar.
            const [emp, obras, empr, cc, bens, imoveis, unidades, contas] = await Promise.allSettled([
                companyService.list(org),
                // REGRA #3: `listProjects` já devolve só OBRA por default.
                projectService.listProjects({ organizationId: org }),
                empreendimentoService.list(org),
                costCenterService.list(org),
                assetService.list(org),
                // includeHidden=true: um imóvel oculto da vitrine de vendas
                // pode estar hipotecado do mesmo jeito — o filtro de "visível
                // ao corretor" não é o filtro certo aqui.
                commercialService.listProperties(org, undefined, 'BOTH', true),
                carregarUnidades(org),
                financialRegistryService.listPaymentAccounts(org),
            ]);
            const pega = <T,>(r: PromiseSettledResult<T[]>): T[] =>
                r.status === 'fulfilled' ? r.value : [];

            setOpcoes({
                COMPANY: pega(emp as PromiseSettledResult<Record<string, unknown>[]>)
                    .map(c => ({ id: String(c.id), rotulo: String(c.nome_fantasia ?? c.razao_social ?? '') })),
                PROJECT: pega(obras as PromiseSettledResult<Record<string, unknown>[]>)
                    .map(p => ({ id: String(p.id), rotulo: String(p.name ?? '') })),
                EMPREENDIMENTO: pega(empr as PromiseSettledResult<Record<string, unknown>[]>)
                    .map(e => ({ id: String(e.id), rotulo: String(e.name ?? e.nome ?? '') })),
                COST_CENTER: pega(cc as PromiseSettledResult<Record<string, unknown>[]>)
                    .map(c => ({ id: String(c.id), rotulo: `${c.code ?? ''} — ${c.name ?? ''}` })),
                ASSET: pega(bens as PromiseSettledResult<Record<string, unknown>[]>)
                    .map(a => ({ id: String(a.id), rotulo: `${a.code ?? ''} — ${a.name ?? ''}` })),
                PROPERTY: pega(imoveis as PromiseSettledResult<Record<string, unknown>[]>)
                    .map(p => ({ id: String(p.id), rotulo: p.number ? `${p.name} nº ${p.number}` : String(p.name ?? '') })),
                UNIT: unidades.status === 'fulfilled' ? unidades.value : [],
                BANK_ACCOUNT: pega(contas as PromiseSettledResult<Record<string, unknown>[]>)
                    .map(a => ({ id: String(a.id), rotulo: `${a.name ?? ''} — ${a.bank ?? ''} ${a.account_number ?? ''}`.trim() })),
            });
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível carregar o rateio.');
        } finally {
            setCarregando(false);
        }
    }, [contract.id, contract.organizationId]);

    React.useEffect(() => { void carregar(); }, [carregar]);

    const soma = React.useMemo(
        () => linhas.reduce((a, l) => a + (Number(l.percent) || 0), 0),
        [linhas],
    );
    const fecha = linhas.length === 0 || Math.abs(soma - 100) < 0.01;

    const adicionar = () => setLinhas(prev => [...prev, {
        debtContractId: contract.id,
        targetKind: 'PROJECT',
        targetId: '',
        // Sugere o que falta para fechar 100 — é o que o usuário ia digitar.
        percent: Math.max(0, Number((100 - soma).toFixed(2))),
    }]);

    const alterar = (i: number, patch: Partial<DebtAllocationInput>) =>
        setLinhas(prev => prev.map((l, k) => (k === i ? { ...l, ...patch } : l)));

    const remover = (i: number) => setLinhas(prev => prev.filter((_, k) => k !== i));

    const salvar = async () => {
        if (linhas.some(l => !l.targetId)) {
            setErro('Há linha sem destino escolhido.');
            return;
        }
        // Destino repetido violaria a unique (contrato, tipo, destino) — dizer
        // isso aqui é mais claro que o 23505 do banco.
        const chaves = linhas.map(l => `${l.targetKind}:${l.targetId}`);
        if (new Set(chaves).size !== chaves.length) {
            setErro('O mesmo destino aparece duas vezes. Some os percentuais numa linha só.');
            return;
        }
        setSalvando(true);
        setErro(null);
        setAviso(null);
        try {
            await debtService.saveAllocations(contract.organizationId, contract.id, linhas);
            setAviso(linhas.length === 0
                ? 'Rateio removido.'
                : `Rateio salvo em ${linhas.length} destino(s).`);
            await carregar();
            onSalvou();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível salvar o rateio.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center gap-4 px-1 text-sm">
                    <span className="font-normal text-gray-500">
                        Saldo devedor <span className="font-medium text-gray-800">{formatMoney(saldoDevedor)}</span>
                    </span>
                    <span className="font-normal text-gray-500">
                        Soma do rateio{' '}
                        <span className={`font-medium ${fecha ? 'text-gray-800' : 'text-red-600'}`}>
                            {soma.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
                        </span>
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={adicionar}
                            className="flex items-center gap-1.5 h-9 px-3.5 text-slate-600 border border-gray-200 bg-white rounded-[6px] hover:bg-slate-50 font-medium text-[13px] transition-all active:scale-95">
                        <Plus className="w-[15px] h-[15px]" />
                        Adicionar destino
                    </button>
                    <button onClick={salvar} disabled={salvando || !fecha}
                            title={fecha ? undefined : 'O rateio precisa somar 100% ou ficar vazio'}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                        {salvando ? 'Salvando…' : 'Salvar rateio'}
                    </button>
                </div>
            </div>

            {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3">{erro}</div>}
            {aviso && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-[10px] px-4 py-3">{aviso}</div>}

            {!fecha && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-[10px] px-4 py-3">
                    <AlertTriangle className="w-4 h-4 inline mr-1.5" />
                    A soma está em {soma.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%. O banco só aceita
                    100% ou rateio vazio — faltam {(100 - soma).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%.
                </div>
            )}

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                {carregando ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : linhas.length === 0 ? (
                    <div className="text-center py-12">
                        <TrendingDown className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Sem rateio cadastrado</h3>
                        <p className="text-sm text-gray-500">
                            Sem rateio, esta dívida não aparece no custo financeiro por obra nem por
                            empreendimento — e a parcela vai ao Contas a Pagar sem dimensão de obra.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className={`${th} text-left`}>Tipo de destino</th>
                                    <th className={`${th} text-left`}>Destino</th>
                                    <th className={`${th} text-right`}>Percentual</th>
                                    <th className={`${th} text-right`}>Saldo atribuído</th>
                                    <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {linhas.map((l, i) => (
                                    <tr key={`${l.targetKind}-${i}`} className="hover:bg-blue-50/50 transition-colors">
                                        <td className={`${td} text-gray-700`}>
                                            {/* §7.1 — select inline usa a MESMA tipografia da célula. */}
                                            <select
                                                className={campo}
                                                value={l.targetKind}
                                                onChange={e => alterar(i, {
                                                    targetKind: e.target.value as DebtAllocationTarget,
                                                    targetId: '',
                                                })}
                                            >
                                                {DESTINOS_COM_SELETOR.map(k => (
                                                    <option key={k} value={k}>{DEBT_ALLOCATION_TARGET_PT[k]}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className={`${td} text-gray-700`}>
                                            <select
                                                className={campo}
                                                value={l.targetId}
                                                onChange={e => alterar(i, { targetId: e.target.value })}
                                            >
                                                <option value="">Selecione…</option>
                                                {(opcoes[l.targetKind] ?? []).map(o => (
                                                    <option key={o.id} value={o.id}>{o.rotulo}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className={`${td} text-right`}>
                                            <input
                                                type="number" step="0.01" min="0" max="100"
                                                className={`${campo} text-right`}
                                                value={l.percent}
                                                onChange={e => alterar(i, { percent: Number(e.target.value) || 0 })}
                                            />
                                        </td>
                                        <td className={`${td} text-right font-medium text-gray-800`}>
                                            {formatMoney(saldoDevedor * (Number(l.percent) || 0) / 100)}
                                        </td>
                                        <td className="px-6 py-2.5 text-right">
                                            <button
                                                onClick={() => remover(i)}
                                                className="p-1.5 rounded-[6px] border border-red-100 text-red-500 bg-white hover:bg-red-50 transition-all active:scale-95"
                                                title="Remover destino"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-gray-50 border-t border-gray-200">
                                    <td className={`${td} text-right text-gray-500`} colSpan={2}>Total</td>
                                    <td className={`${td} text-right font-medium ${fecha ? 'text-gray-800' : 'text-red-600'}`}>
                                        {soma.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
                                    </td>
                                    <td className={`${td} text-right font-medium text-gray-800`}>
                                        {formatMoney(saldoDevedor * soma / 100)}
                                    </td>
                                    <td className="px-6 py-2.5"></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}

                <div className="px-5 py-3 border-t border-gray-100 bg-amber-50/60">
                    <p className="text-xs text-amber-800">
                        Com <strong>um único</strong> destino do tipo Obra, a parcela vai ao Contas a Pagar já com a
                        dimensão de obra preenchida. Com dois ou mais, a linha do razão fica sem obra de propósito —
                        ela tem uma coluna só, e escolher uma poria a dívida inteira na obra errada. Nesse caso o
                        vínculo vive aqui, e é daqui que “dívida por obra” é lida.
                    </p>
                </div>
            </div>
        </div>
    );
}
