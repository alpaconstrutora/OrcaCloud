// components/empreendimento/TranscricaoDoDocumento.tsx
// Seção "Transcrição" do painel de um documento + a fila que transcreve depois
// do envio (23/11/2026).
// Plano: docs/planos/2026-11-23-transcricao-de-documentos-do-empreendimento.md
//
// A fila mora na ABA (useFilaDeTranscricao), não no painel: o envio fecha o
// painel e a leitura continua; reabrir o painel mostra o andamento. Um arquivo
// por vez — o OCR ocupa o processador. Sair da aba cancela o que estiver lendo.
import React from 'react';
import { AlertTriangle, Check, Copy, RotateCcw, ScanText, Square } from 'lucide-react';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { SegmentedProgress } from '../ui/SegmentedProgress';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import {
  transcricaoDocumentoService as svc, TranscricaoGrandeDemais, ehCancelamento, type ProgressoTranscricao,
} from '../../services/transcricaoDocumentoService';
import {
  MAX_PAGINAS_OCR_AUTOMATICO, aplicarEdicao, contarDuvidosas, linhaDuvidosa, marcarRevisada,
  podeTranscrever, textoDaTranscricao, type Transcricao,
} from '../../utils/transcricaoDocumento';

/** A versão do arquivo no GED — é dela que o texto é. */
export interface VersaoTranscrevivel {
  id: string;
  storage_path: string;
  mime_type?: string | null;
}

/** `org/doc/<uuid>_Escritura.pdf` → `Escritura.pdf`. */
function nomeDaVersao(v: VersaoTranscrevivel): string {
  const ultimo = v.storage_path.split('/').pop() || v.storage_path;
  return ultimo.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i, '');
}

// ─── Fila ───────────────────────────────────────────────────────────────────

export type EstadoNaFila =
  | { fase: 'na_fila' }
  | { fase: 'lendo'; progresso: ProgressoTranscricao | null }
  | { fase: 'grande'; paginasEscaneadas: number }
  | { fase: 'erro'; mensagem: string };

interface Pedido {
  versao: VersaoTranscrevivel;
  organizationId: string;
  /** O arquivo recém-enviado; sem ele, baixa do GED. */
  arquivo?: Blob;
  /** Automático (depois do envio) respeita o limite de páginas escaneadas. */
  automatico: boolean;
}

export interface FilaDeTranscricao {
  estados: Record<string, EstadoNaFila>;
  /** Transcrições gravadas nesta visita à aba (o painel não precisa reler). */
  prontas: Record<string, Transcricao>;
  enfileirar: (p: Pedido) => void;
  cancelar: (versionId: string) => void;
  registrar: (t: Transcricao) => void;
}

export function useFilaDeTranscricao(): FilaDeTranscricao {
  const [estados, setEstados] = React.useState<Record<string, EstadoNaFila>>({});
  const [prontas, setProntas] = React.useState<Record<string, Transcricao>>({});
  const fila = React.useRef<Pedido[]>([]);
  const rodando = React.useRef(false);
  const atual = React.useRef<{ id: string; ctrl: AbortController } | null>(null);
  const montado = React.useRef(true);

  const marcar = (id: string, e: EstadoNaFila | null) => {
    if (!montado.current) return;
    setEstados(prev => {
      const novo = { ...prev };
      if (e) novo[id] = e; else delete novo[id];
      return novo;
    });
  };

  React.useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      fila.current = [];
      atual.current?.ctrl.abort();
    };
  }, []);

  const processar = React.useCallback(async () => {
    if (rodando.current) return;
    rodando.current = true;
    try {
      while (fila.current.length > 0 && montado.current) {
        const p = fila.current.shift()!;
        const id = p.versao.id;
        const ctrl = new AbortController();
        atual.current = { id, ctrl };
        marcar(id, { fase: 'lendo', progresso: null });
        try {
          const arquivo = p.arquivo ?? await svc.baixarArquivo(p.versao.storage_path);
          const r = await svc.transcrever(arquivo, nomeDaVersao(p.versao), {
            sinal: ctrl.signal,
            limitePaginasOcr: p.automatico ? MAX_PAGINAS_OCR_AUTOMATICO : undefined,
            onProgresso: progresso => marcar(id, { fase: 'lendo', progresso }),
          });
          const salva = await svc.salvar({ version_id: id, organization_id: p.organizationId, ...r });
          if (montado.current) setProntas(prev => ({ ...prev, [id]: salva }));
          marcar(id, null);
        } catch (err) {
          if (ehCancelamento(err)) marcar(id, null);
          else if (err instanceof TranscricaoGrandeDemais) marcar(id, { fase: 'grande', paginasEscaneadas: err.paginasEscaneadas });
          else marcar(id, { fase: 'erro', mensagem: err instanceof Error ? err.message : 'Erro ao transcrever.' });
        } finally {
          atual.current = null;
        }
      }
    } finally {
      rodando.current = false;
    }
  }, []);

  const enfileirar = React.useCallback((p: Pedido) => {
    if (!podeTranscrever(nomeDaVersao(p.versao), p.versao.mime_type)) return;
    const id = p.versao.id;
    if (atual.current?.id === id || fila.current.some(x => x.versao.id === id)) return;
    fila.current.push(p);
    marcar(id, { fase: 'na_fila' });
    processar();
  }, [processar]);

  const cancelar = React.useCallback((versionId: string) => {
    fila.current = fila.current.filter(x => x.versao.id !== versionId);
    if (atual.current?.id === versionId) atual.current.ctrl.abort();
    marcar(versionId, null);
  }, []);

  const registrar = React.useCallback((t: Transcricao) => {
    setProntas(prev => ({ ...prev, [t.version_id]: t }));
  }, []);

  return { estados, prontas, enfileirar, cancelar, registrar };
}

// ─── Seção ──────────────────────────────────────────────────────────────────

const AREA = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 leading-6 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none';
const BOTAO_SECUNDARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 shrink-0 whitespace-nowrap disabled:opacity-50';
const BOTAO_PRIMARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0 whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none';
const BOTAO_TEXTO = 'h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all';

/** ~10 s por página escaneada (medido em 23/11/2026). */
const minutosEstimados = (paginas: number) => Math.max(1, Math.round((paginas * 10) / 60));

interface Props {
  versao: VersaoTranscrevivel | null | undefined;
  organizationId: string;
  fila: FilaDeTranscricao;
  notify: (message: string, type?: 'success' | 'error') => void;
  /** Texto em revisão ainda não salvo — o painel pergunta antes de fechar. */
  onSujoChange?: (sujo: boolean) => void;
}

const TranscricaoDoDocumento: React.FC<Props> = ({ versao, organizationId, fila, notify, onSujoChange }) => {
  const confirm = useConfirm();
  const versionId = versao?.id ?? null;
  const transcreve = !!versao && !!podeTranscrever(nomeDaVersao(versao), versao.mime_type);

  const [doBanco, setDoBanco] = React.useState<Transcricao | null>(null);
  const [carregando, setCarregando] = React.useState(false);
  const [erroLeitura, setErroLeitura] = React.useState<string | null>(null);
  const [texto, setTexto] = React.useState<string | null>(null); // null = não está revisando
  const [salvando, setSalvando] = React.useState(false);
  const [copiado, setCopiado] = React.useState(false);

  React.useEffect(() => {
    setDoBanco(null);
    setTexto(null);
    setErroLeitura(null);
    if (!versionId || !transcreve) return;
    let vivo = true;
    setCarregando(true);
    svc.ler(versionId)
      .then(t => { if (vivo) setDoBanco(t); })
      .catch(err => { if (vivo) setErroLeitura(err instanceof Error ? err.message : 'Erro ao carregar a transcrição.'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [versionId, transcreve]);

  const transcricao = (versionId && fila.prontas[versionId]) || doBanco;
  const estado = versionId ? fila.estados[versionId] : undefined;
  const sujo = texto !== null && !!transcricao && texto !== textoDaTranscricao(transcricao.linhas);

  React.useEffect(() => { onSujoChange?.(sujo); }, [sujo, onSujoChange]);
  React.useEffect(() => () => onSujoChange?.(false), [onSujoChange]);

  if (!versao || !transcreve) return null;

  const duvidosas = transcricao ? contarDuvidosas(transcricao.linhas) : 0;

  const transcrever = async () => {
    if (transcricao && !await confirm({
      title: 'Transcrever de novo?',
      message: 'O texto atual, com as revisões feitas, é substituído pela nova leitura.',
      variant: 'warning', confirmLabel: 'Transcrever de novo',
    })) return;
    setTexto(null);
    fila.enfileirar({ versao, organizationId, automatico: false });
  };

  const gravar = async (linhas: Transcricao['linhas'], aviso: string) => {
    if (!transcricao) return;
    setSalvando(true);
    try {
      const salva = await svc.salvar({ ...transcricao, linhas });
      fila.registrar(salva);
      setTexto(null);
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

  const ocupado = !!estado && (estado.fase === 'lendo' || estado.fase === 'na_fila');
  const resumo = transcricao
    ? `${transcricao.origem === 'OCR' ? 'Lido por OCR' : 'Texto do PDF'} · ${transcricao.paginas} página${transcricao.paginas === 1 ? '' : 's'}`
    : undefined;

  const acoes = transcricao && texto === null && !ocupado ? (
    <>
      <ActionIconButton kind="duplicate" title="Copiar o texto" icon={copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} onClick={copiar} />
      <ActionIconButton kind="edit" title="Revisar o texto" onClick={() => setTexto(textoDaTranscricao(transcricao.linhas))} />
      <ActionIconButton kind="history" title="Transcrever de novo" icon={<RotateCcw className="w-4 h-4" />} onClick={transcrever} />
    </>
  ) : undefined;

  let corpo: React.ReactNode;
  if (estado?.fase === 'lendo' || estado?.fase === 'na_fila') {
    const p = estado.fase === 'lendo' ? estado.progresso : null;
    corpo = (
      <div className="space-y-3">
        {p ? (
          <SegmentedProgress
            percent={Math.round(p.fracao * 100)}
            tone="blue"
            hint={`Lendo a página ${p.pagina} de ${p.total}`}
            title="Andamento da leitura"
          />
        ) : (
          <p className="text-sm text-gray-700">
            {estado.fase === 'na_fila' ? 'Na fila: começa quando a transcrição anterior terminar.' : 'Preparando a leitura…'}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500">A leitura roda neste navegador. Pode fechar o painel; mantenha esta aba aberta.</p>
          <button type="button" onClick={() => fila.cancelar(versao.id)} className={BOTAO_SECUNDARIO}>
            <Square className="w-[15px] h-[15px]" /> Parar
          </button>
        </div>
      </div>
    );
  } else if (estado?.fase === 'grande') {
    corpo = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-700">
          Este arquivo tem {estado.paginasEscaneadas} páginas escaneadas: a leitura leva cerca de {minutosEstimados(estado.paginasEscaneadas)} min
          neste navegador, então não começou sozinha.
        </p>
        <button type="button" onClick={() => fila.enfileirar({ versao, organizationId, automatico: false })} className={BOTAO_SECUNDARIO}>
          <ScanText className="w-[15px] h-[15px]" /> Transcrever
        </button>
      </div>
    );
  } else if (!transcricao && carregando) {
    corpo = <p className="text-sm text-gray-500">Carregando a transcrição…</p>;
  } else if (!transcricao && erroLeitura) {
    corpo = <p className="text-sm text-red-700">{erroLeitura}</p>;
  } else if (!transcricao) {
    corpo = (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            {estado?.fase === 'erro' ? 'Tente de novo.' : 'Este arquivo ainda não foi transcrito.'}
          </p>
          <button type="button" onClick={transcrever} className={BOTAO_SECUNDARIO}>
            <ScanText className="w-[15px] h-[15px]" /> {estado?.fase === 'erro' ? 'Tentar de novo' : 'Transcrever'}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          O texto é lido aqui no navegador, sem enviar o arquivo a outro serviço. PDF com texto sai exato; o escaneado passa por
          OCR e as linhas com leitura duvidosa ficam destacadas para revisão.
        </p>
      </div>
    );
  } else if (texto !== null) {
    corpo = (
      <div className="space-y-3">
        <label htmlFor={`transcricao-${versao.id}`} className="sr-only">Texto transcrito</label>
        <textarea
          id={`transcricao-${versao.id}`}
          rows={18}
          className={AREA}
          value={texto}
          onChange={ev => setTexto(ev.target.value)}
        />
        <p className="text-xs text-gray-500">Linha corrigida deixa de ser destacada; a que ficar igual continua destacada.</p>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => setTexto(null)} className={BOTAO_TEXTO}>Cancelar</button>
          <span title={!sujo ? 'Nada foi alterado.' : undefined}>
            <button
              type="button"
              disabled={salvando || !sujo}
              onClick={() => gravar(aplicarEdicao(transcricao.linhas, texto), 'Transcrição salva.')}
              className={BOTAO_PRIMARIO}
            >
              {salvando ? 'Salvando...' : 'Salvar texto'}
            </button>
          </span>
        </div>
      </div>
    );
  } else if (transcricao.linhas.length === 0) {
    corpo = <p className="text-sm text-gray-600">Nenhum texto foi encontrado neste arquivo.</p>;
  } else {
    corpo = (
      <div className="space-y-3">
        {duvidosas > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="flex items-center gap-1.5 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {duvidosas} linha{duvidosas === 1 ? '' : 's'} com leitura duvidosa, destacada{duvidosas === 1 ? '' : 's'} abaixo. Confira com o arquivo.
            </p>
            <button type="button" onClick={marcarTudoRevisado} disabled={salvando} className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50">
              Marcar tudo como revisado
            </button>
          </div>
        )}
        <div className="max-h-[28rem] overflow-y-auto rounded-[6px] border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 leading-6">
          {transcricao.linhas.map((l, i) => {
            if (!l.t.trim()) return <div key={i} className="h-3" aria-hidden="true" />;
            if (linhaDuvidosa(l)) {
              return (
                <p key={i} className="-mx-3 px-3 border-l-2 border-amber-400 bg-amber-50 text-amber-900 whitespace-pre-wrap break-words"
                  title={`Leitura duvidosa (confiança ${l.c}%)`}>
                  {l.t}<span className="sr-only"> (leitura duvidosa)</span>
                </p>
              );
            }
            return <p key={i} className="whitespace-pre-wrap break-words">{l.t}</p>;
          })}
        </div>
        {transcricao.atualizado_por && (
          <p className="text-xs text-gray-500">Última alteração por {transcricao.atualizado_por}.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SecaoTitulo icon={ScanText} titulo="Transcrição" resumo={resumo} acoes={acoes} />
      {estado?.fase === 'erro' && <p className="text-sm text-red-700">Não foi possível transcrever: {estado.mensagem}</p>}
      {corpo}
    </div>
  );
};

export default TranscricaoDoDocumento;
