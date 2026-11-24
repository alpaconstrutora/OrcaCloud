// components/empreendimento/TelaDeTranscricao.tsx
// Tela própria da transcrição de um documento (23/11/2026).
// Plano: docs/planos/2026-11-23-transcricao-de-documentos-do-empreendimento.md
//
// Pedido: "a transcrição em drawer fica muito ruim a visualização. implemente uma
// tela". Ocupa o lugar da aba Documentos (voltar de 1 salto, §23.1) — e não do
// detalhe do empreendimento inteiro — porque a fila de transcrição mora na aba:
// sair dela cancelaria a leitura em andamento.
//
// Arquivo ORIGINAL à esquerda e texto à direita: revisar linha duvidosa é olhar
// as duas coisas ao mesmo tempo. O arquivo é mostrado por URL local (blob) — o
// visualizador de PDF do navegador, com zoom e busca, sem depender de o Storage
// aceitar ser embutido.
//
// 24/11/2026 — aba "Partes identificadas" ao lado do texto: nome, papel, RG e
// CPF/CNPJ de quem aparece qualificado no documento (utils/partesDaTranscricao);
// no texto, os nomes delas vêm em negrito. Depois, os OBJETOS (o que está em
// maiúsculas no meio do texto: "UMA CASA DE MORADA", "DIREITO DE SERVIDÃO …"),
// na aba própria "Objetos identificados", ao lado de "Partes identificadas", e
// também em negrito no texto.
// Plano: docs/planos/2026-11-24-partes-identificadas-na-transcricao.md
import React from 'react';
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronUp, Copy, ExternalLink, Pencil, RotateCcw, ScanText } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { TabsBar } from '../ui/TabsBar';
import { useConfirm } from '../ui/confirm';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { transcricaoDocumentoService as svc } from '../../services/transcricaoDocumentoService';
import {
  aplicarEdicao, contarDuvidosas, linhaDuvidosa, marcarRevisada, podeTranscrever, textoDaTranscricao,
  type Transcricao,
} from '../../utils/transcricaoDocumento';
import { formatarCnpj, formatarCpf, identificarObjetos, identificarPartes, trechosEmNegrito, type ParteIdentificada, type Trecho } from '../../utils/partesDaTranscricao';
import {
  BOTAO_PRIMARIO, BOTAO_SECUNDARIO, blocoSemTexto, nomeDaVersao, resumoDaTranscricao, useTranscreverDeNovo,
  useTranscricao, type FilaDeTranscricao, type VersaoTranscrevivel,
} from './TranscricaoDoDocumento';

const AREA = 'w-full h-full resize-none px-4 py-3 bg-white text-sm font-normal text-gray-900 leading-6 placeholder:text-gray-400 outline-none';
const BOTAO_TEXTO = 'h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all';
/** Altura das duas colunas: a janela menos o cabeçalho desta tela (a tela rola até ele ao abrir). */
const ALTURA_COLUNA = 'h-[70vh] lg:h-[calc(100vh-10rem)] min-h-[28rem]';

type Vista = 'texto' | 'partes' | 'objetos';

/** Texto da linha com os nomes das partes em negrito (pedido de 24/11/2026). */
function comNegrito(texto: string, trechos: Trecho[] | undefined): React.ReactNode {
  if (!trechos || trechos.length === 0) return texto;
  const pedacos: React.ReactNode[] = [];
  let pos = 0;
  trechos.forEach(([a, b], k) => {
    if (a > pos) pedacos.push(texto.slice(pos, a));
    pedacos.push(<strong key={k} className="font-semibold">{texto.slice(a, b)}</strong>);
    pos = b;
  });
  if (pos < texto.length) pedacos.push(texto.slice(pos));
  return pedacos;
}

function documentosDaParte(p: ParteIdentificada): string {
  return [
    p.cpf && `CPF ${formatarCpf(p.cpf)}`,
    p.cnpj && `CNPJ ${formatarCnpj(p.cnpj)}`,
    p.rg && `RG ${p.rg}`,
  ].filter(Boolean).join(' · ');
}

interface Props {
  /** Nome do documento (título do item do checklist ou do documento no GED). */
  titulo: string;
  versao: VersaoTranscrevivel;
  organizationId: string;
  fila: FilaDeTranscricao;
  notify: (message: string, type?: 'success' | 'error') => void;
  onVoltar: () => void;
}

const TelaDeTranscricao: React.FC<Props> = ({ titulo, versao, organizationId, fila, notify, onVoltar }) => {
  const confirm = useConfirm();
  const { transcricao, estado, carregando, erro } = useTranscricao(versao, fila);
  const transcreverDeNovo = useTranscreverDeNovo(fila);
  const guarda = useUnsavedChanges({ guardarNavegacao: true });

  const [texto, setTexto] = React.useState<string | null>(null); // null = não está revisando
  const [salvando, setSalvando] = React.useState(false);
  const [copiado, setCopiado] = React.useState(false);
  const [foco, setFoco] = React.useState<number | null>(null); // índice na lista de duvidosas
  const [vista, setVista] = React.useState<Vista>('texto');
  const [linhaMarcada, setLinhaMarcada] = React.useState<number | null>(null); // linha da parte escolhida
  const [itemCopiado, setItemCopiado] = React.useState<string | null>(null); // parte ou objeto copiado
  const listaRef = React.useRef<HTMLDivElement>(null);
  const raizRef = React.useRef<HTMLDivElement>(null);
  // Abre com o cabeçalho desta tela no topo: as duas colunas usam a altura da janela.
  React.useEffect(() => { raizRef.current?.scrollIntoView({ block: 'start' }); }, []);

  const sujo = texto !== null && !!transcricao && texto !== textoDaTranscricao(transcricao.linhas);
  const { markDirty, markSaved } = guarda;
  React.useEffect(() => { if (sujo) markDirty(); else markSaved(); }, [sujo, markDirty, markSaved]);

  // ── Arquivo original ──────────────────────────────────────────────────────
  const ehPdf = podeTranscrever(nomeDaVersao(versao), versao.mime_type) === 'pdf';
  const [urlDoArquivo, setUrlDoArquivo] = React.useState<string | null>(null);
  const [erroArquivo, setErroArquivo] = React.useState<string | null>(null);
  React.useEffect(() => {
    let vivo = true;
    let url: string | null = null;
    setUrlDoArquivo(null);
    setErroArquivo(null);
    svc.baixarArquivo(versao.storage_path)
      .then(blob => {
        if (!vivo) return;
        // Sem o tipo certo o navegador baixa o arquivo em vez de mostrar.
        const tipado = ehPdf && blob.type !== 'application/pdf' ? new Blob([blob], { type: 'application/pdf' }) : blob;
        url = URL.createObjectURL(tipado);
        setUrlDoArquivo(url);
      })
      .catch(err => { if (vivo) setErroArquivo(err instanceof Error ? err.message : 'Não foi possível abrir o arquivo.'); });
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
  }, [versao.storage_path, ehPdf]);

  // ── Linhas duvidosas: contar e navegar ────────────────────────────────────
  const indicesDuvidosos = React.useMemo(
    () => (transcricao ? transcricao.linhas.flatMap((l, i) => (linhaDuvidosa(l) ? [i] : [])) : []),
    [transcricao],
  );
  const duvidosas = indicesDuvidosos.length;
  // Rola só a caixa do texto: scrollIntoView rolaria também a página e tiraria o
  // cabeçalho da tela.
  const rolarAte = React.useCallback((indice: number) => {
    const caixa = listaRef.current;
    const linha = caixa?.querySelector<HTMLElement>(`[data-linha="${indice}"]`);
    if (caixa && linha) caixa.scrollTo({ top: linha.offsetTop - caixa.clientHeight / 2, behavior: 'smooth' });
  }, []);
  const irPara = (posicao: number) => {
    if (duvidosas === 0) return;
    const p = (posicao + duvidosas) % duvidosas;
    setFoco(p);
    setLinhaMarcada(null);
    rolarAte(indicesDuvidosos[p]);
  };

  // ── Partes e objetos identificados ────────────────────────────────────────
  const partes = React.useMemo(() => (transcricao ? identificarPartes(transcricao.linhas) : []), [transcricao]);
  const objetos = React.useMemo(
    () => (transcricao ? identificarObjetos(transcricao.linhas, partes) : []),
    [transcricao, partes],
  );
  const negrito = React.useMemo(
    () => (transcricao ? trechosEmNegrito(transcricao.linhas, partes, objetos) : new Map<number, Trecho[]>()),
    [transcricao, partes, objetos],
  );
  const verNoTexto = (linha: number) => {
    setFoco(null);
    setLinhaMarcada(linha);
    setVista('texto');
  };
  // A caixa do texto só existe na vista Texto: rolar depois de ela aparecer.
  React.useEffect(() => {
    if (vista === 'texto' && linhaMarcada !== null) rolarAte(linhaMarcada);
  }, [vista, linhaMarcada, rolarAte]);
  const copiarItem = async (chave: string, conteudo: string) => {
    try {
      await navigator.clipboard.writeText(conteudo);
      setItemCopiado(chave);
      setTimeout(() => setItemCopiado(atual => (atual === chave ? null : atual)), 2000);
    } catch {
      notify('O navegador não deixou copiar. Selecione o texto e copie com Ctrl+C.', 'error');
    }
  };

  // ── Ações ─────────────────────────────────────────────────────────────────
  const voltar = async () => { if (await guarda.confirmDiscard()) onVoltar(); };

  const gravar = async (linhas: Transcricao['linhas'], aviso: string) => {
    if (!transcricao) return;
    setSalvando(true);
    try {
      const salva = await svc.salvar({ ...transcricao, linhas });
      fila.registrar(salva);
      setTexto(null);
      setFoco(null);
      setLinhaMarcada(null); // o texto salvo pode ter outras linhas
      notify(aviso);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao salvar a transcrição.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const marcarTudoRevisado = async () => {
    if (!transcricao) return;
    if (!await confirm({
      title: 'Marcar tudo como revisado?',
      message: `As ${duvidosas} linhas destacadas deixam de ser destacadas. Faça isso depois de conferir o texto com o arquivo.`,
      confirmLabel: 'Marcar como revisado',
    })) return;
    gravar(marcarRevisada(transcricao.linhas), 'Transcrição marcada como revisada.');
  };

  const copiar = async () => {
    if (!transcricao) return;
    try {
      await navigator.clipboard.writeText(textoDaTranscricao(transcricao.linhas));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      notify('O navegador não deixou copiar. Selecione o texto e copie com Ctrl+C.', 'error');
    }
  };

  const ocupado = estado?.fase === 'lendo' || estado?.fase === 'na_fila';
  const semTexto = blocoSemTexto({
    estado, temTexto: !!transcricao, carregando, erroLeitura: erro,
    onTranscrever: () => transcreverDeNovo(versao, organizationId, !!transcricao),
    onParar: () => fila.cancelar(versao.id),
  });

  // ── Cabeçalho ─────────────────────────────────────────────────────────────
  const acoes = texto !== null ? (
    <>
      <button type="button" onClick={() => setTexto(null)} className={BOTAO_TEXTO}>Cancelar</button>
      <span title={!sujo ? 'Nada foi alterado.' : undefined}>
        <button type="button" disabled={salvando || !sujo}
          onClick={() => transcricao && gravar(aplicarEdicao(transcricao.linhas, texto), 'Transcrição salva.')}
          className={BOTAO_PRIMARIO}>
          {salvando ? 'Salvando...' : 'Salvar texto'}
        </button>
      </span>
    </>
  ) : transcricao && !ocupado ? (
    <>
      <ActionIconButton kind="duplicate" title="Copiar o texto"
        icon={copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} onClick={copiar} />
      <ActionIconButton kind="history" title="Transcrever de novo" icon={<RotateCcw className="w-4 h-4" />}
        onClick={() => transcreverDeNovo(versao, organizationId, true)} />
      <button type="button" onClick={() => { setVista('texto'); setTexto(textoDaTranscricao(transcricao.linhas)); }} className={BOTAO_SECUNDARIO}>
        <Pencil className="w-[15px] h-[15px]" /> Revisar texto
      </button>
    </>
  ) : null;

  return (
    <div ref={raizRef} className="space-y-3 scroll-mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={() => void voltar()} title="Voltar para Documentos"
            className="flex items-center justify-center h-9 w-9 -ml-2 rounded-[6px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-all shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">Transcrição · {titulo}</h2>
            <p className="text-sm text-gray-500 truncate">
              {nomeDaVersao(versao)}{transcricao ? ` · ${resumoDaTranscricao(transcricao)}` : ''}
            </p>
          </div>
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Arquivo original */}
        <section aria-label="Arquivo original" className={`flex flex-col bg-white rounded-[10px] border border-gray-200 overflow-hidden ${ALTURA_COLUNA}`}>
          <div className="flex items-center justify-between gap-3 h-11 px-4 border-b border-gray-100 shrink-0">
            <h3 className="text-sm font-semibold text-gray-900">Arquivo original</h3>
            {urlDoArquivo && (
              <a href={urlDoArquivo} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
                <ExternalLink className="w-4 h-4" /> Abrir em outra aba
              </a>
            )}
          </div>
          <div className="flex-1 min-h-0 bg-gray-50">
            {erroArquivo ? (
              <p className="p-4 text-sm text-red-700">{erroArquivo}</p>
            ) : !urlDoArquivo ? (
              <p className="p-4 text-sm text-gray-500">Carregando o arquivo…</p>
            ) : ehPdf ? (
              <iframe src={urlDoArquivo} title={`Arquivo original: ${nomeDaVersao(versao)}`} className="w-full h-full border-0" />
            ) : (
              <div className="h-full overflow-auto p-3">
                <img src={urlDoArquivo} alt={`Arquivo original: ${nomeDaVersao(versao)}`} className="max-w-full mx-auto" />
              </div>
            )}
          </div>
        </section>

        {/* Texto transcrito */}
        <section aria-label="Texto transcrito" className={`flex flex-col bg-white rounded-[10px] border border-gray-200 overflow-hidden ${ALTURA_COLUNA}`}>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 min-h-11 px-4 py-1.5 border-b border-gray-100 shrink-0">
            {transcricao && texto === null && !semTexto ? (
              <TabsBar<Vista> bare value={vista} onChange={setVista} tabs={[
                { id: 'texto', label: 'Texto' },
                { id: 'partes', label: 'Partes identificadas', badge: partes.length, badgeTitulo: 'Partes encontradas no texto' },
                { id: 'objetos', label: 'Objetos identificados', badge: objetos.length, badgeTitulo: 'Objetos encontrados no texto' },
              ]} />
            ) : (
              <h3 className="text-sm font-semibold text-gray-900">{texto !== null ? 'Revisando o texto' : 'Texto'}</h3>
            )}
            {transcricao && texto === null && vista === 'texto' && duvidosas > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {foco !== null ? `${foco + 1} de ${duvidosas}` : duvidosas} {duvidosas === 1 ? 'linha duvidosa' : 'linhas duvidosas'}
                </span>
                <ActionIconButton kind="move" size="sm" title="Linha duvidosa anterior" icon={<ChevronUp className="w-3.5 h-3.5" />}
                  onClick={() => irPara(foco === null ? duvidosas - 1 : foco - 1)} />
                <ActionIconButton kind="move" size="sm" title="Próxima linha duvidosa" icon={<ChevronDown className="w-3.5 h-3.5" />}
                  onClick={() => irPara(foco === null ? 0 : foco + 1)} />
                <button type="button" onClick={marcarTudoRevisado} disabled={salvando}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50">
                  Marcar tudo como revisado
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0">
            {semTexto ? (
              <div className="p-4 space-y-3">
                {semTexto}
              </div>
            ) : texto !== null ? (
              <div className="h-full flex flex-col">
                <label htmlFor={`transcricao-${versao.id}`} className="sr-only">Texto transcrito</label>
                <textarea id={`transcricao-${versao.id}`} className={`${AREA} flex-1`} value={texto}
                  onChange={ev => setTexto(ev.target.value)} autoFocus />
                <p className="px-4 py-2 border-t border-gray-100 text-xs text-gray-500 shrink-0">
                  Linha corrigida deixa de ser destacada; a que ficar igual continua destacada.
                </p>
              </div>
            ) : transcricao && vista === 'partes' ? (
              <div className="h-full overflow-y-auto">
                {partes.length === 0 ? (
                  <div className="p-4 space-y-1">
                    <p className="text-sm text-gray-900">Nenhuma parte identificada neste texto.</p>
                    <p className="text-sm text-gray-600">
                      A busca procura nomes em letras maiúsculas seguidos de qualificação — "brasileiro", "portador do RG", "inscrita no CNPJ".
                    </p>
                  </div>
                ) : (
                  <>
                    <ul className="divide-y divide-gray-100">
                      {partes.map((p, i) => {
                        const docs = documentosDaParte(p);
                        const chave = `parte-${i}`;
                        return (
                          <li key={`${p.nome}-${p.linha}`} className="flex items-start justify-between gap-3 px-4 py-3">
                            <div className="min-w-0 space-y-0.5">
                              <p className="text-sm font-medium text-gray-900 break-words">{p.nome}</p>
                              <p className="text-sm text-gray-600">
                                {p.papel ?? 'Papel não identificado'}{p.conjugeDe ? ` · cônjuge de ${p.conjugeDe}` : ''}
                              </p>
                              <p className="text-sm text-gray-900 tabular-nums">
                                {docs || <span className="text-gray-600">Nenhum documento encontrado junto ao nome</span>}
                              </p>
                              {(p.duvidosa || p.documentoInvalido) && (
                                <p className="flex items-center gap-1.5 text-sm text-amber-800">
                                  <AlertTriangle className="w-4 h-4 shrink-0" />
                                  {p.documentoInvalido
                                    ? 'O número lido não confere (dígito verificador) — confira no arquivo.'
                                    : 'Saiu de linha com leitura duvidosa — confira no arquivo.'}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <ActionIconButton kind="duplicate" size="sm" title="Copiar nome e documentos"
                                icon={itemCopiado === chave ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                onClick={() => void copiarItem(chave, [p.nome, docs].filter(Boolean).join(' — '))} />
                              <ActionIconButton kind="view" size="sm" title="Ver no texto"
                                icon={<ScanText className="w-3.5 h-3.5" />} onClick={() => verNoTexto(p.linha)} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
                      Lido automaticamente do texto: nomes em maiúsculas seguidos de qualificação. Confira com o arquivo original.
                    </p>
                  </>
                )}
              </div>
            ) : transcricao && vista === 'objetos' ? (
              <div className="h-full overflow-y-auto">
                {objetos.length === 0 ? (
                  <div className="p-4 space-y-1">
                    <p className="text-sm text-gray-900">Nenhum objeto identificado neste texto.</p>
                    <p className="text-sm text-gray-600">
                      A busca procura trechos em letras maiúsculas no meio do texto — "UMA CASA DE MORADA", "DIREITO DE SERVIDÃO".
                    </p>
                  </div>
                ) : (
                  <>
                    <ul className="divide-y divide-gray-100">
                      {objetos.map((o, i) => {
                        const chave = `objeto-${i}`;
                        return (
                          <li key={`${o.texto}-${o.linha}`} className="flex items-start justify-between gap-3 px-4 py-3">
                            <p className="min-w-0 text-sm font-medium text-gray-900 break-words">{o.texto}</p>
                            <div className="flex items-center gap-1 shrink-0">
                              <ActionIconButton kind="duplicate" size="sm" title="Copiar o objeto"
                                icon={itemCopiado === chave ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                onClick={() => void copiarItem(chave, o.texto)} />
                              <ActionIconButton kind="view" size="sm" title="Ver no texto"
                                icon={<ScanText className="w-3.5 h-3.5" />} onClick={() => verNoTexto(o.linha)} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
                      Lido automaticamente do texto: trechos em maiúsculas no meio do texto que não são partes, cabeçalho do cartório nem valor por extenso. Confira com o arquivo original.
                    </p>
                  </>
                )}
              </div>
            ) : transcricao && transcricao.linhas.length === 0 ? (
              <p className="p-4 text-sm text-gray-600">Nenhum texto foi encontrado neste arquivo.</p>
            ) : transcricao ? (
              <div ref={listaRef} className="relative h-full overflow-y-auto px-4 py-3 text-sm text-gray-900 leading-6">
                {estado?.fase === 'erro' && <p className="mb-3 text-sm text-red-700">Não foi possível transcrever de novo: {estado.mensagem}</p>}
                {transcricao.linhas.map((l, i) => {
                  if (!l.t.trim()) return <div key={i} className="h-3" aria-hidden="true" />;
                  const marcada = linhaMarcada === i;
                  if (!linhaDuvidosa(l)) {
                    return (
                      <p key={i} data-linha={i}
                        className={`whitespace-pre-wrap break-words ${marcada ? '-mx-4 px-4 bg-blue-50 ring-1 ring-inset ring-blue-400' : ''}`}>
                        {comNegrito(l.t, negrito.get(i))}
                      </p>
                    );
                  }
                  const emFoco = (foco !== null && indicesDuvidosos[foco] === i) || marcada;
                  return (
                    <p key={i} data-linha={i}
                      className={`-mx-4 px-4 border-l-2 border-amber-400 whitespace-pre-wrap break-words text-amber-900 ${emFoco ? 'bg-amber-100 ring-1 ring-inset ring-amber-400' : 'bg-amber-50'}`}
                      title={`Leitura duvidosa (confiança ${l.c}%)`}>
                      {comNegrito(l.t, negrito.get(i))}<span className="sr-only"> (leitura duvidosa)</span>
                    </p>
                  );
                })}
                {transcricao.atualizado_por && (
                  <p className="mt-4 text-xs text-gray-500">Última alteração por {transcricao.atualizado_por}.</p>
                )}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
};

export default TelaDeTranscricao;
