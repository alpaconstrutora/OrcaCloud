import { describe, expect, it } from 'vitest';
import {
  LIMIAR_LINHA_DUVIDOSA, aplicarEdicao, contarDuvidosas, juntarPaginas, linhaDuvidosa,
  linhasDoTextoDoPdf, marcarRevisada, paginaTemTexto, podeTranscrever, textoDaTranscricao,
  type LinhaTranscrita,
} from '../utils/transcricaoDocumento';

/**
 * Transcrição dos documentos do empreendimento (23/11/2026).
 * Plano: docs/planos/2026-11-23-transcricao-de-documentos-do-empreendimento.md
 */

const ok = (t: string): LinhaTranscrita => ({ t, c: 95 });
const duvidosa = (t: string): LinhaTranscrita => ({ t, c: 40 });

describe('linha duvidosa', () => {
  it('é a linha do OCR abaixo do limiar; texto do PDF (c null) nunca é', () => {
    expect(linhaDuvidosa({ t: 'abc', c: LIMIAR_LINHA_DUVIDOSA - 1 })).toBe(true);
    expect(linhaDuvidosa({ t: 'abc', c: LIMIAR_LINHA_DUVIDOSA })).toBe(false);
    expect(linhaDuvidosa({ t: 'abc', c: null })).toBe(false);
  });

  it('linha em branco não conta como duvidosa', () => {
    expect(linhaDuvidosa({ t: '   ', c: 0 })).toBe(false);
    expect(contarDuvidosas([ok('a'), duvidosa('b'), { t: '', c: 0 }, duvidosa('c')])).toBe(2);
  });
});

describe('aplicarEdicao', () => {
  const originais = [ok('SAIBAM quantos'), duvidosa('FEAR GOMBIOO8S'), duvidosa('Boo OMI'), ok('Total final')];

  it('linha corrigida deixa de ser duvidosa; a que ficou igual continua', () => {
    const texto = 'SAIBAM quantos\nEmolumentos: Código 1409-2\nBoo OMI\nTotal final';
    const novas = aplicarEdicao(originais, texto);
    expect(novas.map(l => l.t)).toEqual(['SAIBAM quantos', 'Emolumentos: Código 1409-2', 'Boo OMI', 'Total final']);
    expect(novas.map(linhaDuvidosa)).toEqual([false, false, true, false]);
  });

  it('linha repetida só herda a confiança tantas vezes quanto existia', () => {
    const novas = aplicarEdicao([duvidosa('xx')], 'xx\nxx');
    expect(novas.map(linhaDuvidosa)).toEqual([true, false]);
  });

  it('ignora espaço no fim da linha, CRLF e linhas vazias sobrando no fim', () => {
    const novas = aplicarEdicao([duvidosa('Boo OMI')], 'Boo OMI   \r\nnova\r\n\r\n');
    expect(novas).toEqual([{ t: 'Boo OMI', c: 40 }, { t: 'nova', c: null }]);
  });

  it('texto apagado inteiro = nenhuma linha', () => {
    expect(aplicarEdicao(originais, '  \n ')).toEqual([]);
  });
});

it('marcarRevisada tira a confiança de todas as linhas', () => {
  expect(contarDuvidosas(marcarRevisada([duvidosa('a'), ok('b')]))).toBe(0);
});

it('textoDaTranscricao junta as linhas com quebra', () => {
  expect(textoDaTranscricao([ok('a'), { t: '', c: null }, ok('b')])).toBe('a\n\nb');
});

describe('linhasDoTextoDoPdf', () => {
  it('quebra a linha no hasEOL do pdf.js e junta os pedaços da mesma linha', () => {
    const itens = [
      { str: 'ESCRITURA', hasEOL: false }, { str: ' PÚBLICA', hasEOL: true },
      { str: 'de compra', hasEOL: false }, { str: ' e venda', hasEOL: false },
    ];
    expect(linhasDoTextoDoPdf(itens)).toEqual([
      { t: 'ESCRITURA PÚBLICA', c: null },
      { t: 'de compra e venda', c: null },
    ]);
  });

  it('descarta linha em branco', () => {
    expect(linhasDoTextoDoPdf([{ str: '  ', hasEOL: true }, { str: 'a', hasEOL: true }])).toEqual([{ t: 'a', c: null }]);
  });
});

it('paginaTemTexto exige um mínimo de caracteres (PDF escaneado costuma ter só lixo invisível)', () => {
  expect(paginaTemTexto([{ t: ' 1 ', c: null }])).toBe(false);
  expect(paginaTemTexto([{ t: 'SAIBAM quantos esta pública escritura de compra', c: null }])).toBe(true);
});

it('juntarPaginas põe uma linha em branco entre as páginas e pula página vazia', () => {
  expect(juntarPaginas([[ok('a')], [], [ok('b')]])).toEqual([ok('a'), { t: '', c: null }, ok('b')]);
});

describe('podeTranscrever', () => {
  it('PDF e imagem, pela extensão ou pelo tipo', () => {
    expect(podeTranscrever('ESCRITURA CASA.pdf')).toBe('pdf');
    expect(podeTranscrever('arquivo', 'application/pdf')).toBe('pdf');
    expect(podeTranscrever('foto.JPG')).toBe('imagem');
    expect(podeTranscrever('scan.webp')).toBe('imagem');
    expect(podeTranscrever('x', 'image/png')).toBe('imagem');
  });

  it('Word, Excel, DWG e ZIP não', () => {
    for (const nome of ['a.docx', 'b.xlsx', 'c.dwg', 'd.zip', 'sem-extensao']) {
      expect(podeTranscrever(nome)).toBeNull();
    }
  });
});
