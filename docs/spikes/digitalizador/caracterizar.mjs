/**
 * Spike C — etapa 0: caracterizar o documento antes de tentar interpretá-lo.
 *
 * O PRD trata a análise de qualidade como uma etapa do pipeline (§11.1.3). Na
 * prática ela vem ANTES de tudo e decide qual pipeline usar: um PDF vetorial já
 * carrega a geometria e é problema de parsing; um scan é problema de visão. Rodar
 * detector em cima de vetor é gastar caro para adivinhar o que o arquivo declara.
 *
 *   node docs/spikes/digitalizador/caracterizar.mjs "caminho/do.pdf"
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// `require.resolve` devolve caminho do Windows ("C:\..."), que o import()
// dinamico recusa — ESM so aceita URL. Converter e obrigatorio aqui.
const require = createRequire(import.meta.url);
const pdfjs = await import(
  pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href
);

const caminho = process.argv[2];
if (!caminho) throw new Error('informe o caminho do PDF');

const doc = await pdfjs.getDocument({
  data: new Uint8Array(readFileSync(caminho)),
  // Sem worker: em node o worker separado só atrapalha.
  disableWorker: true,
  isEvalSupported: false,
}).promise;

console.log(`páginas: ${doc.numPages}`);

for (let n = 1; n <= doc.numPages; n++) {
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();
  const texto = await page.getTextContent();

  // Contagem por tipo de operador. `constructPath` é traço vetorial;
  // `paintImageXObject` e `paintJpegXObject` sao imagem embutida.
  const OPS = pdfjs.OPS;
  const conta = new Map();
  for (const op of ops.fnArray) {
    const nome =
      Object.keys(OPS).find((k) => OPS[k] === op) ?? String(op);
    conta.set(nome, (conta.get(nome) ?? 0) + 1);
  }

  const tracos = conta.get('constructPath') ?? 0;
  const imagens =
    (conta.get('paintImageXObject') ?? 0) +
    (conta.get('paintJpegXObject') ?? 0) +
    (conta.get('paintInlineImageXObject') ?? 0);

  // Quantos SEGMENTOS existem dentro dos comandos de traço — é o número que
  // interessa, porque um `constructPath` pode conter uma polilinha inteira.
  let segmentos = 0;
  for (let i = 0; i < ops.fnArray.length; i++) {
    if (ops.fnArray[i] !== OPS.constructPath) continue;
    const [tipos] = ops.argsArray[i];
    for (const t of tipos) {
      if (t === OPS.lineTo || t === OPS.moveTo) segmentos++;
      else if (t === OPS.curveTo) segmentos += 3;
      else if (t === OPS.rectangle) segmentos += 4;
    }
  }

  console.log(`\n── página ${n} ──`);
  console.log(`dimensão: ${Math.round(vp.width)} × ${Math.round(vp.height)} pt`);
  console.log(`  = ${(vp.width * 25.4 / 72 / 1000).toFixed(2)} × ${(vp.height * 25.4 / 72 / 1000).toFixed(2)} m de papel`);
  console.log(`comandos de traço: ${tracos}  (≈ ${segmentos} segmentos)`);
  console.log(`imagens embutidas: ${imagens}`);
  console.log(`itens de texto: ${texto.items.length}`);
  console.log(
    `VEREDITO: ${
      imagens === 0 && segmentos > 500
        ? 'VETORIAL — a geometria está no arquivo, parsing resolve'
        : segmentos < 100
          ? 'RASTER — precisa de visão computacional'
          : 'MISTO — vetor + imagem na mesma página'
    }`,
  );

  // Rótulos de área declarados pelo arquiteto: sao o gabarito de graça.
  const areas = texto.items
    .map((it) => ({ str: it.str.trim(), x: it.transform[4], y: it.transform[5] }))
    .filter((it) => /^a\s*=\s*[\d.,]+\s*m/i.test(it.str));
  console.log(`rótulos "a=..." encontrados: ${areas.length}`);
  for (const a of areas.slice(0, 8)) {
    console.log(`   ${a.str.padEnd(16)} em (${Math.round(a.x)}, ${Math.round(a.y)})`);
  }
}
