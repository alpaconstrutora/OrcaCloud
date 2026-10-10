// utils/opuraMarketCaptura.ts
//
// Captura no navegador — Fase C do plano docs/planos/2026-10-10-opura-market-fontes.md.
//
// Por que existe: ZAP Imóveis, VivaReal e OLX respondem HTTP 403 quando quem pede
// a página é o servidor da Supabase (medido em 10/10/2026, na prova da Fase B).
// No navegador do usuário eles abrem. O favorito "Enviar ao ÒPURA" roda NA página
// do anúncio que o usuário está vendo, junta só os pedaços de que a leitura
// precisa (os mesmos de `PedacosDaPagina` em logica.ts) e abre o app em
// `#/opura-market?anuncio=<pacote>`. A leitura é a mesma do "Colar link".
//
// Não copia fotos (decisão do plano): chaves de imagem saem do pacote.

/** Parâmetro do hash que leva o pacote ao app. */
export const PARAMETRO_DA_CAPTURA = 'anuncio';

/** Teto do pacote em caracteres (o JSON antes do base64). */
export const MAX_PACOTE = 1_500_000;

/**
 * Roda na página do anúncio, como favorito (bookmarklet). ⚠️ AUTOCONTIDA: vira
 * texto por `toString()`, então não pode usar nada de fora dela — nem import,
 * nem constante do módulo, nem `?.`/`??` (o texto precisa rodar como está).
 */
export function capturarAnuncio(app: string, maximo: number): void {
  var d = document;
  var meta = function (nome: string): string | null {
    var el = d.querySelector('meta[property="' + nome + '"],meta[name="' + nome + '"]');
    var v = el ? el.getAttribute('content') : null;
    return v && v.trim() ? v.trim() : null;
  };
  // Só as chaves pedidas: o anúncio de portal traz telefone e nome do anunciante, que não interessam.
  var so = function (o: unknown, chaves: string[]): Record<string, unknown> | null {
    if (!o || typeof o !== 'object') return null;
    var r: Record<string, unknown> = {};
    for (var i = 0; i < chaves.length; i++) {
      var k = chaves[i];
      if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = (o as Record<string, unknown>)[k];
    }
    return r;
  };
  var objetoEm = function (t: string, ini: number): string | null {
    var prof = 0;
    var emTexto = false;
    var esc = false;
    for (var j = ini; j < t.length; j++) {
      var c = t.charAt(j);
      if (emTexto) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') emTexto = false;
        continue;
      }
      if (c === '"') emTexto = true;
      else if (c === '{') prof++;
      else if (c === '}') { prof--; if (prof === 0) return t.slice(ini, j + 1); }
    }
    return null;
  };
  var canonica = d.querySelector('link[rel="canonical"]');
  var pacote: Record<string, unknown> = {
    url: location.href,
    canonica: canonica ? canonica.getAttribute('href') : null,
    ogUrl: meta('og:url'),
    ogSiteName: meta('og:site_name'),
    ogTitulo: meta('og:title') || d.title || null,
    ogDescricao: meta('og:description') || meta('description'),
    precoMeta: meta('product:price:amount') || meta('og:price:amount'),
    ld: [],
    zap: null,
    olx: null,
    arbo: null,
  };
  var blocos = d.querySelectorAll('script[type="application/ld+json"]');
  for (var b = 0; b < blocos.length; b++) {
    try { (pacote.ld as unknown[]).push(JSON.parse(blocos[b].textContent || '')); } catch (e) { /* bloco inválido */ }
  }
  // ZAP e VivaReal: o payload do Next.js está no global self.__next_f. Depois que
  // a página "hidrata", o Next troca o push e os pedaços novos não ficam no
  // array; por isso, sem o anúncio no global, lê os <script> da própria página.
  var texto = '';
  var nf = (self as unknown as { __next_f?: unknown[] }).__next_f;
  if (nf && nf.length) {
    for (var n = 0; n < nf.length; n++) {
      var parte = nf[n] as unknown[];
      if (parte && typeof parte[1] === 'string') texto += parte[1];
    }
  }
  if (texto.indexOf('"listing":{') < 0) {
    texto = '';
    var scripts = d.getElementsByTagName('script');
    var re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
    for (var s = 0; s < scripts.length; s++) {
      var fonte = scripts[s].textContent || '';
      if (fonte.indexOf('__next_f') < 0) continue;
      var m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(fonte))) {
        try { texto += JSON.parse(m[1]); } catch (e) { /* pedaço que não é texto */ }
      }
    }
  }
  if (texto) {
    var i = texto.indexOf('"listing":{');
    if (i >= 0) {
      try {
        pacote.zap = so(JSON.parse(objetoEm(texto, i + 10) || ''), ['id', 'prices', 'title', 'href', 'business', 'address', 'amenities', 'description', 'unitType']);
      } catch (e) { /* sem anúncio */ }
    }
  }
  var olx = d.getElementById('initial-data');
  if (olx) {
    try {
      var dados = JSON.parse(olx.getAttribute('data-json') || '');
      pacote.olx = so(dados && dados.ad, ['listId', 'subject', 'body', 'priceValue', 'categoryName', 'canonicalUrl', 'friendlyUrl', 'location', 'properties']);
    } catch (e) { /* sem anúncio */ }
  }
  var next = d.getElementById('__NEXT_DATA__');
  if (next) {
    try {
      var j = JSON.parse(next.textContent || '');
      var imv = j && j.props && j.props.pageProps && j.props.pageProps.imovel;
      if (imv && typeof imv === 'object') {
        var arbo: Record<string, unknown> = {};
        for (var k in imv) if (/^imv_/.test(k)) arbo[k] = imv[k];
        arbo.tipo_imovel = imv.tipo_imovel;
        arbo.tipo_negocio = imv.tipo_negocio;
        arbo.url_amiga = imv.url_amiga;
        pacote.arbo = arbo;
      }
    } catch (e) { /* sem anúncio */ }
  }
  // Fotos nunca: qualquer chave de imagem sai do pacote.
  var json = JSON.stringify(pacote, function (chave, valor) {
    return /^(image|images|imagem|imagens|photo|photos|foto|fotos|medias|thumbnail|logo|videos?)$/i.test(chave) ? undefined : valor;
  });
  if (json.length > maximo) {
    alert('Esta página é grande demais para enviar ao ÒPURA. Use "Colar link de anúncio" no app.');
    return;
  }
  var bytes = unescape(encodeURIComponent(json));
  var b64 = btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  window.open(app + '#/opura-market?anuncio=' + b64, '_blank');
}

/**
 * O endereço do favorito: `javascript:` com a função acima e o endereço do app.
 * `app` = o app sem o hash (ex.: "https://app.orcacloud.com.br/").
 */
export function codigoDoFavorito(app: string): string {
  return 'javascript:' + encodeURIComponent(`(${capturarAnuncio.toString()})(${JSON.stringify(app)},${MAX_PACOTE});void 0`);
}

/** O pacote que chegou no hash (`#/opura-market?anuncio=…`), já decodificado; null se não houver ou não abrir. */
export function pacoteDoHash(hash: string): { url: string; pacote: Record<string, unknown> } | null {
  if (!hash.includes('?')) return null;
  const b64 = new URLSearchParams(hash.split('?')[1]).get(PARAMETRO_DA_CAPTURA);
  if (!b64 || b64.length > MAX_PACOTE * 2) return null;
  try {
    const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const pacote = JSON.parse(new TextDecoder().decode(bytes));
    if (!pacote || typeof pacote !== 'object' || Array.isArray(pacote) || typeof pacote.url !== 'string') return null;
    return { url: pacote.url, pacote };
  } catch {
    return null;
  }
}

/** O anúncio que chegou pelo favorito, a caminho da conferência. */
export type CapturaDoNavegador = NonNullable<ReturnType<typeof pacoteDoHash>>;
