/**
 * NUMERAÇÃO E COTAS DE ANOTAÇÃO — o que a planta escreve ao lado das peças
 * (18/09/2026, roadmap E0.2: *"tags automáticos de porta/janela, cota de nível,
 * volume do ambiente"*).
 *
 * ─── UMA NUMERAÇÃO, DOIS LUGARES ────────────────────────────────────────────
 *
 * O navegador já numerava a esquadria por tipo, na ordem em que foi criada
 * ("Porta 1", "Janela 2"), em `linhasDeComponentes`. A etiqueta no desenho
 * ("PT1", "J2") tem de ser o MESMO número — quem lê "J2" na planta procura
 * "Janela 2" na lista —, então a conta mora aqui e os dois consomem.
 *
 * A ordem é a de criação dentro do pavimento (a ordem de `model.openings`), e
 * não a posição em planta: renumerar tudo porque uma janela foi movida faria a
 * prancha impressa ontem divergir da de hoje sem ninguém ter mexido nas outras.
 *
 * ─── AS SIGLAS FOGEM DAS DA ESTRUTURA ───────────────────────────────────────
 *
 * A convenção "P1" para porta colide com o "P1" do pilar (`prefixoDeRotulo`),
 * e os dois aparecem na mesma planta. Porta é "PT", porta de correr "PC", vão
 * livre "VL"; janela fica "J", que está livre.
 */
import type { Level, Opening, Wall } from './blueprintKernel';

export const SIGLA_DA_ABERTURA: Record<Opening['kind'], string> = {
  door: 'PT',
  window: 'J',
  sliding: 'PC',
  passage: 'VL',
};

export interface EtiquetaDeAbertura {
  sigla: string;
  numero: number;
  /** `${sigla}${numero}` — o que vai para o desenho. */
  texto: string;
}

/**
 * Etiqueta de cada abertura DO PAVIMENTO cujas paredes foram dadas, numerada
 * por tipo na ordem de `aberturas` (a ordem do modelo). Abertura de parede de
 * outro pavimento não entra — cada pavimento recomeça do 1, como o navegador.
 */
export function etiquetasDasAberturas(
  paredesDoNivel: readonly Pick<Wall, 'id'>[],
  aberturas: readonly Pick<Opening, 'id' | 'kind' | 'wallId'>[],
): Map<string, EtiquetaDeAbertura> {
  const paredes = new Set(paredesDoNivel.map((w) => w.id));
  const contagem = new Map<Opening['kind'], number>();
  const saida = new Map<string, EtiquetaDeAbertura>();
  for (const o of aberturas) {
    if (!paredes.has(o.wallId)) continue;
    const numero = (contagem.get(o.kind) ?? 0) + 1;
    contagem.set(o.kind, numero);
    const sigla = SIGLA_DA_ABERTURA[o.kind];
    saida.set(o.id, { sigla, numero, texto: `${sigla}${numero}` });
  }
  return saida;
}

/**
 * A cota de nível como a prancha escreve: "±0,00", "+2,80", "−1,20" — em
 * metros, duas casas, sinal sempre presente (o "±" é só do zero). O sinal de
 * menos é o tipográfico (U+2212), o mesmo que a cadeia de cotas usa.
 */
export function rotuloDeNivel(elevationMm: number): string {
  // Em centímetros inteiros ANTES de decidir o sinal: −4 mm é "±0,00", não "−0,00".
  const cm = Math.round(elevationMm / 10);
  const texto = (Math.abs(cm) / 100).toFixed(2).replace('.', ',');
  if (cm === 0) return `±${texto}`;
  return `${cm > 0 ? '+' : '−'}${texto}`;
}

/** O nível de um ambiente é o do pavimento; `null` quando o pavimento não existe mais. */
export function rotuloDeNivelDoPavimento(levels: readonly Level[], levelId: string): string | null {
  const nivel = levels.find((l) => l.id === levelId);
  return nivel ? rotuloDeNivel(nivel.elevationMm) : null;
}

/**
 * VOLUME do ambiente = área de piso × pé-direito do pavimento, em m³ com duas
 * casas. É o pé-direito DO PAVIMENTO (`defaultHeightMm`): o ambiente não tem
 * altura própria no modelo — forro rebaixado é evolução (roadmap E7.2) — e
 * afirmar outra coisa aqui seria inventar um número que o desenho não tem.
 */
export function volumeDoAmbienteM3(areaPisoM2: number, peDireitoMm: number): number {
  return Math.round(areaPisoM2 * (peDireitoMm / 1000) * 100) / 100;
}
