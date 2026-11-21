import React, { useEffect, useMemo, useState } from 'react';
import { Handshake, Loader2, AlertCircle, Plus } from 'lucide-react';
import type { ImovibStudy } from '../types';
import { imovibService, type ModeloDeAquisicaoGravado } from '../services/imovibService';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { useToast } from '../hooks/useToast';
import { computeImovibMath } from '../utils/imovibMotor';
import {
    ROTULO_DA_AQUISICAO, resultadoDoModelo, resultadoDoEstudo,
    type TipoDeAquisicao, type PremissasDaAquisicao, type ResultadoDoModelo,
} from '../utils/imovibModelosDeAquisicao';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
import ActionIconButton from './ui/ActionIconButton';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import MoneyCentsInput from './ui/MoneyCentsInput';

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const fmtTir = (v: number | null) => (v == null ? 'Sem TIR' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% a.a.`);
const CAMPO = 'h-9 w-full px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

type Campo = { k: keyof PremissasDaAquisicao; rotulo: string; tipo: 'dinheiro' | 'pct' | 'inteiro' };
/** Premissas de cada modelo (só as do tipo escolhido valem). */
const CAMPOS: Record<TipoDeAquisicao, Campo[]> = {
    compra_direta: [
        { k: 'valor_total', rotulo: 'Valor total (R$)', tipo: 'dinheiro' },
        { k: 'entrada', rotulo: 'Entrada (R$)', tipo: 'dinheiro' },
        { k: 'num_parcelas', rotulo: 'Parcelas mensais do saldo', tipo: 'inteiro' },
        { k: 'taxa_correcao_mensal_pct', rotulo: 'Correção das parcelas (% ao mês)', tipo: 'pct' },
    ],
    permuta_fisica: [
        { k: 'valor_referencia_unidades', rotulo: 'Valor das unidades permutadas (R$)', tipo: 'dinheiro' },
        { k: 'unidades_prometidas', rotulo: 'Unidades prometidas (sem valor)', tipo: 'inteiro' },
    ],
    permuta_financeira: [
        { k: 'percentual_sobre_vgv', rotulo: 'Percentual sobre o VGV (%)', tipo: 'pct' },
        { k: 'valor_minimo_garantido', rotulo: 'Mínimo garantido ao terrenista (R$)', tipo: 'dinheiro' },
    ],
    opcao_compra: [
        { k: 'premio_opcao', rotulo: 'Prêmio da opção (R$)', tipo: 'dinheiro' },
        { k: 'valor_exercicio', rotulo: 'Valor do exercício (R$)', tipo: 'dinheiro' },
        { k: 'prazo_opcao_meses', rotulo: 'Prazo até o exercício (meses)', tipo: 'inteiro' },
    ],
    sociedade: [
        { k: 'participacao_pct', rotulo: 'Participação do proprietário no lucro (%)', tipo: 'pct' },
    ],
};

const COLUNAS: StandardTableColumn[] = [
    { key: 'name', label: 'Modelo', width: 220 },
    { key: 'deal_type', label: 'Tipo', width: 170 },
    { key: 'caixa', label: 'Terreno em caixa', width: 140, align: 'right' },
    { key: 'exposicao', label: 'Exposição máxima', width: 140, align: 'right' },
    { key: 'lucro', label: 'Lucro', width: 130, align: 'right' },
    { key: 'vpl', label: 'VPL', width: 130, align: 'right' },
    { key: 'tir', label: 'TIR', width: 110, align: 'right' },
];

type Linha = { id: string; name: string; deal_type: TipoDeAquisicao | null; r: Omit<ResultadoDoModelo, 'premissas'>; modelo?: ModeloDeAquisicaoGravado; premissas?: ResultadoDoModelo['premissas'] };

interface Props {
    study: ImovibStudy;
    /** Estudo com o formulário de Premissas ainda não salvo (a comparação acompanha o que está na tela). */
    estudo: ImovibStudy;
    /** "Usar no estudo": preenche custo, parcelas e permutas — grava com "Salvar Premissas". */
    setCampo: (campo: keyof ImovibStudy, valor: unknown) => void;
}

/**
 * Modelos de aquisição do terreno (item 1.4 do plano
 * docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md). Antes era aba da
 * Oportunidade e calculava fora do motor; aqui cada modelo é uma variante das
 * premissas do estudo, calculada por computeImovibMath.
 */
const ImovibModelosDeAquisicaoCard: React.FC<Props> = ({ study, estudo, setCampo }) => {
    const { pode, motivo } = useImovibEdicao();
    const { showToast } = useToast();
    const [modelos, setModelos] = useState<ModeloDeAquisicaoGravado[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [editando, setEditando] = useState<ModeloDeAquisicaoGravado | 'novo' | null>(null);

    useEffect(() => {
        let vivo = true;
        setCarregando(true);
        imovibService.listarModelosDeAquisicao(study.id)
            .then(l => { if (vivo) { setModelos(l); setErro(null); } })
            .catch(e => { if (vivo) setErro((e as Error).message); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [study.id]);

    const linhas = useMemo<Linha[]>(() => {
        const base = computeImovibMath(estudo);
        return [
            { id: '__estudo', name: 'Estudo atual', deal_type: null, r: resultadoDoEstudo(estudo, base) },
            ...modelos.map(m => {
                const { premissas, ...r } = resultadoDoModelo(estudo, m, base);
                return { id: m.id, name: m.name, deal_type: m.deal_type, r, modelo: m, premissas };
            }),
        ];
    }, [estudo, modelos]);

    const excluir = async (m: ModeloDeAquisicaoGravado) => {
        try {
            await imovibService.excluirModeloDeAquisicao(m.id);
            setModelos(prev => prev.filter(x => x.id !== m.id));
        } catch (e) {
            showToast((e as Error).message, 'error');
        }
    };

    const usarNoEstudo = (l: Linha) => {
        if (!l.premissas) return;
        setCampo('land_cost', l.premissas.land_cost);
        setCampo('land_payment_schedule', l.premissas.land_payment_schedule);
        setCampo('swap_physical_percent', l.premissas.swap_physical_percent);
        setCampo('swap_financial_percent', l.premissas.swap_financial_percent);
        showToast(`"${l.name}" preenchido nas premissas. Clique em "Salvar Premissas" para gravar.`, 'success');
    };

    return (
        <section className="bg-white rounded-[10px] p-6 border border-slate-100 shadow-sm space-y-4" aria-labelledby="imovib-aquisicao-titulo">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 id="imovib-aquisicao-titulo" className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <Handshake className="w-5 h-5 text-indigo-500" />
                        Modelos de aquisição
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Compra, permuta, opção ou sociedade: cada modelo roda o estudo inteiro com o terreno daquele jeito. Nada muda no estudo até "Usar no estudo".</p>
                </div>
                <button
                    type="button"
                    disabled={!pode}
                    title={!pode ? motivo : undefined}
                    onClick={() => setEditando('novo')}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Plus className="w-[15px] h-[15px]" /> Novo modelo
                </button>
            </div>

            {erro && (
                <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                </div>
            )}

            <StandardTable<Linha>
                storageKey="imovib:modelos-de-aquisicao"
                columns={COLUNAS}
                rows={linhas}
                rowKey={l => l.id}
                loading={carregando}
                dense
                bare
                onRowClick={l => { if (l.modelo) setEditando(l.modelo); }}
                renderCell={(k, l) => {
                    const forte = l.deal_type == null ? 'font-semibold text-slate-900' : 'text-gray-700';
                    switch (k) {
                        case 'name': return <span className={`text-sm ${forte}`}>{l.name}</span>;
                        case 'deal_type': return <span className="text-sm text-gray-700">{l.deal_type ? ROTULO_DA_AQUISICAO[l.deal_type] : 'Premissas de hoje'}</span>;
                        case 'caixa': return <span className={`text-sm ${forte}`}>{fmtBRL(l.r.caixaDoTerreno)}</span>;
                        case 'exposicao': return <span className={`text-sm ${forte}`}>{fmtBRL(l.r.exposicaoMaxima)}</span>;
                        case 'lucro': return (
                            <span className={`text-sm ${forte}`} title={l.r.parteDoProprietario ? `Já sem a parte do proprietário: ${fmtBRL(l.r.parteDoProprietario)}` : undefined}>
                                {fmtBRL(l.r.lucro)}
                            </span>
                        );
                        case 'vpl': return <span className={`text-sm ${forte}`}>{fmtBRL(l.r.vpl)}</span>;
                        case 'tir': return <span className={`text-sm ${forte}`}>{fmtTir(l.r.tirAnual)}</span>;
                        default: return null;
                    }
                }}
                actions={{
                    width: 100,
                    render: l => (l.modelo ? (
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                            <ActionIconButton kind="edit" title={pode ? 'Editar o modelo' : 'Ver o modelo'} onClick={() => setEditando(l.modelo!)} />
                            {pode && <InlineDisclosureMenu showDelete onDelete={() => void excluir(l.modelo!)} />}
                        </div>
                    ) : null),
                }}
                empty={{
                    icon: <Handshake className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhum modelo',
                    subtitle: 'Ex.: compra com entrada e 12 parcelas × permuta de 10% do VGV.',
                }}
            />

            <ModeloSheet
                modelo={editando}
                study={study}
                proximaOrdem={modelos.length}
                linha={editando && editando !== 'novo' ? linhas.find(l => l.id === editando.id) ?? null : null}
                onUsar={usarNoEstudo}
                onClose={() => setEditando(null)}
                onSalvo={(m, criado) => {
                    setModelos(prev => (criado ? [...prev, m] : prev.map(x => (x.id === m.id ? m : x))));
                    setEditando(criado ? null : m);
                }}
            />
        </section>
    );
};

function ModeloSheet({ modelo, study, proximaOrdem, linha, onUsar, onClose, onSalvo }: {
    modelo: ModeloDeAquisicaoGravado | 'novo' | null;
    study: ImovibStudy;
    proximaOrdem: number;
    linha: Linha | null;
    onUsar: (l: Linha) => void;
    onClose: () => void;
    onSalvo: (m: ModeloDeAquisicaoGravado, criado: boolean) => void;
}) {
    const { pode, motivo: motivoRo } = useImovibEdicao();
    const [nome, setNome] = useState('');
    const [tipo, setTipo] = useState<TipoDeAquisicao>('compra_direta');
    const [premissas, setPremissas] = useState<PremissasDaAquisicao>({});
    const [notas, setNotas] = useState('');
    const [mudou, setMudou] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        if (!modelo) return;
        const m = modelo === 'novo' ? null : modelo;
        setNome(m?.name ?? '');
        setTipo(m?.deal_type ?? 'compra_direta');
        setPremissas(m?.premises_json ?? {});
        setNotas(m?.notes ?? '');
        setMudou(false);
        setErro(null);
    }, [modelo]);

    if (!modelo) return null;
    const novo = modelo === 'novo';
    const campos = CAMPOS[tipo];
    const negativo = campos.some(c => (premissas[c.k] ?? 0) < 0);
    const motivo = !pode ? motivoRo : !nome.trim() ? 'Dê um nome ao modelo.' : negativo ? 'Valores não podem ser negativos.' : !mudou ? 'Nada foi alterado.' : undefined;
    const mudar = (k: keyof PremissasDaAquisicao, v: number | null) => { setPremissas(prev => ({ ...prev, [k]: v })); setMudou(true); };

    const salvar = async () => {
        if (motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            // Só as premissas do tipo escolhido vão para o banco.
            const so = Object.fromEntries(campos.map(c => [c.k, premissas[c.k] ?? null]));
            const salvo = await imovibService.salvarModeloDeAquisicao({
                ...(novo ? {} : { id: modelo.id }),
                study_id: study.id,
                name: nome.trim(),
                deal_type: tipo,
                premises_json: so,
                notes: notas.trim() || null,
                sort_order: novo ? proximaOrdem : modelo.sort_order,
            });
            setMudou(false);
            onSalvo(salvo, novo);
        } catch (e) {
            setErro((e as Error).message);
        } finally {
            setSalvando(false);
        }
    };

    const motivoUsar = !pode ? motivoRo : novo || !linha ? 'Salve o modelo antes.' : mudou ? 'Salve as alterações antes.' : undefined;

    return (
        <Sheet open={!!modelo} onClose={onClose} size="lg" dirty={mudou}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{novo ? 'Novo modelo de aquisição' : 'Modelo de aquisição'}</SheetTitle>
                <SheetDescription>O resultado é o do motor: o estudo inteiro roda com o terreno deste jeito.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                {erro && (
                    <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                    </div>
                )}
                <fieldset disabled={!pode} title={!pode ? motivoRo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 space-y-4">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label htmlFor="imovib-aquisicao-nome" className="text-xs font-semibold text-slate-500">Nome</label>
                            <input id="imovib-aquisicao-nome" value={nome} onChange={e => { setNome(e.target.value); setMudou(true); }} className={CAMPO} />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="imovib-aquisicao-tipo" className="text-xs font-semibold text-slate-500">Tipo</label>
                            <select id="imovib-aquisicao-tipo" value={tipo} onChange={e => { setTipo(e.target.value as TipoDeAquisicao); setMudou(true); }} className={`${CAMPO} cursor-pointer`}>
                                {(Object.keys(ROTULO_DA_AQUISICAO) as TipoDeAquisicao[]).map(t => <option key={t} value={t}>{ROTULO_DA_AQUISICAO[t]}</option>)}
                            </select>
                        </div>
                        {campos.map(c => (
                            <div key={c.k} className="space-y-1.5">
                                <label htmlFor={`imovib-aquisicao-${c.k}`} className="text-xs font-semibold text-slate-500">{c.rotulo}</label>
                                {c.tipo === 'dinheiro' ? (
                                    <MoneyCentsInput id={`imovib-aquisicao-${c.k}`} value={premissas[c.k] ?? null} onChange={v => mudar(c.k, v == null || v === '' ? null : Number(v))} className={CAMPO} />
                                ) : (
                                    <input id={`imovib-aquisicao-${c.k}`} type="number" min={0} step={c.tipo === 'inteiro' ? 1 : 0.1}
                                        value={premissas[c.k] ?? ''}
                                        onChange={e => mudar(c.k, e.target.value === '' ? null : c.tipo === 'inteiro' ? Math.round(Number(e.target.value)) : Number(e.target.value))}
                                        className={CAMPO} />
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="imovib-aquisicao-notas" className="text-xs font-semibold text-slate-500">Observações</label>
                        <textarea id="imovib-aquisicao-notas" rows={3} value={notas} onChange={e => { setNotas(e.target.value); setMudou(true); }}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" />
                    </div>
                </fieldset>
                {linha && !mudou && (
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-[10px] bg-slate-50 border border-slate-100 p-4 text-sm">
                        <dt className="text-slate-500">VPL</dt><dd className="text-slate-900 font-medium text-right">{fmtBRL(linha.r.vpl)}</dd>
                        <dt className="text-slate-500">TIR</dt><dd className="text-slate-900 font-medium text-right">{fmtTir(linha.r.tirAnual)}</dd>
                        <dt className="text-slate-500">Exposição máxima</dt><dd className="text-slate-900 font-medium text-right">{fmtBRL(linha.r.exposicaoMaxima)}</dd>
                        <dt className="text-slate-500">Lucro</dt><dd className="text-slate-900 font-medium text-right">{fmtBRL(linha.r.lucro)}</dd>
                        {linha.r.parteDoProprietario > 0 && (<><dt className="text-slate-500">Parte do proprietário</dt><dd className="text-slate-900 font-medium text-right">{fmtBRL(linha.r.parteDoProprietario)}</dd></>)}
                    </dl>
                )}
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">{novo ? 'Cancelar' : 'Fechar'}</button>
                {!novo && (
                    <button type="button" onClick={() => linha && onUsar(linha)} disabled={!!motivoUsar} title={motivoUsar ?? 'Preenche custo, parcelas e permutas nas premissas (grava com "Salvar Premissas").'}
                        className="h-9 px-3.5 border border-gray-200 bg-white text-slate-700 rounded-[6px] hover:bg-slate-50 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                        Usar no estudo
                    </button>
                )}
                <button type="button" onClick={() => void salvar()} disabled={salvando || !!motivo} title={motivo}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                    {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                    {novo ? 'Criar modelo' : 'Salvar modelo'}
                </button>
            </SheetFooter>
        </Sheet>
    );
}

export default ImovibModelosDeAquisicaoCard;
