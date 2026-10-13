// components/settings/BrandModelImportSheet.tsx — importar Marcas e Modelos de planilha
//
// Plano: docs/planos/2026-10-13-marcas-e-modelos.md (Fase 3). Painel lateral
// (UI_PATTERNS §3 — gerenciar lista de config). Três passos no MESMO painel:
// arquivo → prévia (o que cada linha vai fazer) → resultado.
//
// REGRA #5: o destino é resolveWriteOrg('all-allowed') — o topo manda; em
// "Todas" pergunta, e mantendo "Todas" a planilha é aplicada em cada
// organização do usuário. A prévia é calculada contra o catálogo DE CADA
// organização de destino (uma marca pode existir numa e não noutra).
import React from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { saveAs } from 'file-saver';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import { FilterPopover } from '../ui/FilterPopover';
import { useOrgWriteTarget, targetOrgIds, errorMessage } from '../../hooks/useOrgContext';
import { brandModelService } from '../../services/brandModelService';
import type { ProductBrand, ProductModel } from '../../types/brandModel';
import {
    linhasQueGravam, planejarImportacao, resumirPlano, ROTULO_ACAO,
    type AcaoLinha, type LinhaLida, type LinhaPlanejada,
} from '../../utils/catalogoPlanilha';
import { gerarPlanilhaCatalogo, lerPlanilhaCatalogo } from '../../utils/catalogoPlanilhaExcel';

const COR_ACAO: Record<AcaoLinha, string> = {
    'nova-marca': 'text-blue-700',
    'novo-modelo': 'text-blue-700',
    'nova-marca-e-modelo': 'text-blue-700',
    atualiza: 'text-amber-700',
    'sem-mudanca': 'text-gray-500',
    erro: 'text-red-600',
};

// Tabela dentro do painel (§6.9, dense). ~620px úteis no Sheet 2xl; "Ação" com
// 150px para "Nova marca e modelo" caber inteiro (cortava em 120 — visto na tela
// em 13/10). O detalhe longo trunca com o texto inteiro no title.
const COLUMNS: StandardTableColumn[] = [
    { key: 'numero', label: 'Linha', sortable: true, width: 60, align: 'right' },
    { key: 'marca', label: 'Marca', sortable: true, width: 120 },
    { key: 'modelo', label: 'Modelo', sortable: true, width: 100 },
    { key: 'acao', label: 'Ação', sortable: true, width: 150 },
    { key: 'detalhe', label: 'O que acontece', sortable: false, width: 190 },
];

type FiltroAcao = '' | 'grava' | 'erro' | 'sem-mudanca';
const FILTROS: { value: FiltroAcao; label: string }[] = [
    { value: '', label: 'Todas as linhas' },
    { value: 'grava', label: 'Gravam algo' },
    { value: 'sem-mudanca', label: 'Sem mudança' },
    { value: 'erro', label: 'Com erro' },
];

/** Linha da prévia: a ação em cada org de destino, resumida numa só. */
interface LinhaPrevia {
    linha: LinhaLida;
    acao: AcaoLinha | 'varia';
    detalhe: string;
}

interface Props {
    open: boolean;
    onClose: () => void;
    /** Catálogo já carregado pela tela (com o topo em "Todas", de todas as orgs). */
    brands: ProductBrand[];
    models: ProductModel[];
    orgName: (orgId: string) => string;
    /** Algo foi gravado — a tela recarrega o catálogo. */
    onImported: () => void;
}

export const BrandModelImportSheet: React.FC<Props> = ({ open, onClose, brands, models, orgName, onImported }) => {
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [arquivo, setArquivo] = React.useState<string | null>(null);
    const [lendo, setLendo] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [planos, setPlanos] = React.useState<{ orgId: string; plano: LinhaPlanejada[] }[] | null>(null);
    const [gravando, setGravando] = React.useState(false);
    const [resultado, setResultado] = React.useState<{ gravadas: number; erros: { org: string; numero: number; mensagem: string }[] } | null>(null);
    const [filtro, setFiltro] = React.useState<FiltroAcao>('');   // transitório: vive só nesta importação (§3.1)

    React.useEffect(() => {
        if (open) return;
        setArquivo(null); setErro(null); setPlanos(null); setResultado(null); setFiltro('');
        if (inputRef.current) inputRef.current.value = '';
    }, [open]);

    const baixarModelo = async () => {
        try {
            saveAs(await gerarPlanilhaCatalogo([], { comOrganizacao: false }), 'modelo-marcas-e-modelos.xlsx');
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível gerar a planilha modelo.'));
        }
    };

    const escolherArquivo = async (f: File) => {
        setErro(null); setPlanos(null); setResultado(null);
        if (!/\.xlsx$/i.test(f.name)) { setErro('Escolha um arquivo Excel (.xlsx).'); return; }
        setArquivo(f.name);
        setLendo(true);
        try {
            const { linhas, erro: erroLeitura } = await lerPlanilhaCatalogo(await f.arrayBuffer());
            if (erroLeitura) { setErro(erroLeitura); return; }
            const target = await resolveWriteOrg('all-allowed');
            if (!target) { setArquivo(null); return; }   // cancelou a escolha da organização
            setPlanos(targetOrgIds(target).map(orgId => ({
                orgId,
                plano: planejarImportacao(
                    linhas,
                    brands.filter(b => b.organization_id === orgId),
                    models.filter(m => m.organization_id === orgId),
                ),
            })));
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível ler a planilha.'));
        } finally {
            setLendo(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    // Uma linha por linha da planilha; com várias orgs de destino, a ação de cada uma.
    const previa = React.useMemo<LinhaPrevia[]>(() => {
        if (!planos?.length) return [];
        return planos[0].plano.map((p, i) => {
            const porOrg = planos.map(x => x.plano[i]);
            const iguais = porOrg.every(q => q.acao === p.acao);
            return iguais
                ? { linha: p.linha, acao: p.acao, detalhe: p.detalhe }
                : { linha: p.linha, acao: 'varia', detalhe: porOrg.map((q, k) => `${orgName(planos[k].orgId)}: ${ROTULO_ACAO[q.acao]}`).join(' · ') };
        });
    }, [planos, orgName]);

    const linhasVisiveis = React.useMemo(() => previa.filter(l => {
        if (filtro === 'erro') return l.acao === 'erro';
        if (filtro === 'sem-mudanca') return l.acao === 'sem-mudanca';
        if (filtro === 'grava') return l.acao !== 'erro' && l.acao !== 'sem-mudanca';
        return true;
    }), [previa, filtro]);

    const totalQueGrava = planos ? planos.reduce((s, x) => s + linhasQueGravam(x.plano).length, 0) : 0;
    const resumo = planos?.length ? resumirPlano(planos[0].plano) : null;

    const importar = async () => {
        if (!planos || totalQueGrava === 0) return;
        setGravando(true);
        setErro(null);
        try {
            let gravadas = 0;
            const erros: { org: string; numero: number; mensagem: string }[] = [];
            for (const { orgId, plano } of planos) {
                const r = await brandModelService.aplicarImportacao(orgId, plano);
                gravadas += r.gravadas;
                r.erros.forEach(e => erros.push({ org: orgName(orgId), ...e }));
            }
            setResultado({ gravadas, erros });
            if (gravadas > 0) onImported();
        } catch (e) {
            setErro(errorMessage(e, 'A importação foi interrompida.'));
        } finally {
            setGravando(false);
        }
    };

    const motivoBloqueio = gravando ? 'Importando...'
        : !planos ? 'Escolha a planilha primeiro'
        : totalQueGrava === 0 ? 'Nenhuma linha grava algo (só erros ou sem mudança)'
        : null;

    return (
        <>
        <Sheet open={open} onClose={onClose} size="2xl" dirty={!!planos && !resultado && !gravando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Importar marcas e modelos</SheetTitle>
                <SheetDescription>
                    {planos && planos.length > 1
                        ? `Destino: ${planos.length} organizações (${planos.map(p => orgName(p.orgId)).join(', ')}).`
                        : planos ? `Destino: ${orgName(planos[0].orgId)}.`
                        : 'Uma linha por modelo; marca sem modelo = linha com Modelo em branco.'}
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-6">
                {resultado ? (
                    <div className="space-y-4">
                        <div className="flex items-start gap-3 p-4 rounded-[10px] border border-emerald-100 bg-emerald-50">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                            <div className="text-sm text-emerald-800">
                                <p className="font-medium">{resultado.gravadas} linha{resultado.gravadas === 1 ? '' : 's'} gravada{resultado.gravadas === 1 ? '' : 's'}.</p>
                                {resultado.erros.length > 0 && <p>{resultado.erros.length} recusada{resultado.erros.length === 1 ? '' : 's'} pelo banco — veja abaixo.</p>}
                            </div>
                        </div>
                        {resultado.erros.length > 0 && (
                            <ul className="space-y-1.5 text-sm text-red-700">
                                {resultado.erros.map((e, i) => (
                                    <li key={i}>Linha {e.numero}{planos && planos.length > 1 ? ` (${e.org})` : ''}: {e.mensagem}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
                                <h3 className="text-sm font-semibold text-gray-900">Planilha</h3>
                                <button
                                    onClick={() => void baixarModelo()}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95"
                                >
                                    <Download className="w-[15px] h-[15px]" /> Baixar modelo
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => inputRef.current?.click()}
                                onDragOver={e => e.preventDefault()}
                                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void escolherArquivo(f); }}
                                disabled={lendo || gravando}
                                className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-[10px] border border-dashed border-gray-300 bg-gray-50 hover:bg-blue-50/50 hover:border-blue-300 text-sm text-gray-600 transition-all disabled:opacity-60"
                            >
                                {arquivo ? <FileSpreadsheet className="w-8 h-8 text-emerald-600" /> : <Upload className="w-8 h-8 text-gray-400" />}
                                <span className="font-medium text-gray-700">{lendo ? 'Lendo a planilha...' : arquivo ?? 'Clique ou arraste a planilha (.xlsx)'}</span>
                                <span className="text-xs text-gray-400">
                                    Marca existente é reconhecida pelo nome (sem caixa/acento) e atualizada; célula em branco não apaga nada.
                                </span>
                            </button>
                            <input
                                ref={inputRef}
                                type="file"
                                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                className="hidden"
                                aria-label="Planilha de marcas e modelos"
                                onChange={e => { const f = e.target.files?.[0]; if (f) void escolherArquivo(f); }}
                            />
                            {erro && (
                                <div className="flex items-start gap-2 p-3 rounded-[10px] bg-red-50 border border-red-200 text-red-700 text-sm">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{erro}</span>
                                </div>
                            )}
                        </div>

                        {planos && resumo && (
                            <div className="space-y-4">
                                <div className="border-b border-gray-100 pb-3">
                                    <h3 className="text-sm font-semibold text-gray-900">Prévia — {previa.length} linha{previa.length === 1 ? '' : 's'}</h3>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {[
                                            resumo['nova-marca'] + resumo['nova-marca-e-modelo'] > 0 && `${resumo['nova-marca'] + resumo['nova-marca-e-modelo']} marca(s) nova(s)`,
                                            resumo['novo-modelo'] + resumo['nova-marca-e-modelo'] > 0 && `${resumo['novo-modelo'] + resumo['nova-marca-e-modelo']} modelo(s) novo(s)`,
                                            resumo.atualiza > 0 && `${resumo.atualiza} atualização(ões)`,
                                            resumo['sem-mudanca'] > 0 && `${resumo['sem-mudanca']} sem mudança`,
                                            resumo.erro > 0 && `${resumo.erro} com erro (não grava)`,
                                        ].filter(Boolean).join(' · ')}
                                        {planos.length > 1 ? ` — contagem da 1ª organização; a coluna Ação diz quando varia.` : ''}
                                    </p>
                                </div>
                                <StandardTable<LinhaPrevia>
                                    storageKey="settings:catalogo:importacao"
                                    searchScope={arquivo ?? ''}
                                    dense
                                    maxHeight="45vh"
                                    columns={COLUMNS}
                                    rows={linhasVisiveis}
                                    rowKey={l => String(l.linha.numero)}
                                    searchText={l => `${l.linha.marca} ${l.linha.modelo ?? ''} ${l.detalhe}`}
                                    searchPlaceholder="Buscar na prévia..."
                                    filters={<FilterPopover<FiltroAcao> label="Mostrar" value={filtro} onChange={setFiltro} options={FILTROS} />}
                                    sortValue={(key, l) => key === 'numero' ? l.linha.numero
                                        : key === 'acao' ? (l.acao === 'varia' ? 'Varia' : ROTULO_ACAO[l.acao])
                                        : key === 'modelo' ? (l.linha.modelo ?? '') : l.linha.marca}
                                    renderCell={(key, l) => {
                                        const texto = (v: string, cor = 'text-gray-700') => <span className={`block truncate text-sm font-normal ${cor}`} title={v}>{v}</span>;
                                        switch (key) {
                                            case 'numero': return <span className="text-sm font-normal text-gray-500">{l.linha.numero}</span>;
                                            case 'modelo': return texto(l.linha.modelo || '—', l.linha.modelo ? 'text-gray-700' : 'text-gray-400');
                                            case 'acao': return texto(l.acao === 'varia' ? 'Varia' : ROTULO_ACAO[l.acao], l.acao === 'varia' ? 'text-amber-700' : COR_ACAO[l.acao]);
                                            case 'detalhe': return texto(l.detalhe, l.acao === 'erro' ? 'text-red-600' : 'text-gray-600');
                                            default: return texto(l.linha.marca || '—');
                                        }
                                    }}
                                    empty={{ title: 'Nenhuma linha neste filtro' }}
                                />
                            </div>
                        )}
                    </>
                )}
            </SheetPanel>

            <SheetFooter>
                {resultado ? (
                    <button onClick={onClose}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                        Concluir
                    </button>
                ) : (
                    <>
                        <button onClick={onClose} disabled={gravando} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] disabled:opacity-50">
                            Cancelar
                        </button>
                        <button
                            onClick={() => void importar()}
                            disabled={!!motivoBloqueio}
                            title={motivoBloqueio ?? undefined}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Upload className="w-[15px] h-[15px]" />
                            {gravando ? 'Importando...' : `Importar ${totalQueGrava} linha${totalQueGrava === 1 ? '' : 's'}`}
                        </button>
                    </>
                )}
            </SheetFooter>
        </Sheet>
        {/* Fora do Sheet: o painel tem transform e prenderia o modal (UI_PATTERNS §4.4). */}
        {orgTargetModal}
        </>
    );
};

export default BrandModelImportSheet;
