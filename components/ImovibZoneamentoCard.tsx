import React, { useEffect, useState } from 'react';
import { Landmark, Loader2 } from 'lucide-react';
import { ImovibStudy } from '../types';
import type { EmpreendimentoRegulatoryZone } from '../types/empreendimento';
import { empreendimentoService } from '../services/empreendimentoService';
import { useImovibMath } from '../hooks/useImovibMath';

/** Número que o Mapa Regulatório guarda como texto ("1,5", "2.0"); vazio ou inválido = null. */
const numero = (s: string | null | undefined): number | null => {
    const n = parseFloat(String(s ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};
/** O Mapa Regulatório guarda a taxa ora como fração (0,9), ora em % (90). */
const taxaDeOcupacao = (s: string | null | undefined): string | null => {
    const n = numero(s);
    if (n == null) return s || null;
    return `${(n <= 1 ? n * 100 : n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
};
const fmtM2 = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m²`;

/**
 * Zona aplicável do empreendimento, só leitura (item 5.8 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): coeficientes,
 * ocupação, gabarito, vagas e o potencial construtivo ao lado da área construída
 * do estudo. Não gera aviso.
 */
const ImovibZoneamentoCard: React.FC<{ study: ImovibStudy }> = ({ study }) => {
    const r = useImovibMath(study);
    const vinculado = study.estrutura?.origem === 'empreendimento';
    const [zona, setZona] = useState<EmpreendimentoRegulatoryZone | null>(null);
    const [carregando, setCarregando] = useState(false);

    useEffect(() => {
        if (!vinculado) { setZona(null); return; }
        let vivo = true;
        setCarregando(true);
        empreendimentoService.listRegulatoryZonesByImovibStudy(study.id)
            .then(z => { if (vivo) setZona(z.find(x => x.aplicavel) ?? null); })
            .catch(() => { if (vivo) setZona(null); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [study.id, vinculado]);

    const plantaId = study.estrutura?.blueprint_study_id;
    const linkDoMapa = plantaId
        ? <a href={`#/blueprint?studyId=${plantaId}`} className="text-indigo-600 hover:underline">aba Mapa Regulatório da Planta Inteligente</a>
        : 'aba Mapa Regulatório da Planta Inteligente do empreendimento';

    const area = study.estrutura?.terreno_area ?? study.terreno_area ?? null;
    const caBasico = numero(zona?.ca_basico);
    const caMaximo = numero(zona?.ca_maximo);
    const linhas: [string, string | null | undefined][] = zona ? [
        ['Zona', [zona.macroarea, zona.zona].filter(Boolean).join(' · ')],
        ['Coeficiente básico', zona.ca_basico],
        ['Coeficiente máximo', zona.ca_maximo],
        ['Taxa de ocupação máxima', taxaDeOcupacao(zona.taxa_ocupacao_maxima)],
        ['Gabarito', [zona.gabarito_altura_maxima && `${zona.gabarito_altura_maxima} m`, zona.gabarito_pavimentos && `${zona.gabarito_pavimentos} pavimentos`].filter(Boolean).join(' · ')],
        ['Vagas', [zona.regra_vagas, zona.vagas_por_unidade && `${zona.vagas_por_unidade} por unidade`].filter(Boolean).join(' · ')],
        ['Lei de referência', zona.lei_referencia],
    ] : [];

    return (
        <section className="bg-white rounded-[10px] p-6 border border-slate-100 shadow-sm space-y-4" aria-labelledby="imovib-zona-titulo">
            <div>
                <h2 id="imovib-zona-titulo" className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <Landmark className="w-5 h-5 text-indigo-500" />
                    Zoneamento do terreno
                </h2>
                <p className="text-slate-500 text-sm mt-1">A zona aplicável do empreendimento, só leitura.</p>
            </div>

            {carregando ? (
                <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando a zona…</p>
            ) : !vinculado ? (
                <p className="text-sm text-slate-600">Vincule um empreendimento acima: a zona vem do Mapa Regulatório dele.</p>
            ) : !zona ? (
                <p className="text-sm text-slate-600">O empreendimento não tem zona marcada como aplicável. Cadastre-a na {linkDoMapa}.</p>
            ) : (
                <>
                    <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                        {linhas.filter(([, v]) => v).map(([rotulo, v]) => (
                            <div key={rotulo} className="flex justify-between gap-4 border-b border-slate-100 py-1.5">
                                <dt className="text-sm text-slate-500">{rotulo}</dt>
                                <dd className="text-sm text-slate-800 text-right">{v}</dd>
                            </div>
                        ))}
                    </dl>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div className="rounded-[10px] bg-slate-50 border border-slate-100 p-3">
                            <span className="block text-xs font-semibold text-slate-500">Potencial no coeficiente básico</span>
                            <span className="text-slate-800">{area != null && caBasico != null ? fmtM2(area * caBasico) : '—'}</span>
                        </div>
                        <div className="rounded-[10px] bg-slate-50 border border-slate-100 p-3">
                            <span className="block text-xs font-semibold text-slate-500">Potencial no coeficiente máximo</span>
                            <span className="text-slate-800">{area != null && caMaximo != null ? fmtM2(area * caMaximo) : '—'}</span>
                        </div>
                        <div className="rounded-[10px] bg-slate-50 border border-slate-100 p-3">
                            <span className="block text-xs font-semibold text-slate-500">Área construída do estudo</span>
                            <span className="text-slate-800">{fmtM2(r.totalBlockArea)}</span>
                        </div>
                    </div>
                    <p className="text-xs text-slate-500">
                        {area == null ? 'Sem área do terreno no empreendimento: o potencial fica em branco. ' : `Área do terreno: ${fmtM2(area)}. `}
                        A área construída do estudo não é área computável (áreas não computáveis seguem a lei do município). Ajuste a zona na {linkDoMapa}.
                    </p>
                </>
            )}
        </section>
    );
};

export default ImovibZoneamentoCard;
