// components/empreendimento/DocumentosEmpreendimentoTab.tsx
// Incorporação › Empreendimentos › aba Documentos (12/11/2026).
// Plano: docs/planos/2026-11-12-empreendimento-aba-documentos.md
//
// Duas tabelas:
//  1. Documentos legais — checklist (escritura, matrícula, alvarás, habite-se…).
//     Cada item existe mesmo sem arquivo; a situação "Vencido" é derivada da
//     validade na leitura (utils/empreendimentoDocumentos).
//  2. Outros documentos — plantas, memoriais, fotos: direto do GED.
//
// O ARQUIVO mora só no GED (opura_documents). Esta aba é uma vista dele: o
// mesmo documento aparece em Documentos (GED) na categoria correspondente e no
// filtro "Empreendimento" de lá.
//
// Abrir a aba NUNCA grava nada: a lista padrão só entra quando alguém clica em
// "Carregar lista padrão".
import React from 'react';
import {
  AlertCircle, AlertTriangle, CheckCircle2, Clock, ExternalLink, FileText, FolderOpen,
  Link2, ListChecks, Paperclip, Plus, Unlink, Upload,
} from 'lucide-react';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { KpiCard } from '../ui/KpiCard';
import ActionIconButton from '../ui/ActionIconButton';
import { InlineDisclosureMenu } from '../ui/inline-disclosure-menu';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import DocumentPicker from '../ui/DocumentPicker';
import { useStore } from '../../store/useStore';
import type { Empreendimento } from '../../types/empreendimento';
import type { OpuraDocument, OpuraDocumentCategoria } from '../../types/documents';
import {
  TIPOS_DOCUMENTO_LEGAL, TIPO_OUTRO, SITUACAO_ROTULO, CATEGORIA_GED_ROTULO, infoDoTipo,
  type DocumentoLegal, type SituacaoDocumentoLegal, type TipoDocumentoLegal,
} from '../../types/empreendimentoDocumentos';
import {
  COR_DO_TOM, faltantesDaListaPadrao, hojeISO, resumoDoChecklist, situacaoExibida,
} from '../../utils/empreendimentoDocumentos';
import {
  empreendimentoDocumentosService as svc, EXTENSOES_ACEITAS, TAMANHO_MAXIMO_BYTES,
} from '../../services/empreendimentoDocumentosService';

// ─── Colunas ────────────────────────────────────────────────────────────────

const COLUNAS_LEGAIS: StandardTableColumn[] = [
  { key: 'titulo', label: 'Documento', sortable: true, width: 300 },
  { key: 'numero', label: 'Número', sortable: true, width: 140 },
  { key: 'orgao', label: 'Órgão emissor', sortable: true, width: 200 },
  { key: 'protocolo', label: 'Protocolo', sortable: true, width: 140, defaultHidden: true },
  { key: 'emissao', label: 'Emissão', sortable: true, width: 110 },
  { key: 'validade', label: 'Validade', sortable: true, width: 130 },
  { key: 'situacao', label: 'Situação', sortable: true, width: 170 },
  { key: 'arquivo', label: 'Arquivo', sortable: true, width: 220 },
  { key: 'responsavel', label: 'Responsável', sortable: true, width: 160, defaultHidden: true },
];

const COLUNAS_OUTROS: StandardTableColumn[] = [
  { key: 'nome', label: 'Documento', sortable: true, width: 300 },
  { key: 'categoria', label: 'Categoria no GED', sortable: true, width: 170 },
  { key: 'tipo', label: 'Tipo', sortable: true, width: 180 },
  { key: 'validade', label: 'Validade', sortable: true, width: 110 },
  { key: 'tamanho', label: 'Tamanho', sortable: true, width: 100, align: 'right' },
  { key: 'enviado', label: 'Enviado em', sortable: true, width: 120 },
];

const CATEGORIAS_GED: OpuraDocumentCategoria[] = ['engenharia', 'juridico', 'compliance', 'financeiro', 'comercial'];

// ─── Régua do formulário (§30 / §21) ────────────────────────────────────────

const ROTULO = 'block text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none';
const AREA = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none';
const ARQUIVO = 'w-full text-sm font-normal text-gray-700 file:mr-3 file:h-9 file:px-3.5 file:rounded-[6px] file:border-0 file:bg-blue-50 file:text-blue-600 file:text-[13px] file:font-medium hover:file:bg-blue-100 file:cursor-pointer';
const BOTAO_PRIMARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0 whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none';
const BOTAO_SECUNDARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 shrink-0 whitespace-nowrap disabled:opacity-50';

// ─── Formatação ─────────────────────────────────────────────────────────────

function formatarData(iso?: string | null): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : '—';
}

function formatarTamanho(bytes?: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** `org/doc/<uuid>_Alvará.pdf` → `Alvará.pdf` (caminho do GED: versionId_nome). */
function nomeDoArquivo(storagePath?: string | null): string {
  if (!storagePath) return '';
  const ultimo = storagePath.split('/').pop() || storagePath;
  return ultimo.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i, '');
}

function semExtensao(nome: string): string {
  const i = nome.lastIndexOf('.');
  return i > 0 ? nome.slice(0, i) : nome;
}

// ─── Formulário do item legal ───────────────────────────────────────────────

interface FormLegal {
  tipo: TipoDocumentoLegal;
  titulo: string;
  numero: string;
  orgao_emissor: string;
  protocolo: string;
  data_protocolo: string;
  data_emissao: string;
  data_validade: string;
  alerta_dias_antecedencia: string;
  situacao: SituacaoDocumentoLegal;
  obrigatorio: boolean;
  responsavel: string;
  observacoes: string;
}

function formDoItem(d: DocumentoLegal): FormLegal {
  return {
    tipo: d.tipo, titulo: d.titulo, numero: d.numero ?? '', orgao_emissor: d.orgao_emissor ?? '',
    protocolo: d.protocolo ?? '', data_protocolo: d.data_protocolo ?? '', data_emissao: d.data_emissao ?? '',
    data_validade: d.data_validade ?? '', alerta_dias_antecedencia: String(d.alerta_dias_antecedencia ?? 30),
    situacao: d.situacao, obrigatorio: d.obrigatorio, responsavel: d.responsavel ?? '', observacoes: d.observacoes ?? '',
  };
}

function formNovo(tipo: TipoDocumentoLegal): FormLegal {
  const info = infoDoTipo(tipo);
  return {
    tipo, titulo: tipo === 'OUTRO' ? '' : info.rotulo, numero: '', orgao_emissor: info.orgao ?? '',
    protocolo: '', data_protocolo: '', data_emissao: '', data_validade: '', alerta_dias_antecedencia: '30',
    situacao: 'PENDENTE', obrigatorio: tipo !== 'OUTRO', responsavel: '', observacoes: '',
  };
}

const vazioParaNull = (s: string) => (s.trim() ? s.trim() : null);

// ─── Componente ─────────────────────────────────────────────────────────────

interface Props { empreendimento: Empreendimento }

const DocumentosEmpreendimentoTab: React.FC<Props> = ({ empreendimento: e }) => {
  const confirm = useConfirm();
  const navigateToFocus = useStore(s => s.navigateToFocus);

  const [legais, setLegais] = React.useState<DocumentoLegal[]>([]);
  const [doGed, setDoGed] = React.useState<OpuraDocument[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [erro, setErro] = React.useState<string | null>(null);
  const [ocupado, setOcupado] = React.useState(false);

  const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  // Guarda de resposta fora de ordem: trocar de empreendimento no meio da carga
  // não pode pintar a lista do anterior.
  const seq = React.useRef(0);
  const carregar = React.useCallback(async () => {
    const minha = ++seq.current;
    setLoading(true);
    setErro(null);
    try {
      const [l, g] = await Promise.all([svc.listarLegais(e.id), svc.listarDoGed(e.id)]);
      if (minha !== seq.current) return;
      setLegais(l);
      setDoGed(g);
    } catch (err) {
      if (minha !== seq.current) return;
      setErro(err instanceof Error ? err.message : 'Erro ao carregar os documentos.');
    } finally {
      if (minha === seq.current) setLoading(false);
    }
  }, [e.id]);

  React.useEffect(() => { carregar(); }, [carregar]);

  const idsDoChecklist = React.useMemo(
    () => new Set(legais.map(d => d.document_id).filter((x): x is string => !!x)),
    [legais],
  );
  const outros = React.useMemo(() => doGed.filter(d => !idsDoChecklist.has(d.id)), [doGed, idsDoChecklist]);
  const docGedPorId = React.useMemo(() => new Map(doGed.map(d => [d.id, d])), [doGed]);

  const hoje = hojeISO();
  const resumo = React.useMemo(() => resumoDoChecklist(legais, hoje), [legais, hoje]);
  const faltamDaLista = React.useMemo(
    () => faltantesDaListaPadrao(legais, { organization_id: e.organization_id, empreendimento_id: e.id }).length,
    [legais, e.organization_id, e.id],
  );

  const trocarItem = (d: DocumentoLegal) => setLegais(prev => prev.map(x => (x.id === d.id ? d : x)));

  // ── Abrir arquivo ─────────────────────────────────────────────────────────
  /** A aba nasce no clique (window.open depois de await é bloqueado como pop-up). */
  const abrirArquivo = async (storagePath: string) => {
    const janela = window.open('', '_blank');
    try {
      const url = await svc.urlDoArquivo(storagePath);
      if (janela) janela.location.href = url;
      else window.open(url, '_blank', 'noopener');
    } catch (err) {
      janela?.close();
      notify(err instanceof Error ? err.message : 'Não foi possível abrir o arquivo.', 'error');
    }
  };

  const abrirNoGed = (documentId: string) => navigateToFocus('opura-docs', documentId, 'GED_DOCUMENTO');

  // ── Lista padrão ──────────────────────────────────────────────────────────
  const carregarListaPadrao = async () => {
    setOcupado(true);
    try {
      const novos = await svc.carregarListaPadrao(e);
      if (novos.length === 0) {
        notify('A lista padrão já está completa.');
        return;
      }
      setLegais(prev => [...prev, ...novos].sort((a, b) => a.sort_order - b.sort_order || a.titulo.localeCompare(b.titulo, 'pt-BR')));
      notify(`${novos.length} documento${novos.length === 1 ? '' : 's'} adicionado${novos.length === 1 ? '' : 's'} ao checklist.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao carregar a lista padrão.', 'error');
    } finally {
      setOcupado(false);
    }
  };

  // ── Sheet do item legal (criar / editar) ─────────────────────────────────
  const [itemAberto, setItemAberto] = React.useState<DocumentoLegal | 'novo' | null>(null);
  const [form, setForm] = React.useState<FormLegal>(formNovo('OUTRO'));
  const [arquivoDoItem, setArquivoDoItem] = React.useState<File | null>(null);
  const [sujo, setSujo] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);

  /** Tipos da lista padrão que ainda não estão no checklist, mais "Outro". */
  const tiposDisponiveis = React.useMemo(() => {
    const usados = new Set(legais.map(d => d.tipo));
    return [...TIPOS_DOCUMENTO_LEGAL.filter(t => !usados.has(t.tipo)), TIPO_OUTRO];
  }, [legais]);

  const abrirNovo = () => {
    setForm(formNovo(tiposDisponiveis[0]?.tipo ?? 'OUTRO'));
    setArquivoDoItem(null);
    setSujo(false);
    setItemAberto('novo');
  };
  const abrirItem = (d: DocumentoLegal) => {
    setForm(formDoItem(d));
    setArquivoDoItem(null);
    setSujo(false);
    setItemAberto(d);
  };
  const fecharItem = () => { setItemAberto(null); setArquivoDoItem(null); setSujo(false); };

  const campo = <K extends keyof FormLegal>(k: K, v: FormLegal[K]) => {
    setForm(f => ({ ...f, [k]: v }));
    setSujo(true);
  };

  const trocarTipoDoNovo = (tipo: TipoDocumentoLegal) => {
    const info = infoDoTipo(tipo);
    setForm(f => ({
      ...f,
      tipo,
      // Trocar o tipo de um item NOVO redefine título e órgão para os do tipo escolhido.
      titulo: tipo === 'OUTRO' ? '' : info.rotulo,
      orgao_emissor: info.orgao ?? '',
      obrigatorio: tipo !== 'OUTRO',
    }));
    setSujo(true);
  };

  const salvarItem = async () => {
    if (!form.titulo.trim()) { notify('Dê um título ao documento.', 'error'); return; }
    if (form.data_emissao && form.data_validade && form.data_validade < form.data_emissao) {
      notify('A validade não pode ser anterior à emissão.', 'error');
      return;
    }
    const alerta = Math.max(0, Math.round(Number(form.alerta_dias_antecedencia) || 0));
    const dados = {
      titulo: form.titulo.trim(),
      numero: vazioParaNull(form.numero),
      orgao_emissor: vazioParaNull(form.orgao_emissor),
      protocolo: vazioParaNull(form.protocolo),
      data_protocolo: form.data_protocolo || null,
      data_emissao: form.data_emissao || null,
      data_validade: form.data_validade || null,
      alerta_dias_antecedencia: alerta,
      situacao: form.situacao,
      obrigatorio: form.obrigatorio,
      responsavel: vazioParaNull(form.responsavel),
      observacoes: vazioParaNull(form.observacoes),
    };

    setSalvando(true);
    try {
      let item: DocumentoLegal;
      let aviso: string | undefined;
      if (itemAberto === 'novo') {
        const proximaOrdem = legais.reduce((m, d) => Math.max(m, d.sort_order), 0) + 10;
        item = await svc.criarLegal({
          ...dados,
          organization_id: e.organization_id,
          empreendimento_id: e.id,
          tipo: form.tipo,
          document_id: null,
          storage_path: null,
          sort_order: proximaOrdem,
        });
        setLegais(prev => [...prev, item]);
      } else if (itemAberto) {
        const r = await svc.atualizarLegal(itemAberto, dados);
        item = r.item;
        aviso = r.avisoGed;
        trocarItem(item);
      } else {
        return;
      }

      if (arquivoDoItem) {
        try {
          item = await svc.anexarArquivo(e, item, arquivoDoItem);
          trocarItem(item);
          // O documento novo do GED entra no mapa (para nome/abrir) sem recarregar a aba.
          svc.listarDoGed(e.id).then(setDoGed).catch(() => { /* a tabela continua com o que tinha */ });
        } catch (err) {
          notify(`Dados salvos, mas o arquivo não foi enviado: ${err instanceof Error ? err.message : 'erro'}`, 'error');
          fecharItem();
          return;
        }
      }

      fecharItem();
      if (aviso) notify(aviso, 'error');
      else notify(arquivoDoItem ? 'Documento salvo e arquivo enviado ao GED.' : 'Documento salvo.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao salvar o documento.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  // ── Enviar arquivo direto da linha ────────────────────────────────────────
  const inputDaLinhaRef = React.useRef<HTMLInputElement>(null);
  const [alvoDoUpload, setAlvoDoUpload] = React.useState<DocumentoLegal | null>(null);
  const pedirArquivo = (d: DocumentoLegal) => {
    setAlvoDoUpload(d);
    inputDaLinhaRef.current?.click();
  };
  const enviarDaLinha = async (arquivo: File | null) => {
    const alvo = alvoDoUpload;
    if (inputDaLinhaRef.current) inputDaLinhaRef.current.value = '';
    if (!arquivo || !alvo) return;
    setOcupado(true);
    try {
      const atualizado = await svc.anexarArquivo(e, alvo, arquivo);
      trocarItem(atualizado);
      svc.listarDoGed(e.id).then(setDoGed).catch(() => { /* idem */ });
      notify(alvo.document_id ? 'Nova versão enviada ao GED.' : 'Arquivo enviado ao GED.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao enviar o arquivo.', 'error');
    } finally {
      setOcupado(false);
      setAlvoDoUpload(null);
    }
  };

  // ── Vincular do GED ───────────────────────────────────────────────────────
  const [vincularItem, setVincularItem] = React.useState<DocumentoLegal | null>(null);
  const vincular = async (doc: OpuraDocument) => {
    if (!vincularItem) return;
    try {
      const atualizado = await svc.vincularDoGed(e, vincularItem, doc);
      trocarItem(atualizado);
      setVincularItem(null);
      svc.listarDoGed(e.id).then(setDoGed).catch(() => { /* idem */ });
      notify(`"${doc.nome}" vinculado.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao vincular.', 'error');
    }
  };

  const desvincular = async (d: DocumentoLegal) => {
    const ok = await confirm({
      title: 'Desvincular o arquivo?',
      message: `"${d.titulo}" fica sem arquivo. O documento continua no GED.`,
      variant: 'warning', confirmLabel: 'Desvincular',
    });
    if (!ok) return;
    try {
      trocarItem(await svc.desvincular(d));
      notify('Arquivo desvinculado.');
    } catch (err) { notify(err instanceof Error ? err.message : 'Erro ao desvincular.', 'error'); }
  };

  const excluirItem = async (d: DocumentoLegal) => {
    const ok = await confirm({
      title: 'Tirar do checklist?',
      message: d.document_id
        ? `"${d.titulo}" sai do checklist. O arquivo continua no GED e passa a aparecer em "Outros documentos".`
        : `"${d.titulo}" sai do checklist.`,
      variant: 'danger', confirmLabel: 'Tirar do checklist',
    });
    if (!ok) return;
    try {
      await svc.excluirLegal(d.id);
      setLegais(prev => prev.filter(x => x.id !== d.id));
      notify('Documento retirado do checklist.');
    } catch (err) { notify(err instanceof Error ? err.message : 'Erro ao excluir.', 'error'); }
  };

  // ── "Outros documentos": envio direto ao GED ──────────────────────────────
  const [envioAberto, setEnvioAberto] = React.useState(false);
  const [arquivoOutro, setArquivoOutro] = React.useState<File | null>(null);
  const [formOutro, setFormOutro] = React.useState<{ nome: string; categoria: OpuraDocumentCategoria; tipo: string; validade: string }>(
    { nome: '', categoria: 'engenharia', tipo: '', validade: '' },
  );
  const fecharEnvio = () => {
    setEnvioAberto(false);
    setArquivoOutro(null);
    setFormOutro({ nome: '', categoria: 'engenharia', tipo: '', validade: '' });
  };
  const enviarOutro = async () => {
    if (!arquivoOutro) { notify('Escolha o arquivo a enviar.', 'error'); return; }
    if (!formOutro.nome.trim()) { notify('Dê um nome ao documento.', 'error'); return; }
    setSalvando(true);
    try {
      const doc = await svc.enviarOutro(e, arquivoOutro, {
        nome: formOutro.nome.trim(),
        categoria: formOutro.categoria,
        tipo_documento: formOutro.tipo.trim() || 'Documento do empreendimento',
        data_validade: formOutro.validade || null,
      });
      setDoGed(prev => [doc, ...prev]);
      fecharEnvio();
      notify(`Enviado ao GED, em ${CATEGORIA_GED_ROTULO[doc.categoria]}.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao enviar o documento.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  // ── Células ───────────────────────────────────────────────────────────────
  const TD = 'text-sm font-normal';

  const celulaLegal = (key: string, d: DocumentoLegal): React.ReactNode => {
    switch (key) {
      case 'titulo':
        return (
          <span className={`block truncate ${TD} text-gray-700`} title={d.titulo}>
            {d.titulo}
            {!d.obrigatorio && <span className="text-gray-500"> · opcional</span>}
          </span>
        );
      case 'numero': return <span className={`block truncate ${TD} text-gray-600`} title={d.numero ?? ''}>{d.numero || '—'}</span>;
      case 'orgao': return <span className={`block truncate ${TD} text-gray-700`} title={d.orgao_emissor ?? ''}>{d.orgao_emissor || '—'}</span>;
      case 'protocolo': return <span className={`block truncate ${TD} text-gray-600`} title={d.protocolo ?? ''}>{d.protocolo || '—'}</span>;
      case 'emissao': return <span className={`${TD} text-gray-600 whitespace-nowrap`}>{formatarData(d.data_emissao)}</span>;
      case 'validade': return <span className={`${TD} text-gray-600 whitespace-nowrap`}>{d.data_validade ? formatarData(d.data_validade) : 'Não vence'}</span>;
      case 'situacao': {
        const s = situacaoExibida(d, hoje);
        return <span className={`${TD} ${COR_DO_TOM[s.tom]}`}>{s.rotulo}</span>;
      }
      case 'arquivo': {
        if (!d.storage_path) return <span className={`${TD} text-gray-500`}>Sem arquivo</span>;
        const ged = d.document_id ? docGedPorId.get(d.document_id) : undefined;
        const nome = nomeDoArquivo(ged?.active_version?.storage_path ?? d.storage_path) || 'Abrir arquivo';
        return (
          <button
            type="button"
            onClick={ev => { ev.stopPropagation(); abrirArquivo(ged?.active_version?.storage_path ?? d.storage_path!); }}
            className={`flex items-center gap-1.5 min-w-0 max-w-full ${TD} text-blue-600 hover:text-blue-800`}
            title={`Abrir ${nome}`}
          >
            <Paperclip className="w-3.5 h-3.5 shrink-0" />
            <span className="block truncate">{nome}</span>
          </button>
        );
      }
      case 'responsavel': return <span className={`block truncate ${TD} text-gray-700`} title={d.responsavel ?? ''}>{d.responsavel || '—'}</span>;
      default: return null;
    }
  };

  const ORDEM_SITUACAO: Record<string, number> = { vencido: 0, vencendo: 1, neutro: 2, ok: 3, dispensado: 4 };
  const ordemLegal = (key: string, d: DocumentoLegal): string | number | null => {
    switch (key) {
      case 'titulo': return d.titulo.toLowerCase();
      case 'numero': return d.numero ?? '';
      case 'orgao': return (d.orgao_emissor ?? '').toLowerCase();
      case 'protocolo': return d.protocolo ?? '';
      case 'emissao': return d.data_emissao ?? '';
      case 'validade': return d.data_validade ?? '9999-12-31';
      case 'situacao': return ORDEM_SITUACAO[situacaoExibida(d, hoje).tom];
      case 'arquivo': return d.storage_path ? nomeDoArquivo(d.storage_path).toLowerCase() : '';
      case 'responsavel': return (d.responsavel ?? '').toLowerCase();
      default: return null;
    }
  };

  const celulaOutro = (key: string, d: OpuraDocument): React.ReactNode => {
    switch (key) {
      case 'nome': return <span className={`block truncate ${TD} text-blue-600`} title={d.nome}>{d.nome}</span>;
      case 'categoria': return <span className={`${TD} text-gray-700`}>{CATEGORIA_GED_ROTULO[d.categoria] ?? d.categoria}</span>;
      case 'tipo': return <span className={`block truncate ${TD} text-gray-700`} title={d.tipo_documento ?? undefined}>{d.tipo_documento || '—'}</span>;
      case 'validade': return <span className={`${TD} text-gray-600`}>{d.data_validade ? formatarData(d.data_validade) : '—'}</span>;
      case 'tamanho': return <span className={`${TD} text-gray-600`}>{formatarTamanho(d.active_version?.tamanho)}</span>;
      case 'enviado': return <span className={`${TD} text-gray-600`}>{formatarData(d.created_at)}</span>;
      default: return null;
    }
  };

  const ordemOutro = (key: string, d: OpuraDocument): string | number | null => {
    switch (key) {
      case 'nome': return d.nome.toLowerCase();
      case 'categoria': return (CATEGORIA_GED_ROTULO[d.categoria] ?? d.categoria).toLowerCase();
      case 'tipo': return (d.tipo_documento ?? '').toLowerCase();
      case 'validade': return d.data_validade ?? '9999-12-31';
      case 'tamanho': return d.active_version?.tamanho ?? -1;
      case 'enviado': return d.created_at ?? '';
      default: return null;
    }
  };

  const motivoListaCompleta = 'Todos os documentos da lista padrão já estão no checklist.';
  const editando = itemAberto && itemAberto !== 'novo' ? itemAberto : null;

  return (
    <div className="space-y-6">
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm flex items-center justify-between gap-4">
          <span>{erro}</span>
          <button type="button" onClick={carregar} className="text-sm font-medium text-red-700 underline">Tentar de novo</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <KpiCard
          label="Obrigatórios emitidos"
          value={resumo.exigidos === 0 ? '—' : `${resumo.emitidosExigidos} de ${resumo.exigidos}`}
          sub={resumo.exigidos === 0 ? 'Checklist vazio' : undefined}
          icon={<CheckCircle2 className="w-4 h-4" />}
          color={resumo.exigidos > 0 && resumo.emitidosExigidos === resumo.exigidos ? 'emerald' : 'blue'}
        />
        <KpiCard
          label="Pendentes"
          value={resumo.pendentes}
          sub="Pendente ou em andamento"
          icon={<Clock className="w-4 h-4" />}
          color={resumo.pendentes > 0 ? 'amber' : 'gray'}
        />
        <KpiCard
          label="Vencendo"
          value={resumo.vencendo}
          sub="Dentro do prazo de alerta"
          icon={<AlertTriangle className="w-4 h-4" />}
          color={resumo.vencendo > 0 ? 'orange' : 'gray'}
        />
        <KpiCard
          label="Vencidos"
          value={resumo.vencidos}
          icon={<AlertCircle className="w-4 h-4" />}
          color={resumo.vencidos > 0 ? 'red' : 'gray'}
        />
      </div>

      <section aria-labelledby="docs-legais" className="space-y-3">
        <div>
          <h2 id="docs-legais" className="text-base font-semibold text-gray-900">Documentos legais</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Escritura, matrícula, alvarás, habite-se e registros. O arquivo de cada um fica guardado no GED, com histórico de versões e alerta de vencimento.
          </p>
        </div>
        <StandardTable<DocumentoLegal>
          storageKey="empreendimento:documentos:legais"
          searchScope={e.id}
          columns={COLUNAS_LEGAIS}
          rows={legais}
          rowKey={d => d.id}
          loading={loading}
          renderCell={celulaLegal}
          sortValue={ordemLegal}
          searchText={d => `${d.titulo} ${d.numero ?? ''} ${d.orgao_emissor ?? ''} ${d.protocolo ?? ''} ${d.responsavel ?? ''} ${situacaoExibida(d, hoje).rotulo}`}
          searchPlaceholder="Buscar por documento, número, órgão ou situação..."
          onRowClick={abrirItem}
          rowLabel={d => `${d.titulo}: ${situacaoExibida(d, hoje).rotulo}. Editar`}
          toolbarRight={
            <>
              <span title={faltamDaLista === 0 ? motivoListaCompleta : `Adiciona ${faltamDaLista} documento(s) que ainda faltam`}>
                <button type="button" onClick={carregarListaPadrao} disabled={ocupado || loading || faltamDaLista === 0} className={BOTAO_SECUNDARIO}>
                  <ListChecks className="w-[15px] h-[15px]" />
                  Carregar lista padrão
                </button>
              </span>
              <button type="button" onClick={abrirNovo} disabled={loading} className={BOTAO_PRIMARIO}>
                <Plus className="w-[15px] h-[15px]" />
                Documento
              </button>
            </>
          }
          actions={{
            width: 120,
            render: d => (
              <div className="flex items-center justify-end gap-1.5">
                <ActionIconButton
                  kind="download"
                  icon={<Upload className="w-4 h-4" />}
                  title={d.document_id ? 'Enviar nova versão do arquivo' : 'Enviar arquivo'}
                  disabled={ocupado}
                  onClick={ev => { ev.stopPropagation(); pedirArquivo(d); }}
                />
                <InlineDisclosureMenu
                  menuItems={[
                    { icon: <Link2 className="w-[18px] h-[18px]" />, label: 'Vincular documento do GED', onClick: () => setVincularItem(d) },
                    {
                      icon: <FolderOpen className="w-[18px] h-[18px]" />, label: 'Abrir no GED',
                      onClick: () => d.document_id && abrirNoGed(d.document_id),
                      disabled: !d.document_id, title: d.document_id ? undefined : 'Este item ainda não tem arquivo no GED.',
                    },
                    {
                      icon: <Unlink className="w-[18px] h-[18px]" />, label: 'Desvincular arquivo',
                      onClick: () => desvincular(d),
                      disabled: !d.document_id, title: d.document_id ? undefined : 'Este item não tem arquivo vinculado.',
                    },
                  ]}
                  showDelete
                  onDelete={() => excluirItem(d)}
                />
              </div>
            ),
          }}
          empty={{
            icon: <ListChecks className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
            title: 'Nenhum documento legal',
            subtitle: 'Use "Carregar lista padrão" para trazer os documentos de um empreendimento (escritura, alvarás, habite-se…) ou adicione um por um.',
          }}
        />
      </section>

      <section aria-labelledby="docs-outros" className="space-y-3">
        <div>
          <h2 id="docs-outros" className="text-base font-semibold text-gray-900">Outros documentos</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Plantas, memoriais, fotos e contratos do empreendimento. Também aparecem em Documentos (GED), na categoria escolhida.
          </p>
        </div>
        <StandardTable<OpuraDocument>
          storageKey="empreendimento:documentos:outros"
          searchScope={e.id}
          columns={COLUNAS_OUTROS}
          rows={outros}
          rowKey={d => d.id}
          loading={loading}
          renderCell={celulaOutro}
          sortValue={ordemOutro}
          searchText={d => `${d.nome} ${d.tipo_documento ?? ''} ${CATEGORIA_GED_ROTULO[d.categoria] ?? ''}`}
          searchPlaceholder="Buscar por nome, tipo ou categoria..."
          onRowClick={d => d.active_version?.storage_path && abrirArquivo(d.active_version.storage_path)}
          rowLabel={d => `${d.nome}. Abrir o arquivo`}
          toolbarRight={
            <button type="button" onClick={() => setEnvioAberto(true)} className={BOTAO_PRIMARIO}>
              <Upload className="w-[15px] h-[15px]" />
              Enviar documento
            </button>
          }
          actions={{
            width: 90,
            render: d => (
              <div className="flex items-center justify-end gap-1.5">
                <ActionIconButton
                  kind="view"
                  icon={<ExternalLink className="w-4 h-4" />}
                  title="Abrir no GED"
                  onClick={ev => { ev.stopPropagation(); abrirNoGed(d.id); }}
                />
              </div>
            ),
          }}
          empty={{
            icon: <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
            title: 'Nenhum outro documento',
            subtitle: 'Envie plantas, memoriais descritivos, fotos ou qualquer arquivo do empreendimento.',
          }}
        />
      </section>

      {/* Upload direto da linha: um input só, reaproveitado. */}
      <input
        ref={inputDaLinhaRef}
        type="file"
        accept={EXTENSOES_ACEITAS}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={ev => enviarDaLinha(ev.target.files?.[0] || null)}
      />

      {/* ── Sheet: item do checklist ── */}
      <Sheet open={!!itemAberto} onClose={fecharItem} size="lg" dirty={sujo || !!arquivoDoItem}>
        <SheetHeader onClose={fecharItem}>
          <SheetTitle>{editando ? editando.titulo : 'Novo documento legal'}</SheetTitle>
          <SheetDescription>{e.name}</SheetDescription>
        </SheetHeader>
        <SheetPanel className="p-6">
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="border-b border-gray-100 pb-3">
                <h3 className="text-sm font-semibold text-gray-900">Identificação</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className={ROTULO} htmlFor="doc-tipo">Tipo</label>
                  {editando ? (
                    <input id="doc-tipo" className={`${CAMPO} bg-gray-50`} value={infoDoTipo(form.tipo).rotulo} readOnly />
                  ) : (
                    <select id="doc-tipo" className={CAMPO} value={form.tipo} onChange={ev => trocarTipoDoNovo(ev.target.value as TipoDocumentoLegal)}>
                      {tiposDisponiveis.map(t => <option key={t.tipo} value={t.tipo}>{t.rotulo}</option>)}
                    </select>
                  )}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className={ROTULO} htmlFor="doc-titulo">Título</label>
                  <input id="doc-titulo" className={CAMPO} value={form.titulo} onChange={ev => campo('titulo', ev.target.value)}
                    placeholder="Ex: Alvará de construção – Torre A" />
                </div>
                <div className="space-y-1.5">
                  <label className={ROTULO} htmlFor="doc-numero">Número</label>
                  <input id="doc-numero" className={CAMPO} value={form.numero} onChange={ev => campo('numero', ev.target.value)}
                    placeholder="Nº do alvará, da matrícula, do registro" />
                </div>
                <div className="space-y-1.5">
                  <label className={ROTULO} htmlFor="doc-orgao">Órgão emissor</label>
                  <input id="doc-orgao" className={CAMPO} value={form.orgao_emissor} onChange={ev => campo('orgao_emissor', ev.target.value)}
                    placeholder="Prefeitura, Cartório de RI…" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="border-b border-gray-100 pb-3">
                <h3 className="text-sm font-semibold text-gray-900">Andamento e validade</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <div className="space-y-1.5">
                  <label className={ROTULO} htmlFor="doc-situacao">Situação</label>
                  <select id="doc-situacao" className={CAMPO} value={form.situacao} onChange={ev => campo('situacao', ev.target.value as SituacaoDocumentoLegal)}>
                    {(Object.keys(SITUACAO_ROTULO) as SituacaoDocumentoLegal[]).map(s => <option key={s} value={s}>{SITUACAO_ROTULO[s]}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={ROTULO} htmlFor="doc-responsavel">Responsável</label>
                  <input id="doc-responsavel" className={CAMPO} value={form.responsavel} onChange={ev => campo('responsavel', ev.target.value)}
                    placeholder="Quem está tocando o processo" />
                </div>
                <div className="space-y-1.5">
                  <label className={ROTULO} htmlFor="doc-protocolo">Protocolo</label>
                  <input id="doc-protocolo" className={CAMPO} value={form.protocolo} onChange={ev => campo('protocolo', ev.target.value)}
                    placeholder="Nº do processo" />
                </div>
                <div className="space-y-1.5">
                  <label className={ROTULO} htmlFor="doc-data-protocolo">Data do protocolo</label>
                  <input id="doc-data-protocolo" type="date" className={CAMPO} value={form.data_protocolo} onChange={ev => campo('data_protocolo', ev.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className={ROTULO} htmlFor="doc-emissao">Emissão</label>
                  <input id="doc-emissao" type="date" className={CAMPO} value={form.data_emissao} onChange={ev => campo('data_emissao', ev.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className={ROTULO} htmlFor="doc-validade">Validade</label>
                  <input id="doc-validade" type="date" className={CAMPO} value={form.data_validade} onChange={ev => campo('data_validade', ev.target.value)} />
                  <p className="text-xs text-gray-500">
                    {infoDoTipo(form.tipo).vence ? 'Este documento costuma ter validade.' : 'Deixe em branco se não vence.'}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className={ROTULO} htmlFor="doc-alerta">Avisar com antecedência (dias)</label>
                  <input id="doc-alerta" type="number" min={0} className={CAMPO} value={form.alerta_dias_antecedencia}
                    onChange={ev => campo('alerta_dias_antecedencia', ev.target.value)} />
                </div>
                <div className="space-y-1.5 flex items-end">
                  <label className="flex items-center gap-2.5 cursor-pointer h-9">
                    <input type="checkbox" checked={form.obrigatorio} onChange={ev => campo('obrigatorio', ev.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                    <span className="text-sm font-normal text-gray-700">Obrigatório para o empreendimento</span>
                  </label>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className={ROTULO} htmlFor="doc-obs">Observações</label>
                  <textarea id="doc-obs" rows={3} className={AREA} value={form.observacoes} onChange={ev => campo('observacoes', ev.target.value)} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="border-b border-gray-100 pb-3">
                <h3 className="text-sm font-semibold text-gray-900">Arquivo</h3>
              </div>
              {editando?.storage_path && (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <button type="button" onClick={() => abrirArquivo(editando.storage_path!)} className="flex items-center gap-1.5 min-w-0 text-blue-600 hover:text-blue-800">
                    <Paperclip className="w-4 h-4 shrink-0" />
                    <span className="truncate">{nomeDoArquivo(editando.storage_path) || 'Abrir arquivo atual'}</span>
                  </button>
                  {editando.document_id && (
                    <button type="button" onClick={() => abrirNoGed(editando.document_id!)} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-blue-600 shrink-0">
                      <FolderOpen className="w-4 h-4" /> Abrir no GED
                    </button>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <label className={ROTULO} htmlFor="doc-arquivo">
                  {editando?.document_id ? 'Enviar nova versão' : 'Enviar arquivo'}
                </label>
                <input id="doc-arquivo" key={itemAberto === 'novo' ? 'arquivo-novo' : `arquivo-${editando?.id}`} type="file"
                  accept={EXTENSOES_ACEITAS} className={ARQUIVO}
                  onChange={ev => setArquivoDoItem(ev.target.files?.[0] || null)} />
                <p className="text-xs text-gray-500">
                  {arquivoDoItem
                    ? `${arquivoDoItem.name} · ${formatarTamanho(arquivoDoItem.size)} — vai para o GED, em ${CATEGORIA_GED_ROTULO[infoDoTipo(form.tipo).categoria]}.`
                    : `PDF, imagem, Word, Excel, DWG ou ZIP, até ${TAMANHO_MAXIMO_BYTES / 1048576} MB. Opcional.`}
                </p>
              </div>
            </div>
          </div>
        </SheetPanel>
        <SheetFooter>
          <button type="button" onClick={fecharItem} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">
            {editando ? 'Voltar' : 'Cancelar'}
          </button>
          <span title={editando && !sujo && !arquivoDoItem ? 'Nada foi alterado.' : undefined}>
            <button type="button" onClick={salvarItem} disabled={salvando || (!!editando && !sujo && !arquivoDoItem)} className={BOTAO_PRIMARIO}>
              {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Adicionar ao checklist'}
            </button>
          </span>
        </SheetFooter>
      </Sheet>

      {/* ── Sheet: vincular documento que já está no GED ── */}
      <Sheet open={!!vincularItem} onClose={() => setVincularItem(null)} size="md">
        <SheetHeader onClose={() => setVincularItem(null)}>
          <SheetTitle>Vincular documento do GED</SheetTitle>
          <SheetDescription>{vincularItem?.titulo}</SheetDescription>
        </SheetHeader>
        <SheetPanel className="p-6">
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Escolha um documento que já está em Documentos (GED). Ele passa a ser o arquivo deste item — nada é copiado.
            </p>
            {vincularItem && (
              <DocumentPicker
                organizationId={e.organization_id}
                excludeIntegrated
                storageKey="empreendimento:documentos:vincular:busca"
                onPick={vincular}
              />
            )}
          </div>
        </SheetPanel>
      </Sheet>

      {/* ── Sheet: enviar outro documento ── */}
      <Sheet open={envioAberto} onClose={fecharEnvio} size="md" dirty={!!arquivoOutro}>
        <SheetHeader onClose={fecharEnvio}>
          <SheetTitle>Enviar documento</SheetTitle>
          <SheetDescription>{e.name}</SheetDescription>
        </SheetHeader>
        <SheetPanel className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <div className="space-y-1.5 sm:col-span-2">
              <label className={ROTULO} htmlFor="outro-arquivo">Arquivo</label>
              <input id="outro-arquivo" type="file" accept={EXTENSOES_ACEITAS} className={ARQUIVO}
                onChange={ev => {
                  const f = ev.target.files?.[0] || null;
                  setArquivoOutro(f);
                  if (f) setFormOutro(prev => (prev.nome.trim() ? prev : { ...prev, nome: semExtensao(f.name) }));
                }} />
              <p className="text-xs text-gray-500">
                {arquivoOutro ? `${arquivoOutro.name} · ${formatarTamanho(arquivoOutro.size)}` : `Até ${TAMANHO_MAXIMO_BYTES / 1048576} MB.`}
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className={ROTULO} htmlFor="outro-nome">Nome</label>
              <input id="outro-nome" className={CAMPO} value={formOutro.nome} onChange={ev => setFormOutro(f => ({ ...f, nome: ev.target.value }))}
                placeholder="Ex: Memorial descritivo – Torre A" />
            </div>
            <div className="space-y-1.5">
              <label className={ROTULO} htmlFor="outro-categoria">Categoria no GED</label>
              <select id="outro-categoria" className={CAMPO} value={formOutro.categoria}
                onChange={ev => setFormOutro(f => ({ ...f, categoria: ev.target.value as OpuraDocumentCategoria }))}>
                {CATEGORIAS_GED.map(c => <option key={c} value={c}>{CATEGORIA_GED_ROTULO[c]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={ROTULO} htmlFor="outro-tipo">Tipo</label>
              <input id="outro-tipo" className={CAMPO} value={formOutro.tipo} onChange={ev => setFormOutro(f => ({ ...f, tipo: ev.target.value }))}
                placeholder="Ex: Memorial, Planta, Foto" />
            </div>
            <div className="space-y-1.5">
              <label className={ROTULO} htmlFor="outro-validade">Validade</label>
              <input id="outro-validade" type="date" className={CAMPO} value={formOutro.validade}
                onChange={ev => setFormOutro(f => ({ ...f, validade: ev.target.value }))} />
            </div>
          </div>
        </SheetPanel>
        <SheetFooter>
          <button type="button" onClick={fecharEnvio} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">Cancelar</button>
          <button type="button" onClick={enviarOutro} disabled={salvando} className={BOTAO_PRIMARIO}>
            {salvando ? 'Enviando...' : 'Enviar ao GED'}
          </button>
        </SheetFooter>
      </Sheet>

      {notification && (
        <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
          notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {notification.message}
        </div>
      )}
    </div>
  );
};

export default DocumentosEmpreendimentoTab;
