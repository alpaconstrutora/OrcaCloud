import React from 'react';
import { useConfirm } from './confirm';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  side?: 'right' | 'left';
  /**
   * Largura no desktop. No mobile vira bottom sheet (ignora size).
   *
   * ⚠️ **`'full'` é TELA CHEIA** — `sm:max-w-full` ocupa a viewport inteira, e
   * backdrop e cantos arredondados não mudam a leitura. O usuário proibiu tela
   * cheia três vezes (a última em 05/09/2026: "nunca mais use tela cheia se nao
   * for expressamente solicitado"). Só use com pedido EXPRESSO, e escreva o
   * motivo no código. Não vale nem oferecer como opção.
   *
   * Quando a largura de um painel não bastar, a resposta é **tela in-flow** no
   * padrão do próprio módulo (o pai troca o próprio conteúdo, com "voltar" e
   * `h1`), como `ContractDetailView` e `DocxTemplateManager` fazem — não um
   * `Sheet` mais largo. Nenhuma tela do app usa `'full'` hoje.
   *
   * `'4xl'` (896px) é a exceção pedida EXPRESSAMENTE em 11/09/2026 para o
   * seletor de fornecedor em tabela (`SupplierSelect`): tela in-flow não cabe
   * num campo de formulário, e em 672px o Nome cortava. Não é tela cheia
   * (sobra mais da metade da viewport em 1600px). Não use por conveniência.
   * Segundo uso, também aprovado expressamente (29/09/2026): a Nova Medição de
   * contrato (`ContractMeasurementModal`), que saiu de modal central para painel
   * lateral — a tabela de itens tem 7 colunas e, em 672px, a descrição virava
   * uma coluna de uma palavra.
   */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | 'full';
  /**
   * Quando true, pede confirmação antes de fechar (proteção contra perda de dados).
   * Prefira autosave; use isto quando não houver salvamento automático.
   */
  dirty?: boolean;
  /**
   * `modal={false}` (17/09/2026): SEM véu — a página atrás continua clicável e
   * o painel flutua por cima. É o painel de propriedades da Planta Inteligente,
   * que acompanha a seleção no desenho: clicar noutra peça troca o conteúdo,
   * clicar no vazio fecha, arrastar continua funcionando. Esc ainda fecha.
   * Padrão `true`: o Sheet de sempre, com véu.
   */
  modal?: boolean;
  /**
   * `topPx` (17/09/2026): no desktop, o painel começa ABAIXO desta altura (em
   * px da viewport) em vez de encostar no topo. Serve ao painel sem véu que
   * convive com uma barra de ferramentas: sem isto, o painel de propriedades
   * da Planta cobria o acesso rápido do ribbon e os botões que agem sobre a
   * seleção (duplicar, espelhar, isolar) ficavam inalcançáveis justamente
   * quando há seleção. Ignorado no mobile (bottom sheet).
   */
  topPx?: number;
  /**
   * Geometria do painel no desktop (§26 do guia):
   *  - `floating` (padrão): painel solto, 16px de respiro nos 4 lados e cantos
   *    `rounded-[10px]` — mesma escala dos demais containers (§16).
   *  - `flush`: colado nas bordas da tela, sem cantos arredondados. É o desenho
   *    antigo; só use com motivo escrito no código.
   *
   * No mobile não muda nada — continua bottom sheet de largura total
   * (UI_PATTERNS.md §4.3).
   */
  variant?: 'flush' | 'floating';
  /**
   * Camada do painel. Default 50 (`z-50`), como sempre foi. Um Sheet que sai
   * por PORTAL de dentro de um overlay mais alto (`DealModal` é `z-[130]`,
   * `ContractModal` `z-[100]`, os modais do ÒPURA Docs `z-[9999]`) precisa
   * subir acima dele — senão nasce ATRÁS da tela que o abriu (2026-09-12,
   * `ClientSelect` em "Adicionar comprador").
   */
  zIndex?: number;
}

// Aplicado só no desktop (sm+); no mobile o painel é um bottom sheet de largura total.
const sizeClasses: Record<NonNullable<SheetProps['size']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '4xl': 'sm:max-w-4xl',
  full: 'sm:max-w-full',
};

/**
 * Painel lateral (desktop) / bottom sheet (mobile). Use para ver/editar/criar itens
 * de lista e gerenciar configurações, sem perder o contexto da tela. Ver UI_PATTERNS.md.
 */
/**
 * Pilha dos `Sheet`s abertos, do mais antigo ao mais recente. `Escape` fecha
 * SÓ o do topo: um seletor em drawer (`ClientSelect`) aberto por cima de um
 * formulário em `Sheet` não pode derrubar os dois com uma tecla — antes,
 * cada Sheet ouvia `keydown` em `document` por conta própria e todos fechavam.
 */
const pilhaAbertos: symbol[] = [];

/** O `id` do `SheetTitle` da gaveta mais próxima — é o nome acessível do painel. */
const SheetTitleIdContext = React.createContext<string | undefined>(undefined);

/** O que recebe Tab dentro do painel (para prender o foco nele). */
const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({ open, onClose, children, side = 'right', size = 'xl', dirty = false, variant = 'floating', zIndex = 50, modal = true, topPx }: SheetProps) {
  const confirm = useConfirm();
  const id = React.useRef(Symbol('sheet')).current;
  const requestClose = React.useCallback(async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Sair sem salvar?',
        message: 'Há alterações não salvas. Se sair agora, elas serão perdidas.',
        variant: 'warning',
        confirmLabel: 'Sair e descartar',
        cancelLabel: 'Continuar editando',
      });
      if (!ok) return;
    }
    onClose();
  }, [dirty, onClose, confirm]);

  // A pilha segue a ORDEM DE ABERTURA, e só ela: o efeito não pode depender de
  // `requestClose`. Quase todo chamador passa `onClose={() => set...(false)}`
  // inline — identidade nova a cada render —, e cada render tirava e repunha o
  // Sheet no TOPO. Com um seletor aberto por cima do formulário, bastava o pai
  // re-renderizar (cadastrar um sistema predial no seletor, 15/10/2026) para o
  // formulário voltar ao topo, e o Esc fechava a gaveta de baixo com o seletor
  // ainda aberto. A versão atual do fechamento vem pela ref.
  const requestCloseRef = React.useRef(requestClose);
  requestCloseRef.current = requestClose;

  const titleId = React.useId();
  const painelRef = React.useRef<HTMLDivElement>(null);

  // Foco (27/10/2026, crítica da Central de Clientes): abrir pelo teclado
  // deixava o foco na linha de TRÁS da gaveta — o leitor de tela nem sabia que
  // ela abriu — e fechar o largava no <body>. Só no modal: o painel sem véu
  // (propriedades da Planta) acompanha a seleção e não pode roubar o foco do desenho.
  React.useEffect(() => {
    if (!open || !modal) return;
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const painel = painelRef.current;
    if (painel && !painel.contains(document.activeElement)) painel.focus({ preventScroll: true });
    return () => {
      // Fechado, o painel vira `inert` e o navegador solta o foco no <body>:
      // devolve a quem abriu — a menos que o usuário já esteja noutro lugar.
      const agora = document.activeElement;
      const solto = !agora || agora === document.body || (painel?.contains(agora) ?? false);
      if (anterior?.isConnected && solto) anterior.focus({ preventScroll: true });
    };
  }, [open, modal]);

  React.useEffect(() => {
    if (!open) return;
    pilhaAbertos.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pilhaAbertos[pilhaAbertos.length - 1] === id) requestCloseRef.current();
      // Tab não sai do painel modal. Só age com o foco DENTRO dele: um confirm
      // ou um menu em portal aberto por cima continua com o próprio Tab.
      if (e.key === 'Tab' && modal && pilhaAbertos[pilhaAbertos.length - 1] === id) {
        const painel = painelRef.current;
        if (!painel || !painel.contains(document.activeElement)) return;
        // Filtro por ATRIBUTO, não por layout: no jsdom `getClientRects()` é
        // sempre vazio, a lista zerava e o Tab era engolido — o campo nunca
        // perdia o foco e o valor digitado não era gravado (BlueprintEditor).
        const itens = [...painel.querySelectorAll<HTMLElement>(FOCAVEIS)].filter(el => !el.closest('[hidden], [inert], [aria-hidden="true"]'));
        if (itens.length === 0) return;
        const primeiro = itens[0];
        const ultimo = itens[itens.length - 1];
        if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === painel)) {
          e.preventDefault(); ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault(); primeiro.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = pilhaAbertos.lastIndexOf(id);
      if (i >= 0) pilhaAbertos.splice(i, 1);
    };
  }, [open, id, modal]);

  const floating = variant === 'floating';

  // `size="full"` + `variant="floating"`: `sm:max-w-full` dá 100% da viewport,
  // mas o painel é ancorado em `sm:right-4` — a largura cheia empurrava 32px
  // (os dois respiros da §26) para FORA da tela, à esquerda. Medido em
  // 2026-09-05: viewport 1600, painel 1600 com left = -16. Só o `full` precisa
  // do desconto; os tamanhos nomeados já são menores que a viewport. No
  // `flush` não há respiro para descontar.
  const larguraMaxima = size === 'full' && floating
    ? 'sm:max-w-[calc(100%-2rem)]'
    : sizeClasses[size];

  // Fechado, o painel sai pela lateral. No modo flutuante o deslocamento tem de
  // somar o respiro da borda (`sm:right-4`): com `translate-x-full` puro ele
  // anda só a própria largura e deixa uma fatia de 16px à mostra na tela.
  const closedX = side === 'right'
    ? (floating ? 'sm:translate-x-[calc(100%_+_2rem)]' : 'sm:translate-x-full')
    : (floating ? 'sm:-translate-x-[calc(100%_+_2rem)]' : 'sm:-translate-x-full');
  const closedTransform = `translate-y-full sm:translate-y-0 ${closedX}`;

  return (
    <SheetTitleIdContext.Provider value={titleId}>
    {/* Fechada, a gaveta continua montada (para deslizar) mas sai do Tab e da
        árvore de acessibilidade: antes cada Sheet fechado era um `dialog
        aria-modal` permanente, com o X e os campos ainda recebendo Tab. */}
    <div
      style={{ zIndex }}
      className={`fixed inset-0 transition-all duration-200 ${open && modal ? 'pointer-events-auto' : 'pointer-events-none'}`}
      inert={!open}
      aria-hidden={open ? undefined : true}
    >
      {/* Backdrop — só no modal. Sem véu, o que está atrás continua vivo. */}
      {modal && (
        <div
          className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
          onClick={requestClose}
        />
      )}

      {/* Painel: bottom sheet no mobile, lateral no desktop. O topo no desktop
          sai de uma variável CSS para `topPx` valer só a partir de `sm:`. */}
      <div
        ref={painelRef}
        role="dialog"
        aria-modal={modal ? 'true' : undefined}
        aria-labelledby={titleId}
        tabIndex={-1}
        style={topPx != null ? ({ '--sheet-top': `${Math.max(0, topPx) + (floating ? 16 : 0)}px` } as React.CSSProperties) : undefined}
        className={[
          'outline-none',
          // A sombra só existe ABERTO. Fechado o painel só é empurrado para fora da tela
          // (translate), e o desfoque de `shadow-2xl` (50px) vazava ~20px para DENTRO da
          // tela, por cima da barra de rolagem do <main> — e cada Sheet montado fechado
          // somava a sua (19/10/2026). A transição cobre `box-shadow` para ela sumir
          // junto com o deslizar de saída, em vez de estalar.
          'fixed bg-white flex flex-col transition-[transform,box-shadow] duration-300 ease-in-out',
          open ? 'shadow-2xl' : 'shadow-none',
          // Sem véu o painel precisa reativar o ponteiro por conta própria.
          modal ? '' : 'pointer-events-auto',
          // mobile: bottom sheet
          'inset-x-0 bottom-0 max-h-[90vh] rounded-t-2xl',
          // desktop: painel lateral
          'sm:inset-x-auto sm:max-h-none sm:w-full sm:min-w-[420px]',
          // `overflow-hidden` é o que faz o header cinza e o rodapé respeitarem
          // o raio — sem ele os cantos do painel voltam a ficar quadrados.
          floating
            ? 'sm:top-[var(--sheet-top,1rem)] sm:bottom-4 sm:rounded-[10px] sm:overflow-hidden'
            : 'sm:top-[var(--sheet-top,0px)] sm:bottom-0 sm:rounded-none',
          larguraMaxima,
          side === 'right'
            ? (floating ? 'sm:right-4' : 'sm:right-0')
            : (floating ? 'sm:left-4' : 'sm:left-0'),
          open ? 'translate-y-0 sm:translate-x-0' : closedTransform,
        ].join(' ')}
      >
        {/* Handle do bottom sheet (só mobile) */}
        <div className="flex justify-center pt-3 pb-1 shrink-0 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>
        {children}
      </div>
    </div>
    </SheetTitleIdContext.Provider>
  );
}

export function SheetHeader({
  children,
  onClose,
  className = '',
}: {
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  return (
    <div className={`px-6 py-5 border-b border-gray-100 bg-gray-50/60 shrink-0 flex items-start gap-3 ${className}`}>
      <div className="flex-1 min-w-0">{children}</div>
      {/* "Fechar painel", não "Fechar": muitas gavetas têm um botão "Fechar"
          no rodapé, e dois botões com o mesmo nome confundem quem navega por nome. */}
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Fechar painel" title="Fechar painel"
          className="p-2 -m-1 hover:bg-gray-100 rounded-xl transition-all shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function SheetTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const id = React.useContext(SheetTitleIdContext);
  return <h2 id={id} className={`text-lg font-bold text-gray-900 leading-tight ${className}`}>{children}</h2>;
}

export function SheetDescription({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-sm text-gray-500 mt-0.5 ${className}`}>{children}</p>;
}

export function SheetPanel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex-1 overflow-y-auto ${className}`}>
      {children}
    </div>
  );
}

export function SheetFooter({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2 shrink-0 ${className}`}>
      {children}
    </div>
  );
}
