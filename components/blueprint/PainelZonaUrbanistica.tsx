import React from 'react';
import { AlertTriangle, Map, RefreshCw, Scale } from 'lucide-react';
import type { EmpreendimentoRegulatoryZone } from '../../types/empreendimento';
import {
  ROTULO_DO_CAMPO,
  lerZona,
  rotuloDaZona,
  type LeituraDaZona,
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
 * Não cadastra zona e não importa do catálogo da cidade. Isso já existe em
 * **Incorporação › Mapa Regulatório** e no botão "Importar de mapa cadastrado"
 * da aba do empreendimento — duplicar aquele fluxo aqui criaria um segundo lugar
 * para a mesma lei divergir.
 *
 * Não aplica sozinho ao trocar o select: aplicar é BOTÃO. Sobrescrever os recuos
 * como efeito colateral de navegar pela lista apagaria um ajuste manual sem que
 * ninguém tivesse pedido.
 */

interface Props {
  /** Empreendimentos da org, para o seletor. Mesma lista do write-back de área. */
  empreendimentos: { id: string; nome: string }[];
  /** Escolhido — sobe para o editor, porque a caixa Terreno inteira usa um só. */
  empreendimentoId: string;
  onEmpreendimento: (id: string) => void;
  /** Zonas do empreendimento escolhido. Vazio = ele não tem zona cadastrada. */
  zonas: EmpreendimentoRegulatoryZone[];
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
  salvando?: boolean;
}

export default function PainelZonaUrbanistica({
  empreendimentos,
  empreendimentoId,
  onEmpreendimento,
  zonas,
  carregandoZonas = false,
  zonaAplicadaId,
  zonaRotuloSalvo,
  ajustadoAMao,
  derivou,
  onAplicar,
  onDesligar,
  salvando = false,
}: Props) {
  const [escolhida, setEscolhida] = React.useState<string>('');
  const zonaSelecionada = escolhida || zonaAplicadaId || '';
  const zona = zonas.find((z) => z.id === zonaSelecionada) ?? null;

  // A leitura roda na zona ESCOLHIDA, não na aplicada: é o que deixa o usuário
  // ver o que ele vai receber antes de clicar em Aplicar.
  const leitura: LeituraDaZona | null = zona ? lerZona(zona) : null;
  const aplicada = zonaAplicadaId !== null;

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
        <Scale className="h-3.5 w-3.5" />
        Zona urbanística
      </p>

      {empreendimentos.length === 0 ? (
        <p className="mt-1.5 text-xs text-slate-500">
          Nenhum empreendimento nesta organização. Os recuos seguem digitados abaixo.
        </p>
      ) : (
        <div className="mt-1.5 space-y-1.5">
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

          {empreendimentoId && (
            <div className="flex items-center gap-1.5">
              <select
                value={zonaSelecionada}
                onChange={(e) => setEscolhida(e.target.value)}
                disabled={carregandoZonas || zonas.length === 0}
                aria-label="Zona urbanística que vale para este lote"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">
                  {carregandoZonas ? 'Carregando…' : 'Escolha a zona…'}
                </option>
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>
                    {rotuloDaZona(z)}
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
        </div>
      )}

      {/* Empreendimento escolhido e sem zona: aponta para onde se cadastra, em
          vez de oferecer um cadastro paralelo aqui. */}
      {empreendimentoId && !carregandoZonas && zonas.length === 0 && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
          <Map className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Este empreendimento não tem zona. Cadastre em{' '}
            <strong className="font-semibold">Incorporação › Mapa Regulatório</strong> e importe
            na aba <strong className="font-semibold">Mapa Regulatório</strong> dele.
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

      {zona?.lei_referencia && (
        <p className="mt-1.5 text-xs text-slate-400">
          {zona.lei_referencia}
          {zona.nivel_confianca ? ` · ${zona.nivel_confianca}` : ''}
        </p>
      )}
    </div>
  );
}
