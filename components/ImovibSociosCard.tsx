import React, { useEffect, useMemo, useState } from 'react';
import { Users, Loader2, AlertCircle, Plus } from 'lucide-react';
import { ImovibStudy } from '../types';
import type { ImovibMathResult } from '../hooks/useImovibMath';
import { imovibService } from '../services/imovibService';
import { empreendimentoService } from '../services/empreendimentoService';
import { companyService } from '../services/companyService';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { useToast } from '../hooks/useToast';
import { resultadoPorSocio, type ImovibPartner, type SocioDaEmpresa } from '../utils/imovibSocios';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
import ActionIconButton from './ui/ActionIconButton';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';

interface ImovibSociosCardProps {
    study: ImovibStudy;
    /** Resultado do motor: os aportes e distribuições que os sócios repartem. */
    resultado: ImovibMathResult;
}

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const fmtPct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
/** Hoje em 'AAAA-MM-DD' local: sócio com saída até hoje não entra na importação. */
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const COLUNAS: StandardTableColumn[] = [
    { key: 'name', label: 'Sócio', sortable: true, width: 220 },
    { key: 'share_percent', label: 'Resultado', sortable: true, width: 110, align: 'right' },
    { key: 'capital_percent', label: 'Aportes', sortable: true, width: 110, align: 'right' },
    { key: 'aportes', label: 'Aporta', width: 140, align: 'right' },
    { key: 'distribuicoes', label: 'Recebe', width: 140, align: 'right' },
    { key: 'lucro', label: 'Lucro', width: 140, align: 'right' },
    { key: 'tir', label: 'TIR', width: 110, align: 'right' },
];

/**
 * Sócios e resultado por sócio (item 9.2 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, decisão D3). Os
 * sócios repartem os aportes e as distribuições do incorporador (cartão "Aportes e
 * distribuições"); o cálculo é utils/imovibSocios.ts. Não muda o resultado do estudo.
 */
const ImovibSociosCard: React.FC<ImovibSociosCardProps> = ({ study, resultado }) => {
    const { pode, motivo } = useImovibEdicao();
    const { showToast } = useToast();
    const [lista, setLista] = useState<ImovibPartner[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [editando, setEditando] = useState<ImovibPartner | 'novo' | null>(null);
    const [importando, setImportando] = useState(false);

    useEffect(() => {
        let vivo = true;
        setCarregando(true);
        imovibService.listarSocios(study.id)
            .then(l => { if (vivo) { setLista(l); setErro(null); } })
            .catch(e => { if (vivo) setErro((e as Error).message); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [study.id]);

    // Sócios da empresa do empreendimento vinculado — só lê; importar é por botão.
    const empId = study.estrutura?.origem === 'empreendimento' ? study.estrutura.empreendimento_id : undefined;
    const [daEmpresa, setDaEmpresa] = useState<{ empresa: string | null; socios: SocioDaEmpresa[]; erro?: string } | null>(null);
    useEffect(() => {
        setDaEmpresa(null);
        if (!empId) return;
        let vivo = true;
        (async () => {
            const emp = await empreendimentoService.getById(empId);
            if (!emp?.company_id) return { empresa: null, socios: [] };
            const [empresa, socios] = await Promise.all([companyService.get(emp.company_id), companyService.listPartners(emp.company_id)]);
            const hoje = hojeLocal();
            return {
                empresa: empresa?.nome_fantasia || empresa?.razao_social || 'a empresa do empreendimento',
                // Sócios atuais: já entraram e ainda não saíram.
                socios: socios
                    .filter(p => (!p.data_entrada || p.data_entrada <= hoje) && (!p.data_saida || p.data_saida > hoje))
                    .map(p => ({ id: p.id, nome: p.nome, participacao_pct: p.participacao_pct })),
            };
        })()
            .then(r => { if (vivo) setDaEmpresa(r); })
            .catch(e => { if (vivo) setDaEmpresa({ empresa: null, socios: [], erro: `Não foi possível ler os sócios da empresa: ${(e as Error).message}` }); });
        return () => { vivo = false; };
    }, [empId]);

    const calculo = useMemo(() => resultadoPorSocio(resultado.aportes, lista), [resultado.aportes, lista]);
    const porId = new Map(lista.map((s, i) => [s.id, calculo.socios[i]]));

    const motivoImportar = !pode ? motivo
        : !daEmpresa ? 'Lendo os sócios da empresa…'
            : daEmpresa.erro ? daEmpresa.erro
            : !daEmpresa.empresa ? 'O empreendimento vinculado não tem empresa: defina a empresa (SPE) no cadastro do empreendimento.'
                : daEmpresa.socios.length === 0 ? `${daEmpresa.empresa} não tem sócios atuais no quadro societário.` : undefined;

    const importar = async () => {
        if (motivoImportar || !daEmpresa) return;
        setImportando(true);
        try {
            const r = await imovibService.importarSociosDaEmpresa(study.id, daEmpresa.socios, lista);
            setLista(r.lista);
            const partes = [
                r.vinculados ? `${r.vinculados} sócio${r.vinculados > 1 ? 's' : ''} já digitado${r.vinculados > 1 ? 's' : ''} ligado${r.vinculados > 1 ? 's' : ''} ao da empresa (percentuais mantidos)` : '',
                r.criados ? `${r.criados} importado${r.criados > 1 ? 's' : ''}` : '',
            ].filter(Boolean);
            showToast(partes.length ? `${partes.join('; ')}.` : 'Os sócios atuais da empresa já estão na lista.', 'success');
        } catch (e) {
            showToast((e as Error).message, 'error');
        } finally {
            setImportando(false);
        }
    };
    const excluir = async (s: ImovibPartner) => {
        try {
            await imovibService.excluirSocio(s.id);
            setLista(prev => prev.filter(x => x.id !== s.id));
        } catch (e) {
            showToast((e as Error).message, 'error');
        }
    };

    return (
        <section className="bg-white rounded-[10px] p-6 border border-gray-200 space-y-4" aria-labelledby="imovib-socios-titulo">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 id="imovib-socios-titulo" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Users className="w-5 h-5 text-indigo-500" />
                        Sócios
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">
                        Repartem os aportes e as distribuições do incorporador: aportam pela participação nos aportes; cada distribuição devolve primeiro o capital de cada um e o lucro vai pela participação no resultado.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {empId && (
                        <button
                            type="button"
                            onClick={() => void importar()}
                            disabled={!!motivoImportar || importando}
                            title={motivoImportar}
                            className="flex items-center gap-1.5 h-9 px-3.5 text-[13px] font-medium rounded-[6px] border border-gray-200 bg-white text-slate-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {importando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                            Importar os sócios da empresa
                        </button>
                    )}
                    <button
                        type="button"
                        disabled={!pode}
                        title={!pode ? motivo : undefined}
                        onClick={() => setEditando('novo')}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Plus className="w-[15px] h-[15px]" /> Novo sócio
                    </button>
                </div>
            </div>

            {erro && (
                <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                </div>
            )}
            {calculo.avisos.map(a => (
                <div key={a} className="flex items-start gap-2 rounded-[10px] bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {a}
                </div>
            ))}

            <StandardTable<ImovibPartner>
                storageKey="imovib:socios"
                columns={COLUNAS}
                rows={lista}
                rowKey={s => s.id}
                loading={carregando}
                dense
                bare
                sortValue={(k, s) => (k === 'share_percent' ? Number(s.share_percent) || 0 : k === 'capital_percent' ? Number(s.capital_percent) || 0 : s.name)}
                onRowClick={s => setEditando(s)}
                renderCell={(k, s) => {
                    const r = porId.get(s.id);
                    switch (k) {
                        case 'name': return <span className="block text-sm text-gray-700">{s.name}</span>;
                        case 'share_percent': return <span className="text-sm text-gray-700">{fmtPct(Number(s.share_percent) || 0)}</span>;
                        case 'capital_percent': return <span className="text-sm text-gray-700">{fmtPct(Number(s.capital_percent) || 0)}</span>;
                        case 'aportes': return <span className="text-sm text-gray-700">{r ? fmtBRL(r.aportes) : '—'}</span>;
                        case 'distribuicoes': return <span className="text-sm text-gray-700">{r ? fmtBRL(r.distribuicoes) : '—'}</span>;
                        case 'lucro': return <span className={`text-sm ${r && r.lucro < 0 ? 'text-red-600' : 'text-gray-700'}`}>{r ? fmtBRL(r.lucro) : '—'}</span>;
                        case 'tir': return <span className="text-sm text-gray-700" title={r && Number.isNaN(r.tirAnual) ? 'Sem TIR: o sócio só aporta ou só recebe.' : undefined}>{r && !Number.isNaN(r.tirAnual) ? `${r.tirAnual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% a.a.` : '—'}</span>;
                        default: return null;
                    }
                }}
                actions={{
                    width: 100,
                    render: s => (
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                            <ActionIconButton kind="edit" title={pode ? 'Editar o sócio' : 'Ver o sócio'} onClick={() => setEditando(s)} />
                            {pode && <InlineDisclosureMenu showDelete onDelete={() => void excluir(s)} />}
                        </div>
                    ),
                }}
                empty={{
                    icon: <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhum sócio',
                    subtitle: 'Cadastre os sócios com a participação no resultado e nos aportes para ver aportes, lucro e TIR de cada um.',
                }}
            />
            {lista.length > 0 && (
                <p className="text-xs text-slate-600">
                    TIR do incorporador sobre os aportes e distribuições acima: {Number.isNaN(calculo.tirDoIncorporador) ? '—' : `${calculo.tirDoIncorporador.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% a.a.`} Difere da TIR do Resumo, que é sobre o fluxo do mês, porque o caixa mínimo e a reserva seguram parte do dinheiro antes de distribuir. Sócio com mais resultado que aportes tem TIR maior que essa.
                </p>
            )}

            <SocioSheet
                socio={editando}
                study={study}
                proximaOrdem={lista.length}
                onClose={() => setEditando(null)}
                onSalvo={(s, criado) => {
                    setLista(prev => (criado ? [...prev, s] : prev.map(x => (x.id === s.id ? s : x))));
                    // §25: criar fecha; editar permanece aberto, já com o salvo.
                    setEditando(criado ? null : s);
                }}
            />
        </section>
    );
};

const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
type Formulario = Record<'name' | 'share_percent' | 'capital_percent' | 'notes', string>;
const VAZIO: Formulario = { name: '', share_percent: '', capital_percent: '', notes: '' };

function SocioSheet({ socio, study, proximaOrdem, onClose, onSalvo }: {
    socio: ImovibPartner | 'novo' | null;
    study: ImovibStudy;
    proximaOrdem: number;
    onClose: () => void;
    onSalvo: (s: ImovibPartner, criado: boolean) => void;
}) {
    const { pode, motivo: motivoRo } = useImovibEdicao();
    const [form, setForm] = useState<Formulario>(VAZIO);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [mudou, setMudou] = useState(false);

    useEffect(() => {
        if (!socio) return;
        setForm(socio === 'novo' ? VAZIO : { name: socio.name, share_percent: String(socio.share_percent ?? ''), capital_percent: String(socio.capital_percent ?? ''), notes: socio.notes ?? '' });
        setErro(null);
        setMudou(false);
    }, [socio]);

    if (!socio) return null;
    const novo = socio === 'novo';
    const pct = (s: string) => (s.trim() === '' ? 0 : Number(s));
    const foraDaFaixa = [form.share_percent, form.capital_percent].some(v => v.trim() !== '' && !(Number(v) >= 0 && Number(v) <= 100));
    const motivo = !pode ? motivoRo
        : !form.name.trim() ? 'Dê o nome do sócio.'
            : foraDaFaixa ? 'As participações vão de 0% a 100%.'
                : !mudou ? 'Nada foi alterado.' : undefined;
    const mudar = (k: keyof Formulario, v: string) => { setForm(prev => ({ ...prev, [k]: v })); setMudou(true); };

    const salvar = async () => {
        if (motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            const salvo = await imovibService.salvarSocio({
                ...(novo ? {} : { id: socio.id, company_partner_id: socio.company_partner_id ?? null }),
                study_id: study.id,
                name: form.name.trim(),
                share_percent: pct(form.share_percent),
                capital_percent: pct(form.capital_percent),
                notes: form.notes.trim() || null,
                sort_order: novo ? proximaOrdem : socio.sort_order ?? 0,
            });
            setMudou(false);
            onSalvo(salvo, novo);
        } catch (e) {
            setErro((e as Error).message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!socio} onClose={onClose} size="md" dirty={mudou}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{novo ? 'Novo sócio' : 'Sócio'}</SheetTitle>
                <SheetDescription>As duas participações podem ser diferentes: quem entra com menos capital e fica com mais resultado tem TIR maior.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                {erro && (
                    <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                    </div>
                )}
                <fieldset disabled={!pode} title={!pode ? motivoRo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="imovib-socio-name" className="text-xs font-semibold text-slate-500">Nome</label>
                        <input id="imovib-socio-name" value={form.name} onChange={e => mudar('name', e.target.value)} className={CAMPO} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label htmlFor="imovib-socio-share" className="text-xs font-semibold text-slate-500">Participação no resultado (%)</label>
                            <input id="imovib-socio-share" type="number" min={0} max={100} step={0.01} value={form.share_percent} onChange={e => mudar('share_percent', e.target.value)} className={CAMPO} />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="imovib-socio-capital" className="text-xs font-semibold text-slate-500">Participação nos aportes (%)</label>
                            <input id="imovib-socio-capital" type="number" min={0} max={100} step={0.01} value={form.capital_percent} onChange={e => mudar('capital_percent', e.target.value)} className={CAMPO} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="imovib-socio-notes" className="text-xs font-semibold text-slate-500">Observações</label>
                        <textarea id="imovib-socio-notes" rows={3} value={form.notes} onChange={e => mudar('notes', e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" />
                    </div>
                </fieldset>
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">{novo ? 'Cancelar' : 'Fechar'}</button>
                <button type="button" onClick={() => void salvar()} disabled={salvando || !!motivo} title={motivo}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                    {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                    {novo ? 'Criar sócio' : 'Salvar sócio'}
                </button>
            </SheetFooter>
        </Sheet>
    );
}

export default ImovibSociosCard;
