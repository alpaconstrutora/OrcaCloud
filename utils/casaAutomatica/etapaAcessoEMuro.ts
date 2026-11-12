/**
 * Casa automática — etapa(s) `portaDaFrente`, `lancarEscadaDeAcesso`, `garagemNoQuadro`, `lancarRampaDaGaragem`, `lancarMuroDaCasa` de `planejarComPavimentos`, extraída(s) com o
 * `ContextoDaCasa` (P2, 12/11/2026). O marco das 8 casas prova que o motor gera o mesmo.
 */
import { planejarMuroDaCasa } from '../blueprintMuroDaCasa';
import type { PlanoDoMuroDaCasa } from '../blueprintMuroDaCasa';
import { pointInPolygon } from '../blueprintKernel';
import type { Point } from '../blueprintKernel';
import { HIPOTESES_DO_GERADOR_PADRAO } from '../blueprintGerador';
import { localDoElemento } from '../blueprintLocalDaPendencia';
import { comLocal, pct, f2, ROTULO_DA_ETAPA_DA_CASA } from './hipoteses';
import { paraLocal, paraMundo } from './quadroEImplantacao';
import type { ContextoDaCasa } from './contexto';

export function portaDaFrente(ctx: ContextoDaCasa) {
  const { entrada, hipGerador, implantacao } = ctx;

  const qd = implantacao.quadro;
  const rlE = implantacao.retanguloLocal;
  const meia = (hipGerador.espessuraExternaMm ?? HIPOTESES_DO_GERADOR_PADRAO.espessuraExternaMm) / 2;
  return (
    ctx.m.openings
      .filter((o) => o.kind === 'door')
      .map((o) => ({ o, w: ctx.m.walls.find((x) => x.id === o.wallId) }))
      .filter((x): x is { o: (typeof ctx.m.openings)[number]; w: (typeof ctx.m.walls)[number] } => !!x.w && x.w.levelId === entrada.levelId)
      .map(({ o, w }) => {
        const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
        const t = o.offsetMm + o.widthMm / 2;
        const meioDaPorta = { x: w.a.x + ((w.b.x - w.a.x) / L) * t, y: w.a.y + ((w.b.y - w.a.y) / L) * t };
        return { o, meioDaPorta, local: paraLocal(qd, meioDaPorta) };
      })
      .filter((x) => Math.abs(x.local.y - rlE.y0) <= meia + 1)
      .sort((p, q2) => q2.o.widthMm - p.o.widthMm)[0] ?? null
  );
}

export function lancarEscadaDeAcesso(ctx: ContextoDaCasa) {
  const { aplicar, entrada, hip, hipGerador, implantacao, pendencias, portaDaFrente } = ctx;

  const tr = ctx.terraplenagemDaCasa;
  if (!tr || tr.entrada.tipo === 'NENHUMA') return;
  const e = tr.entrada;
  const sentido = e.desnivelMm > 0 ? 'sobe' : 'desce';
  const desc =
    e.tipo === 'RAMPA'
      ? `rampa de ${(e.comprimentoMm / 1000).toLocaleString('pt-BR')} m a ${hip.terraplenagem.rampaMaximaPct.toLocaleString('pt-BR')} %`
      : `escada de ${e.degraus} degrau(s) de ${e.espelhoMm} mm (${(e.comprimentoMm / 1000).toLocaleString('pt-BR')} m)`;
  const desnivel = `${(Math.abs(e.desnivelMm) / 1000).toLocaleString('pt-BR')} m`;
  if (!e.cabe || e.cotaDaCalcadaMm == null) {
    pendencias.push({ grupo: 'VERIFICACAO', texto: `Terraplenagem: a entrada ${sentido} ${desnivel} da calçada ao piso — ${desc}, que não cabe no recuo de frente; desenhe o acesso à mão.` });
    return;
  }
  const qd = implantacao.quadro;
  const rlE = implantacao.retanguloLocal;
  const meia = (hipGerador.espessuraExternaMm ?? HIPOTESES_DO_GERADOR_PADRAO.espessuraExternaMm) / 2;
  const porta = portaDaFrente();
  if (!porta) {
    pendencias.push({ grupo: 'NAO_DECIDIDO', texto: `Terraplenagem: a entrada ${sentido} ${desnivel} da calçada ao piso — ${desc}; a porta de entrada não está na fachada da frente: desenhe o acesso à mão.` });
    return;
  }
  const naFace = paraMundo(qd, { x: porta.local.x, y: rlE.y0 - meia });
  const naRua = paraMundo(qd, { x: porta.local.x, y: rlE.y0 - meia - e.comprimentoMm });
  const inteiro = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });
  // Do baixo para o alto: a calçada abaixo do piso → começa na rua; acima → começa na porta.
  const pontos = e.desnivelMm > 0 ? [inteiro(naRua), inteiro(naFace)] : [inteiro(naFace), inteiro(naRua)];
  try {
    aplicar([
      {
        type: 'AddEscada',
        levelId: entrada.levelId,
        pontos,
        tipo: e.tipo === 'RAMPA' ? 'RAMPA' : 'ESCADA',
        larguraMm: Math.max(1200, porta.o.widthMm + 300),
        alvoEspelhoMm: e.tipo === 'ESCADA' ? Math.min(hip.terraplenagem.espelhoMaximoMm, Math.max(1, e.espelhoMm)) : 175,
        rotulo: 'Acesso',
        desdeCotaMm: e.cotaDaCalcadaMm,
      },
    ]);
    pendencias.push({ grupo: 'CONFERIR', texto: `Terraplenagem: a entrada ${sentido} ${desnivel} da calçada ao piso — ${desc}, lançada diante da porta de entrada.`, ...comLocal(localDoElemento(ctx.m, [porta.o.id])) });
  } catch (x) {
    pendencias.push({ grupo: 'VERIFICACAO', texto: `Terraplenagem: a escada de acesso não entrou (${x instanceof Error ? x.message : String(x)}) — desenhe-a à mão.`, ...comLocal(localDoElemento(ctx.m, [porta.o.id])) });
  }
}

export function garagemNoQuadro(ctx: ContextoDaCasa) {
  const { entrada, implantacao } = ctx;

  const qd = implantacao.quadro;
  const et = ctx.m.labels.find((l) => l.levelId === entrada.levelId && l.uso === 'GARAGEM');
  const sp = et ? ctx.m.spaces.find((x) => x.levelId === entrada.levelId && pointInPolygon(x.ring, et.at)) : undefined;
  if (!sp) return null;
  const pts = sp.ring.map((p) => paraLocal(qd, p));
  return { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)) };
}

export function lancarRampaDaGaragem(ctx: ContextoDaCasa) {
  const { aplicar, entrada, garagemNoQuadro, hip, hipGerador, implantacao, pendencias } = ctx;

  const tr = ctx.terraplenagemDaCasa;
  const leitor = entrada.leitorDoTerreno;
  if (!tr || !leitor) return;
  const g = garagemNoQuadro();
  if (!g) return;
  const qd = implantacao.quadro;
  const rlG = implantacao.retanguloLocal;
  const meia = (hipGerador.espessuraExternaMm ?? HIPOTESES_DO_GERADOR_PADRAO.espessuraExternaMm) / 2;
  const yF = Math.min(...(entrada.ctx.terreno?.anel ?? []).map((p) => paraLocal(qd, p).y));
  const xm = (g.x0 + g.x1) / 2;
  const rua = leitor.cotaEmM(paraMundo(qd, { x: xm, y: yF }));
  if (rua == null || !Number.isFinite(rua)) return;
  const calcadaMm = Math.round((rua - leitor.cotaZeroM) * 1000);
  const delta = tr.elevacaoDoTerreoMm - calcadaMm;
  if (Math.abs(delta) <= hip.terraplenagem.desnivelSemDegrauMm) return;
  const pct = hip.terraplenagem.rampaDeVeiculosMaxPct;
  const comprimento = Math.ceil(Math.abs(delta) / (pct / 100));
  const face = rlG.y0 - meia;
  const disponivel = face - (yF + hip.muro.espessuraMm);
  const sentido = delta > 0 ? 'sobe' : 'desce';
  if (comprimento > disponivel) {
    pendencias.push({ grupo: 'VERIFICACAO', texto: `Garagem: a rampa de veículos ${sentido} ${f2(Math.abs(delta) / 1000)} m da rua ao piso — a ${f2(pct)} %, ${f2(comprimento / 1000)} m, e só há ${f2(Math.max(0, disponivel) / 1000)} m entre o muro e a fachada; desenhe a garagem na cota da rua ou a rampa mais inclinada, à mão.` });
    return;
  }
  const naFace = paraMundo(qd, { x: xm, y: face });
  const naRua = paraMundo(qd, { x: xm, y: face - comprimento });
  const inteiro = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });
  try {
    aplicar([
      {
        type: 'AddEscada',
        levelId: entrada.levelId,
        pontos: delta > 0 ? [inteiro(naRua), inteiro(naFace)] : [inteiro(naFace), inteiro(naRua)],
        tipo: 'RAMPA',
        veicular: true,
        larguraMm: Math.max(2500, Math.round(g.x1 - g.x0)),
        rotulo: 'Rampa da garagem',
        desdeCotaMm: calcadaMm,
      },
    ]);
    pendencias.push({ grupo: 'CONFERIR', texto: `Garagem: rampa de veículos ${sentido === 'sobe' ? 'subindo' : 'descendo'} ${f2(Math.abs(delta) / 1000)} m em ${f2(comprimento / 1000)} m (${f2(pct)} %), da rua à garagem — confira a inclinação no código de obras.` });
  } catch (x) {
    pendencias.push({ grupo: 'VERIFICACAO', texto: `Garagem: a rampa de veículos não entrou (${x instanceof Error ? x.message : String(x)}) — desenhe-a à mão.` });
  }
}

export function lancarMuroDaCasa(ctx: ContextoDaCasa): PlanoDoMuroDaCasa['resumo'] | null {
  const { aplicar, entrada, etapa, garagemNoQuadro, hip, hipGerador, implantacao, pendencias, portaDaFrente, temTerreno } = ctx;

  if (!hip.muro.lancar) {
    etapa('MURO', ROTULO_DA_ETAPA_DA_CASA.MURO, 'NAO_EXIGIDA', 0, 'desligado nas hipóteses da casa');
    return null;
  }
  try {
    const qd = implantacao.quadro;
    const rlM = implantacao.retanguloLocal;
    const meia = (hipGerador.espessuraExternaMm ?? HIPOTESES_DO_GERADOR_PADRAO.espessuraExternaMm) / 2;
    const local = (p: Point) => paraLocal(qd, p);
    const porta = portaDaFrente();
    const acesso = (ctx.m.stairs ?? []).find((x) => x.levelId === entrada.levelId && x.desdeCotaMm != null && !x.veicular);
    // A garagem coberta: o ambiente de uso GARAGEM no térreo — a largura dela e até a fachada.
    const garagemLocal = garagemNoQuadro();
    const leitor = entrada.leitorDoTerreno;
    const plano = planejarMuroDaCasa(
      {
        levelId: entrada.levelId,
        anelDoLote: entrada.ctx.terreno?.anel ?? [],
        limites: entrada.ctx.limites,
        quadro: qd,
        portaX: porta ? porta.local.x : null,
        faceDaFachadaY: rlM.y0 - meia,
        inicioDaEscadaY: acesso ? Math.min(...acesso.pontos.map((p) => local(p).y)) : null,
        casaNoMundo: implantacao.anelNoMundo,
        meiaParedeMm: meia,
        // A escada de acesso no chão: a faixa dela no quadro (o percurso ± meia largura).
        obstaculos: (ctx.m.stairs ?? [])
          .filter((x) => x.levelId === entrada.levelId && x.desdeCotaMm != null)
          .map((x) => {
            const pts = x.pontos.map(local);
            const xs = pts.map((p) => p.x);
            const ys = pts.map((p) => p.y);
            const dx = Math.max(...xs) - Math.min(...xs);
            const dy = Math.max(...ys) - Math.min(...ys);
            const w = x.larguraMm / 2;
            return dy >= dx ? { x0: Math.min(...xs) - w, x1: Math.max(...xs) + w, y0: Math.min(...ys), y1: Math.max(...ys) } : { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys) - w, y1: Math.max(...ys) + w };
          }),
        garagem: garagemLocal ? { x0: garagemLocal.x0, x1: garagemLocal.x1, yFim: rlM.y0 - meia } : null,
        vagasDescobertas: !garagemLocal && implantacao.vagasDescobertas ? implantacao.vagasDescobertas.caixa : null,
        cotaDoTerreno:
          temTerreno && leitor
            ? (p: Point) => {
                const c = leitor.cotaEmM(p);
                return c == null || !Number.isFinite(c) ? null : (c - leitor.cotaZeroM) * 1000;
              }
            : null,
      },
      hip.muro,
    );
    for (const pd of plano.pendencias) pendencias.push(pd);
    const n = aplicar(plano.comandos);
    const r = plano.resumo;
    etapa(
      'MURO',
      ROTULO_DA_ETAPA_DA_CASA.MURO,
      'LANCOU',
      n,
      `frente ${f2(r.frenteM)} m e divisas ${f2(r.divisasM)} m; ${r.portoesDePedestre} portão(ões) de pedestre e ${r.portoesDeGaragem} de garagem; calçadas ${f2(r.calcadasM2)} m²`,
    );
    // A permeabilidade com as calçadas desenhadas: a projeção + o impermeável delas contra o mínimo da zona.
    const lote = entrada.ctx.terreno?.areaMm2 ? entrada.ctx.terreno.areaMm2 / 1e6 : null;
    const minimo = entrada.ctx.zona.taxaPermeabilidadeMinPct;
    if (lote && minimo != null) {
      const permeavel = ((lote - implantacao.medidas.projecaoM2 - r.impermeavelM2) / lote) * 100;
      if (permeavel < minimo)
        pendencias.push({ grupo: 'VERIFICACAO', texto: `Muro: com as calçadas, a permeabilidade cai a ${f2(permeavel)} % (a zona pede ${f2(minimo)} %) — troque o piso do acesso por drenante ou encurte as calçadas.` });
    }
    return r;
  } catch (x) {
    const motivo = x instanceof Error ? x.message : String(x);
    etapa('MURO', ROTULO_DA_ETAPA_DA_CASA.MURO, 'NAO_RODOU', 0, motivo);
    pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Muro: ${motivo}` });
    return null;
  }
}
