import React from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, Plus, Eye, EyeOff, RotateCcw, AlertCircle, ArrowUp, ArrowDown, PlayCircle, X } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import Button from './ui/Button';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import { useConfirm } from './ui/confirm';
import { useToast } from '../hooks/useToast';
import { useOrgContext, useOrgWriteTarget, useWritableOrganizations, forEachTargetOrg, errorMessage, partialFailureNote } from '../hooks/useOrgContext';
import { useStore } from '../store/useStore';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { portalHelpService, type PortalHelpRecord, type PortalTourStat } from '../services/portalHelpService';
import { partnerService } from '../services/partnerService';
import { supplierService } from '../services/supplierService';
import { brokerService } from '../services/brokerService';
import MobilePreviewFrame from './MobilePreviewFrame';
import {
  PORTAL_LABELS, PORTAL_SECTIONS, DEFAULT_ITEMS, mergePortalHelp, sectionLabel, hashText, todosOsPassos, tourLabel, ancorasDoTour,
  type Portal, type HelpKind, type HelpItem, type MergedTourStep, type TourId,
} from '../utils/portalHelpDefaults';
import type { Supplier, BrokerProfile } from '../types';

// Os portais só carregam quando o gestor pede a pré-visualização.
const PartnerPortalPrevia = React.lazy(() => import('./partner/PartnerPortal').then(m => ({ default: m.PartnerPortal })));
const SupplierDashboardPrevia = React.lazy(() => import('./SupplierDashboard'));
const BrokerPortalPrevia = React.lazy(() => import('./BrokerPortal'));

/**
 * Configurações › Ajuda dos Portais — a construtora edita o que o parceiro, o
 * fornecedor e o corretor leem na central de ajuda dos portais.
 *
 * O padrão vive no código; aqui a organização sobrescreve (título/corpo/seção,
 * ou oculta) e acrescenta itens próprios. "Restaurar padrão" apaga a sobrescrita.
 * REGRA #5: lista pela organização do topo (sem org = todas, com a coluna
 * Organização); criar/sobrescrever em "Todas" pergunta onde (ou replica).
 *
 * Tour guiado (v2, F6 — 04/10/2026): cada tour (do portal ou "como usar" de
 * uma aba) lista os passos na ordem em que aparecem; a construtora reordena
 * (setas — só com uma organização no topo, porque a ordem é da organização),
 * cria passos próprios escolhendo o elemento da tela num catálogo
 * (`ancorasDoTour`) e pré-visualiza o tour como o externo vê.
 *
 * Acompanhamento (F7): quem viu, concluiu ou pulou cada tour, lido de
 * `portal_tour_stats` (só owner/admin). No link a "pessoa" é a empresa do
 * link. Em "Todas", junta as organizações em que o usuário é gestor.
 */

const PORTAIS: Portal[] = ['parceiro', 'fornecedor', 'corretor'];
const KINDS: { id: HelpKind; label: string }[] = [
  { id: 'artigo', label: 'Artigos' },
  { id: 'faq', label: 'Perguntas frequentes' },
  { id: 'tour', label: 'Tour guiado' },
];

type Linha = {
  chave: string;                 // key do padrão ou id da linha própria
  item: HelpItem | MergedTourStep;
  kind: HelpKind;
  orgId: string | null;          // org da sobrescrita/item próprio (null = padrão sem sobrescrita)
  orgName?: string;
  /** tour: posição (1-based) dentro do tour daquela organização */
  posicao?: number;
};

interface Form {
  modo: 'sobrescrever' | 'editar-linha' | 'novo';
  kind: HelpKind;
  defaultKey: string | null;
  rowId: string | null;
  orgId: string | null;
  section: string | null;
  title: string;
  body: string;
  published: boolean;
  /** tour: a que tour o passo pertence */
  tourId: TourId;
  /** tour: elemento realçado (passo padrão: fixo; passo próprio: do catálogo) */
  anchor: string | null;
  /** passo padrão: a âncora não se troca */
  anchorFixa: boolean;
}

interface Pessoa { id: string; nome: string; dado: unknown }
interface Previa { portal: Portal; pessoa: Pessoa; tourId: TourId; orgId: string }

type LinhaAcompanhamento = PortalTourStat & { orgId: string };

const SITUACAO: Record<PortalTourStat['status'], { texto: string; cor: string }> = {
  concluido: { texto: 'Concluiu', cor: 'text-emerald-700' },
  pulado: { texto: 'Pulou', cor: 'text-amber-700' },
  visto: { texto: 'Viu', cor: 'text-gray-500' },
};

const quando = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const campo = 'w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500';

const PortalHelpSettings: React.FC = () => {
  const { orgId } = useOrgContext();
  const organizations = useWritableOrganizations();
  const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
  const confirm = useConfirm();
  // Settings não tem ToastProvider: sem renderizar `localToast` o aviso é mudo.
  const { localToast, showToast } = useToast();
  const currentEmail = useStore(s => s.session?.user?.email as string | undefined);

  const [portal, setPortal] = React.useState<Portal>('parceiro');
  const [kind, setKind] = React.useState<HelpKind>('artigo');
  const [tourSel, setTourSel] = React.useState<TourId>('geral');
  const [rows, setRows] = React.useState<PortalHelpRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [form, setForm] = React.useState<Form | null>(null);
  const [preview, setPreview] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [movendo, setMovendo] = React.useState(false);
  // aba "Acompanhamento"
  const [acompanhamento, setAcompanhamento] = React.useState(false);
  const [estatisticas, setEstatisticas] = React.useState<LinhaAcompanhamento[] | null>(null);
  const [orgsSemPermissao, setOrgsSemPermissao] = React.useState(0);

  // pré-visualização do tour
  const [previaForm, setPreviaForm] = React.useState<{ pessoaId: string; tourId: TourId } | null>(null);
  const [pessoas, setPessoas] = React.useState<Pessoa[] | null>(null);
  const [previa, setPrevia] = React.useState<Previa | null>(null);

  const carregar = React.useCallback(async () => {
    setLoading(true);
    try {
      setRows(await portalHelpService.list(orgId, portal));
    } catch (e) {
      showToast(errorMessage(e, 'Erro ao carregar a ajuda dos portais.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [orgId, portal, showToast]);

  React.useEffect(() => { carregar(); }, [carregar]);
  React.useEffect(() => { setTourSel('geral'); }, [portal]);

  // Acompanhamento: org do topo, ou todas em que o usuário é gestor (as outras
  // devolvem 42501 e entram na contagem de "sem permissão").
  React.useEffect(() => {
    if (!acompanhamento) return;
    let vivo = true;
    setEstatisticas(null);
    const alvos = orgId ? [orgId] : organizations.map(o => o.id);
    Promise.allSettled(alvos.map(o => portalHelpService.tourStats(o, portal).then(rs => rs.map(r => ({ ...r, orgId: o })))))
      .then(res => {
        if (!vivo) return;
        const ok = res.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
        const falhas = res.filter(r => r.status === 'rejected');
        setOrgsSemPermissao(falhas.length);
        if (falhas.length === res.length && res.length > 0) {
          showToast(errorMessage((falhas[0] as PromiseRejectedResult).reason, 'Erro ao carregar o acompanhamento.'), 'error');
        }
        setEstatisticas(ok.sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
      });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acompanhamento, orgId, portal, organizations.length]);

  const rotuloDoProgresso = (tourId: string) =>
    tourId === 'checklist' ? 'Primeiros passos (ocultou o cartão)'
      : tourId.startsWith('checklist:') ? `Primeiros passos · ${tourId.slice('checklist:'.length)}`
      : tourLabel(portal, tourId);

  const nomeOrg = (id: string) => organizations.find(o => o.id === id)?.name ?? id.slice(0, 8);
  const catalogo = React.useMemo(() => ancorasDoTour(portal), [portal]);
  const rotuloDaAncora = (anchor: string) => catalogo.find(c => c.anchor === anchor)?.label ?? anchor;

  // Tours que existem para escolher: o do portal + uma por aba (mesmo sem
  // passo padrão — a construtora pode criar o primeiro).
  const toursDoPortal: TourId[] = React.useMemo(() => ['geral', ...PORTAL_SECTIONS[portal].map(s => s.id)], [portal]);

  // Linhas da tabela: com org no topo, a junção padrão+org daquela org; em
  // "Todas", o padrão uma vez + cada sobrescrita/item próprio com a sua org.
  const linhas: Linha[] = React.useMemo(() => {
    const porOrg = new Map<string, PortalHelpRecord[]>();
    rows.forEach(r => porOrg.set(r.organization_id, [...(porOrg.get(r.organization_id) ?? []), r]));

    const deUmaOrg = (org: string | null, recs: PortalHelpRecord[]): Linha[] => {
      const m = mergePortalHelp(portal, recs, { includeHidden: true });
      if (kind === 'tour') {
        const lista = m.tours[tourSel] ?? [];
        return lista.map((t, i) => ({
          chave: t.key ?? t.rowId!, item: t, kind, orgId: t.rowId ? org : null,
          orgName: org && t.rowId ? nomeOrg(org) : undefined, posicao: i + 1,
        }));
      }
      const lista = kind === 'artigo' ? m.articles : m.faqs;
      return lista.map(i => ({ chave: i.key ?? i.rowId!, item: i, kind, orgId: i.rowId ? org : null, orgName: org && i.rowId ? nomeOrg(org) : undefined }));
    };

    if (orgId) return deUmaOrg(orgId, porOrg.get(orgId) ?? []);

    // Todas: padrão puro + o que cada org mudou
    const padrao = deUmaOrg(null, []);
    const mudadas: Linha[] = [];
    porOrg.forEach((recs, org) => {
      deUmaOrg(org, recs).forEach(l => { if (l.orgId) mudadas.push(l); });
    });
    return [...padrao, ...mudadas];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, portal, kind, orgId, organizations, tourSel]);

  const oculto = (l: Linha) => l.kind === 'tour' ? (l.item as MergedTourStep).hidden : false;
  const publicadoDaLinha = (l: Linha) => {
    if (!l.orgId) return true;
    const r = rows.find(x => x.id === (l.item as HelpItem).rowId || x.id === (l.item as MergedTourStep).rowId);
    return r ? r.is_published : true;
  };

  const abrirEdicao = (l: Linha) => {
    const it = l.item as HelpItem & MergedTourStep;
    const rowId = it.rowId ?? null;
    const passo = l.kind === 'tour' ? (l.item as MergedTourStep) : null;
    setForm({
      modo: rowId ? 'editar-linha' : 'sobrescrever',
      kind: l.kind,
      defaultKey: passo ? passo.key : (it as HelpItem).key,
      rowId,
      orgId: l.orgId,
      section: passo ? passo.section : (it as HelpItem).section,
      title: it.title,
      body: passo ? passo.body : (it as HelpItem).body_html,
      published: rowId ? publicadoDaLinha(l) : true,
      tourId: passo ? passo.tour : 'geral',
      anchor: passo ? passo.anchor : null,
      anchorFixa: !!passo && passo.origin !== 'proprio',
    });
    setPreview(false);
  };

  const abrirNovo = () => {
    setForm({
      modo: 'novo', kind, defaultKey: null, rowId: null, orgId: null, section: null, title: '', body: '', published: true,
      tourId: tourSel, anchor: null, anchorFixa: false,
    });
    setPreview(false);
  };

  const corpoPadrao = (defaultKey: string | null) => {
    if (!defaultKey) return '';
    const d = DEFAULT_ITEMS[portal].find(x => x.key === defaultKey);
    if (d) return d.body_html;
    return todosOsPassos(portal).find(x => x.key === defaultKey)?.body ?? '';
  };

  // Elementos que um passo do tour escolhido pode realçar: no tour do portal,
  // qualquer um; no "como usar" de uma aba, os daquela aba e o cromo.
  const ancorasParaTour = (t: TourId) => catalogo.filter(c => t === 'geral' || c.section === null || c.section === t);

  const passoProprioSemAncora = !!form && form.kind === 'tour' && !form.anchorFixa && !form.anchor;
  const motivoSalvarDesligado = !form ? undefined
    : !form.title.trim() ? 'Informe o título'
    : passoProprioSemAncora ? 'Escolha o elemento da tela que o passo realça'
    : undefined;

  const salvar = async () => {
    if (!form || motivoSalvarDesligado) return;
    setSaving(true);
    const ancora = form.anchor ? catalogo.find(c => c.anchor === form.anchor) : undefined;
    const doTour = form.kind === 'tour' && !form.anchorFixa
      ? { anchor: form.anchor, tour_id: form.tourId === 'geral' ? null : form.tourId, section: ancora?.section ?? null }
      : null;
    try {
      if (form.modo === 'editar-linha' && form.rowId) {
        await portalHelpService.update(form.rowId, {
          title: form.title.trim(), body_html: form.body, section: doTour ? doTour.section : form.section, is_published: form.published,
          ...(doTour ? { anchor: doTour.anchor, tour_id: doTour.tour_id } : {}),
        });
        showToast('Ajuda atualizada.', 'success');
      } else {
        const target = await resolveWriteOrg('all-allowed');
        if (!target) { setSaving(false); return; }
        const { ok, failed } = await forEachTargetOrg(target, async (destino) => {
          if (form.modo === 'sobrescrever' && form.defaultKey) {
            return portalHelpService.saveOverride({
              organization_id: destino, portal, kind: form.kind, default_key: form.defaultKey,
              section: form.section, title: form.title.trim(), body_html: form.body, is_published: form.published,
              default_hash: hashText(corpoPadrao(form.defaultKey)), created_by: currentEmail ?? null,
            });
          }
          return portalHelpService.createCustom({
            organization_id: destino, portal, kind: form.kind,
            section: doTour ? doTour.section : form.section, title: form.title.trim(), body_html: form.body, is_published: form.published,
            created_by: currentEmail ?? null,
            // passo novo entra no fim do tour (as setas reordenam depois)
            ...(doTour ? { anchor: doTour.anchor, tour_id: doTour.tour_id, sort_order: 100000 } : {}),
          });
        });
        showToast(
          failed.length ? `Salvo em ${ok} de ${ok + failed.length} organizações (${partialFailureNote(failed)}).` : 'Ajuda salva.',
          failed.length ? 'error' : 'success',
        );
      }
      setForm(null);
      await carregar();
    } catch (e) {
      showToast(errorMessage(e, 'Erro ao salvar a ajuda.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const alternarOculto = async (l: Linha) => {
    const it = l.item as HelpItem & MergedTourStep;
    const key = l.kind === 'tour' ? (it as MergedTourStep).key : (it as HelpItem).key;
    try {
      if (it.rowId) {
        await portalHelpService.update(it.rowId, { is_published: !publicadoDaLinha(l) });
      } else if (key) {
        // ocultar um padrão = criar a sobrescrita despublicada, com o texto do padrão
        const target = await resolveWriteOrg('all-allowed');
        if (!target) return;
        await forEachTargetOrg(target, (destino) => portalHelpService.saveOverride({
          organization_id: destino, portal, kind: l.kind, default_key: key, section: l.kind === 'tour' ? (it as MergedTourStep).section : (it as HelpItem).section,
          title: it.title, body_html: l.kind === 'tour' ? (it as MergedTourStep).body : (it as HelpItem).body_html, is_published: false,
          default_hash: hashText(corpoPadrao(key)), created_by: currentEmail ?? null,
        }));
      }
      await carregar();
    } catch (e) {
      showToast(errorMessage(e, 'Erro ao alterar a visibilidade.'), 'error');
    }
  };

  // Troca o passo de lugar e renumera o tour inteiro (10, 20, 30…) na
  // organização do topo. Passo padrão sem linha ganha uma sobrescrita só com a
  // posição (o texto continua o do padrão — e a origem continua "Padrão").
  const mover = async (idx: number, dir: -1 | 1) => {
    if (!orgId) return;
    const j = idx + dir;
    if (j < 0 || j >= linhas.length) return;
    const lista = [...linhas];
    [lista[idx], lista[j]] = [lista[j], lista[idx]];
    setMovendo(true);
    try {
      await Promise.all(lista.map((l, k) => {
        const st = l.item as MergedTourStep;
        const nova = (k + 1) * 10;
        if (st.sort_order === nova) return null;
        if (st.rowId) return portalHelpService.update(st.rowId, { sort_order: nova });
        return portalHelpService.saveOverride({
          organization_id: orgId, portal, kind: 'tour', default_key: st.key!, section: st.section,
          title: st.title, body_html: st.body, is_published: true, sort_order: nova,
          default_hash: hashText(corpoPadrao(st.key)), created_by: currentEmail ?? null,
        });
      }));
      await carregar();
    } catch (e) {
      showToast(errorMessage(e, 'Erro ao reordenar o tour.'), 'error');
    } finally {
      setMovendo(false);
    }
  };

  const restaurar = async (l: Linha) => {
    const it = l.item as HelpItem & MergedTourStep;
    if (!it.rowId) return;
    const proprio = it.origin === 'proprio';
    const ok = await confirm({
      title: proprio ? (l.kind === 'tour' ? 'Excluir este passo?' : 'Excluir este item?') : 'Restaurar o padrão?',
      message: proprio
        ? (l.kind === 'tour' ? 'O passo sai do tour desta organização.' : 'O item próprio some da ajuda desta organização.')
        : l.kind === 'tour'
          ? 'A sua versão é apagada: o passo volta ao texto e à posição padrão do sistema.'
          : 'A sua versão é apagada e o texto padrão do sistema volta a aparecer no portal.',
      variant: 'warning',
      confirmLabel: proprio ? 'Excluir' : 'Restaurar',
    });
    if (!ok) return;
    try {
      await portalHelpService.remove(it.rowId);
      showToast(proprio ? 'Excluído.' : 'Padrão restaurado.', 'success');
      await carregar();
    } catch (e) {
      showToast(errorMessage(e, 'Erro ao restaurar.'), 'error');
    }
  };

  const restaurarTudo = async () => {
    const target = await resolveWriteOrg('all-allowed');
    if (!target) return;
    const ok = await confirm({
      title: `Restaurar todos os textos padrão do ${PORTAL_LABELS[portal]}?`,
      message: 'Todas as sobrescritas são apagadas; os itens próprios ficam.',
      variant: 'danger',
      confirmLabel: 'Restaurar tudo',
    });
    if (!ok) return;
    const { ok: n, failed } = await forEachTargetOrg(target, (destino) => portalHelpService.restoreAllDefaults(destino, portal));
    showToast(failed.length ? `Restaurado em ${n} de ${n + failed.length} organizações (${partialFailureNote(failed)}).` : 'Textos padrão restaurados.', failed.length ? 'error' : 'success');
    await carregar();
  };

  // ── pré-visualização ───────────────────────────────────────────────────
  const motivoPreviaDesligada = !orgId ? 'Escolha uma organização no topo para pré-visualizar' : undefined;

  const toursComPassos: TourId[] = React.useMemo(() => {
    if (!orgId) return ['geral'];
    const m = mergePortalHelp(portal, rows.filter(r => r.organization_id === orgId));
    return toursDoPortal.filter(t => (m.tours[t]?.length ?? 0) > 0);
  }, [orgId, portal, rows, toursDoPortal]);

  const abrirPrevia = async () => {
    if (!orgId) return;
    setPessoas(null);
    setPreviaForm({ pessoaId: '', tourId: toursComPassos.includes(tourSel) ? tourSel : 'geral' });
    try {
      let lista: Pessoa[] = [];
      if (portal === 'parceiro') {
        lista = (await partnerService.listWorkspaces(orgId)).map(w => ({ id: w.id, nome: w.supplier_name || w.id, dado: w }));
      } else if (portal === 'fornecedor') {
        lista = (await supplierService.listSuppliers(orgId)).map(s => ({ id: s.id, nome: s.name, dado: s }));
      } else {
        const perfis = (await brokerService.listProfiles(orgId)) as BrokerProfile[];
        lista = perfis.map(b => ({ id: b.id, nome: b.name || b.email || b.id, dado: b }));
      }
      setPessoas(lista);
      if (lista.length === 1) setPreviaForm(f => f && { ...f, pessoaId: lista[0].id });
    } catch (e) {
      setPessoas([]);
      showToast(errorMessage(e, 'Erro ao carregar a lista para a pré-visualização.'), 'error');
    }
  };

  const confirmarPrevia = () => {
    if (!previaForm || !orgId) return;
    const pessoa = pessoas?.find(x => x.id === previaForm.pessoaId);
    if (!pessoa) return;
    setPrevia({ portal, pessoa, tourId: previaForm.tourId, orgId });
    setPreviaForm(null);
  };

  const rotuloPessoa = portal === 'parceiro' ? 'Parceiro' : portal === 'fornecedor' ? 'Fornecedor' : 'Corretor';

  const origemTexto = (l: Linha) => {
    const o = (l.item as HelpItem | MergedTourStep).origin;
    return o === 'proprio' ? 'Próprio' : o === 'personalizado' ? 'Personalizado' : 'Padrão';
  };
  const origemCor = (t: string) => t === 'Padrão' ? 'text-gray-500' : t === 'Próprio' ? 'text-blue-700' : 'text-emerald-700';
  const ehTour = kind === 'tour';
  const colunas = (orgId ? 0 : 1) + (ehTour ? 6 : 5);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><HelpCircle className="w-5 h-5 text-blue-600" /> Ajuda dos Portais</h2>
          <p className="text-sm text-gray-500 mt-1">
            O que o parceiro, o fornecedor e o corretor leem na central de ajuda do portal. O texto padrão vem do sistema; edite, oculte ou acrescente itens para a sua organização.
          </p>
        </div>
        {!acompanhamento && (
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={restaurarTudo} title="Apaga as suas versões e volta ao texto padrão do sistema">
            <RotateCcw className="w-4 h-4" /> Restaurar padrão
          </Button>
          {ehTour && (
            <Button variant="secondary" onClick={abrirPrevia} disabled={!!motivoPreviaDesligada} title={motivoPreviaDesligada ?? 'Abre o portal como o externo vê, já com o tour'}>
              <PlayCircle className="w-4 h-4" /> Pré-visualizar tour
            </Button>
          )}
          <Button onClick={abrirNovo}><Plus className="w-4 h-4" /> {ehTour ? 'Novo passo' : 'Novo item'}</Button>
        </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1">
          {PORTAIS.map(p => (
            <button key={p} type="button" onClick={() => setPortal(p)}
              className={`px-3 h-7 rounded-[6px] text-sm font-medium transition-all ${portal === p ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}>
              {PORTAL_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1">
          {KINDS.map(k => (
            <button key={k.id} type="button" onClick={() => { setKind(k.id); setAcompanhamento(false); }}
              className={`px-3 h-7 rounded-[6px] text-sm font-medium transition-all ${!acompanhamento && kind === k.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}>
              {k.label}
            </button>
          ))}
          <button type="button" onClick={() => setAcompanhamento(true)}
            className={`px-3 h-7 rounded-[6px] text-sm font-medium transition-all ${acompanhamento ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}>
            Acompanhamento
          </button>
        </div>
        {ehTour && !acompanhamento && (
          <select
            aria-label="Tour"
            value={tourSel}
            onChange={(e) => setTourSel(e.target.value)}
            className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 text-gray-700 text-sm font-medium rounded-[6px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            {toursDoPortal.map(t => <option key={t} value={t}>{tourLabel(portal, t)}</option>)}
          </select>
        )}
      </div>

      {acompanhamento && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
            Quem viu, concluiu ou pulou o tour e os primeiros passos do {PORTAL_LABELS[portal]}. No acesso pelo link a pessoa é a empresa: todos que usam o mesmo link contam como um.
            {!orgId && orgsSemPermissao > 0 && ` ${orgsSemPermissao} organização(ões) em que você não é gestor não aparecem.`}
          </p>
          <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                <tr>
                  {!orgId && <th className="px-6 py-2 border-r border-gray-100">Organização</th>}
                  <th className="px-6 py-2 border-r border-gray-100">Quem</th>
                  <th className="px-6 py-2 border-r border-gray-100">Acesso</th>
                  <th className="px-6 py-2 border-r border-gray-100">Tour</th>
                  <th className="px-6 py-2 border-r border-gray-100">Situação</th>
                  <th className="px-6 py-2 border-r border-gray-100">Passo</th>
                  <th className="px-6 py-2 border-r border-gray-100">Vezes</th>
                  <th className="px-6 py-2">Última vez</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {estatisticas === null && (
                  <tr><td colSpan={orgId ? 7 : 8} className="px-6 py-10 text-center text-sm text-gray-400">Carregando...</td></tr>
                )}
                {estatisticas?.length === 0 && (
                  <tr><td colSpan={orgId ? 7 : 8} className="px-6 py-10 text-center text-sm text-gray-400">Ninguém passou pelo tour deste portal ainda.</td></tr>
                )}
                {(estatisticas ?? []).map((r, i) => (
                  <tr key={`${r.orgId}:${r.acesso}:${r.contato ?? r.quem}:${r.tour_id}:${i}`} className="hover:bg-blue-50/50 transition-colors">
                    {!orgId && <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{nomeOrg(r.orgId)}</td>}
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">
                      {r.quem || '—'}
                      {r.contato && r.contato !== r.quem && <span className="block text-xs text-gray-400">{r.contato}</span>}
                    </td>
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600 whitespace-nowrap">{r.acesso === 'link' ? 'Link (empresa)' : 'E-mail'}</td>
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{rotuloDoProgresso(r.tour_id)}</td>
                    <td className={`px-6 py-2.5 border-r border-gray-100 text-sm font-normal ${SITUACAO[r.status]?.cor ?? 'text-gray-500'}`}>{SITUACAO[r.status]?.texto ?? r.status}</td>
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{r.step_reached ?? '—'}</td>
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{r.times}</td>
                    <td className="px-6 py-2.5 text-sm font-normal text-gray-600 whitespace-nowrap">{quando(r.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ehTour && !acompanhamento && (
        <p className="text-sm text-gray-500 flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
          {tourSel === 'geral'
            ? 'O tour do portal abre no primeiro acesso. '
            : `"${tourLabel(portal, tourSel)}" abre na primeira visita à aba. `}
          Reordene com as setas; passos próprios realçam um elemento escolhido da tela.
          {!orgId && ' Para reordenar, escolha uma organização no topo.'}
        </p>
      )}

      {!acompanhamento && (
      <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
            <tr>
              {!orgId && <th className="px-6 py-2 border-r border-gray-100">Organização</th>}
              {ehTour ? (
                <>
                  <th className="px-6 py-2 border-r border-gray-100">Posição</th>
                  <th className="px-6 py-2 border-r border-gray-100">Elemento</th>
                </>
              ) : (
                <th className="px-6 py-2 border-r border-gray-100">Seção</th>
              )}
              <th className="px-6 py-2 border-r border-gray-100">Título</th>
              <th className="px-6 py-2 border-r border-gray-100">Origem</th>
              <th className="px-6 py-2 border-r border-gray-100">Visível</th>
              <th className="px-6 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading && linhas.length === 0 && (
              <tr><td colSpan={colunas} className="px-6 py-10 text-center text-sm text-gray-400">Carregando...</td></tr>
            )}
            {linhas.map((l, i) => {
              const origem = origemTexto(l);
              const visivel = publicadoDaLinha(l) && !oculto(l);
              const podeRestaurar = !!(l.item as HelpItem & MergedTourStep).rowId;
              const passo = ehTour ? (l.item as MergedTourStep) : null;
              const motivoSubir = !orgId ? 'Escolha uma organização no topo para reordenar' : i === 0 ? 'Já é o primeiro' : movendo ? 'Aguarde' : undefined;
              const motivoDescer = !orgId ? 'Escolha uma organização no topo para reordenar' : i === linhas.length - 1 ? 'Já é o último' : movendo ? 'Aguarde' : undefined;
              return (
                <tr key={`${l.orgId ?? 'padrao'}:${l.chave}:${i}`} className="hover:bg-blue-50/50 transition-colors">
                  {!orgId && <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{l.orgName ?? 'Padrão do sistema'}</td>}
                  {passo ? (
                    <>
                      <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600 whitespace-nowrap">{l.posicao}º</td>
                      <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">
                        {rotuloDaAncora(passo.anchor)}
                        <span className="text-xs text-gray-400"> · {sectionLabel(portal, passo.section)}</span>
                      </td>
                    </>
                  ) : (
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600 whitespace-nowrap">{sectionLabel(portal, (l.item as HelpItem).section)}</td>
                  )}
                  <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">{l.item.title}</td>
                  <td className={`px-6 py-2.5 border-r border-gray-100 text-sm font-normal ${origemCor(origem)}`}>{origem}</td>
                  <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal">
                    <span className={visivel ? 'text-emerald-700' : 'text-gray-400'}>{visivel ? 'Sim' : 'Oculto'}</span>
                  </td>
                  <td className="px-6 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {passo && (
                        <>
                          <ActionIconButton kind="move" icon={<ArrowUp className="w-4 h-4" />} title={motivoSubir ?? 'Subir'} disabled={!!motivoSubir} onClick={() => mover(i, -1)} />
                          <ActionIconButton kind="move" icon={<ArrowDown className="w-4 h-4" />} title={motivoDescer ?? 'Descer'} disabled={!!motivoDescer} onClick={() => mover(i, 1)} />
                        </>
                      )}
                      <ActionIconButton kind="edit" title={origem === 'Padrão' ? 'Personalizar este texto' : 'Editar'} onClick={() => abrirEdicao(l)} />
                      <ActionIconButton
                        kind="view"
                        icon={visivel ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        title={visivel ? 'Ocultar no portal' : 'Mostrar no portal'}
                        onClick={() => alternarOculto(l)}
                      />
                      <ActionIconButton
                        kind={origem === 'Próprio' ? 'delete' : 'history'}
                        title={origem === 'Próprio' ? (passo ? 'Excluir passo' : 'Excluir item') : podeRestaurar ? 'Restaurar o padrão' : 'Já é o padrão'}
                        disabled={!podeRestaurar}
                        onClick={() => restaurar(l)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && linhas.length === 0 && (
              <tr><td colSpan={colunas} className="px-6 py-10 text-center text-sm text-gray-400">
                {ehTour ? 'Este tour ainda não tem passos. Use "Novo passo" para criar o primeiro.' : 'Nenhum item.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      <Sheet open={!!form} onClose={() => setForm(null)} size="lg">
        <SheetHeader onClose={() => setForm(null)}>
          <SheetTitle>
            {form?.modo === 'novo' ? (form.kind === 'tour' ? 'Novo passo do tour' : 'Novo item de ajuda')
              : form?.modo === 'sobrescrever' ? 'Personalizar texto padrão' : (form?.kind === 'tour' ? 'Editar passo do tour' : 'Editar item de ajuda')}
          </SheetTitle>
          <SheetDescription>
            {PORTAL_LABELS[portal]} · {form?.kind === 'tour' ? tourLabel(portal, form.tourId) : (KINDS.find(k => k.id === form?.kind)?.label ?? '')}
            {form?.orgId ? ` · ${nomeOrg(form.orgId)}` : ''}
          </SheetDescription>
        </SheetHeader>
        {form && (
          <>
            <SheetPanel className="px-6 py-6">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {form.kind === 'tour' && !form.anchorFixa && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500" htmlFor="ajuda-passo-tour">Tour</label>
                      <select
                        id="ajuda-passo-tour"
                        value={form.tourId}
                        onChange={(e) => {
                          const t = e.target.value;
                          const aindaServe = form.anchor && ancorasParaTour(t).some(c => c.anchor === form.anchor);
                          setForm({ ...form, tourId: t, anchor: aindaServe ? form.anchor : null });
                        }}
                        className={campo}
                      >
                        {toursDoPortal.map(t => <option key={t} value={t}>{tourLabel(portal, t)}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500" htmlFor="ajuda-passo-ancora">Elemento da tela</label>
                      <select
                        id="ajuda-passo-ancora"
                        value={form.anchor ?? ''}
                        onChange={(e) => setForm({ ...form, anchor: e.target.value || null })}
                        className={campo}
                      >
                        <option value="">Escolha o elemento</option>
                        {ancorasParaTour(form.tourId).map(c => (
                          <option key={c.anchor} value={c.anchor}>{c.label} · {sectionLabel(portal, c.section)}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                {form.kind === 'tour' && form.anchorFixa && form.anchor && (
                  <div className="space-y-1.5 col-span-2">
                    <span className="text-xs font-semibold text-slate-500">Elemento da tela</span>
                    <p className="h-9 flex items-center text-sm text-gray-700">
                      {rotuloDaAncora(form.anchor)}
                      <span className="text-xs text-gray-400 ml-1">· {sectionLabel(portal, form.section)} · fixo no passo padrão</span>
                    </p>
                  </div>
                )}
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-semibold text-slate-500" htmlFor="ajuda-titulo">Título</label>
                  <input
                    id="ajuda-titulo"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className={campo}
                  />
                </div>
                {form.kind !== 'tour' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Seção</label>
                    <select
                      value={form.section ?? ''}
                      onChange={(e) => setForm({ ...form, section: e.target.value || null })}
                      className={campo}
                    >
                      <option value="">Geral</option>
                      {PORTAL_SECTIONS[portal].map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Visibilidade</label>
                  <label className="flex items-center gap-2 h-9 text-sm text-gray-700">
                    <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                    Visível no portal
                  </label>
                </div>
                <div className="space-y-1.5 col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-500" htmlFor="ajuda-corpo">{form.kind === 'tour' ? 'Texto do passo' : 'Conteúdo (HTML simples: parágrafos, listas, negrito)'}</label>
                    {form.kind !== 'tour' && (
                      <button type="button" onClick={() => setPreview(p => !p)} className="text-xs font-medium text-blue-600 hover:underline">
                        {preview ? 'Editar' : 'Pré-visualizar'}
                      </button>
                    )}
                  </div>
                  {preview ? (
                    <div
                      className="min-h-[240px] p-4 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-700 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:mb-3"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(form.body) }}
                    />
                  ) : (
                    <textarea
                      id="ajuda-corpo"
                      rows={form.kind === 'tour' ? 4 : 12}
                      value={form.body}
                      onChange={(e) => setForm({ ...form, body: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-[6px] text-sm font-mono focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 resize-y"
                    />
                  )}
                </div>
              </div>
            </SheetPanel>
            <SheetFooter>
              <Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
              <Button onClick={salvar} disabled={saving || !!motivoSalvarDesligado} title={motivoSalvarDesligado}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </SheetFooter>
          </>
        )}
      </Sheet>

      <Sheet open={!!previaForm} onClose={() => setPreviaForm(null)} size="md">
        <SheetHeader onClose={() => setPreviaForm(null)}>
          <SheetTitle>Pré-visualizar tour</SheetTitle>
          <SheetDescription>{PORTAL_LABELS[portal]} como o externo vê, com o texto desta organização. Nada é gravado.</SheetDescription>
        </SheetHeader>
        {previaForm && (
          <>
            <SheetPanel className="px-6 py-6">
              <div className="grid grid-cols-1 gap-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500" htmlFor="ajuda-previa-pessoa">{rotuloPessoa}</label>
                  <select
                    id="ajuda-previa-pessoa"
                    value={previaForm.pessoaId}
                    onChange={(e) => setPreviaForm({ ...previaForm, pessoaId: e.target.value })}
                    disabled={!pessoas}
                    className={campo}
                  >
                    <option value="">{!pessoas ? 'Carregando...' : pessoas.length === 0 ? `Nenhum ${rotuloPessoa.toLowerCase()} nesta organização` : `Escolha o ${rotuloPessoa.toLowerCase()}`}</option>
                    {(pessoas ?? []).map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500" htmlFor="ajuda-previa-tour">Tour</label>
                  <select
                    id="ajuda-previa-tour"
                    value={previaForm.tourId}
                    onChange={(e) => setPreviaForm({ ...previaForm, tourId: e.target.value })}
                    className={campo}
                  >
                    {toursComPassos.map(t => <option key={t} value={t}>{tourLabel(portal, t)}</option>)}
                  </select>
                </div>
              </div>
            </SheetPanel>
            <SheetFooter>
              <Button variant="secondary" onClick={() => setPreviaForm(null)}>Cancelar</Button>
              <Button
                onClick={confirmarPrevia}
                disabled={!previaForm.pessoaId}
                title={!previaForm.pessoaId ? `Escolha o ${rotuloPessoa.toLowerCase()}` : undefined}
              >
                <PlayCircle className="w-4 h-4" /> Abrir
              </Button>
            </SheetFooter>
          </>
        )}
      </Sheet>

      {previa && previa.portal === 'parceiro' && createPortal(
        <div className="fixed inset-0 z-[10000] bg-black">
          <button
            type="button"
            onClick={() => setPrevia(null)}
            className="absolute top-3 right-3 z-[10001] flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-800 rounded-lg text-xs font-bold shadow-lg hover:bg-gray-100"
          >
            <X className="w-3.5 h-3.5" />
            Fechar pré-visualização
          </button>
          <React.Suspense fallback={<div className="flex items-center justify-center h-screen text-white text-sm">Carregando pré-visualização...</div>}>
            <PartnerPortalPrevia userEmail="" previewWorkspaceId={previa.pessoa.id} onExitPreview={() => setPrevia(null)} forcarTour={previa.tourId} />
          </React.Suspense>
        </div>,
        document.body,
      )}
      {previa && previa.portal === 'fornecedor' && (
        <MobilePreviewFrame onClose={() => setPrevia(null)} title="Prévia do tour — Portal do Fornecedor">
          <React.Suspense fallback={<div className="p-6 text-sm text-gray-500">Carregando...</div>}>
            <SupplierDashboardPrevia supplierProfile={previa.pessoa.dado as Supplier} isPreview forcarTour={previa.tourId} />
          </React.Suspense>
        </MobilePreviewFrame>
      )}
      {previa && previa.portal === 'corretor' && (
        <MobilePreviewFrame onClose={() => setPrevia(null)} title="Prévia do tour — Portal do Corretor">
          <React.Suspense fallback={<div className="p-6 text-sm text-gray-500">Carregando...</div>}>
            <BrokerPortalPrevia
              profile={{ group: 'CORRETOR', role: '', email: (previa.pessoa.dado as BrokerProfile).email }}
              organizationId={previa.orgId}
              initialBroker={previa.pessoa.dado as BrokerProfile}
              isPreview
              forcarTour={previa.tourId}
            />
          </React.Suspense>
        </MobilePreviewFrame>
      )}

      {localToast && (
        <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {localToast.message}
        </div>
      )}
      {orgTargetModal}
    </div>
  );
};

export default PortalHelpSettings;
