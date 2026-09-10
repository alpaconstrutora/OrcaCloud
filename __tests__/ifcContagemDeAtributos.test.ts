/**
 * Cada entidade que emitimos tem o MESMO número de atributos que a mesma
 * entidade nos arquivos IFC4 do mundo real.
 *
 * ─── POR QUE ISTO É UM PORTÃO, E NÃO UMA CURIOSIDADE ────────────────────────
 *
 * Atributo a menos é o erro mais caro deste módulo, porque ele não estoura: o
 * arquivo abre, a maior parte aparece, e a entidade malformada some em
 * silêncio. Foi assim que descobrimos, em 07/09/2026, que quatro entidades de
 * material saíam curtas — `IFCMATERIAL` com 1 de 3, `IFCMATERIALLAYER` com 3
 * de 7, `IFCMATERIALLAYERSET` com 2 de 3, `IFCMATERIALLAYERSETUSAGE` com 4 de
 * 5. Nenhum teste do módulo reclamava, porque todos afirmavam sobre o TEXTO
 * que nós mesmos escrevíamos.
 *
 * ─── O ÁRBITRO É EXTERNO ────────────────────────────────────────────────────
 *
 * A contagem certa não sai da minha leitura do schema: sai de contar a mesma
 * entidade em dois modelos IFC4 produzidos por Revit e ArchiCAD, que é o que
 * de fato precisa nos ler. Sem eles, PULA declarando o motivo — nunca passa
 * por omissão.
 *
 * Para apontar para outra pasta: `IFC_AMOSTRAS=/caminho npx vitest run`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { casaDeProva } from './apoio/casaDeProva';
import { gerarIfc } from '../utils/blueprintIfc';

const PASTA = process.env.IFC_AMOSTRAS ?? 'C:/D/ORÇACLOUD/bim-spike/samples';
const AMOSTRAS = ['AC20-FZK-Haus.ifc', 'DigitalHub.ifc'].map((f) => join(PASTA, f));
const TEM = AMOSTRAS.every(existsSync);

/**
 * Conta as vírgulas de TOPO de cada entidade `#n= TIPO(...)`.
 *
 * ⚠️ Sem parser de propósito: um parser normalizaria justamente o que se quer
 * medir. O que exige cuidado é só não contar vírgula dentro de lista aninhada
 * nem dentro de texto — e no STEP o apóstrofo dentro de texto vem dobrado.
 */
function contar(step: string): Map<string, Set<number>> {
  const corpo = step.includes('DATA;') ? step.slice(step.indexOf('DATA;') + 5) : step;
  const saida = new Map<string, Set<number>>();
  const cabeca = /#\d+\s*=\s*([A-Z0-9_]+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = cabeca.exec(corpo)) !== null) {
    let i = m.index + m[0].length;
    let profundidade = 1;
    let virgulas = 0;
    let dentroDeTexto = false;
    while (i < corpo.length && profundidade > 0) {
      const c = corpo[i];
      if (dentroDeTexto) {
        if (c === "'") {
          // Apóstrofo dobrado é um apóstrofo literal, não o fim do texto.
          if (corpo[i + 1] === "'") i++;
          else dentroDeTexto = false;
        }
      } else if (c === "'") dentroDeTexto = true;
      else if (c === '(') profundidade++;
      else if (c === ')') profundidade--;
      else if (c === ',' && profundidade === 1) virgulas++;
      i++;
    }
    if (!saida.has(m[1])) saida.set(m[1], new Set());
    saida.get(m[1])!.add(virgulas + 1);
    cabeca.lastIndex = i;
  }
  return saida;
}

/**
 * Entidades que os dois modelos de referência não contêm.
 *
 * Não é dispensa: é a declaração de que para ESTAS a contagem foi conferida
 * contra o schema IFC4 e não contra um arquivo. `IfcRelCoversSpaces` liga
 * forro e piso ao ambiente, e nenhum dos dois modelos exporta revestimento.
 */
const SEM_REFERENCIA = new Set([
  'IFCRELCOVERSSPACES',
  // ── As cinco das INSTALAÇÕES (08/09/2026) ───────────────────────────────
  //
  // ⚠️ Procurei par para elas em TODOS os IFC que temos ao alcance: os dois de
  // referência e os três projetos da empresa (arquitetônico, estrutural e
  // sondagem). Nenhum contém MEP — zero ocorrências das cinco. Para estas o
  // árbitro externo não existe aqui, e dizer isso é melhor que fingir que sim.
  //
  // O que as verifica no lugar dele:
  //
  // • `IFCCIRCLEPROFILEDEF` foi conferido contra um IFC4 REAL — o projeto
  //   estrutural da empresa tem 759 delas, todas
  //   `IFCCIRCLEPROFILEDEF(.AREA.,$,#pos,raio)`: 4 atributos, com `Position`
  //   por REFERÊNCIA, que é a mesma lição do perfil retangular.
  //
  // • As outras quatro são verificadas pelo `web-ifc`, que traz o schema IFC4
  //   compilado, em `ifcIdaEVoltaProprio.test.ts`. Lá os casos não CONTAM
  //   entidades: eles conferem que cada valor chegou no CAMPO CERTO — `Name`
  //   com o rótulo, `Tag` com o identificador curto, `PredefinedType` com o
  //   enum do sistema. Com a contagem errada os atributos escorregam de casa, e
  //   `Name` volta onde deveria estar `Description`.
  //
  // ⚠️ Esta lista NÃO É DISPENSA. Se um arquivo com MEP aparecer, o certo é
  // apontar o portão para ele e apagar estas cinco linhas.
  'IFCFLOWSEGMENT',
  'IFCFLOWTERMINAL',
  'IFCDISTRIBUTIONSYSTEM',
  'IFCRELASSIGNSTOGROUP',
  'IFCCIRCLEPROFILEDEF',
  // ── E as duas do PONTO ELÉTRICO CLASSIFICADO (09/09/2026) ───────────────
  //
  // ⚠️ Mesma situação e MESMA verificação: nenhum dos arquivos ao alcance tem
  // elétrica, e as duas foram medidas pelo `web-ifc` em
  // `ifcIdaEVoltaProprio.test.ts` — nove atributos, com `Name`, `ObjectType` e
  // `PredefinedType` chegando nos campos certos.
  //
  // ⚠️ E medir foi obrigatório, não zelo: `IfcDistributionBoard` é legal pela
  // norma, foi ACHADO pelo parser e não pôde ser desserializado, porque só
  // existe a partir do IFC4 ADD2. Estas duas são IFC4 de origem — e isso só se
  // soube depois de emitir uma de cada e ler de volta.
  'IFCLIGHTFIXTURE',
  'IFCOUTLET',
  // ── E as duas do QUADRO e do CIRCUITO (09/09/2026) ──────────────────────
  //
  // Mesma situação e mesma saída: nenhum IFC ao nosso alcance tem MEP, então
  // não há par no mundo real. O árbitro delas é o `web-ifc`, em
  // `ifcIdaEVoltaProprio.test.ts`, conferindo que cada valor chegou no CAMPO
  // CERTO — `Name` com o nome do quadro, `Tag` com o rótulo curto,
  // `PredefinedType` com o enum do sistema.
  'IFCFLOWCONTROLLER',
  'IFCDISTRIBUTIONCIRCUIT',
  // ── E a do PONTO DE LIGAÇÃO DIRETA (10/09/2026) ─────────────────────────
  //
  // `IfcJunctionBox.POWER` — a caixa onde o chuveiro é ligado sem tomada
  // (NBR 5410 9.5.2.3). Nove atributos como o IfcOutlet; medida pelo web-ifc
  // em `ifcIdaEVoltaProprio.test.ts`, com `ObjectType` e `PredefinedType`
  // nos campos certos.
  'IFCJUNCTIONBOX',
]);

describe.skipIf(!TEM)('contagem de atributos · o nosso IFC contra IFC4 real', () => {
  it('nenhuma entidade nossa sai com número de atributos diferente do real', () => {
    // O modelo de prova é o mais completo que sabemos montar: parede com
    // composição, porta, janela, vão livre, ambiente, estrutura, telhado,
    // escada e revestimento. Quanto mais entidades distintas, mais o portão
    // alcança.
    const nosso = contar(
      gerarIfc(casaDeProva(), {
        titulo: 'contagem',
        revisao: 1,
        hash: 'c'.repeat(64),
        data: new Date('2026-09-07T12:00:00Z'),
      }),
    );

    const real = new Map<string, Set<number>>();
    for (const caminho of AMOSTRAS) {
      for (const [tipo, ks] of contar(readFileSync(caminho, 'utf8'))) {
        if (!real.has(tipo)) real.set(tipo, new Set());
        for (const k of ks) real.get(tipo)!.add(k);
      }
    }

    const divergentes: string[] = [];
    const semReferencia: string[] = [];
    for (const [tipo, nossas] of nosso) {
      const delas = real.get(tipo);
      if (!delas || delas.size === 0) {
        semReferencia.push(tipo);
        continue;
      }
      for (const k of nossas) {
        if (!delas.has(k)) {
          divergentes.push(`${tipo}: nós ${k}, real ${[...delas].sort((a, b) => a - b).join('/')}`);
        }
      }
    }

    expect(divergentes).toEqual([]);
    // E a lista de "sem referência" não pode CRESCER sem que alguém declare
    // por quê: entidade nova sem par no mundo real é exatamente onde a
    // contagem erra sem ninguém ver.
    expect(semReferencia.filter((t) => !SEM_REFERENCIA.has(t))).toEqual([]);
  });

  it('a própria contagem sabe contar — lista aninhada e apóstrofo em texto', () => {
    // Sem estes dois casos o portão poderia estar medindo qualquer coisa.
    const c = contar(
      "DATA;\n#1= IFCX((#2,#3),'a,b',$);\n#2= IFCY('o''clock',(1.,2.,3.),.T.);\n",
    );
    expect([...c.get('IFCX')!]).toEqual([3]);
    expect([...c.get('IFCY')!]).toEqual([3]);
  });
});
