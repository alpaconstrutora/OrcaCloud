// components/empreendimento/EmpreendimentoForm.tsx
//
// A ficha do empreendimento, em duas cascas:
//   • `modo="painel"` (padrão) — painel lateral para NOVO e DUPLICAR;
//   • `modo="embutido"` — a aba Visão Geral da ficha aberta, que desde 21/11/2026 é o ÚNICO lugar
//     de edição (o botão "Editar" do topo saiu). Estilo de RH › Colaboradores › Editar Colaborador:
//     seções com título, rótulo em cima, campo h-9, um Salvar que não fecha a tela (§25) e Ctrl+S.
//     Plano: docs/planos/2026-11-21-empreendimento-visao-geral-objetivo.md.
// Os campos são os mesmos nas duas: um formulário só, para não haver duas portas para o mesmo dado.
// O terreno da Visão Geral é a `TerrenoSecao` (a mesma da aba Torres), montada pela ficha — é ela
// que trava o campo que vem da Planta Inteligente.
import React from 'react';
import { Loader2, Building2, AlertCircle, FileText, Landmark, MapPin, BarChart3, Link2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import CityStateSelect from '../CityStateSelect';
import SecaoTitulo from '../ui/SecaoTitulo';
import { empreendimentoService } from '../../services/empreendimentoService';
import { empreendimentoTypeService, EmpreendimentoTypeRecord } from '../../services/empreendimentoTypeService';
import { tiposUnicosPorSlug } from '../../utils/empreendimentoTipos';
import { imovibService } from '../../services/imovibService';
import { companyService } from '../../services/companyService';
import { listStudies as listBlueprintStudies } from '../../services/blueprintService';
import { useStore } from '../../store/useStore';
import { useWritableOrganizations } from '../../hooks/useOrgContext';
import { useConfirm } from '../ui/confirm';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useToast } from '../../hooks/useToast';
import SaveStatus from '../ui/SaveStatus';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { fichaDe, payloadDaFicha, mudancasDaFicha, semVazios, type FichaDoEmpreendimento } from '../../utils/empreendimentoFicha';
import { OBJETIVOS, ROTULO_DO_OBJETIVO, espelhosDoObjetivo } from '../../utils/empreendimentoObjetivo';
import {
  Empreendimento, EmpreendimentoStatus, EmpreendimentoTipo, EmpreendimentoInsert, ImovibStudy,
} from '../../types';

interface Props {
  /** Vazio quando o usuário está com "Todas as organizações" — o formulário pede a org num seletor. */
  organizationId: string;
  /** Painel lateral (Novo/Duplicar) ou embutido na aba Visão Geral (editar). */
  modo?: 'painel' | 'embutido';
  /** O registro aberto — só no modo embutido. */
  editing?: Empreendimento | null;
  /**
   * Duplicação: abre em modo CRIAR com os campos pré-preenchidos a partir deste
   * empreendimento. A estrutura (torres/pavimentos/unidades/áreas comuns) só é
   * copiada ao salvar — ver `empreendimentoService.copyStructure`.
   */
  duplicateFrom?: Empreendimento | null;
  onClose?: () => void;
  onSaved: (e: Empreendimento) => void;
  /** Embutido: a seção Terreno (TerrenoSecao), montada pela ficha logo abaixo do Endereço. */
  terreno?: React.ReactNode;
}

const STATUS_OPTIONS: { value: EmpreendimentoStatus; label: string }[] = [
  { value: 'PLANEJAMENTO', label: 'Planejamento' },
  { value: 'LANCAMENTO', label: 'Lançamento' },
  { value: 'EM_OBRAS', label: 'Em Obras' },
  { value: 'ENTREGUE', label: 'Entregue' },
  { value: 'EM_OPERACAO', label: 'Em Operação' },
  { value: 'ENCERRADO', label: 'Encerrado' },
];

// Fallback só usado se o catálogo (Configurações do Sistema → Tipos de Empreendimento)
// ainda não carregou ou está vazio — mesmo padrão de ProjectModal.tsx com obraTypeService.
const FALLBACK_TIPO_OPTIONS: { value: EmpreendimentoTipo; label: string }[] = [
  { value: 'VERTICAL', label: 'Vertical' },
  { value: 'HORIZONTAL', label: 'Horizontal' },
  { value: 'MISTO', label: 'Misto' },
  { value: 'COND_LOGISTICO', label: 'Condomínio Logístico' },
  { value: 'COND_INDUSTRIAL', label: 'Condomínio Industrial' },
];

const REGIME_LABEL: Record<string, string> = {
  lucro_real: 'Lucro Real', lucro_presumido: 'Lucro Presumido', simples: 'Simples', mei: 'MEI',
};

// Malha do formulário (§30): rótulo→campo 6px, campos gap-x-6/gap-y-4, seção space-y-4, card space-y-8.
const inputCls = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all';
const labelCls = 'block text-xs font-semibold text-slate-500';
const ajudaCls = 'text-xs text-gray-500';
const gradeCls = 'grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4';

const Campo: React.FC<{ rotulo: string; htmlFor?: string; className?: string; ajuda?: React.ReactNode; children: React.ReactNode }> = ({ rotulo, htmlFor, className = '', ajuda, children }) => (
  <div className={`space-y-1.5 ${className}`}>
    <label htmlFor={htmlFor} className={labelCls}>{rotulo}</label>
    {children}
    {ajuda && <p className={ajudaCls}>{ajuda}</p>}
  </div>
);

export const EmpreendimentoForm: React.FC<Props> = ({ organizationId, modo = 'painel', editing: editingProp, duplicateFrom, onClose, onSaved, terreno }) => {
  const embutido = modo === 'embutido';
  // Editar só existe embutido (Visão Geral). O painel é Novo ou Duplicar.
  const editing = embutido ? (editingProp ?? null) : null;
  const base = editing ?? duplicateFrom ?? null;
  // `projects` do store já vem só com obras reais (sem projeto de sistema, sem
  // orçamento/planejamento/diário) — ver CLAUDE.md regras #2 e #3.
  const { projects } = useStore();
  const allOrganizations = useStore(s => s.organizations);
  const writableOrgs = useWritableOrganizations();
  const confirm = useConfirm();
  // §25 — editar não fecha ao salvar. Embutido, a pendência também guarda a navegação (menu,
  // voltar do navegador, troca de aba da ficha): o formulário desmonta ao sair da Visão Geral.
  const { dirty, markDirty, markSaved, confirmDiscard } = useUnsavedChanges({ guardarNavegacao: embutido });
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [studies, setStudies] = React.useState<ImovibStudy[]>([]);
  const [blueprintStudies, setBlueprintStudies] = React.useState<{ id: string; name: string }[]>([]);
  /** Planta → nome do OUTRO empreendimento que já a tem. */
  const [plantaOcupadaPor, setPlantaOcupadaPor] = React.useState<Map<string, string>>(new Map());
  const [empreendimentoTypes, setEmpreendimentoTypes] = React.useState<EmpreendimentoTypeRecord[]>([]);
  // Org efetiva do registro. Vem da prop quando há uma org ativa específica; com "Todas as
  // organizações" a prop chega vazia e o usuário escolhe aqui. Ao editar, o campo continua
  // visível e editável, para ver e corrigir a organização de um empreendimento já existente.
  const [orgId, setOrgId] = React.useState<string>(base?.organization_id || organizationId || '');
  const [companies, setCompanies] = React.useState<{ id: string; razao_social: string; nome_fantasia?: string | null; regime_tributario?: string | null }[]>([]);
  // Aviso pelo ToastProvider da raiz: dentro do Sheet (painel com translate) um
  // `fixed` local ficaria preso ao canto do painel, por cima do rodapé.
  const { localToast, showToast: notify } = useToast();
  const [form, setForm] = React.useState<FichaDoEmpreendimento>(() => fichaDe(base, { duplicar: !!duplicateFrom && !editing }));

  // Embutido: o registro muda por fora (Vinculações, Terreno, Sincronização recarregam a ficha).
  // Sem pendência, o formulário acompanha; com pendência, fica o que a pessoa está digitando —
  // e salvar manda só o que ela mudou (`mudancasDaFicha`), sem reescrever o resto.
  const salvoRef = React.useRef(payloadDaFicha(fichaDe(editing), editing?.organization_id || ''));
  React.useEffect(() => {
    if (!editing) return;
    salvoRef.current = payloadDaFicha(fichaDe(editing), editing.organization_id);
    if (!dirty) { setForm(fichaDe(editing)); setOrgId(editing.organization_id); }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Só as organizações em que a pessoa grava (gravar fora delas = 42501) — mais a do próprio
  // registro, para o campo não aparecer vazio quando ela abre um empreendimento de outra org.
  const organizations = React.useMemo(() => {
    if (!orgId || writableOrgs.some(o => o.id === orgId)) return writableOrgs;
    const atual = allOrganizations.find(o => o.id === orgId);
    return atual ? [atual, ...writableOrgs] : writableOrgs;
  }, [writableOrgs, allOrganizations, orgId]);

  // Empresas da organização selecionada — fonte do regime tributário usado na
  // geração de Tributos a Pagar das Locações dos imóveis deste empreendimento.
  React.useEffect(() => {
    if (!orgId) { setCompanies([]); return; }
    companyService.list(orgId)
      .then(cs => setCompanies(cs.map(c => ({ id: c.id, razao_social: c.razao_social, nome_fantasia: c.nome_fantasia, regime_tributario: c.regime_tributario }))))
      .catch(() => setCompanies([]));
  }, [orgId]);

  // Trocar a organização de um empreendimento JÁ EXISTENTE não desfaz vínculos (obra,
  // estudos, torres continuam com o mesmo id salvo) — só pode fazer esses registros
  // pararem de aparecer nos seletores, se pertencerem à organização anterior. Por isso
  // avisa antes. Ao criar do zero, nada foi salvo ainda: pode trocar livremente.
  const handleOrgChange = async (newOrgId: string) => {
    if (editing && newOrgId !== orgId) {
      const ok = await confirm({
        title: 'Trocar a organização do empreendimento?',
        message: 'Obra vinculada, estudos de Viabilidade/Arquitetura e torres continuam apontando para os mesmos registros. Se algum deles pertencer à organização atual (não à nova), ele deixa de aparecer nos seletores até você revincular ou corrigir a organização dele também.',
        confirmLabel: 'Trocar mesmo assim',
        variant: 'warning',
      });
      if (!ok) return;
    }
    setOrgId(newOrgId);
    markDirty();
    if (!editing) {
      // Criando do zero: nada foi salvo ainda, então invalida seleções tentativas da org anterior.
      setForm(prev => ({ ...prev, imovib_study_id: '', blueprint_study_id: '', project_id: '' }));
    }
  };

  React.useEffect(() => {
    // Os vínculos (Imovib / Planta Inteligente) são por organização: sem org escolhida não há o que listar.
    if (!orgId) { setStudies([]); setBlueprintStudies([]); return; }
    imovibService.getStudies(orgId).then(setStudies).catch(() => setStudies([]));
    // Estudos da Planta Inteligente — a arquitetura do empreendimento (massa, loteamento, planta).
    listBlueprintStudies(orgId).then((xs) => setBlueprintStudies(xs.map((s) => ({ id: s.id, name: s.name })))).catch(() => setBlueprintStudies([]));
    // Um empreendimento por planta (índice único desde 22/10/2026): a planta já ligada a OUTRO
    // empreendimento aparece desligada no select, dizendo a qual — em vez de o banco recusar ao salvar.
    empreendimentoService.list(orgId)
      .then((es) => setPlantaOcupadaPor(new Map(es.filter((x) => x.blueprint_study_id && x.id !== editing?.id).map((x) => [x.blueprint_study_id as string, x.name]))))
      .catch(() => setPlantaOcupadaPor(new Map()));
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    let vigente = true;
    empreendimentoTypeService.list(orgId || undefined)
      .then(tipos => { if (vigente) setEmpreendimentoTypes(tiposUnicosPorSlug(tipos, orgId)); })
      .catch(() => { if (vigente) setEmpreendimentoTypes([]); });
    return () => { vigente = false; };
  }, [orgId]);

  // Obras da org escolhida. Sem org (ainda escolhendo), não há o que oferecer.
  // organization_id (coluna nativa) tem precedência sobre settings.organizationId: obra
  // vinculada a uma empresa/grupo só carrega a org ali (sincronizada por trigger a partir
  // de empresa_id) — settings.organizationId nunca é preenchido nesse caso.
  const orgProjects = React.useMemo(
    () => projects.filter(p => !orgId || (p.organization_id ?? (p.settings as any)?.organizationId) === orgId),
    [projects, orgId],
  );

  // A coluna não tem FK (deadlock de DDL no módulo — ver a migration): a obra vinculada pode
  // ter sido excluída, ou ser de outra org. Nesse caso o id não some do formulário sem aviso.
  const orphanProjectId = form.project_id && !orgProjects.some(p => p.id === form.project_id)
    ? form.project_id
    : '';

  const set = (k: keyof FichaDoEmpreendimento, v: string) => { setForm(prev => ({ ...prev, [k]: v })); markDirty(); };

  // ── Objetivo: aviso quando a escolha esconde um espelho que tem unidade publicada ──
  // Decisão do usuário (21/11/2026): a troca é permitida; as publicações continuam no Comercial,
  // só a aba some da ficha. O aviso diz quantas são, para a escolha ser consciente.
  const [publicadas, setPublicadas] = React.useState<{ vendas: number; locacoes: number } | null>(null);
  const espelhos = espelhosDoObjetivo(form.objetivo);
  const escondeAlgum = !espelhos.vendas || !espelhos.locacoes;
  React.useEffect(() => {
    if (!editing || !escondeAlgum || publicadas) return;
    let vivo = true;
    empreendimentoService.listAllUnitsForEmpreendimento(editing.id)
      .then(us => { if (vivo) setPublicadas({ vendas: us.filter(u => u.commercial_property_id).length, locacoes: us.filter(u => u.rental_property_id).length }); })
      .catch(() => { if (vivo) setPublicadas(null); });
    return () => { vivo = false; };
  }, [editing?.id, escondeAlgum]); // eslint-disable-line react-hooks/exhaustive-deps
  const avisoDoObjetivo = (() => {
    if (!publicadas) return null;
    // Serviço e Imobilizado escondem os dois espelhos: o aviso junta as duas contagens numa frase só.
    const partes = [
      !espelhos.vendas && publicadas.vendas > 0 ? { n: publicadas.vendas, onde: 'Vendas' } : null,
      !espelhos.locacoes && publicadas.locacoes > 0 ? { n: publicadas.locacoes, onde: 'Locações' } : null,
    ].filter((p): p is { n: number; onde: string } => !!p);
    if (partes.length === 0) return null;
    if (partes.length === 1) return `${partes[0].n} unidade(s) seguem publicadas em ${partes[0].onde}; a aba Espelho de ${partes[0].onde} fica oculta.`;
    return `${partes[0].n} unidade(s) seguem publicadas em Vendas e ${partes[1].n} em Locações; as abas Espelho de Vendas e Espelho de Locações ficam ocultas.`;
  })();

  const salvar = async () => {
    if (!form.name.trim()) { notify('Informe o nome do empreendimento.', 'error'); return; }
    if (!orgId) { notify('Selecione a organização do empreendimento.', 'error'); return; }
    setSaving(true);
    try {
      const payload = payloadDaFicha(form, orgId);

      if (editing) {
        const mudou = mudancasDaFicha(salvoRef.current, payload);
        const saved = Object.keys(mudou).length > 0 ? await empreendimentoService.update(editing.id, mudou) : editing;
        salvoRef.current = payloadDaFicha(fichaDe(saved), saved.organization_id);
        markSaved();
        setSavedAt(Date.now());
        onSaved(saved);
        notify('Empreendimento atualizado.');
        return;
      }

      const novo: Partial<EmpreendimentoInsert> = {
        ...semVazios(payload),
        // Duplicando: o que este formulário não edita (endereço do terreno, medidas, orientação,
        // complemento, metadata) viria vazio e a cópia perderia dado em silêncio. Copiado à parte.
        ...(duplicateFrom ? {
          terreno_street: duplicateFrom.terreno_street,
          terreno_number: duplicateFrom.terreno_number,
          terreno_complement: duplicateFrom.terreno_complement,
          terreno_neighborhood: duplicateFrom.terreno_neighborhood,
          terreno_city: duplicateFrom.terreno_city,
          terreno_state: duplicateFrom.terreno_state,
          terreno_zip_code: duplicateFrom.terreno_zip_code,
          terreno_tipo: duplicateFrom.terreno_tipo,
          terreno_frente: duplicateFrom.terreno_frente,
          terreno_fundos: duplicateFrom.terreno_fundos,
          terreno_profundidade: duplicateFrom.terreno_profundidade,
          terreno_lateral_direita: duplicateFrom.terreno_lateral_direita,
          terreno_lateral_esquerda: duplicateFrom.terreno_lateral_esquerda,
          terreno_frente_azimute: duplicateFrom.terreno_frente_azimute,
          terreno_latitude: duplicateFrom.terreno_latitude,
          terreno_longitude: duplicateFrom.terreno_longitude,
          endereco_complement: duplicateFrom.endereco_complement,
          metadata: duplicateFrom.metadata,
        } : {}),
      };
      const saved = await empreendimentoService.create(novo as EmpreendimentoInsert);

      // Estrutura só depois do cadastro existir. Se a cópia falhar, o empreendimento
      // já foi criado — avisa e mantém o painel aberto, em vez de fingir sucesso.
      if (duplicateFrom) {
        try {
          await empreendimentoService.copyStructure(duplicateFrom.id, saved.id);
        } catch (err: any) {
          notify(`Empreendimento criado, mas a cópia da estrutura falhou: ${err.message}`, 'error');
          return;
        }
      }
      markSaved();
      notify(duplicateFrom ? 'Empreendimento duplicado com sucesso.' : 'Empreendimento criado com sucesso.');
      // Criar termina a tarefa: o pai fecha o painel (§25).
      onSaved(saved);
    } catch (err: any) {
      notify(`Erro ao salvar empreendimento: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); void salvar(); };

  // Ctrl+S salva a Visão Geral (como em Editar Colaborador).
  const salvarRef = React.useRef(salvar);
  salvarRef.current = salvar;
  React.useEffect(() => {
    if (!embutido) return;
    const aoTeclar = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault();
        if (dirty && !saving) void salvarRef.current();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [embutido, dirty, saving]);

  const handleCancel = async () => {
    if (await confirmDiscard()) onClose?.();
  };

  const tiposOpcoes = empreendimentoTypes.length > 0
    ? empreendimentoTypes.map(t => ({ value: t.slug, label: t.name }))
    : FALLBACK_TIPO_OPTIONS;

  const secoes = (
    <>
      {/* Identificação */}
      <div className="space-y-4">
        <SecaoTitulo icon={Building2} titulo="Identificação" />
        <div className={gradeCls}>
          <Campo rotulo="Nome *" htmlFor="emp-nome" className="md:col-span-2">
            <input id="emp-nome" className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} />
          </Campo>
          <Campo rotulo="Código" htmlFor="emp-codigo">
            <input id="emp-codigo" className={inputCls} value={form.code} onChange={e => set('code', e.target.value)} />
          </Campo>
          <Campo rotulo="Status" htmlFor="emp-status">
            <select id="emp-status" className={inputCls} value={form.status} onChange={e => set('status', e.target.value)}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Tipo" htmlFor="emp-tipo">
            <select id="emp-tipo" className={inputCls} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
              <option value="">— Selecione —</option>
              {tiposOpcoes.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Campo>
          <Campo
            rotulo="Objetivo"
            htmlFor="emp-objetivo"
            ajuda={avisoDoObjetivo
              ? <span className="text-amber-700" data-testid="aviso-objetivo">{avisoDoObjetivo}</span>
              : 'Decide quais espelhos a ficha mostra: Vendas, Locações, os dois ou nenhum (Serviço e Imobilizado).'}
          >
            <select id="emp-objetivo" className={inputCls} value={form.objetivo} onChange={e => set('objetivo', e.target.value)}>
              {OBJETIVOS.map(o => <option key={o} value={o}>{ROTULO_DO_OBJETIVO[o]}</option>)}
            </select>
          </Campo>
          <Campo
            rotulo="Organização *"
            htmlFor="emp-org"
            ajuda={editing ? 'Obra, estudos e torres vinculados usam essa organização para aparecer nos seletores.' : undefined}
          >
            <select id="emp-org" className={inputCls} value={orgId} onChange={e => void handleOrgChange(e.target.value)}>
              <option value="">— Selecione —</option>
              {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Campo>
          <Campo
            rotulo="Empresa (regime tributário)"
            htmlFor="emp-empresa"
            className="md:col-span-2"
            ajuda="Define o regime usado para calcular PIS/COFINS/INSS das Locações dos imóveis deste empreendimento."
          >
            <select
              id="emp-empresa"
              className={inputCls}
              value={form.company_id}
              onChange={e => set('company_id', e.target.value)}
              disabled={!orgId}
              title={!orgId ? 'Selecione a organização primeiro.' : undefined}
            >
              <option value="">— Sem empresa —</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nome_fantasia || c.razao_social}{c.regime_tributario ? ` · ${REGIME_LABEL[c.regime_tributario] ?? c.regime_tributario}` : ''}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </div>

      {/* Dados Gerais / Regularização */}
      <div className="space-y-4">
        <SecaoTitulo icon={FileText} titulo="Dados gerais" />
        <div className={gradeCls}>
          <Campo rotulo="Matrícula" htmlFor="emp-matricula">
            <input id="emp-matricula" className={inputCls} value={form.matricula} onChange={e => set('matricula', e.target.value)} />
          </Campo>
          <Campo rotulo="Nº do processo" htmlFor="emp-processo">
            <input id="emp-processo" className={inputCls} value={form.numero_processo} onChange={e => set('numero_processo', e.target.value)} />
          </Campo>
          <Campo rotulo="Construtora" htmlFor="emp-construtora">
            <input id="emp-construtora" className={inputCls} value={form.construtora} onChange={e => set('construtora', e.target.value)} />
          </Campo>
          <Campo rotulo="Responsável técnico" htmlFor="emp-rt" className="md:col-span-2">
            <input id="emp-rt" className={inputCls} value={form.responsavel_tecnico} onChange={e => set('responsavel_tecnico', e.target.value)} />
          </Campo>
          <Campo rotulo="CREA/CAU" htmlFor="emp-crea">
            <input id="emp-crea" className={inputCls} value={form.crea_cau} onChange={e => set('crea_cau', e.target.value)} />
          </Campo>
        </div>
      </div>

      {/* SPE */}
      <div className="space-y-4">
        <SecaoTitulo icon={Landmark} titulo="SPE" />
        <div className={gradeCls}>
          <Campo rotulo="Razão social" htmlFor="emp-spe-razao" className="md:col-span-2">
            <input id="emp-spe-razao" className={inputCls} value={form.spe_razao_social} onChange={e => set('spe_razao_social', e.target.value)} />
          </Campo>
          <Campo rotulo="CNPJ" htmlFor="emp-spe-cnpj">
            <input id="emp-spe-cnpj" className={inputCls} value={form.spe_cnpj} onChange={e => set('spe_cnpj', e.target.value)} />
          </Campo>
          <Campo rotulo="Nome fantasia" htmlFor="emp-spe-fantasia">
            <input id="emp-spe-fantasia" className={inputCls} value={form.spe_nome_fantasia} onChange={e => set('spe_nome_fantasia', e.target.value)} />
          </Campo>
          <Campo rotulo="Incorporadora" htmlFor="emp-incorporadora">
            <input id="emp-incorporadora" className={inputCls} value={form.developer_name} onChange={e => set('developer_name', e.target.value)} />
          </Campo>
          <Campo rotulo="Gestor" htmlFor="emp-gestor">
            <input id="emp-gestor" className={inputCls} value={form.manager} onChange={e => set('manager', e.target.value)} />
          </Campo>
        </div>
      </div>

      {/* Endereço de divulgação / oficial */}
      <div className="space-y-4">
        <SecaoTitulo icon={MapPin} titulo="Endereço do empreendimento" />
        <div className={gradeCls}>
          <Campo rotulo="Logradouro" htmlFor="emp-logradouro" className="md:col-span-2">
            <input id="emp-logradouro" className={inputCls} value={form.endereco_street} onChange={e => set('endereco_street', e.target.value)} />
          </Campo>
          <Campo rotulo="Número" htmlFor="emp-numero">
            <input id="emp-numero" className={inputCls} value={form.endereco_number} onChange={e => set('endereco_number', e.target.value)} />
          </Campo>
          <Campo rotulo="Bairro" htmlFor="emp-bairro">
            <input id="emp-bairro" className={inputCls} value={form.endereco_neighborhood} onChange={e => set('endereco_neighborhood', e.target.value)} />
          </Campo>
          <div className="md:col-span-2">
            <CityStateSelect
              cep={form.endereco_zip_code || undefined}
              stateCode={form.endereco_state || undefined}
              cityName={form.endereco_city || undefined}
              onChange={({ cep, stateCode, cityName }) => {
                setForm(prev => ({
                  ...prev,
                  endereco_zip_code: cep ?? '',
                  endereco_state: stateCode ?? '',
                  endereco_city: cityName ?? '',
                }));
                markDirty();
              }}
            />
          </div>
        </div>
      </div>

      {/* Terreno — no painel (criar), só a área; na Visão Geral é a TerrenoSecao, fora deste formulário. */}
      {!embutido && (
        <div className="space-y-4">
          <SecaoTitulo icon={MapPin} titulo="Terreno" />
          <div className={gradeCls}>
            <Campo rotulo="Área do terreno (m²)" htmlFor="emp-terreno-area">
              <input id="emp-terreno-area" type="number" step="0.01" className={inputCls} value={form.terreno_area} onChange={e => set('terreno_area', e.target.value)} />
            </Campo>
          </div>
        </div>
      )}

      {/* Comercial / datas */}
      <div className="space-y-4">
        <SecaoTitulo icon={BarChart3} titulo="Comercial" />
        <div className={gradeCls}>
          <Campo rotulo="VGV total (R$)">
            <MoneyCentsInput className={inputCls} value={form.vgv_total} onChange={v => set('vgv_total', v)} />
          </Campo>
          <Campo rotulo="Lançamento" htmlFor="emp-lancamento">
            <input id="emp-lancamento" type="date" className={inputCls} value={form.launch_date} onChange={e => set('launch_date', e.target.value)} />
          </Campo>
          <Campo rotulo="Previsão de entrega" htmlFor="emp-entrega">
            <input id="emp-entrega" type="date" className={inputCls} value={form.expected_delivery_date} onChange={e => set('expected_delivery_date', e.target.value)} />
          </Campo>
        </div>
      </div>

      {/* Vínculos — duplicando não se copiam (vínculo vivo duplicado = dois syncs no mesmo estudo). */}
      {!duplicateFrom && (
        <div className="space-y-4">
          <SecaoTitulo icon={Link2} titulo="Vínculos" />
          <div className={gradeCls}>
            <Campo rotulo="Estudo de viabilidade (Imovib)" htmlFor="emp-imovib">
              <select id="emp-imovib" className={inputCls} value={form.imovib_study_id} onChange={e => set('imovib_study_id', e.target.value)}>
                <option value="">— Sem vínculo —</option>
                {form.imovib_study_id && !studies.some(s => s.id === form.imovib_study_id) && <option value={form.imovib_study_id}>Estudo não encontrado nesta organização</option>}
                {studies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Campo>
            <Campo
              rotulo="Estudo de arquitetura (Planta Inteligente)"
              htmlFor="emp-planta"
              ajuda="A massa, o loteamento e o terreno da Planta chegam pela aba Sincronização."
            >
              <select id="emp-planta" className={inputCls} value={form.blueprint_study_id} onChange={e => set('blueprint_study_id', e.target.value)} aria-label="Estudo da Planta Inteligente">
                <option value="">— Sem vínculo —</option>
                {form.blueprint_study_id && !blueprintStudies.some(s => s.id === form.blueprint_study_id) && <option value={form.blueprint_study_id}>Estudo não encontrado nesta organização</option>}
                {blueprintStudies.map(s => {
                  const ocupadaPor = plantaOcupadaPor.get(s.id);
                  return (
                    <option key={s.id} value={s.id} disabled={!!ocupadaPor && s.id !== form.blueprint_study_id}>
                      {ocupadaPor && s.id !== form.blueprint_study_id ? `${s.name} — vinculada a «${ocupadaPor}»` : s.name}
                    </option>
                  );
                })}
              </select>
            </Campo>
            <Campo
              rotulo="Obra vinculada"
              htmlFor="emp-obra"
              ajuda={editing ? 'Obra principal. A obra de cada torre, o orçamento e o centro de custo ficam na aba Vinculações.' : undefined}
            >
              <select id="emp-obra" className={inputCls} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— Sem vínculo —</option>
                {orphanProjectId && <option value={orphanProjectId}>Obra não encontrada (vínculo antigo)</option>}
                {orgProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Campo>
          </div>
        </div>
      )}
    </>
  );

  const aviso = localToast && (
    <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
      localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
    }`}>
      <AlertCircle className="w-4 h-4 shrink-0" />
      {localToast.message}
    </div>
  );

  if (embutido) {
    return (
      <div className="space-y-6" data-testid="visao-geral-ficha">
        <form id="ficha-empreendimento" onSubmit={handleSubmit} className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-8">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex items-center gap-3 shrink-0">
              <SaveStatus dirty={dirty} savedAt={savedAt} />
              <span title={!dirty ? 'Altere algum campo para salvar.' : undefined}>
                <button
                  type="submit"
                  title="Salvar alterações (Ctrl+S)"
                  disabled={saving || !dirty}
                  className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Salvar alterações
                </button>
              </span>
            </div>
          </div>
          {secoes}
        </form>
        {terreno}
        {aviso}
      </div>
    );
  }

  return (
    // Painel lateral (UI_PATTERNS.md): criar/duplicar sem perder o contexto da tela por trás.
    <Sheet open onClose={onClose ?? (() => {})} size="2xl" dirty={dirty}>
      <SheetHeader onClose={handleCancel}>
        <SheetTitle className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-600" />
          {duplicateFrom ? 'Duplicar empreendimento' : 'Novo empreendimento'}
        </SheetTitle>
        <SheetDescription>
          {duplicateFrom
            ? `Cópia de "${duplicateFrom.name}". Torres, pavimentos, unidades e áreas comuns são copiados ao salvar; vínculos com obra, estudos e Comercial não.`
            : 'Cadastre a incorporação e seus vínculos.'}
        </SheetDescription>
      </SheetHeader>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
        <SheetPanel className="p-6 space-y-8">
          {secoes}
        </SheetPanel>

        <SheetFooter>
          <button
            type="button"
            onClick={handleCancel}
            className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all active:scale-95"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {duplicateFrom ? 'Criar cópia' : 'Criar'}
          </button>
        </SheetFooter>
      </form>
      {aviso}
    </Sheet>
  );
};

export default EmpreendimentoForm;
