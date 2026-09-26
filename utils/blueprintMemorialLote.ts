/**
 * MEMORIAL DESCRITIVO DO LOTEAMENTO (fase B4).
 *
 * Transforma a geometria em TEXTO — a peça que o cartório lê, e que hoje é
 * digitada à mão lote a lote. É motor puro: recebe o modelo, devolve string.
 * Nada de PDF, nada de banco, nada de React aqui.
 *
 * ⚠️ O QUE ESTE MEMORIAL É, E O QUE NÃO É.
 *
 * Ele descreve o lote por MEDIDAS e CONFRONTANTES ("mede 12,00 m de frente
 * para a Rua 1; 30,00 m pelo lado direito, confrontando com o lote 11…"), que é
 * a forma usual do memorial de loteamento urbano e é o que o registro de
 * imóveis aceita para parcelamento aprovado pela prefeitura.
 *
 * Ele NÃO traz azimutes, rumos nem coordenadas dos vértices: isso exige
 * georreferência, que entra na fase A1. Enquanto ela não existe, o memorial
 * DIZ que não as tem (`avisoDaGeorreferencia`) em vez de omitir em silêncio —
 * quem recebe um memorial sem coordenadas precisa saber que é por ausência de
 * dado, não por esquecimento.
 *
 * ⚠️ E não substitui o responsável técnico. É a mesma premissa da topografia:
 * o software redige a peça; quem assina, e responde, é o profissional.
 */
import type { BlueprintModel, Lote, Quadra, AreaPublica, Georreferencia } from './blueprintKernel';
import { ehAreaDoLoteamento, FICHA_DA_AREA_PUBLICA } from './blueprintKernel';
import { localParaGeo } from './blueprintTopografia';
import {
  azimute as azimuteEntre,
  azimuteVerdadeiro,
  azimuteTexto,
  rumoTexto,
  convergenciaMeridiana,
  crsPorCodigo,
  geoParaProjetado,
  latitudeTexto,
  longitudeTexto,
} from './geo';
import {
  medirLote,
  areaEmM2,
  areasDoLoteamento,
  faixaDaVia,
  rotuloDoLote,
  ROTULO_DO_PAPEL_DO_LADO,
  type LadoDoLote,
  type PapelDoLado,
} from './blueprintLoteamento';

/** Número no formato brasileiro, com 2 casas. */
export function numeroBr(v: number, casas = 2): string {
  return v.toFixed(casas).replace('.', ',');
}

/** "12,00 m". */
function metros(mm: number): string {
  return `${numeroBr(mm / 1000)} m`;
}

export interface DadosDoLoteamento {
  /** "Loteamento Alvorada". */
  nome: string;
  /** Município e UF, como vão no memorial. */
  municipio?: string | null;
  uf?: string | null;
  /** Matrícula da GLEBA e o cartório — o que amarra o lote à origem. */
  matricula?: string | null;
  cartorio?: string | null;
  /** Quem assina. O memorial não substitui o responsável: ele o nomeia. */
  responsavelTecnico?: string | null;
  registroDoConselho?: string | null;
}

export const DADOS_VAZIOS: DadosDoLoteamento = { nome: 'Loteamento' };

/**
 * A ordem em que os lados entram no texto: frente, direita, fundo, esquerda —
 * é o giro que o memorial descreve, e a ordem que o registrador espera.
 */
const ORDEM_DOS_PAPEIS: PapelDoLado[] = ['FRENTE', 'LATERAL_DIREITA', 'FUNDO', 'LATERAL_ESQUERDA'];

function ordenarLados(lados: LadoDoLote[]): LadoDoLote[] {
  return [...lados].sort((a, b) => {
    const pa = ORDEM_DOS_PAPEIS.indexOf(a.papel);
    const pb = ORDEM_DOS_PAPEIS.indexOf(b.papel);
    return pa - pb || a.indice - b.indice;
  });
}

/** "confrontando com o Lote 11 da quadra A" · "" quando não se sabe. */
function confrontacao(lado: LadoDoLote): string {
  if (!lado.confrontante) return '';
  return `, confrontando com ${lado.confrontante}`;
}

/** Como cada papel é dito no texto corrido. */
function porExtenso(papel: PapelDoLado): string {
  switch (papel) {
    case 'FRENTE':
      return 'de frente';
    case 'FUNDO':
      return 'nos fundos';
    case 'LATERAL_DIREITA':
      return 'pelo lado direito';
    case 'LATERAL_ESQUERDA':
      return 'pelo lado esquerdo';
  }
}

export const AVISO_SEM_GEORREFERENCIA =
  'Memorial descrito por medidas e confrontantes. As coordenadas dos vértices e os azimutes das divisas dependem de georreferenciamento do levantamento, que não consta deste estudo.';

/**
 * A0 — o memorial COM georreferência.
 *
 * Quando o estudo tem latitude/longitude e um CRS projetado do catálogo, cada
 * lado ganha azimute e rumo, e cada vértice ganha coordenada. É o que o SIGEF e
 * o registro de imóveis pedem, e é o que faltava na B4.
 *
 * ⚠️ O azimute do desenho é o de QUADRÍCULA (medido contra o Y da projeção). O
 * que vai no memorial é o VERDADEIRO, que difere pela convergência meridiana —
 * até 2° na borda do fuso. Escrever um pelo outro gira todas as divisas, e o
 * desenho continua perfeito.
 */
export interface LadoGeorreferenciado {
  indice: number;
  azimuteDeQuadricula: number;
  azimuteVerdadeiro: number;
  azimuteTexto: string;
  rumoTexto: string;
}

export interface VerticeGeorreferenciado {
  indice: number;
  este: number;
  norte: number;
  lat: number;
  lon: number;
  latitudeTexto: string;
  longitudeTexto: string;
}

export interface Georreferenciamento {
  crs: string;
  convergenciaGraus: number;
  vertices: VerticeGeorreferenciado[];
  lados: LadoGeorreferenciado[];
}

/**
 * Traduz os vértices do lote para coordenadas do mundo.
 *
 * Devolve `null` quando falta georreferência ou o CRS não é projetado — e é o
 * `null` que faz o memorial voltar a dizer que não tem coordenadas, em vez de
 * inventá-las.
 */
export function georreferenciarLote(model: BlueprintModel, lote: Lote): Georreferenciamento | null {
  const geo: Georreferencia | null | undefined = model.georreferencia;
  if (!geo || !Number.isFinite(geo.latitude) || !Number.isFinite(geo.longitude)) return null;
  if (geo.latitude === 0 && geo.longitude === 0) return null;
  const crs = geo.projetada?.crs ? crsPorCodigo(geo.projetada.crs) : null;
  if (!crs || crs.tipo !== 'PROJETADO' || crs.zona == null) return null;

  const convergencia = convergenciaMeridiana({ lat: geo.latitude, lon: geo.longitude }, crs.zona);

  const vertices: VerticeGeorreferenciado[] = lote.pontos.map((p, i) => {
    // O kernel trabalha em mm LOCAIS; `localParaGeo` leva ao mundo pela
    // âncora do estudo, e daí o proj4 leva ao sistema projetado.
    const g = localParaGeo(p, geo);
    const proj = geoParaProjetado({ lat: g.lat, lon: g.lon }, crs).valor;
    return {
      indice: i,
      este: Math.round(proj.este * 1000) / 1000,
      norte: Math.round(proj.norte * 1000) / 1000,
      lat: g.lat,
      lon: g.lon,
      latitudeTexto: latitudeTexto(g.lat),
      longitudeTexto: longitudeTexto(g.lon),
    };
  });

  const lados: LadoGeorreferenciado[] = vertices.map((v, i) => {
    const seguinte = vertices[(i + 1) % vertices.length];
    const azQuad = azimuteEntre({ x: v.este, y: v.norte }, { x: seguinte.este, y: seguinte.norte });
    const azVerd = azimuteVerdadeiro(azQuad, convergencia);
    return {
      indice: i,
      azimuteDeQuadricula: azQuad,
      azimuteVerdadeiro: azVerd,
      azimuteTexto: azimuteTexto(azVerd),
      rumoTexto: rumoTexto(azVerd),
    };
  });

  return { crs: crs.codigo, convergenciaGraus: convergencia, vertices, lados };
}

export interface MemorialDeLote {
  loteId: string;
  loteUid: string;
  titulo: string;
  areaM2: number;
  testadaM: number;
  perimetroM: number;
  /** O texto corrido, pronto para o documento. */
  texto: string;
  /** Os lados na ordem do memorial, para quem quiser a versão tabular. */
  lados: LadoDoLote[];
  /** O que falta para o memorial ficar completo. Vazio = nada falta. */
  avisos: string[];
}

/**
 * O memorial de UM lote.
 *
 * O texto é montado numa frase só, como se escreve na matrícula: identificação,
 * depois o giro dos lados com medida e confrontante, depois a área e a origem.
 */
export function memorialDeLote(model: BlueprintModel, lote: Lote, dados: DadosDoLoteamento = DADOS_VAZIOS): MemorialDeLote {
  const medida = medirLote(model, lote);
  const quadra = lote.quadraId != null ? (model.quadras ?? []).find((q) => q.id === lote.quadraId) : undefined;
  const lados = ordenarLados(medida.lados);
  const geo = georreferenciarLote(model, lote);
  // O aviso só entra quando NÃO há georreferência: dizer que faltam
  // coordenadas num memorial que as tem seria mentira em papel assinado.
  const avisos: string[] = geo ? [] : [AVISO_SEM_GEORREFERENCIA];

  if (!quadra) avisos.push('Lote fora de qualquer quadra — o memorial sai sem a identificação da quadra.');
  if (medida.encravado) avisos.push('Lote sem frente para via (encravado): confira o desenho antes de emitir.');
  const semConfrontante = lados.filter((l) => !l.confrontante).length;
  if (semConfrontante > 0) {
    avisos.push(`${semConfrontante} lado(s) sem confrontante identificado — desenhe o vizinho ou informe no quadro de divisas.`);
  }

  const onde = [dados.municipio, dados.uf].filter(Boolean).join(' - ');
  const identificacao = quadra
    ? `LOTE ${lote.numero} DA QUADRA ${quadra.nome}`
    : `LOTE ${lote.numero}`;

  const frases: string[] = [];
  frases.push(
    `${identificacao}, do ${dados.nome}${onde ? `, situado em ${onde}` : ''}, com a área de ${numeroBr(medida.areaMm2 / 1e6)} m² (${numeroBr(medida.areaMm2 / 1e6)} metros quadrados), com o perímetro de ${numeroBr(medida.perimetroMm / 1000)} m, assim descrito:`,
  );

  // O giro: um trecho por lado, na ordem frente → direita → fundo → esquerda.
  // Com georreferência, cada trecho leva o azimute VERDADEIRO — é ele que o
  // SIGEF e o registro conferem.
  const trechos = lados.map((l) => {
    const azimute = geo?.lados.find((g) => g.indice === l.indice);
    const rumo = azimute ? `, no azimute ${azimute.azimuteTexto} (rumo ${azimute.rumoTexto})` : '';
    return `mede ${metros(l.comprimentoMm)} ${porExtenso(l.papel)}${rumo}${confrontacao(l)}`;
  });
  frases.push(`${trechos.join('; ')}.`);

  if (geo) {
    const v = geo.vertices[0];
    frases.push(
      `Coordenadas no sistema ${geo.crs}; o vértice inicial fica em E ${numeroBr(v.este, 3)} m, N ${numeroBr(v.norte, 3)} m (${v.latitudeTexto}, ${v.longitudeTexto}). Azimutes verdadeiros, corrigidos da convergência meridiana de ${numeroBr(geo.convergenciaGraus, 4)}°.`,
    );
  }

  if (dados.matricula) {
    frases.push(
      `Imóvel havido por desmembramento da gleba objeto da matrícula nº ${dados.matricula}${dados.cartorio ? ` do ${dados.cartorio}` : ''}.`,
    );
  }
  if (dados.responsavelTecnico) {
    frases.push(
      `Levantamento e projeto sob responsabilidade técnica de ${dados.responsavelTecnico}${dados.registroDoConselho ? ` (${dados.registroDoConselho})` : ''}.`,
    );
  }

  return {
    loteId: lote.id,
    loteUid: lote.uid,
    titulo: rotuloDoLote(model, lote),
    areaM2: Math.round((medida.areaMm2 / 1e6) * 100) / 100,
    testadaM: Math.round((medida.testadaMm / 1000) * 100) / 100,
    perimetroM: Math.round((medida.perimetroMm / 1000) * 100) / 100,
    texto: frases.join(' '),
    lados,
    avisos,
  };
}

/** Os memoriais de todos os lotes, na ordem quadra → número. */
export function memoriaisDoLoteamento(model: BlueprintModel, dados: DadosDoLoteamento = DADOS_VAZIOS): MemorialDeLote[] {
  const nomeDaQuadra = (l: Lote) =>
    (model.quadras ?? []).find((q) => q.id === l.quadraId)?.nome ?? '￿'; // sem quadra vai por último
  return (model.lotes ?? [])
    .filter((l) => l.tipo === 'LOTE')
    .slice()
    .sort((a, b) => nomeDaQuadra(a).localeCompare(nomeDaQuadra(b), 'pt-BR') || a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }))
    .map((l) => memorialDeLote(model, l, dados));
}

/** O memorial de uma ÁREA PÚBLICA — o que se doa ao município. */
export function memorialDeAreaPublica(area: AreaPublica, dados: DadosDoLoteamento = DADOS_VAZIOS): string {
  const rotulo = area.nome ?? 'Área pública';
  const onde = [dados.municipio, dados.uf].filter(Boolean).join(' - ');
  return `${rotulo.toUpperCase()}, do ${dados.nome}${onde ? `, situada em ${onde}` : ''}, com a área de ${numeroBr(areaEmM2(area.pontos))} m², destinada a ${rotuloDaDestinacao(area)}, a ser transferida ao domínio público na forma do art. 22 da Lei 6.766/79.`;
}

function rotuloDaDestinacao(area: AreaPublica): string {
  switch (area.tipo) {
    case 'VERDE':
      return 'área verde e lazer';
    case 'INSTITUCIONAL':
      return 'uso institucional';
    case 'VIARIO':
      return 'sistema viário';
    case 'RESERVA':
      return 'reserva / faixa não edificável';
    default:
      // A5: os temas ambientais (CAR) não são áreas do loteamento — não chegam aqui
      // pelo memorial do loteamento; se chegarem, dizem o que são.
      return FICHA_DA_AREA_PUBLICA[area.tipo].rotulo.toLowerCase();
  }
}

export interface LinhaDaTabelaDeLotes {
  quadra: string;
  lote: string;
  areaM2: number;
  testadaM: number;
  perimetroM: number;
  confrontanteDaFrente: string;
}

/** A tabela de lotes — a que vai na prancha e na planilha. */
export function tabelaDeLotes(model: BlueprintModel): LinhaDaTabelaDeLotes[] {
  return memoriaisDoLoteamento(model).map((m) => {
    const frente = m.lados.find((l) => l.papel === 'FRENTE');
    const lote = (model.lotes ?? []).find((l) => l.id === m.loteId);
    const quadra = lote?.quadraId != null ? (model.quadras ?? []).find((q) => q.id === lote.quadraId) : undefined;
    return {
      quadra: quadra?.nome ?? '—',
      lote: lote?.numero ?? '—',
      areaM2: m.areaM2,
      testadaM: m.testadaM,
      perimetroM: m.perimetroM,
      confrontanteDaFrente: frente?.confrontante ?? '—',
    };
  });
}

export interface ResumoDaQuadra {
  quadra: string;
  lotes: number;
  areaM2: number;
  menorLoteM2: number;
  maiorLoteM2: number;
}

/** O resumo por quadra, para a tabela de quadras. */
export function tabelaDeQuadras(model: BlueprintModel): ResumoDaQuadra[] {
  return (model.quadras ?? [])
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
    .map((q) => {
      const lotes = (model.lotes ?? []).filter((l) => l.quadraId === q.id && l.tipo === 'LOTE');
      const areas = lotes.map((l) => areaEmM2(l.pontos));
      const soma = areas.reduce((s, a) => s + a, 0);
      return {
        quadra: q.nome,
        lotes: lotes.length,
        areaM2: Math.round(soma * 100) / 100,
        menorLoteM2: areas.length > 0 ? Math.min(...areas) : 0,
        maiorLoteM2: areas.length > 0 ? Math.max(...areas) : 0,
      };
    });
}

/**
 * O MEMORIAL DO LOTEAMENTO inteiro: identificação, quadro de áreas e a relação
 * das quadras. É a peça de abertura, antes dos memoriais de cada lote.
 */
export function memorialDoLoteamento(model: BlueprintModel, areaDaGlebaMm2: number | null, dados: DadosDoLoteamento = DADOS_VAZIOS): string {
  const areas = areasDoLoteamento(model, areaDaGlebaMm2);
  const quadras = tabelaDeQuadras(model);
  const totalDeLotes = quadras.reduce((s, q) => s + q.lotes, 0);
  const onde = [dados.municipio, dados.uf].filter(Boolean).join(' - ');

  const linhas: string[] = [];
  linhas.push(`MEMORIAL DESCRITIVO — ${dados.nome.toUpperCase()}`);
  if (onde) linhas.push(`Município: ${onde}`);
  if (dados.matricula) linhas.push(`Gleba de origem: matrícula nº ${dados.matricula}${dados.cartorio ? ` — ${dados.cartorio}` : ''}`);
  if (areaDaGlebaMm2 != null && areaDaGlebaMm2 > 0) linhas.push(`Área total da gleba: ${numeroBr(areaDaGlebaMm2 / 1e6)} m²`);
  linhas.push('');
  linhas.push(`O loteamento é composto por ${quadras.length} quadra(s) e ${totalDeLotes} lote(s), com a seguinte distribuição de áreas:`);
  linhas.push('');
  for (const a of areas) {
    const pct = a.percentual != null ? ` (${numeroBr(a.percentual)}% da gleba)` : '';
    linhas.push(`  ${a.rotulo}: ${a.quantidade} un — ${numeroBr(a.areaM2)} m²${pct}`);
  }
  linhas.push('');
  for (const q of quadras) {
    linhas.push(`  Quadra ${q.quadra}: ${q.lotes} lote(s), ${numeroBr(q.areaM2)} m² (menor ${numeroBr(q.menorLoteM2)} m², maior ${numeroBr(q.maiorLoteM2)} m²)`);
  }
  linhas.push('');
  // Idem: o aviso só quando o estudo não tem georreferência.
  const temGeo = (model.lotes ?? []).some((l) => georreferenciarLote(model, l) != null);
  if (!temGeo) linhas.push(AVISO_SEM_GEORREFERENCIA);
  if (dados.responsavelTecnico) {
    linhas.push('');
    linhas.push(`Responsável técnico: ${dados.responsavelTecnico}${dados.registroDoConselho ? ` — ${dados.registroDoConselho}` : ''}`);
  }
  return linhas.join('\n');
}

/**
 * PONTOS DE LOCAÇÃO: os vértices de cada lote, para levar a campo.
 *
 * Sai no formato P,X,Y,Z,D — o mesmo PNEZD que o importador de levantamento já
 * lê, para que o ciclo feche: o que sai para a estação total volta como
 * conferência sem tradutor no meio.
 */
export function pontosDeLocacao(model: BlueprintModel): { nome: string; x: number; y: number; descricao: string }[] {
  const out: { nome: string; x: number; y: number; descricao: string }[] = [];
  const lotes = (model.lotes ?? []).filter((l) => l.tipo === 'LOTE');
  for (const lote of lotes) {
    const quadra = lote.quadraId != null ? (model.quadras ?? []).find((q) => q.id === lote.quadraId) : undefined;
    const prefixo = quadra ? `Q${quadra.nome}L${lote.numero}` : `L${lote.numero}`;
    lote.pontos.forEach((p, i) => {
      out.push({
        nome: `${prefixo}-${i + 1}`,
        x: p.x,
        y: p.y,
        descricao: quadra ? `Vértice ${i + 1} do lote ${lote.numero}, quadra ${quadra.nome}` : `Vértice ${i + 1} do lote ${lote.numero}`,
      });
    });
  }
  return out;
}

/** O CSV dos pontos de locação, em METROS (a unidade do campo). */
export function csvDeLocacao(model: BlueprintModel): string {
  const linhas = ['ponto;norte;este;cota;descricao'];
  for (const p of pontosDeLocacao(model)) {
    // ⚠️ NORTE é o Y e ESTE é o X, nesta ordem — é a convenção da topografia, e
    // trocá-la espelha o loteamento inteiro no campo sem erro nenhum na tela.
    linhas.push(`${p.nome};${numeroBr(p.y / 1000, 3)};${numeroBr(p.x / 1000, 3)};0,000;${p.descricao}`);
  }
  return linhas.join('\n');
}

/**
 * O documento completo em texto: abertura + um memorial por lote + as áreas
 * públicas. É o que se cola num .docx ou se imprime em PDF.
 */
export function documentoDoLoteamento(model: BlueprintModel, areaDaGlebaMm2: number | null, dados: DadosDoLoteamento = DADOS_VAZIOS): string {
  const partes: string[] = [memorialDoLoteamento(model, areaDaGlebaMm2, dados), ''];

  const memoriais = memoriaisDoLoteamento(model, dados);
  if (memoriais.length > 0) {
    partes.push('DESCRIÇÃO DOS LOTES', '');
    for (const m of memoriais) partes.push(m.texto, '');
  }

  // A5: só as do LOTEAMENTO — APP, Reserva Legal e afins são do CAR, não se transferem ao município.
  const publicas = (model.areasPublicas ?? []).filter((a) => ehAreaDoLoteamento(a.tipo));
  if (publicas.length > 0) {
    partes.push('ÁREAS PÚBLICAS', '');
    for (const a of publicas) partes.push(memorialDeAreaPublica(a, dados), '');
  }

  return partes.join('\n');
}

/** Quantos memoriais têm pendência — para o botão dizer antes de emitir. */
export function pendenciasDosMemoriais(model: BlueprintModel): { lotes: number; comAviso: number } {
  const memoriais = memoriaisDoLoteamento(model);
  // O aviso de georreferência é de TODOS e não é pendência de desenho: ele
  // conta como informação, não como defeito a corrigir antes de emitir.
  const comAviso = memoriais.filter((m) => m.avisos.some((a) => a !== AVISO_SEM_GEORREFERENCIA)).length;
  return { lotes: memoriais.length, comAviso };
}

/** As vias com o comprimento do eixo e a área da caixa — a tabela do viário. */
export function tabelaDeVias(model: BlueprintModel): { nome: string; comprimentoM: number; larguraM: number; areaM2: number }[] {
  return (model.vias ?? []).map((v) => {
    let comp = 0;
    for (let i = 0; i < v.eixo.length - 1; i += 1) {
      comp += Math.hypot(v.eixo[i + 1].x - v.eixo[i].x, v.eixo[i + 1].y - v.eixo[i].y);
    }
    return {
      nome: v.nome,
      comprimentoM: Math.round((comp / 1000) * 100) / 100,
      larguraM: Math.round((v.larguraMm / 1000) * 100) / 100,
      areaM2: areaEmM2(faixaDaVia(v.eixo, v.larguraMm)),
    };
  });
}

/** O rótulo de cada papel, reexportado para quem monta a versão tabular. */
export { ROTULO_DO_PAPEL_DO_LADO };
export type { Quadra };
