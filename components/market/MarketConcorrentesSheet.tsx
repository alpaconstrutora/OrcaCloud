import React from 'react';
import { Loader2, Plus, Users } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import ActionIconButton from '../ui/ActionIconButton';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { useToast } from '../../hooks/useToast';
import { opuraMarketService } from '../../services/opuraMarketService';
import type { OpuraMarketListing, OpuraMarketTerrainStudy } from '../../types';
import type { ConcorrenteMonitorado } from '../../utils/marketConcorrentes';

/**
 * Concorrentes monitorados de um estudo de terreno (Fase 7.7 do plano
 * docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md): anúncios do raio do estudo ou um nome
 * com preço próprio. O estudo do Imovib criado deste estudo de terreno importa os concorrentes como
 * comparáveis (Premissas › Mercado › "Importar do Market").
 */
interface Props {
    estudo: OpuraMarketTerrainStudy;
    onClose: () => void;
}

const CAMPO = 'w-full px-3 h-9 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const ROTULO = 'block text-xs font-semibold text-slate-500';
const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));

const COLUNAS: StandardTableColumn[] = [
    { key: 'nome', label: 'Concorrente', width: 220 },
    { key: 'origem', label: 'Origem', width: 110 },
    { key: 'preco', label: 'Preço', width: 130, align: 'right' },
    { key: 'precoM2', label: 'R$/m²', width: 110, align: 'right' },
];
const ROTULO_DA_ORIGEM: Record<ConcorrenteMonitorado['origem'], string> = { anuncio: 'Anúncio', lancamento: 'Lançamento', proprio: 'Digitado' };

export default function MarketConcorrentesSheet({ estudo, onClose }: Props) {
    const { showToast } = useToast();
    const [lista, setLista] = React.useState<ConcorrenteMonitorado[] | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);
    const [anuncios, setAnuncios] = React.useState<(OpuraMarketListing & { distanciaKm: number })[] | null>(null);
    const [escolhidos, setEscolhidos] = React.useState<string[]>([]);
    const [nome, setNome] = React.useState('');
    const [preco, setPreco] = React.useState<number | ''>('');
    const [gravando, setGravando] = React.useState(false);

    const carregar = React.useCallback(() => {
        opuraMarketService.listarConcorrentes(estudo.id)
            .then(l => { setLista(l); setErro(null); })
            .catch(e => setErro((e as Error).message));
    }, [estudo.id]);
    React.useEffect(carregar, [carregar]);

    const abrirAnuncios = async () => {
        try {
            setAnuncios(await opuraMarketService.anunciosNoRaio({ latitude: estudo.latitude, longitude: estudo.longitude }, estudo.analysisRadiusMeters));
        } catch (e) {
            showToast((e as Error).message, 'error');
        }
    };

    const jaMonitorados = new Set((lista ?? []).map(c => c.listingId).filter(Boolean) as string[]);
    const sujo = escolhidos.length > 0 || nome.trim() !== '';

    const adicionar = async () => {
        const itens = [
            ...escolhidos.map(listingId => ({ listingId })),
            ...(nome.trim() ? [{ customName: nome.trim(), customPrice: preco === '' ? null : Number(preco) }] : []),
        ];
        if (!itens.length) return;
        setGravando(true);
        try {
            await opuraMarketService.adicionarConcorrentes(estudo.organizationId, estudo.id, itens);
            setEscolhidos([]); setNome(''); setPreco(''); setAnuncios(null);
            showToast(`${itens.length} concorrente(s) monitorado(s).`, 'success');
            carregar();
        } catch (e) {
            showToast((e as Error).message, 'error');
        } finally {
            setGravando(false);
        }
    };

    const tirar = async (c: ConcorrenteMonitorado) => {
        try {
            await opuraMarketService.removerConcorrente(c.id);
            setLista(prev => (prev ?? []).filter(x => x.id !== c.id));
        } catch (e) {
            showToast((e as Error).message, 'error');
        }
    };

    const motivoAdicionar = !sujo ? 'Escolha anúncios do raio ou digite o nome de um concorrente.' : undefined;

    return (
        <Sheet open onClose={onClose} size="2xl" dirty={sujo}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Concorrentes monitorados</SheetTitle>
                <SheetDescription>
                    {estudo.name} · raio de {estudo.analysisRadiusMeters} m. O estudo de viabilidade criado a partir deste terreno importa estes concorrentes como comparáveis.
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6 space-y-6">
                {erro && <p className="text-sm text-red-700">{erro}</p>}
                <StandardTable<ConcorrenteMonitorado>
                    storageKey="market:concorrentes"
                    columns={COLUNAS}
                    rows={lista ?? []}
                    rowKey={c => c.id}
                    loading={lista === null && !erro}
                    dense
                    bare
                    renderCell={(k, c) => {
                        switch (k) {
                            case 'nome': return <span className="block text-sm text-gray-800 whitespace-normal">{c.nome}{c.endereco && <span className="block text-xs text-gray-500">{c.endereco}</span>}</span>;
                            case 'origem': return <span className="text-sm text-gray-700">{ROTULO_DA_ORIGEM[c.origem]}</span>;
                            case 'preco': return <span className="text-sm text-gray-800 tabular-nums">{brl(c.preco)}</span>;
                            case 'precoM2': return <span className="text-sm text-gray-800 tabular-nums">{brl(c.precoM2)}</span>;
                            default: return null;
                        }
                    }}
                    actions={{ width: 60, render: c => <ActionIconButton kind="delete" title="Parar de monitorar" onClick={() => void tirar(c)} /> }}
                    empty={{
                        icon: <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: 'Nenhum concorrente monitorado',
                        subtitle: 'Adicione anúncios do raio do estudo ou um concorrente com nome e preço.',
                    }}
                />

                <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold text-gray-700">Anúncios do raio</h4>
                        <Button variant="secondary" size="sm" onClick={() => void abrirAnuncios()}>Procurar anúncios</Button>
                    </div>
                    {anuncios && (anuncios.length === 0 ? (
                        <p className="text-sm text-gray-500">Nenhum anúncio com posição no raio de {estudo.analysisRadiusMeters} m.</p>
                    ) : (
                        <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-[10px]">
                            {anuncios.map(a => {
                                const ja = jaMonitorados.has(a.id);
                                return (
                                    <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                                        <input
                                            type="checkbox"
                                            aria-label={`Monitorar ${a.address ?? a.propertyType}`}
                                            disabled={ja}
                                            title={ja ? 'Já monitorado' : undefined}
                                            checked={ja || escolhidos.includes(a.id)}
                                            onChange={e => setEscolhidos(prev => (e.target.checked ? [...prev, a.id] : prev.filter(x => x !== a.id)))}
                                        />
                                        <span className="flex-1 min-w-0 truncate text-gray-800">{a.address ?? a.propertyType} <span className="text-gray-500">· {a.propertyType}{a.areaPrivate ? ` · ${a.areaPrivate} m²` : ''}</span></span>
                                        <span className="text-gray-500 tabular-nums">{a.distanciaKm.toLocaleString('pt-BR')} km</span>
                                        <span className="w-28 text-right text-gray-800 tabular-nums">{brl(a.price)}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    ))}
                </section>

                <section className="space-y-3">
                    <h4 className="text-sm font-semibold text-gray-700">Concorrente sem anúncio</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-4">
                        <div className="space-y-1.5">
                            <label htmlFor="mc-nome" className={ROTULO}>Nome</label>
                            <input id="mc-nome" className={CAMPO} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Residencial Jardins (incorporadora X)" />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="mc-preco" className={ROTULO}>Preço (R$)</label>
                            <MoneyCentsInput id="mc-preco" className={CAMPO} value={preco} onChange={v => setPreco(v === '' ? '' : Number(v))} placeholder="0,00" />
                        </div>
                    </div>
                </section>
            </SheetPanel>
            <SheetFooter>
                <Button variant="secondary" onClick={onClose}>Fechar</Button>
                <span title={motivoAdicionar} className="inline-flex">
                    <Button onClick={() => void adicionar()} disabled={!sujo || gravando}>
                        {gravando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Monitorar
                    </Button>
                </span>
            </SheetFooter>
        </Sheet>
    );
}
