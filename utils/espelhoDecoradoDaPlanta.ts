/**
 * O CORTE 3D DA UNIDADE GERADO PELA PLANTA (Espelho de Vendas 3D, F9 — 10/11/2026). Plano:
 * docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 *
 * A Planta já tem a unidade autônoma como objeto (`Unidade`: número, tipologia e as etiquetas dos ambientes) e os
 * móveis como componentes. Aqui sai o que o 3D da Planta precisa para mostrar SÓ aquela unidade, vista de cima sem
 * teto — o "corte mobiliado" que a F8 recebia como imagem enviada:
 *
 * - quais peças ESCONDER (`ocultos`): as paredes que não cercam nem dividem a unidade e os móveis fora dela;
 * - a CAIXA DE CORTE em volta da unidade, que recorta a laje do pavimento e baixa as paredes à altura do corte;
 * - o PONTO DE VISTA, de cima e de lado, enquadrando a unidade;
 * - a ASSINATURA da geometria, para dizer "o desenho mudou desde o envio";
 * - e, quando a unidade não tem móvel nenhum, uma CÓPIA do modelo mobiliada com o kit mínimo de cada ambiente
 *   (`mobiliarDoAmbiente`) — nada disso volta ao estudo.
 *
 * O desenho é o próprio `Blueprint3DViewer` (o mesmo da aba 3D), que já recebe `ocultos`, caixa de corte, ponto de
 * vista e captura em PNG. Tudo em ESPAÇO DO DESENHO, metro: `X = x`, `Y = cota`, `Z = +y` (ver `blueprint3dEspelho`).
 * Puro.
 */
import { applyBatch, pointInPolygon, type BlueprintModel, type ObjectId, type Point } from './blueprintKernel';
import { medirUnidade } from './blueprintUnidades';
import { comandosDeMobiliario, mobiliarDoAmbiente } from './blueprintMobiliario';
import { fovVerticalGraus } from './blueprintCamera';
import type { CaixaDeCorte } from './blueprint3dSelecao';

/** De onde a câmera olha a unidade: o canto, girando em volta do centro (0° = do sul, 90° = do leste). */
export type LadoDaVista = 'SUDESTE' | 'SUDOESTE' | 'NORDESTE' | 'NOROESTE';
export const GIRO_DO_LADO: Record<LadoDaVista, number> = { SUDESTE: 35, SUDOESTE: -35, NORDESTE: 145, NOROESTE: -145 };
export const ROTULO_DO_LADO: Record<LadoDaVista, string> = { SUDESTE: 'Sudeste', SUDOESTE: 'Sudoeste', NORDESTE: 'Nordeste', NOROESTE: 'Noroeste' };

/** As folgas do corte — hipóteses, nunca constante escondida. A tela deixa trocar o lado e a altura. */
export interface HipotesesDoCorteDecorado {
  /** Até onde as paredes sobem no corte, acima do piso. `null` = inteiras (até a altura da parede). */
  alturaDoCorteMm: number | null;
  /** Quanto a caixa passa do contorno da unidade, para a parede externa sair inteira. */
  folgaMm: number;
  /** O ângulo da câmera acima do horizonte. */
  elevacaoGraus: number;
  lado: LadoDaVista;
  /** A lente da câmera (35 mm de filme). */
  focalMm: number;
  /** O formato da imagem: largura ÷ altura. É o da captura e o da prévia. */
  aspecto: number;
}

export const HIPOTESES_DO_CORTE_DECORADO: HipotesesDoCorteDecorado = {
  alturaDoCorteMm: 2200,
  folgaMm: 400,
  elevacaoGraus: 52,
  lado: 'SUDESTE',
  focalMm: 32,
  aspecto: 1.6,
};

/** O tamanho da imagem enviada ao Espelho (no formato de `aspecto`). */
export const TAMANHO_DA_IMAGEM_DO_CORTE = { largura: 1600, altura: 1000 } as const;

export interface CenaDoDecorado {
  unidadeId: ObjectId;
  numero: string;
  tipologia: string;
  levelId: ObjectId;
  /** O modelo a desenhar: o do estudo, ou a cópia mobiliada com o kit sugerido. */
  modelo: BlueprintModel;
  ocultos: Set<string>;
  caixa: CaixaDeCorte;
  pontoDeVista: { chave: string; posicao: [number, number, number]; alvo: [number, number, number]; focalMm: number };
  /** Quantos móveis a unidade tem no estudo, e quantos o kit sugerido pôs na cópia. */
  moveisDoEstudo: number;
  moveisSugeridos: number;
  assinatura: string;
}

export type ResultadoDaCena = { ok: true; cena: CenaDoDecorado } | { ok: false; motivo: string };

const dentro = (anel: readonly Point[], p: Point) => anel.length >= 3 && pointInPolygon(anel as Point[], p);

/** FNV-1a de 32 bits em hexadecimal — estável entre navegadores, sem dependência. */
function fnv1a(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

interface PecasDaUnidade {
  levelId: ObjectId;
  ambienteIds: Set<ObjectId>;
  aneis: Point[][];
  paredes: Set<ObjectId>;
  moveis: Set<ObjectId>;
  numero: string;
  tipologia: string;
  uid: string;
}

/** O que é da unidade no desenho; ou o motivo de não dar para gerar o corte dela. */
function pecasDaUnidade(model: BlueprintModel, unidadeId: ObjectId): PecasDaUnidade | { motivo: string } {
  const u = (model.unidades ?? []).find((x) => x.id === unidadeId);
  if (!u) return { motivo: 'A unidade não existe mais no desenho.' };
  const tipologia = (u.tipologia ?? '').trim();
  if (!tipologia) return { motivo: `A unidade ${u.numero} não tem tipologia: o corte vai para o decorado da tipologia. Preencha a tipologia na tabela.` };
  const medida = medirUnidade(model, u);
  if (medida.ambientes.length === 0) return { motivo: `A unidade ${u.numero} não tem ambiente. Componha a unidade no cartão de cada ambiente.` };
  if (medida.levelIds.length > 1) return { motivo: `A unidade ${u.numero} ocupa dois pavimentos (duplex): o corte gerado ainda é de um pavimento só. Envie a imagem do corte pelo Empreendimento.` };
  const paredes = new Set(medida.paredes.map((p) => p.wallId));
  if (paredes.size === 0) return { motivo: `A unidade ${u.numero} não tem parede em volta: não há o que cortar.` };
  const levelId = medida.levelIds[0];
  const aneis = medida.ambientes.map((s) => s.ring);
  const moveis = new Set(
    (model.componentes ?? []).filter((c) => c.levelId === levelId && aneis.some((a) => dentro(a, c.at))).map((c) => c.id),
  );
  return { levelId, ambienteIds: new Set(medida.ambientes.map((s) => s.id)), aneis, paredes, moveis, numero: u.numero, tipologia, uid: u.uid };
}

/**
 * A assinatura do que o corte mostra: ambientes, paredes (e os vãos nelas), móveis, número e tipologia. Mudou =
 * "o desenho mudou desde o envio". Começa pelo uid da unidade: o banco guarda UMA unidade por tipologia, e a tela
 * precisa saber de qual delas veio o corte.
 */
export function assinaturaDoDecorado(model: BlueprintModel, unidadeId: ObjectId): string | null {
  const p = pecasDaUnidade(model, unidadeId);
  if ('motivo' in p) return null;
  const r = (n: number) => Math.round(n);
  const paredes = model.walls
    .filter((w) => p.paredes.has(w.id))
    .map((w) => [w.uid, r(w.a.x), r(w.a.y), r(w.b.x), r(w.b.y), r(w.thicknessMm), r(w.heightMm)].join(','))
    .sort();
  const vaos = model.openings
    .filter((o) => p.paredes.has(o.wallId))
    .map((o) => [o.uid, o.kind, r(o.offsetMm), r(o.widthMm), r(o.heightMm), r(o.sillMm)].join(','))
    .sort();
  const moveis = (model.componentes ?? [])
    .filter((c) => p.moveis.has(c.id))
    .map((c) => [c.uid, c.tipoId, r(c.at.x), r(c.at.y), r(c.larguraMm), r(c.profundidadeMm), r(c.alturaMm), r(c.rotacaoGraus)].join(','))
    .sort();
  const aneis = p.aneis.map((a) => a.map((q) => `${r(q.x)}:${r(q.y)}`).join(' ')).sort();
  return `${p.uid}|${fnv1a(JSON.stringify([p.numero, p.tipologia, aneis, paredes, vaos, moveis]))}`;
}

/** A unidade (uid) de onde veio um corte gravado — o começo da assinatura. */
export function unidadeDaAssinatura(assinatura: string | null | undefined): string | null {
  const i = (assinatura ?? '').indexOf('|');
  return i > 0 ? assinatura!.slice(0, i) : null;
}

/** O ponto de vista que enquadra a caixa, olhando de `lado` a `elevacaoGraus` (espaço do desenho, metro). */
export function pontoDeVistaDoCorte(caixa: CaixaDeCorte, hip: HipotesesDoCorteDecorado): CenaDoDecorado['pontoDeVista'] {
  const alvo: [number, number, number] = [(caixa.min[0] + caixa.max[0]) / 2, (caixa.min[1] + caixa.max[1]) / 2, (caixa.min[2] + caixa.max[2]) / 2];
  const tanV = Math.tan(((fovVerticalGraus(hip.focalMm, hip.aspecto) * Math.PI) / 180) / 2);
  const tanH = tanV * hip.aspecto;
  const el = (hip.elevacaoGraus * Math.PI) / 180;
  const giro = (GIRO_DO_LADO[hip.lado] * Math.PI) / 180;
  // Do alvo para a câmera. 0° = do sul (−y do desenho, −Z); o giro anda para o leste (+x).
  const para = [Math.cos(el) * Math.sin(giro), Math.sin(el), -Math.cos(el) * Math.cos(giro)];
  // A base da câmera: "direita" na horizontal, "cima" perpendicular às duas.
  const olhar = para.map((n) => -n);
  const dirLen = Math.hypot(olhar[2], olhar[0]) || 1;
  const direita = [-olhar[2] / dirLen, 0, olhar[0] / dirLen];
  const cima = [
    direita[1] * olhar[2] - direita[2] * olhar[1],
    direita[2] * olhar[0] - direita[0] * olhar[2],
    direita[0] * olhar[1] - direita[1] * olhar[0],
  ];
  const ponto = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // A distância em que os 8 cantos da caixa cabem na tela (a esfera em volta sobrava de ~40 %, visto no harness).
  let distancia = 0;
  for (const x of [caixa.min[0], caixa.max[0]]) for (const y of [caixa.min[1], caixa.max[1]]) for (const z of [caixa.min[2], caixa.max[2]]) {
    const v = [x - alvo[0], y - alvo[1], z - alvo[2]];
    const perto = ponto(v, para);
    distancia = Math.max(distancia, perto + Math.abs(ponto(v, direita)) / tanH, perto + Math.abs(ponto(v, cima)) / tanV);
  }
  distancia *= 1.04;
  const posicao: [number, number, number] = [alvo[0] + distancia * para[0], alvo[1] + distancia * para[1], alvo[2] + distancia * para[2]];
  const q = (n: number) => Math.round(n * 1000) / 1000;
  return { chave: `decorado:${posicao.map(q).join(',')}:${hip.focalMm}`, posicao, alvo, focalMm: hip.focalMm };
}

/**
 * A cena do corte da unidade. `mobiliarSugerido` (padrão: só quando a unidade não tem móvel nenhum) põe na CÓPIA do
 * modelo o kit mínimo de cada ambiente — o estudo não muda.
 */
export function cenaDoDecorado(
  model: BlueprintModel,
  unidadeId: ObjectId,
  hipoteses: Partial<HipotesesDoCorteDecorado> = {},
  opcoes: { mobiliarSugerido?: boolean } = {},
): ResultadoDaCena {
  const hip = { ...HIPOTESES_DO_CORTE_DECORADO, ...hipoteses };
  const p = pecasDaUnidade(model, unidadeId);
  if ('motivo' in p) return { ok: false, motivo: p.motivo };
  const nivel = model.levels.find((l) => l.id === p.levelId);
  if (!nivel) return { ok: false, motivo: 'O pavimento da unidade não existe mais no desenho.' };

  // A cópia mobiliada: o kit de cada ambiente da unidade, só quando pedido (padrão: unidade sem móvel).
  const mobiliar = opcoes.mobiliarSugerido ?? p.moveis.size === 0;
  let modelo = model;
  let moveisSugeridos = 0;
  if (mobiliar) {
    const ambientes = model.spaces.filter((s) => p.ambienteIds.has(s.id));
    // Na cópia, o kit entra como peça comum: "sugerida" o 3D desenha translúcida e verde — na imagem de venda, não.
    const comandos = comandosDeMobiliario(ambientes.map((s) => mobiliarDoAmbiente(model, s)), p.levelId, model).map((c) => (c.type === 'AddComponente' ? { ...c, sugerido: false } : c));
    if (comandos.length > 0) {
      try {
        modelo = applyBatch(model, comandos).model;
        moveisSugeridos = comandos.length;
      } catch {
        // Kit que o kernel recusa não derruba o corte: sai sem a sugestão.
        modelo = model;
      }
    }
  }

  // Esconde o que não é da unidade: paredes do pavimento que não a cercam e móveis fora dela.
  const ocultos = new Set<string>();
  for (const w of modelo.walls) if (w.levelId === p.levelId && !p.paredes.has(w.id)) ocultos.add(w.id);
  for (const c of modelo.componentes ?? []) if (c.levelId === p.levelId && !p.aneis.some((a) => dentro(a, c.at))) ocultos.add(c.id);

  // A caixa: o retângulo da unidade com folga; do piso (um pouco abaixo, para a laje) à altura do corte.
  const pontos = p.aneis.flat();
  const xs = pontos.map((q) => q.x);
  const ys = pontos.map((q) => q.y);
  const paredesDaUnidade = modelo.walls.filter((w) => p.paredes.has(w.id));
  const alturaDasParedes = Math.max(...paredesDaUnidade.map((w) => w.heightMm), nivel.defaultHeightMm || 0);
  const altura = hip.alturaDoCorteMm == null ? alturaDasParedes : Math.min(hip.alturaDoCorteMm, alturaDasParedes);
  const piso = nivel.elevationMm;
  const m = (mm: number) => mm / 1000;
  const caixa: CaixaDeCorte = {
    min: [m(Math.min(...xs) - hip.folgaMm), m(piso - 300), m(Math.min(...ys) - hip.folgaMm)],
    max: [m(Math.max(...xs) + hip.folgaMm), m(piso + altura), m(Math.max(...ys) + hip.folgaMm)],
  };

  return {
    ok: true,
    cena: {
      unidadeId,
      numero: p.numero,
      tipologia: p.tipologia,
      levelId: p.levelId,
      modelo,
      ocultos,
      caixa,
      pontoDeVista: pontoDeVistaDoCorte(caixa, hip),
      moveisDoEstudo: p.moveis.size,
      moveisSugeridos,
      assinatura: assinaturaDoDecorado(model, unidadeId)!,
    },
  };
}

/** A situação do corte de uma unidade nos portais, para a Tela Unidades. */
export type SituacaoDoCorte =
  | { tipo: 'SEM_EMPREENDIMENTO' }
  | { tipo: 'TIPOLOGIA_FORA'; tipologia: string }
  | { tipo: 'NUNCA_ENVIADO' }
  | { tipo: 'IMAGEM_ENVIADA'; em: string | null }
  | { tipo: 'DE_OUTRA_UNIDADE'; numero: string | null; em: string | null }
  | { tipo: 'DESATUALIZADO'; em: string | null }
  | { tipo: 'EM_DIA'; em: string | null };

/** O corte que o Empreendimento tem gravado para uma tipologia, como a Tela Unidades precisa dele. */
export interface CorteGravado {
  origem: 'ENVIADA' | 'PLANTA';
  planta_assinatura: string | null;
  updated_at: string | null;
}

/**
 * Compara o corte gravado com o desenho de agora. `tipologiaNoEmpreendimento` = a tipologia existe no cadastro do
 * Empreendimento (unidades ou imóveis) — sem isso, o corte iria para um decorado que nenhuma ficha mostra.
 */
export function situacaoDoCorte(entrada: {
  temEmpreendimento: boolean;
  tipologia: string | null;
  tipologiaNoEmpreendimento: boolean;
  assinaturaAtual: string | null;
  gravado: CorteGravado | null;
  /** uid → número das unidades do desenho, para dizer de qual veio o corte. */
  numeroPorUid: ReadonlyMap<string, string>;
}): SituacaoDoCorte {
  if (!entrada.temEmpreendimento) return { tipo: 'SEM_EMPREENDIMENTO' };
  if (entrada.tipologia && !entrada.tipologiaNoEmpreendimento) return { tipo: 'TIPOLOGIA_FORA', tipologia: entrada.tipologia };
  const g = entrada.gravado;
  if (!g) return { tipo: 'NUNCA_ENVIADO' };
  if (g.origem !== 'PLANTA') return { tipo: 'IMAGEM_ENVIADA', em: g.updated_at };
  const deQuem = unidadeDaAssinatura(g.planta_assinatura);
  const minha = unidadeDaAssinatura(entrada.assinaturaAtual);
  if (deQuem && minha && deQuem !== minha) return { tipo: 'DE_OUTRA_UNIDADE', numero: entrada.numeroPorUid.get(deQuem) ?? null, em: g.updated_at };
  if (g.planta_assinatura !== entrada.assinaturaAtual) return { tipo: 'DESATUALIZADO', em: g.updated_at };
  return { tipo: 'EM_DIA', em: g.updated_at };
}

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : null);

/** A frase da situação, para a coluna e para o diálogo. */
export function textoDaSituacao(s: SituacaoDoCorte): string {
  switch (s.tipo) {
    case 'SEM_EMPREENDIMENTO':
      return 'O estudo não está ligado a um Empreendimento.';
    case 'TIPOLOGIA_FORA':
      return `O Empreendimento não tem a tipologia "${s.tipologia}".`;
    case 'NUNCA_ENVIADO':
      return 'Nunca enviado.';
    case 'IMAGEM_ENVIADA':
      return `A tipologia usa uma imagem enviada${data(s.em) ? ` em ${data(s.em)}` : ''}.`;
    case 'DE_OUTRA_UNIDADE':
      return `Enviado da unidade ${s.numero ?? '(que não existe mais)'}${data(s.em) ? ` em ${data(s.em)}` : ''}.`;
    case 'DESATUALIZADO':
      return `O desenho mudou desde o envio${data(s.em) ? ` de ${data(s.em)}` : ''}.`;
    case 'EM_DIA':
      return `É o deste desenho${data(s.em) ? ` (enviado em ${data(s.em)})` : ''}.`;
  }
}
