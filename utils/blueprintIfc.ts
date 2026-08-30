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

import { extensaoDeCanto, wallLength, type BlueprintModel, type Wall } from './blueprintKernel';

/**
 * O que este IFC representa, e o que não representa.
 *
 * Escrito para ser lido por quem RECEBE o arquivo, não por quem o gera.
 */
export const COBERTURA_IFC = [
  'CONTÉM: pavimento, paredes (eixo + espessura + altura) e ambientes (contorno + área).',
  'NÃO CONTÉM portas nem janelas — as aberturas da planta NÃO estão neste arquivo.',
  'NÃO CONTÉM materiais, camadas construtivas, tipos nem conjuntos de propriedades.',
  'Ambientes têm o contorno do EIXO das paredes, não do piso acabado (diferença de ~9%).',
  'Geometria por extrusão simples; nenhuma junção entre paredes foi resolvida.',
  'Uso pretendido: COORDENAÇÃO geométrica. Não serve para quantitativo nem para execução.',
];

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
