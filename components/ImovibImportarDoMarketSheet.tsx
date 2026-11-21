import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import Button from './ui/Button';
import { useToast } from '../hooks/useToast';
import { opuraMarketService } from '../services/opuraMarketService';
import { imovibService } from '../services/imovibService';
import type { ImovibComparable } from '../utils/imovibMercado';
import { comparavelDoConcorrente, jaEhComparavel, type ConcorrenteMonitorado, type Ponto } from '../utils/marketConcorrentes';

/**
 * "Importar do Market" (Fase 7.7 do plano docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md):
 * os concorrentes monitorados no estudo de terreno de onde este estudo nasceu viram comparáveis.
 * O que o Market não sabe (vendidas, valorização) fica em branco para preencher.
 */
interface Props {
    studyId: string;
    terrainStudyId: string;
    existentes: ImovibComparable[];
    hoje: string;
    onClose: () => void;
    onImportados: (novos: ImovibComparable[]) => void;
}

const brl = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));

export default function ImovibImportarDoMarketSheet({ studyId, terrainStudyId, existentes, hoje, onClose, onImportados }: Props) {
    const { showToast } = useToast();
    const [concorrentes, setConcorrentes] = useState<ConcorrenteMonitorado[] | null>(null);
    const [centro, setCentro] = useState<Ponto | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [escolhidos, setEscolhidos] = useState<string[]>([]);
    const [gravando, setGravando] = useState(false);

    useEffect(() => {
        let vivo = true;
        Promise.all([opuraMarketService.listarConcorrentes(terrainStudyId), opuraMarketService.centroDoEstudoDeTerreno(terrainStudyId)])
            .then(([l, c]) => {
                if (!vivo) return;
                setConcorrentes(l);
                setCentro(c ? { latitude: c.latitude, longitude: c.longitude } : null);
                setEscolhidos(l.filter(x => !jaEhComparavel(x, existentes)).map(x => x.id));
            })
            .catch(e => { if (vivo) setErro((e as Error).message); });
        return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [terrainStudyId]);

    const importar = async () => {
        const lista = (concorrentes ?? []).filter(c => escolhidos.includes(c.id));
        setGravando(true);
        const novos: ImovibComparable[] = [];
        try {
            for (const [i, c] of lista.entries()) {
                novos.push(await imovibService.salvarComparavel(comparavelDoConcorrente(c, studyId, centro, hoje, existentes.length + i)));
            }
            showToast(`${novos.length} comparável(is) importado(s) do Market. Preencha vendidas e lançamento para entrar na VSO.`, 'success');
            onImportados(novos);
        } catch (e) {
            if (novos.length) onImportados(novos);
            showToast(`${novos.length ? `${novos.length} importado(s); ` : ''}${(e as Error).message}`, 'error');
        } finally {
            setGravando(false);
        }
    };

    const motivo = !escolhidos.length ? 'Escolha ao menos um concorrente.' : undefined;

    return (
        <Sheet open onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Importar do Market</SheetTitle>
                <SheetDescription>Concorrentes monitorados no estudo de terreno de onde este estudo nasceu (Market › Estudos salvos › Concorrentes).</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6 space-y-3">
                {erro && <p className="text-sm text-red-700">{erro}</p>}
                {!concorrentes && !erro && <p className="text-sm text-slate-600 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Lendo os concorrentes…</p>}
                {concorrentes?.length === 0 && (
                    <p className="text-sm text-slate-600">Nenhum concorrente monitorado neste terreno. Adicione em Market › Estudos & Análise › Estudos salvos › Concorrentes.</p>
                )}
                {!!concorrentes?.length && (
                    <ul className="divide-y divide-gray-100 border border-gray-100 rounded-[10px]">
                        {concorrentes.map(c => {
                            const ja = jaEhComparavel(c, existentes);
                            return (
                                <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                                    <input
                                        type="checkbox"
                                        aria-label={`Importar ${c.nome}`}
                                        checked={escolhidos.includes(c.id)}
                                        onChange={e => setEscolhidos(prev => (e.target.checked ? [...prev, c.id] : prev.filter(x => x !== c.id)))}
                                    />
                                    <span className="flex-1 min-w-0 text-gray-800">
                                        <span className="block truncate">{c.nome}</span>
                                        <span className="block text-xs text-gray-500 truncate">{[c.endereco, ja ? 'já está nos comparáveis' : null].filter(Boolean).join(' · ')}</span>
                                    </span>
                                    <span className="w-28 text-right text-gray-800 tabular-nums">{brl(c.preco)}</span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </SheetPanel>
            <SheetFooter>
                <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                <span className="inline-flex" title={motivo}>
                    <Button onClick={() => void importar()} disabled={!!motivo || gravando}>
                        {gravando && <Loader2 className="w-4 h-4 animate-spin" />} Importar {escolhidos.length || ''}
                    </Button>
                </span>
            </SheetFooter>
        </Sheet>
    );
}
