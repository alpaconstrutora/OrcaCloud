/**
 * RF-127 — exportar IFC parcial SOMENTE com declaração de cobertura semântica.
 *
 * ─── A CONDIÇÃO É O REQUISITO ───────────────────────────────────────────────
 *
 * O PRD não pede "exportar IFC". Pede IFC parcial *somente com* declaração de
 * cobertura. A diferença é tudo: um IFC é lido como modelo de informação, e o
 * que ele NÃO contém é indistinguível do que não existe. Se este arquivo sai sem
 * portas, quem recebe conclui que a planta não tem portas — e ela tem.
 *
 * Por isso a cobertura não é um comentário no código: ela vai DENTRO do arquivo,
 * no cabeçalho STEP e num `IfcProject.Description`, onde qualquer visualizador
 * mostra. Exportar sem ela não é uma versão simplificada — é um arquivo que
 * mente.
 *
 * ─── O QUE ESTE EXPORTADOR É, E O QUE NÃO É ─────────────────────────────────
 *
 * É uma ponte de COORDENAÇÃO: leva paredes e ambientes para quem vai federar com
 * estrutura ou instalações e precisa da geometria no lugar certo.
 *
 * NÃO é um modelo BIM. Não há material, não há tipo, não há abertura como
 * elemento, não há propriedade além da área. Chamar isto de "exportação BIM" na
 * interface seria vender o que não existe, e o texto da tela evita a expressão.
 *
 * ─── IFC4 EM STEP, ESCRITO À MÃO ────────────────────────────────────────────
 *
 * Sem biblioteca: as dependências de IFC em JavaScript são grandes, e o
 * subconjunto necessário aqui — projeto, terreno, edifício, pavimento, parede,
 * ambiente — cabe em algumas centenas de linhas de STEP previsível. Escrever à
 * mão mantém o resultado inspecionável e testável por conteúdo.
 */

import {
  FORMA_ESTRUTURAL,
  extensaoDeCanto,
  nomeDoTipoEstrutural,
  wallLength,
  type BlueprintModel,
  type Structural,
  type StructuralKind,
  type Wall,
} from './blueprintKernel';

/**
 * O que este IFC representa, e o que não representa.
 *
 * Escrito para ser lido por quem RECEBE o arquivo, não por quem o gera.
 */
export const COBERTURA_IFC = [
  'CONTÉM: pavimento, paredes (eixo + espessura + altura) e ambientes (contorno + área).',
  'CONTÉM estrutura de concreto: IfcColumn (pilar), IfcBeam (viga), IfcSlab (laje), IfcPile (estaca), IfcFooting (bloco de coroamento e viga de fundação).',
  'NÃO CONTÉM portas nem janelas — as aberturas da planta NÃO estão neste arquivo.',
  'NÃO CONTÉM ARMADURA. Nenhuma barra de aço, estribo ou cobrimento — a estrutura aqui é só a forma do concreto.',
  'NÃO CONTÉM materiais, camadas construtivas, tipos nem conjuntos de propriedades.',
  'Ambientes têm o contorno do EIXO das paredes, não do piso acabado (diferença de ~9%).',
  'Geometria por extrusão simples; nenhuma junção entre paredes ou entre peças estruturais foi resolvida — pilar e viga se INTERPENETRAM no encontro.',
  'Uso pretendido: COORDENAÇÃO geométrica. Não serve para quantitativo nem para execução.',
];

/**
 * A classe IFC de cada tipo, e o `PredefinedType` dela.
 *
 * ─── POR QUE NÃO `IfcBuildingElementProxy` PARA TODOS ───────────────────────
 *
 * Proxy é o "não sei o que isto é" do IFC. Seria uma linha de código e mataria
 * o propósito do arquivo: quem federa no Revit/Navisworks filtra POR CLASSE —
 * "me dê todos os pilares" — e um modelo de proxies não responde a essa
 * pergunta. Sair com a classe certa é a diferença entre coordenação e um saco
 * de sólidos.
 *
 * `IfcPile` tem UM ATRIBUTO A MAIS que as outras (`ConstructionType`, depois de
 * `PredefinedType`). Emitir 9 atributos nela produz um arquivo que abre em uns
 * leitores e falha em outros — o pior modo de erro possível, porque parece
 * funcionar. Por isso a tabela carrega o `extra`.
 */
const CLASSE_IFC: Record<StructuralKind, { entidade: string; tipo: string; extra?: string }> = {
  PILAR: { entidade: 'IFCCOLUMN', tipo: '.COLUMN.' },
  VIGA: { entidade: 'IFCBEAM', tipo: '.BEAM.' },
  LAJE: { entidade: 'IFCSLAB', tipo: '.FLOOR.' },
  // BORED = escavada, que é a estaca comum na obra brasileira de porte médio.
  ESTACA: { entidade: 'IFCPILE', tipo: '.BORED.', extra: '$' },
  BLOCO_COROAMENTO: { entidade: 'IFCFOOTING', tipo: '.PILE_CAP.' },
  VIGA_FUNDACAO: { entidade: 'IFCFOOTING', tipo: '.FOOTING_BEAM.' },
};

/** Identificador global do IFC: 22 caracteres na base 64 própria do formato. */
const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

/**
 * GUID determinístico a partir de uma semente.
 *
 * Aleatório seria mais fácil e estaria errado: reexportar a mesma versão
 * publicada tem que produzir o MESMO arquivo, senão duas exportações do mesmo
 * snapshot ficam impossíveis de comparar — e a comparação é metade do motivo de
 * exportar IFC.
 */
export function ifcGuid(semente: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < semente.length; i++) {
    h1 = Math.imul(h1 ^ semente.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + semente.charCodeAt(i) + i, 0x85ebca6b) >>> 0;
  }
  let saida = '';
  for (let i = 0; i < 22; i++) {
    const misto = (h1 ^ Math.imul(h2, i + 1)) >>> 0;
    saida += B64[(misto >>> (i % 24)) % 64];
    h1 = Math.imul(h1 ^ (misto + i), 0x27d4eb2f) >>> 0;
  }
  return saida;
}

/** Texto para STEP: aspas simples dobradas, e o resto literal. */
function s(texto: string): string {
  return `'${texto.replace(/'/g, "''")}'`;
}

function n(v: number): string {
  return Number.isInteger(v) ? `${v}.` : v.toFixed(6);
}

export interface OpcoesIfc {
  titulo: string;
  revisao: number;
  hash: string;
  autor?: string;
  data?: Date;
}

export function gerarIfc(model: BlueprintModel, o: OpcoesIfc): string {
  const linhas: string[] = [];
  let proximo = 1;
  /** Emite uma entidade e devolve a referência `#n`. */
  const emitir = (corpo: string): string => {
    const id = `#${proximo++}`;
    linhas.push(`${id}= ${corpo};`);
    return id;
  };

  const guid = (semente: string) => s(ifcGuid(`${o.hash}:${semente}`));
  const data = o.data ?? new Date();

  // ── Contexto geométrico ───────────────────────────────────────────────────
  const dirZ = emitir('IFCDIRECTION((0.,0.,1.))');
  const dirX = emitir('IFCDIRECTION((1.,0.,0.))');
  const origem = emitir('IFCCARTESIANPOINT((0.,0.,0.))');
  const eixos = emitir(`IFCAXIS2PLACEMENT3D(${origem},${dirZ},${dirX})`);
  const contexto = emitir(
    `IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${eixos},$)`,
  );
  const subContexto = emitir(
    `IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${contexto},$,.MODEL_VIEW.,$)`,
  );

  // ── Unidades: MILÍMETRO, explícito ────────────────────────────────────────
  const comprimento = emitir('IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)');
  const area = emitir('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)');
  const volume = emitir('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)');
  const angulo = emitir('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)');
  const unidades = emitir(`IFCUNITASSIGNMENT((${comprimento},${area},${volume},${angulo}))`);

  const pessoa = emitir(`IFCPERSON($,${s(o.autor ?? 'ORCACLOUD')},$,$,$,$,$,$)`);
  const organizacao = emitir(`IFCORGANIZATION($,${s('ORCACLOUD')},$,$,$)`);
  const pessoaOrg = emitir(`IFCPERSONANDORGANIZATION(${pessoa},${organizacao},$)`);
  const aplicacao = emitir(
    `IFCAPPLICATION(${organizacao},${s('1.0')},${s('OPURA Planta Inteligente')},${s('OPURA-PLANTA')})`,
  );
  const historico = emitir(
    `IFCOWNERHISTORY(${pessoaOrg},${aplicacao},$,.ADDED.,$,$,$,${Math.floor(data.getTime() / 1000)})`,
  );

  // A COBERTURA VAI NA DESCRIÇÃO DO PROJETO. É o campo que todo visualizador
  // mostra nas propriedades — é onde quem recebe o arquivo vai olhar.
  const projeto = emitir(
    `IFCPROJECT(${guid('projeto')},${historico},${s(`${o.titulo} — versão ${o.revisao}`)},` +
      `${s(COBERTURA_IFC.join(' '))},$,$,$,(${contexto}),${unidades})`,
  );

  const local = emitir(`IFCLOCALPLACEMENT($,${eixos})`);
  const terreno = emitir(
    `IFCSITE(${guid('terreno')},${historico},${s('Terreno')},$,$,${local},$,$,.ELEMENT.,$,$,$,$,$)`,
  );
  const localEdificio = emitir(`IFCLOCALPLACEMENT(${local},${eixos})`);
  const edificio = emitir(
    `IFCBUILDING(${guid('edificio')},${historico},${s(o.titulo)},$,$,${localEdificio},$,$,.ELEMENT.,$,$,$)`,
  );

  emitir(`IFCRELAGGREGATES(${guid('agg-projeto')},${historico},$,$,${projeto},(${terreno}))`);
  emitir(`IFCRELAGGREGATES(${guid('agg-terreno')},${historico},$,$,${terreno},(${edificio}))`);

  // ── Pavimentos ────────────────────────────────────────────────────────────
  const pavimentos: string[] = [];
  const produtosPorPavimento = new Map<string, string[]>();

  for (const nivel of model.levels) {
    const pontoNivel = emitir(`IFCCARTESIANPOINT((0.,0.,${n(nivel.elevationMm)}))`);
    const eixoNivel = emitir(`IFCAXIS2PLACEMENT3D(${pontoNivel},${dirZ},${dirX})`);
    const localNivel = emitir(`IFCLOCALPLACEMENT(${localEdificio},${eixoNivel})`);
    const pavimento = emitir(
      `IFCBUILDINGSTOREY(${guid(`pav-${nivel.id}`)},${historico},${s(nivel.name)},$,$,` +
        `${localNivel},$,$,.ELEMENT.,${n(nivel.elevationMm)})`,
    );
    pavimentos.push(pavimento);
    produtosPorPavimento.set(nivel.id, []);

    // ── Paredes do nível ────────────────────────────────────────────────────
    const paredesDoNivel = model.walls.filter((x) => x.levelId === nivel.id);
    for (const w of paredesDoNivel) {
      const produto = emitirParede(w, {
        emitir,
        guid,
        historico,
        localNivel,
        dirZ,
        dirX,
        subContexto,
        paredesDoNivel,
      });
      produtosPorPavimento.get(nivel.id)!.push(produto);
    }

    // ── Estrutura do nível ──────────────────────────────────────────────────
    for (const s of (model.structures ?? []).filter((x) => x.levelId === nivel.id)) {
      produtosPorPavimento
        .get(nivel.id)!
        .push(emitirEstrutura(s, { emitir, guid, historico, localNivel, dirZ, dirX, subContexto }));
    }

    // ── Ambientes do nível ──────────────────────────────────────────────────
    for (const espaco of model.spaces.filter((x) => x.levelId === nivel.id)) {
      const pontos = espaco.ring.map((p) =>
        emitir(`IFCCARTESIANPOINT((${n(p.x)},${n(p.y)}))`),
      );
      const contorno = emitir(`IFCPOLYLINE((${pontos.join(',')},${pontos[0]}))`);
      const perfil = emitir(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${contorno})`);
      const pontoBase = emitir('IFCCARTESIANPOINT((0.,0.,0.))');
      const eixoBase = emitir(`IFCAXIS2PLACEMENT3D(${pontoBase},${dirZ},${dirX})`);
      const solido = emitir(
        `IFCEXTRUDEDAREASOLID(${perfil},${eixoBase},${dirZ},${n(nivel.defaultHeightMm)})`,
      );
      const forma = emitir(
        `IFCSHAPEREPRESENTATION(${subContexto},'Body','SweptSolid',(${solido}))`,
      );
      const produtoForma = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${forma}))`);
      const localEspaco = emitir(`IFCLOCALPLACEMENT(${localNivel},${eixoBase})`);

      const espacoIfc = emitir(
        `IFCSPACE(${guid(`esp-${espaco.id}`)},${historico},` +
          `${s(espaco.name ?? 'Ambiente')},$,$,${localEspaco},${produtoForma},$,.ELEMENT.,.INTERNAL.,$)`,
      );
      produtosPorPavimento.get(nivel.id)!.push(espacoIfc);
    }

    const produtos = produtosPorPavimento.get(nivel.id)!;
    if (produtos.length > 0) {
      emitir(
        `IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid(`cont-${nivel.id}`)},${historico},$,$,` +
          `(${produtos.join(',')}),${pavimento})`,
      );
    }
  }

  if (pavimentos.length > 0) {
    emitir(
      `IFCRELAGGREGATES(${guid('agg-edificio')},${historico},$,$,${edificio},(${pavimentos.join(',')}))`,
    );
  }

  // ── Cabeçalho STEP ────────────────────────────────────────────────────────
  //
  // A cobertura aparece DUAS vezes de propósito: aqui, onde um editor de texto a
  // mostra na primeira tela, e no IfcProject, onde o visualizador a mostra nas
  // propriedades. Quem abre o arquivo de um jeito não vê o outro.
  const carimbo = data.toISOString().replace(/\.\d{3}Z$/, '');
  const cabecalho =
    `ISO-10303-21;\nHEADER;\n` +
    `FILE_DESCRIPTION((${s('ViewDefinition [CoordinationView]')},` +
    `${s(`COBERTURA PARCIAL: ${COBERTURA_IFC.join(' | ')}`)}),${s('2;1')});\n` +
    `FILE_NAME(${s(`${o.titulo} v${o.revisao}`)},${s(carimbo)},(${s(o.autor ?? 'ORCACLOUD')}),` +
    `(${s('ORCACLOUD')}),${s('OPURA Planta Inteligente')},${s('OPURA')},${s(o.hash)});\n` +
    `FILE_SCHEMA((${s('IFC4')}));\nENDSEC;\nDATA;\n`;

  return `${cabecalho}${linhas.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

/**
 * Parede como sólido extrudado a partir do eixo.
 *
 * `IfcWallStandardCase` exigiria um eixo material com camadas declaradas; sem
 * material, o correto é `IfcWall` mesmo. Declarar StandardCase sem a camada
 * seria dizer ao receptor que existe uma composição construtiva que não existe.
 *
 * ─── O CANTO ────────────────────────────────────────────────────────────────
 *
 * O comprimento do perfil NÃO é `wallLength`. A parede vai de eixo a eixo, mas
 * o CORPO precisa avançar além do vértice para fechar a junção — senão o canto
 * chega ao Revit com um entalhe de meia espessura na face externa. O avanço é
 * `extensaoDeCanto`, a régua do kernel, a MESMA da planta baixa e do PDF.
 *
 * Como o `IFCRECTANGLEPROFILEDEF` é CENTRADO, esticar as duas pontas por
 * valores diferentes desloca o centro: ele deixa de ser o meio do eixo e passa
 * a ser o meio do trecho estendido. Sem esse deslocamento a parede sai com o
 * comprimento certo e a posição errada — pior que o defeito original.
 */
function emitirParede(
  w: Wall,
  ctx: {
    emitir: (corpo: string) => string;
    guid: (semente: string) => string;
    historico: string;
    localNivel: string;
    dirZ: string;
    dirX: string;
    subContexto: string;
    /** Vizinhança para o avanço de canto — só o MESMO pavimento (ver abaixo). */
    paredesDoNivel: Wall[];
  },
): string {
  const { emitir, guid, historico, localNivel, dirZ, dirX, subContexto, paredesDoNivel } = ctx;

  // Recorte por nível porque `extensaoDeCanto`/`isFreeWallEnd` comparam
  // coordenada e não `levelId`: uma parede do pavimento de cima, no mesmo
  // vértice, viraria vizinha e daria avanço numa ponta livre.
  const avA = extensaoDeCanto(paredesDoNivel, w, 'a');
  const avB = extensaoDeCanto(paredesDoNivel, w, 'b');
  const comp = wallLength(w) + avA + avB;

  // Perfil retangular centrado, extrudado ao longo do eixo da parede.
  const perfil = emitir(
    `IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${n(comp)},${n(w.thicknessMm)})`,
  );

  const angulo = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
  // O centro anda `(avB − avA)/2` ao longo do versor do eixo: com avanços
  // iguais ele fica onde estava, e com um só (ponta livre do outro lado) ele
  // acompanha metade do que a parede cresceu.
  const desloc = (avB - avA) / 2;
  const meioX = (w.a.x + w.b.x) / 2 + Math.cos(angulo) * desloc;
  const meioY = (w.a.y + w.b.y) / 2 + Math.sin(angulo) * desloc;

  const direcao = emitir(
    `IFCDIRECTION((${n(Math.cos(angulo))},${n(Math.sin(angulo))},0.))`,
  );
  const centro = emitir(`IFCCARTESIANPOINT((${n(meioX)},${n(meioY)},0.))`);
  const eixoParede = emitir(`IFCAXIS2PLACEMENT3D(${centro},${dirZ},${direcao})`);
  const eixoPerfil = emitir(
    `IFCAXIS2PLACEMENT3D(${emitir('IFCCARTESIANPOINT((0.,0.,0.))')},${dirZ},${dirX})`,
  );

  const solido = emitir(
    `IFCEXTRUDEDAREASOLID(${perfil},${eixoPerfil},${dirZ},${n(w.heightMm)})`,
  );
  const forma = emitir(`IFCSHAPEREPRESENTATION(${subContexto},'Body','SweptSolid',(${solido}))`);
  const produtoForma = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${forma}))`);
  const local = emitir(`IFCLOCALPLACEMENT(${localNivel},${eixoParede})`);

  return emitir(
    `IFCWALL(${guid(`par-${w.id}`)},${historico},${s(`Parede ${w.thicknessMm} mm`)},$,$,` +
      `${local},${produtoForma},$,.NOTDEFINED.)`,
  );
}

/**
 * Peça estrutural como sólido extrudado, na classe IFC que lhe cabe.
 *
 * ─── TODAS EXTRUDADAS PARA CIMA, INCLUSIVE A VIGA ───────────────────────────
 *
 * O perfil é sempre a PEGADA EM PLANTA e a extrusão é sempre vertical, ao longo
 * de `alturaMm`. Numa viga o "correto de manual" seria o oposto — seção
 * transversal varrida ao longo do eixo — mas o sólido resultante é exatamente o
 * mesmo prisma, e este caminho reusa a colocação já provada da parede. Um
 * segundo esquema de placement (com o perfil de pé, girado para o eixo) seria a
 * segunda chance de errar o sinal de um seno, num arquivo em que o erro só
 * aparece dentro do Revit de outra pessoa.
 *
 * ─── A COTA ENTRA NO PLACEMENT, NÃO NO PERFIL ───────────────────────────────
 *
 * O `IfcLocalPlacement` do pavimento já está em `elevationMm`; aqui só entra o
 * `baseMm`, que é relativo ao piso. É isso que põe a estaca abaixo do térreo
 * sem inventar um pavimento "Fundação" — e é a mesma decisão do modelo.
 */
function emitirEstrutura(
  peca: Structural,
  ctx: {
    emitir: (corpo: string) => string;
    guid: (semente: string) => string;
    historico: string;
    localNivel: string;
    dirZ: string;
    dirX: string;
    subContexto: string;
  },
): string {
  const { emitir, guid, historico, localNivel, dirZ, dirX, subContexto } = ctx;
  const forma = FORMA_ESTRUTURAL[peca.kind];
  const classe = CLASSE_IFC[peca.kind];

  let perfil: string;
  let cx = 0;
  let cy = 0;
  let anguloDeg = 0;

  if (forma === 'AREA') {
    // Anel arbitrário, como o ambiente. As coordenadas vão no PERFIL, então o
    // placement fica na origem do nível — só a cota Z entra.
    const pontos = peca.pontos.map((p) => emitir(`IFCCARTESIANPOINT((${n(p.x)},${n(p.y)}))`));
    const contorno = emitir(`IFCPOLYLINE((${pontos.join(',')},${pontos[0]}))`);
    perfil = emitir(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${contorno})`);
  } else if (forma === 'LINHA') {
    const [a, b] = peca.pontos;
    const comp = Math.hypot(b.x - a.x, b.y - a.y);
    perfil = emitir(`IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${n(comp)},${n(peca.larguraMm)})`);
    cx = (a.x + b.x) / 2;
    cy = (a.y + b.y) / 2;
    anguloDeg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  } else if (peca.circular) {
    // Círculo de verdade — a mesma razão do `CIRCLE` no DXF: aqui a geometria
    // é o produto, e o quadrado envolvente daria 27% de concreto a mais.
    perfil = emitir(`IFCCIRCLEPROFILEDEF(.AREA.,$,$,${n(peca.larguraMm / 2)})`);
    cx = peca.pontos[0].x;
    cy = peca.pontos[0].y;
  } else {
    perfil = emitir(
      `IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${n(peca.larguraMm)},${n(peca.profundidadeMm)})`,
    );
    cx = peca.pontos[0].x;
    cy = peca.pontos[0].y;
    anguloDeg = peca.rotacaoDeg;
  }

  const rad = (anguloDeg * Math.PI) / 180;
  const direcao = emitir(`IFCDIRECTION((${n(Math.cos(rad))},${n(Math.sin(rad))},0.))`);
  const centro = emitir(`IFCCARTESIANPOINT((${n(cx)},${n(cy)},${n(peca.baseMm)}))`);
  const eixoPeca = emitir(`IFCAXIS2PLACEMENT3D(${centro},${dirZ},${direcao})`);
  const eixoPerfil = emitir(
    `IFCAXIS2PLACEMENT3D(${emitir('IFCCARTESIANPOINT((0.,0.,0.))')},${dirZ},${dirX})`,
  );

  const solido = emitir(
    `IFCEXTRUDEDAREASOLID(${perfil},${eixoPerfil},${dirZ},${n(peca.alturaMm)})`,
  );
  const forma3d = emitir(`IFCSHAPEREPRESENTATION(${subContexto},'Body','SweptSolid',(${solido}))`);
  const produtoForma = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${forma3d}))`);
  const local = emitir(`IFCLOCALPLACEMENT(${localNivel},${eixoPeca})`);

  const nome = peca.rotulo
    ? `${peca.rotulo} — ${nomeDoTipoEstrutural(peca.kind)}`
    : nomeDoTipoEstrutural(peca.kind);
  // `Tag` recebe o rótulo da prancha: é o campo que os visualizadores mostram
  // na lista, e é por ele que se casa a peça com o projeto estrutural.
  const tag = peca.rotulo ? s(peca.rotulo) : '$';
  const extra = classe.extra ? `,${classe.extra}` : '';

  return emitir(
    `${classe.entidade}(${guid(`est-${peca.id}`)},${historico},${s(nome)},$,$,` +
      `${local},${produtoForma},${tag},${classe.tipo}${extra})`,
  );
}
