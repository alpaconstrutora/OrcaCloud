import React from 'react';
import { AlertTriangle, ExternalLink, Loader2, Link2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import { anuncioConferido, normalizarNome } from '../../supabase/functions/opura-market-import/logica';
import {
  opuraMarketService,
  type LeituraDeAnuncio,
  type ResultadoImportacaoMercado,
} from '../../services/opuraMarketService';

/**
 * Conferência do anúncio lido por link (Fase B do plano
 * docs/planos/2026-10-10-opura-market-fontes.md).
 *
 * O servidor leu a página e trouxe o que achou; aqui o usuário confere e
 * completa antes de gravar. O que o site não deu aparece em destaque. Site que
 * bloqueia a leitura (OLX e VivaReal, desde 10/10/2026) abre esta mesma gaveta
 * em branco, com o link, para preencher à mão.
 *
 * A validação é a MESMA do servidor (`anuncioConferido` de logica.ts): o botão
 * só liga quando a gravação vai passar, e diz o motivo quando não.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  leitura: LeituraDeAnuncio | null;
  organizationId: string;
  cidade: { id: string; name: string; state: string } | null;
  onGravado: (r: ResultadoImportacaoMercado, site: string) => void | Promise<void>;
}

type Campos = Record<
  'url' | 'site' | 'titulo' | 'tipo' | 'preco' | 'area' | 'areaTotal' | 'condominio' | 'iptu' | 'quartos' | 'suites' |
  'banheiros' | 'vagas' | 'rua' | 'numero' | 'bairro' | 'cidade' | 'uf' | 'cep' | 'descricao',
  string
>;

const TIPOS = ['Apartamento', 'Casa', 'Terreno', 'Comercial', 'Outro'];

/** Campo da gravação → nome que `camposFaltando` usa. */
const FALTANDO: Partial<Record<keyof Campos, string>> = { preco: 'preço', area: 'área', cidade: 'cidade', bairro: 'bairro', tipo: 'tipo' };

const SEM_ORG = 'Selecione uma organização no topo da tela: o anúncio é gravado nela.';

const inputCls = (destaque: boolean) =>
  `w-full px-3 h-9 bg-gray-50 border rounded-[6px] text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
    destaque ? 'border-amber-300 bg-amber-50/40' : 'border-gray-100'
  }`;

const Campo: React.FC<{ label: string; ajuda?: string; destaque?: boolean; className?: string; children: React.ReactNode }> = ({
  label, ajuda, destaque, className = '', children,
}) => (
  <div className={`space-y-1.5 ${className}`}>
    <label className="text-xs font-semibold text-slate-500">{label}</label>
    {children}
    {destaque ? <p className="text-xs text-amber-700">Não veio do site: preencha com o dado do anúncio.</p> : ajuda && <p className="text-xs text-gray-400">{ajuda}</p>}
  </div>
);

const Secao: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <div className="space-y-4">
    <div className="border-b border-gray-100 pb-3">
      <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
    </div>
    {children}
  </div>
);

const texto = (v: unknown) => (v == null ? '' : String(v));
const numeroOuVazio = (v: number | null | undefined) => (v != null && v > 0 ? String(v).replace('.', ',') : '');

function camposDaLeitura(l: LeituraDeAnuncio, praca: string): Campos {
  const a = l.anuncio;
  return {
    url: texto(a.url), site: l.site, titulo: texto(a.titulo), tipo: TIPOS.includes(a.tipo) ? a.tipo : 'Outro',
    preco: numeroOuVazio(a.preco), area: numeroOuVazio(a.area), areaTotal: numeroOuVazio(a.areaTotal),
    condominio: numeroOuVazio(a.condominio), iptu: numeroOuVazio(a.iptu),
    quartos: texto(a.quartos || ''), suites: texto(a.suites || ''), banheiros: texto(a.banheiros || ''), vagas: texto(a.vagas || ''),
    rua: texto(a.rua), numero: texto(a.numero), bairro: texto(a.bairro),
    // Sem cidade na página (site que bloqueou): a praça é o palpite certo quase sempre.
    cidade: texto(a.cidade) || (l.falhaLeitura ? praca : ''), uf: texto(a.uf), cep: texto(a.cep), descricao: texto(a.descricao),
  };
}

const MarketAnuncioLinkSheet: React.FC<Props> = ({ open, onClose, leitura, organizationId, cidade, onGravado }) => {
  const [c, setC] = React.useState<Campos | null>(null);
  const [sujo, setSujo] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !leitura) return;
    setC(camposDaLeitura(leitura, cidade?.name ?? ''));
    setSujo(false);
    setErro(null);
  }, [open, leitura, cidade?.name]);

  if (!open || !leitura || !c) return null;

  const faltando = new Set(leitura.faltando);
  const destaque = (k: keyof Campos) => !!FALTANDO[k] && faltando.has(FALTANDO[k] as string) && !c[k].trim();
  const mudar = (k: keyof Campos) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setC((atual) => (atual ? { ...atual, [k]: v } : atual));
    setSujo(true);
  };

  // A posição só vem da fonte quando o site dá o ponto do imóvel (não o aproximado).
  const posicao = leitura.anuncio.lat != null && leitura.anuncio.lng != null ? { lat: leitura.anuncio.lat, lng: leitura.anuncio.lng } : null;
  const corpo = {
    ...c,
    lat: posicao?.lat ?? null,
    lng: posicao?.lng ?? null,
    precoOcultoNaFonte: leitura.anuncio.precoOcultoNaFonte === true,
  };
  const validacao = anuncioConferido(corpo);
  const outraCidade = validacao.ok && cidade && normalizarNome(validacao.anuncio.cidade) !== normalizarNome(cidade.name);
  const motivo = !organizationId ? SEM_ORG
    : !cidade ? 'Selecione a cidade da praça.'
    : !validacao.ok ? validacao.motivo
    : outraCidade ? `O anúncio é de ${validacao.anuncio.cidade}; a praça selecionada é ${cidade.name}.`
    : undefined;

  const gravar = async () => {
    if (motivo || !cidade) return;
    setSalvando(true);
    setErro(null);
    try {
      const site = c.site.trim() || leitura.site;
      const r = await opuraMarketService.gravarAnuncioDeLink(organizationId, cidade.id, corpo, site);
      await onGravado(r, site);
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gravar o anúncio.');
    } finally {
      setSalvando(false);
    }
  };

  const avisos = [...leitura.avisos];
  if (leitura.anuncio.bairro && !leitura.bairroCadastrado) {
    avisos.push(`O bairro "${leitura.anuncio.bairro}" não está cadastrado na praça: o anúncio entra sem bairro no mapa até o cadastro.`);
  }

  return (
    <Sheet open={open} onClose={onClose} size="2xl" dirty={sujo}>
      <SheetHeader onClose={onClose}>
        <SheetTitle>Conferir anúncio</SheetTitle>
        <SheetDescription>
          {leitura.falhaLeitura
            ? 'O site não deixou o servidor ler a página. Preencha com os dados do anúncio.'
            : `Lido de ${leitura.site}. Confira antes de gravar: o site pode chamar o terreno de "área".`}
        </SheetDescription>
      </SheetHeader>

      <SheetPanel className="p-6">
        <div className="space-y-8">
          {(leitura.falhaLeitura || avisos.length > 0 || leitura.jaGravado) && (
            <div className="space-y-2">
              {leitura.falhaLeitura && (
                <div className="flex gap-2 p-3 rounded-[8px] bg-amber-50 border border-amber-100 text-xs text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                  <span>Leitura automática bloqueada: {leitura.falhaLeitura} Abra o anúncio e copie os dados para os campos abaixo.</span>
                </div>
              )}
              {leitura.jaGravado && (
                <div className="p-3 rounded-[8px] bg-blue-50 border border-blue-100 text-xs text-blue-800">
                  Este anúncio já está na base{leitura.jaGravado.status && leitura.jaGravado.status !== 'active' ? ' como saída' : ''}. Gravar de novo atualiza preço, área, quartos, tipo e bairro; não duplica.
                </div>
              )}
              {avisos.map((a) => (
                <div key={a} className="p-3 rounded-[8px] bg-slate-50 border border-slate-100 text-xs text-slate-600">{a}</div>
              ))}
            </div>
          )}

          <Secao titulo="Anúncio">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Campo label="Link" className="col-span-2" ajuda="É o que identifica o anúncio: colar o mesmo link de novo atualiza em vez de duplicar.">
                <div className="flex items-center gap-2 min-w-0">
                  <Link2 className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-sm text-slate-700 truncate" title={c.url}>{c.url}</span>
                  {/^https?:\/\//i.test(c.url) && (
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-blue-600 hover:text-blue-700" title="Abrir o anúncio no site">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </Campo>
              <Campo label="Título" className="col-span-2">
                <input value={c.titulo} onChange={mudar('titulo')} className={inputCls(false)} />
              </Campo>
              <Campo label="Site (origem)">
                <input value={c.site} onChange={mudar('site')} className={inputCls(false)} />
              </Campo>
              <Campo label="Tipo" destaque={destaque('tipo') || (faltando.has('tipo') && c.tipo === 'Outro')}>
                <select value={c.tipo} onChange={mudar('tipo')} className={inputCls(faltando.has('tipo') && c.tipo === 'Outro')}>
                  {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Campo>
            </div>
          </Secao>

          <Secao titulo="Valores e áreas">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Campo label="Preço de venda (R$) *" destaque={destaque('preco')}
                ajuda={leitura.anuncio.precoOcultoNaFonte ? 'O site esconde este preço; o valor veio dos dados da página.' : undefined}>
                <input value={c.preco} onChange={mudar('preco')} inputMode="decimal" placeholder="Ex.: 320.000" className={inputCls(destaque('preco'))} />
              </Campo>
              <Campo label="Área útil / construída (m²) *" destaque={destaque('area')} ajuda="A área do imóvel, não a do terreno.">
                <input value={c.area} onChange={mudar('area')} inputMode="decimal" className={inputCls(destaque('area'))} />
              </Campo>
              <Campo label="Área total / terreno (m²)">
                <input value={c.areaTotal} onChange={mudar('areaTotal')} inputMode="decimal" className={inputCls(false)} />
              </Campo>
              <Campo label="Condomínio (R$/mês)">
                <input value={c.condominio} onChange={mudar('condominio')} inputMode="decimal" className={inputCls(false)} />
              </Campo>
              <Campo label="IPTU (R$)">
                <input value={c.iptu} onChange={mudar('iptu')} inputMode="decimal" className={inputCls(false)} />
              </Campo>
            </div>
          </Secao>

          <Secao titulo="Imóvel">
            <div className="grid grid-cols-4 gap-x-6 gap-y-4">
              <Campo label="Quartos"><input value={c.quartos} onChange={mudar('quartos')} inputMode="numeric" className={inputCls(false)} /></Campo>
              <Campo label="Suítes"><input value={c.suites} onChange={mudar('suites')} inputMode="numeric" className={inputCls(false)} /></Campo>
              <Campo label="Banheiros"><input value={c.banheiros} onChange={mudar('banheiros')} inputMode="numeric" className={inputCls(false)} /></Campo>
              <Campo label="Vagas"><input value={c.vagas} onChange={mudar('vagas')} inputMode="numeric" className={inputCls(false)} /></Campo>
            </div>
          </Secao>

          <Secao titulo="Localização">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Campo label="Rua">
                <input value={c.rua} onChange={mudar('rua')} className={inputCls(false)} />
              </Campo>
              <Campo label="Número">
                <input value={c.numero} onChange={mudar('numero')} className={inputCls(false)} />
              </Campo>
              <Campo label="Bairro" destaque={destaque('bairro')}>
                <input value={c.bairro} onChange={mudar('bairro')} className={inputCls(destaque('bairro'))} />
              </Campo>
              <Campo label="CEP">
                <input value={c.cep} onChange={mudar('cep')} inputMode="numeric" className={inputCls(false)} />
              </Campo>
              <Campo label="Cidade *" destaque={destaque('cidade')}>
                <input value={c.cidade} onChange={mudar('cidade')} className={inputCls(destaque('cidade'))} />
              </Campo>
              <Campo label="UF">
                <input value={c.uf} onChange={mudar('uf')} maxLength={2} className={inputCls(false)} />
              </Campo>
            </div>
            <p className="text-xs text-slate-500">
              {posicao
                ? `Posição informada pelo site: ${posicao.lat.toFixed(5)}, ${posicao.lng.toFixed(5)}.`
                : 'O site não deu a posição exata: ao gravar, o anúncio é localizado pela rua, pelo CEP ou pelo bairro.'}
            </p>
          </Secao>

          <Secao titulo="Descrição">
            <textarea value={c.descricao} onChange={mudar('descricao')} rows={5}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
          </Secao>

          {erro && <div className="p-3 rounded-[8px] bg-rose-50 border border-rose-100 text-xs text-rose-700">{erro}</div>}
        </div>
      </SheetPanel>

      <SheetFooter>
        <Button variant="ghost" size="lg" onClick={onClose}>Cancelar</Button>
        <button
          onClick={gravar}
          disabled={salvando || !!motivo}
          title={motivo}
          className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
          {salvando ? 'Gravando...' : leitura.jaGravado ? 'Atualizar anúncio' : 'Gravar anúncio'}
        </button>
      </SheetFooter>
    </Sheet>
  );
};

export default MarketAnuncioLinkSheet;
