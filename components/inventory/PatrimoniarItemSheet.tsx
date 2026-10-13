// components/inventory/PatrimoniarItemSheet.tsx — item do almoxarifado vira ativo patrimonial
//
// Caminho de volta do vínculo Ativo ↔ Almoxarifado (pedido de 13/10/2026,
// docs/planos/2026-10-13-ativos-almoxarifado-vinculo.md, item 7). Decisão do
// usuário: escolhe-se QUANTAS unidades — cada uma vira um ativo com código
// patrimonial próprio e 1 UN de saldo, e sai a mesma quantidade do item
// original. Tudo ou nada, no banco (fn_patrimoniar_item_de_estoque).
//
// Painel lateral: formulário curto sobre um item da lista (UI_PATTERNS §3).
import React from 'react';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { inventoryService } from '../../services/inventoryService';
import { ASSET_CATEGORIES, ASSET_CATEGORY_LABELS } from '../../utils/assetToStockItemRow';
import type { AssetCategory } from '../../types/assets';
import type { StockBalance, StockItem, Warehouse } from '../../types/inventory';

const inputCls = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50';

const Campo: React.FC<{ label: string; htmlFor: string; ajuda?: string; children: React.ReactNode }> = ({ label, htmlFor, ajuda, children }) => (
    <div className="space-y-1.5">
        <label htmlFor={htmlFor} className="text-xs font-semibold text-slate-500">{label}</label>
        {children}
        {ajuda && <p className="text-xs text-gray-400">{ajuda}</p>}
    </div>
);

/** Categoria do item (texto livre, às vezes o rótulo de uma categoria de ativo) → categoria de ativo. */
const categoriaInicial = (item: StockItem): AssetCategory => {
    const rotulo = (item.category ?? '').trim().toLowerCase();
    return ASSET_CATEGORIES.find(c => ASSET_CATEGORY_LABELS[c].toLowerCase() === rotulo) ?? 'equipamento';
};

const formatQtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

interface Props {
    item: StockItem | null;
    warehouses: Warehouse[];
    onClose: () => void;
    /** Ativos criados — quem chama recarrega saldos e catálogo. */
    onDone: (criados: number) => void;
}

const PatrimoniarItemSheet: React.FC<Props> = ({ item, warehouses, onClose, onDone }) => {
    const [saldos, setSaldos] = React.useState<StockBalance[] | null>(null);
    const [erroSaldos, setErroSaldos] = React.useState('');
    const [warehouseId, setWarehouseId] = React.useState('');
    const [quantidade, setQuantidade] = React.useState(1);
    const [categoria, setCategoria] = React.useState<AssetCategory>('equipamento');
    const [vidaUtil, setVidaUtil] = React.useState(60);
    const [valor, setValor] = React.useState(0);
    const [nome, setNome] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState('');

    React.useEffect(() => {
        if (!item) return;
        setSaldos(null);
        setErroSaldos('');
        setErro('');
        setQuantidade(1);
        setVidaUtil(60);
        setCategoria(categoriaInicial(item));
        setNome(item.inputDescription);
        let vivo = true;
        inventoryService.listBalances(item.organizationId, { inputCode: item.inputCode, positiveOnly: true })
            .then(lista => {
                if (!vivo) return;
                setSaldos(lista);
                const maior = [...lista].sort((a, b) => b.quantity - a.quantity)[0];
                setWarehouseId(maior?.warehouseId ?? '');
                setValor(maior?.avgUnitCost || item.unitCostHint || 0);
            })
            .catch((e: unknown) => {
                if (!vivo) return;
                setSaldos([]);
                setErroSaldos((e as Error).message);
            });
        return () => { vivo = false; };
    }, [item]);

    const saldoEscolhido = saldos?.find(s => s.warehouseId === warehouseId);
    const disponivel = Math.floor(saldoEscolhido?.quantity ?? 0);
    const nomeDoAlmoxarifado = (id: string) => warehouses.find(w => w.id === id)?.name ?? 'Almoxarifado';

    const motivoBloqueio = !saldos
        ? 'Carregando saldos…'
        : saldos.length === 0
            ? 'Este item não tem saldo em nenhum almoxarifado'
            : !warehouseId
                ? 'Escolha o almoxarifado'
                : quantidade < 1 || !Number.isInteger(quantidade)
                    ? 'A quantidade é um número inteiro de unidades, a partir de 1'
                    : quantidade > disponivel
                        ? `Há só ${formatQtd(saldoEscolhido?.quantity ?? 0)} ${item?.inputUnit ?? 'UN'} neste almoxarifado`
                        : '';

    const salvar = async () => {
        if (!item || motivoBloqueio) return;
        setSalvando(true);
        setErro('');
        try {
            const ids = await inventoryService.patrimoniarItem({
                itemId: item.id,
                warehouseId,
                quantidade,
                categoria,
                vidaUtilMeses: vidaUtil,
                valorUnitario: valor,
                nome,
            });
            onDone(ids.length);
        } catch (e: unknown) {
            setErro((e as Error).message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!item} onClose={onClose} size="md">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Transformar em ativo patrimonial</SheetTitle>
                <SheetDescription>{item ? `${item.inputDescription} · ${item.inputCode}` : ''}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                {saldos === null ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando saldos…</div>
                ) : saldos.length === 0 ? (
                    <p className="text-sm text-gray-500">
                        {erroSaldos || 'Este item não tem saldo em nenhum almoxarifado. Dê entrada no estoque antes de transformá-lo em ativo.'}
                    </p>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <Campo label="Almoxarifado" htmlFor="patrimoniar-almox">
                                <select id="patrimoniar-almox" value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className={inputCls}>
                                    {saldos.map(s => (
                                        <option key={s.warehouseId} value={s.warehouseId}>
                                            {nomeDoAlmoxarifado(s.warehouseId)} · {formatQtd(s.quantity)} {item?.inputUnit}
                                        </option>
                                    ))}
                                </select>
                            </Campo>
                            <Campo label="Quantidade de ativos" htmlFor="patrimoniar-qtd" ajuda={`Até ${disponivel} — cada unidade vira um ativo`}>
                                <input id="patrimoniar-qtd" type="number" min={1} max={disponivel || undefined} step={1}
                                    value={quantidade} onChange={e => setQuantidade(Number(e.target.value))} className={inputCls} />
                            </Campo>
                            <div className="col-span-2">
                                <Campo label="Nome do ativo" htmlFor="patrimoniar-nome">
                                    <input id="patrimoniar-nome" value={nome} onChange={e => setNome(e.target.value)} className={inputCls} />
                                </Campo>
                            </div>
                            <Campo label="Categoria" htmlFor="patrimoniar-cat">
                                <select id="patrimoniar-cat" value={categoria} onChange={e => setCategoria(e.target.value as AssetCategory)} className={inputCls}>
                                    {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{ASSET_CATEGORY_LABELS[c]}</option>)}
                                </select>
                            </Campo>
                            <Campo label="Vida útil (meses)" htmlFor="patrimoniar-vida">
                                <input id="patrimoniar-vida" type="number" min={1} step={1} value={vidaUtil}
                                    onChange={e => setVidaUtil(Number(e.target.value))} className={inputCls} />
                            </Campo>
                            <Campo label="Valor de aquisição (por unidade)" htmlFor="patrimoniar-valor" ajuda="Sugerido: custo médio do saldo">
                                <MoneyCentsInput id="patrimoniar-valor" value={valor}
                                    onChange={v => setValor(v === '' ? 0 : Number(v))} className={inputCls} />
                            </Campo>
                        </div>
                        <p className="text-sm text-gray-500">
                            Sai {quantidade > 0 ? quantidade : '—'} {item?.inputUnit} de {item?.inputCode} em {nomeDoAlmoxarifado(warehouseId)}.
                            Cada ativo nasce com código patrimonial próprio, vira um item do catálogo e fica com 1 UN neste
                            almoxarifado — o saldo passa a acompanhar o ativo (Retirada, Movimentar, baixa).
                        </p>
                    </>
                )}
                {erro && <p className="text-sm text-red-600">{erro}</p>}
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-[6px] transition-all">
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={salvar}
                    disabled={!!motivoBloqueio || salvando}
                    title={motivoBloqueio || undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                    {quantidade > 1 ? `Transformar em ${quantidade} ativos` : 'Transformar em ativo'}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default PatrimoniarItemSheet;
