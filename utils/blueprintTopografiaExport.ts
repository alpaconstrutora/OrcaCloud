/**
 * Exportação da topografia — SVG das curvas (RF-016) e CSV da grade (RF-018).
 *
 * ─── O AVISO VAI DENTRO DO ARQUIVO ──────────────────────────────────────────
 *
 * CA-011 do PRD: nenhuma exportação de fonte preliminar pode omitir que o
 * estudo não substitui levantamento topográfico. O arquivo circula sozinho —
 * por e-mail, num pendrive, colado numa apresentação — e é lá, longe do
 * sistema, que alguém vai tomá-lo por levantamento. Por isso fonte, data,
 * algoritmo, hash e o aviso entram no SVG (em `<metadata>` E em texto visível
 * na prancha) e no CSV (linhas de cabeçalho com `#`).
 *
 * ─── PURO ───────────────────────────────────────────────────────────────────
 *
 * Devolve texto. Quem baixa é `baixarArtefatos` de `blueprintExportService`,
 * como todas as outras exportações do módulo.
 */

import type { Georreferencia, Point } from './blueprintKernel';
import type { FonteDeElevacao } from './blueprintElevacaoProvedores';
import {
  ALGORITMO_TOPOGRAFIA,
  AVISO_LEVANTAMENTO,
  AVISO_PRELIMINAR,
  caixaDoAnel,
  localParaGeo,
  nosDaGrade,
  type ClasseDeQualidade,
  type CurvaDeNivel,
  type EstatisticasDoTerreno,
  type GradeDeElevacao,
  type PontoCotado,
} from './blueprintTopografia';

export interface ProvenienciaDaVersao {
  nomeDoEstudo: string;
  versao: number;
  fonte: FonteDeElevacao;
  classe: ClasseDeQualidade;
  equidistanciaM: number;
  geradoEm: string;
  hashResultado: string;
  estatisticas: EstatisticasDoTerreno;
  georreferencia: Georreferencia | null;
}

/** O aviso obrigatório (RF-020) para a classe da versão. */
export function avisoDaClasse(classe: ClasseDeQualidade): string {
  return classe === 'PRELIMINAR_REMOTO' ? AVISO_PRELIMINAR : AVISO_LEVANTAMENTO;
}

const fmt = (v: number, casas = 2) => v.toFixed(casas).replace('.', ',');

function escaparXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * SVG das curvas sobre o limite do lote.
 *
 * O `viewBox` é em MILÍMETROS do desenho, com o eixo Y invertido por um `<g
 * transform="scale(1,-1)">`: o desenho cresce para cima, o SVG para baixo. Os
 * textos ganham o `scale(1,-1)` de volta, senão saem espelhados. Com
 * `prancha: true` saem também título, fonte, data, escala, norte e o aviso —
 * a "prancha informativa" do RF-016; sem ele, só a geometria (saída limpa).
 */
export function svgDasCurvas(
  curvas: CurvaDeNivel[],
  anel: Point[],
  prov: ProvenienciaDaVersao,
  opcoes: { pontosCotados?: PontoCotado[]; prancha?: boolean } = {},
): string {
  const caixa = caixaDoAnel(anel);
  const w = caixa.maxX - caixa.minX;
  const h = caixa.maxY - caixa.minY;
  const margem = Math.max(w, h) * 0.08;
  const rodape = opcoes.prancha ? Math.max(w, h) * 0.3 : 0;
  const fonte = Math.max(w, h) / 60;
  const traco = Math.max(w, h) / 800;

  const vbX = caixa.minX - margem;
  const vbY = -(caixa.maxY + margem);
  const vbW = w + 2 * margem;
  const vbH = h + 2 * margem + rodape;

  const caminho = (pts: Point[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  const partes: string[] = [];
  partes.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}">`,
  );
  partes.push(`<title>${escaparXml(prov.nomeDoEstudo)} — curvas de nível v${prov.versao}</title>`);
  partes.push(
    `<metadata>${escaparXml(
      JSON.stringify({
        estudo: prov.nomeDoEstudo,
        versao: prov.versao,
        fonte: prov.fonte.nome,
        dataset: prov.fonte.datasetVersao,
        resolucaoNominalM: prov.fonte.resolucaoNominalM,
        referenciaVertical: prov.fonte.referenciaVertical ?? 'não informada',
        classe: prov.classe,
        equidistanciaM: prov.equidistanciaM,
        geradoEm: prov.geradoEm,
        algoritmo: `${ALGORITMO_TOPOGRAFIA.nome}@${ALGORITMO_TOPOGRAFIA.versao}`,
        hashResultado: prov.hashResultado,
        unidades: 'posição em mm do desenho; cota em m',
        aviso: avisoDaClasse(prov.classe),
      }),
    )}</metadata>`,
  );
  partes.push('<g transform="scale(1,-1)">');

  // Limite do lote, tracejado — a mesma gramática do canvas.
  partes.push(
    `<path d="${caminho(anel)} Z" fill="none" stroke="#15803d" stroke-width="${(traco * 1.5).toFixed(2)}" stroke-dasharray="${(traco * 8).toFixed(1)} ${(traco * 4).toFixed(1)}"/>`,
  );

  for (const c of curvas) {
    partes.push(
      `<path class="${c.mestra ? 'mestra' : 'intermediaria'}" data-cota="${c.cotaM}" d="${caminho(c.pontos)}" fill="none" stroke="#92400e" stroke-width="${(c.mestra ? traco * 2 : traco).toFixed(2)}"/>`,
    );
    if (c.mestra && c.pontos.length > 1) {
      const m = c.pontos[Math.floor(c.pontos.length / 2)];
      partes.push(
        `<text x="${m.x.toFixed(1)}" y="${(-m.y).toFixed(1)}" transform="scale(1,-1)" font-size="${fonte.toFixed(1)}" font-family="sans-serif" fill="#92400e">${fmt(c.cotaM, 2)}</text>`,
      );
    }
  }

  for (const p of opcoes.pontosCotados ?? []) {
    const r = traco * 3;
    partes.push(
      `<path d="M${(p.x - r).toFixed(1)} ${p.y.toFixed(1)} L${(p.x + r).toFixed(1)} ${p.y.toFixed(1)} M${p.x.toFixed(1)} ${(p.y - r).toFixed(1)} L${p.x.toFixed(1)} ${(p.y + r).toFixed(1)}" stroke="#1d4ed8" stroke-width="${traco.toFixed(2)}"/>`,
    );
    partes.push(
      `<text x="${(p.x + r * 1.5).toFixed(1)}" y="${(-(p.y + r * 1.5)).toFixed(1)}" transform="scale(1,-1)" font-size="${(fonte * 0.8).toFixed(1)}" font-family="sans-serif" fill="#1d4ed8">${fmt(p.cotaM, 2)}</text>`,
    );
  }
  partes.push('</g>');

  if (opcoes.prancha) {
    const x0 = caixa.minX;
    // Rodapé abaixo do desenho — as coordenadas aqui são as do SVG (Y para baixo):
    // o `scale(1,-1)` do grupo do desenho não vale para os textos da prancha.
    const topoDoRodape = -(caixa.minY - margem) + fonte * 1.6;
    const linhas: [string, string, number][] = [
      [`${prov.nomeDoEstudo} — curvas de nível v${prov.versao}`, 'bold', fonte * 1.2],
      [
        `Fonte: ${prov.fonte.nome} · ${prov.fonte.datasetVersao}` +
          (prov.fonte.resolucaoNominalM ? ` · resolução nominal ${prov.fonte.resolucaoNominalM} m` : '') +
          ` · referência vertical: ${prov.fonte.referenciaVertical ?? 'não informada'}`,
        'normal',
        fonte * 0.8,
      ],
      [
        `Equidistância ${fmt(prov.equidistanciaM, 2)} m · grade ${fmt(prov.estatisticas.espacamentoM, 2)} m · ` +
          `cotas ${fmt(prov.estatisticas.cotaMinM)} a ${fmt(prov.estatisticas.cotaMaxM)} m · ` +
          `${prov.estatisticas.curvas} curvas · gerado em ${prov.geradoEm}`,
        'normal',
        fonte * 0.8,
      ],
      [
        `Algoritmo ${ALGORITMO_TOPOGRAFIA.nome}@${ALGORITMO_TOPOGRAFIA.versao} · hash ${prov.hashResultado.slice(0, 12)} · ` +
          `unidades: mm do desenho / cota em m · ${prov.fonte.atribuicao}`,
        'normal',
        fonte * 0.8,
      ],
      [avisoDaClasse(prov.classe), 'bold', fonte * 0.8],
    ];
    let yy = topoDoRodape;
    for (const [texto, peso, tamanho] of linhas) {
      partes.push(
        `<text x="${x0.toFixed(1)}" y="${yy.toFixed(1)}" font-size="${tamanho.toFixed(1)}" font-weight="${peso}" font-family="sans-serif" fill="#334155">${escaparXml(texto)}</text>`,
      );
      yy += tamanho * 1.5;
    }

    // Norte: só quando a georreferência diz para onde ele aponta.
    const giro = prov.georreferencia?.rotacaoNorteDeg;
    if (prov.georreferencia && typeof giro === 'number') {
      const cx = caixa.maxX + margem * 0.5;
      const cy = -(caixa.maxY + margem * 0.5);
      const L = margem * 0.35;
      // +Y do desenho está `giro` graus anti-horário do norte → o norte está
      // `giro` graus HORÁRIO do +Y, que na tela do SVG (Y para baixo) é `-giro`.
      partes.push(
        `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${(-giro).toFixed(2)})">` +
          `<path d="M0 ${L.toFixed(1)} L0 ${(-L).toFixed(1)} M${(-L * 0.3).toFixed(1)} ${(-L * 0.6).toFixed(1)} L0 ${(-L).toFixed(1)} L${(L * 0.3).toFixed(1)} ${(-L * 0.6).toFixed(1)}" fill="none" stroke="#334155" stroke-width="${traco.toFixed(2)}"/>` +
          `<text x="0" y="${(-L * 1.2).toFixed(1)}" text-anchor="middle" font-size="${fonte.toFixed(1)}" font-family="sans-serif" fill="#334155">N</text></g>`,
      );
    }
  }

  partes.push('</svg>');
  return partes.join('\n');
}

/**
 * CSV da grade (RF-018): um nó por linha, com posição no desenho, latitude e
 * longitude (quando há georreferência), cota e status. Separador `;` e vírgula
 * decimal — é o que o Excel em português abre sem perguntar.
 */
export function csvDaGrade(grade: GradeDeElevacao, prov: ProvenienciaDaVersao): string {
  const linhas: string[] = [];
  linhas.push(`# ${prov.nomeDoEstudo} — grade de elevação v${prov.versao}`);
  linhas.push(
    `# Fonte: ${prov.fonte.nome} · ${prov.fonte.datasetVersao}` +
      (prov.fonte.resolucaoNominalM ? ` · resolução nominal ${prov.fonte.resolucaoNominalM} m` : '') +
      ` · referência vertical: ${prov.fonte.referenciaVertical ?? 'não informada'}`,
  );
  linhas.push(
    `# Gerado em ${prov.geradoEm} · algoritmo ${ALGORITMO_TOPOGRAFIA.nome}@${ALGORITMO_TOPOGRAFIA.versao} · hash ${prov.hashResultado}`,
  );
  linhas.push(`# Posição em mm do desenho (origem do estudo); cota em metros. Status: valido | nodata.`);
  linhas.push(`# ${avisoDaClasse(prov.classe)}`);
  linhas.push('seq;linha;coluna;x_mm;y_mm;latitude;longitude;cota_m;status;fonte');

  const nos = nosDaGrade(grade);
  nos.forEach((n, i) => {
    const l = Math.floor(i / grade.colunas);
    const c = i % grade.colunas;
    const v = grade.cotasM[i];
    const geo = prov.georreferencia ? localParaGeo(n, prov.georreferencia) : null;
    linhas.push(
      [
        i + 1,
        l,
        c,
        Math.round(n.x),
        Math.round(n.y),
        geo ? geo.lat.toFixed(7).replace('.', ',') : '',
        geo ? geo.lon.toFixed(7).replace('.', ',') : '',
        v === null ? '' : fmt(v, 3),
        v === null ? 'nodata' : 'valido',
        prov.fonte.codigo,
      ].join(';'),
    );
  });
  return linhas.join('\r\n');
}

/**
 * KML das curvas (RF-017): uma `LineString` por curva em latitude/longitude,
 * com a cota como altitude e no nome; o lote como polígono; os pontos cotados
 * como marcadores. Exige georreferência — sem ela não há onde pôr o lote no
 * mundo, e quem chama deve recusar antes.
 *
 * A altitude vai em `absolute` porque a cota é absoluta no referencial da
 * fonte; o Google Earth vai comparar com o próprio terreno dele (EGM96), e a
 * diferença de datum vertical (§15.4 do PRD) aparece como um deslocamento de
 * metros — a descrição diz isso.
 */
export function kmlDasCurvas(
  curvas: CurvaDeNivel[],
  anel: Point[],
  prov: ProvenienciaDaVersao & { georreferencia: Georreferencia },
  pontosCotados: PontoCotado[] = [],
): string {
  const geo = prov.georreferencia;
  const coord = (p: Point, cotaM?: number) => {
    const { lat, lon } = localParaGeo(p, geo);
    return `${lon.toFixed(8)},${lat.toFixed(8)},${(cotaM ?? 0).toFixed(2)}`;
  };
  const descricao = escaparXml(
    `${prov.nomeDoEstudo} — curvas de nível v${prov.versao}. Fonte: ${prov.fonte.nome} · ` +
      `${prov.fonte.datasetVersao} · referência vertical: ${prov.fonte.referenciaVertical ?? 'não informada'}. ` +
      `Equidistância ${fmt(prov.equidistanciaM)} m · gerado em ${prov.geradoEm} · ` +
      `algoritmo ${ALGORITMO_TOPOGRAFIA.nome}@${ALGORITMO_TOPOGRAFIA.versao} · hash ${prov.hashResultado}. ` +
      `A altitude das curvas é a cota da fonte; o terreno do visualizador pode usar outro datum vertical. ` +
      avisoDaClasse(prov.classe),
  );

  const partes: string[] = [];
  partes.push('<?xml version="1.0" encoding="UTF-8"?>');
  partes.push('<kml xmlns="http://www.opengis.net/kml/2.2"><Document>');
  partes.push(`<name>${escaparXml(prov.nomeDoEstudo)} — curvas de nível v${prov.versao}</name>`);
  partes.push(`<description>${descricao}</description>`);
  partes.push(
    '<Style id="curva"><LineStyle><color>ff0e4092</color><width>1</width></LineStyle></Style>' +
      '<Style id="mestra"><LineStyle><color>ff0e4092</color><width>2.5</width></LineStyle></Style>' +
      '<Style id="lote"><LineStyle><color>ff3d8015</color><width>2</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style>' +
      '<Style id="ponto"><IconStyle><scale>0.7</scale></IconStyle></Style>',
  );

  if (anel.length >= 3) {
    partes.push(
      `<Placemark><name>Lote</name><styleUrl>#lote</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>` +
        [...anel, anel[0]].map((p) => coord(p)).join(' ') +
        `</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`,
    );
  }

  partes.push('<Folder><name>Curvas de nível</name>');
  for (const c of curvas) {
    if (c.pontos.length < 2) continue;
    partes.push(
      `<Placemark><name>${fmt(c.cotaM)} m</name><styleUrl>#${c.mestra ? 'mestra' : 'curva'}</styleUrl>` +
        `<ExtendedData><Data name="cota_m"><value>${c.cotaM}</value></Data><Data name="mestra"><value>${c.mestra}</value></Data></ExtendedData>` +
        `<LineString><altitudeMode>absolute</altitudeMode><coordinates>` +
        c.pontos.map((p) => coord(p, c.cotaM)).join(' ') +
        `</coordinates></LineString></Placemark>`,
    );
  }
  partes.push('</Folder>');

  if (pontosCotados.length > 0) {
    partes.push('<Folder><name>Pontos cotados</name>');
    for (const p of pontosCotados) {
      partes.push(
        `<Placemark><name>${fmt(p.cotaM)} m</name><styleUrl>#ponto</styleUrl><Point><altitudeMode>absolute</altitudeMode>` +
          `<coordinates>${coord(p, p.cotaM)}</coordinates></Point></Placemark>`,
      );
    }
    partes.push('</Folder>');
  }

  partes.push('</Document></kml>');
  return partes.join('\n');
}

/** Nome de arquivo sem os caracteres que o Windows recusa. */
export function nomeDoArquivoDeTopografia(nomeDoEstudo: string, versao: number, ext: string): string {
  const base = nomeDoEstudo.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'estudo';
  return `${base} - curvas de nivel v${versao}.${ext}`;
}
