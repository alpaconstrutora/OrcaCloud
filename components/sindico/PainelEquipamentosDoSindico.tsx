import React from 'react';
import { AlertTriangle, Package, Plus } from 'lucide-react';
import {
    CardHeader, PortalCard, PortalEmpty, PortalLoading, PrimaryButton, StatusPill, Td, TextLinkButton, Th, fmtDate,
} from '../portal/PortalKit';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import { sindicoPortalService, type CondominioDoSindico, type IdentidadeDoSindico } from '../../services/sindicoPortalService';
import { diasAte, motivoNaoRemoveEquipamento, type EquipamentoDoPredio, type ManutencaoDoPredio } from '../../utils/manutencaoDoSindico';
import { hojeEmBrasilia } from '../../utils/mandatoSindico';
import { RodapeComMotivo, SeletorDoCondominio, useManutencaoDoPredio } from './PainelManutencaoDoSindico';

/**
 * Portal do Síndico › Equipamentos (G4, 26/11/2026).
 * Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
 *
 * Os equipamentos do prédio (bombas, elevadores, portões, extintores…). Marca e
 * modelo vão pelo NOME: o banco acha no catálogo da organização do condomínio ou
 * cria (a mesma regra de `brandModelService.resolverMarcaModelo` do app) — nunca
 * bloqueia por não estar cadastrado. O código patrimonial nasce no banco.
 * Remover só sem ordem de serviço no histórico.
 */

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';

interface Props {
    identidade: IdentidadeDoSindico;
    condominios: CondominioDoSindico[];
    logado: boolean;
    notify: (m: string, t?: 'success' | 'error') => void;
}

const Acao: React.FC<{ motivo: string | null; onClick: () => void; children: React.ReactNode }> = ({ motivo, onClick, children }) => (
    <span title={motivo ?? undefined} className={motivo ? 'cursor-not-allowed' : undefined}>
        <TextLinkButton onClick={onClick} disabled={!!motivo} className={motivo ? 'pointer-events-none text-gray-300 disabled:opacity-100' : ''}>
            {children}
        </TextLinkButton>
    </span>
);

const PainelEquipamentosDoSindico: React.FC<Props> = ({ identidade, condominios, logado, notify }) => {
    const confirm = useConfirm();
    const { condominioId, setCondominioId, dados, erro, motivoBase, recarregar } = useManutencaoDoPredio(identidade, condominios, logado);
    const [editando, setEditando] = React.useState<EquipamentoDoPredio | 'novo' | null>(null);
    const hoje = hojeEmBrasilia();

    const remover = async (a: EquipamentoDoPredio) => {
        const ok = await confirm({
            title: `Remover "${a.nome}"?`,
            message: 'O equipamento sai do cadastro do prédio. Esta ação não pode ser desfeita.',
            confirmLabel: 'Remover', variant: 'danger',
        });
        if (!ok) return;
        try {
            await sindicoPortalService.removerEquipamento(identidade, condominioId, a.id);
            notify('Equipamento removido.');
            recarregar();
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Não foi possível remover o equipamento.', 'error');
        }
    };

    return (
        <>
            <PortalCard>
                <CardHeader
                    title="Equipamentos"
                    subtitle="O que o prédio tem para manter: bombas, elevadores, portões, extintores…"
                    right={
                        <div className="flex flex-wrap items-center gap-3">
                            <SeletorDoCondominio condominios={condominios} value={condominioId} onChange={setCondominioId} />
                            <span title={motivoBase ?? undefined}>
                                <PrimaryButton onClick={() => setEditando('novo')} disabled={!!motivoBase} className={motivoBase ? 'pointer-events-none' : ''}>
                                    <Plus className="w-4 h-4" /> Novo equipamento
                                </PrimaryButton>
                            </span>
                        </div>
                    }
                />
                {erro ? (
                    <p className="px-5 pb-5 text-sm text-[#4A505C] flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> {erro}</p>
                ) : !dados ? (
                    <PortalLoading label="Carregando os equipamentos..." />
                ) : dados.ativos.length === 0 ? (
                    <PortalEmpty icon={<Package className="w-8 h-8" />} title="Nenhum equipamento cadastrado"
                        subtitle="Cadastre os equipamentos do prédio para ligar a eles as ordens de serviço e a garantia." />
                ) : (
                    <div className="overflow-x-auto border-t border-[#ECECEF]">
                        <table className="w-full min-w-[820px]">
                            <thead className="border-b border-[#ECECEF]">
                                <tr><Th>Equipamento</Th><Th>Marca · modelo</Th><Th>Local</Th><Th>Garantia</Th><Th className="text-right">Ordens</Th><Th>Ações</Th></tr>
                            </thead>
                            <tbody className="divide-y divide-[#ECECEF]">
                                {dados.ativos.map(a => {
                                    const dias = diasAte(a.garantiaAte, hoje);
                                    return (
                                        <tr key={a.id} className="hover:bg-gray-50/70 transition-colors align-top">
                                            <Td className="text-[#1F2430]">
                                                {a.nome}
                                                <span className="block text-[11px] text-gray-400">{[a.codigo, a.sistema, a.serie ? `nº ${a.serie}` : null].filter(Boolean).join(' · ') || '—'}</span>
                                            </Td>
                                            <Td>{[a.marca, a.modelo].filter(Boolean).join(' · ') || '—'}</Td>
                                            <Td>{a.local || '—'}</Td>
                                            <Td className="whitespace-nowrap">
                                                {a.garantiaAte ? fmtDate(a.garantiaAte) : '—'}
                                                {dias !== null && dias < 0 && <span className="ml-2"><StatusPill tone="muted">Vencida</StatusPill></span>}
                                            </Td>
                                            <Td className="text-right tabular-nums">{a.ordens}</Td>
                                            <Td className="whitespace-nowrap">
                                                <span className="inline-flex items-center gap-3">
                                                    <Acao motivo={motivoBase} onClick={() => setEditando(a)}>Editar</Acao>
                                                    <Acao motivo={motivoNaoRemoveEquipamento(a, motivoBase)} onClick={() => remover(a)}>Remover</Acao>
                                                </span>
                                            </Td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {motivoBase && dados && <p className="px-5 py-3 text-xs text-gray-500">{motivoBase}</p>}
            </PortalCard>

            {dados && (
                <EquipamentoSheet equipamento={editando} dados={dados} identidade={identidade} condominioId={condominioId}
                    onClose={() => setEditando(null)}
                    onSalvo={m => { setEditando(null); notify(m); recarregar(); }} />
            )}
        </>
    );
};

interface FormEquipamento { nome: string; sistemaId: string; marca: string; modelo: string; serie: string; local: string; compra: string; garantiaAte: string; obs: string }

const formDo = (a: EquipamentoDoPredio | null): FormEquipamento => ({
    nome: a?.nome ?? '', sistemaId: a?.sistemaId ?? '', marca: a?.marca ?? '', modelo: a?.modelo ?? '', serie: a?.serie ?? '',
    local: a?.local ?? '', compra: a?.compra ?? '', garantiaAte: a?.garantiaAte ?? '', obs: a?.obs ?? '',
});

const EquipamentoSheet: React.FC<{
    equipamento: EquipamentoDoPredio | 'novo' | null; dados: ManutencaoDoPredio; identidade: IdentidadeDoSindico; condominioId: string;
    onClose: () => void; onSalvo: (m: string) => void;
}> = ({ equipamento, dados, identidade, condominioId, onClose, onSalvo }) => {
    const atual = equipamento && equipamento !== 'novo' ? equipamento : null;
    const [form, setForm] = React.useState<FormEquipamento>(formDo(null));
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    React.useEffect(() => { if (equipamento) { setForm(formDo(atual)); setErro(null); } }, [equipamento]); // eslint-disable-line react-hooks/exhaustive-deps

    const set = <K extends keyof FormEquipamento>(k: K, v: FormEquipamento[K]) => setForm(f => ({ ...f, [k]: v }));
    const sujo = !!equipamento && JSON.stringify(form) !== JSON.stringify(formDo(atual));
    // Mesmas frases de `sindico_portal_ativo_salvar`.
    const motivo = salvando ? 'Gravando…' : !form.nome.trim() ? 'Informe o nome do equipamento.'
        : form.modelo.trim() && !form.marca.trim() ? 'Informe a marca do modelo.' : atual && !sujo ? 'Nada mudou.' : null;

    const salvar = async () => {
        if (motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            const r = await sindicoPortalService.salvarEquipamento(identidade, condominioId, atual?.id ?? null, {
                nome: form.nome.trim(), sistemaId: form.sistemaId || null, marca: form.marca, modelo: form.modelo,
                serie: form.serie, local: form.local, compra: form.compra || null, garantiaAte: form.garantiaAte || null, obs: form.obs,
            });
            onSalvo(atual ? 'Equipamento salvo.' : `Equipamento cadastrado${r.codigo ? ` (${r.codigo})` : ''}.`);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível salvar o equipamento.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!equipamento} onClose={onClose} size="md" dirty={sujo && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{atual ? 'Editar equipamento' : 'Novo equipamento'}</SheetTitle>
                <SheetDescription>{atual?.codigo ?? 'O código patrimonial é gerado ao salvar'}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                    <div className="space-y-1.5">
                        <label className={ROTULO} htmlFor="equip-nome">Nome *</label>
                        <input id="equip-nome" className={CAMPO} value={form.nome} placeholder="Ex.: Bomba de recalque 1" onChange={e => set('nome', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="equip-marca">Marca</label>
                            <input id="equip-marca" className={CAMPO} value={form.marca} list="equip-marcas" onChange={e => set('marca', e.target.value)} />
                            <datalist id="equip-marcas">{dados.marcas.map(m => <option key={m} value={m} />)}</datalist>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="equip-modelo">Modelo</label>
                            <input id="equip-modelo" className={CAMPO} value={form.modelo} onChange={e => set('modelo', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="equip-sistema">Sistema</label>
                            <select id="equip-sistema" className={CAMPO} value={form.sistemaId} onChange={e => set('sistemaId', e.target.value)}>
                                <option value="">—</option>
                                {dados.sistemas.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="equip-serie">Número de série</label>
                            <input id="equip-serie" className={CAMPO} value={form.serie} onChange={e => set('serie', e.target.value)} />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                            <label className={ROTULO} htmlFor="equip-local">Local</label>
                            <input id="equip-local" className={CAMPO} value={form.local} placeholder="Ex.: Subsolo, casa de máquinas" onChange={e => set('local', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="equip-compra">Comprado em</label>
                            <input id="equip-compra" type="date" className={CAMPO} value={form.compra} onChange={e => set('compra', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="equip-garantia">Garantia até</label>
                            <input id="equip-garantia" type="date" className={CAMPO} value={form.garantiaAte} onChange={e => set('garantiaAte', e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className={ROTULO} htmlFor="equip-obs">Observações</label>
                        <textarea id="equip-obs" rows={2} className={`${CAMPO} h-auto py-2`} value={form.obs} onChange={e => set('obs', e.target.value)} />
                    </div>
                </div>
            </SheetPanel>
            <RodapeComMotivo erro={erro} motivo={motivo} salvando={salvando} onClose={onClose} onSalvar={salvar} rotulo={atual ? 'Salvar' : 'Cadastrar'} />
        </Sheet>
    );
};

export default PainelEquipamentosDoSindico;
