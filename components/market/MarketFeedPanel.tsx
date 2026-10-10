import React from 'react';
import { opuraMarketService, type ResultadoImportacaoMercado, type FeedSalvoMercado } from '../../services/opuraMarketService';
import { supabase } from '../../lib/supabase';
import type { OpuraMarketListing } from '../../types';
import TableSwitch from '../ui/TableSwitch';

/**
 * Importação por feed XML (decisão D7 do plano 2026-10-07-opura-market-intelligence.md).
 * O robô antigo lia o portal de UMA imobiliária no navegador, por proxies de CORS de
 * terceiros, e parou de achar anúncios quando o portal mudou. Agora a Edge Function
 * opura-market-import lê o feed, geocodifica pelo endereço e grava no servidor.
 */
const descreverResultado = (r: ResultadoImportacaoMercado): string => {
  const partes = [`Anúncios novos: ${r.novos}`];
  if (r.atualizados) partes.push(`já importados, com preço atualizado: ${r.atualizados}`);
  if (r.reativados) partes.push(`voltaram ao feed: ${r.reativados}`);
  if (r.saidas) partes.push(`saíram do feed (vendidos ou retirados): ${r.saidas}`);
  if (r.saidasIgnoradas) partes.push(`saídas não registradas: ${r.saidasIgnoradas}`);
  if (r.duplicados) partes.push(`repetidos de anúncios que já existiam: ${r.duplicados}`);
  if (r.semLocalizacao) partes.push(`endereço não encontrado: ${r.semLocalizacao}`);
  if (r.pendentes) partes.push(`ainda sem localização por limite de tempo: ${r.pendentes} (use "Localizar anúncios sem coordenada")`);
  const ignorados = Object.entries(r.ignorados ?? {}).map(([motivo, n]) => `${n} ${motivo}`);
  if (ignorados.length) partes.push(`ignorados: ${ignorados.join(', ')}`);
  return partes.join(' · ');
};

const SEM_ORG = 'Selecione uma organização no topo da tela: os anúncios são gravados nela.';

interface Props {
  organizationId: string;
  cityId: string;
  listings: OpuraMarketListing[];
  onAtualizado: () => Promise<void>;
}

export default function MarketFeedPanel({ organizationId, cityId, listings, onAtualizado }: Props) {
  const [feedUrl, setFeedUrl] = React.useState('');
  const [feedArquivo, setFeedArquivo] = React.useState<File | null>(null);
  const [importando, setImportando] = React.useState(false);
  const [localizando, setLocalizando] = React.useState(false);
  const [resultado, setResultado] = React.useState<string | null>(null);
  // Feed salvo desta organização + cidade, reimportado todo dia pelo cron
  // (plano 2026-10-10-opura-market-pendencias, item 1).
  const [salvo, setSalvo] = React.useState<FeedSalvoMercado | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  const carregarSalvo = React.useCallback(async () => {
    if (!organizationId || !cityId) { setSalvo(null); return null; }
    try {
      const f = await opuraMarketService.getFeedSalvo(organizationId, cityId);
      setSalvo(f);
      return f;
    } catch (err) {
      console.error('Falha ao ler o feed salvo:', err);
      return null;
    }
  }, [organizationId, cityId]);

  React.useEffect(() => {
    carregarSalvo().then((f) => setFeedUrl(f?.url ?? ''));
  }, [carregarSalvo]);

  // Anúncios da organização nesta cidade sem coordenada e sem tentativa registrada.
  const pendentes = listings.filter(
    l => l.organizationId === organizationId && l.latitude == null && !l.geoPrecision
  ).length;

  const motivoImportar = !organizationId ? SEM_ORG
    : !cityId ? 'Selecione a cidade.'
    : !feedArquivo && !feedUrl.trim() ? 'Informe o link do feed ou escolha o arquivo .xml.'
    : undefined;

  const importar = async () => {
    if (motivoImportar) return;
    setImportando(true);
    setResultado(null);
    try {
      const origem = feedArquivo ? { feedXml: await feedArquivo.text() } : { feedUrl: feedUrl.trim() };
      setResultado(descreverResultado(await opuraMarketService.importarFeed(organizationId, cityId, origem)));
      await Promise.all([onAtualizado(), carregarSalvo()]);
    } catch (err: any) {
      console.error('Falha ao importar o feed:', err);
      setResultado(`Erro: ${err.message || 'falha inesperada'}`);
    } finally {
      setImportando(false);
    }
  };

  const urlDigitada = feedUrl.trim();
  const linkDiferenteDoSalvo = !!salvo && salvo.url !== urlDigitada;
  const motivoAgendar = !organizationId ? SEM_ORG
    : !cityId ? 'Selecione a cidade.'
    : feedArquivo ? 'A importação diária usa o link, não o arquivo. Remova o arquivo.'
    : !urlDigitada ? 'Informe o link do feed.'
    : !/^https:\/\//i.test(urlDigitada) ? 'O link precisa começar com https://.'
    : undefined;

  const salvarAgendamento = async (ativo: boolean) => {
    if (motivoAgendar) return;
    setSalvando(true);
    try {
      const { data } = await supabase.auth.getUser();
      setSalvo(await opuraMarketService.salvarFeed(organizationId, cityId, urlDigitada, ativo, data.user?.email ?? null));
    } catch (err: any) {
      console.error('Falha ao salvar o feed:', err);
      setResultado(`Erro: ${err.message || 'falha ao salvar o feed'}`);
    } finally {
      setSalvando(false);
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

  return (
    <div className="bg-white rounded-[10px] border border-slate-200/60 p-6 space-y-6">
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-base font-bold text-slate-900">Importar feed XML</h2>
        <p className="text-xs text-slate-500 mt-1">
          Feed no padrão VRSync, o mesmo que as imobiliárias enviam para ZAP, VivaReal e OLX. Peça o link à imobiliária parceira ou use o arquivo .xml.
          Entram só os anúncios de venda da cidade selecionada, e reimportar o mesmo feed atualiza os preços em vez de duplicar.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-3 items-center">
        <div className="flex-1 w-full">
          <input
            type="text"
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            disabled={!!feedArquivo}
            placeholder="https://imobiliaria.com.br/feed-vrsync.xml"
            className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-[6px] text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
            title={feedArquivo ? 'Um arquivo foi escolhido: o link é ignorado. Remova o arquivo para usar o link.' : undefined}
          />
        </div>
        <label className="h-9 px-3 flex items-center gap-1.5 bg-white border border-slate-200 rounded-[6px] text-[13px] font-medium text-slate-600 hover:bg-slate-50 cursor-pointer shrink-0">
          <input
            type="file"
            accept=".xml,text/xml,application/xml"
            className="hidden"
            onChange={(e) => setFeedArquivo(e.target.files?.[0] ?? null)}
          />
          {feedArquivo ? `📄 ${feedArquivo.name}` : 'Ou escolher arquivo .xml'}
        </label>
        {feedArquivo && (
          <button onClick={() => setFeedArquivo(null)} className="h-9 px-3 text-[13px] font-medium text-slate-500 hover:text-slate-800 shrink-0">
            Remover arquivo
          </button>
        )}
        <button
          onClick={importar}
          disabled={importando || localizando || !!motivoImportar}
          title={motivoImportar}
          className="h-9 px-4 rounded-[6px] text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed shrink-0"
        >
          {importando ? 'Importando…' : 'Importar feed'}
        </button>
      </div>

      <div className="p-4 bg-slate-50 border border-slate-100 rounded-[10px] space-y-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="text-xs text-slate-600 font-semibold">
            Importar este link todo dia às 6h
            <span className="block text-slate-400 font-normal mt-0.5">
              Anúncio novo entra; anúncio que sumiu do feed sai da base ativa e conta como vendido ou retirado nos indicadores do bairro.
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {salvo?.ativo && linkDiferenteDoSalvo && (
              <button
                onClick={() => salvarAgendamento(true)}
                disabled={salvando || !!motivoAgendar}
                title={motivoAgendar ?? `O link salvo é ${salvo.url}. Clique para trocar pelo link acima.`}
                className="h-8 px-3 rounded-[6px] text-[13px] font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                Trocar pelo link acima
              </button>
            )}
            <TableSwitch
              checked={!!salvo?.ativo}
              onChange={() => salvarAgendamento(!salvo?.ativo)}
              disabled={salvando || (!salvo?.ativo && !!motivoAgendar) || (!!salvo?.ativo && !organizationId)}
              title={!salvo?.ativo ? motivoAgendar : !organizationId ? SEM_ORG : undefined}
              onLabel="Ligado"
              offLabel="Desligado"
            />
          </div>
        </div>
        {salvo?.ultimaExecucao && (
          <div className={`text-xs ${salvo.ultimoErro ? 'text-rose-700' : 'text-slate-500'}`}>
            Última importação: {new Date(salvo.ultimaExecucao).toLocaleString('pt-BR')} —{' '}
            {salvo.ultimoErro ? `falhou: ${salvo.ultimoErro}` : salvo.ultimoResultado ? descreverResultado(salvo.ultimoResultado) : 'sem detalhes'}
          </div>
        )}
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
          disabled={localizando || importando || pendentes === 0 || !organizationId}
          title={!organizationId ? SEM_ORG : pendentes === 0 ? 'Não há anúncio pendente de localização nesta cidade.' : undefined}
          className="h-9 px-4 rounded-[6px] text-[13px] font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed shrink-0"
        >
          {localizando ? 'Localizando…' : 'Localizar anúncios sem coordenada'}
        </button>
      </div>

      {(importando || localizando) && (
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
    </div>
  );
}
