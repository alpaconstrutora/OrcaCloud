/**
 * O MEMORIAL EM DOCX (28/09/2026, E3.1) — o engenheiro abre no Word, ajusta o
 * texto de apresentação e assina. Sem biblioteca de DOCX: o arquivo são quatro
 * XML num zip (WordprocessingML mínimo), e o molde é o do BCF — esta função,
 * pura, diz QUAIS arquivos; o serviço só zipa (`pizzip`).
 *
 * Tabela larga (a da água tem 14 colunas) pede página deitada: `paisagem`.
 */
import type { BlocoDoMemorial } from './blueprintMemorialHidro';

export interface ArquivoDoDocx {
  caminho: string;
  conteudo: string;
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TabelaDoMemorial"><w:name w:val="Tabela do memorial"/><w:tblPr><w:tblBorders>
<w:top w:val="single" w:sz="4" w:color="808080"/><w:left w:val="single" w:sz="4" w:color="808080"/><w:bottom w:val="single" w:sz="4" w:color="808080"/>
<w:right w:val="single" w:sz="4" w:color="808080"/><w:insideH w:val="single" w:sz="4" w:color="808080"/><w:insideV w:val="single" w:sz="4" w:color="808080"/>
</w:tblBorders><w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

function paragrafo(texto: string, estilo?: string): string {
  const pPr = estilo ? `<w:pPr><w:pStyle w:val="${estilo}"/></w:pPr>` : '';
  return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${xml(texto)}</w:t></w:r></w:p>`;
}

function celula(texto: string, cabecalho: boolean, tamanho: number): string {
  const sombra = cabecalho ? '<w:shd w:val="clear" w:color="auto" w:fill="E5E7EB"/>' : '';
  const negrito = cabecalho ? '<w:b/>' : '';
  return `<w:tc><w:tcPr>${sombra}</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr>${negrito}<w:sz w:val="${tamanho}"/></w:rPr><w:t xml:space="preserve">${xml(texto)}</w:t></w:r></w:p></w:tc>`;
}

function tabela(cabecalho: string[], linhas: string[][]): string {
  // Tabela larga, letra menor: 14 colunas não cabem em 10 pt nem deitadas.
  const tamanho = cabecalho.length > 8 ? 14 : 18;
  const linha = (celulas: string[], cab: boolean) =>
    `<w:tr>${cab ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${celulas.map((c) => celula(c, cab, tamanho)).join('')}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TabelaDoMemorial"/><w:tblW w:w="5000" w:type="pct"/></w:tblPr>${linha(cabecalho, true)}${linhas.map((l) => linha(l, false)).join('')}</w:tbl>${paragrafo('')}`;
}

/** O `word/document.xml` dos blocos. */
export function documentoDoMemorial(blocos: BlocoDoMemorial[], paisagem: boolean): string {
  const corpo = blocos
    .map((b) => {
      if (b.tipo === 'titulo') return paragrafo(b.texto, 'Title');
      if (b.tipo === 'secao') return paragrafo(b.texto, 'Heading1');
      if (b.tipo === 'subsecao') return paragrafo(b.texto, 'Heading2');
      if (b.tipo === 'paragrafo') return paragrafo(b.texto);
      return tabela(b.cabecalho, b.linhas);
    })
    .join('');
  // A4 em twips (1/20 pt): 11906 × 16838; margem de 2 cm (1134).
  const [w, h] = paisagem ? [16838, 11906] : [11906, 16838];
  const secao = `<w:sectPr><w:pgSz w:w="${w}" w:h="${h}"${paisagem ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}${secao}</w:body></w:document>`;
}

/** Os arquivos do `.docx`. */
export function arquivosDoDocx(blocos: BlocoDoMemorial[], paisagem = false): ArquivoDoDocx[] {
  return [
    { caminho: '[Content_Types].xml', conteudo: CONTENT_TYPES },
    { caminho: '_rels/.rels', conteudo: RELS },
    { caminho: 'word/_rels/document.xml.rels', conteudo: DOCUMENT_RELS },
    { caminho: 'word/styles.xml', conteudo: STYLES },
    { caminho: 'word/document.xml', conteudo: documentoDoMemorial(blocos, paisagem) },
  ];
}
