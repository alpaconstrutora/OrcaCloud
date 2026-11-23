// components/empreendimento/TranscricaoDoDocumento.tsx
// Transcrição de documentos (23/11/2026) — a fila, a leitura do que está gravado e
// o resumo que aparece no painel do documento.
// Plano: docs/planos/2026-11-23-transcricao-de-documentos-do-empreendimento.md
//
// O TEXTO não é lido no painel lateral: "a transcrição em drawer fica muito ruim a
// visualização" (pedido de 23/11/2026). O painel mostra só o andamento e o resumo,
// e "Abrir transcrição" leva à tela própria (TelaDeTranscricao), com o arquivo ao
// lado do texto.
//
// A fila mora na ABA (useFilaDeTranscricao), não no painel nem na tela: o envio
// fecha o painel e a leitura continua; um arquivo por vez (o OCR ocupa o
// processador). Sair da aba Documentos cancela o que estiver lendo.
import React from 'react';
import { RotateCcw, ScanText, Square } from 'lucide-react';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { SegmentedProgress } from '../ui/SegmentedProgress';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import {
  transcricaoDocumentoService as svc, TranscricaoGrandeDemais, ehCancelamento, type ProgressoTranscricao,
} from '../../services/transcricaoDocumentoService';
import {
  MAX_PAGINAS_OCR_AUTOMATICO, contarDuvidosas, podeTranscrever, type Transcricao,
} from '../../utils/transcricaoDocumento';

/** A versão do arquivo no GED — é dela que o texto é. */
export interface VersaoTranscrevivel {
  id: string;
  storage_path: string;
  mime_type?: string | null;
}

/** `org/doc/<uuid>_Escritura.pdf` → `Escritura.pdf`. */
export function nomeDaVersao(v: VersaoTranscrevivel): string {
  const ultimo = v.storage_path.split('/').pop() || v.storage_path;
  return ultimo.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i, '');
}

export const versaoTranscreve = (v: VersaoTranscrevivel | null | undefined): v is VersaoTranscrevivel =>
  !!v && !!podeTranscrever(nomeDaVersao(v), v.mime_type);

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
  /** Transcrições gravadas nesta visita à aba (quem mostra não precisa reler). */
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
    if (!versaoTranscreve(p.versao)) return;
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

// ─── Leitura do que está gravado (painel e tela) ────────────────────────────

export function useTranscricao(versao: VersaoTranscrevivel | null | undefined, fila: FilaDeTranscricao) {
  const versionId = versaoTranscreve(versao) ? versao.id : null;
  const [doBanco, setDoBanco] = React.useState<Transcricao | null>(null);
  const [carregando, setCarregando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDoBanco(null);
    setErro(null);
    if (!versionId) return;
    let vivo = true;
    setCarregando(true);
    svc.ler(versionId)
      .then(t => { if (vivo) setDoBanco(t); })
      .catch(err => { if (vivo) setErro(err instanceof Error ? err.message : 'Erro ao carregar a transcrição.'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [versionId]);

  return {
    transcricao: (versionId && fila.prontas[versionId]) || doBanco,
    estado: versionId ? fila.estados[versionId] : undefined,
    carregando,
    erro,
  };
}

// ─── Estados sem texto (painel e tela) ──────────────────────────────────────

export const BOTAO_SECUNDARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 shrink-0 whitespace-nowrap disabled:opacity-50';
export const BOTAO_PRIMARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0 whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none';

/** ~10 s por página escaneada (medido em 23/11/2026). */
const minutosEstimados = (paginas: number) => Math.max(1, Math.round((paginas * 10) / 60));

/**
 * O que mostrar enquanto não há texto para ler: andamento, "grande demais", erro
 * ou "ainda não transcrito". `null` = há texto (quem chama mostra o texto).
 */
export function blocoSemTexto(args: {
  estado: EstadoNaFila | undefined;
  temTexto: boolean;
  carregando: boolean;
  erroLeitura: string | null;
  onTranscrever: () => void;
  onParar: () => void;
}): React.ReactNode | null {
  const { estado, temTexto, carregando, erroLeitura, onTranscrever, onParar } = args;

  if (estado?.fase === 'lendo' || estado?.fase === 'na_fila') {
    const p = estado.fase === 'lendo' ? estado.progresso : null;
    return (
      <div className="space-y-3">
        {p ? (
          <SegmentedProgress percent={Math.round(p.fracao * 100)} tone="blue"
            hint={`Lendo a página ${p.pagina} de ${p.total}`} title="Andamento da leitura" />
        ) : (
          <p className="text-sm text-gray-700">
            {estado.fase === 'na_fila' ? 'Na fila: começa quando a transcrição anterior terminar.' : 'Preparando a leitura…'}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500">A leitura roda neste navegador. Pode sair desta tela; mantenha a aba Documentos aberta.</p>
          <button type="button" onClick={onParar} className={BOTAO_SECUNDARIO}>
            <Square className="w-[15px] h-[15px]" /> Parar
          </button>
        </div>
      </div>
    );
  }
  if (estado?.fase === 'grande') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-700">
          Este arquivo tem {estado.paginasEscaneadas} páginas escaneadas: a leitura leva cerca de {minutosEstimados(estado.paginasEscaneadas)} min
          neste navegador, então não começou sozinha.
        </p>
        <button type="button" onClick={onTranscrever} className={BOTAO_SECUNDARIO}>
          <ScanText className="w-[15px] h-[15px]" /> Transcrever
        </button>
      </div>
    );
  }
  if (temTexto) return null;
  if (carregando) return <p className="text-sm text-gray-500">Carregando a transcrição…</p>;
  if (erroLeitura) return <p className="text-sm text-red-700">{erroLeitura}</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          {estado?.fase === 'erro' ? `Não foi possível transcrever: ${estado.mensagem}` : 'Este arquivo ainda não foi transcrito.'}
        </p>
        <button type="button" onClick={onTranscrever} className={BOTAO_SECUNDARIO}>
          <ScanText className="w-[15px] h-[15px]" /> {estado?.fase === 'erro' ? 'Tentar de novo' : 'Transcrever'}
        </button>
      </div>
      <p className="text-xs text-gray-500">
        O texto é lido aqui no navegador, sem enviar o arquivo a outro serviço. PDF com texto sai exato; o escaneado passa por
        OCR e as linhas com leitura duvidosa ficam destacadas para revisão.
      </p>
    </div>
  );
}

/** "Transcrever de novo?" quando já há texto (a revisão feita se perde). */
export function useTranscreverDeNovo(fila: FilaDeTranscricao) {
  const confirm = useConfirm();
  return async (versao: VersaoTranscrevivel, organizationId: string, jaTemTexto: boolean) => {
    if (jaTemTexto && !await confirm({
      title: 'Transcrever de novo?',
      message: 'O texto atual, com as revisões feitas, é substituído pela nova leitura.',
      variant: 'warning', confirmLabel: 'Transcrever de novo',
    })) return false;
    fila.enfileirar({ versao, organizationId, automatico: false });
    return true;
  };
}

export function resumoDaTranscricao(t: Transcricao): string {
  return `${t.origem === 'OCR' ? 'Lido por OCR' : 'Texto do PDF'} · ${t.paginas} página${t.paginas === 1 ? '' : 's'}`;
}

// ─── Seção do painel do documento ───────────────────────────────────────────

interface Props {
  versao: VersaoTranscrevivel | null | undefined;
  organizationId: string;
  fila: FilaDeTranscricao;
  onAbrir: () => void;
  /** Motivo para não abrir a tela agora (ex.: dados do painel não salvos). */
  bloqueioDeAbrir?: string;
}

const TranscricaoDoDocumento: React.FC<Props> = ({ versao, organizationId, fila, onAbrir, bloqueioDeAbrir }) => {
  const { transcricao, estado, carregando, erro } = useTranscricao(versao, fila);
  const transcreverDeNovo = useTranscreverDeNovo(fila);
  if (!versaoTranscreve(versao)) return null;

  const ocupado = estado?.fase === 'lendo' || estado?.fase === 'na_fila';
  const semTexto = blocoSemTexto({
    estado, temTexto: !!transcricao, carregando, erroLeitura: erro,
    onTranscrever: () => transcreverDeNovo(versao, organizationId, !!transcricao),
    onParar: () => fila.cancelar(versao.id),
  });
  const duvidosas = transcricao ? contarDuvidosas(transcricao.linhas) : 0;
  const linhasComTexto = transcricao ? transcricao.linhas.filter(l => l.t.trim()).length : 0;

  return (
    <div className="space-y-4">
      <SecaoTitulo
        icon={ScanText}
        titulo="Transcrição"
        resumo={transcricao ? resumoDaTranscricao(transcricao) : undefined}
        acoes={transcricao && !ocupado ? (
          <ActionIconButton kind="history" title="Transcrever de novo" icon={<RotateCcw className="w-4 h-4" />}
            onClick={() => transcreverDeNovo(versao, organizationId, true)} />
        ) : undefined}
      />
      {estado?.fase === 'erro' && transcricao && <p className="text-sm text-red-700">Não foi possível transcrever: {estado.mensagem}</p>}
      {semTexto ?? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-700">
            {linhasComTexto === 0
              ? 'Nenhum texto foi encontrado neste arquivo.'
              : `${linhasComTexto} linhas${duvidosas > 0 ? `, ${duvidosas} com leitura duvidosa para revisar` : ''}.`}
          </p>
          <span title={bloqueioDeAbrir}>
            <button type="button" onClick={onAbrir} disabled={!!bloqueioDeAbrir} className={BOTAO_SECUNDARIO}>
              <ScanText className="w-[15px] h-[15px]" /> Abrir transcrição
            </button>
          </span>
        </div>
      )}
    </div>
  );
};

export default TranscricaoDoDocumento;
