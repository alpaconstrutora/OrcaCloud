import React, { useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, HelpCircle, Mail, MessageSquare, Phone, Globe, Search, BookOpen, CircleHelp, Building2, RotateCcw } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';
import { usePersistedState } from '../ui/TableUtils';
import { usePortalHelp } from '../../hooks/usePortalHelp';
import { sanitizeHtml } from '../../utils/sanitizeHtml';
import {
  htmlToText, sectionLabel, PORTAL_SECTIONS, PORTAL_LABELS,
  type HelpItem, type Portal,
} from '../../utils/portalHelpDefaults';

/**
 * Central de ajuda dos portais externos — painel lateral (REGRA #4) com artigos
 * por seção, busca, perguntas frequentes e contato com a construtora.
 *
 * Mesmo componente nos três portais e nos modos link / e-mail / prévia; o que
 * muda é como o conteúdo é obtido (hooks/usePortalHelp.ts). Corpo dos artigos é
 * HTML da construtora: passa por `sanitizeHtml` na mesma linha do sink.
 */
export interface PortalHelpProps {
  open: boolean;
  onClose: () => void;
  portal: Portal;
  /** acesso pelo link */
  token?: string | null;
  /** externo logado / prévia: organização já conhecida pela tela */
  orgId?: string | null;
  /** abas liberadas (ajuda de aba oculta não aparece) */
  visibleSections?: readonly string[] | null;
  /** aba ativa — abre a central já nessa seção */
  initialSection?: string | null;
  /** só o Parceiro tem solicitações; sem a prop o botão não aparece */
  onOpenRequest?: () => void;
  /** F3: reabrir o tour guiado */
  onRestartTour?: () => void;
  /** acento do portal: laranja (parceiro) ou coral (kit §24) */
  accent?: 'orange' | 'coral' | 'indigo';
}

const ACCENT = {
  orange: { text: 'text-orange-600', bg: 'bg-orange-500 hover:bg-orange-600', ring: 'focus:ring-orange-500/20 focus:border-orange-500', soft: 'bg-orange-50 text-orange-700' },
  coral: { text: 'text-[#C24428]', bg: 'bg-[#E1553C] hover:bg-[#C24428]', ring: 'focus:ring-[#E1553C]/20 focus:border-[#E1553C]', soft: 'bg-[#FDEDE8] text-[#C24428]' },
  indigo: { text: 'text-indigo-600', bg: 'bg-indigo-600 hover:bg-indigo-700', ring: 'focus:ring-indigo-500/20 focus:border-indigo-500', soft: 'bg-indigo-50 text-indigo-700' },
};

const soDigitos = (s: string) => s.replace(/\D/g, '');

export const PortalHelp: React.FC<PortalHelpProps> = ({
  open, onClose, portal, token, orgId, visibleSections, initialSection, onOpenRequest, onRestartTour, accent = 'orange',
}) => {
  const a = ACCENT[accent];
  const { loading, erro, help, contact, orgs, selectedOrgId, selectOrg, precisaEscolherOrg } = usePortalHelp(portal, {
    token, orgId, visibleSections, enabled: open,
  });

  const [busca, setBusca] = usePersistedState<string>(`portalHelp:${portal}:busca`, '');
  const [artigoAberto, setArtigoAberto] = useState<HelpItem | null>(null);
  const [secaoAberta, setSecaoAberta] = useState<string | null | undefined>(undefined);
  const [faqAberta, setFaqAberta] = useState<string | null>(null);

  // Ao abrir, a seção da aba ativa já vem expandida.
  React.useEffect(() => {
    if (open) { setSecaoAberta(initialSection ?? null); setArtigoAberto(null); }
  }, [open, initialSection]);

  const termo = busca.trim().toLowerCase();
  const casa = (it: HelpItem) =>
    it.title.toLowerCase().includes(termo) || htmlToText(it.body_html).toLowerCase().includes(termo);

  const resultados = useMemo(
    () => (termo ? [...help.articles, ...help.faqs].filter(casa) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [termo, help],
  );

  // Seções na ordem do portal; "Geral" primeiro; só as que têm artigo.
  const secoes = useMemo(() => {
    const ids: (string | null)[] = [null, ...PORTAL_SECTIONS[portal].map(s => s.id)];
    return ids
      .map(id => ({ id, label: sectionLabel(portal, id), artigos: help.articles.filter(x => x.section === id) }))
      .filter(s => s.artigos.length > 0);
  }, [portal, help.articles]);

  const chaveDe = (it: HelpItem) => it.key ?? it.rowId ?? it.title;
  const nomeOrg = contact?.name || orgs.find(o => o.id === selectedOrgId)?.name || 'a construtora';
  const whatsapp = contact?.phone ? soDigitos(contact.phone) : '';
  const temContato = !!(contact?.email || contact?.phone || contact?.website);

  const Artigo = ({ item }: { item: HelpItem }) => (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setArtigoAberto(null)}
        className={`inline-flex items-center gap-1.5 text-sm font-medium ${a.text} hover:underline`}
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar
      </button>
      <div>
        <div className="text-xs font-semibold text-gray-500">{sectionLabel(portal, item.section)}</div>
        <h3 className="text-base font-bold text-gray-900 mt-0.5">{item.title}</h3>
      </div>
      <div
        className="prose prose-sm max-w-none text-sm text-gray-700 leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_p]:mb-3 [&_li]:mb-1"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.body_html) }}
      />
    </div>
  );

  const LinhaArtigo = ({ item }: { item: HelpItem }) => (
    <button
      type="button"
      onClick={() => setArtigoAberto(item)}
      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left text-sm text-gray-700 hover:bg-gray-50"
    >
      <span className="flex items-center gap-2 min-w-0">
        {item.kind === 'faq' ? <CircleHelp className="w-4 h-4 text-gray-400 shrink-0" /> : <BookOpen className="w-4 h-4 text-gray-400 shrink-0" />}
        <span className="truncate">{item.title}</span>
      </span>
      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
    </button>
  );

  // Sheet mantém os filhos montados quando fechado: os botões das seções
  // (ex.: "Contratos") colidiriam com os da sidebar do portal.
  if (!open) return null;

  return (
    <Sheet open={open} onClose={onClose} size="md">
      <SheetHeader onClose={onClose}>
        <SheetTitle>
          <span className="inline-flex items-center gap-2"><HelpCircle className={`w-5 h-5 ${a.text}`} /> Ajuda</span>
        </SheetTitle>
        <SheetDescription>{PORTAL_LABELS[portal]} · como usar cada seção, perguntas frequentes e contato</SheetDescription>
      </SheetHeader>
      <SheetPanel className="px-6 py-6 space-y-6">
        {orgs.length > 1 && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500">Construtora</label>
            <select
              value={selectedOrgId ?? ''}
              onChange={(e) => e.target.value && selectOrg(e.target.value)}
              className={`w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-4 ${a.ring}`}
            >
              {!selectedOrgId && <option value="">Escolha a construtora</option>}
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        )}

        {erro && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{erro}</p>}

        {artigoAberto ? (
          <Artigo item={artigoAberto} />
        ) : (
          <>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar na ajuda..."
                className={`w-full h-9 pl-9 pr-3 bg-white border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-4 ${a.ring}`}
              />
            </div>

            {loading && <p className="text-sm text-gray-400">Carregando a ajuda da construtora...</p>}

            {termo ? (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-gray-500 px-3">
                  {resultados.length === 0 ? 'Nada encontrado para a busca.' : `${resultados.length} resultado(s)`}
                </div>
                {resultados.map(it => <LinhaArtigo key={chaveDe(it)} item={it} />)}
              </div>
            ) : (
              <>
                {precisaEscolherOrg ? null : (
                  <div className="space-y-2">
                    {secoes.map(s => {
                      const aberta = secaoAberta === s.id;
                      return (
                        <div key={s.id ?? 'geral'} className="border border-gray-100 rounded-xl overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setSecaoAberta(aberta ? undefined : s.id)}
                            className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-gray-800 bg-gray-50 hover:bg-gray-100"
                            aria-expanded={aberta}
                          >
                            <span>{s.label}</span>
                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${aberta ? 'rotate-180' : ''}`} />
                          </button>
                          {aberta && <div className="p-1">{s.artigos.map(it => <LinhaArtigo key={chaveDe(it)} item={it} />)}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {help.faqs.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-gray-900">Perguntas frequentes</h4>
                    <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
                      {help.faqs.map(f => {
                        const k = chaveDe(f);
                        const aberta = faqAberta === k;
                        return (
                          <div key={k}>
                            <button
                              type="button"
                              onClick={() => setFaqAberta(aberta ? null : k)}
                              className="w-full flex items-start justify-between gap-3 px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50"
                              aria-expanded={aberta}
                            >
                              <span>{f.title}</span>
                              <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 mt-0.5 transition-transform ${aberta ? 'rotate-180' : ''}`} />
                            </button>
                            {aberta && (
                              <div
                                className="px-3 pb-3 text-sm text-gray-600 leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_p]:mb-2"
                                dangerouslySetInnerHTML={{ __html: sanitizeHtml(f.body_html) }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-900">Falar com {nomeOrg}</h4>
                  {!temContato && !onOpenRequest && (
                    <p className="text-sm text-gray-500">A construtora ainda não informou um contato aqui. Use os canais do portal.</p>
                  )}
                  <div className="flex flex-col gap-2">
                    {onOpenRequest && (
                      <button
                        type="button"
                        onClick={onOpenRequest}
                        className={`inline-flex items-center justify-center gap-2 h-9 px-4 rounded-[6px] text-sm font-medium text-white ${a.bg}`}
                      >
                        <MessageSquare className="w-4 h-4" />
                        Abrir uma solicitação
                      </button>
                    )}
                    {contact?.email && (
                      <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-2 text-sm text-gray-700 hover:underline">
                        <Mail className="w-4 h-4 text-gray-400" /> {contact.email}
                      </a>
                    )}
                    {contact?.phone && (
                      <span className="inline-flex items-center gap-3 text-sm text-gray-700">
                        <a href={`tel:${whatsapp}`} className="inline-flex items-center gap-2 hover:underline">
                          <Phone className="w-4 h-4 text-gray-400" /> {contact.phone}
                        </a>
                        {whatsapp.length >= 10 && (
                          <a href={`https://wa.me/55${whatsapp.replace(/^55/, '')}`} target="_blank" rel="noreferrer" className={`text-sm font-medium ${a.text} hover:underline`}>
                            WhatsApp
                          </a>
                        )}
                      </span>
                    )}
                    {contact?.website && (
                      <a href={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-gray-700 hover:underline">
                        <Globe className="w-4 h-4 text-gray-400" /> {contact.website}
                      </a>
                    )}
                    {contact?.name && (
                      <span className="inline-flex items-center gap-2 text-sm text-gray-500">
                        <Building2 className="w-4 h-4 text-gray-400" /> {contact.name}
                      </span>
                    )}
                  </div>
                </div>

                {onRestartTour && (
                  <button
                    type="button"
                    onClick={() => { onClose(); onRestartTour(); }}
                    className={`inline-flex items-center gap-2 text-sm font-medium ${a.text} hover:underline`}
                  >
                    <RotateCcw className="w-4 h-4" />
                    Rever o tour do portal
                  </button>
                )}
              </>
            )}
          </>
        )}
      </SheetPanel>
    </Sheet>
  );
};

export default PortalHelp;
