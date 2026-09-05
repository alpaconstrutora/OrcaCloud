import React, { useRef, useState } from 'react';
import { Scissors, Combine, FlipHorizontal, FlipVertical } from 'lucide-react';
import {
  mmToMeters,
  nomeDoTipoDeAbertura,
  wallLength,
  type Opening,
  type Wall,
} from '../../utils/blueprintKernel';
import ControleDeSobreposicao from './ControleDeSobreposicao';
import IdentificadorDoElemento from './IdentificadorDoElemento';

/**
 * Caixa "Parede selecionada" / "Abertura selecionada" do painel de Ambientes.
 *
 * Extraído de `BlueprintEditor.tsx` por uma razão que não é estética: selecionar
 * parede exige clique no CANVAS, que é opaco em jsdom (ver o cabeçalho de
 * `__tests__/components/BlueprintEditor.test.tsx`). Com a caixa isolada, a
 * interação do campo de comprimento — o que este arquivo existe para trazer —
 * fica testável sem precisar simular um clique que jsdom não sabe dar.
 */

/** Lê "4,10" ou "4.10" como número. `null` se não for um número positivo. */
function lerNumero(texto: string): number | null {
  const normalizado = texto.trim().replace(',', '.');
  if (normalizado === '') return null;
  const valor = Number(normalizado);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

/**
 * Campo numérico que aplica no Enter e no blur, e desiste no Escape.
 *
 * EXTRAÍDO, e não copiado, por causa da armadilha do Escape: `.blur()` dispara
 * `onBlur` SINCRONAMENTE, dentro do mesmo handler de tecla, antes de o React
 * aplicar qualquer `setState` pedido ali. Por isso o cancelamento vive numa
 * `ref`, lida na hora. Uma segunda cópia dessa lógica é uma segunda chance de
 * perder essa sutileza — foi ela que já deixou o campo reaplicar um valor
 * abandonado uma vez.
 *
 * `chave` remonta o input quando o valor muda POR FORA (trocou a seleção, ou o
 * arraste no canvas mudou a medida). Sem ela, o campo não controlado ficaria
 * exibindo o número velho; com `value` controlado, a digitação seria bloqueada
 * a cada re-render.
 *
 * EXPORTADO (30/08/2026) para o painel de estrutura. O cabeçalho acima diz por
 * que uma segunda cópia seria ruim; exportar é a única forma de honrar isso sem
 * mover o componente para um arquivo próprio e mexer nos testes que já o
 * exercitam por aqui.
 */
export function CampoMedida({
  rotulo,
  valor,
  casas,
  sufixo,
  chave,
  aoAplicar,
  ariaLabel,
}: {
  rotulo: string;
  /** Já na unidade EXIBIDA — quem chama converte. */
  valor: number;
  casas: number;
  sufixo: string;
  chave: string;
  /** Recebe o valor digitado, na mesma unidade exibida. */
  aoAplicar: (valor: number) => void;
  ariaLabel: string;
}) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  const cancelando = useRef(false);
  const texto = valor.toFixed(casas).replace('.', ',');

  function confirmar(digitado: string) {
    if (cancelando.current) {
      cancelando.current = false;
      return;
    }
    const lido = lerNumero(digitado);
    if (lido !== null) aoAplicar(lido);
    setRascunho(null);
  }

  return (
    <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
      {rotulo}
      <input
        type="text"
        inputMode="decimal"
        key={chave}
        defaultValue={texto}
        aria-label={ariaLabel}
        onChange={(e) => setRascunho(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            cancelando.current = true;
            // Restaura o TEXTO direto no DOM: o input é não controlado de
            // propósito (ver o comentário da `chave`), então mexer em estado
            // do React não devolveria o que está na tela.
            (e.target as HTMLInputElement).value = texto;
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={(e) => confirmar(rascunho ?? e.target.value)}
        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
      />
      {sufixo}
    </label>
  );
}

interface Props {
  parede: Wall | null;
  abertura: Opening | null;
  /**
   * Qual ponta anda ao esticar. `null` quando a informação ainda não se aplica
   * (sem parede selecionada) — a caixa não escreve uma dica errada nesse caso.
   */
  pontaQueAnda: 'a' | 'b' | null;
  /** A ponta que anda encontra outra parede? É o que decide o texto de ajuda. */
  arrastaCanto: boolean;
  /** Cada ponta está solta? Anota os botões com a consequência de escolher cada uma. */
  aLivre: boolean;
  bLivre: boolean;
  /** Escolhe à mão qual ponta anda, sobrepondo o padrão. */
  onEscolherPonta: (end: 'a' | 'b') => void;
  /**
   * Aponta uma ponta no DESENHO enquanto o mouse está sobre o botão.
   *
   * Sem isto os botões seriam duas palavras sem referente: "início" e "fim" são
   * a ordem em que a parede foi desenhada, e isso não aparece na tela depois.
   */
  onDestacarPonta: (end: 'a' | 'b' | null) => void;
  onComprimento: (mm: number) => void;
  onEspessura: (mm: number) => void;
  /**
   * O painel de COMPOSIÇÃO, montado por quem tem o quantitativo em mãos.
   *
   * Chega como slot, e não como dados: as camadas MEDIDAS saem de
   * `computeQuantities` sobre o modelo inteiro, e este painel só conhece a
   * parede selecionada — o mesmo motivo pelo qual `livreMm` vem de fora.
   */
  camadasSlot?: React.ReactNode;
  podeUnir: boolean;
  onDividir: () => void;
  onUnir: () => void;
  /** Volume que esta parede divide com o concreto, em m³. `0` = nenhum. */
  sobreposicaoM3?: number;
  onCedeSobreposicao?: (cede: boolean) => void;
  /**
   * Alterna um dos dois eixos do símbolo da folha. São eixos INDEPENDENTES — as
   * 4 combinações são as 4 variações padrão de porta em planta — por isso dois
   * botões, não um.
   *
   * Os dois valem para as DUAS portas, sem mudar de sentido:
   *
   * | eixo | de abrir | de correr |
   * |---|---|---|
   * | `'hinge'` (Girar) | de qual ponta do vão sai a dobradiça | para qual ponta a folha recolhe |
   * | `'swing'` (Espelhar) | para que lado da parede a folha abre | sobre qual face ela desliza |
   *
   * Na de correr EMBUTIDA `'swing'` não se aplica: a folha vai para dentro da
   * parede, no eixo. Por isso o botão Espelhar não é oferecido nesse caso.
   */
  onFlipAbertura: (axis: 'hinge' | 'swing') => void;
  /**
   * Muda o tamanho da abertura selecionada. Campo omitido fica como está — o
   * painel edita uma medida por vez, e o kernel recusa o que não couber na
   * parede (em comprimento OU em altura), com a medida máxima na mensagem.
   */
  onTamanhoAbertura: (campos: { widthMm?: number; heightMm?: number; sillMm?: number }) => void;
  /**
   * Troca o TIPO da abertura selecionada, mantendo posição e medidas.
   *
   * Faltava, e a falta obrigava a apagar e refazer — perdendo o ajuste de
   * largura, altura e peitoril junto. Com quatro tipos, é o caminho por onde
   * todo mundo passa: ninguém acerta o seletor da barra antes do primeiro
   * clique.
   */
  onTipoAbertura: (kind: TipoDeAbertura, embutida?: boolean) => void;
  /**
   * O painel do TIPO DE ESQUADRIA, montado por quem tem o catálogo e o lote
   * de comandos em mãos (`PainelEsquadria`). Slot pela razão de `camadasSlot`.
   */
  esquadriaSlot?: React.ReactNode;
  /**
   * Comprimento livre entre as faces das paredes vizinhas, em mm.
   *
   * Vem de fora porque depende do NÍVEL inteiro — a espessura da VIZINHA, não a
   * desta parede — e este painel só conhece a selecionada.
   */
  livreMm?: number | null;
}

type TipoDeAbertura = 'door' | 'window' | 'passage' | 'sliding';

export default function PainelParedeSelecionada({
  parede,
  abertura,
  pontaQueAnda,
  arrastaCanto,
  aLivre,
  bLivre,
  onEscolherPonta,
  onDestacarPonta,
  onComprimento,
  onEspessura,
  camadasSlot,
  podeUnir,
  onDividir,
  onUnir,
  sobreposicaoM3 = 0,
  onCedeSobreposicao,
  onFlipAbertura,
  onTamanhoAbertura,
  onTipoAbertura,
  esquadriaSlot,
  livreMm = null,
}: Props) {
  if (!parede && !abertura) return null;

  return (
    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {parede ? 'Parede selecionada' : 'Abertura selecionada'}
      </h3>

      {/* O mesmo nome que sai no Tag do IFC e no diff da aba Versões — ver
          `IdentificadorDoElemento`. */}
      <IdentificadorDoElemento
        uid={(parede ?? abertura)?.uid}
        familia={parede ? 'wall' : 'opening'}
      />

      {parede && (
        <ComprimentoEEspessura
          parede={parede}
          pontaQueAnda={pontaQueAnda}
          arrastaCanto={arrastaCanto}
          aLivre={aLivre}
          bLivre={bLivre}
          onEscolherPonta={onEscolherPonta}
          onDestacarPonta={onDestacarPonta}
          onComprimento={onComprimento}
          onEspessura={onEspessura}
          camadasSlot={camadasSlot}
          podeUnir={podeUnir}
          onDividir={onDividir}
          onUnir={onUnir}
          livreMm={livreMm}
        />
      )}

      {parede && (
        <ControleDeSobreposicao
          visivel={sobreposicaoM3 > 0 && !!onCedeSobreposicao}
          cede={parede.cedeSobreposicao === true}
          volumeM3={sobreposicaoM3}
          onCede={(v) => onCedeSobreposicao?.(v)}
        />
      )}

      {abertura && (
        <>
          <p className="mt-2 text-xs text-slate-600">
            {/* Vírgula, não ponto: é a convenção do país e a mesma do campo de
                comprimento logo acima — duas grafias de decimal na mesma caixa
                fazem parecer que uma delas é de outro sistema. */}
            {nomeDoTipoDeAbertura(abertura.kind, abertura.embutida)} a{' '}
            {(abertura.offsetMm / 1000).toFixed(2).replace('.', ',')} m do início da parede.
          </p>

          {/* TROCAR O TIPO sem refazer. Posição e medidas ficam — trocar o tipo
              é dizer O QUE a abertura é, não onde está nem quanto mede. */}
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            Tipo
            <select
              value={abertura.kind}
              onChange={(e) => onTipoAbertura(e.target.value as TipoDeAbertura)}
              aria-label="Tipo da abertura"
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            >
              <option value="door">Porta</option>
              <option value="sliding">Porta de correr</option>
              <option value="window">Janela</option>
              <option value="passage">Vão livre</option>
            </select>
          </label>

          {abertura.kind === 'sliding' && (
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              Folha
              <select
                value={abertura.embutida ? 'embutida' : 'fora'}
                onChange={(e) => onTipoAbertura('sliding', e.target.value === 'embutida')}
                aria-label="Forma da folha de correr"
                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="fora">Corre por fora</option>
                <option value="embutida">Embutida na parede</option>
              </select>
            </label>
          )}

          {/* Em MILÍMETROS, e não em metros como o comprimento de parede: é a
              unidade em que vão de esquadria se especifica e se compra ("porta
              80×210"), e é a mesma do seletor de largura da barra ao inserir. */}
          <CampoMedida
            rotulo="Largura"
            valor={abertura.widthMm}
            casas={0}
            sufixo="mm"
            chave={`${abertura.id}:l:${abertura.widthMm}`}
            aoAplicar={(mm) => onTamanhoAbertura({ widthMm: Math.round(mm) })}
            ariaLabel="Largura da abertura, em milímetros"
          />
          <CampoMedida
            rotulo="Altura"
            valor={abertura.heightMm}
            casas={0}
            sufixo="mm"
            chave={`${abertura.id}:a:${abertura.heightMm}`}
            aoAplicar={(mm) => onTamanhoAbertura({ heightMm: Math.round(mm) })}
            ariaLabel="Altura da abertura, em milímetros"
          />
          {/* Peitoril fica de fora só na PORTA, onde é sempre zero (o vão nasce
              no piso) e um campo de um valor só é ruído. Vão livre tem: subir o
              peitoril é o que transforma uma passagem num passa-prato. */}
          {abertura.kind !== 'door' && (
            <CampoMedida
              rotulo="Peitoril"
              valor={abertura.sillMm}
              casas={0}
              sufixo="mm"
              chave={`${abertura.id}:p:${abertura.sillMm}`}
              aoAplicar={(mm) => onTamanhoAbertura({ sillMm: Math.round(mm) })}
              ariaLabel="Altura do peitoril, em milímetros"
            />
          )}

          {/* Quem tem FOLHA tem lado: porta de abrir e porta de correr. Janela é
              simétrica no desenho (linha reta através da parede) e vão livre não
              tem símbolo nenhum — nos dois, girar e espelhar não teriam o que
              mover.

              A de correr usava os mesmos dois booleanos do kernel desde que
              nasceu, e o desenho já os respeitava; faltavam só os botões aqui.
              Sem eles, a única forma de mudar para que ponta a folha recolhe era
              apagar a abertura e inserir de novo do outro lado. */}
          {(abertura.kind === 'door' || abertura.kind === 'sliding') && (
            <div className="mt-3 flex gap-2">
              <BotaoTexto
                icone={FlipHorizontal}
                rotulo="Girar"
                onClick={() => onFlipAbertura('hinge')}
                titulo={
                  abertura.kind === 'sliding'
                    ? 'Recolhe a folha para a outra ponta do vão'
                    : 'Move a dobradiça para a outra ponta do vão'
                }
              />
              {/* ESPELHAR só existe onde há duas faces para escolher.
                  Na de correr EMBUTIDA a folha vai para dentro da parede, no
                  eixo — `swingReversed` não muda um pixel do desenho. Um botão
                  que não faz nada ensina a ignorar o botão, e é a mesma razão
                  pela qual o seletor de folha só aparece com "de correr". */}
              {!(abertura.kind === 'sliding' && abertura.embutida) && (
                <BotaoTexto
                  icone={FlipVertical}
                  rotulo="Espelhar"
                  onClick={() => onFlipAbertura('swing')}
                  titulo={
                    abertura.kind === 'sliding'
                      ? 'Faz a folha correr pela outra face da parede'
                      : 'Abre para o outro lado da parede'
                  }
                />
              )}
            </div>
          )}

          {esquadriaSlot}
        </>
      )}
    </div>
  );
}

function ComprimentoEEspessura({
  parede,
  pontaQueAnda,
  arrastaCanto,
  aLivre,
  bLivre,
  onEscolherPonta,
  onDestacarPonta,
  onComprimento,
  onEspessura,
  camadasSlot,
  podeUnir,
  onDividir,
  onUnir,
  livreMm,
}: {
  parede: Wall;
  pontaQueAnda: 'a' | 'b' | null;
  arrastaCanto: boolean;
  aLivre: boolean;
  bLivre: boolean;
  onEscolherPonta: (end: 'a' | 'b') => void;
  onDestacarPonta: (end: 'a' | 'b' | null) => void;
  onComprimento: (mm: number) => void;
  onEspessura: (mm: number) => void;
  camadasSlot?: React.ReactNode;
  podeUnir: boolean;
  onDividir: () => void;
  onUnir: () => void;
  /**
   * Comprimento livre entre as faces das paredes vizinhas, em mm.
   *
   * Vem de fora porque depende do NÍVEL inteiro (a espessura da vizinha), e
   * este painel só conhece a parede selecionada. `null` quando não se aplica.
   */
  livreMm: number | null;
}) {
  const comprimentoMm = wallLength(parede);

  const dica =
    pontaQueAnda === null
      ? ''
      : arrastaCanto
        ? `estica a ponta ${pontaQueAnda === 'a' ? 'inicial' : 'final'} — o canto vai junto`
        : `estica a ponta ${pontaQueAnda === 'a' ? 'inicial' : 'final'} (livre)`;

  /**
   * De onde a nova medida cresce.
   *
   * "Início" e "Fim" são a ordem em que a parede foi DESENHADA, e isso não
   * aparece na tela depois — por isso passar o mouse acende a ponta no desenho.
   * Sem esse retorno, os dois botões seriam adivinhação, e adivinhar errado
   * numa parede com os dois cantos fechados move o lado errado da planta.
   */
  const pontas: { end: 'a' | 'b'; rotulo: string; livre: boolean }[] = [
    { end: 'a', rotulo: 'Início', livre: aLivre },
    { end: 'b', rotulo: 'Fim', livre: bLivre },
  ];

  return (
    <>
      <CampoMedida
        rotulo="Comprimento"
        valor={mmToMeters(comprimentoMm)}
        casas={2}
        sufixo="m"
        chave={`${parede.id}:${comprimentoMm}`}
        aoAplicar={(metros) => onComprimento(Math.round(metros * 1000))}
        ariaLabel={`Comprimento da parede, em metros. ${dica}`}
      />
      {pontaQueAnda !== null && (
        <div
          className="mt-1.5"
          onMouseLeave={() => onDestacarPonta(null)}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500">Estica a ponta</span>
            {pontas.map(({ end, rotulo, livre }) => (
              <button
                key={end}
                type="button"
                onClick={() => onEscolherPonta(end)}
                onMouseEnter={() => onDestacarPonta(end)}
                onFocus={() => onDestacarPonta(end)}
                onBlur={() => onDestacarPonta(null)}
                aria-pressed={pontaQueAnda === end}
                title={
                  livre
                    ? `${rotulo}: ponta livre — nada mais se mexe`
                    : `${rotulo}: ponta presa — o canto vai junto`
                }
                className={`rounded-[6px] border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  pontaQueAnda === end
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          {dica && <p className="mt-1 text-[11px] text-slate-400">{dica}</p>}
        </div>
      )}

      {/* O COMPRIMENTO LIVRE, ao lado do de eixo.
          O campo acima edita o EIXO, porque é ele que a geometria move — trocar
          o campo pelo livre faria digitar 4,00 produzir uma parede de eixo
          4,00+espessura, e a conta de volta é ambígua quando as duas pontas têm
          vizinhas de espessuras diferentes.
          Dois números com NOMES diferentes, em vez de um número ambíguo: é o
          mesmo padrão que o quantitativo já usa com Piso × Eixo. */}
      {livreMm !== null && livreMm !== comprimentoMm && (
        <p className="mt-1 text-[11px] text-slate-500">
          Livre entre faces:{' '}
          <strong className="font-medium text-slate-700">
            {(livreMm / 1000).toFixed(2).replace('.', ',')} m
          </strong>
          <span className="text-slate-400"> · o eixo mede {mmToMeters(comprimentoMm).toFixed(2).replace('.', ',')} m</span>
        </p>
      )}

      {/* O seletor de espessura só existe na parede HOMOGÊNEA.
          Com composição, a espessura é a SOMA das camadas — o kernel recusa
          `SetThickness` ali (`THICKNESS_FROM_LAYERS`), então um seletor deixado
          na tela ofereceria uma edição que não acontece. O total aparece em
          leitura dentro do painel de camadas. */}
      {!parede.camadas?.length && (
        <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
          Espessura
          <select
            value={parede.thicknessMm}
            onChange={(e) => onEspessura(Number(e.target.value))}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
          >
            {[100, 150, 200, 250].map((mm) => (
              <option key={mm} value={mm}>
                {mm} mm
              </option>
            ))}
          </select>
        </label>
      )}

      {camadasSlot}

      <div className="mt-3 flex gap-2">
        <BotaoTexto icone={Scissors} rotulo="Dividir" onClick={onDividir} />
        <BotaoTexto
          icone={Combine}
          rotulo="Unir"
          onClick={onUnir}
          disabled={!podeUnir}
          titulo={
            podeUnir
              ? 'Une com a parede colinear vizinha'
              : 'Só é possível unir com uma parede colinear, de mesma espessura, que compartilhe uma ponta'
          }
        />
      </div>
    </>
  );
}

function BotaoTexto({
  icone: Icone,
  rotulo,
  onClick,
  disabled,
  titulo,
}: {
  icone: React.ElementType;
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
  titulo?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titulo ?? rotulo}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icone className="h-3.5 w-3.5" />
      {rotulo}
    </button>
  );
}
