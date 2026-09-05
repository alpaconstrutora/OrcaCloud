import {
  FORMA_ESTRUTURAL,
  medirAgua,
  medirEscada,
  medirEstrutura,
  nomeDoTipoDeAbertura,
  nomeDoTipoEstrutural,
  prefixoDeRotulo,
  wallLength,
  type Agua,
  type BlueprintModel,
  type Escada,
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
  /** Opcional pela razão do `aguaIds` dos comandos: as chamadas existentes não sabem dela. */
  aguas: Agua[] = [],
  /** Opcional pela mesma razão. Precisa do MODELO porque o número de degraus vem do desnível. */
  escadas: { model: BlueprintModel; itens: Escada[] } | null = null,
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
        // A composição entra no rótulo porque duas paredes de 19 cm podem ser
        // coisas diferentes — bloco com reboco, ou concreto —, e a lista de
        // componentes é onde se escolhe qual delas editar.
        (w.camadas?.length
          ? ` · ${w.camadas.length} ${w.camadas.length === 1 ? 'camada' : 'camadas'}`
          : '') +
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

  // A ÁGUA se identifica pela área REAL — é o número da compra, e é o que
  // separa duas águas do mesmo contorno em planta com inclinações diferentes.
  const linhasDeAgua: LinhaDeComponente[] = aguas.map((r) => {
    const med = medirAgua(r);
    return {
      id: r.id,
      chave: 'telhado',
      rotulo: `Água ${numero('telhado')}`,
      medida: `${med.areaRealM2.toFixed(2).replace('.', ',')} m² de telha`,
      detalhe:
        `${r.inclinacaoPct}% · ${med.areaProjetadaM2.toFixed(2).replace('.', ',')} m² em planta` +
        (r.baseMm !== 0 ? ` · beiral a ${m(r.baseMm)} m` : ''),
    };
  });

  // A ESCADA se identifica pelo que ela resolve — "17 degraus de 172 mm" — e
  // não pela área: duas escadas de mesma pegada com desníveis diferentes são
  // peças diferentes, e é o degrau que o olho confere contra a prancha.
  const linhasDeEscada: LinhaDeComponente[] = (escadas?.itens ?? []).map((e) => {
    const med = medirEscada(escadas!.model, e);
    const rampa = e.tipo === 'RAMPA';
    return {
      id: e.id,
      chave: e.tipo,
      rotulo: e.rotulo || `${rampa ? 'Rampa' : 'Escada'} ${numero(e.tipo)}`,
      medida: rampa
        ? `${med.inclinacaoPct.toFixed(1).replace('.', ',')}% em ${m(med.comprimentoMm)} m`
        : `${med.degraus} degraus de ${Math.round(med.espelhoMm)} mm`,
      detalhe:
        `${m(e.larguraMm)} m de largura · vence ${m(med.desnivelMm)} m` +
        (med.nivelDeChegada ? ` até ${med.nivelDeChegada.name}` : ''),
    };
  });

  return [
    ...linhasDeParede,
    ...linhasDeAbertura,
    ...linhasDeEstrutura,
    ...linhasDeAgua,
    ...linhasDeEscada,
  ];
}

/** O inventário de UM pavimento, já com o nome dele. */
export interface BlocoDeNivel {
  levelId: string;
  /** `level.name` — o subcabeçalho da lista. */
  nome: string;
  linhas: LinhaDeComponente[];
}

/**
 * O inventário dos pavimentos VISÍVEIS — o que a seção "Componentes" mostra na
 * vista 3D (pedido de 01/09/2026).
 *
 * ─── POR QUE NÃO DAVA PARA USAR `linhasDeComponentes` DIRETO ────────────────
 *
 * Na planta baixa existe UM pavimento ativo, e o editor recorta o modelo por
 * ele antes de chamar a função acima. No 3D não: a cena EMPILHA todos os
 * pavimentos marcados, e a lista precisa cobrir os mesmos que o desenho mostra
 * — senão a parede do 2º piso aparece na tela sem nenhuma linha que a esconda.
 *
 * ─── POR QUE UM BLOCO POR NÍVEL, E NÃO UMA LISTA CORRIDA ────────────────────
 *
 * Porque a numeração é o que identifica a peça, e ela é POR PAVIMENTO. Jogar os
 * dois níveis numa chamada só faria a "Parede 1" do 2º piso virar "Parede 12" —
 * um nome que a planta baixa daquele pavimento nunca mostra, e que obrigaria
 * quem confere a traduzir duas numerações. Chamando `linhasDeComponentes` uma
 * vez por bloco, cada pavimento reinicia a contagem e a lista bate com o que o
 * usuário vê ao editar aquele piso.
 *
 * Efeito colateral desejado do mesmo recorte: a esquadria nunca cai no rótulo
 * `'parede de outro pavimento'`, porque a parede hospedeira está sempre no
 * mesmo bloco que ela.
 *
 * `levelIds` omitido = todos os níveis (a mesma convenção que `projetarElevacao`
 * e o viewer 3D já usam para `undefined`).
 */
export function linhasDeComponentesPorNivel(
  model: BlueprintModel,
  levelIds?: string[],
): BlocoDeNivel[] {
  return (
    model.levels
      .filter((l) => !levelIds || levelIds.includes(l.id))
      // Do mais ALTO para o mais baixo — a mesma ordem de `PainelPavimentos`, que
      // é a ordem em que a cobertura fica no topo da lista e do desenho. Cópia
      // rasa antes do `sort`: `model.levels` é do kernel e não se reordena aqui.
      .slice()
      .sort((a, b) => b.elevationMm - a.elevationMm)
      .map((level) => {
        // O mesmo recorte de `componentesDoNivel` no editor: a abertura não
        // guarda `levelId` — ela mora numa parede, e é a parede que diz de que
        // pavimento ela é.
        const paredes = model.walls.filter((w) => w.levelId === level.id);
        const idsDeParede = new Set(paredes.map((w) => w.id));
        const aberturas = model.openings.filter((o) => idsDeParede.has(o.wallId));
        const estruturas = (model.structures ?? []).filter((s) => s.levelId === level.id);
        const aguas = (model.roofs ?? []).filter((r) => r.levelId === level.id);
        const escadas = (model.stairs ?? []).filter((e) => e.levelId === level.id);
        return {
          levelId: level.id,
          nome: level.name,
          linhas: linhasDeComponentes(paredes, aberturas, estruturas, aguas, {
            model,
            itens: escadas,
          }),
        };
      })
      // Pavimento vazio não vira bloco: um "Cobertura" sem nenhuma linha embaixo
      // seria um subcabeçalho anunciando nada. Mesma regra do grupo vazio no
      // painel.
      .filter((b) => b.linhas.length > 0)
  );
}
