import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PortalChecklist } from './PortalChecklist';
import { ouvirAcoesDoPortal } from '../../utils/portalEventos';
import { PortalTour } from './PortalTour';
import { chaveDoTour, esquecerTour, marcarTourVisto, tourVisto } from '../../utils/portalTour';
import { ArrowLeft, ChevronDown, ChevronRight, HelpCircle, Mail, MessageSquare, Phone, Globe, Search, BookOpen, CircleHelp, Building2, RotateCcw, ListChecks } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';
import { usePersistedState } from '../ui/TableUtils';
import { usePortalHelp } from '../../hooks/usePortalHelp';
import { portalHelpService } from '../../services/portalHelpService';
import { sanitizeHtml } from '../../utils/sanitizeHtml';
import {
  htmlToText, sectionLabel, PORTAL_SECTIONS, PORTAL_LABELS,
  type HelpItem, type MergedTourStep, type Portal, type TourId,
} from '../../utils/portalHelpDefaults';

const SEM_PASSOS: readonly MergedTourStep[] = [];

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
  /** aba ativa do portal — abre a central nessa seção e guia o tour */
  currentSection?: string | null;
  /** troca de aba pedida pelo tour; o portal fecha detalhe aberto antes */
  onNavigate?: (section: string) => void;
  /** abre este tour ao montar, ignorando "já viu" (prévia do gestor) */
  forcarTour?: TourId | null;
  /** prévia do gestor: tour disponível sem `tourKey` e nada é gravado */
  modoPrevia?: boolean;
  /**
   * Onde o portal quer o cartão "Primeiros passos" (F8): um elemento vazio que
   * ele põe no topo da primeira aba visível. Sem a prop, não há cartão.
   */
  checklistSlot?: HTMLElement | null;
  /** só o Parceiro tem solicitações; sem a prop o botão não aparece */
  onOpenRequest?: () => void;
  /**
   * Identidade para o "já viu o tour" (token do link ou e-mail). Sem a prop não
   * há tour: nem automático, nem "Rever o tour".
   */
  tourKey?: string | null;
  /** abre o tour sozinho no primeiro acesso deste aparelho (false na prévia) */
  autoTour?: boolean;
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
  open, onClose, portal, token, orgId, visibleSections, currentSection, onNavigate, onOpenRequest,
  tourKey, autoTour = false, forcarTour = null, modoPrevia = false, accent = 'orange', checklistSlot = null,
}) => {
  const a = ACCENT[accent];
  const podeTour = !!tourKey || modoPrevia;
  const viuNesteAparelho = (t: TourId) => !tourKey || tourVisto(chaveDoTour(portal, tourKey, t));
  // Com identidade e fora da prévia, a ajuda é lida já na montagem: é ela que
  // traz o "já viu" gravado no banco (`seen`) — o tour não repete em outro
  // aparelho. A prévia abre o tour que o gestor pediu.
  const vigiaJaViu = autoTour && !modoPrevia && !!tourKey;
  const [tourAtivo, setTourAtivo] = useState<TourId | null>(() => forcarTour ?? null);
  useEffect(() => { if (forcarTour) setTourAtivo(forcarTour); }, [forcarTour]);
  const {
    loading, erro, help, contact, orgs, selectedOrgId, selectOrg, precisaEscolherOrg, seen, carregado, registrarVisto,
  } = usePortalHelp(portal, {
    token, orgId, visibleSections, enabled: open || !!tourAtivo || vigiaJaViu,
  });
  // Visto = marca deste aparelho OU do banco (qualquer um dos dois).
  const jaViu = (t: TourId) => viuNesteAparelho(t) || seen.some(x => x.tour_id === t);

  // Tour do portal no primeiro acesso: decide UMA vez, depois da 1ª leitura.
  // Se a leitura falhar, `seen` fica vazio e vale só a marca do aparelho.
  const decidiuPrimeiroAcesso = useRef(false);
  useEffect(() => {
    if (decidiuPrimeiroAcesso.current || !vigiaJaViu || !carregado) return;
    decidiuPrimeiroAcesso.current = true;
    if (!jaViu('geral')) setTourAtivo(atual => atual ?? 'geral');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregado, vigiaJaViu]);
  // Aba de onde o tour saiu. Acompanha a aba atual ATÉ o tour navegar pela
  // primeira vez — assim absorve a correção de aba que alguns portais fazem ao
  // montar (o Corretor nasce numa aba e pula para a primeira liberada). No fim,
  // o tour volta para ela; essa volta não é "o usuário abriu a aba" e não pode
  // disparar mini-tour (`voltaDoTour`).
  // ── Primeiros passos (F8) ──────────────────────────────────────────────
  // Marca só quem tem identidade e não está em prévia; a prévia mostra o
  // cartão para o gestor ver, sem gravar nada.
  const gravaChecklist = !!tourKey && !modoPrevia;
  const idDoItem = (key: string) => `checklist:${key}`;
  // Feito = marca deste aparelho OU do banco. Não usa `jaViu`: sem identidade
  // (prévia) aquele responde "visto" para tudo — certo para o tour não abrir
  // sozinho, errado aqui (o gestor veria o cartão já completo, ou seja, nada).
  const itemFeito = (key: string) =>
    (!!tourKey && tourVisto(chaveDoTour(portal, tourKey, idDoItem(key)))) || seen.some(x => x.tour_id === idDoItem(key));
  const checklistFeitos = useMemo(
    () => new Set(help.checklist.filter(i => itemFeito(i.key)).map(i => i.key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [help.checklist, seen, tourKey],
  );
  const checklistOculto = (!!tourKey && tourVisto(chaveDoTour(portal, tourKey, 'checklist')))
    || seen.some(x => x.tour_id === 'checklist' && x.status === 'pulado');
  const gravarMarca = (tourId: string, status: 'concluido' | 'pulado' | 'visto', passo: number | null) => {
    registrarVisto(tourId, status);
    portalHelpService
      .markTour(portal, { token, orgId: selectedOrgId ?? orgId ?? null }, tourId, status, passo)
      .catch(e => console.warn('[portalHelp] não gravou no banco:', e));
  };
  const concluirItem = (key: string) => {
    if (!gravaChecklist || !tourKey || checklistFeitos.has(key)) return;
    marcarTourVisto(chaveDoTour(portal, tourKey, idDoItem(key)), 'concluido');
    gravarMarca(idDoItem(key), 'concluido', null);
  };
  const concluirPorEvento = (evento: string) => {
    help.checklist.filter(i => i.evento === evento).forEach(i => concluirItem(i.key));
  };
  const concluirPorEventoRef = useRef(concluirPorEvento);
  concluirPorEventoRef.current = concluirPorEvento;
  // abrir a aba (o próprio usuário — não a navegação automática do tour)
  useEffect(() => {
    if (!currentSection || !carregado || tourAtivo) return;
    concluirPorEventoRef.current(`aba:${currentSection}`);
  }, [currentSection, carregado, tourAtivo]);
  // ações avisadas pelos portais (utils/portalEventos.ts)
  useEffect(() => ouvirAcoesDoPortal(acao => concluirPorEventoRef.current(`acao:${acao}`)), []);
  const ocultarChecklist = () => {
    if (!gravaChecklist || !tourKey) return;
    marcarTourVisto(chaveDoTour(portal, tourKey, 'checklist'), 'pulado');
    gravarMarca('checklist', 'pulado', null);
  };
  const mostrarChecklistDeNovo = () => {
    if (!tourKey) return;
    esquecerTour(chaveDoTour(portal, tourKey, 'checklist'));
    if (gravaChecklist) gravarMarca('checklist', 'visto', null);
  };
  const temChecklist = help.checklist.length > 0 && (gravaChecklist || modoPrevia);
  const cartaoChecklist = checklistSlot && temChecklist && !checklistOculto
    ? createPortal(
      <PortalChecklist
        portal={portal}
        itens={help.checklist}
        feitos={checklistFeitos}
        onIr={onNavigate}
        onOcultar={gravaChecklist ? ocultarChecklist : undefined}
        accent={accent}
      />,
      checklistSlot,
    )
    : null;

  const fimDoTour = useRef(0);
  const secaoDeOrigem = useRef<string | null>(currentSection ?? null);
  const tourNavegou = useRef(false);
  const voltaDoTour = useRef<string | null>(null);
  if (tourAtivo && !tourNavegou.current) secaoDeOrigem.current = currentSection ?? null;
  const navegarPeloTour = useMemo(() => onNavigate && ((s: string) => {
    tourNavegou.current = true;
    onNavigate(s);
  }), [onNavigate]);
  const encerrarTour = (motivo: 'concluido' | 'pulado', passoAlcancado = 0) => {
    if (tourAtivo && tourKey && !modoPrevia) {
      marcarTourVisto(chaveDoTour(portal, tourKey, tourAtivo), motivo);
      // Tour que nem apareceu (nenhum elemento na tela) não vai para o banco:
      // no acompanhamento "pulou" tem que querer dizer que a pessoa pulou.
      if (passoAlcancado > 0) {
        registrarVisto(tourAtivo, motivo);
        portalHelpService
          .markTour(portal, { token, orgId: selectedOrgId ?? orgId ?? null }, tourAtivo, motivo, passoAlcancado)
          .catch(e => console.warn('[portalHelp] não gravou o "já viu" no banco:', e));
      }
    }
    const origem = secaoDeOrigem.current;
    if (tourNavegou.current && origem && onNavigate && currentSection !== origem) {
      voltaDoTour.current = origem;
      onNavigate(origem);
    }
    tourNavegou.current = false;
    fimDoTour.current = Date.now();
    setTourAtivo(null);
  };

  // Mini-tour "como usar esta tela": na PRIMEIRA visita a uma aba, depois que o
  // tour do portal já foi visto. Só na troca de aba (o valor inicial não conta)
  // e nunca na volta automática do fim de outro tour para a aba de origem.
  const ultimaSecao = useRef(currentSection);
  useEffect(() => {
    const anterior = ultimaSecao.current;
    ultimaSecao.current = currentSection;
    if (!currentSection || currentSection === anterior) return;
    if (!autoTour || modoPrevia || !tourKey || tourAtivo) return;
    if (voltaDoTour.current) {
      const eraAVolta = voltaDoTour.current === currentSection && Date.now() - fimDoTour.current < 1500;
      voltaDoTour.current = null;
      if (eraAVolta) return;
    }
    if (!jaViu('geral') || jaViu(currentSection)) return;
    if (!help.tours[currentSection]?.length) return;
    const aba = currentSection;
    const t = setTimeout(() => setTourAtivo(atual => atual ?? aba), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSection]);

  const [busca, setBusca] = usePersistedState<string>(`portalHelp:${portal}:busca`, '');
  const [artigoAberto, setArtigoAberto] = useState<HelpItem | null>(null);
  const [secaoAberta, setSecaoAberta] = useState<string | null | undefined>(undefined);
  const [faqAberta, setFaqAberta] = useState<string | null>(null);

  // Ao abrir, a seção da aba ativa já vem expandida.
  React.useEffect(() => {
    if (open) { setSecaoAberta(currentSection ?? null); setArtigoAberto(null); }
  }, [open, currentSection]);

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
  if (!open && !tourAtivo) return cartaoChecklist;

  const tourDestaTela = currentSection && help.tours[currentSection]?.length ? currentSection : null;

  return (
    <>
    {cartaoChecklist}
    {tourAtivo && !loading && (
      <PortalTour
        key={tourAtivo}
        steps={help.tours[tourAtivo] ?? SEM_PASSOS}
        accent={accent}
        currentSection={currentSection}
        onNavigate={navegarPeloTour}
        onFinish={encerrarTour}
      />
    )}
    {open && (
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

                {podeTour && (help.tours.geral?.length > 0 || tourDestaTela) && (
                  <div className="flex flex-col items-start gap-2">
                    {tourDestaTela && (
                      <button
                        type="button"
                        onClick={() => { onClose(); setTourAtivo(tourDestaTela); }}
                        className={`inline-flex items-center gap-2 text-sm font-medium ${a.text} hover:underline`}
                      >
                        <RotateCcw className="w-4 h-4" />
                        Rever o tour desta tela ({sectionLabel(portal, tourDestaTela)})
                      </button>
                    )}
                    {help.tours.geral?.length > 0 && (
                      <button
                        type="button"
                        onClick={() => { onClose(); setTourAtivo('geral'); }}
                        className={`inline-flex items-center gap-2 text-sm font-medium ${a.text} hover:underline`}
                      >
                        <RotateCcw className="w-4 h-4" />
                        Rever o tour do portal
                      </button>
                    )}
                  </div>
                )}
                {temChecklist && checklistOculto && gravaChecklist && (
                  <button
                    type="button"
                    onClick={mostrarChecklistDeNovo}
                    className={`inline-flex items-center gap-2 text-sm font-medium ${a.text} hover:underline`}
                  >
                    <ListChecks className="w-4 h-4" />
                    Mostrar os primeiros passos de novo ({checklistFeitos.size} de {help.checklist.length} feitos)
                  </button>
                )}
              </>
            )}
          </>
        )}
      </SheetPanel>
    </Sheet>
    )}
    </>
  );
};

export default PortalHelp;
