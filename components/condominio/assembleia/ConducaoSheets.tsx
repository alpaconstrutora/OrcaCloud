// components/condominio/assembleia/ConducaoSheets.tsx
// As quatro gavetas de transição da assembleia (R4, R6, R9, R10): Convocar,
// Instalar, Encerrar e Cancelar. Cada uma mostra o que sustenta a decisão antes do
// clique (UI_PATTERNS §6.2) e diz, à vista, por que o botão está desligado.
//
// Quem grava é o pai (AssembleiaDetalheView), por `ops` — estas gavetas não chamam
// o banco. O texto do aviso (convocação/cancelamento) sai PRONTO do A5
// (utils/assembleiaTextos) e é o que a gaveta mostra e o que o pai envia.

import React from 'react';
import { AlertTriangle, CalendarClock, ListChecks, MapPinOff, Megaphone, Gavel, FileText } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../../ui/sheet';
import SecaoTitulo from '../../ui/SecaoTitulo';
import {
    dataHoraBrasilia, percentualDoTotal, textoCancelamento, textoConvocacao, ROTULO_QUORUM_INSTALACAO,
} from '../../../utils/assembleiaTextos';
import type { Assembleia, DadosInstalacao, ItemAssembleia } from '../../../services/condominioAssembleiaService';
import {
    AREA_DE_TEXTO, AVISO_COTAS_NAO_CONFERIDAS, BOTAO_PERIGO, BOTAO_PRIMARIO, BOTAO_VOLTAR, CAMPO, MOTIVO, ROTULO,
    diasDeAntecedencia, temMetade, type Presentes,
} from './comum';

/** Rodapé comum: motivo à esquerda (quando há), Voltar e a ação. */
const Rodape: React.FC<{ motivo: string | null; onVoltar: () => void; children: React.ReactNode }> = ({ motivo, onVoltar, children }) => (
    <SheetFooter className="flex-wrap">
        {motivo && <p className={`${MOTIVO} mr-auto max-w-sm`}>{motivo}</p>}
        <button type="button" onClick={onVoltar} className={BOTAO_VOLTAR}>Voltar</button>
        {children}
    </SheetFooter>
);

const Erro: React.FC<{ texto: string | null }> = ({ texto }) =>
    texto ? <p role="alert" className="text-sm text-red-600">{texto}</p> : null;

/**
 * A10: o condomínio não tem cota cobrada pelo app — a regra automática de inadimplência
 * não pega ninguém. Só avisa (não desliga nada): o gestor marca a impedida à mão.
 */
export const AvisoCotasNaoConferidas: React.FC = () => (
    <div role="note" className="flex items-start gap-2.5 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
        <p className="text-sm text-amber-800">{AVISO_COTAS_NAO_CONFERIDAS}</p>
    </div>
);

// ─── Convocar (R1, R4) ───────────────────────────────────────────────────────

interface ConvocarProps {
    open: boolean;
    onClose: () => void;
    assembleia: Assembleia;
    itens: ItemAssembleia[];
    condominioNome: string;
    /** Rótulos das unidades sem fração ideal (null = carregando; erro = não conferido). */
    fora: string[] | null;
    erroFora: string | null;
    gravando: boolean;
    erro: string | null;
    /** A10: false = avisa que a inadimplência não é conferida (null = não se sabe). */
    cotasConferidas: boolean | null;
    onConvocar: (corpoAviso: string) => void;
}

export const ConvocarSheet: React.FC<ConvocarProps> = ({
    open, onClose, assembleia: a, itens, condominioNome, fora, erroFora, gravando, erro, cotasConferidas, onConvocar,
}) => {
    const corpo = React.useMemo(() => textoConvocacao(a, itens, condominioNome), [a, itens, condominioNome]);
    const agora = Date.now();
    const motivo = itens.length === 0
        ? 'A pauta precisa de pelo menos 1 item: edite o rascunho na lista de assembleias.'
        : !a.primeiraConvocacaoEm || !a.segundaConvocacaoEm
            ? 'Informe a data e a hora da 1ª e da 2ª convocação no rascunho.'
            : new Date(a.primeiraConvocacaoEm).getTime() <= agora
                ? 'A 1ª convocação tem de ser no futuro: ajuste a data no rascunho.'
                : new Date(a.segundaConvocacaoEm).getTime() <= new Date(a.primeiraConvocacaoEm).getTime()
                    ? 'A 2ª convocação tem de ser depois da 1ª: ajuste o rascunho.'
                    : gravando ? 'Aguarde: convocando.' : null;
    const dias = a.primeiraConvocacaoEm ? diasDeAntecedencia(a.primeiraConvocacaoEm) : null;

    return (
        <Sheet open={open} onClose={onClose} size="xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Convocar assembleia</SheetTitle>
                <SheetDescription>{a.titulo}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6 space-y-8">
                {cotasConferidas === false && <AvisoCotasNaoConferidas />}
                <section className="space-y-4">
                    <SecaoTitulo icon={CalendarClock} titulo="Antecedência" />
                    {dias !== null && a.primeiraConvocacaoEm ? (
                        <p className="text-sm text-gray-900">
                            Convocando hoje, o edital sai com <span className="font-medium">{dias} {dias === 1 ? 'dia' : 'dias'} de antecedência</span>
                            {' '}da 1ª convocação ({dataHoraBrasilia(a.primeiraConvocacaoEm)}).
                        </p>
                    ) : (
                        <p className="text-sm text-gray-600">Sem data da 1ª convocação.</p>
                    )}
                    <p className="text-xs text-gray-500">
                        O sistema não impõe prazo mínimo: sem regra na convenção, a lei não fixa um.
                    </p>
                </section>

                <section className="space-y-4">
                    <SecaoTitulo icon={MapPinOff} titulo="Unidades fora da assembleia: sem fração ideal"
                        resumo={fora ? String(fora.length) : undefined} />
                    {erroFora ? (
                        <p className="text-sm text-amber-700">
                            Não foi possível conferir as frações agora ({erroFora}). O banco confere ao convocar e devolve a lista.
                        </p>
                    ) : fora === null ? (
                        <p className="text-sm text-gray-500">Conferindo as frações...</p>
                    ) : fora.length === 0 ? (
                        <p className="text-sm text-gray-700">Todas as unidades têm fração ideal e entram na assembleia.</p>
                    ) : (
                        <>
                            <ul className="text-sm text-gray-900 list-disc pl-5 space-y-0.5">
                                {fora.map(f => <li key={f}>{f}</li>)}
                            </ul>
                            <p className="text-xs text-gray-500">
                                Não votam nem contam no quórum. Para incluir, preencha a fração em Frações antes de convocar.
                            </p>
                        </>
                    )}
                </section>

                <section className="space-y-4">
                    <SecaoTitulo icon={Megaphone} titulo="Aviso no mural" resumo="é o texto que os condôminos recebem" />
                    <div className="rounded-[10px] border border-gray-100 bg-gray-50 p-4 text-sm text-gray-900 whitespace-pre-wrap">
                        {corpo}
                    </div>
                    <p className="text-xs text-gray-500">
                        Convocar publica este aviso no portal e libera o voto pelo portal. Depois disso a pauta não muda
                        (mudar a pauta = cancelar e convocar outra).
                    </p>
                </section>
                <Erro texto={erro} />
            </SheetPanel>
            <Rodape motivo={motivo} onVoltar={onClose}>
                <button type="button" onClick={() => onConvocar(corpo)} disabled={!!motivo} className={BOTAO_PRIMARIO}>
                    {gravando ? 'Convocando...' : 'Convocar e publicar aviso'}
                </button>
            </Rodape>
        </Sheet>
    );
};

// ─── Instalar (R4, R6) ───────────────────────────────────────────────────────

interface InstalarProps {
    open: boolean;
    onClose: () => void;
    assembleia: Assembleia;
    presentes: Presentes;
    impedidas: number;
    leituras: number | null;
    gravando: boolean;
    erro: string | null;
    /** A10: false = avisa que a inadimplência não é conferida (null = não se sabe). */
    cotasConferidas: boolean | null;
    onInstalar: (dados: DadosInstalacao) => void;
}

export const InstalarSheet: React.FC<InstalarProps> = ({
    open, onClose, assembleia: a, presentes, impedidas, leituras, gravando, erro, cotasConferidas, onInstalar,
}) => {
    const agora = Date.now();
    const pct = percentualDoTotal(presentes.fracao, presentes.total);
    const motivo1 = !a.primeiraConvocacaoEm
        ? 'Sem data da 1ª convocação.'
        : agora < new Date(a.primeiraConvocacaoEm).getTime()
            ? `A 1ª convocação está marcada para ${dataHoraBrasilia(a.primeiraConvocacaoEm)}: ainda não chegou o horário.`
            : !temMetade(presentes)
                ? `Presentes aptos somam ${pct} das frações (${presentes.unidades} de ${presentes.totalUnidades} unidades): `
                    + 'a 1ª convocação exige pelo menos metade (CC art. 1.352).'
                : null;
    const motivo2 = !a.segundaConvocacaoEm
        ? 'Sem data da 2ª convocação.'
        : agora < new Date(a.segundaConvocacaoEm).getTime()
            ? `A 2ª convocação está marcada para ${dataHoraBrasilia(a.segundaConvocacaoEm)}: ainda não chegou o horário.`
            : null;
    const padrao: 1 | 2 | null = !motivo1 ? 1 : !motivo2 ? 2 : null;

    const [convocacao, setConvocacao] = React.useState<1 | 2 | null>(padrao);
    const [presidente, setPresidente] = React.useState('');
    const [secretario, setSecretario] = React.useState('');
    const [edital, setEdital] = React.useState(false);
    // O gestor escolheu a convocação à mão? Senão, a escolhida acompanha o padrão — a tela
    // recarrega ao abrir esta gaveta, e o voto do portal que chegou pode liberar a 1ª.
    const escolheuAMao = React.useRef(false);

    // Cada abertura parte do que vale AGORA (o relógio e a presença andam).
    React.useEffect(() => {
        if (!open) return;
        escolheuAMao.current = false;
        setConvocacao(padrao);
        setPresidente(a.presidenteNome ?? '');
        setSecretario(a.secretarioNome ?? '');
        setEdital(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    React.useEffect(() => {
        if (open && !escolheuAMao.current) setConvocacao(padrao);
    }, [open, padrao]);

    const escolhida = convocacao === 1 && motivo1 ? null : convocacao === 2 && motivo2 ? null : convocacao;
    const motivo = !escolhida
        ? 'Nenhuma convocação disponível agora: veja o motivo ao lado de cada uma.'
        : !presidente.trim() || !secretario.trim()
            ? 'Informe o presidente e o secretário da mesa.'
            : !edital
                ? 'Marque a confirmação de que o edital foi entregue a todas as unidades.'
                : gravando ? 'Aguarde: instalando.' : null;

    const opcoes: { n: 1 | 2; rotulo: string; em: string | null; motivo: string | null }[] = [
        { n: 1, rotulo: '1ª convocação', em: a.primeiraConvocacaoEm, motivo: motivo1 },
        { n: 2, rotulo: '2ª convocação', em: a.segundaConvocacaoEm, motivo: motivo2 },
    ];

    return (
        <Sheet open={open} onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Instalar assembleia</SheetTitle>
                <SheetDescription>{a.titulo}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6 space-y-8">
                {cotasConferidas === false && <AvisoCotasNaoConferidas />}
                <section className="space-y-4">
                    <SecaoTitulo icon={ListChecks} titulo={ROTULO_QUORUM_INSTALACAO}
                        resumo={`${pct} · ${presentes.unidades} de ${presentes.totalUnidades} unidades`} />
                    <p className="text-xs text-gray-500">
                        Conta quem está na sala (pessoalmente ou por procurador) ou já votou pelo portal, sem as
                        impedidas — cota vencida ou marcada pelo gestor{impedidas > 0 ? ` (${impedidas} agora)` : ''}. O número é gravado ao instalar e não muda depois.
                    </p>
                    <fieldset className="space-y-3">
                        <legend className="sr-only">Em qual convocação a assembleia se instala</legend>
                        {opcoes.map(o => (
                            <div key={o.n} className="space-y-1">
                                <label className={`flex items-center gap-2 text-sm text-gray-900 ${o.motivo ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                                    <input type="radio" name="instalar-convocacao" checked={escolhida === o.n}
                                        disabled={!!o.motivo} onChange={() => { escolheuAMao.current = true; setConvocacao(o.n); }}
                                        className="w-4 h-4 border-gray-300 text-blue-600 focus:ring-blue-500" />
                                    {o.rotulo}{o.em ? ` — marcada para ${dataHoraBrasilia(o.em)}` : ''}
                                </label>
                                {o.motivo && <p className={`${MOTIVO} pl-6`}>{o.motivo}</p>}
                            </div>
                        ))}
                    </fieldset>
                </section>

                <section className="space-y-4">
                    <SecaoTitulo icon={Gavel} titulo="Mesa" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label htmlFor="instalar-presidente" className={ROTULO}>Presidente da mesa</label>
                            <input id="instalar-presidente" type="text" value={presidente}
                                onChange={ev => setPresidente(ev.target.value)} className={CAMPO} />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="instalar-secretario" className={ROTULO}>Secretário da mesa</label>
                            <input id="instalar-secretario" type="text" value={secretario}
                                onChange={ev => setSecretario(ev.target.value)} className={CAMPO} />
                        </div>
                    </div>
                </section>

                <section className="space-y-3">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                        <input type="checkbox" checked={edital} onChange={ev => setEdital(ev.target.checked)}
                            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-900">Confirmo que o edital foi entregue a todas as unidades</span>
                    </label>
                    <p className="text-xs text-gray-500 pl-6">
                        Fica gravado com o seu nome e a data, e sai na ata.
                        {leituras !== null && ` Aviso de convocação: ${leituras} ${leituras === 1 ? 'condômino que leu' : 'condôminos que leram'} — só informação: leitura não é exigida.`}
                    </p>
                </section>
                <Erro texto={erro} />
            </SheetPanel>
            <Rodape motivo={motivo} onVoltar={onClose}>
                <button type="button" disabled={!!motivo} className={BOTAO_PRIMARIO}
                    onClick={() => escolhida && onInstalar({
                        convocacao: escolhida, presidente: presidente.trim(), secretario: secretario.trim(), editalEntregue: edital,
                    })}>
                    {gravando ? 'Instalando...' : 'Instalar assembleia'}
                </button>
            </Rodape>
        </Sheet>
    );
};

// ─── Encerrar (R9) ───────────────────────────────────────────────────────────

interface EncerrarProps {
    open: boolean;
    onClose: () => void;
    assembleia: Assembleia;
    itens: ItemAssembleia[];
    gravando: boolean;
    erro: string | null;
    onEncerrar: (deliberacoes: Record<string, string | null>, observacao: string | null) => void;
}

export const EncerrarSheet: React.FC<EncerrarProps> = ({ open, onClose, assembleia: a, itens, gravando, erro, onEncerrar }) => {
    const [textos, setTextos] = React.useState<Record<string, string>>({});
    const [observacao, setObservacao] = React.useState('');

    React.useEffect(() => {
        if (!open) return;
        setTextos(Object.fromEntries(itens.map(i => [i.id, i.deliberacao ?? ''])));
        setObservacao(a.observacaoGeral ?? '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const encerrar = () => onEncerrar(
        Object.fromEntries(itens.map(i => [i.id, (textos[i.id] ?? '').trim() || null])),
        observacao.trim() || null,
    );

    return (
        <Sheet open={open} onClose={onClose} size="xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Encerrar assembleia</SheetTitle>
                <SheetDescription>{a.titulo}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6 space-y-8">
                <section className="space-y-4">
                    <SecaoTitulo icon={FileText} titulo="Deliberações" resumo="opcional — vão para a ata, por item" />
                    {itens.map((item, i) => (
                        <div key={item.id} className="space-y-1.5">
                            <label htmlFor={`delib-${item.id}`} className={ROTULO}>Deliberação — {item.titulo}</label>
                            <textarea id={`delib-${item.id}`} rows={3} value={textos[item.id] ?? ''}
                                onChange={ev => setTextos(t => ({ ...t, [item.id]: ev.target.value }))}
                                placeholder={`O que ficou decidido no item ${i + 1}`} className={AREA_DE_TEXTO} />
                        </div>
                    ))}
                    <div className="space-y-1.5">
                        <label htmlFor="encerrar-observacao" className={ROTULO}>Observação geral</label>
                        <textarea id="encerrar-observacao" rows={3} value={observacao}
                            onChange={ev => setObservacao(ev.target.value)} className={AREA_DE_TEXTO} />
                    </div>
                </section>
                <p className="text-sm text-gray-700">
                    Ao encerrar, o banco soma os votos, calcula o resultado de cada item e grava o retrato. Depois disso
                    nada desta assembleia muda. A ata em PDF sai desse retrato e vai para Documentos, visível no portal.
                </p>
                <Erro texto={erro} />
            </SheetPanel>
            <Rodape motivo={gravando ? 'Aguarde: encerrando.' : null} onVoltar={onClose}>
                <button type="button" onClick={encerrar} disabled={gravando} className={BOTAO_PRIMARIO}>
                    {gravando ? 'Encerrando...' : 'Encerrar e gerar ata'}
                </button>
            </Rodape>
        </Sheet>
    );
};

// ─── Cancelar (R10) ──────────────────────────────────────────────────────────

interface CancelarProps {
    open: boolean;
    onClose: () => void;
    assembleia: Assembleia;
    gravando: boolean;
    erro: string | null;
    onCancelar: (motivo: string, corpoAviso: string) => void;
}

export const CancelarSheet: React.FC<CancelarProps> = ({ open, onClose, assembleia: a, gravando, erro, onCancelar }) => {
    const [motivoTexto, setMotivoTexto] = React.useState('');
    React.useEffect(() => { if (open) setMotivoTexto(''); }, [open]);

    const limpo = motivoTexto.trim();
    const corpo = limpo ? textoCancelamento(a, limpo) : '';
    const motivo = !limpo ? 'Informe o motivo do cancelamento.' : gravando ? 'Aguarde: cancelando.' : null;

    return (
        <Sheet open={open} onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Cancelar assembleia</SheetTitle>
                <SheetDescription>{a.titulo}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6 space-y-6">
                <div className="space-y-1.5">
                    <label htmlFor="cancelar-motivo" className={ROTULO}>Motivo do cancelamento</label>
                    <textarea id="cancelar-motivo" rows={3} value={motivoTexto}
                        onChange={ev => setMotivoTexto(ev.target.value)} className={AREA_DE_TEXTO} />
                </div>
                {corpo && (
                    <div className="space-y-1.5">
                        <p className={ROTULO}>Aviso no mural</p>
                        <div className="rounded-[10px] border border-gray-100 bg-gray-50 p-4 text-sm text-gray-900 whitespace-pre-wrap">{corpo}</div>
                    </div>
                )}
                <p className="text-sm text-gray-700">
                    Cancelar publica este aviso no portal e fecha a assembleia para sempre: os votos dados pelo portal
                    deixam de valer. Para fazer outra, crie e convoque uma nova.
                </p>
                <Erro texto={erro} />
            </SheetPanel>
            <Rodape motivo={motivo} onVoltar={onClose}>
                <button type="button" onClick={() => onCancelar(limpo, corpo)} disabled={!!motivo} className={BOTAO_PERIGO}>
                    {gravando ? 'Cancelando...' : 'Cancelar e avisar os condôminos'}
                </button>
            </Rodape>
        </Sheet>
    );
};
