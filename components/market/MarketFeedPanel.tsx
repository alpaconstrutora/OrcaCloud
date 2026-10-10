import React from 'react';
import { Trash2 } from 'lucide-react';
import {
  opuraMarketService,
  ROTULO_DA_FONTE,
  type ResultadoImportacaoMercado,
  type FonteMercado,
  type TipoDeFonteMercado,
  type LeituraDeAnuncio,
} from '../../services/opuraMarketService';
import { supabase } from '../../lib/supabase';
import type { OpuraMarketCity, OpuraMarketListing } from '../../types';
import TableSwitch from '../ui/TableSwitch';
import { useConfirm } from '../ui/confirm';
import MarketAnuncioLinkSheet from './MarketAnuncioLinkSheet';
import { codigoDoFavorito, type CapturaDoNavegador } from '../../utils/opuraMarketCaptura';
import { maxDetalhesDaFonte, fonteEhConexao381, fonteTemColetaDiaria } from '../../supabase/functions/opura-market-import/logica';

/**
 * Fontes de anúncios da praça (plano 2026-10-10-opura-market-fontes, Fase A).
 *
 * Até 10/10/2026 havia UM feed VRSync por organização + cidade, e o módulo
 * dependia da imobiliária mandar o link. Agora cada praça tem várias fontes,
 * cada uma lida pelo conector do tipo dela na Edge Function opura-market-import,
 * com importação diária opcional (cron) e "Importar agora".
 */
const descreverResultado = (r: ResultadoImportacaoMercado): string => {
  const partes = [`Anúncios novos: ${r.novos}`];
  if (r.atualizados) partes.push(`já importados, com preço atualizado: ${r.atualizados}`);
  if (r.reativados) partes.push(`voltaram à fonte: ${r.reativados}`);
  if (r.saidas) partes.push(`saíram da fonte (vendidos ou retirados): ${r.saidas}`);
  if (r.saidasIgnoradas) partes.push(`saídas não registradas: ${r.saidasIgnoradas}`);
  if (r.detalhes) {
    partes.push(`endereço buscado no site: ${r.detalhes.buscados}`);
    if (r.detalhes.adiados) partes.push(`anúncios novos para a próxima rodada: ${r.detalhes.adiados} (limite de ${r.detalhes.limite} por rodada)`);
    if (r.detalhes.semDetalhe) partes.push(`sem endereço (detalhe indisponível): ${r.detalhes.semDetalhe}`);
  }
  if (r.duplicados) partes.push(`repetidos de anúncios que já existiam: ${r.duplicados}`);
  if (r.semLocalizacao) partes.push(`endereço não encontrado: ${r.semLocalizacao}`);
  if (r.pendentes) partes.push(`ainda sem localização por limite de tempo: ${r.pendentes} (use "Localizar anúncios sem coordenada")`);
  const ignorados = Object.entries(r.ignorados ?? {}).map(([motivo, n]) => `${n} ${motivo}`);
  if (ignorados.length) partes.push(`ignorados: ${ignorados.join(', ')}`);
  return partes.join(' · ');
};

/** Resultado de gravar UM anúncio colado por link. */
const descreverAnuncioGravado = (r: ResultadoImportacaoMercado): string => {
  const partes: string[] = [];
  if (r.novos) partes.push('anúncio gravado');
  if (r.duplicados) partes.push('gravado, mas repete um anúncio que já existia (mesmo lugar, quartos e área): fica fora das médias');
  if (r.atualizados) partes.push('já estava na base: dados atualizados');
  if (r.reativados) partes.push('estava como saída e voltou a ativo');
  if (r.semLocalizacao) partes.push('endereço não encontrado no mapa');
  if (r.pendentes) partes.push('localização pendente (use "Localizar anúncios sem coordenada")');
  const ignorados = Object.keys(r.ignorados ?? {});
  if (ignorados.length) partes.push(`não gravado: ${ignorados.join(', ')}`);
  return partes.join(' · ') || 'nada gravado';
};

const SEM_ORG = 'Selecione uma organização no topo da tela: os anúncios são gravados nela.';

/** Conectores que já leem fonte salva (os demais entram nas próximas fases do plano). */
const TIPOS_DISPONIVEIS: TipoDeFonteMercado[] = ['vrsync', 'api_conexao381'];

const EXEMPLO_DE_LINK: Record<TipoDeFonteMercado, string> = {
  vrsync: 'https://imobiliaria.com.br/feed-vrsync.xml',
  api_conexao381: 'https://conexao381.com.br',
  portal_zap: 'https://www.zapimoveis.com.br/venda/imoveis/mg+cambui/',
  portal_olx: 'https://www.olx.com.br/imoveis/venda/estado-mg/...',
};

/**
 * Hipótese editável da fonte da Conexão 381: quantos anúncios NOVOS têm o
 * endereço buscado por rodada (`config.max_detalhes`). Cada um é uma requisição
 * ao site, a ~1 por segundo; o que passa do limite entra na rodada seguinte.
 */
function AjusteMaxDetalhes({ fonte, desabilitado, onSalvo, onErro }: {
  fonte: FonteMercado;
  desabilitado?: string;
  onSalvo: (f: FonteMercado) => void;
  onErro: (mensagem: string) => void;
}) {
  const atual = maxDetalhesDaFonte(fonte.config);
  const [valor, setValor] = React.useState(String(atual));
  const [salvando, setSalvando] = React.useState(false);
  React.useEffect(() => { setValor(String(atual)); }, [atual]);
  const salvar = async () => {
    const n = maxDetalhesDaFonte({ max_detalhes: valor });
    setValor(String(n));
    if (n === atual) return;
    setSalvando(true);
    try {
      onSalvo(await opuraMarketService.salvarConfigDaFonte(fonte.id, { ...fonte.config, max_detalhes: n }));
    } catch (err: any) {
      console.error('Falha ao salvar o limite de detalhes:', err);
      onErro(err.message || 'falha ao salvar o limite de detalhes');
      setValor(String(atual));
    } finally {
      setSalvando(false);
    }
  };
  return (
    <label className="flex items-center gap-2 text-xs text-slate-600 shrink-0" title={desabilitado ?? 'Anúncios novos com endereço buscado por rodada (0 a 300). O restante entra na rodada seguinte.'}>
      Endereços buscados por rodada
      <input
        type="number"
        min={0}
        max={300}
        value={valor}
        disabled={!!desabilitado || salvando}
        onChange={(e) => setValor(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-20 h-8 px-2 bg-white border border-slate-200 rounded-[6px] text-xs font-semibold text-slate-700 text-right focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:text-slate-400"
      />
    </label>
  );
}

interface Props {
  organizationId: string;
  cityId: string;
  /** A praça selecionada: o anúncio colado tem de ser desta cidade. */
  cidade: OpuraMarketCity | null;
  listings: OpuraMarketListing[];
  onAtualizado: () => Promise<void>;
  /** Anúncio enviado pelo favorito "Enviar ao ÒPURA" (Fase C), esperando leitura. */
  captura?: CapturaDoNavegador | null;
  onCapturaUsada?: () => void;
}

export default function MarketFeedPanel({ organizationId, cityId, cidade, listings, onAtualizado, captura = null, onCapturaUsada }: Props) {
  const confirm = useConfirm();
  // Colar link de anúncio (Fase B do plano de fontes): lê no servidor e abre a conferência.
  const [linkAnuncio, setLinkAnuncio] = React.useState('');
  const [lendoAnuncio, setLendoAnuncio] = React.useState(false);
  const [leitura, setLeitura] = React.useState<LeituraDeAnuncio | null>(null);
  const [fontes, setFontes] = React.useState<FonteMercado[]>([]);
  const [ocupada, setOcupada] = React.useState<string | null>(null);   // id da fonte em operação
  const [novoTipo, setNovoTipo] = React.useState<TipoDeFonteMercado>('vrsync');
  const [novoLink, setNovoLink] = React.useState('');
  const [adicionando, setAdicionando] = React.useState(false);
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [importandoArquivo, setImportandoArquivo] = React.useState(false);
  const [localizando, setLocalizando] = React.useState(false);
  const [relocalizando, setRelocalizando] = React.useState(false);
  const [resultado, setResultado] = React.useState<string | null>(null);

  const carregarFontes = React.useCallback(async () => {
    if (!organizationId || !cityId) { setFontes([]); return; }
    try {
      setFontes(await opuraMarketService.listarFontes(organizationId, cityId));
    } catch (err) {
      console.error('Falha ao ler as fontes:', err);
    }
  }, [organizationId, cityId]);

  React.useEffect(() => { carregarFontes(); }, [carregarFontes]);

  const trocarFonte = (f: FonteMercado) => setFontes((lista) => lista.map((x) => (x.id === f.id ? f : x)));
  const trabalhando = !!ocupada || adicionando || importandoArquivo || localizando || relocalizando || lendoAnuncio;

  const linkColado = linkAnuncio.trim();
  const motivoLer = !organizationId ? SEM_ORG
    : !cityId ? 'Selecione a cidade.'
    : !linkColado ? 'Cole o link de um anúncio.'
    : !/^https:\/\//i.test(linkColado) ? 'O link precisa começar com https://.'
    : trabalhando ? 'Aguarde a operação em andamento.'
    : undefined;

  const lerAnuncio = async () => {
    if (motivoLer) return;
    setLendoAnuncio(true);
    setResultado(null);
    try {
      setLeitura(await opuraMarketService.lerAnuncioPorLink(organizationId, cityId, linkColado));
    } catch (err: any) {
      console.error('Falha ao ler o anúncio:', err);
      setResultado(`Erro: ${err.message || 'falha ao ler o anúncio'}`);
    } finally {
      setLendoAnuncio(false);
    }
  };

  // Anúncio enviado pelo favorito (Fase C): lido assim que houver organização e
  // praça. A ref impede ler o mesmo pacote duas vezes (efeito repetido do StrictMode).
  const capturaLida = React.useRef<CapturaDoNavegador | null>(null);
  React.useEffect(() => {
    if (!captura || !organizationId || !cityId || capturaLida.current === captura) return;
    capturaLida.current = captura;
    setLendoAnuncio(true);
    setResultado(null);
    opuraMarketService.lerAnuncioPorLink(organizationId, cityId, captura.url, captura.pacote)
      .then(setLeitura)
      .catch((err: any) => {
        console.error('Falha ao ler o anúncio enviado pelo navegador:', err);
        setResultado(`Erro: ${err.message || 'falha ao ler o anúncio enviado pelo navegador'}`);
      })
      .finally(() => {
        setLendoAnuncio(false);
        onCapturaUsada?.();
      });
  }, [captura, organizationId, cityId, onCapturaUsada]);

  // O favorito: `javascript:` com a captura e o endereço deste app. O React
  // bloqueia `javascript:` no `href` do JSX, então o endereço entra pelo DOM.
  const codigoFavorito = React.useMemo(
    () => (typeof window !== 'undefined' ? codigoDoFavorito(window.location.href.split('#')[0]) : ''),
    []
  );
  const favoritoRef = React.useRef<HTMLAnchorElement>(null);
  React.useEffect(() => {
    favoritoRef.current?.setAttribute('href', codigoFavorito);
  }, [codigoFavorito]);

  const copiarFavorito = async () => {
    try {
      await navigator.clipboard.writeText(codigoFavorito);
      setResultado('Código do favorito copiado. Crie um favorito no navegador e cole este código no campo do endereço (URL).');
    } catch {
      setResultado('Erro: o navegador não deixou copiar. Arraste o botão "Enviar ao ÒPURA" para a barra de favoritos.');
    }
  };

  const anuncioGravado = async (r: ResultadoImportacaoMercado, site: string) => {
    setResultado(`${site}: ${descreverAnuncioGravado(r)}`);
    setLinkAnuncio('');
    await onAtualizado();
  };

  // Anúncios da organização só no ponto do bairro ou não encontrados (item 2 do
  // plano 2026-10-10-opura-market-pendencias): 'relocalizar' tenta de novo e nunca piora.
  const aproximados = listings.filter(
    l => l.organizationId === organizationId && (l.geoPrecision === 'bairro' || l.geoPrecision === 'nao_encontrado')
  ).length;

  // Anúncios da organização nesta cidade sem coordenada e sem tentativa registrada.
  const pendentes = listings.filter(
    l => l.organizationId === organizationId && l.latitude == null && !l.geoPrecision
  ).length;

  const linkNovo = novoLink.trim();
  const motivoAdicionar = !organizationId ? SEM_ORG
    : !cityId ? 'Selecione a cidade.'
    : !linkNovo ? 'Informe o link da fonte.'
    : !/^https:\/\//i.test(linkNovo) ? 'O link precisa começar com https://.'
    : novoTipo === 'api_conexao381' && !fonteEhConexao381(linkNovo) ? 'A fonte da Conexão 381 é o site https://conexao381.com.br.'
    : undefined;

  const trocarTipo = (t: TipoDeFonteMercado) => {
    setNovoTipo(t);
    // A API da Conexão 381 tem endereço fixo: o link é o site.
    if (t === 'api_conexao381') setNovoLink('https://conexao381.com.br');
    else if (novoTipo === 'api_conexao381') setNovoLink('');
  };

  const adicionar = async () => {
    if (motivoAdicionar) return;
    setAdicionando(true);
    setResultado(null);
    try {
      const { data } = await supabase.auth.getUser();
      // A Conexão 381 nunca tem coleta diária (decisão de 10/10/2026; o banco também trava).
      const f = await opuraMarketService.criarFonte({
        organizationId, cityId, tipo: novoTipo, url: linkNovo, ativo: fonteTemColetaDiaria(novoTipo), email: data.user?.email ?? null,
      });
      setFontes((lista) => [...lista, f]);
      setNovoLink('');
    } catch (err: any) {
      console.error('Falha ao adicionar a fonte:', err);
      setResultado(`Erro: ${err.message || 'falha ao adicionar a fonte'}`);
    } finally {
      setAdicionando(false);
    }
  };

  const ligar = async (f: FonteMercado) => {
    if (!fonteTemColetaDiaria(f.tipo)) return;
    setOcupada(f.id);
    try {
      trocarFonte(await opuraMarketService.ligarFonte(f.id, !f.ativo));
    } catch (err: any) {
      console.error('Falha ao alterar a fonte:', err);
      setResultado(`Erro: ${err.message || 'falha ao alterar a fonte'}`);
    } finally {
      setOcupada(null);
    }
  };

  const importarAgora = async (f: FonteMercado) => {
    setOcupada(f.id);
    setResultado(null);
    try {
      const r = await opuraMarketService.importarFonteAgora(organizationId, f.id);
      setResultado(`${ROTULO_DA_FONTE[f.tipo]}: ${descreverResultado(r)}`);
      await Promise.all([onAtualizado(), carregarFontes()]);
    } catch (err: any) {
      console.error('Falha ao importar a fonte:', err);
      setResultado(`Erro: ${err.message || 'falha inesperada'}`);
      await carregarFontes();
    } finally {
      setOcupada(null);
    }
  };

  const remover = async (f: FonteMercado) => {
    const ok = await confirm({
      title: 'Remover esta fonte?',
      message: `${ROTULO_DA_FONTE[f.tipo]} — ${f.url}. Os anúncios já importados ficam; a fonte só deixa de ser lida.`,
      confirmLabel: 'Remover',
      variant: 'danger',
    });
    if (!ok) return;
    setOcupada(f.id);
    try {
      await opuraMarketService.removerFonte(f.id);
      setFontes((lista) => lista.filter((x) => x.id !== f.id));
    } catch (err: any) {
      console.error('Falha ao remover a fonte:', err);
      setResultado(`Erro: ${err.message || 'falha ao remover a fonte'}`);
    } finally {
      setOcupada(null);
    }
  };

  const importarArquivo = async () => {
    if (!arquivo || !organizationId || !cityId) return;
    setImportandoArquivo(true);
    setResultado(null);
    try {
      const r = await opuraMarketService.importarFeed(organizationId, cityId, { feedXml: await arquivo.text() });
      setResultado(`Arquivo ${arquivo.name}: ${descreverResultado(r)}`);
      setArquivo(null);
      await onAtualizado();
    } catch (err: any) {
      console.error('Falha ao importar o arquivo:', err);
      setResultado(`Erro: ${err.message || 'falha inesperada'}`);
    } finally {
      setImportandoArquivo(false);
    }
  };

  const relocalizar = async () => {
    if (!organizationId || !cityId) return;
    setRelocalizando(true);
    setResultado(null);
    try {
      const r = await opuraMarketService.relocalizarAproximados(organizationId, cityId);
      const partes = [`Com posição melhor: ${r.melhorados}`, `sem como melhorar: ${r.semMudanca}`];
      if (r.restantes) partes.push(`restantes por limite de tempo, rode de novo: ${r.restantes}`);
      setResultado(partes.join(' · '));
      await onAtualizado();
    } catch (err: any) {
      console.error('Falha ao tentar de novo:', err);
      setResultado(`Erro: ${err.message || 'falha inesperada'}`);
    } finally {
      setRelocalizando(false);
    }
  };

  const localizar = async () => {
    if (!organizationId || !cityId) return;
    setLocalizando(true);
    setResultado(null);
    try {
      const r = await opuraMarketService.localizarPendentes(organizationId, cityId);
      const partes = [`Localizados: ${r.localizados}`, `endereço não encontrado: ${r.naoEncontrados}`];
      if (r.restantes) partes.push(`restantes, rode de novo: ${r.restantes}`);
      setResultado(partes.join(' · '));
      await onAtualizado();
    } catch (err: any) {
      console.error('Falha ao localizar anúncios:', err);
      setResultado(`Erro: ${err.message || 'falha inesperada'}`);
    } finally {
      setLocalizando(false);
    }
  };

  const motivoSemOrgOuOcupado = (f?: FonteMercado) =>
    !organizationId ? SEM_ORG : trabalhando && ocupada !== f?.id ? 'Aguarde a operação em andamento.' : undefined;

  return (
    <div className="bg-white rounded-[10px] border border-slate-200/60 p-6 space-y-6">
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-base font-bold text-slate-900">Fontes de anúncios</h2>
        <p className="text-xs text-slate-500 mt-1">
          Cada fonte é lida no servidor. Ligada, ela é importada todo dia de manhã: anúncio novo entra, anúncio que some da fonte sai da base ativa e conta como vendido ou retirado nos indicadores do bairro.
          Reimportar a mesma fonte atualiza os preços em vez de duplicar.
        </p>
      </div>

      <div className="p-4 bg-slate-50 border border-slate-100 rounded-[10px] space-y-3">
        <div className="text-xs text-slate-600 font-semibold">
          Colar link de anúncio
          <span className="block text-slate-400 font-normal mt-0.5">
            Um anúncio do ZAP, VivaReal, OLX, Conexão 381 ou do site de uma imobiliária. O servidor lê a página e você confere os dados antes de gravar.
            Site que bloqueia a leitura abre a conferência em branco, para preencher à mão.
          </span>
        </div>
        <div className="flex flex-col md:flex-row gap-3 items-center">
          <input
            type="text"
            value={linkAnuncio}
            onChange={(e) => setLinkAnuncio(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') lerAnuncio(); }}
            placeholder="https://www.zapimoveis.com.br/imovel/..."
            className="flex-1 w-full h-9 px-3 bg-white border border-slate-200 rounded-[6px] text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <button
            onClick={lerAnuncio}
            disabled={!!motivoLer}
            title={motivoLer}
            className="h-9 px-4 rounded-[6px] text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed shrink-0"
          >
            {lendoAnuncio ? 'Lendo…' : 'Ler anúncio'}
          </button>
        </div>
      </div>

      {captura && (!organizationId || !cityId) && (
        <div className="p-4 bg-amber-50 border border-amber-100 rounded-[10px] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="text-xs text-amber-800 font-semibold min-w-0">
            Anúncio recebido do navegador, esperando para ser lido.
            <span className="block font-normal mt-0.5 truncate" title={captura.url}>{captura.url}</span>
            <span className="block font-normal mt-0.5">{!organizationId ? SEM_ORG : 'Selecione a cidade da praça.'}</span>
          </div>
          <button
            onClick={() => onCapturaUsada?.()}
            className="h-9 px-4 rounded-[6px] text-[13px] font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0"
          >
            Descartar
          </button>
        </div>
      )}

      <div className="p-4 bg-slate-50 border border-slate-100 rounded-[10px] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="text-xs text-slate-600 font-semibold">
          Capturar no navegador (ZAP, VivaReal, OLX)
          <span className="block text-slate-400 font-normal mt-0.5">
            Esses portais bloqueiam a leitura pelo servidor. Arraste o botão para a barra de favoritos do navegador (uma vez só, no computador).
            Depois, na página de um anúncio, clique no favorito: o app abre com o anúncio para conferir. Fotos não são copiadas.
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <a
            ref={favoritoRef}
            onClick={(e) => e.preventDefault()}
            draggable
            title="Arraste para a barra de favoritos. Clicar aqui não faz nada: o favorito funciona na página do anúncio."
            className="h-9 px-4 inline-flex items-center rounded-[6px] text-[13px] font-medium bg-white border border-dashed border-blue-300 text-blue-700 cursor-grab select-none"
          >
            Enviar ao ÒPURA
          </a>
          <button
            onClick={copiarFavorito}
            title="Para criar o favorito à mão: copia o código para colar no endereço (URL) do favorito"
            className="h-9 px-4 rounded-[6px] text-[13px] font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            Copiar código
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {fontes.length === 0 ? (
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-[10px] text-xs text-slate-500">
            Nenhuma fonte cadastrada nesta praça.
          </div>
        ) : fontes.map((f) => {
          const motivo = motivoSemOrgOuOcupado(f);
          return (
            <div key={f.id} className="p-4 bg-slate-50 border border-slate-100 rounded-[10px] space-y-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="block text-xs font-semibold text-slate-700">{ROTULO_DA_FONTE[f.tipo] ?? f.tipo}</span>
                  <span className="block text-xs text-slate-500 truncate" title={f.url}>{f.url}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {fonteTemColetaDiaria(f.tipo) ? (
                    <TableSwitch
                      checked={f.ativo}
                      onChange={() => ligar(f)}
                      disabled={!!motivo || ocupada === f.id}
                      title={motivo ?? (f.ativo ? 'Importada todo dia de manhã. Clique para desligar.' : 'Só importa quando você clica "Importar agora". Clique para ligar a importação diária.')}
                      onLabel="Todo dia"
                      offLabel="Desligada"
                    />
                  ) : (
                    <span
                      className="text-xs font-semibold text-slate-500"
                      title="Esta fonte não tem coleta diária: só é lida quando você clica &quot;Importar agora&quot;."
                    >
                      Só sob comando
                    </span>
                  )}
                  <button
                    onClick={() => importarAgora(f)}
                    disabled={!!motivo || ocupada === f.id}
                    title={motivo}
                    className="h-8 px-3 rounded-[6px] text-[13px] font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    {ocupada === f.id ? 'Importando…' : 'Importar agora'}
                  </button>
                  <button
                    onClick={() => remover(f)}
                    disabled={!!motivo || ocupada === f.id}
                    title={motivo ?? 'Remover a fonte (os anúncios importados ficam)'}
                    className="h-8 w-8 flex items-center justify-center rounded-[6px] text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:text-slate-300 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {f.tipo === 'api_conexao381' && (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Sem coleta diária: a Conexão 381 só é lida quando você clica &quot;Importar agora&quot;. Cada leitura traz a lista de anúncios de venda da cidade; o endereço é buscado só dos anúncios novos.
                  </p>
                  <AjusteMaxDetalhes
                    fonte={f}
                    desabilitado={motivo ?? (ocupada === f.id ? 'Aguarde a operação em andamento.' : undefined)}
                    onSalvo={trocarFonte}
                    onErro={(m) => setResultado(`Erro: ${m}`)}
                  />
                </div>
              )}
              {f.ultimaExecucao && (
                <div className={`text-xs ${f.ultimoErro ? 'text-rose-700' : 'text-slate-500'}`}>
                  Última importação: {new Date(f.ultimaExecucao).toLocaleString('pt-BR')} —{' '}
                  {f.ultimoErro ? `falhou: ${f.ultimoErro}` : f.ultimoResultado ? descreverResultado(f.ultimoResultado) : 'sem detalhes'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col md:flex-row gap-3 items-center">
        <select
          value={novoTipo}
          onChange={(e) => trocarTipo(e.target.value as TipoDeFonteMercado)}
          className="h-9 px-3 bg-white border border-slate-200 rounded-[6px] text-xs font-semibold text-slate-600 focus:outline-none shrink-0"
          title="Tipo da fonte"
        >
          {TIPOS_DISPONIVEIS.map((t) => <option key={t} value={t}>{ROTULO_DA_FONTE[t]}</option>)}
        </select>
        <div className="flex-1 w-full">
          <input
            type="text"
            value={novoLink}
            onChange={(e) => setNovoLink(e.target.value)}
            placeholder={EXEMPLO_DE_LINK[novoTipo]}
            className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-[6px] text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <button
          onClick={adicionar}
          disabled={trabalhando || !!motivoAdicionar}
          title={motivoAdicionar ?? (trabalhando ? 'Aguarde a operação em andamento.' : undefined)}
          className="h-9 px-4 rounded-[6px] text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed shrink-0"
        >
          {adicionando ? 'Adicionando…' : 'Adicionar fonte'}
        </button>
      </div>

      <div className="p-4 bg-slate-50 border border-slate-100 rounded-[10px] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="text-xs text-slate-600 font-semibold">
          Importar um arquivo .xml (VRSync) uma vez
          <span className="block text-slate-400 font-normal mt-0.5">
            Para quando a imobiliária manda o arquivo em vez do link. Não vira fonte salva: não gera saídas.
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <label className="h-9 px-3 flex items-center gap-1.5 bg-white border border-slate-200 rounded-[6px] text-[13px] font-medium text-slate-600 hover:bg-slate-50 cursor-pointer">
            <input type="file" accept=".xml,text/xml,application/xml" className="hidden" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            {arquivo ? `📄 ${arquivo.name}` : 'Escolher arquivo .xml'}
          </label>
          <button
            onClick={importarArquivo}
            disabled={!arquivo || trabalhando || !organizationId}
            title={!organizationId ? SEM_ORG : !arquivo ? 'Escolha o arquivo .xml.' : trabalhando ? 'Aguarde a operação em andamento.' : undefined}
            className="h-9 px-4 rounded-[6px] text-[13px] font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            {importandoArquivo ? 'Importando…' : 'Importar arquivo'}
          </button>
        </div>
      </div>

      <div className="p-4 bg-slate-50 border border-slate-100 rounded-[10px] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="text-xs text-slate-600 font-semibold">
          {pendentes > 0
            ? `${pendentes} anúncios da sua organização nesta cidade ainda não têm coordenada.`
            : 'Todos os anúncios da sua organização nesta cidade já passaram pela localização.'}
          <span className="block text-slate-400 mt-0.5">
            A localização usa rua, número, bairro e cidade. Cada rodada trabalha por até cerca de dois minutos.
          </span>
        </div>
        <button
          onClick={localizar}
          disabled={trabalhando || pendentes === 0 || !organizationId}
          title={!organizationId ? SEM_ORG : pendentes === 0 ? 'Não há anúncio pendente de localização nesta cidade.' : trabalhando ? 'Aguarde a operação em andamento.' : undefined}
          className="h-9 px-4 rounded-[6px] text-[13px] font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed shrink-0"
        >
          {localizando ? 'Localizando…' : 'Localizar anúncios sem coordenada'}
        </button>
      </div>

      <div className="p-4 bg-slate-50 border border-slate-100 rounded-[10px] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="text-xs text-slate-600 font-semibold">
          {aproximados > 0
            ? `${aproximados} anúncios da sua organização nesta cidade estão só no ponto do bairro ou com o endereço não encontrado.`
            : 'Nenhum anúncio da sua organização nesta cidade está só no ponto do bairro ou sem endereço encontrado.'}
          <span className="block text-slate-400 font-normal mt-0.5">
            Tenta de novo pela rua, pelo CEP e pelo bairro cadastrado. Só troca a posição quando a nova for mais exata. Bairro que não existe no mapa precisa ser cadastrado na praça.
          </span>
        </div>
        <button
          onClick={relocalizar}
          disabled={trabalhando || aproximados === 0 || !organizationId}
          title={!organizationId ? SEM_ORG : aproximados === 0 ? 'Não há anúncio aproximado nesta cidade.' : trabalhando ? 'Aguarde a operação em andamento.' : undefined}
          className="h-9 px-4 rounded-[6px] text-[13px] font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed shrink-0"
        >
          {relocalizando ? 'Tentando…' : 'Tentar localizar de novo'}
        </button>
      </div>

      {trabalhando && (
        <div className="p-4 bg-blue-50 border border-blue-100 rounded-[10px] text-xs text-blue-800 font-semibold">
          Trabalhando no servidor. Os endereços são localizados a cerca de um por segundo.
        </div>
      )}

      {resultado && (
        <div className={`p-4 rounded-[10px] border text-xs font-semibold ${
          resultado.startsWith('Erro') ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-emerald-50 border-emerald-100 text-emerald-800'
        }`}>
          {resultado}
        </div>
      )}

      <MarketAnuncioLinkSheet
        open={!!leitura}
        onClose={() => setLeitura(null)}
        leitura={leitura}
        organizationId={organizationId}
        cidade={cidade}
        onGravado={anuncioGravado}
      />
    </div>
  );
}
