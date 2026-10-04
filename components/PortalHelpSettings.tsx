import React from 'react';
import { HelpCircle, Plus, Eye, EyeOff, RotateCcw, AlertCircle } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import Button from './ui/Button';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import { useConfirm } from './ui/confirm';
import { useToast } from '../hooks/useToast';
import { useOrgContext, useOrgWriteTarget, useWritableOrganizations, forEachTargetOrg, errorMessage, partialFailureNote } from '../hooks/useOrgContext';
import { useStore } from '../store/useStore';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { portalHelpService, type PortalHelpRecord } from '../services/portalHelpService';
import {
  PORTAL_LABELS, PORTAL_SECTIONS, DEFAULT_ITEMS, mergePortalHelp, sectionLabel, hashText, todosOsPassos, tourLabel,
  type Portal, type HelpKind, type HelpItem, type MergedTourStep,
} from '../utils/portalHelpDefaults';

/**
 * Configurações › Ajuda dos Portais — a construtora edita o que o parceiro, o
 * fornecedor e o corretor leem na central de ajuda dos portais.
 *
 * O padrão vive no código; aqui a organização sobrescreve (título/corpo/seção,
 * ou oculta) e acrescenta itens próprios. "Restaurar padrão" apaga a sobrescrita.
 * REGRA #5: lista pela organização do topo (sem org = todas, com a coluna
 * Organização); criar/sobrescrever em "Todas" pergunta onde (ou replica).
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
}

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
  const [rows, setRows] = React.useState<PortalHelpRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [form, setForm] = React.useState<Form | null>(null);
  const [preview, setPreview] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

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

  const nomeOrg = (id: string) => organizations.find(o => o.id === id)?.name ?? id.slice(0, 8);

  // Linhas da tabela: com org no topo, a junção padrão+org daquela org; em
  // "Todas", o padrão uma vez + cada sobrescrita/item próprio com a sua org.
  const linhas: Linha[] = React.useMemo(() => {
    const porOrg = new Map<string, PortalHelpRecord[]>();
    rows.forEach(r => porOrg.set(r.organization_id, [...(porOrg.get(r.organization_id) ?? []), r]));

    const deUmaOrg = (org: string | null, recs: PortalHelpRecord[]): Linha[] => {
      const m = mergePortalHelp(portal, recs, { includeHidden: true });
      if (kind === 'tour') return Object.values(m.tours).flat().map(t => ({ chave: t.key, item: t, kind, orgId: t.rowId ? org : null, orgName: org ? nomeOrg(org) : undefined }));
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
  }, [rows, portal, kind, orgId, organizations]);

  const oculto = (l: Linha) => l.kind === 'tour' ? (l.item as MergedTourStep).hidden : false;
  const publicadoDaLinha = (l: Linha) => {
    if (!l.orgId) return true;
    const r = rows.find(x => x.id === (l.item as HelpItem).rowId || x.id === (l.item as MergedTourStep).rowId);
    return r ? r.is_published : true;
  };

  const abrirEdicao = (l: Linha) => {
    const it = l.item as HelpItem & MergedTourStep;
    const rowId = it.rowId ?? null;
    setForm({
      modo: rowId ? 'editar-linha' : 'sobrescrever',
      kind: l.kind,
      defaultKey: l.kind === 'tour' ? (it as MergedTourStep).key : (it as HelpItem).key,
      rowId,
      orgId: l.orgId,
      section: l.kind === 'tour' ? (it as MergedTourStep).section : (it as HelpItem).section,
      title: it.title,
      body: l.kind === 'tour' ? (it as MergedTourStep).body : (it as HelpItem).body_html,
      published: rowId ? publicadoDaLinha(l) : true,
    });
    setPreview(false);
  };

  const abrirNovo = () => {
    setForm({ modo: 'novo', kind: kind === 'tour' ? 'artigo' : kind, defaultKey: null, rowId: null, orgId: null, section: null, title: '', body: '', published: true });
    setPreview(false);
  };

  const corpoPadrao = (defaultKey: string | null) => {
    if (!defaultKey) return '';
    const d = DEFAULT_ITEMS[portal].find(x => x.key === defaultKey);
    if (d) return d.body_html;
    return todosOsPassos(portal).find(x => x.key === defaultKey)?.body ?? '';
  };

  const salvar = async () => {
    if (!form || !form.title.trim()) return;
    setSaving(true);
    try {
      if (form.modo === 'editar-linha' && form.rowId) {
        await portalHelpService.update(form.rowId, {
          title: form.title.trim(), body_html: form.body, section: form.kind === 'tour' ? form.section : form.section, is_published: form.published,
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
            organization_id: destino, portal, kind: form.kind === 'tour' ? 'artigo' : form.kind,
            section: form.section, title: form.title.trim(), body_html: form.body, is_published: form.published, created_by: currentEmail ?? null,
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

  const restaurar = async (l: Linha) => {
    const it = l.item as HelpItem & MergedTourStep;
    if (!it.rowId) return;
    const proprio = l.kind !== 'tour' && (it as HelpItem).origin === 'proprio';
    const ok = await confirm({
      title: proprio ? 'Excluir este item?' : 'Restaurar o texto padrão?',
      message: proprio
        ? 'O item próprio some da ajuda desta organização.'
        : 'A sua versão é apagada e o texto padrão do sistema volta a aparecer no portal.',
      variant: 'warning',
      confirmLabel: proprio ? 'Excluir' : 'Restaurar',
    });
    if (!ok) return;
    try {
      await portalHelpService.remove(it.rowId);
      showToast(proprio ? 'Item excluído.' : 'Texto padrão restaurado.', 'success');
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

  // "2º · Como usar: Documentos" — posição do passo dentro do tour dele
  const posicaoNoTour = (st: MergedTourStep) => {
    const doTour = todosOsPassos(portal).filter(x => x.tour === st.tour);
    return `${doTour.findIndex(x => x.key === st.key) + 1}º · ${tourLabel(portal, st.tour)}`;
  };

  const origemTexto = (l: Linha) => {
    if (l.kind === 'tour') return (l.item as MergedTourStep).origin === 'personalizado' ? 'Personalizado' : 'Padrão';
    const o = (l.item as HelpItem).origin;
    return o === 'proprio' ? 'Próprio' : o === 'personalizado' ? 'Personalizado' : 'Padrão';
  };
  const origemCor = (t: string) => t === 'Padrão' ? 'text-gray-500' : t === 'Próprio' ? 'text-blue-700' : 'text-emerald-700';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><HelpCircle className="w-5 h-5 text-blue-600" /> Ajuda dos Portais</h2>
          <p className="text-sm text-gray-500 mt-1">
            O que o parceiro, o fornecedor e o corretor leem na central de ajuda do portal. O texto padrão vem do sistema; edite, oculte ou acrescente itens para a sua organização.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={restaurarTudo} title="Apaga as suas versões e volta ao texto padrão do sistema">
            <RotateCcw className="w-4 h-4" /> Restaurar padrão
          </Button>
          {kind !== 'tour' && (
            <Button onClick={abrirNovo}><Plus className="w-4 h-4" /> Novo item</Button>
          )}
        </div>
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
            <button key={k.id} type="button" onClick={() => setKind(k.id)}
              className={`px-3 h-7 rounded-[6px] text-sm font-medium transition-all ${kind === k.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}>
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {kind === 'tour' && (
        <p className="text-sm text-gray-500 flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
          No tour você edita o título e o texto de cada passo, ou oculta um passo. A posição dos passos na tela é fixa do sistema.
        </p>
      )}

      <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
            <tr>
              {!orgId && <th className="px-6 py-2 border-r border-gray-100">Organização</th>}
              <th className="px-6 py-2 border-r border-gray-100">{kind === 'tour' ? 'Passo' : 'Seção'}</th>
              <th className="px-6 py-2 border-r border-gray-100">Título</th>
              <th className="px-6 py-2 border-r border-gray-100">Origem</th>
              <th className="px-6 py-2 border-r border-gray-100">Visível</th>
              <th className="px-6 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading && linhas.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">Carregando...</td></tr>
            )}
            {linhas.map((l, i) => {
              const origem = origemTexto(l);
              const visivel = publicadoDaLinha(l) && !oculto(l);
              const podeRestaurar = !!(l.item as HelpItem & MergedTourStep).rowId;
              return (
                <tr key={`${l.orgId ?? 'padrao'}:${l.chave}:${i}`} className="hover:bg-blue-50/50 transition-colors">
                  {!orgId && <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{l.orgName ?? 'Padrão do sistema'}</td>}
                  <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600 whitespace-nowrap">
                    {l.kind === 'tour' ? posicaoNoTour(l.item as MergedTourStep) : sectionLabel(portal, (l.item as HelpItem).section)}
                  </td>
                  <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">{l.item.title}</td>
                  <td className={`px-6 py-2.5 border-r border-gray-100 text-sm font-normal ${origemCor(origem)}`}>{origem}</td>
                  <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal">
                    <span className={visivel ? 'text-emerald-700' : 'text-gray-400'}>{visivel ? 'Sim' : 'Oculto'}</span>
                  </td>
                  <td className="px-6 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <ActionIconButton kind="edit" title={origem === 'Padrão' ? 'Personalizar este texto' : 'Editar'} onClick={() => abrirEdicao(l)} />
                      <ActionIconButton
                        kind="view"
                        icon={visivel ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        title={visivel ? 'Ocultar no portal' : 'Mostrar no portal'}
                        onClick={() => alternarOculto(l)}
                      />
                      <ActionIconButton
                        kind={origem === 'Próprio' ? 'delete' : 'history'}
                        title={origem === 'Próprio' ? 'Excluir item' : podeRestaurar ? 'Restaurar o texto padrão' : 'Já é o texto padrão'}
                        disabled={!podeRestaurar}
                        onClick={() => restaurar(l)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && linhas.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">Nenhum item.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={!!form} onClose={() => setForm(null)} size="lg">
        <SheetHeader onClose={() => setForm(null)}>
          <SheetTitle>{form?.modo === 'novo' ? 'Novo item de ajuda' : form?.modo === 'sobrescrever' ? 'Personalizar texto padrão' : 'Editar item de ajuda'}</SheetTitle>
          <SheetDescription>
            {PORTAL_LABELS[portal]} · {KINDS.find(k => k.id === form?.kind)?.label ?? ''}
            {form?.orgId ? ` · ${nomeOrg(form.orgId)}` : ''}
          </SheetDescription>
        </SheetHeader>
        {form && (
          <>
            <SheetPanel className="px-6 py-6">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-semibold text-slate-500">Título</label>
                  <input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500"
                  />
                </div>
                {form.kind !== 'tour' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Seção</label>
                    <select
                      value={form.section ?? ''}
                      onChange={(e) => setForm({ ...form, section: e.target.value || null })}
                      className="w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500"
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
                    <label className="text-xs font-semibold text-slate-500">{form.kind === 'tour' ? 'Texto do passo' : 'Conteúdo (HTML simples: parágrafos, listas, negrito)'}</label>
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
              <Button onClick={salvar} disabled={saving || !form.title.trim()} title={!form.title.trim() ? 'Informe o título' : undefined}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </SheetFooter>
          </>
        )}
      </Sheet>
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
