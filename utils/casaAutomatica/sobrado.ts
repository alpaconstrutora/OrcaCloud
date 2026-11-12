/**
 * Casa automática — etapa(s) `planejarOSobrado` de `planejarComPavimentos`, extraída(s) com o
 * `ContextoDaCasa` (P2, 12/11/2026). O marco das 8 casas prova que o motor gera o mesmo.
 */
import { applyBatch, medirEscada, point, pointInPolygon, uidDeterministico } from '../blueprintKernel';
import type { BlueprintModel, Command, ObjectId, Point } from '../blueprintKernel';
import { comandosDeAplicacao, gerar, HIPOTESES_DO_GERADOR_PADRAO } from '../blueprintGerador';
import type { AmbienteGerado, Retangulo, ResultadoDoGerador } from '../blueprintGerador';
import { resumoDoPrograma, usoDoNome } from '../blueprintPrograma';
import { propostaDeEixos } from '../blueprintEixosAutomaticos';
import { planejarLajes, planejarVigas } from '../blueprintVigasLajesAutomaticas';
import { planejarFundacoes } from '../blueprintFundacoesAutomaticas';
import { comandosDeMobiliario, mobiliarNivel } from '../blueprintMobiliario';
import { planejarPontosDoNivel, pontosDasLoucasCriadas } from '../blueprintPontosHidraulicos';
import type { LocalDaPendencia } from '../blueprintGeradorPpci';
import { localDoElemento } from '../blueprintLocalDaPendencia';
import { HIPOTESES_DE_GUARDA_CORPO_PADRAO } from '../blueprintGuardaCorpo';
import { comandoDaEscada, comUidsDoPavimento, alinharSegundoAoPatamar, banheiroAlemDoNucleo, lavaboForaDoNucleo, escolherNucleo, guardaCorpoDaEscada, lajesComRebaixo, shaftDoGrupo, zonasMolhadasDoBanheiro, pavimentoComNucleo, portaParaOTerraco, contornoDoTerraco, pilaresDoTerceiro, retanguloDoSegundo, pilaresDoSobrado, semPortaDeEntrada, prumadasPeloMeioDoComodo, shaftsDoSobrado, alinharJanelasDoSuperior, trechosDeTransicao, vigasDeTransicao } from '../blueprintSobrado';
import { HIPOTESES_DA_IMPLANTACAO_PADRAO, comLocal, comLocais, m2, f2, ROTULO_DA_ETAPA_DA_CASA, ROTULO_DA_DISCIPLINA_DA_REDE, ROTULO_DA_DISCIPLINA_DO_AR } from './hipoteses';
import type { PlanoDaCasa, ResumoDoSobrado } from './hipoteses';
import { paraMundo } from './quadroEImplantacao';
import { GRAVE, problemasGraves, escolherSemente, comandosLocaisNoMundo, gruposDoTuboDeQueda, coletoresForaDoShaft } from './escolhaEShaft';
import type { ContextoDaCasa } from './contexto';
import { PASSO_DO_PRIMEIRO_EM_VOLTA_DO_SEGUNDO_MM, VOLTAS_DO_PRIMEIRO_RECUADO } from './orquestrador';

/** O bloco `if (divididos)` de `planejarComPavimentos`: devolve o plano (o `return` de lá) ou `undefined` (segue). */
export function planejarOSobrado(ctx: ContextoDaCasa): PlanoDaCasa | undefined {
  const { andarMm, aplicar, decisoes, divididos, entrada, entradaDoGerador, estrutura, etapa, etapaDoTelhado, etapaEstrutural, fechar, gerarTodas, hip, hipGerador, hipImplantacao, implantacao, instalacoes, lancarEscadaDeAcesso, lancarMuroDaCasa, lancarRampaDaGaragem, original, peDireitoMm, pendencias, q, rl, vazio } = ctx;
  if (!(divididos)) return undefined;
  const t = gerarTodas(divididos.terreo);
  const sup = gerarTodas(divididos.superior);
  // A escada chega no corredor de cima: só servem as alternativas do superior que têm corredor.
  const comCorredor = sup.resultados.filter((x) => x.ambientes.some((a) => a.item.uso === 'CIRCULACAO'));
  const semPlanta = !t.resultados.length
    ? `o gerador não fechou o térreo (${t.falhas.join('; ') || 'sem alternativa'})`
    : !comCorredor.length
      ? `nenhuma alternativa do pavimento superior saiu com corredor para a escada chegar (${sup.resultados.length} tentada(s)${sup.falhas.length ? `; ${sup.falhas.join('; ')}` : ''})`
      : null;
  let et = t.resultados.length ? escolherSemente(t.resultados) : null;
  let es = comCorredor.length ? escolherSemente(comCorredor) : null;
  let corredor = es?.r.ambientes.find((a) => a.item.uso === 'CIRCULACAO')?.ret ?? null;
  // F27-D4: em 3 pavimentos, como no sobrado — o 2º se alinha ao patamar nos dois sentidos da escada (o núcleo pode sobrar
  // fora dele). A preferência pelos fundos da D2 fazia o núcleo comer o banheiro do 1º (10 × 30: 3,38 m², a caixa
  // sifonada dentro da escada).
  const nucleo = et && es ? escolherNucleo(rl, corredor, et.r.ambientes, es.r.ambientes, hip.sobrado) : null;
  // F27 item 5 (decisão do usuário, 19/10/2026: "mover o lavabo"): o núcleo que espreme o lavabo do térreo — o térreo é
  // gerado de novo, na mesma semente, com o lavabo na outra ponta do par (`lavaboForaDoNucleo`).
  if (et && nucleo) {
    const malha = hipGerador.malhaMm ?? HIPOTESES_DO_GERADOR_PADRAO.malhaMm;
    const mover = (amb: AmbienteGerado[]) => lavaboForaDoNucleo(amb, nucleo, hip.sobrado, malha);
    if (mover(et.r.ambientes.map((a) => ({ ...a, ret: { ...a.ret } })))) {
      try {
        const novo = gerar({ ...entradaDoGerador, programa: divididos.terreo, rearranjar: mover, motivoDoRearranjo: 'o lavabo na outra ponta, fora do núcleo da escada' }, et.r.semente, hipGerador);
        if (novo.decisoes.some((d) => d.startsWith('Arranjo ajustado'))) {
          et = { r: novo, texto: et.texto };
          decisoes.push('Térreo: o núcleo da escada espremia o lavabo — o lavabo foi para a outra ponta do par, fora do núcleo.');
        }
      } catch {
        // O gerador não fechou com o lavabo movido: fica o arranjo de antes.
      }
    }
  }
  // F27 item 5.3 (decisão do usuário, 19/10/2026: "recuar o 1º também"): na casa de 3, o 1º num retângulo com a área do
  // programa dele — a mesma regra do 2º (nos fundos, encostado na fachada do núcleo, alinhado ao patamar); o excedente do
  // térreo vira o terraço do 1º. Herdando a pegada inteira do térreo, os dormitórios do 1º chegavam a 53 m².
  let retDoPrimeiro: Retangulo | null = null;
  // O 1º na pegada do térreo — volta a ser ele se o 2º não fechar dentro do 1º recuado.
  const primeiroNaPegada = { es, corredor };
  let decisaoDoPrimeiro: string | null = null;
  /** Os 1º recuados que fecharam (largura toda, proporção) — fica o primeiro em que o 2º também fecha. */
  const primeirosRecuados: { es: NonNullable<typeof es>; corredor: Retangulo | null; ret: Retangulo; decisao: string }[] = [];
  if (divididos.segundo && nucleo && es && !semPlanta) {
    const malha = hipGerador.malhaMm ?? HIPOTESES_DO_GERADOR_PADRAO.malhaMm;
    // A área do maior programa entre o 1º e o 2º — o 2º recua DENTRO do 1º (com 2 dormitórios, o 1º leva um dormitório e
    // o banho, e o 2º, a suíte: menor que o 2º, o 1º não o continha).
    const programaM2 = Math.max(resumoDoPrograma(divididos.superior).areaIdealComCirculacaoM2, resumoDoPrograma(divididos.segundo).areaIdealComCirculacaoM2);
    const areaM2 = (programaM2 + (hip.sobrado.nucleoLarguraMm * hip.sobrado.nucleoProfundidadeMm) / 1e6) * (hipImplantacao.fatorDoRetanguloSobreUtil ?? HIPOTESES_DA_IMPLANTACAO_PADRAO.fatorDoRetanguloSobreUtil);
    const anelDoRet = (r: Retangulo) => [point(r.x0, r.y0), point(r.x1, r.y0), point(r.x1, r.y1), point(r.x0, r.y1)];
    // Primeiro só em profundidade (as fachadas laterais sobre as do térreo), depois pela proporção, como o 2º.
    const modos = (hip.sobrado.primeiroRecuaSoNaProfundidade ?? true) ? [true, false] : [false];
    for (const larguraToda of modos) {
      const proposto = retanguloDoSegundo(rl, nucleo, areaM2, hipImplantacao.proporcaoFrenteFundo ?? HIPOTESES_DA_IMPLANTACAO_PADRAO.proporcaoFrenteFundo, hip.sobrado, malha, larguraToda);
      if ((proposto.x1 - proposto.x0) * (proposto.y1 - proposto.y0) >= (rl.x1 - rl.x0) * (rl.y1 - rl.y0)) continue;
      const alinhados = (hip.sementes.length ? hip.sementes : [1]).flatMap((semente) => {
        const a = alinharSegundoAoPatamar(
          (r, invertida) => {
            try {
              const x = gerar({ ...entradaDoGerador, programa: divididos.superior, envelope: anelDoRet(r), direcaoDaFrente: invertida ? point(0, 1) : null }, semente, hipGerador);
              return x.ambientes.some((amb) => amb.item.uso === 'CIRCULACAO') ? x : null;
            } catch {
              return null;
            }
          },
          rl,
          proposto,
          nucleo,
          hip.sobrado,
          malha,
          // 5.3b: o 1º cresce para a frente a cada volta e o corredor se aproxima do patamar devagar (10 × 30, 4 dorm.:
          // 15,7 → 15,1 m em 4 voltas, com o patamar em 14,9) — mais voltas que o 2º.
          VOLTAS_DO_PRIMEIRO_RECUADO,
          nucleo.paraOsFundos ? [false, true] : [true, false],
        );
        return a ? [a] : [];
      });
      if (!alinhados.length) continue;
      const e1 = escolherSemente(alinhados.map((a) => a.r));
      const escolhido = alinhados.find((a) => a.r === e1.r)!;
      const ret = escolhido.ret;
      primeirosRecuados.push({
        es: e1,
        ret,
        corredor: e1.r.ambientes.find((a) => a.item.uso === 'CIRCULACAO')?.ret ?? corredor,
        decisao: `3 pavimentos: o 1º recuado em ${f2((ret.x1 - ret.x0) / 1000)} × ${f2((ret.y1 - ret.y0) / 1000)} m (a área do programa dele${larguraToda ? ', na largura toda do térreo' : ''}) — o excedente do térreo é o terraço do 1º${escolhido.invertida ? '; o íntimo à frente do corredor (a planta invertida)' : ''}.`,
      });
    }
    if (!primeirosRecuados.length) decisaoDoPrimeiro = '3 pavimentos: o 1º recuado não fechou com o corredor no patamar da escada — o 1º fica com a pegada do térreo.';
  }
  if (semPlanta || !nucleo || !et || !es) {
    const texto = semPlanta ?? `não cabe o núcleo da escada (${f2(hip.sobrado.nucleoLarguraMm / 1000)} × ${f2(hip.sobrado.nucleoProfundidadeMm / 1000)} m) na ponta do corredor de cima`;
    etapa('ARQUITETURA', ROTULO_DA_ETAPA_DA_CASA.ARQUITETURA, 'NAO_RODOU', 0, texto);
    pendencias.push({ grupo: 'SEM_SOLUCAO', texto });
    return vazio(texto, implantacao);
  }
  // F27-D2 (decisão do usuário, 18/10/2026: "recuado com terraço"): o 2º pavimento num retângulo menor, nos fundos e
  // do lado do núcleo (o terraço na frente, sobre a laje do 1º), com o corredor no patamar da escada.
  let eg: { r: ResultadoDoGerador; texto: string } | null = null;
  let retDoSegundo: Retangulo | null = null;
  if (divididos.segundo) {
    // S4 (20/10/2026): o item social SOZINHO no 2º (o escritório do R1-A — o resto é a suíte e o banho dela) vai ao fundo,
    // ao lado da suíte: sozinho na frente, a faixa dele tinha a largura toda e a profundidade da área (7,40 × 1,70 m,
    // mínimo 2,20).
    const naoIntimos = divididos.segundo.itens.filter((i) => i.privacidade !== 'INTIMO' && i.uso !== 'CIRCULACAO');
    const seg = naoIntimos.length === 1 ? { ...divididos.segundo, itens: divididos.segundo.itens.map((i) => (i === naoIntimos[0] ? { ...i, privacidade: 'INTIMO' as const } : i)) } : divididos.segundo;
    const malha = hipGerador.malhaMm ?? HIPOTESES_DO_GERADOR_PADRAO.malhaMm;
    const areaM2 = (resumoDoPrograma(seg).areaIdealComCirculacaoM2 + (hip.sobrado.nucleoLarguraMm * hip.sobrado.nucleoProfundidadeMm) / 1e6) * (hipImplantacao.fatorDoRetanguloSobreUtil ?? HIPOTESES_DA_IMPLANTACAO_PADRAO.fatorDoRetanguloSobreUtil);
    // F27 item 5.3: o 2º recua dentro do 1º (recuado ou não).
    const anel = (r: Retangulo) => [point(r.x0, r.y0), point(r.x1, r.y0), point(r.x1, r.y1), point(r.x0, r.y1)];
    const alinharDentroDe = (casaDoSegundo: Retangulo) => {
      const inicial = retanguloDoSegundo(casaDoSegundo, nucleo, areaM2, hipImplantacao.proporcaoFrenteFundo ?? HIPOTESES_DA_IMPLANTACAO_PADRAO.proporcaoFrenteFundo, hip.sobrado, malha);
      return (hip.sementes.length ? hip.sementes : [1]).flatMap((semente) => {
        const a = alinharSegundoAoPatamar(
          (r, invertida) => {
            try {
              return gerar({ ...entradaDoGerador, programa: seg, envelope: anel(r), direcaoDaFrente: invertida ? point(0, 1) : null, rearranjar: (amb) => banheiroAlemDoNucleo(amb, nucleo) }, semente, hipGerador);
            } catch {
              return null;
            }
          },
          casaDoSegundo,
          inicial,
          nucleo,
          hip.sobrado,
          malha,
          // 5.3b: dentro do 1º recuado, as mesmas voltas dele.
          casaDoSegundo === rl ? 4 : VOLTAS_DO_PRIMEIRO_RECUADO,
          // F27-D4: a suíte do lado para onde o núcleo avança (o banheiro vai além da ponta dele): de frente quando a escada
          // sobe para os fundos, invertida quando sobe para a frente; o outro sentido só se este não fechar.
          nucleo.paraOsFundos ? [false, true] : [true, false],
        );
        return a ? [a] : [];
      });
    };
    // F27 item 5.3: o primeiro 1º recuado em que o 2º fecha; nenhum — o 1º com a pegada do térreo.
    let alinhados: ReturnType<typeof alinharDentroDe> = [];
    // 5.3b: de todos os 1º recuados em que o 2º fecha, o de menos problemas graves no 1º e no 2º juntos, e entre esses o
    // de MENOR área (o objetivo é o 1º do tamanho do programa). O primeiro que fechava podia ser o maior (12 × 30: os
    // dormitórios de 31 m² em vez de 19) ou deixar o 2º com um cômodo abaixo da largura mínima (R1-A: o escritório de
    // 1,70 m).
    const area = (r: Retangulo) => (r.x1 - r.x0) * (r.y1 - r.y0);
    let melhor: { c: (typeof primeirosRecuados)[number]; alinhados: ReturnType<typeof alinharDentroDe>; graves: number } | null = null;
    for (const c of primeirosRecuados) {
      const al = alinharDentroDe(c.ret);
      if (!al.length) continue;
      // E os cômodos abaixo da largura mínima do uso deles (o gerador não os conta como graves).
      const estreitos = (x: ResultadoDoGerador) => x.ambientes.filter((amb) => amb.item.uso !== 'CIRCULACAO' && Math.min(amb.ret.x1 - amb.ret.x0, amb.ret.y1 - amb.ret.y0) < amb.item.larguraMinMm).length;
      const doSegundo = escolherSemente(al.map((x) => x.r)).r;
      const graves = problemasGraves(c.es.r) + problemasGraves(doSegundo) + estreitos(c.es.r) + estreitos(doSegundo);
      if (!melhor || graves < melhor.graves || (graves === melhor.graves && area(c.ret) < area(melhor.c.ret))) melhor = { c, alinhados: al, graves };
    }
    // S3 (20/10/2026): o 2º do tamanho do 1º recuado (2 dorm.: a suíte em cima, 24,9 m², maior que o programa do 1º)
    // preenche-o inteiro e não tem para onde andar até o patamar (10 × 30: o corredor a 100 mm dele) — o 1º voltava à
    // pegada do térreo, com o dormitório de 4 × a área ideal. Então o 1º EM VOLTA do 2º: o 2º alinhado na pegada, e o
    // menor retângulo que o contém (a sobra além dele, de cada lado, zero ou ao menos a faixa do terraço) em que o
    // corredor do 1º também cai no patamar.
    if (!melhor && primeirosRecuados.length) {
      const naPegada = alinharDentroDe(rl);
      const seg = naPegada.length ? naPegada.find((a) => a.r === escolherSemente(naPegada.map((x) => x.r)).r)!.ret : null;
      if (seg) {
        const faixa = hip.sobrado.faixaMinimaDoTerracoMm;
        const meio = nucleo.paraOsFundos ? nucleo.ret.y0 + hip.sobrado.patamarMm / 2 : nucleo.ret.y1 - hip.sobrado.patamarMm / 2;
        const bordas = (de: number, ate: number) => {
          const v = [de];
          for (let d = faixa; d < Math.abs(ate - de); d += PASSO_DO_PRIMEIRO_EM_VOLTA_DO_SEGUNDO_MM) v.push(de + Math.sign(ate - de) * d);
          if (ate !== de) v.push(ate);
          return v;
        };
        const larguras = [...((hip.sobrado.primeiroRecuaSoNaProfundidade ?? true) ? [[rl.x0, rl.x1]] : []), [seg.x0, seg.x1]];
        const rets = larguras
          .flatMap(([x0, x1]) => bordas(seg.y0, rl.y0).flatMap((y0) => bordas(seg.y1, rl.y1).map((y1) => ({ x0, x1, y0, y1 }))))
          .filter((r) => area(r) < area(rl))
          .sort((p, q) => area(p) - area(q));
        const sementes = hip.sementes.length ? hip.sementes : [1];
        const anelDoRet = (r: Retangulo) => [point(r.x0, r.y0), point(r.x1, r.y0), point(r.x1, r.y1), point(r.x0, r.y1)];
        const noPatamar = (r: Retangulo, semente: number, invertida: boolean) => {
          try {
            const x = gerar({ ...entradaDoGerador, programa: divididos.superior, envelope: anelDoRet(r), direcaoDaFrente: invertida ? point(0, 1) : null }, semente, hipGerador);
            const cor = x.ambientes.find((amb) => amb.item.uso === 'CIRCULACAO')?.ret;
            return cor && cor.y0 < meio && meio < cor.y1 ? x : null;
          } catch {
            return null;
          }
        };
        for (const r of rets) {
          // A 1ª semente filtra (o corredor cai no mesmo lugar em todas); as outras só no retângulo que passa.
          const sentidos = [false, true].filter((inv) => noPatamar(r, sementes[0], inv));
          if (!sentidos.length) continue;
          const al = alinharDentroDe(r);
          if (!al.length) continue;
          const doPrimeiro = sentidos.flatMap((inv) => sementes.map((sm) => noPatamar(r, sm, inv)).filter((x): x is ResultadoDoGerador => !!x).map((x) => ({ x, inv })));
          const e1 = escolherSemente(doPrimeiro.map((d) => d.x));
          const invertida = doPrimeiro.find((d) => d.x === e1.r)!.inv;
          melhor = {
            c: {
              es: e1,
              ret: r,
              corredor: e1.r.ambientes.find((amb) => amb.item.uso === 'CIRCULACAO')?.ret ?? corredor,
              decisao: `3 pavimentos: o 1º recuado em ${f2((r.x1 - r.x0) / 1000)} × ${f2((r.y1 - r.y0) / 1000)} m, em volta do 2º (do tamanho do programa do 1º, o 2º não tinha para onde andar até o patamar) — o excedente do térreo é o terraço do 1º${invertida ? '; o íntimo à frente do corredor (a planta invertida)' : ''}.`,
            },
            alinhados: al,
            graves: 0,
          };
          break;
        }
      }
    }
    if (melhor) {
      alinhados = melhor.alinhados;
      ({ es, corredor } = melhor.c);
      retDoPrimeiro = melhor.c.ret;
      decisaoDoPrimeiro = melhor.c.decisao;
    }
    if (!alinhados.length) {
      ({ es, corredor } = primeiroNaPegada);
      retDoPrimeiro = null;
      if (primeirosRecuados.length) decisaoDoPrimeiro = '3 pavimentos: o 2º não fechou dentro do 1º recuado (o corredor no patamar da escada) — o 1º fica com a pegada do térreo.';
      alinhados = alinharDentroDe(rl);
    }
    if (!alinhados.length) {
      const texto = 'o 2º pavimento não fechou com o corredor no patamar da escada (nenhuma alternativa do gerador) — gere o sobrado';
      etapa('ARQUITETURA', ROTULO_DA_ETAPA_DA_CASA.ARQUITETURA, 'NAO_RODOU', 0, texto);
      pendencias.push({ grupo: 'SEM_SOLUCAO', texto });
      return vazio(texto, implantacao);
    }
    eg = escolherSemente(alinhados.map((a) => a.r));
    const escolhido = alinhados.find((a) => a.r === eg!.r)!;
    retDoSegundo = escolhido.ret;
    if (escolhido.invertida) decisoes.push(`2º pavimento: o íntimo à frente do corredor (a planta invertida) — ${nucleo.paraOsFundos ? 'atrás do patamar da escada não cabia' : 'do lado para onde a escada avança, com o banheiro além da ponta do núcleo'}.`);
  }
  if (decisaoDoPrimeiro) decisoes.push(decisaoDoPrimeiro);
  if (!es) return vazio('sem o 1º pavimento', implantacao);
  const pavimentosGerados: [string, ResultadoDoGerador][] = [['Térreo', et.r], [eg ? '1º pavimento' : 'Superior', es.r], ...(eg ? [['2º pavimento', eg.r] as [string, ResultadoDoGerador]] : [])];
  for (const [pav, x] of pavimentosGerados) decisoes.push(...x.decisoes.map((d) => `${pav}: ${d}`));
  const T = entrada.levelId;
  // F25: a cota do térreo JÁ no platô (a terraplenagem o move antes) — do original, o superior ficava a 1,8 m dele.
  const nivel = ctx.m.levels.find((l) => l.id === T)!;
  let sobrado: ResumoDoSobrado;
  let n = 0;
  try {
    n += aplicar([{ type: 'AddLevel', name: eg ? '1º pavimento' : 'Pavimento superior', elevationMm: nivel.elevationMm + andarMm, defaultHeightMm: nivel.defaultHeightMm, uid: uidDeterministico(`casa-automatica:superior:${T}`) }]);
    const S = ctx.m.levels.find((l) => !original.levels.some((o) => o.id === l.id))!.id;
    let G: ObjectId | null = null;
    if (eg) {
      n += aplicar([{ type: 'AddLevel', name: '2º pavimento', elevationMm: nivel.elevationMm + 2 * andarMm, defaultHeightMm: nivel.defaultHeightMm, uid: uidDeterministico(`casa-automatica:segundo:${T}`) }]);
      G = ctx.m.levels.find((l) => l.id !== S && !original.levels.some((o) => o.id === l.id))!.id;
    }
    const pt = pavimentoComNucleo(comUidsDoPavimento(comandosDeAplicacao(et.r, T), 'T'), T, nucleo, et.r.ambientes, 'T', peDireitoMm, hip.sobrado);
    // O superior não tem porta para a rua: a porta de entrada que o gerador pôs na fachada sai antes.
    const psBase = pavimentoComNucleo(comUidsDoPavimento(semPortaDeEntrada(comandosDeAplicacao(es.r, S), rl), 'S'), S, nucleo, es.r.ambientes, 'S', peDireitoMm, hip.sobrado, corredor);
    // F27 item 5.3: o 1º recuado abre para o terraço dele (na planta invertida a "entrada" ficava nos fundos).
    const terracoDoPrimeiro = retDoPrimeiro ? portaParaOTerraco(psBase.comandos, rl, es.r.ambientes, hip.sobrado.alturaDaPortaMm) : null;
    const ps = terracoDoPrimeiro ? { ...psBase, comandos: terracoDoPrimeiro.comandos } : psBase;
    if (terracoDoPrimeiro?.comodo) decisoes.push(`3 pavimentos: a janela de ${terracoDoPrimeiro.comodo} para o terraço do 1º virou porta de correr (o 1º sem porta para o terraço).`);
    // F27-D2: o 2º sem as portas para FORA da casa (fundos e laterais); a do terraço (a "entrada" do gerador na frente
    // do retângulo recuado) fica. A segunda escada, empilhada no mesmo núcleo, sai do 1º.
    const corredorDoSegundo = eg?.r.ambientes.find((a) => a.item.uso === 'CIRCULACAO')?.ret ?? null;
    const pgBase = eg && G ? pavimentoComNucleo(comUidsDoPavimento(semPortaDeEntrada(comandosDeAplicacao(eg.r, G), retDoPrimeiro ?? rl), 'G'), G, nucleo, eg.r.ambientes, 'G', peDireitoMm, hip.sobrado, corredorDoSegundo) : null;
    // F27-D5: o 2º abre para o terraço (na planta invertida a "entrada" ficava nos fundos).
    const terraco = pgBase && eg ? portaParaOTerraco(pgBase.comandos, retDoPrimeiro ?? rl, eg.r.ambientes, hip.sobrado.alturaDaPortaMm) : null;
    const pg = pgBase && terraco ? { ...pgBase, comandos: terraco.comandos } : pgBase;
    if (terraco?.comodo) decisoes.push(`3 pavimentos: a janela de ${terraco.comodo} para o terraço virou porta de correr (o 2º sem porta para o terraço).`);
    const exata = implantacao.alinhadaAoDesenho;
    n += aplicar([
      ...comandosLocaisNoMundo(pt.comandos, q, exata),
      ...comandosLocaisNoMundo(ps.comandos, q, exata),
      ...(pg ? comandosLocaisNoMundo(pg.comandos, q, exata) : []),
      ...comandosLocaisNoMundo([comandoDaEscada(T, nucleo, hip.sobrado), ...(G ? [comandoDaEscada(S, nucleo, hip.sobrado)] : [])], q, exata),
    ]);
    const med = medirEscada(ctx.m, ctx.m.stairs[ctx.m.stairs.length - 1]);
    sobrado = {
      nivelSuperiorId: S,
      nucleo,
      escada: { degraus: med.degraus, espelhoMm: Math.round(med.espelhoMm), pisoMm: Math.round(med.pisoMm), blondelMm: Math.round(med.blondelMm) },
      portas: { terreo: pt.porta?.vizinho ?? null, superior: ps.porta?.vizinho ?? null },
      primeiro: retDoPrimeiro ? { retangulo: retDoPrimeiro, terracoM2: Math.round(((rl.x1 - rl.x0) * (rl.y1 - rl.y0) - (retDoPrimeiro.x1 - retDoPrimeiro.x0) * (retDoPrimeiro.y1 - retDoPrimeiro.y0)) / 1e4) / 100 } : null,
      segundo:
        G && pg && retDoSegundo
          ? { nivelId: G, retangulo: retDoSegundo, porta: pg.porta?.vizinho ?? null, terracoM2: Math.round((((retDoPrimeiro ?? rl).x1 - (retDoPrimeiro ?? rl).x0) * ((retDoPrimeiro ?? rl).y1 - (retDoPrimeiro ?? rl).y0) - (retDoSegundo.x1 - retDoSegundo.x0) * (retDoSegundo.y1 - retDoSegundo.y0)) / 1e4) / 100 }
          : null,
    };
    for (const a of med.avisos) pendencias.push({ grupo: 'VERIFICACAO', texto: `Escada: ${a}` });
  } catch (e) {
    const texto = `as paredes geradas não entraram no desenho: ${e instanceof Error ? e.message : String(e)}`;
    etapa('ARQUITETURA', ROTULO_DA_ETAPA_DA_CASA.ARQUITETURA, 'NAO_RODOU', 0, texto);
    pendencias.push({ grupo: 'SEM_SOLUCAO', texto });
    return vazio(texto, implantacao);
  }
  const lado = nucleo.lado === 'DIREITA' ? 'direita' : 'esquerda';
  if (!sobrado.portas.terreo) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: 'Escada: nenhum ambiente do térreo encosta no patamar — abra a porta do núcleo à mão.' });
  if (!sobrado.portas.superior) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Escada: o patamar ${eg ? 'do 1º pavimento' : 'de cima'} não encosta no corredor — abra a porta do núcleo à mão.` });
  if (sobrado.segundo && !sobrado.segundo.porta) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: 'Escada: o patamar do 2º pavimento não encosta no corredor — abra a porta do núcleo à mão.' });
  // O que o núcleo comeu, medido no DESENHO: abaixo do mínimo do programa é sem solução; acima, conferir.
  for (const a of nucleo.perdidos) {
    const amb = [...et.r.ambientes, ...es.r.ambientes].find((x) => x.nome === a);
    const sp = ctx.m.spaces.find((x) => (x.levelId === T || x.levelId === sobrado.nivelSuperiorId) && x.name === a);
    const ficouM2 = sp ? Math.round(sp.areaMm2 / 1e4) / 100 : null;
    const minimoM2 = amb?.item.areaMinM2 ?? null;
    if (ficouM2 != null && minimoM2 != null && ficouM2 >= minimoM2)
      pendencias.push({ grupo: 'CONFERIR', texto: `Escada: o núcleo come boa parte de ${a} — fica com ${f2(ficouM2)} m² (mínimo do programa ${f2(minimoM2)} m²); confira o uso ou mude a escada de lugar.`, ...comLocal(sp ? localDoElemento(ctx.m, [sp.id]) : null) });
    else pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Escada: o núcleo deixa ${a} ${ficouM2 != null ? `com ${f2(ficouM2)} m²` : 'sem área'}${minimoM2 != null ? `, abaixo do mínimo de ${f2(minimoM2)} m²` : ''} — mude a escada de lugar.`, ...comLocal(sp ? localDoElemento(ctx.m, [sp.id]) : null) });
  }
  for (const a of nucleo.partidos) {
    const sp = ctx.m.spaces.find((x) => (x.levelId === T || x.levelId === sobrado.nivelSuperiorId) && x.name === a);
    pendencias.push({ grupo: 'VERIFICACAO', texto: `Escada: o núcleo parte ${a} em dois — o pedaço menor fica sem nome.`, ...comLocal(sp ? localDoElemento(ctx.m, [sp.id]) : null) });
  }
  // F27-D2: o 2º não entrou na escolha do núcleo — o que ele comeu lá, medido no desenho.
  if (eg && sobrado.segundo) {
    const G = sobrado.segundo.nivelId;
    for (const a of eg.r.ambientes) {
      if (a.item.uso === 'CIRCULACAO' || !(a.ret.x0 < nucleo.ret.x1 && a.ret.x1 > nucleo.ret.x0 && a.ret.y0 < nucleo.ret.y1 && a.ret.y1 > nucleo.ret.y0)) continue;
      const sp = ctx.m.spaces.find((x) => x.levelId === G && x.name === a.nome);
      const ficouM2 = sp ? Math.round(sp.areaMm2 / 1e4) / 100 : null;
      if (ficouM2 != null && ficouM2 >= a.item.areaMinM2) pendencias.push({ grupo: 'CONFERIR', texto: `Escada: o núcleo come parte de ${a.nome} no 2º pavimento — fica com ${f2(ficouM2)} m² (mínimo do programa ${f2(a.item.areaMinM2)} m²).`, ...comLocal(sp ? localDoElemento(ctx.m, [sp.id]) : null) });
      else pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Escada: o núcleo deixa ${a.nome} no 2º pavimento ${ficouM2 != null ? `com ${f2(ficouM2)} m²` : 'sem área'}, abaixo do mínimo de ${f2(a.item.areaMinM2)} m².`, ...comLocal(sp ? localDoElemento(ctx.m, [sp.id]) : null) });
    }
  }
  // F22: "sem porta direta" já sai na CONFERÊNCIA do programa — aqui só pesa na escolha (como na térrea).
  for (const [pav, x] of pavimentosGerados) for (const a of x.avisos) if (!/sem porta direta \(relação obrigatória\)/.test(a)) pendencias.push({ grupo: GRAVE.test(a) ? 'SEM_SOLUCAO' : 'VERIFICACAO', texto: `Arquitetura (${pav.toLowerCase()}): ${a}` });
  const paredes = ctx.m.walls.filter((w) => w.levelId === T || w.levelId === sobrado.nivelSuperiorId || w.levelId === sobrado.segundo?.nivelId).length;
  etapa(
    'ARQUITETURA',
    ROTULO_DA_ETAPA_DA_CASA.ARQUITETURA,
    'LANCOU',
    n,
    eg && sobrado.segundo
      ? `3 pavimentos: ${paredes} paredes; térreo com ${et.r.ambientes.length}, 1º com ${es.r.ambientes.length} e 2º com ${eg.r.ambientes.length} ambientes; o 2º recuado em ${f2((sobrado.segundo.retangulo.x1 - sobrado.segundo.retangulo.x0) / 1000)} × ${f2((sobrado.segundo.retangulo.y1 - sobrado.segundo.retangulo.y0) / 1000)} m (terraço de ${f2(sobrado.segundo.terracoM2)} m²); duas escadas em U de ${sobrado.escada.degraus} degraus (${sobrado.escada.espelhoMm} × ${sobrado.escada.pisoMm} mm) empilhadas no núcleo à ${lado} — térreo: ${et.texto}; 1º: ${es.texto}; 2º: ${eg.texto}`
      : `sobrado: ${paredes} paredes; térreo com ${et.r.ambientes.length} e superior com ${es.r.ambientes.length} ambientes; escada em U de ${sobrado.escada.degraus} degraus (${sobrado.escada.espelhoMm} × ${sobrado.escada.pisoMm} mm) no núcleo à ${lado} — térreo: ${et.texto}; superior: ${es.texto}`,
  );

  // F27: as janelas de cima alinhadas com as de baixo, antes dos pilares (o intermediário do térreo sobe entre elas).
  {
    const alinhadas = alinharJanelasDoSuperior(ctx.m, T, sobrado.nivelSuperiorId);
    if (alinhadas.length) {
      aplicar(alinhadas);
      decisoes.push(`Sobrado: ${alinhadas.length} janela(s) do ${eg ? '1º pavimento' : 'superior'} alinhada(s) com as do térreo, na mesma fachada.`);
    }
    // F27-D2: par a par — as do 2º com as do 1º.
    const doSegundo = sobrado.segundo ? alinharJanelasDoSuperior(ctx.m, sobrado.nivelSuperiorId, sobrado.segundo.nivelId) : [];
    if (doSegundo.length) {
      aplicar(doSegundo);
      decisoes.push(`3 pavimentos: ${doSegundo.length} janela(s) do 2º alinhada(s) com as do 1º, na mesma fachada.`);
    }
  }
  lancarEscadaDeAcesso();
  lancarRampaDaGaragem();
  // F26: o muro logo depois da casa — antes da água e da elétrica, que põem o hidrômetro e o medidor nele.
  ctx.resumoDoMuro = lancarMuroDaCasa();

  // ── ESTRUTURA E TELHADO DO SOBRADO (F12b) ──
  // Pilares em prumada (ver `pilaresDoSobrado`); vigas e lajes em cada pavimento — a laje do térreo é o piso de
  // cima, e o furo da escada nela é derivado pelo kernel (`furosDaEscada`); fundação só no térreo; eixos do térreo;
  // telhado sobre o superior; corrimãos dos lances e guarda-corpo na borda do furo.
  const S = sobrado.nivelSuperiorId;
  // F27-D3: na casa de 3, o 2º pavimento — os pilares descem a prumada inteira, vigas e lajes por nível, a viga de
  // transição do 1º sob as paredes do 2º sem parede embaixo, o telhado sobre o 2º.
  const G = sobrado.segundo?.nivelId ?? null;
  type PlanoEstrutural = { comandos: Command[]; motivo: string | null; avisos?: string[]; foraDoPlano: { motivo: string }[] };
  const emDois = <A extends PlanoEstrutural, B extends PlanoEstrutural>(x: BlueprintModel, fa: (y: BlueprintModel) => A, fb: (y: BlueprintModel) => B) => {
    const a = fa(x);
    const b = fb(a.comandos.length ? applyBatch(x, a.comandos).model : x);
    return {
      a,
      b,
      comandos: [...a.comandos, ...b.comandos],
      motivo: a.comandos.length || b.comandos.length ? null : (a.motivo ?? b.motivo),
      avisos: [...(a.avisos ?? []).map((t) => `térreo: ${t}`), ...(b.avisos ?? []).map((t) => `superior: ${t}`)],
      foraDoPlano: [...a.foraDoPlano.map((f) => `térreo: ${f.motivo}`), ...b.foraDoPlano.map((f) => `superior: ${f.motivo}`)],
    };
  };
  // Onde a parede do superior não tem parede embaixo, a viga de transição do térreo a sustenta — e o pilar do
  // superior que cai sobre ela nasce nela.
  const transicao = trechosDeTransicao(ctx.m, T, S);
  const transicaoDeCima = G ? trechosDeTransicao(ctx.m, S, G) : [];
  let nascemEmViga = 0;
  etapaEstrutural(
    'PILARES',
    (x) => {
      const a = pilaresDoSobrado(x, T, S, hip.estrutura.pilares, transicao);
      if (!G) return { ...a, de3: null };
      const de3 = pilaresDoTerceiro(a.comandos.length ? applyBatch(x, a.comandos).model : x, T, S, G, hip.estrutura.pilares, transicao, transicaoDeCima);
      return { ...a, de3, comandos: [...a.comandos, ...de3.comandos], motivo: a.comandos.length || de3.comandos.length ? null : a.motivo, avisos: [...a.avisos, ...de3.avisos], foraDoPlano: [...a.foraDoPlano, ...de3.foraDoPlano] };
    },
    (p) => {
      const d = p.de3;
      estrutura.pilares = p.terreo + p.superior + (d ? d.segundo + d.descemAoPrimeiro + d.descemAoTerreo : 0);
      nascemEmViga = p.nascemEmViga + (d?.nascemEmViga ?? 0);
      const de2 = `${p.terreo} pilar(es) no térreo e ${p.superior} no ${d ? '1º' : 'superior'} — ${p.sobem} sobem do térreo, ${p.descem} descem do ${d ? '1º' : 'superior'}${p.nascemEmViga ? `, ${p.nascemEmViga} nascem em viga de transição` : ''}${p.semApoio ? `, ${p.semApoio} sem apoio embaixo ficaram fora` : ''}`;
      const doSegundo = d ? `; ${d.segundo} no 2º — ${d.sobem} sobem do 1º, ${d.descemAoPrimeiro} descem ao 1º e ${d.descemAoTerreo} até o térreo${d.nascemEmViga ? `, ${d.nascemEmViga} nascem em viga de transição` : ''}${d.semApoio ? `, ${d.semApoio} sem prumada até o chão ficaram fora` : ''}` : '';
      return { nota: de2 + doSegundo, foraDoPlano: p.foraDoPlano };
    },
  );
  etapaEstrutural(
    'VIGAS',
    (x) => {
      const d = emDois(x, (y) => planejarVigas(y, T, hip.estrutura.vigas), (y) => planejarVigas(y, S, hip.estrutura.vigas));
      const x1 = d.comandos.length ? applyBatch(x, d.comandos).model : x;
      const vt = vigasDeTransicao(x1, T, transicao, hip.estrutura.vigas);
      // F27-D3: as vigas do 2º e as de transição do 1º (sob as paredes do 2º sem parede do 1º embaixo).
      const x2 = vt.comandos.length ? applyBatch(x1, vt.comandos).model : x1;
      const vG = G ? planejarVigas(x2, G, hip.estrutura.vigas) : null;
      const x3 = vG?.comandos.length ? applyBatch(x2, vG.comandos).model : x2;
      const vtG = G ? vigasDeTransicao(x3, S, transicaoDeCima, hip.estrutura.vigas) : null;
      const comandos = [...d.comandos, ...vt.comandos, ...(vG?.comandos ?? []), ...(vtG?.comandos ?? [])];
      return { ...d, vt, vG, vtG, comandos, motivo: comandos.length ? null : d.motivo, foraDoPlano: [...d.foraDoPlano, ...(vG?.foraDoPlano ?? []).map((f) => `2º pavimento: ${f.motivo}`)] };
    },
    (p) => {
      estrutura.vigas = p.a.vigas.length + p.b.vigas.length + p.vt.vigas + (p.vG?.vigas.length ?? 0) + (p.vtG?.vigas ?? 0);
      if (p.vtG?.vigas)
        pendencias.push({
          grupo: 'CONFERIR',
          texto: `Estrutura: ${p.vtG.vigas} viga(s) de transição no 1º pavimento sustentam ${String(p.vtG.metros).replace('.', ',')} m de parede do 2º sem parede embaixo (maior vão ${String(Math.round(p.vtG.maiorVaoMm / 100) / 10).replace('.', ',')} m) — confira com o calculista.`,
        });
      if (p.vt.vigas)
        pendencias.push({
          grupo: 'CONFERIR',
          texto: `Estrutura: ${p.vt.vigas} viga(s) de transição no térreo sustentam ${String(p.vt.metros).replace('.', ',')} m de parede do superior sem parede embaixo (maior vão ${String(Math.round(p.vt.maiorVaoMm / 100) / 10).replace('.', ',')} m)${nascemEmViga ? ` e ${nascemEmViga} pilar(es) que nascem nelas` : ''} — confira com o calculista.`,
        });
      return {
        nota: p.vG
          ? `${p.a.vigas.length} viga(s) no térreo, ${p.vt.vigas} de transição sob paredes do 1º, ${p.b.vigas.length} no 1º, ${p.vtG?.vigas ?? 0} de transição sob paredes do 2º e ${p.vG.vigas.length} no 2º`
          : `${p.a.vigas.length} viga(s) no térreo (sob o piso de cima), ${p.vt.vigas} de transição sob paredes do superior e ${p.b.vigas.length} no superior`,
        foraDoPlano: p.foraDoPlano,
      };
    },
  );
  let guardas = 0;
  let lajesRebaixadas = 0;
  let lajesRebaixadasDoPrimeiro = 0;
  /** F14c: as áreas molhadas dos banheiros de cima, pelas peças de esgoto PREVISTAS (simulação de mobiliário, louças e kit). */
  // F27-D4: `niveis` de baixo para cima e `k` o pavimento dos banheiros (a laje rebaixada é a do pavimento de baixo
  // dele). A previsão repete a sequência das instalações: os shafts do F12c de cada pavimento de cima (o do 2º descendo
  // pelo 1º), o mobiliário de todos, e os shafts junto das peças pavimento a pavimento até o `k`.
  const zonasMolhadasDeCima = (x: BlueprintModel, niveis: ObjectId[], k: number): Point[][] => {
    const T0 = niveis[0];
    const S0 = niveis[k];
    if (!hip.mobiliario.lancar || hip.sobrado.rebaixoDaLajeDoBanheiroMm <= 0) return [];
    try {
      // F27 da casa automática (18/10/2026): primeiro os shafts do F12c, como nas instalações — sem eles a previsão
      // escolhia OUTRO shaft para o grupo (o do F12c ainda não existia), a laje descia até ele, e o passo do shaft,
      // adiante, reaproveitava o do F12c: o esgoto corria do rebaixo até lá pelo forro do térreo, cruzando os
      // eletrodutos (sobrado 10 × 30).
      const nucleoNoMundo = [
        { x: sobrado.nucleo.ret.x0, y: sobrado.nucleo.ret.y0 },
        { x: sobrado.nucleo.ret.x1, y: sobrado.nucleo.ret.y0 },
        { x: sobrado.nucleo.ret.x1, y: sobrado.nucleo.ret.y1 },
        { x: sobrado.nucleo.ret.x0, y: sobrado.nucleo.ret.y1 },
      ].map((p) => paraMundo(q, p));
      let x0 = x;
      for (let j = 1; j < niveis.length && hip.hidraulica.lancar; j++) {
        const doF12c = shaftsDoSobrado(x0, T0, niveis[j], nucleoNoMundo, hip.sobrado.shaftMm, 2500, niveis.slice(1, j));
        if (doF12c.length) x0 = applyBatch(x0, doF12c.map((sh): Command => ({ type: 'AddNucleo', levelId: T0, ateLevelId: niveis[j], tipo: 'SHAFT', ring: sh.ring, rotulo: 'Shaft' }))).model;
      }
      // Todos os pavimentos, como as etapas de lá: o shaft previsto não pode cair em cima de uma peça de baixo.
      const porNivel = niveis.map((L) => ({ L, lista: mobiliarNivel(x0, L, hip.mobiliario) }));
      const mob = porNivel.flatMap((p) => comandosDeMobiliario(p.lista, p.L, x0));
      const r1 = mob.length ? applyBatch(x0, mob) : null;
      const m1 = r1?.model ?? x0;
      const louc = pontosDasLoucasCriadas(m1, r1?.diff.created ?? [], hip.pontos, { sugerida: true });
      const m2 = louc.length ? applyBatch(m1, louc).model : m1;
      const kit = coletoresForaDoShaft(m2, niveis.flatMap((L) => planejarPontosDoNivel(m2, L, hip.pontos)).flatMap((pl) => pl.comandos));
      let m3 = kit.length ? applyBatch(m2, kit).model : m2;
      // Os pavimentos de baixo do `k` ganham os shafts junto das peças antes (como no passo do shaft, que anda de baixo
      // para cima): o do 2º não cai em cima de um do 1º.
      for (let j = 1; j < k; j++) {
        const Lj = niveis[j];
        const pj = (m3.terminais ?? []).filter((t) => t.levelId === Lj && t.disciplina === 'ESGOTO');
        const esc = m3.spaces.find((sp) => sp.levelId === Lj && /escada/i.test(sp.name ?? ''))?.ring ?? null;
        for (const g of gruposDoTuboDeQueda(m3, Lj, pj, hip.sobrado.grupoDoTuboDeQuedaMm)) {
          const ban = m3.spaces.find((sp) => sp.levelId === Lj && g.filter((t) => pointInPolygon(sp.ring, t.at)).length * 2 >= g.length);
          if (!ban) continue;
          const alvo = { x: g.reduce((a, t) => a + t.at.x, 0) / g.length, y: g.reduce((a, t) => a + t.at.y, 0) / g.length };
          const sh = shaftDoGrupo(m3, T0, Lj, ban.ring, alvo, esc, hip.sobrado.shaftMm, hip.sobrado.shaftAteAsPecasMm, niveis.slice(1, j));
          if (sh?.novo) m3 = applyBatch(m3, [{ type: 'AddNucleo', levelId: T0, ateLevelId: Lj, tipo: 'SHAFT', ring: sh.ring, rotulo: 'Shaft' } as Command]).model;
          if (sh?.estender) m3 = applyBatch(m3, [{ type: 'SetNucleoProps', nucleoId: sh.estender, ateLevelId: Lj } as Command]).model;
        }
      }
      const pecas = (m3.terminais ?? []).filter((t) => t.levelId === S0 && t.disciplina === 'ESGOTO');
      const grupos = gruposDoTuboDeQueda(m3, S0, pecas, hip.sobrado.grupoDoTuboDeQuedaMm);
      const zonas: Point[][] = [];
      const escada = m3.spaces.find((sp) => sp.levelId === S0 && /escada/i.test(sp.name ?? ''))?.ring ?? null;
      const banheiros = m3.spaces.filter((sp) => sp.levelId === S0 && ['BANHEIRO', 'LAVABO'].includes(usoDoNome(sp.name) ?? ''));
      // O shaft onde o tubo de queda de cada grupo vai descer — a mesma decisão do passo do shaft, adiante (e o shaft
      // novo entra no modelo, como lá, para o grupo seguinte não cair em cima dele).
      let m4 = m3;
      const shaftDo = new Map<(typeof grupos)[number], Point[]>();
      for (const g of grupos) {
        const ban = banheiros.find((sp) => g.filter((t) => pointInPolygon(sp.ring, t.at)).length * 2 >= g.length);
        if (!ban) continue;
        const alvo = { x: g.reduce((a, t) => a + t.at.x, 0) / g.length, y: g.reduce((a, t) => a + t.at.y, 0) / g.length };
        const sh = shaftDoGrupo(m4, T0, S0, ban.ring, alvo, escada, hip.sobrado.shaftMm, hip.sobrado.shaftAteAsPecasMm, niveis.slice(1, k));
        if (!sh) continue;
        shaftDo.set(g, sh.ring);
        if (sh.novo) m4 = applyBatch(m4, [{ type: 'AddNucleo', levelId: T0, ateLevelId: S0, tipo: 'SHAFT', ring: sh.ring, rotulo: 'Shaft' } as Command]).model;
        if (sh.estender) m4 = applyBatch(m4, [{ type: 'SetNucleoProps', nucleoId: sh.estender, ateLevelId: S0 } as Command]).model;
      }
      // Uma zona por GRUPO e por banheiro que ele toca: as peças do grupo nele e o caminho delas até o shaft (a reta de
      // cada peça ao centro dele), até a face do shaft. Por grupo: no banheiro comprido da suíte, a caixa sifonada de
      // uma ponta e o vaso da outra cercavam o shaft e o rebaixo o engolia (a água de baixo não chegava às colunas). Por
      // banheiro: o grupo pode juntar peças de dois vizinhos (a 30°, a caixa sifonada do social desce no shaft da
      // suíte) — cada um ganha o pedaço dele.
      for (const g of grupos) {
        const sh = shaftDo.get(g) ?? null;
        const centro = sh ? { x: sh.reduce((a, p) => a + p.x, 0) / sh.length, y: sh.reduce((a, p) => a + p.y, 0) / sh.length } : null;
        for (const ban of banheiros) {
          const doBanheiro = g.filter((t) => pointInPolygon(ban.ring, t.at)).map((t) => t.at);
          const caminho: Point[] = [];
          if (centro) {
            for (const t of g) {
              const L = Math.hypot(centro.x - t.at.x, centro.y - t.at.y);
              for (let d = 0; d <= L; d += 100) {
                const q = { x: t.at.x + ((centro.x - t.at.x) * d) / (L || 1), y: t.at.y + ((centro.y - t.at.y) * d) / (L || 1) } as Point;
                if (pointInPolygon(ban.ring, q) && !pointInPolygon(sh!, q)) caminho.push(q);
              }
            }
          }
          if (!doBanheiro.length && !caminho.length) continue;
          zonas.push(...zonasMolhadasDoBanheiro(ban.ring, doBanheiro, hip.sobrado.margemDoRebaixoMm, sh, caminho));
        }
      }
      if (!zonas.length) pendencias.push({ grupo: 'CONFERIR', texto: `Laje rebaixada: nenhuma área molhada prevista nos banheiros de cima (${pecas.length} peça(s) de esgoto, ${grupos.length} grupo(s)) — a laje ficou sem rebaixo.` });
      return zonas;
    } catch (e) {
      pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Laje rebaixada: a previsão das peças de cima falhou (${e instanceof Error ? e.message : String(e)}) — a laje ficou sem rebaixo.` });
      return [];
    }
  };
  etapaEstrutural(
    'LAJES',
    (x) => {
      const d = emDois(x, (y) => planejarLajes(y, T, hip.estrutura.lajes), (y) => planejarLajes(y, S, hip.estrutura.lajes));
      // F14c ("laje rebaixada"): a laje do térreo — o piso de cima — desce sob a ÁREA MOLHADA de cada banheiro de cima.
      // As peças ainda não existem aqui (a laje vem antes do mobiliário): são PREVISTAS rodando mobiliário, louças e kit
      // numa cópia — determinísticos, dão as posições que as etapas de lá vão lançar.
      const zonas = zonasMolhadasDeCima(x, G ? [T, S, G] : [T, S], 1);
      const comRebaixo = lajesComRebaixo(d.a.comandos, T, zonas, hip.sobrado.rebaixoDaLajeDoBanheiroMm);
      lajesRebaixadas = comRebaixo.rebaixadas;
      // F27-D3: na casa de 3, o guarda-corpo do furo só no 2º (no 1º, o lance que sobe sai da borda do furo de baixo).
      const g = [...guardaCorpoDaEscada(x, T, S, !G), ...(G ? guardaCorpoDaEscada(x, S, G) : [])];
      guardas = g.length;
      const lG = G ? planejarLajes(d.comandos.length ? applyBatch(x, d.comandos).model : x, G, hip.estrutura.lajes) : null;
      // F27-D4: na casa de 3, a laje do 1º (o piso do 2º) desce sob a área molhada de cada banheiro do 2º.
      const doPrimeiro = G ? lajesComRebaixo(d.b.comandos, S, zonasMolhadasDeCima(x, [T, S, G], 2), hip.sobrado.rebaixoDaLajeDoBanheiroMm) : null;
      lajesRebaixadasDoPrimeiro = doPrimeiro?.rebaixadas ?? 0;
      const comandos = [...comRebaixo.comandos, ...(doPrimeiro?.comandos ?? d.b.comandos), ...(lG?.comandos ?? []), ...g];
      return { ...d, lG, comandos, motivo: comandos.length ? null : d.motivo, foraDoPlano: [...d.foraDoPlano, ...(lG?.foraDoPlano ?? []).map((f) => `2º pavimento: ${f.motivo}`)] };
    },
    (p) => {
      estrutura.lajes = p.a.lajes.length + p.b.lajes.length + (p.lG?.lajes.length ?? 0);
      const guardaDoFuro = guardas ? `; ${guardas - 1} corrimão(s) nos lances e guarda-corpo na borda do furo${p.lG ? ' do 2º' : ''}` : '';
      return {
        nota: p.lG
          ? `${p.a.lajes.length} laje(s) no térreo, ${p.b.lajes.length} no 1º (o piso do 2º e o terraço) e ${p.lG.lajes.length} no 2º, de ${hip.estrutura.lajes.espessuraMm} mm${lajesRebaixadas ? `; a do térreo rebaixada ${f2(hip.sobrado.rebaixoDaLajeDoBanheiroMm / 1000)} m sob ${lajesRebaixadas} trecho(s) de banheiro do 1º` : ''}${lajesRebaixadasDoPrimeiro ? `; a do 1º sob ${lajesRebaixadasDoPrimeiro} trecho(s) de banheiro do 2º` : ''}${guardaDoFuro}`
          : `${p.a.lajes.length} laje(s) no térreo (o piso de cima, com o furo da escada) e ${p.b.lajes.length} no superior, de ${hip.estrutura.lajes.espessuraMm} mm${lajesRebaixadas ? `; rebaixada ${f2(hip.sobrado.rebaixoDaLajeDoBanheiroMm / 1000)} m sob ${lajesRebaixadas} trecho(s) de banheiro de cima` : ''}${guardaDoFuro}`,
        foraDoPlano: p.foraDoPlano,
      };
    },
  );
  etapaEstrutural(
    'FUNDACOES',
    (x) => planejarFundacoes(x, T, hip.estrutura.fundacoes),
    (p) => {
      estrutura.blocos = p.blocos.length;
      estrutura.estacas = p.estacas.length;
      estrutura.baldrames = p.baldrames.length;
      return { nota: `${p.blocos.length} bloco(s), ${p.estacas.length} estaca(s), ${p.baldrames.length} baldrame(s) — só no térreo` };
    },
  );
  etapaEstrutural(
    'EIXOS',
    (x) => {
      const p = propostaDeEixos(x, T, hip.estrutura.eixos);
      return { ...p, motivo: p.comandos.length ? null : p.motivoVazio && p.paredesObliquas === 0 ? p.motivoVazio : null, avisos: p.paredesObliquas ? [`${p.paredesObliquas} parede(s) oblíqua(s) ao desenho ficam fora da malha de eixos`] : [] };
    },
    (p) => {
      estrutura.eixos = p.novos;
      return { nota: `${p.novos} eixo(s)` };
    },
  );
  // F27-D3: na casa de 3, o telhado sobre o 2º (o retângulo recuado). F27-D5: o núcleo que sobra fora dele entra como
  // anexo (uma água caindo para fora) — sem isso a escada ficava descoberta.
  if (G && eg) {
    const sg = sobrado.segundo!.retangulo;
    const r = nucleo.ret;
    const fora: Retangulo[] = [
      ...(r.y0 < sg.y0 ? [{ x0: r.x0, x1: r.x1, y0: r.y0, y1: Math.min(r.y1, sg.y0) }] : []),
      ...(r.y1 > sg.y1 ? [{ x0: r.x0, x1: r.x1, y0: Math.max(r.y0, sg.y1), y1: r.y1 }] : []),
    ];
    etapaDoTelhado(G, eg.r.retangulo, [...eg.r.anexos, ...fora], (ctx.m.structures ?? []).some((x) => x.levelId === G && x.kind === 'LAJE'));
    // F27-D5: o guarda-corpo no contorno do terraço (a borda da laje do 1º que o 2º não cobre), no piso do 2º.
    const alturaDoGuardaCorpo = HIPOTESES_DE_GUARDA_CORPO_PADRAO.alturaGuardaCorpoMm;
    const linhas = contornoDoTerraco(retDoPrimeiro ?? rl, sg, r);
    if (linhas.length) {
      const noMundo = (p: Point) => {
        const w = paraMundo(q, p);
        return point(Math.round(w.x), Math.round(w.y));
      };
      aplicar(linhas.map((l, k): Command => ({ type: 'AddGuardaCorpo', levelId: G, tipo: 'GUARDA_CORPO', pontos: l.map(noMundo), alturaMm: alturaDoGuardaCorpo, material: 'METALICO', rotulo: `Terraço · guarda-corpo${linhas.length > 1 ? ` ${k + 1}` : ''}`, sugerido: true })));
      const metros = linhas.reduce((s, l) => s + l.slice(1).reduce((t, p, i) => t + Math.hypot(p.x - l[i].x, p.y - l[i].y), 0), 0) / 1000;
      decisoes.push(`3 pavimentos: guarda-corpo de ${f2(alturaDoGuardaCorpo / 1000)} m no contorno do terraço (${f2(metros)} m).`);
    }
    // F27 item 5.3: e o do terraço do 1º (a borda da laje do térreo que o 1º recuado não cobre), no piso do 1º.
    const doPrimeiro = retDoPrimeiro ? contornoDoTerraco(rl, retDoPrimeiro, r) : [];
    if (doPrimeiro.length) {
      const noMundo = (p: Point) => {
        const w = paraMundo(q, p);
        return point(Math.round(w.x), Math.round(w.y));
      };
      aplicar(doPrimeiro.map((l, k): Command => ({ type: 'AddGuardaCorpo', levelId: S, tipo: 'GUARDA_CORPO', pontos: l.map(noMundo), alturaMm: alturaDoGuardaCorpo, material: 'METALICO', rotulo: `Terraço do 1º · guarda-corpo${doPrimeiro.length > 1 ? ` ${k + 1}` : ''}`, sugerido: true })));
      const metros = doPrimeiro.reduce((s, l) => s + l.slice(1).reduce((t, p, i) => t + Math.hypot(p.x - l[i].x, p.y - l[i].y), 0), 0) / 1000;
      decisoes.push(`3 pavimentos: guarda-corpo de ${f2(alturaDoGuardaCorpo / 1000)} m no contorno do terraço do 1º (${f2(metros)} m).`);
    }
  }
  else etapaDoTelhado(S, es.r.retangulo, es.r.anexos, (ctx.m.structures ?? []).some((x) => x.levelId === S && x.kind === 'LAJE'));
  // ── INSTALAÇÕES DO SOBRADO (F12c) ──
  // O SHAFT junto de cada banheiro de cima, antes de tudo: o tubo de queda e as colunas de água descem por ele
  // (sem ele, desciam no ponto do vaso — no meio da garagem ou da cozinha de baixo).
  let notaDoShaft: string | null = null;
  if (hip.hidraulica.lancar) {
    const nucleoNoMundo = [
      { x: sobrado.nucleo.ret.x0, y: sobrado.nucleo.ret.y0 },
      { x: sobrado.nucleo.ret.x1, y: sobrado.nucleo.ret.y0 },
      { x: sobrado.nucleo.ret.x1, y: sobrado.nucleo.ret.y1 },
      { x: sobrado.nucleo.ret.x0, y: sobrado.nucleo.ret.y1 },
    ].map((p) => paraMundo(q, p));
    const shafts = shaftsDoSobrado(ctx.m, T, S, nucleoNoMundo, hip.sobrado.shaftMm);
    aplicar(shafts.map((x): Command => ({ type: 'AddNucleo', levelId: T, ateLevelId: S, tipo: 'SHAFT', ring: x.ring, rotulo: 'Shaft' })));
    // F27-D4: na casa de 3, o shaft de cada banheiro do 2º — desce até o térreo atravessando o 1º.
    if (G) {
      const doSegundo = shaftsDoSobrado(ctx.m, T, G, nucleoNoMundo, hip.sobrado.shaftMm, 2500, [S]);
      aplicar(doSegundo.map((x): Command => ({ type: 'AddNucleo', levelId: T, ateLevelId: G, tipo: 'SHAFT', ring: x.ring, rotulo: 'Shaft' })));
      shafts.push(...doSegundo.map((x) => ({ ...x, banheiro: `${x.banheiro} (2º pavimento)` })));
    }
    if (shafts.length) notaDoShaft = `${shafts.length} shaft(s) de ${hip.sobrado.shaftMm / 10} cm: ${shafts.map((x) => `junto do ${x.banheiro}${x.noTerreo ? `, descendo na ${x.noTerreo}` : ''}`).join('; ')}.`;
    else pendencias.push({ grupo: 'NAO_DECIDIDO', texto: 'Shaft: nenhuma parede dos banheiros de cima tem parede embaixo livre de porta, janela e pilar — o tubo de queda desce no ponto do vaso; ponha o shaft à mão (Núcleo vertical).' });
  }
  // F27 item 5.3: as âncoras do térreo (vagas, medidor) pelo retângulo do térreo — o do 1º pode ser o recuado.
  const inst = instalacoes(G ? [T, S, G] : [T, S], retDoPrimeiro ? rl : es.r.retangulo, notaDoShaft);
  const soltas = prumadasPeloMeioDoComodo(ctx.m);
  if (soltas.length) {
    const nome: Record<string, string> = { ...ROTULO_DA_DISCIPLINA_DA_REDE, ...ROTULO_DA_DISCIPLINA_DO_AR, ELETRICA: 'eletroduto' };
    const porComodo = new Map<string, string[]>();
    const locaisPorComodo = new Map<string, LocalDaPendencia[]>();
    for (const x of soltas) {
      const k = `${x.comodo} (${x.nivel.toLowerCase()})`;
      porComodo.set(k, [...(porComodo.get(k) ?? []), x.rotulo?.toLowerCase() || nome[x.disciplina] || x.disciplina.toLowerCase()]);
      const l = localDoElemento(ctx.m, [x.trechoId, x.comodoId]);
      if (l) locaisPorComodo.set(k, [...(locaisPorComodo.get(k) ?? []), l]);
    }
    for (const [k, v] of porComodo) pendencias.push({ grupo: 'VERIFICACAO', texto: `Prumada pelo meio do cômodo: ${v.join(', ')} atravessa ${k} — leve-a pela parede ou pelo shaft.`, ...comLocais(locaisPorComodo.get(k)) });
  }
  return fechar({
    projecaoM2: et.r.resumo.areaConstruidaM2,
    areaConstruidaM2: et.r.resumo.areaConstruidaM2 + es.r.resumo.areaConstruidaM2 + (eg?.r.resumo.areaConstruidaM2 ?? 0),
    alturaM: ((eg ? 3 : 2) * andarMm) / 1000,
    semente: et.r.semente,
    escolha: eg ? `térreo: ${et.texto}; 1º: ${es.texto}; 2º: ${eg.texto}` : `térreo: ${et.texto}; superior: ${es.texto}`,
    sobrado,
    disciplinas: { estrutura, telhado: ctx.telhado, ancoras: inst.ancoras, mobiliario: inst.mobiliario, hidraulica: inst.hidraulica, eletrica: inst.eletrica, aberturas: inst.redesEmAberturas, climatizacao: inst.climatizacao, forro: inst.forro, furos: inst.furos },
  });
  return undefined;
}
