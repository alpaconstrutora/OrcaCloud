import {
  FORMA_ESTRUTURAL,
  medirEstrutura,
  nomeDoTipoDeAbertura,
  nomeDoTipoEstrutural,
  prefixoDeRotulo,
  wallLength,
  type Opening,
  type Structural,
  type Wall,
} from './blueprintKernel';

/**
 * O INVENTÁRIO do desenho — a lista do que já foi construído, para o painel
 * "Componentes" (o gerenciador).
 *
 * ─── POR QUE FICA FORA DO COMPONENTE ────────────────────────────────────────
 *
 * `MenuComponentes` OFERECE o que dá para colocar; este arquivo diz o que ESTÁ
 * colocado. Toda a parte difícil disso é pura — numerar sem nome próprio,
 * escolher a medida que identifica cada família, dizer em que parede a esquadria
 * mora — e pegar uma peça no editor exige clique no canvas, que é opaco em
 * jsdom. Extraído, o inventário é testável sem simular um clique que jsdom não
 * sabe dar. É a mesma razão que já tirou `PainelParedeSelecionada` de dentro do
 * editor.
 *
 * ─── A CHAVE É A MESMA DO MENU ──────────────────────────────────────────────
 *
 * `chave` casa com o catálogo de `MenuComponentes` (`fichaDoComponente`), que é
 * quem tem o ícone e o grupo. Duas tabelas de nome/ícone para as mesmas treze
 * peças divergiriam no primeiro componente novo — foi para não repetir isso que
 * o catálogo virou export de lá em vez de ser copiado para cá.
 */

/** Uma linha do inventário. Sem JSX: quem renderiza resolve ícone e grupo. */
export interface LinhaDeComponente {
  id: string;
  /** `'parede'` | `Opening['kind']` | `StructuralKind` — a chave do catálogo. */
  chave: string;
  /** Como a peça se chama na lista. Numerado quando não tem nome próprio. */
  rotulo: string;
  /** A medida que identifica a peça de relance (comprimento, vão, seção). */
  medida: string;
  /** Segunda linha, quando há o que acrescentar. `null` = não mostrar. */
  detalhe: string | null;
}

/** Metro com vírgula, como o resto do editor escreve. */
function m(mm: number, casas = 2): string {
  return (mm / 1000).toFixed(casas).replace('.', ',');
}

/** Centímetro inteiro — a unidade em que se fala de espessura e de seção. */
function cm(mm: number): string {
  return String(Math.round(mm / 10));
}

/**
 * Numerador por família.
 *
 * Parede, porta e pilar não têm nome próprio no modelo (só a peça estrutural
 * tem `rotulo`, e ele é opcional). Sem número, a lista de uma planta real vira
 * quarenta linhas escritas "Parede", e clicar em cada uma para descobrir qual é
 * qual é justamente o trabalho que o gerenciador existe para poupar.
 *
 * A contagem é POR TIPO — "Porta 1, Porta 2, Janela 1" —, não uma sequência
 * global: quem lê a lista procura "a terceira janela", não "a décima nona
 * abertura".
 */
function contador() {
  const visto = new Map<string, number>();
  return (chave: string) => {
    const n = (visto.get(chave) ?? 0) + 1;
    visto.set(chave, n);
    return n;
  };
}

/**
 * O inventário de um pavimento, na ordem em que as peças foram criadas dentro
 * de cada família.
 *
 * As três listas chegam JÁ RECORTADAS para o nível — a abertura não guarda
 * `levelId` (ela mora numa parede), então quem recorta precisa do modelo
 * inteiro, e essa é decisão do editor, não daqui.
 */
export function linhasDeComponentes(
  paredes: Wall[],
  aberturas: Opening[],
  estruturas: Structural[],
): LinhaDeComponente[] {
  const numero = contador();

  const rotuloDaParede = new Map<string, string>();
  const linhasDeParede: LinhaDeComponente[] = paredes.map((w) => {
    const rotulo = `Parede ${numero('parede')}`;
    rotuloDaParede.set(w.id, rotulo);
    const quantasAberturas = aberturas.filter((o) => o.wallId === w.id).length;
    return {
      id: w.id,
      chave: 'parede',
      rotulo,
      medida: `${m(wallLength(w))} m`,
      detalhe:
        `${cm(w.thicknessMm)} cm de espessura` +
        (quantasAberturas > 0
          ? ` · ${quantasAberturas} ${quantasAberturas === 1 ? 'esquadria' : 'esquadrias'}`
          : ''),
    };
  });

  const linhasDeAbertura: LinhaDeComponente[] = aberturas.map((o) => ({
    id: o.id,
    chave: o.kind,
    rotulo: `${nomeDoTipoDeAbertura(o.kind)} ${numero(o.kind)}`,
    medida: `${m(o.widthMm)} × ${m(o.heightMm)} m`,
    // A parede hospedeira é o que localiza a esquadria: sem ela, "Janela 4" não
    // diz onde está, e o clique na lista vira tentativa e erro.
    detalhe:
      (rotuloDaParede.get(o.wallId) ?? 'parede de outro pavimento') +
      (o.sillMm > 0 ? ` · peitoril ${cm(o.sillMm)} cm` : ''),
  }));

  const linhasDeEstrutura: LinhaDeComponente[] = estruturas.map((s) => {
    const forma = FORMA_ESTRUTURAL[s.kind];
    const medida = medirEstrutura(s);
    // O rótulo do calculista (P1, V3) manda quando existe: é por ele que a peça
    // é chamada na prancha, e substituí-lo por "Pilar 7" obrigaria a conferência
    // a traduzir duas numerações.
    const sufixo = `${prefixoDeRotulo(s.kind)}${numero(prefixoDeRotulo(s.kind))}`;
    const nome = s.rotulo?.trim() || sufixo;
    return {
      id: s.id,
      chave: s.kind,
      rotulo: `${nome} · ${nomeDoTipoEstrutural(s.kind)}`,
      medida:
        forma === 'AREA'
          ? `${(medida.areaPlantaMm2 / 1_000_000).toFixed(2).replace('.', ',')} m²`
          : forma === 'LINHA'
            ? `${m(medida.comprimentoMm)} m`
            : s.circular
              ? `Ø ${cm(s.larguraMm)} cm`
              : `${cm(s.larguraMm)} × ${cm(s.profundidadeMm)} cm`,
      detalhe:
        (forma === 'AREA'
          ? `${cm(s.alturaMm)} cm de espessura`
          : `${cm(s.alturaMm)} cm de altura`) +
        // A cota só aparece quando não é o piso do pavimento: em fundação ela é
        // o que distingue a peça, e no resto do desenho seria "0,00 m" repetido
        // em toda linha.
        (s.baseMm !== 0 ? ` · cota ${m(s.baseMm)} m` : ''),
    };
  });

  return [...linhasDeParede, ...linhasDeAbertura, ...linhasDeEstrutura];
}
