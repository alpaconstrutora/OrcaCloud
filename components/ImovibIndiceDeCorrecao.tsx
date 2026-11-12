import React, { useEffect, useRef, useState } from 'react';
import { ImovibStudyUpdate } from '../types';
import { contractIndexService, IndexName } from '../services/contractIndexService';
import { serieDoIndice, taxaMensalMedia } from '../utils/indiceVariacao';

type CampoNome = 'inflation_index_obra' | 'inflation_index_vendas';
type CampoTaxa = 'cost_index_rate_monthly' | 'sales_index_rate_monthly';

interface ImovibIndiceDeCorrecaoProps {
    rotulo: string;
    campoNome: CampoNome;
    campoTaxa: CampoTaxa;
    nome: string | null | undefined;
    taxa: number | null | undefined;
    /** Inflação geral do estudo (% a.m.), usada quando a taxa fica vazia. */
    inflacaoGeral: number;
    organizationId: string | undefined;
    salvar: (campos: ImovibStudyUpdate) => Promise<void>;
}

const INDICES: IndexName[] = ['INCC-M', 'INCC', 'IPCA', 'IGP-M', 'CUB'];
const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

/**
 * Índice de correção da obra ou das vendas (item 1.7 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). A taxa vazia
 * segue a inflação geral; o botão sugere a média dos últimos 12 meses da série
 * cadastrada em `contract_index_values`.
 */
const ImovibIndiceDeCorrecao: React.FC<ImovibIndiceDeCorrecaoProps> = ({
    rotulo, campoNome, campoTaxa, nome, taxa, inflacaoGeral, organizationId, salvar,
}) => {
    const [texto, setTexto] = useState(taxa == null ? '' : String(taxa));
    useEffect(() => { setTexto(taxa == null ? '' : String(taxa)); }, [taxa]);

    // Escolheu o índice com a taxa vazia: quando a série chegar, a taxa vira a média
    // (item 2.6 do plano 2026-11-11 — antes, escolher o índice não mudava o cálculo).
    // Guarda PARA QUAL índice o preenchimento foi pedido: a série de um índice
    // trocado logo em seguida pode chegar depois e não pode gravar a taxa.
    const preencherPara = useRef<string | null>(null);
    const taxaRef = useRef(taxa);
    taxaRef.current = taxa;

    const [media, setMedia] = useState<number | null>(null);
    const [motivo, setMotivo] = useState('Escolha o índice para sugerir a taxa pela série histórica.');
    useEffect(() => {
        if (!nome) { setMedia(null); setMotivo('Escolha o índice para sugerir a taxa pela série histórica.'); return; }
        let vivo = true;
        setMedia(null);
        setMotivo(`Lendo a série do ${nome}…`);
        contractIndexService.list(nome as IndexName, organizationId, 26)
            .then(valores => {
                if (!vivo) return;
                const m = taxaMensalMedia(serieDoIndice(valores), 12);
                setMedia(m);
                setMotivo(m == null ? `Não há série do ${nome} com dois meses ou mais. Cadastre em Contratos › Índices.` : '');
                if (preencherPara.current !== nome) return;
                preencherPara.current = null;
                if (m != null && taxaRef.current == null) {
                    salvar({ [campoTaxa]: Math.round(m * 10000) / 10000 } as ImovibStudyUpdate);
                }
            })
            .catch(e => {
                if (!vivo) return;
                setMotivo(`Não foi possível ler a série do ${nome}: ${(e as Error).message}`);
            });
        return () => { vivo = false; };
    }, [nome, organizationId]);

    const idNome = `imovib-${campoNome}`;
    const idTaxa = `imovib-${campoTaxa}`;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-x-6 gap-y-2 items-end">
            <div>
                <label htmlFor={idNome} className="block text-xs font-semibold text-slate-500 mb-1.5">{rotulo}</label>
                <select
                    id={idNome}
                    value={nome ?? ''}
                    onChange={(e) => {
                        preencherPara.current = e.target.value && taxa == null ? e.target.value : null;
                        salvar({ [campoNome]: e.target.value || null } as ImovibStudyUpdate);
                    }}
                    className="h-9 w-full px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                    <option value="">Sem índice próprio</option>
                    {INDICES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor={idTaxa} className="block text-xs font-semibold text-slate-500 mb-1.5">Taxa (% a.m.)</label>
                <input
                    id={idTaxa}
                    type="number"
                    step="0.01"
                    value={texto}
                    placeholder={`Vazio = inflação geral (${fmt(inflacaoGeral)}%)`}
                    onChange={(e) => setTexto(e.target.value)}
                    onBlur={() => {
                        const n = texto.trim() === '' ? null : parseFloat(texto);
                        const valor = n == null || Number.isNaN(n) ? null : n;
                        if (valor !== (taxa ?? null)) salvar({ [campoTaxa]: valor } as ImovibStudyUpdate);
                    }}
                    className="w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                />
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    disabled={media == null}
                    title={media == null ? motivo : undefined}
                    onClick={() => media != null && salvar({ [campoTaxa]: Math.round(media * 10000) / 10000 } as ImovibStudyUpdate)}
                    className="h-9 px-3.5 text-[13px] font-medium rounded-[6px] border border-gray-200 bg-white text-slate-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {media == null ? 'Usar a média dos últimos 12 meses' : `Usar a média dos últimos 12 meses (${fmt(media)}% a.m.)`}
                </button>
                {taxa == null && (
                    <span className="text-xs text-slate-500">Sem taxa própria: segue a inflação geral ({fmt(inflacaoGeral)}% a.m.).</span>
                )}
            </div>
        </div>
    );
};

export default ImovibIndiceDeCorrecao;
