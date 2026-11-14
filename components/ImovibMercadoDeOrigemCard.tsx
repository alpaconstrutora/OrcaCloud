import React, { useEffect, useState } from 'react';
import { MapPinned, Loader2 } from 'lucide-react';
import { ImovibStudy } from '../types';
import { opuraMarketService } from '../services/opuraMarketService';
import { useImovibEdicao } from '../hooks/useImovibEdicao';

type EstudoDeTerreno = Awaited<ReturnType<typeof opuraMarketService.getTerrainStudy>>;

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const fmtNum = (v: number, casas = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

/**
 * Estudo de mercado de origem (item 7.2 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): o estudo de terreno
 * do Ópura Market de onde a viabilidade nasceu. A absorção é hipótese do Market:
 * só entra na curva por botão.
 */
const ImovibMercadoDeOrigemCard: React.FC<{ study: ImovibStudy; onUsarVso: (vsoPct: number) => void; tipoDaCurva: string }> = ({ study, onUsarVso, tipoDaCurva }) => {
    const { pode, motivo } = useImovibEdicao();
    const id = study.opura_terrain_study_id;
    const [estudo, setEstudo] = useState<EstudoDeTerreno>(null);
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        if (!id) { setEstudo(null); return; }
        let vivo = true;
        setCarregando(true);
        opuraMarketService.getTerrainStudy(id)
            .then(e => { if (vivo) { setEstudo(e); setErro(null); } })
            .catch(e => { if (vivo) setErro((e as Error).message); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [id]);

    const s = estudo?.radiusStats;
    const absorcao = estudo?.estimatedAbsorptionVelocity ?? null;
    const motivoVso = !pode ? motivo : absorcao == null ? 'O estudo de mercado não tem absorção.' : undefined;

    return (
        <section className="bg-white rounded-[10px] p-6 border border-slate-100 shadow-sm space-y-4" aria-labelledby="imovib-mercado-origem-titulo">
            <div>
                <h2 id="imovib-mercado-origem-titulo" className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <MapPinned className="w-5 h-5 text-indigo-500" />
                    Estudo de mercado de origem
                </h2>
                <p className="text-slate-500 text-sm mt-1">O estudo de terreno do Ópura Market de onde esta viabilidade foi criada.</p>
            </div>
            {!id ? (
                <p className="text-sm text-slate-600">Esta viabilidade não nasceu de um estudo de terreno salvo no Ópura Market.</p>
            ) : carregando ? (
                <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando o estudo de mercado…</p>
            ) : erro ? (
                <p className="text-sm text-red-700">{erro}</p>
            ) : !estudo ? (
                <p className="text-sm text-slate-600">O estudo de mercado não está mais disponível (apagado ou sem acesso).</p>
            ) : (
                <>
                    <p className="text-sm text-slate-700">
                        <span className="font-medium">{estudo.name}</span> · raio de {fmtNum(estudo.analysisRadiusMeters)} m · {new Date(estudo.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                    {s ? (
                        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            {[
                                ['Preço/m² médio', fmtBRL(s.pricePerM2Avg)],
                                ['Anúncios', fmtNum(s.totalListings)],
                                ['Tíquete médio', fmtBRL(s.ticketAvg)],
                                ['Área média', `${fmtNum(s.areaAvg, 1)} m²`],
                            ].map(([rotulo, valor]) => (
                                <div key={rotulo} className="rounded-[10px] bg-slate-50 border border-slate-100 p-3">
                                    <dt className="text-xs font-semibold text-slate-500">{rotulo}</dt>
                                    <dd className="text-slate-800">{valor}</dd>
                                </div>
                            ))}
                        </dl>
                    ) : (
                        <p className="text-sm text-slate-600">Estatísticas do raio não guardadas neste estudo de mercado.</p>
                    )}
                    {absorcao != null && (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700">
                            <span>
                                Absorção gravada no estudo de mercado em {new Date(estudo.updatedAt ?? estudo.createdAt).toLocaleDateString('pt-BR')} (hipótese do Market): {fmtNum(absorcao, 2)}% ao mês. Não entra na curva sozinha.
                                <span className="block text-xs text-slate-500">Mudou as hipóteses no Market? Salve o estudo no Market para a absorção mudar aqui.</span>
                            </span>
                            <button
                                type="button"
                                disabled={!!motivoVso}
                                aria-label="Usar a absorção do Market na curva de vendas"
                                title={motivoVso ?? `Preenche a VSO da região e a VSO mensal da curva de vendas. Grava com "Salvar Premissas".${tipoDaCurva === 'vso' ? '' : ' A curva atual não é VSO: a VSO mensal só vale quando a curva é VSO (aba Receitas).'}`}
                                onClick={() => absorcao != null && onUsarVso(absorcao)}
                                className="h-9 px-3.5 text-[13px] font-medium rounded-[6px] border border-gray-200 bg-white text-slate-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Usar na curva de vendas
                            </button>
                        </div>
                    )}
                </>
            )}
        </section>
    );
};

export default ImovibMercadoDeOrigemCard;
