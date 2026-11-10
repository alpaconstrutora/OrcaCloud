/**
 * LUZ DO DIA (Espelho de Vendas 3D, F7 — 10/11/2026). Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 *
 * Quatro momentos do dia para o desenho das torres: muda o céu, o chão, de onde vem o sol e a cor da luz; à noite
 * algumas unidades ficam "acesas". O que NÃO pode mudar é a leitura do status — a cor da unidade continua a da
 * legenda. Por isso a luz colorida é fraca (o céu é que carrega o clima) e a janela acesa brilha na cor do PRÓPRIO
 * status. `corSobALuz` é a conta que a trava de legibilidade usa (`__tests__/espelhoDeVendas3dLuz.test.ts`).
 *
 * Sem three: a cena (`components/espelho3d/Espelho3DCena.tsx`) lê estes números.
 */

export type LuzDoDia = 'amanhecer' | 'dia' | 'entardecer' | 'noite';

interface Luz {
  cor: string;
  intensidade: number;
}

export interface PresetDeLuz {
  chave: LuzDoDia;
  rotulo: string;
  /** O céu atrás do desenho: gradiente do alto para o horizonte (CSS; o canvas é transparente). */
  ceu: { alto: string; horizonte: string };
  /** O disco onde as torres pousam. */
  chao: string;
  ambiente: Luz;
  /** O sol (a lua, à noite). `direcao` em múltiplos do tamanho da cena: [leste, altura, sul]. */
  sol: Luz & { direcao: [number, number, number] };
  /** A luz fraca do lado oposto, para a face de costas para o sol não virar um borrão. */
  contraluz: Luz;
  /** As linhas entre as unidades. */
  arestas: { cor: string; opacidade: number };
  /** Unidades "acesas": que fração, e quanto da cor do status a unidade emite (0 = não emite). */
  janelas: { fracao: number; brilho: number };
  /** A dica escrita sobre o céu ("Arraste para girar…") precisa de texto claro no céu escuro. */
  textoSobreOCeu: 'escuro' | 'claro';
}

export const ORDEM_DAS_LUZES: readonly LuzDoDia[] = ['amanhecer', 'dia', 'entardecer', 'noite'];
export const LUZ_PADRAO: LuzDoDia = 'dia';

export const LUZES_DO_DIA: Record<LuzDoDia, PresetDeLuz> = {
  amanhecer: {
    chave: 'amanhecer',
    rotulo: 'Amanhecer',
    ceu: { alto: '#c7dcf5', horizonte: '#fde6d3' },
    chao: '#ece7e3',
    ambiente: { cor: '#fff3ea', intensidade: 2.0 },
    // Baixo, vindo do leste.
    sol: { cor: '#ffe2c4', intensidade: 1.5, direcao: [1.7, 0.6, 0.5] },
    contraluz: { cor: '#dbe7ff', intensidade: 0.6 },
    arestas: { cor: '#ffffff', opacidade: 0.85 },
    janelas: { fracao: 0, brilho: 0 },
    textoSobreOCeu: 'escuro',
  },
  // Os números da cena de antes da F7: quem não mexe na luz vê o que sempre viu.
  dia: {
    chave: 'dia',
    rotulo: 'Dia',
    ceu: { alto: '#f0f9ff', horizonte: '#ffffff' },
    chao: '#e8edf3',
    ambiente: { cor: '#ffffff', intensidade: 2.1 },
    sol: { cor: '#ffffff', intensidade: 1.5, direcao: [1, 2, 0.8] },
    contraluz: { cor: '#ffffff', intensidade: 0.5 },
    arestas: { cor: '#ffffff', opacidade: 0.85 },
    janelas: { fracao: 0, brilho: 0 },
    textoSobreOCeu: 'escuro',
  },
  entardecer: {
    chave: 'entardecer',
    rotulo: 'Entardecer',
    ceu: { alto: '#8f9bd4', horizonte: '#fdcaa0' },
    chao: '#e2dad8',
    ambiente: { cor: '#fff0e6', intensidade: 1.9 },
    // Baixo, vindo do oeste.
    sol: { cor: '#ffd9b8', intensidade: 1.5, direcao: [-1.7, 0.5, 0.6] },
    contraluz: { cor: '#d6d9ff', intensidade: 0.6 },
    arestas: { cor: '#ffffff', opacidade: 0.8 },
    janelas: { fracao: 0, brilho: 0 },
    textoSobreOCeu: 'escuro',
  },
  noite: {
    chave: 'noite',
    rotulo: 'Noite',
    ceu: { alto: '#0b1530', horizonte: '#2a3757' },
    chao: '#2b3550',
    ambiente: { cor: '#dfe6ff', intensidade: 1.25 },
    // A lua, alta.
    sol: { cor: '#e3eaff', intensidade: 0.7, direcao: [-0.6, 1.6, 0.9] },
    contraluz: { cor: '#dfe6ff', intensidade: 0.3 },
    arestas: { cor: '#cbd5e1', opacidade: 0.5 },
    janelas: { fracao: 0.55, brilho: 0.55 },
    textoSobreOCeu: 'claro',
  },
};

const canais = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
/** sRGB ↔ linear: o three faz a conta da luz em linear e devolve em sRGB. */
const paraLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const paraSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/**
 * A cor que a tela mostra para uma unidade de cor `cor` sob a luz `preset`, numa face com o cosseno `cosseno` em
 * relação ao sol (1 = de frente, 0 = de lado ou de costas). É a conta do material fosco do three
 * (`MeshStandardMaterial` sem brilho, cena `flat`): cor × (ambiente + sol·cosseno + contraluz·(1−cosseno)) ÷ π, mais
 * o que a unidade acesa emite da própria cor.
 */
export function corSobALuz(cor: string, preset: PresetDeLuz, face: { cosseno: number; acesa?: boolean } = { cosseno: 1 }): string {
  const cos = Math.min(1, Math.max(0, face.cosseno));
  const base = canais(cor).map(paraLinear);
  const amb = canais(preset.ambiente.cor).map(paraLinear);
  const sol = canais(preset.sol.cor).map(paraLinear);
  const contra = canais(preset.contraluz.cor).map(paraLinear);
  const emite = face.acesa ? preset.janelas.brilho : 0;
  const saida = base.map((c, i) => {
    const luz = (amb[i] * preset.ambiente.intensidade + sol[i] * preset.sol.intensidade * cos + contra[i] * preset.contraluz.intensidade * (1 - cos) * 0.5) / Math.PI;
    return Math.round(Math.min(1, Math.max(0, paraSrgb(Math.min(1, c * luz + c * emite)))) * 255);
  });
  return `#${saida.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A unidade está "acesa" nesta luz? Decidido pelo id, sempre igual: a torre não pisca a cada desenho, e a mesma
 * unidade está acesa no portal do corretor e no do investidor. (FNV-1a de 32 bits; não é segredo, é só espalhar.)
 */
export function janelaAcesa(unitId: string | null | undefined, fracao: number): boolean {
  if (!unitId || fracao <= 0) return false;
  if (fracao >= 1) return true;
  let h = 0x811c9dc5;
  for (let i = 0; i < unitId.length; i++) {
    h ^= unitId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Mistura final: ids que só diferem no último dígito não podem cair todos do mesmo lado.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) % 1000) / 1000 < fracao;
}
