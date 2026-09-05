/**
 * A GUARDA DE FORMATO da planta de fundo.
 *
 * Nasceu de um defeito observado duas vezes (01/09 e 05/09/2026): um IFC de
 * 1,28 MB importado como planta de fundo. O código só perguntava "é PDF?",
 * tratava o resto como imagem, subia os bytes, GRAVAVA A LINHA, e só então
 * tentava desenhar num `<img>` — que falhava. A linha ficava, e o erro voltava
 * a cada abertura do estudo. Dois estudos ficaram nesse estado.
 *
 * O que se trava aqui é a parte pura: reconhecer o formato e escrever a recusa.
 * A prova de que o arquivo DECODIFICA vive no hook (`abreComoImagem`), roda
 * antes do upload, e não cabe em jsdom — que não decodifica imagem nenhuma.
 */
import { describe, expect, it } from 'vitest';
import { formatoDeFundo, recusaDeFundo } from '../utils/blueprintUnderlay';

describe('planta de fundo · o que serve', () => {
  it('aceita PNG, JPEG e PDF pelo tipo do sistema', () => {
    expect(formatoDeFundo('planta.png', 'image/png')).toBe('IMAGEM');
    expect(formatoDeFundo('planta.jpg', 'image/jpeg')).toBe('IMAGEM');
    expect(formatoDeFundo('projeto.pdf', 'application/pdf')).toBe('PDF');
    expect(recusaDeFundo('planta.png', 'image/png')).toBeNull();
  });

  it('aceita pela EXTENSÃO quando o sistema não informa o tipo', () => {
    // `File.type` vem vazio em várias combinações de SO e navegador. Recusar
    // por isso faria a importação depender de qual máquina abriu o arquivo.
    expect(formatoDeFundo('planta.PNG', '')).toBe('IMAGEM');
    expect(formatoDeFundo('projeto.PDF', '')).toBe('PDF');
    expect(recusaDeFundo('projeto.PDF', '')).toBeNull();
  });
});

describe('planta de fundo · a recusa', () => {
  it('o IFC é recusado, e a frase diz o que fazer', () => {
    // O caso real: `File.type` veio `application/octet-stream`, e por isso o
    // código antigo o tratou como imagem.
    const r = recusaDeFundo('Modelo 3D - Estrutural 10-02-26.IFC', 'application/octet-stream');
    expect(r).toContain('Modelo 3D - Estrutural 10-02-26.IFC');
    expect(r).toContain('modelo 3D (IFC)');
    expect(r).toContain('exporte uma planta baixa dele em PDF');
    expect(formatoDeFundo('x.ifc', '')).toBeNull();
  });

  it('CAD e Revit têm saída própria — a resposta útil é diferente para cada', () => {
    expect(recusaDeFundo('planta.dwg', '')).toContain('desenho de CAD');
    expect(recusaDeFundo('planta.dwg', '')).toContain('plote a planta em PDF');
    expect(recusaDeFundo('casa.rvt', '')).toContain('Revit');
    expect(recusaDeFundo('peca.step', '')).toContain('modelo 3D');
  });

  it('formato desconhecido cai na frase geral, com o nome do arquivo', () => {
    // Quem escolheu errado num diálogo de dez arquivos precisa saber QUAL a
    // tela recusou.
    const r = recusaDeFundo('contrato.docx', '');
    expect(r).toContain('contrato.docx');
    expect(r).toContain('PNG, JPEG ou PDF');
  });

  it('nome sem extensão nenhuma é recusado, não aceito por omissão', () => {
    expect(formatoDeFundo('arquivo', '')).toBeNull();
    expect(recusaDeFundo('arquivo', '')).toContain('arquivo');
  });
});
