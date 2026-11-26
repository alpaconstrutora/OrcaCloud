// components/condominio/AssembleiaSheet.tsx
// Criar / editar o RASCUNHO de uma assembleia: dados e pauta (Task A7, R8).
// Plano: docs/planos/2026-11-25-condominio-assembleias-votacoes.md.
//
// Gaveta, não tela (UI_PATTERNS §3: criar registro simples / editar). É o ÚNICO
// lugar onde rascunho e pauta se editam (guia §18.1) — a tela da assembleia só
// mostra e aponta para cá.
//
// Grava pela TABELA (RLS do conjunto de orgs): condominioAssembleiaService
// .salvarRascunho + .salvarItens. A organização quem põe é o gatilho do banco
// (fn_org_do_condominio) — esta gaveta não manda organization_id.
//
// "Assunto comum" sugere tipo e quórum (ASSUNTOS_COMUNS do A5); "Outro assunto"
// deixa escolher à mão. Item de ESCOLHA só se decide por maioria dos presentes
// (CHECK do banco) — o campo de quórum trava e diz por quê.
//
// Hora: o `datetime-local` é o relógio de BRASÍLIA e vai ao banco com -03:00
// (timestamptz) — 19h não vira 22h nem o dia anterior.

import React from 'react';
import { ClipboardList, Info, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import SecaoTitulo from '../ui/SecaoTitulo';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import {
    condominioAssembleiaService, operacoesDoGestor,
    type Assembleia, type Quorum, type TipoAssembleia, type TipoItem,
} from '../../services/condominioAssembleiaService';
import { ASSUNTOS_COMUNS, REGRA_QUORUM, ROTULO_QUORUM, ROTULO_TIPO, ROTULO_TIPO_ITEM } from '../../utils/assembleiaTextos';
import {
    AREA_DE_TEXTO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, BOTAO_VOLTAR, CAMPO, MOTIVO, ROTULO,
    deCampoDataHora, paraCampoDataHora,
} from './assembleia/comum';

interface ItemForm {
    /** Chave da tela (item novo não tem id). */
    chave: string;
    id?: string;
    assunto: string;
    titulo: string;
    descricao: string;
    tipo: TipoItem;
    quorum: Quorum;
    opcoes: string[];
}

interface Form {
    tipo: TipoAssembleia;
    titulo: string;
    local: string;
    link: string;
    primeira: string;
    segunda: string;
    itens: ItemForm[];
}

let seq = 0;
const novaChave = () => `item-${Date.now()}-${++seq}`;

const itemVazio = (): ItemForm => ({
    chave: novaChave(), assunto: 'OUTRO', titulo: '', descricao: '', tipo: 'APROVACAO', quorum: 'MAIORIA_PRESENTES', opcoes: [],
});

const formVazio = (): Form => ({ tipo: 'AGO', titulo: '', local: '', link: '', primeira: '', segunda: '', itens: [itemVazio()] });

/** '2026-12-10T19:00' + 30 min, sem passar por fuso (é só aritmética de relógio). */
function maisMeiaHora(valor: string): string {
    const d = new Date(`${valor}:00Z`);
    if (Number.isNaN(d.getTime())) return '';
    return new Date(d.getTime() + 30 * 60_000).toISOString().slice(0, 16);
}

interface Props {
    open: boolean;
    onClose: () => void;
    empreendimentoId: string;
    /** null = nova assembleia. */
    assembleiaId: string | null;
    /**
     * Devolve a assembleia gravada (§22: a lista costura sem recarregar). `pautaSalva`
     * false = o rascunho foi gravado mas a pauta não (a gaveta continua aberta com o erro).
     */
    onSalva: (a: Assembleia, pautaSalva: boolean) => void;
}

const AssembleiaSheet: React.FC<Props> = ({ open, onClose, empreendimentoId, assembleiaId, onSalva }) => {
    const confirm = useConfirm();
    const [form, setForm] = React.useState<Form>(formVazio);
    const [inicial, setInicial] = React.useState<string>(JSON.stringify(formVazio()));
    const [carregando, setCarregando] = React.useState(false);
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    // Rascunho criado nesta abertura cuja pauta falhou: o próximo Salvar ATUALIZA, não cria outro.
    const [idGravado, setIdGravado] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!open) return;
        setErro(null);
        setIdGravado(null);
        if (!assembleiaId) {
            const f = formVazio();
            setForm(f);
            setInicial(JSON.stringify(f));
            return;
        }
        let vivo = true;
        setCarregando(true);
        operacoesDoGestor.carregar(assembleiaId)
            .then(({ assembleia: a, itens }) => {
                if (!vivo) return;
                const f: Form = {
                    tipo: a.tipo, titulo: a.titulo, local: a.local ?? '', link: a.linkTransmissao ?? '',
                    primeira: paraCampoDataHora(a.primeiraConvocacaoEm), segunda: paraCampoDataHora(a.segundaConvocacaoEm),
                    itens: itens.map(i => ({
                        chave: i.id, id: i.id, assunto: i.assunto ?? 'OUTRO', titulo: i.titulo, descricao: i.descricao ?? '',
                        tipo: i.tipo, quorum: i.quorum, opcoes: i.opcoes ?? [],
                    })),
                };
                setForm(f);
                setInicial(JSON.stringify(f));
            })
            .catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar o rascunho.'); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [open, assembleiaId]);

    const dirty = !carregando && JSON.stringify(form) !== inicial;
    // O X e o Voltar/Cancelar não passam pela guarda do Sheet (só Esc e o véu): guarda própria (§25).
    const fechar = async () => {
        if (dirty && !(await confirm({
            title: 'Sair sem salvar?', message: 'Há alterações não salvas neste rascunho. Se sair agora, elas serão perdidas.',
            variant: 'warning', confirmLabel: 'Sair e descartar', cancelLabel: 'Continuar editando',
        }))) return;
        onClose();
    };
    const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }));
    const setItem = (chave: string, mudar: (i: ItemForm) => ItemForm) =>
        setForm(f => ({ ...f, itens: f.itens.map(i => (i.chave === chave ? mudar(i) : i)) }));

    const escolherAssunto = (chave: string, assunto: string) => setItem(chave, i => {
        const a = ASSUNTOS_COMUNS.find(x => x.id === assunto);
        if (!a || a.id === 'OUTRO') return { ...i, assunto };
        return {
            ...i, assunto, tipo: a.tipo, quorum: a.quorum,
            titulo: i.titulo.trim() ? i.titulo : a.rotulo,
            opcoes: a.tipo === 'ESCOLHA' && i.opcoes.length < 2 ? ['', ''] : i.opcoes,
        };
    });

    const escolherTipo = (chave: string, tipo: TipoItem) => setItem(chave, i => ({
        ...i, tipo,
        quorum: tipo === 'ESCOLHA' ? 'MAIORIA_PRESENTES' : i.quorum,
        opcoes: tipo === 'ESCOLHA' && i.opcoes.length < 2 ? ['', ''] : i.opcoes,
    }));

    const mover = (indice: number, delta: -1 | 1) => setForm(f => {
        const itens = [...f.itens];
        const [it] = itens.splice(indice, 1);
        itens.splice(indice + delta, 0, it);
        return { ...f, itens };
    });

    // Motivo do Salvar desligado — o banco e o serviço conferem de novo; isto é para ler antes.
    const p1 = deCampoDataHora(form.primeira);
    const p2 = deCampoDataHora(form.segunda);
    const motivoItem = form.itens.map((it, n) => (!it.titulo.trim()
        ? `Item ${n + 1}: informe o título.`
        : it.tipo === 'ESCOLHA' && it.opcoes.filter(o => o.trim()).length < 2
            ? `Item ${n + 1}: item de escolha precisa de pelo menos 2 opções.`
            : null)).find(Boolean) ?? null;
    const motivo = carregando ? 'Carregando o rascunho...'
        : !form.titulo.trim() ? 'Informe o título da assembleia.'
            : p1 && p2 && new Date(p2) <= new Date(p1) ? 'A 2ª convocação tem de ser depois da 1ª.'
                : motivoItem
                    ?? (!dirty && !idGravado ? 'Nada a salvar: nenhuma alteração.' : null);

    const salvar = async () => {
        setSalvando(true);
        setErro(null);
        try {
            const a = await condominioAssembleiaService.salvarRascunho({
                id: assembleiaId ?? idGravado ?? undefined,
                empreendimentoId,
                tipo: form.tipo,
                titulo: form.titulo,
                local: form.local,
                linkTransmissao: form.link,
                primeiraConvocacaoEm: p1,
                segundaConvocacaoEm: p2,
            });
            setIdGravado(a.id);
            try {
                await condominioAssembleiaService.salvarItens(a.id, form.itens.map(i => ({
                    id: i.id, titulo: i.titulo, descricao: i.descricao, tipo: i.tipo, quorum: i.quorum,
                    assunto: i.assunto, opcoes: i.tipo === 'ESCOLHA' ? i.opcoes.filter(o => o.trim()) : null,
                })));
            } catch (e: unknown) {
                // O rascunho existe (a lista precisa mostrá-lo), a pauta não: diz isso, sem "salvo".
                onSalva(a, false);
                setErro(`O rascunho foi gravado, mas a pauta não: ${e instanceof Error ? e.message : 'erro desconhecido'}`
                    + ' Corrija e salve de novo.');
                return;
            }
            onSalva(a, true);
            onClose();
        } catch (e: unknown) {
            setErro(e instanceof Error ? e.message : 'Erro ao salvar o rascunho.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="2xl" dirty={dirty}>
            <SheetHeader onClose={fechar}>
                <SheetTitle>{assembleiaId ? 'Editar rascunho da assembleia' : 'Nova assembleia'}</SheetTitle>
                <SheetDescription>
                    Rascunho: não aparece no portal. Convocar (na tela da assembleia) publica o aviso e trava a pauta.
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6 space-y-8">
                {/* ── Dados ──────────────────────────────────────────── */}
                <section className="space-y-4">
                    <SecaoTitulo icon={Info} titulo="Dados da assembleia" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label htmlFor="assembleia-tipo" className={ROTULO}>Tipo</label>
                            <select id="assembleia-tipo" value={form.tipo} disabled={carregando}
                                onChange={ev => set('tipo', ev.target.value as TipoAssembleia)} className={CAMPO}>
                                {(Object.keys(ROTULO_TIPO) as TipoAssembleia[]).map(t => (
                                    <option key={t} value={t}>{ROTULO_TIPO[t]} ({t})</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="assembleia-titulo" className={ROTULO}>Título</label>
                            <input id="assembleia-titulo" type="text" value={form.titulo} disabled={carregando}
                                onChange={ev => set('titulo', ev.target.value)} placeholder="Ex.: AGO 2026 — contas e orçamento"
                                className={CAMPO} />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="assembleia-primeira" className={ROTULO}>1ª convocação (horário de Brasília)</label>
                            <input id="assembleia-primeira" type="datetime-local" value={form.primeira} disabled={carregando}
                                onChange={ev => {
                                    const v = ev.target.value;
                                    // A 2ª costuma ser meia hora depois: preenche se ainda estiver vazia.
                                    setForm(f => ({ ...f, primeira: v, segunda: f.segunda || (v ? maisMeiaHora(v) : '') }));
                                }}
                                className={CAMPO} />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="assembleia-segunda" className={ROTULO}>2ª convocação (horário de Brasília)</label>
                            <input id="assembleia-segunda" type="datetime-local" value={form.segunda} disabled={carregando}
                                onChange={ev => set('segunda', ev.target.value)} className={CAMPO} />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="assembleia-local" className={ROTULO}>Local</label>
                            <input id="assembleia-local" type="text" value={form.local} disabled={carregando}
                                onChange={ev => set('local', ev.target.value)} placeholder="Ex.: Salão de festas" className={CAMPO} />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="assembleia-link" className={ROTULO}>Link de transmissão</label>
                            <input id="assembleia-link" type="url" value={form.link} disabled={carregando}
                                onChange={ev => set('link', ev.target.value)} placeholder="https://..." className={CAMPO} />
                        </div>
                    </div>
                    <p className="text-xs text-gray-500">
                        Datas e horas podem ficar em branco no rascunho; Convocar exige as duas, com a 1ª no futuro.
                    </p>
                </section>

                {/* ── Pauta ──────────────────────────────────────────── */}
                <section className="space-y-4">
                    <SecaoTitulo icon={ClipboardList} titulo="Pauta"
                        resumo={`${form.itens.length} ${form.itens.length === 1 ? 'item' : 'itens'}`} />
                    {form.itens.map((it, n) => (
                        <div key={it.chave} role="group" aria-label={`Item ${n + 1}`}
                            className="rounded-[10px] border border-gray-100 p-4 space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium text-gray-900">Item {n + 1}</p>
                                <div className="flex items-center gap-1.5">
                                    {n > 0 && (
                                        <ActionIconButton kind="move" title="Subir na pauta" icon={<ChevronUp className="w-4 h-4" />}
                                            onClick={() => mover(n, -1)} />
                                    )}
                                    {n < form.itens.length - 1 && (
                                        <ActionIconButton kind="move" title="Descer na pauta" icon={<ChevronDown className="w-4 h-4" />}
                                            onClick={() => mover(n, 1)} />
                                    )}
                                    <ActionIconButton kind="delete" title="Tirar da pauta"
                                        onClick={() => set('itens', form.itens.filter(x => x.chave !== it.chave))} />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                <div className="space-y-1.5">
                                    <label htmlFor={`${it.chave}-assunto`} className={ROTULO}>Assunto comum</label>
                                    <select id={`${it.chave}-assunto`} value={it.assunto}
                                        onChange={ev => escolherAssunto(it.chave, ev.target.value)} className={CAMPO}>
                                        {ASSUNTOS_COMUNS.map(a => <option key={a.id} value={a.id}>{a.rotulo}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor={`${it.chave}-titulo`} className={ROTULO}>Título do item</label>
                                    <input id={`${it.chave}-titulo`} type="text" value={it.titulo}
                                        onChange={ev => setItem(it.chave, i => ({ ...i, titulo: ev.target.value }))} className={CAMPO} />
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor={`${it.chave}-tipo`} className={ROTULO}>Tipo de votação</label>
                                    <select id={`${it.chave}-tipo`} value={it.tipo}
                                        onChange={ev => escolherTipo(it.chave, ev.target.value as TipoItem)} className={CAMPO}>
                                        {(Object.keys(ROTULO_TIPO_ITEM) as TipoItem[]).map(t => (
                                            <option key={t} value={t}>{ROTULO_TIPO_ITEM[t]}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor={`${it.chave}-quorum`} className={ROTULO}>Quórum</label>
                                    <select id={`${it.chave}-quorum`} value={it.quorum} disabled={it.tipo === 'ESCOLHA'}
                                        onChange={ev => setItem(it.chave, i => ({ ...i, quorum: ev.target.value as Quorum }))} className={CAMPO}>
                                        {(Object.keys(ROTULO_QUORUM) as Quorum[]).map(q => (
                                            <option key={q} value={q}>{ROTULO_QUORUM[q]}</option>
                                        ))}
                                    </select>
                                    <p className={it.tipo === 'ESCOLHA' ? MOTIVO : 'text-xs text-gray-500'}>
                                        {it.tipo === 'ESCOLHA'
                                            ? 'Item de escolha só se decide por maioria dos presentes.'
                                            : REGRA_QUORUM[it.quorum]}
                                    </p>
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <label htmlFor={`${it.chave}-descricao`} className={ROTULO}>Descrição</label>
                                    <textarea id={`${it.chave}-descricao`} rows={2} value={it.descricao}
                                        onChange={ev => setItem(it.chave, i => ({ ...i, descricao: ev.target.value }))}
                                        placeholder="Opcional — vai para o edital e para o aviso" className={AREA_DE_TEXTO} />
                                </div>
                            </div>
                            {it.tipo === 'ESCOLHA' && (
                                <div className="space-y-2">
                                    <p className={ROTULO}>Opções da cédula</p>
                                    {it.opcoes.map((op, k) => (
                                        <div key={k} className="flex items-center gap-2">
                                            <input type="text" value={op} aria-label={`Opção ${k + 1} do item ${n + 1}`}
                                                onChange={ev => setItem(it.chave, i => ({
                                                    ...i, opcoes: i.opcoes.map((o, j) => (j === k ? ev.target.value : o)),
                                                }))}
                                                placeholder={`Opção ${k + 1}`} className={CAMPO} />
                                            <ActionIconButton kind="delete" title="Tirar esta opção"
                                                onClick={() => setItem(it.chave, i => ({ ...i, opcoes: i.opcoes.filter((_, j) => j !== k) }))} />
                                        </div>
                                    ))}
                                    <div className="flex items-center gap-3">
                                        <button type="button" className={BOTAO_SECUNDARIO}
                                            onClick={() => setItem(it.chave, i => ({ ...i, opcoes: [...i.opcoes, ''] }))}>
                                            <Plus className="w-[15px] h-[15px]" /> Adicionar opção
                                        </button>
                                        <p className="text-xs text-gray-500">"Abstenção" já vem na cédula — não cadastre.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    <button type="button" onClick={() => set('itens', [...form.itens, itemVazio()])} className={BOTAO_SECUNDARIO}>
                        <Plus className="w-[15px] h-[15px]" /> Adicionar item à pauta
                    </button>
                </section>
                {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
            </SheetPanel>
            <SheetFooter className="flex-wrap">
                {motivo && <p className={`${MOTIVO} mr-auto max-w-sm`}>{motivo}</p>}
                <button type="button" onClick={fechar} className={BOTAO_VOLTAR}>{assembleiaId ? 'Voltar' : 'Cancelar'}</button>
                <button type="button" onClick={salvar} disabled={!!motivo || salvando} className={BOTAO_PRIMARIO}>
                    {salvando ? 'Salvando...' : assembleiaId ? 'Salvar rascunho' : 'Criar rascunho'}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default AssembleiaSheet;
