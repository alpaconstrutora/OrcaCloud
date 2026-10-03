/**
 * ESTUDO DE MASSA — A PLANTA INTERNA DE CADA UNIDADE (fase M6b do plano
 * `2026-10-01-estudo-de-massa.md`, §19 e §20 do pedido).
 *
 * Depois do pavimento tipo montado (M6a), cada unidade é um ambiente só. Aqui
 * o GERADOR DE PLANTAS da E6.2 roda DENTRO de cada uma — o programa da
 * tipologia (2 quartos, 3 quartos com suíte…), o retângulo da unidade como
 * envelope, a ENTRADA voltada para o corredor — e as paredes internas, as
 * portas internas e as janelas da fachada entram no pavimento tipo, com cada
 * cômodo como parte da unidade (E2.2). As cópias vivas (E2.1) levam tudo para
 * os outros andares.
 *
 * ─── NO QUADRO DO BLOCO ─────────────────────────────────────────────────────
 *
 * O gerador trabalha num retângulo de eixos alinhados. O bloco pode estar
 * girado (o gerador de massa orienta pela frente do lote): rodar o gerador no
 * desenho perderia área no retângulo inscrito. Por isso ele roda no quadro do
 * bloco — o retângulo exato da unidade, na origem — e o resultado volta ao
 * desenho por transformação rígida (offsets de abertura não mudam).
 *
 * ─── O QUE ENTRA, E O QUE NÃO ───────────────────────────────────────────────
 *
 *  - Entram as paredes INTERNAS do gerador e as portas nelas.
 *  - As paredes EXTERNAS dele não entram: a unidade já tem as dela (fachada,
 *    corredor, divisa com o vizinho). As janelas que ele pôs nelas entram só
 *    se caem numa parede de FACHADA (o perímetro do bloco) — janela para o
 *    corredor ou para o apartamento vizinho não existe.
 *  - A porta de entrada do gerador não entra: a M6a já abriu a da unidade no
 *    corredor.
 *  - Unidades iguais (mesma tipologia, mesmas medidas, mesmo lado do corredor)
 *    reaproveitam a MESMA geração — mesma planta, determinística.
 *  - O zoneamento do gerador (faixa social na frente, íntima no fundo) foi
 *    feito para casa; numa unidade rasa e larga, com a "frente" no corredor, a
 *    sala cai longe da fachada e perde a janela. Por isso cada unidade testa a
 *    frente pelo corredor e pelas duas pontas, com duas sementes, e fica com o
 *    arranjo em que MAIS cômodos que pedem luz tocam a fachada (empate: o do
 *    corredor, que põe a entrada certa). Medido na exploração: só com a frente
 *    no corredor, 12 janelas caíam no corredor ou no vizinho.
 *  - Unidade comercial (sala, loja) fica aberta: o gerador é de residência.
 *
 * Fora, dito: o Grupo espelhado da E2.3 (editar uma propaga às iguais) — aqui
 * a repetição é geométrica; transformar em grupo é passo seguinte.
 */
import { applyBatch, pointInPolygon, uidDeterministico, type BlueprintModel, type Bloco, type Command, type ObjectId, type Point, type Wall } from './blueprintKernel';
import { gerar, type ResultadoDoGerador } from './blueprintGerador';
import { atualizarItem, programaSemente, removerItem, type Programa } from './blueprintPrograma';
import { FICHA_DO_USO } from './blueprintPrograma';
import type { Produto, TipologiaDoProduto } from './blueprintProduto';
import { ALEM_MM, HIPOTESES_DO_PAVIMENTO_TIPO_PADRAO, pavimentoTipoMontado, quadroDoBloco, type QuadroDoBloco } from './blueprintPavimentoTipoDaMassa';

/** O programa de necessidades de uma tipologia do produto (sementes da E4.1 ajustadas aos dormitórios). */
export function programaDaTipologia(t: Pick<TipologiaDoProduto, 'uso' | 'dormitorios' | 'nome'>): Programa | null {
  if (t.uso !== 'RESIDENCIAL') return null;
  if (t.dormitorios >= 3) {
    let p = programaSemente('APTO_3Q_SUITE');
    p = atualizarItem(p, 'dorm', { quantidade: t.dormitorios - 1 });
    return { ...p, nome: t.nome };
  }
  let p = programaSemente('APTO_2Q');
  if (t.dormitorios <= 0) p = removerItem(p, 'dorm');
  else p = atualizarItem(p, 'dorm', { quantidade: t.dormitorios });
  return { ...p, nome: t.nome };
}

export interface PlantaDeUmaUnidade {
  numero: string;
  tipologia: string;
  /** Os cômodos que nasceram (nome e área do gerador). */
  ambientes: { nome: string; areaM2: number }[];
  /** "gerada" | "a mesma da 101" | o motivo de não ter. */
  origem: string;
  janelas: number;
  portas: number;
  /** Cômodos que pedem luz/fachada e ficaram SEM fachada (não há onde pôr janela) — para o projetista ajustar. */
  semFachada: string[];
}

export interface PlantasDasUnidades {
  comandos: Command[];
  model: BlueprintModel;
  unidades: PlantaDeUmaUnidade[];
  geracoes: number;
  avisos: string[];
}

interface RetLocal {
  a0: number;
  b0: number;
  a1: number;
  b1: number;
}

const paraLocal = (q: QuadroDoBloco, p: Point) => {
  const dx = p.x - q.o.x;
  const dy = p.y - q.o.y;
  return { a: dx * q.u.x + dy * q.u.y, b: dx * q.v.x + dy * q.v.y };
};
const noMundo = (q: QuadroDoBloco, a: number, b: number): Point => ({ x: Math.round(q.o.x + q.u.x * a + q.v.x * b), y: Math.round(q.o.y + q.u.y * a + q.v.y * b) });
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A unidade já tem planta interna? (mais de um ambiente no pavimento.) */
export function unidadeTemPlanta(model: BlueprintModel, numero: string, levelId: ObjectId): boolean {
  const u = (model.unidades ?? []).find((x) => x.numero === numero);
  if (!u) return false;
  return model.labels.filter((l) => l.levelId === levelId && u.etiquetaUids.includes(l.uid)).length > 1;
}

/** A parede (do pavimento) cujo eixo contém o ponto. */
function paredeNoPonto(paredes: readonly Wall[], p: Point): { w: Wall; off: number } | null {
  for (const w of paredes) {
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const t = ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / len;
    const dist = Math.abs((p.x - w.a.x) * dy - (p.y - w.a.y) * dx) / len;
    if (dist <= 5 && t >= 0 && t <= len) return { w, off: t };
  }
  return null;
}

export function plantasDasUnidades(model: BlueprintModel, b: Bloco, produto: Produto, semente = 1): PlantasDasUnidades {
  const avisos: string[] = [];
  const tipo = pavimentoTipoMontado(model, b);
  const q = quadroDoBloco(b);
  if (!tipo || !q) return { comandos: [], model, unidades: [], geracoes: 0, avisos: [!tipo ? `Monte o pavimento tipo de "${b.nome}" primeiro (painel do bloco).` : `"${b.nome}" não é retangular.`] };
  const hipT = HIPOTESES_DO_PAVIMENTO_TIPO_PADRAO;
  const perimetro = (w: Wall) => {
    // As 4 paredes do contorno do bloco: eixo sobre a borda do retângulo do bloco.
    const pa = paraLocal(q, w.a);
    const pb = paraLocal(q, w.b);
    const naBorda = (v: number, alvo: number) => Math.abs(v - alvo) < 5;
    return (naBorda(pa.b, 0) && naBorda(pb.b, 0)) || (naBorda(pa.b, q.D) && naBorda(pb.b, q.D)) || (naBorda(pa.a, 0) && naBorda(pb.a, 0)) || (naBorda(pa.a, q.W) && naBorda(pb.a, q.W));
  };

  // As unidades do pavimento tipo, com o ambiente e a tipologia do produto.
  type Alvo = { numero: string; unidadeId: ObjectId; t: TipologiaDoProduto | null; tipologiaNome: string; r: RetLocal; ladoA: boolean };
  const alvos: Alvo[] = [];
  for (const u of model.unidades ?? []) {
    const etiquetas = model.labels.filter((l) => l.levelId === tipo.id && u.etiquetaUids.includes(l.uid));
    if (etiquetas.length === 0) continue;
    if (etiquetas.length > 1) {
      avisos.push(`Unidade ${u.numero}: já tem planta interna (${etiquetas.length} ambientes) — não foi refeita.`);
      continue;
    }
    const s = model.spaces.find((x) => x.levelId === tipo.id && x.labelUid === etiquetas[0].uid);
    if (!s) continue;
    const pts = s.ring.map((p) => paraLocal(q, p));
    const as = pts.map((p) => p.a);
    const bs = pts.map((p) => p.b);
    // O anel do ambiente JÁ está nos EIXOS das paredes (o arranjo do kernel é pelas linhas de centro): o
    // retângulo da unidade é a caixa dele. (Expandir pela meia espessura — a primeira versão — empurrava a
    // unidade 75–100 mm para fora: janela fora do perímetro e parede interna entrando no vizinho.)
    const r: RetLocal = { a0: Math.min(...as), a1: Math.max(...as), b0: Math.min(...bs), b1: Math.max(...bs) };
    const t = produto.tipologias.find((x) => x.nome === u.tipologia) ?? null;
    alvos.push({ numero: u.numero, unidadeId: u.id, t, tipologiaNome: u.tipologia ?? '—', r, ladoA: r.b0 < hipT.paredeExternaMm });
  }
  if (alvos.length === 0) return { comandos: [], model, unidades: [], geracoes: 0, avisos: avisos.length ? avisos : ['O pavimento tipo não tem unidade sem planta.'] };

  // Gera (ou reaproveita) por tipologia × medidas × lado.
  const cache = new Map<string, { res: ResultadoDoGerador; semFachada: string[] } | null>();
  let geracoes = 0;
  const comandos: Command[] = [];
  let m = model;
  const aplicar = (cs: Command[]) => {
    if (!cs.length) return;
    m = applyBatch(m, cs).model;
    comandos.push(...cs);
  };
  const resultadoDe = (a: Alvo): { r: ResultadoDoGerador | null; semFachada: string[]; chave: string; reaproveitada: boolean } => {
    const W = Math.round(a.r.a1 - a.r.a0);
    const D = Math.round(a.r.b1 - a.r.b0);
    // Lados de FACHADA no quadro local da unidade: o do lado dela e, se estiver na ponta do bloco, a ponta.
    const fachadaEsq = a.r.a0 < hipT.paredeExternaMm;
    const fachadaDir = a.r.a1 > q.W - hipT.paredeExternaMm;
    const chave = `${a.t?.id ?? a.tipologiaNome}|${Math.round(W / 50)}|${Math.round(D / 50)}|${a.ladoA ? 'A' : 'B'}|${fachadaEsq ? 'e' : ''}${fachadaDir ? 'd' : ''}`;
    if (cache.has(chave)) {
      const c = cache.get(chave)!;
      return { r: c?.res ?? null, semFachada: c?.semFachada ?? [], chave, reaproveitada: true };
    }
    const programa = a.t ? programaDaTipologia(a.t) : null;
    let melhor: { res: ResultadoDoGerador; nota: number; corredor: boolean } | null = null;
    const yFachada = a.ladoA ? 0 : D;
    const pedeLuz = (amb: ResultadoDoGerador['ambientes'][number]) => {
      const f = FICHA_DO_USO[amb.item.uso];
      return f.exigeFachada || f.exigeIluminacao;
    };
    const tocaFachada = (amb: ResultadoDoGerador['ambientes'][number]) => {
      const r = amb.ret;
      return Math.abs((a.ladoA ? r.y0 : r.y1) - yFachada) < 60 || (fachadaEsq && r.x0 < 60) || (fachadaDir && r.x1 > W - 60);
    };
    if (programa) {
      const nota = (res: ResultadoDoGerador) => res.ambientes.filter((amb) => pedeLuz(amb) && tocaFachada(amb)).length;
      // Frente pelo corredor (a entrada certa) e pelas duas pontas; duas sementes cada.
      const frentes: { dir: Point; corredor: boolean }[] = [
        { dir: { x: 0, y: a.ladoA ? 1 : -1 }, corredor: true },
        { dir: { x: -1, y: 0 }, corredor: false },
        { dir: { x: 1, y: 0 }, corredor: false },
      ];
      let erro: string | null = null;
      for (const f of frentes) {
        for (const sem of [semente, semente + 1]) {
          try {
            const res = gerar({ programa, envelope: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: 0, y: D }], direcaoDaFrente: f.dir, rotacaoNorteDeg: null, latitudeGraus: -15.79 }, sem, { automaticos: false });
            geracoes++;
            const n = nota(res);
            if (!melhor || n > melhor.nota || (n === melhor.nota && f.corredor && !melhor.corredor)) melhor = { res, nota: n, corredor: f.corredor };
          } catch (e) {
            erro = e instanceof Error ? e.message : String(e);
          }
        }
      }
      if (!melhor && erro) avisos.push(`Unidade ${a.numero}: o gerador não fechou a planta (${erro}).`);
    }
    const res = melhor ? (melhor as { res: ResultadoDoGerador }).res : null;
    const semFachada = res ? res.ambientes.filter((amb) => pedeLuz(amb) && !tocaFachada(amb)).map((amb) => amb.nome) : [];
    cache.set(chave, res ? { res, semFachada } : null);
    return { r: res, semFachada, chave, reaproveitada: false };
  };

  const resumo: PlantaDeUmaUnidade[] = [];
  const primeiraDe = new Map<string, string>();
  const nomesPorUnidade: { a: Alvo; res: ResultadoDoGerador }[] = [];
  const paredesDaUnidade: Command[] = [];
  /** Aberturas: a de parede interna já vira comando (pela identidade da parede); a de fachada espera achar a parede do perímetro. */
  type Pendente = { tipo: 'interna'; cmd: Command } | { tipo: 'fachada'; centro: Point; widthMm: number; heightMm: number; sillMm: number };
  const aberturasPendentes: Pendente[] = [];
  for (const a of alvos) {
    if (!a.t || a.t.uso !== 'RESIDENCIAL') {
      resumo.push({ numero: a.numero, tipologia: a.tipologiaNome, ambientes: [], origem: !a.t ? `tipologia "${a.tipologiaNome}" não está no produto` : 'unidade comercial: fica aberta', janelas: 0, portas: 0, semFachada: [] });
      continue;
    }
    const { r: res, semFachada, chave, reaproveitada } = resultadoDe(a);
    if (!res) {
      resumo.push({ numero: a.numero, tipologia: a.tipologiaNome, ambientes: [], origem: 'o gerador não fechou a planta', janelas: 0, portas: 0, semFachada: [] });
      continue;
    }
    if (!primeiraDe.has(chave)) primeiraDe.set(chave, a.numero);
    const W = Math.round(a.r.a1 - a.r.a0);
    const D = Math.round(a.r.b1 - a.r.b0);
    // ⚠️ O gerador encaixa o retângulo na malha de 50 mm: a borda dele pode ficar até 25 mm DENTRO da unidade.
    // As paredes de borda são reconhecidas pelo retângulo DELE; as pontas das internas que chegam nessa borda
    // são esticadas até a borda da unidade (o eixo das paredes dela) — senão nasciam paredes duplicadas coladas
    // na divisória, e as internas não encostavam nas paredes da unidade.
    const rg = res.retangulo;
    const esticar = (p: Point): Point => ({
      x: Math.abs(p.x - rg.x0) < 60 ? 0 : Math.abs(p.x - rg.x1) < 60 ? W : p.x,
      y: Math.abs(p.y - rg.y0) < 60 ? 0 : Math.abs(p.y - rg.y1) < 60 ? D : p.y,
    });
    const paraDesenho = (p: Point) => noMundo(q, a.r.a0 + p.x, a.r.b0 + p.y);
    // Bloco GIRADO: a parede passa ALEM_MM de cada ponta para a junção em T existir depois do arredondamento
    // (o kernel só corta em interseção exata) — ver `montarPavimentoTipo`.
    const girado = Math.abs(q.u.x * q.u.y) > 1e-9;
    const pontas = (w: Wall): [Point, Point] => {
      const ea = esticar(w.a);
      const eb = esticar(w.b);
      if (!girado) return [ea, eb];
      const l = Math.hypot(eb.x - ea.x, eb.y - ea.y) || 1;
      const dx = ((eb.x - ea.x) / l) * ALEM_MM;
      const dy = ((eb.y - ea.y) / l) * ALEM_MM;
      return [{ x: ea.x - dx, y: ea.y - dy }, { x: eb.x + dx, y: eb.y + dy }];
    };
    const naBorda = (w: Wall) => {
      const on = (p: Point) => Math.abs(p.x - rg.x0) < 2 || Math.abs(p.x - rg.x1) < 2 || Math.abs(p.y - rg.y0) < 2 || Math.abs(p.y - rg.y1) < 2;
      const mesmaLinha = Math.abs(w.a.x - w.b.x) < 2 ? Math.abs(w.a.x - rg.x0) < 2 || Math.abs(w.a.x - rg.x1) < 2 : Math.abs(w.a.y - rg.y0) < 2 || Math.abs(w.a.y - rg.y1) < 2;
      return on(w.a) && on(w.b) && mesmaLinha;
    };
    const paredesGer = res.model.walls.filter((w) => w.levelId === res.levelId);
    const uidDe = new Map<ObjectId, string>();
    let janelas = 0;
    let portas = 0;
    paredesGer.forEach((w, k) => {
      if (naBorda(w)) return;
      const uid = uidDeterministico(`massa:planta:${tipo.uid}:${a.numero}:parede:${k}`);
      uidDe.set(w.id, uid);
      const [pa, pb] = pontas(w);
      paredesDaUnidade.push({ type: 'AddWall', levelId: tipo.id, a: paraDesenho(pa), b: paraDesenho(pb), thicknessMm: w.thicknessMm, heightMm: w.heightMm, uid });
    });
    for (const o of res.model.openings) {
      const w = paredesGer.find((x) => x.id === o.wallId);
      if (!w) continue;
      const uid = uidDe.get(w.id);
      if (uid) {
        // `a` esticado (e, girado, passado do encontro) anda para trás ao longo da parede: o offset cresce o mesmo tanto.
        const ea = pontas(w)[0];
        const len0 = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
        const anda = ((w.a.x - ea.x) * (w.b.x - w.a.x) + (w.a.y - ea.y) * (w.b.y - w.a.y)) / len0;
        aberturasPendentes.push({ tipo: 'interna', cmd: { type: 'AddOpening', wallId: '', wallUid: uid, kind: o.kind, offsetMm: Math.round(o.offsetMm + anda), widthMm: o.widthMm, heightMm: o.heightMm, sillMm: o.sillMm } });
        if (o.kind === 'door') portas++;
        continue;
      }
      // Abertura numa parede EXTERNA do gerador: só janela, e só se cai na fachada do bloco.
      if (o.kind !== 'window') continue;
      const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
      const t = (o.offsetMm + o.widthMm / 2) / len;
      // O centro na borda DO GERADOR (até 25 mm para dentro): esticado até a borda da unidade, onde está a parede.
      const centro = paraDesenho(esticar({ x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t }));
      aberturasPendentes.push({ tipo: 'fachada', centro, widthMm: o.widthMm, heightMm: o.heightMm, sillMm: o.sillMm });
      janelas++;
    }
    nomesPorUnidade.push({ a, res });
    resumo.push({
      numero: a.numero,
      tipologia: a.tipologiaNome,
      ambientes: res.ambientes.map((x) => ({ nome: x.nome, areaM2: r2(x.areaM2) })),
      origem: reaproveitada ? `a mesma planta da ${primeiraDe.get(chave)}` : 'gerada',
      janelas,
      portas,
      semFachada,
    });
  }

  // 1. Paredes internas de todas as unidades (um lote).
  aplicar(paredesDaUnidade);

  // 2. Aberturas: as das paredes internas por uid; as da fachada resolvidas na parede do perímetro.
  const paredesTipo = m.walls.filter((w) => w.levelId === tipo.id);
  const fachada = paredesTipo.filter(perimetro);
  const aberturas: Command[] = [];
  let janelasDescartadas = 0;
  for (const p of aberturasPendentes) {
    if (p.tipo === 'interna') {
      aberturas.push(p.cmd);
      continue;
    }
    // Janela: só na parede do PERÍMETRO (fachada). No corredor ou na divisa com o vizinho, não existe.
    const hit = paredeNoPonto(fachada, p.centro);
    if (!hit) {
      janelasDescartadas++;
      continue;
    }
    aberturas.push({ type: 'AddOpening', wallId: hit.w.id, kind: 'window', offsetMm: Math.max(0, Math.round(hit.off - p.widthMm / 2)), widthMm: p.widthMm, heightMm: p.heightMm, sillMm: p.sillMm });
  }
  // O kernel recusa vão sobreposto: confere ANTES (por parede, com folga) e aplica num lote só — aplicar um a um
  // re-sincroniza as cópias vivas a cada comando (medido: 3 s para 5 unidades).
  const ocupado = new Map<string, { ini: number; fim: number }[]>();
  for (const o of m.openings) {
    const w = m.walls.find((x) => x.id === o.wallId);
    if (w) ocupado.set(w.uid, [...(ocupado.get(w.uid) ?? []), { ini: o.offsetMm, fim: o.offsetMm + o.widthMm }]);
  }
  const aceitas: Command[] = [];
  for (const o of aberturas) {
    if (o.type !== 'AddOpening') continue;
    const uid = o.wallUid ?? m.walls.find((x) => x.id === o.wallId)?.uid;
    if (!uid) continue;
    const lista = ocupado.get(uid) ?? [];
    if (lista.some((x) => o.offsetMm < x.fim + 100 && o.offsetMm + o.widthMm > x.ini - 100)) {
      janelasDescartadas++;
      continue;
    }
    ocupado.set(uid, [...lista, { ini: o.offsetMm, fim: o.offsetMm + o.widthMm }]);
    aceitas.push(o);
  }
  try {
    aplicar(aceitas);
  } catch {
    // Algum vão que a conferência não pegou (fim de parede, por exemplo): cai para um a um.
    for (const o of aceitas) {
      try {
        aplicar([o]);
      } catch {
        janelasDescartadas++;
      }
    }
  }
  if (janelasDescartadas > 0) avisos.push(`${janelasDescartadas} abertura(s) do gerador ficaram de fora (janela que daria para o corredor ou para o vizinho, ou vão sobreposto).`);

  // 3. Os cômodos: nome do gerador e a unidade (E2.2).
  const nomes: Command[] = [];
  for (const { a, res } of nomesPorUnidade) {
    for (const amb of res.ambientes) {
      const c = noMundo(q, a.r.a0 + (amb.ret.x0 + amb.ret.x1) / 2, a.r.b0 + (amb.ret.y0 + amb.ret.y1) / 2);
      const s = m.spaces.find((x) => x.levelId === tipo.id && pointInPolygon(x.ring, c));
      if (!s) continue;
      if (s.labelUid) nomes.push({ type: 'NameSpace', spaceId: s.id, name: amb.nome, tipoDeAmbiente: FICHA_DO_USO[amb.item.uso].tipoNbr5410 });
      nomes.push({ type: 'SetUnidadeDoAmbiente', spaceId: s.id, unidadeId: a.unidadeId, nome: amb.nome });
    }
  }
  aplicar(nomes);

  const semLuz = resumo.reduce((n, u) => n + u.semFachada.length, 0);
  if (semLuz > 0) avisos.push(`${semLuz} cômodo(s) que pedem luz ficaram sem fachada (sem onde pôr janela): o gerador é de casa, e a unidade rasa e larga não cabe no zoneamento dele — ajuste à mão (a lista está por unidade).`);
  return { comandos, model: m, unidades: resumo, geracoes, avisos };
}
