import { erroDeSintaxe } from '../../utils/blueprintFormulas';
import React from 'react';
import { AlertTriangle, ArrowUpRight, Map, RefreshCw, Scale } from 'lucide-react';
import CitySearchSelect, { type CitySearchValue } from '../regulatoryMap/CitySearchSelect';
import type { RegulatoryMapWithCity } from '../../types/regulatoryMap';
import type { OrigemDaZona } from '../../hooks/useBlueprintZonaUrbanistica';
import { useStore } from '../../store/useStore';
import { rotuloMapaRegulatorio } from '../../utils/rotuloMapaRegulatorio';
import {
  ROTULO_DO_CAMPO,
  lerZona,
  rotuloDaZona,
  type LeituraDaZona,
  type ZonaRegulatoria,
  type ValoresDaZona,
  type VocabularioDaZona,
} from '../../utils/blueprintZonaUrbanistica';

/**
 * A zona do Mapa Regulatório que vale para este lote.
 *
 * ─── POR QUE ELE EXISTE ─────────────────────────────────────────────────────
 *
 * Os recuos e os limites de T.O./C.A. eram digitados à mão no painel, e o código
 * dizia por quê: *"o produto tem duas bases regulatórias com tipos
 * incompatíveis… a ligação entra quando essa bagunça for resolvida"*. Ela é
 * menor do que parecia — `empreendimento_regulatory_zones` é a fonte viva, e
 * `plant_urban_rulesets`, apesar de aplicada no banco, não tem um único leitor
 * no app. Este painel liga o editor àquela fonte.
 *
 * ─── O QUE ELE NÃO FAZ ──────────────────────────────────────────────────────
 *
 * Não CADASTRA zona nem importa para o empreendimento. Isso já existe em
 * **Planta Inteligente › aba Mapa Regulatório** e no botão "Importar de mapa cadastrado"
 * da aba do empreendimento — duplicar aquele fluxo aqui criaria um segundo lugar
 * para a mesma lei divergir. Aqui só se LÊ — e se LEVA até lá: o atalho "Abrir
 * Mapa Regulatório" (11/10/2026) sai do editor para o cadastro e o "Voltar" de
 * lá devolve a esta planta.
 *
 * ─── DUAS ORIGENS ───────────────────────────────────────────────────────────
 *
 * Pelo **empreendimento** é o caminho principal: a cópia que a incorporação já
 * ajustou. Pela **cidade** existe porque estudo sem empreendimento — quem abre a
 * Planta Inteligente antes de cadastrar a incorporação — ficava sem caminho
 * nenhum para a lei e tinha de digitar os quatro recuos de memória.
 *
 * Não aplica sozinho ao trocar o select: aplicar é BOTÃO. Sobrescrever os recuos
 * como efeito colateral de navegar pela lista apagaria um ajuste manual sem que
 * ninguém tivesse pedido.
 */

interface Props {
  origemDaZona: OrigemDaZona;
  onOrigemDaZona: (o: OrigemDaZona) => void;

  /** Empreendimentos do contexto do topo. Mesma lista do write-back de área. */
  empreendimentos: { id: string; nome: string }[];
  /** Escolhido — sobe para o editor, porque a caixa Terreno inteira usa um só. */
  empreendimentoId: string;
  onEmpreendimento: (id: string) => void;
  /** Texto sob o seletor quando o empreendimento entrou sozinho (vínculo ou obra); `null` = escolhido/salvo. */
  avisoDoEmpreendimento?: string | null;
  /** A zona em vigor foi aplicada sozinha (era a única do empreendimento). */
  zonaAplicadaAutomaticamente?: boolean;

  /** Caminho da cidade. */
  cidade: CitySearchValue | null;
  onCidade: (c: CitySearchValue | null) => void;
  /** Texto sob a cidade quando ela veio da ficha do empreendimento (22/10/2026); `null` = escolhida à mão. */
  avisoDaCidade?: string | null;
  mapas: RegulatoryMapWithCity[];
  mapaId: string;
  onMapa: (id: string) => void;
  carregandoMapas?: boolean;

  /** Zonas da origem ativa. Vazio = não há zona onde se procurou. */
  zonas: ZonaRegulatoria[];
  carregandoZonas?: boolean;
  /** Zona em vigor no estudo, se já houver uma aplicada. */
  zonaAplicadaId: string | null;
  /** Rótulo guardado, que sobrevive à zona de origem ser apagada. */
  zonaRotuloSalvo: string | null;
  /** `true` quando algum valor foi digitado por cima do que veio da lei. */
  ajustadoAMao: boolean;
  /** `true` quando a zona de origem mudou depois de aplicada. */
  derivou: boolean;
  onAplicar: (zonaId: string) => void;
  onDesligar: () => void;
  /** VOCABULÁRIO COMPLEMENTAR (E3.1): o que está em vigor e o ajuste manual. */
  vocabulario?: VocabularioDaZona;
  onVocabulario?: (patch: Partial<VocabularioDaZona>) => void;
  salvando?: boolean;
  /** Atalho para o cadastro (o mapa escolhido, ou a lista). Ausente = sem atalho. */
  onAbrirMapaRegulatorio?: () => void;
}

export default function PainelZonaUrbanistica({
  origemDaZona,
  onOrigemDaZona,
  empreendimentos,
  empreendimentoId,
  onEmpreendimento,
  avisoDoEmpreendimento = null,
  zonaAplicadaAutomaticamente = false,
  cidade,
  onCidade,
  avisoDaCidade = null,
  mapas,
  mapaId,
  onMapa,
  carregandoMapas = false,
  zonas,
  carregandoZonas = false,
  zonaAplicadaId,
  zonaRotuloSalvo,
  ajustadoAMao,
  derivou,
  onAplicar,
  onDesligar,
  salvando = false,
  vocabulario,
  onVocabulario,
  onAbrirMapaRegulatorio,
}: Props) {
  const [escolhida, setEscolhida] = React.useState<string>('');
  const organizacoes = useStore((state) => state.organizations);
  const zonaSelecionada = escolhida || zonaAplicadaId || '';
  const zona = zonas.find((z) => z.id === zonaSelecionada) ?? null;

  // A leitura roda na zona ESCOLHIDA, não na aplicada: é o que deixa o usuário
  // ver o que ele vai receber antes de clicar em Aplicar.
  const leitura: LeituraDaZona | null = zona ? lerZona(zona) : null;
  const aplicada = zonaAplicadaId !== null;

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-slate-700">
          <Scale className="h-3.5 w-3.5" />
          Zona urbanística
        </p>
        {/* Rótulo curto de propósito: na lateral de 320 px, "Abrir Mapa Regulatório"
            empurrava o título para duas linhas. A seta diz "ir para lá"; o title explica. */}
        {onAbrirMapaRegulatorio && (
          <button
            type="button"
            onClick={onAbrirMapaRegulatorio}
            title={origemDaZona === 'CATALOGO' && mapaId
              ? 'Abrir este mapa no cadastro do Mapa Regulatório. Voltar de lá traz você a esta planta.'
              : 'Abrir o cadastro do Mapa Regulatório. Voltar de lá traz você a esta planta.'}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-blue-600 transition-colors hover:text-blue-700"
          >
            {origemDaZona === 'CATALOGO' && mapaId ? 'Abrir este mapa' : 'Mapa Regulatório'}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Trilho de origem. Duas opções só — segmentado, não select: com dois
          itens um dropdown esconde metade da resposta atrás de um clique. */}
      <div className="mt-1.5 flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-0.5">
        {(
          [
            ['EMPREENDIMENTO', 'Do empreendimento'],
            ['CATALOGO', 'Buscar por cidade'],
          ] as [OrigemDaZona, string][]
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            aria-pressed={origemDaZona === valor}
            onClick={() => {
              onOrigemDaZona(valor);
              setEscolhida('');
            }}
            className={`flex-1 rounded-[4px] px-2 py-1 text-xs font-medium transition-all ${
              origemDaZona === valor
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="mt-1.5 space-y-1.5">
        {origemDaZona === 'EMPREENDIMENTO' ? (
          empreendimentos.length === 0 ? (
            <p className="text-xs text-slate-500">
              Nenhum empreendimento no contexto atual. Use <strong>Buscar por cidade</strong> ou
              troque a organização no topo.
            </p>
          ) : (
            <select
              value={empreendimentoId}
              onChange={(e) => {
                onEmpreendimento(e.target.value);
                setEscolhida('');
              }}
              aria-label="Empreendimento de onde vem a zona urbanística"
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
            >
              <option value="">Escolha o empreendimento…</option>
              {empreendimentos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          )
        ) : null}
        {origemDaZona === 'EMPREENDIMENTO' && empreendimentos.length > 0 && avisoDoEmpreendimento && (
          <p className="text-xs text-slate-500" data-testid="aviso-empreendimento-automatico">
            {avisoDoEmpreendimento}
          </p>
        )}
        {origemDaZona === 'CATALOGO' && (
          <>
            {/* O mesmo autocomplete do cadastro de mapas — devolve `city_id`
                real de `master_cities`, não texto livre. */}
            <CitySearchSelect
              value={cidade}
              onChange={(c) => {
                onCidade(c);
                onMapa('');
                setEscolhida('');
              }}
              className="text-xs"
            />
            {avisoDaCidade && cidade && (
              <p className="text-xs text-slate-500" data-testid="aviso-cidade-automatica">
                {avisoDaCidade}
              </p>
            )}

            {cidade && (
              <select
                value={mapaId}
                onChange={(e) => {
                  onMapa(e.target.value);
                  setEscolhida('');
                }}
                disabled={carregandoMapas || mapas.length === 0}
                aria-label="Mapa regulatório da cidade"
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">
                  {carregandoMapas
                    ? 'Carregando…'
                    : mapas.length === 0
                      ? 'Nenhum mapa nesta cidade'
                      : 'Escolha o mapa…'}
                </option>
                {mapas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {rotuloMapaRegulatorio(m, mapas, organizacoes)}
                  </option>
                ))}
              </select>
            )}
          </>
        )}

        {/* O select de zona é o mesmo nos dois caminhos: a zona tem os mesmos
            campos nas duas tabelas, e é o que o painel consome. */}
        {(origemDaZona === 'EMPREENDIMENTO' ? !!empreendimentoId : !!mapaId) && (
          <div className="flex items-center gap-1.5">
            <select
              value={zonaSelecionada}
              onChange={(e) => setEscolhida(e.target.value)}
              disabled={carregandoZonas || zonas.length === 0}
              aria-label="Zona urbanística que vale para este lote"
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">{carregandoZonas ? 'Carregando…' : 'Escolha a zona…'}</option>
              {zonas.map((z) => (
                <option key={z.id} value={z.id}>
                  {`${rotuloDaZona(z)}${z.aplicavel ? ' · aplicável no empreendimento' : ''}`}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={!zonaSelecionada || salvando}
              onClick={() => zonaSelecionada && onAplicar(zonaSelecionada)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {salvando ? 'Aplicando…' : 'Aplicar'}
            </button>
          </div>
        )}
        {zonaAplicadaAutomaticamente && aplicada && (
          <p className="text-xs text-slate-500" data-testid="aviso-zona-automatica">
            Zona aplicada automaticamente: é a única cadastrada neste empreendimento.
          </p>
        )}
      </div>

      {/* Sem zona onde se procurou: aponta para onde se cadastra, em vez de
          oferecer um cadastro paralelo aqui. */}
      {origemDaZona === 'EMPREENDIMENTO' && empreendimentoId && !carregandoZonas && zonas.length === 0 && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
          <Map className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Este empreendimento não tem zona. Importe na aba{' '}
            <strong className="font-semibold">Mapa Regulatório</strong> dele, ou use{' '}
            <strong className="font-semibold">Buscar por cidade</strong> aqui.
          </span>
        </p>
      )}

      {origemDaZona === 'CATALOGO' && mapaId && !carregandoZonas && zonas.length === 0 && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
          <Map className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Este mapa não tem zona cadastrada.{' '}
            {onAbrirMapaRegulatorio ? (
              <button
                type="button"
                onClick={onAbrirMapaRegulatorio}
                className="font-semibold text-blue-600 underline transition-colors hover:text-blue-700"
              >
                Cadastrar zona neste mapa
              </button>
            ) : (
              <>
                Cadastre na aba <strong className="font-semibold">Mapa Regulatório</strong> da lista de plantas.
              </>
            )}
          </span>
        </p>
      )}

      {/* Proveniência do que está EM VIGOR — não da zona que está no select. */}
      {aplicada && (
        <p className="mt-1.5 text-xs text-slate-500">
          Em vigor: <strong className="text-slate-700">{zonaRotuloSalvo ?? 'zona aplicada'}</strong>
          {ajustadoAMao && ', ajustado à mão'}
          {' · '}
          <button
            type="button"
            onClick={onDesligar}
            className="text-slate-500 underline transition-colors hover:text-slate-700"
          >
            desligar
          </button>
        </p>
      )}

      {derivou && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong className="font-semibold">A zona mudou</strong> desde que foi aplicada aqui.
            Aplique de novo para trazer os valores atuais.
          </span>
        </p>
      )}

      {/* O que a lei NÃO conseguiu dizer. Nomeado, nunca silenciado — campo
          ilegível virando zero desenharia um envelope maior que o permitido, e
          nada na tela contaria. */}
      {leitura && leitura.naoAplicados.length > 0 && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {leitura.naoAplicados.length === 1 ? 'Um campo não vira número' : `${leitura.naoAplicados.length} campos não viram número`}
            :{' '}
            {leitura.naoAplicados
              .map((n) => `${ROTULO_DO_CAMPO[n.campo]} ("${n.textoOriginal}")`)
              .join(', ')}
            . {leitura.naoAplicados.length === 1 ? 'Ele fica' : 'Eles ficam'} sem restrição — digite
            abaixo se souber o valor.
          </span>
        </p>
      )}

      {/* NOTAS DE RODAPÉ ("3²"): o valor foi lido, mas a lei o condiciona — dito ao lado, para ninguém esquecer. */}
      {leitura && leitura.notas.length > 0 && (
        <p className="mt-1.5 text-xs text-slate-600" data-testid="notas-da-zona">
          Com nota da lei: {leitura.notas.map((n) => `${ROTULO_DO_CAMPO[n.campo]} (nota ${n.nota})`).join(', ')} — confira o texto da nota{zona?.documento_fonte ? ' no documento fonte' : ''}.
        </p>
      )}

      {zona?.uso_permitido && (
        <p className="mt-1.5 text-xs text-slate-600" data-testid="uso-permitido-da-zona">
          Uso permitido: {zona.uso_permitido}
        </p>
      )}

      {zona?.lei_referencia && (
        <p className="mt-1.5 text-xs text-slate-400">
          {zona.lei_referencia}
          {zona.nivel_confianca ? ` · ${zona.nivel_confianca}` : ''}
          {zona.documento_fonte ? ` · fonte: ${zona.documento_fonte}` : ''}
        </p>
      )}

      {/* VOCABULÁRIO COMPLEMENTAR (E3.1). Os catálogos de hoje não têm estes
          campos, então nascem à mão lendo a lei; quando a zona os trouxer, a
          aplicação os preenche. Vazio = a lei não disse. */}
      {vocabulario && onVocabulario && (
        <VocabularioComplementar vocabulario={vocabulario} onVocabulario={onVocabulario} />
      )}
    </div>
  );
}

function VocabularioComplementar({
  vocabulario: v,
  onVocabulario,
}: {
  vocabulario: NonNullable<Props['vocabulario']>;
  onVocabulario: NonNullable<Props['onVocabulario']>;
}) {
  const campo = 'w-24 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800';
  const num = (texto: string): number | null => {
    const t = texto.trim().replace(',', '.');
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };
  const ap = v.afastamentoProgressivo;
  const erroFormula = ap ? erroDeSintaxe(ap.formula) : null;
  return (
    <div className="mt-3 border-t border-slate-200 pt-2" data-testid="vocabulario-da-zona">
      <p className="text-xs font-medium text-slate-700">Vocabulário complementar da zona</p>
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-slate-600">
        <label className="flex items-center justify-between gap-1.5">
          Testada mín. (m)
          <input type="text" inputMode="decimal" key={`t-${v.testadaMinimaMm ?? ''}`} defaultValue={v.testadaMinimaMm != null ? (v.testadaMinimaMm / 1000).toString().replace('.', ',') : ''} placeholder="—" aria-label="Testada mínima do lote (m)" onBlur={(e) => { const n = num(e.target.value); onVocabulario({ testadaMinimaMm: n == null ? null : Math.round(n * 1000) }); }} className={campo} />
        </label>
        <label className="flex items-center justify-between gap-1.5">
          Área mín. (m²)
          <input type="text" inputMode="decimal" key={`a-${v.areaMinimaDoLoteM2 ?? ''}`} defaultValue={v.areaMinimaDoLoteM2 != null ? String(v.areaMinimaDoLoteM2).replace('.', ',') : ''} placeholder="—" aria-label="Área mínima do lote (m²)" onBlur={(e) => onVocabulario({ areaMinimaDoLoteM2: num(e.target.value) })} className={campo} />
        </label>
        <label className="flex items-center justify-between gap-1.5">
          Vagas/unidade
          <input type="text" inputMode="decimal" key={`v-${v.vagasPorUnidade ?? ''}`} defaultValue={v.vagasPorUnidade != null ? String(v.vagasPorUnidade).replace('.', ',') : ''} placeholder="—" aria-label="Vagas exigidas por unidade" onBlur={(e) => onVocabulario({ vagasPorUnidade: num(e.target.value) })} className={campo} />
        </label>
        <label className="flex items-center justify-between gap-1.5">
          Área mín. unid. (m²)
          <input type="text" inputMode="decimal" key={`u-${v.areaMinimaUnidadeM2 ?? ''}`} defaultValue={v.areaMinimaUnidadeM2 != null ? String(v.areaMinimaUnidadeM2).replace('.', ',') : ''} placeholder="—" aria-label="Área mínima da unidade (m²)" onBlur={(e) => onVocabulario({ areaMinimaUnidadeM2: num(e.target.value) })} className={campo} />
        </label>
        <label className="flex items-center justify-between gap-1.5">
          Insolação mín. (h)
          <input type="text" inputMode="decimal" key={`i-${v.insolacaoMinimaH ?? ''}`} defaultValue={v.insolacaoMinimaH != null ? String(v.insolacaoMinimaH).replace('.', ',') : ''} placeholder="—" aria-label="Insolação mínima nos dormitórios (h)" onBlur={(e) => onVocabulario({ insolacaoMinimaH: num(e.target.value) })} className={campo} />
        </label>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span>Afastamento progressivo: acima de</span>
        <input type="text" inputMode="decimal" key={`ap-h-${ap?.aPartirDeM ?? ''}`} defaultValue={ap ? String(ap.aPartirDeM).replace('.', ',') : ''} placeholder="6" aria-label="Altura a partir da qual vale o afastamento progressivo (m)" onBlur={(e) => { const n = num(e.target.value); if (ap) onVocabulario({ afastamentoProgressivo: { ...ap, aPartirDeM: n ?? 0 } }); }} className="w-12 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800" />
        <span>m, afastamento (m) =</span>
        <input type="text" key={`ap-f-${ap?.formula ?? ''}`} defaultValue={ap?.formula ?? ''} placeholder="(h - 6) / 10" aria-label="Fórmula do afastamento progressivo em h (metros)" onBlur={(e) => { const f = e.target.value.trim(); onVocabulario({ afastamentoProgressivo: f ? { aPartirDeM: ap?.aPartirDeM ?? 0, formula: f } : null }); }} className="w-32 rounded-md border border-slate-300 px-2 py-1 font-mono text-xs text-slate-800" />
        {erroFormula && <span className="text-amber-700">fórmula inválida: {erroFormula}</span>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600" data-testid="recuo-frente-escalonado">
        <span>Recuo de frente escalonado:</span>
        <input type="text" inputMode="decimal" key={`re-m-${v.recuoFrenteEscalonado?.recuoMm ?? ''}`} defaultValue={v.recuoFrenteEscalonado ? (v.recuoFrenteEscalonado.recuoMm / 1000).toString().replace('.', ',') : ''} placeholder="5" aria-label="Recuo de frente escalonado (m)" onBlur={(e) => { const n = num(e.target.value); const pav = v.recuoFrenteEscalonado?.aPartirDoPavimento ?? 3; onVocabulario({ recuoFrenteEscalonado: n && n > 0 ? { recuoMm: Math.round(n * 1000), aPartirDoPavimento: pav } : null }); }} className="w-12 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800" />
        <span>m a partir do</span>
        <input type="text" inputMode="numeric" key={`re-p-${v.recuoFrenteEscalonado?.aPartirDoPavimento ?? ''}`} defaultValue={v.recuoFrenteEscalonado ? String(v.recuoFrenteEscalonado.aPartirDoPavimento) : ''} placeholder="3" aria-label="Pavimento a partir do qual vale o recuo de frente escalonado" onBlur={(e) => { const n = num(e.target.value); if (v.recuoFrenteEscalonado && n && n >= 1) onVocabulario({ recuoFrenteEscalonado: { ...v.recuoFrenteEscalonado, aPartirDoPavimento: Math.round(n) } }); }} className="w-10 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800" />
        <span>º pavimento</span>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        <code>h</code> é a altura da edificação em metros; a fórmula vale nas laterais e no fundo quando supera o recuo fixo. Digitados à mão até o catálogo trazê-los; vagas/unidade alimenta o lançamento de vagas.
      </p>
    </div>
  );
}
