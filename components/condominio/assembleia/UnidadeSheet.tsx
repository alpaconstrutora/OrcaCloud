// components/condominio/assembleia/UnidadeSheet.tsx
// Gaveta de UMA unidade na assembleia: presença (na sala / por procurador) e voto
// presencial por item (R7). É gaveta, não tela: o gestor está conduzindo a reunião
// e precisa da lista de unidades atrás (UI_PATTERNS §2).
//
// Quem grava é o pai (AssembleiaDetalheView): esta gaveta só junta o que o gestor
// escolheu e diz, à vista, por que um botão está desligado — unidade impedida, sem
// presença, assembleia ainda não instalada, voto na sala que trava a presença.

import React from 'react';
import { UserCheck, Vote, Paperclip } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../../ui/sheet';
import SecaoTitulo from '../../ui/SecaoTitulo';
import { EXTENSOES_ACEITAS } from '../../../services/condominioComunicacaoService';
import {
    dataHoraBrasilia, percentualDoTotal, rotuloOpcao, ROTULO_ORIGEM, ROTULO_QUORUM,
} from '../../../utils/assembleiaTextos';
import type {
    ItemAssembleia, OpcaoVoto, PresencaAssembleia, StatusAssembleia, UnidadeNaAssembleia, VotoAssembleia,
} from '../../../services/condominioAssembleiaService';
import { BOTAO_PRIMARIO, BOTAO_VOLTAR, CAMPO, MOTIVO, ROTULO, opcoesDoItem } from './comum';

type Escolha = PresencaAssembleia | 'NENHUMA';

const ROTULO_ESCOLHA: Record<Escolha, string> = {
    PRESENCIAL: 'Na sala',
    PROCURADOR: 'Por procurador',
    NENHUMA: 'Sem presença',
};

interface Props {
    open: boolean;
    onClose: () => void;
    status: StatusAssembleia;
    unidade: UnidadeNaAssembleia | null;
    /** Soma das frações da assembleia — o peso aparece em % dela, nunca a fração crua. */
    total: number;
    itens: ItemAssembleia[];
    /** Votos DESTA unidade. */
    votos: VotoAssembleia[];
    /** Motivo do impedimento agora (R3), ou null. */
    impedimento: string | null;
    gravando: boolean;
    onRegistrarPresenca: (p: {
        presenca: PresencaAssembleia | null; procurador: string | null; arquivo: File | null;
    }) => Promise<void>;
    onLancarVoto: (item: ItemAssembleia, opcao: OpcaoVoto) => Promise<void>;
}

const UnidadeSheet: React.FC<Props> = ({
    open, onClose, status, unidade, total, itens, votos, impedimento, gravando, onRegistrarPresenca, onLancarVoto,
}) => {
    const atual: Escolha = unidade?.presenca ?? 'NENHUMA';
    const [escolha, setEscolha] = React.useState<Escolha>(atual);
    const [procurador, setProcurador] = React.useState('');
    const [arquivo, setArquivo] = React.useState<File | null>(null);

    // Abrir outra unidade (ou a mesma depois de gravar) parte do que está gravado.
    React.useEffect(() => {
        setEscolha(unidade?.presenca ?? 'NENHUMA');
        setProcurador(unidade?.procuradorNome ?? '');
        setArquivo(null);
    }, [unidade?.unitId, unidade?.presenca, unidade?.procuradorNome, open]);

    const emAndamento = status === 'CONVOCADA' || status === 'INSTALADA';
    const temVotoNaSala = votos.some(v => v.origem === 'PRESENCIAL');
    const votoDoItem = (itemId: string) => votos.find(v => v.itemId === itemId) ?? null;

    // ── presença ─────────────────────────────────────────────────────────
    const motivoPresenca = !emAndamento
        ? 'Presença só se registra com a assembleia convocada ou instalada.'
        : impedimento
            ? `Unidade impedida: ${impedimento}. Ela não registra presença enquanto a cota estiver vencida (CC art. 1.335, III).`
            : null;
    const motivoSemPresenca = temVotoNaSala
        ? 'Esta unidade já tem voto lançado na sala: a presença dela não pode ser removida.'
        : null;

    const procuradorLimpo = procurador.trim();
    const procuracaoExistente = unidade?.procuracaoDocumentoId ?? null;
    const motivoRegistrar = motivoPresenca
        ?? (escolha === 'PROCURADOR' && (!procuradorLimpo || (!arquivo && !procuracaoExistente))
            ? 'Informe o nome do procurador e anexe a procuração (arquivo obrigatório).'
            : escolha === atual && (escolha !== 'PROCURADOR'
                || (procuradorLimpo === (unidade?.procuradorNome ?? '') && !arquivo))
                ? 'Nada mudou na presença desta unidade.'
                : escolha === 'NENHUMA' && motivoSemPresenca ? motivoSemPresenca : null);

    const registrar = () => onRegistrarPresenca({
        presenca: escolha === 'NENHUMA' ? null : escolha,
        procurador: escolha === 'PROCURADOR' ? procuradorLimpo : null,
        arquivo: escolha === 'PROCURADOR' ? arquivo : null,
    });

    // ── voto na sala ─────────────────────────────────────────────────────
    const motivoVoto = status !== 'INSTALADA'
        ? (status === 'CONVOCADA'
            ? 'Voto na sala só depois de instalar a assembleia. Até lá, o condômino vota pelo portal.'
            : 'Esta assembleia não aceita mais votos.')
        : impedimento
            ? `Unidade impedida: ${impedimento}.`
            : !unidade?.presenca
                ? 'Registre a presença da unidade (na sala ou por procurador) antes de lançar o voto.'
                : gravando ? 'Aguarde: gravando o voto anterior.' : null;

    const descricaoPresenca = (u: UnidadeNaAssembleia) => u.presenca === 'PROCURADOR'
        ? `Por procurador: ${u.procuradorNome ?? 'nome não informado'}`
        : u.presenca === 'PRESENCIAL' ? 'Na sala' : 'Sem presença registrada';

    return (
        <Sheet open={open} onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{unidade?.unidadeRotulo ?? 'Unidade'}</SheetTitle>
                {unidade && (
                    <SheetDescription>
                        {unidade.proprietarioNome ?? 'Sem proprietário vigente'}
                        {' · '}peso {percentualDoTotal(unidade.fracao, total)}
                        {' · '}{descricaoPresenca(unidade)}
                    </SheetDescription>
                )}
            </SheetHeader>
            <SheetPanel className="p-6 space-y-8">
                {impedimento && (
                    <p className="text-sm text-red-600">Impedida agora: {impedimento}.</p>
                )}

                {/* ── Presença ───────────────────────────────────────── */}
                <section className="space-y-4">
                    <SecaoTitulo icon={UserCheck} titulo="Presença" />
                    <fieldset className="space-y-2" disabled={!!motivoPresenca}>
                        <legend className="sr-only">Presença da unidade</legend>
                        <div className="flex flex-wrap gap-x-6 gap-y-2">
                            {(['PRESENCIAL', 'PROCURADOR', 'NENHUMA'] as Escolha[]).map(op => {
                                const desligada = !!motivoPresenca || (op === 'NENHUMA' && !!motivoSemPresenca && atual !== 'NENHUMA');
                                return (
                                    <label key={op} className={`flex items-center gap-2 text-sm text-gray-900 ${desligada ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                                        <input
                                            type="radio" name="presenca-unidade" value={op}
                                            checked={escolha === op}
                                            disabled={desligada}
                                            onChange={() => setEscolha(op)}
                                            className="w-4 h-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        {ROTULO_ESCOLHA[op]}
                                    </label>
                                );
                            })}
                        </div>
                        {motivoPresenca && <p className={MOTIVO}>{motivoPresenca}</p>}
                        {!motivoPresenca && motivoSemPresenca && atual !== 'NENHUMA' && (
                            <p className={MOTIVO}>{motivoSemPresenca}</p>
                        )}
                    </fieldset>

                    {escolha === 'PROCURADOR' && !motivoPresenca && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5">
                                <label htmlFor="assembleia-procurador" className={ROTULO}>Nome do procurador</label>
                                <input id="assembleia-procurador" type="text" value={procurador}
                                    onChange={ev => setProcurador(ev.target.value)}
                                    placeholder="Nome completo" className={CAMPO} />
                            </div>
                            <div className="space-y-1.5">
                                <label htmlFor="assembleia-procuracao" className={ROTULO}>Procuração (arquivo)</label>
                                <input id="assembleia-procuracao" type="file" accept={EXTENSOES_ACEITAS}
                                    onChange={ev => setArquivo(ev.target.files?.[0] ?? null)}
                                    className="block w-full text-sm text-gray-900 file:mr-3 file:h-9 file:px-3 file:rounded-[6px] file:border file:border-gray-200 file:bg-white file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-50" />
                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                    <Paperclip className="w-3.5 h-3.5" />
                                    {arquivo ? arquivo.name
                                        : procuracaoExistente ? 'Procuração já anexada — envie outra só para trocar.'
                                            : 'Vai para Documentos do condomínio, fora do portal, e é listada na ata.'}
                                </p>
                            </div>
                        </div>
                    )}

                    {!motivoPresenca && (
                        <div className="flex flex-wrap items-center justify-end gap-3">
                            {motivoRegistrar && <p className={`${MOTIVO} mr-auto`}>{motivoRegistrar}</p>}
                            <button type="button" onClick={registrar} disabled={!!motivoRegistrar || gravando}
                                className={BOTAO_PRIMARIO}>
                                {gravando ? 'Gravando...' : 'Registrar presença'}
                            </button>
                        </div>
                    )}
                </section>

                {/* ── Votos na sala ──────────────────────────────────── */}
                <section className="space-y-4">
                    <SecaoTitulo icon={Vote} titulo="Votos na sala" resumo="vale o último voto da unidade, venha de onde vier" />
                    {motivoVoto && <p className={MOTIVO}>{motivoVoto}</p>}
                    <div className="space-y-4">
                        {itens.map((item, i) => {
                            const voto = votoDoItem(item.id);
                            return (
                                <div key={item.id} role="group" aria-label={item.titulo}
                                    className="rounded-[10px] border border-gray-100 p-4 space-y-3">
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">{i + 1}. {item.titulo}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {ROTULO_QUORUM[item.quorum]}
                                            {' · '}
                                            {voto
                                                ? <span className="text-gray-700">
                                                    voto atual: {rotuloOpcao(voto.opcao)} — pelo {ROTULO_ORIGEM[voto.origem]} em {dataHoraBrasilia(voto.votadoEm)}
                                                </span>
                                                : 'sem voto'}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {opcoesDoItem(item).map(op => {
                                            const marcada = voto?.opcao === op;
                                            return (
                                                <button key={op} type="button" aria-pressed={marcada}
                                                    disabled={!!motivoVoto}
                                                    onClick={() => onLancarVoto(item, op)}
                                                    className={`h-9 px-3.5 rounded-[6px] border text-sm font-medium transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                                                        marcada ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                                                    }`}>
                                                    {rotuloOpcao(op)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className={BOTAO_VOLTAR}>Fechar</button>
            </SheetFooter>
        </Sheet>
    );
};

export default UnidadeSheet;
