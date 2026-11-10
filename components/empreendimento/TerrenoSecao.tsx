// components/empreendimento/TerrenoSecao.tsx
//
// A seção Terreno do empreendimento — dado do empreendimento (não de uma torre), 1 por empreendimento.
// Saiu do TowerEditor em 09/11/2026 para ser a MESMA nas duas montagens da aba de unidades: Torres &
// Unidades (TowerEditor) e a de unidade única (UnidadeUnicaEditor — Lote, Casa, Chácara). No Lote a
// unidade é o próprio terreno, então quem monta recebe `onSalvo` para a unidade acompanhar.
// Planta vinculada: docs/planos/2026-10-21-terreno-ficha-planta.md.
import React from 'react';
import { Loader2, Check, MapPin } from 'lucide-react';
import { empreendimentoService } from '../../services/empreendimentoService';
import { terrenoDaPlantaVinculada, type TerrenoDaPlanta } from '../../services/blueprintTerrenoDaPlanta';
import { compararComFicha, type SituacaoDoCampo } from '../../utils/blueprintTerrenoDaFicha';
import { pontoCardeal, ROTULO_DO_PONTO_CARDEAL } from '../../utils/blueprintGrafoEspacial';
import Button from '../ui/Button';
import SecaoTitulo from '../ui/SecaoTitulo';
import { useToast } from '../../hooks/useToast';
import { Empreendimento } from '../../types';

/** O terreno que acabou de ser gravado (números já convertidos; null = campo vazio). */
export interface TerrenoGravado {
  terreno_area: number | null;
  terreno_frente: number | null;
}

interface Props {
  empreendimentoId: string;
  empreendimento: Empreendimento;
  /** Chamado depois de salvar, para o pai recarregar o empreendimento (Visão Geral usa os mesmos campos). */
  onTerrenoSaved?: () => void;
  /** Depois de gravar o terreno e antes do aviso de sucesso — o Lote leva área e testada à unidade. */
  onSalvo?: (t: TerrenoGravado) => Promise<void>;
  /** Motivo do modo só leitura (ver TowerEditor). */
  somenteLeitura?: string;
}

const TERRENO_TIPO_OPTIONS = ['Regular (Retangular)', 'Irregular (Geometria complexa)'];

const terrenoDe = (e?: Empreendimento) => ({
  terreno_tipo: e?.terreno_tipo ?? '',
  terreno_area: e?.terreno_area?.toString() ?? '',
  terreno_frente: e?.terreno_frente?.toString() ?? '',
  terreno_fundos: e?.terreno_fundos?.toString() ?? '',
  terreno_profundidade: e?.terreno_profundidade?.toString() ?? '',
  // 26/10/2026: a orientação e as coordenadas, para a Planta criar o lote virado e georreferenciado.
  terreno_frente_azimute: e?.terreno_frente_azimute?.toString() ?? '',
  terreno_latitude: e?.terreno_latitude?.toString() ?? '',
  terreno_longitude: e?.terreno_longitude?.toString() ?? '',
});

/** Faixa de cada campo de orientação/coordenada; fora dela o terreno não salva (e diz por quê). */
const FAIXA_DA_LOCALIZACAO = {
  terreno_frente_azimute: { min: 0, max: 360, rotulo: 'Frente voltada para (°)' },
  terreno_latitude: { min: -90, max: 90, rotulo: 'Latitude' },
  terreno_longitude: { min: -180, max: 180, rotulo: 'Longitude' },
} as const;
type CampoDaLocalizacao = keyof typeof FAIXA_DA_LOCALIZACAO;

/** O que está errado na orientação/coordenadas digitadas; `null` = pode salvar. */
export function problemaDaLocalizacao(f: Record<CampoDaLocalizacao, string>): string | null {
  for (const k of Object.keys(FAIXA_DA_LOCALIZACAO) as CampoDaLocalizacao[]) {
    const t = f[k].trim();
    if (t === '') continue;
    const v = Number(t.replace(',', '.'));
    const { min, max, rotulo } = FAIXA_DA_LOCALIZACAO[k];
    if (!Number.isFinite(v) || v < min || v > max) return `${rotulo}: informe um número entre ${min} e ${max}.`;
  }
  if ((f.terreno_latitude.trim() === '') !== (f.terreno_longitude.trim() === '')) return 'Informe latitude e longitude juntas (uma sem a outra não localiza o terreno).';
  return null;
}
type TerrenoForm = ReturnType<typeof terrenoDe>;
// Inclui o tipo desde 22/10/2026: a Planta deduz Regular/Irregular do desenho.
type CampoDoTerreno = keyof TerrenoForm;

/** Cor da linha "Planta: …" sob cada campo (§8: texto colorido, sem pílula). */
const COR_DA_SITUACAO: Record<SituacaoDoCampo, string> = {
  IGUAL: 'text-gray-500',
  DIFERENTE: 'text-amber-700',
  SO_PLANTA: 'text-blue-700',
  SO_FICHA: 'text-gray-500',
  NENHUM: 'text-gray-500',
};
const metros = (v: number | string) => (typeof v === 'string' ? v : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const inputCls = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all';
const rotuloCls = 'text-xs font-semibold text-slate-500';
const blocoCls = 'rounded-[10px] border border-gray-200 bg-white p-5 space-y-4';

export const TerrenoSecao: React.FC<Props> = ({ empreendimentoId, empreendimento, onTerrenoSaved, onSalvo, somenteLeitura }) => {
  const travado = !!somenteLeitura;
  const { showToast } = useToast();
  const notify = (msg: string, type: 'success' | 'error' = 'success') => showToast(msg, type);

  // ── Terreno ─────────────────────────────────────────────────────────────────
  // O formulário acompanha o empreendimento: depois de salvar, o pai recarrega o
  // registro e os campos se realinham (antes ficavam no valor da 1ª montagem).
  const terrenoSalvo = React.useMemo(() => terrenoDe(empreendimento), [
    empreendimento?.terreno_tipo, empreendimento?.terreno_area, empreendimento?.terreno_frente,
    empreendimento?.terreno_fundos, empreendimento?.terreno_profundidade,
    empreendimento?.terreno_frente_azimute, empreendimento?.terreno_latitude, empreendimento?.terreno_longitude,
  ]); // eslint-disable-line react-hooks/exhaustive-deps
  const [terrenoForm, setTerrenoForm] = React.useState<TerrenoForm>(terrenoSalvo);
  React.useEffect(() => { setTerrenoForm(terrenoSalvo); }, [terrenoSalvo]);
  const terrenoDirty = (Object.keys(terrenoSalvo) as (keyof TerrenoForm)[]).some(k => terrenoForm[k] !== terrenoSalvo[k]);

  // ── Terreno × Planta vinculada (21/10/2026) ─────────────────────────────────
  // Pedido: "devem ser sincronizadas com planta inteligente > terreno > dados do lote". Decisão do
  // usuário: os dois lados mostram o número do outro e a pessoa escolhe — aqui o que está VAZIO
  // na ficha já vem preenchido no formulário com o valor da Planta (não grava: confira e salve).
  // Plano: docs/planos/2026-10-21-terreno-ficha-planta.md.
  const [daPlanta, setDaPlanta] = React.useState<TerrenoDaPlanta | null>(null);
  React.useEffect(() => {
    if (!empreendimento) { setDaPlanta(null); return; }
    let vivo = true;
    terrenoDaPlantaVinculada(empreendimento)
      .then(r => { if (vivo) setDaPlanta(r); })
      .catch(err => { if (vivo) setDaPlanta({ ok: false, motivo: `Não foi possível ler a planta vinculada: ${err instanceof Error ? err.message : String(err)}` }); });
    return () => { vivo = false; };
  }, [empreendimento?.id, empreendimento?.organization_id, empreendimento?.blueprint_study_id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Amarrada aos VALORES salvos, não à identidade do objeto: o efeito abaixo só pode repreencher
  // quando a ficha gravada (ou a planta) muda — nunca um campo que a pessoa acabou de apagar.
  const comparacao = React.useMemo(
    () => (daPlanta?.ok ? compararComFicha(daPlanta.medidas, empreendimento ?? null) : null),
    [daPlanta, empreendimento?.terreno_tipo, empreendimento?.terreno_area, empreendimento?.terreno_frente, empreendimento?.terreno_fundos, empreendimento?.terreno_profundidade], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const valorDaPlanta = (key: CampoDoTerreno) => comparacao?.find(l => l.campo === key)?.planta ?? null;
  /** Campos que entraram no formulário vindos da Planta (estavam vazios na ficha). */
  const [veioDaPlanta, setVeioDaPlanta] = React.useState<Set<CampoDoTerreno>>(new Set());
  React.useEffect(() => {
    if (!comparacao || travado) { setVeioDaPlanta(new Set()); return; }
    const vindos = new Set<CampoDoTerreno>();
    for (const l of comparacao) if (l.planta !== null && terrenoSalvo[l.campo as CampoDoTerreno] === '') vindos.add(l.campo as CampoDoTerreno);
    if (vindos.size === 0) { setVeioDaPlanta(vindos); return; }
    setTerrenoForm(prev => {
      const next = { ...prev };
      for (const k of vindos) if (prev[k] === '') next[k] = String(valorDaPlanta(k));
      return next;
    });
    setVeioDaPlanta(vindos);
  }, [comparacao, terrenoSalvo, travado]); // eslint-disable-line react-hooks/exhaustive-deps
  const diferentesDaPlanta = (comparacao ?? []).filter(l => l.planta !== null && terrenoForm[l.campo as CampoDoTerreno] !== String(l.planta));
  const usarValoresDaPlanta = () => {
    setTerrenoForm(prev => {
      const next = { ...prev };
      for (const l of comparacao ?? []) if (l.planta !== null) next[l.campo as CampoDoTerreno] = String(l.planta);
      return next;
    });
  };
  /** A linha sob o campo: "Planta: …" (âmbar se difere) ou, se veio dela, "Da Planta — confira e salve". */
  const dicaDaPlanta = (key: CampoDoTerreno) => {
    const linha = comparacao?.find(l => l.campo === key) ?? null;
    if (!linha || linha.planta === null) return null;
    const unidade = key === 'terreno_tipo' ? '' : key === 'terreno_area' ? ' m²' : ' m';
    const daPlantaNoCampo = veioDaPlanta.has(key) && terrenoForm[key] === String(linha.planta);
    return (
      <p className={`text-xs ${daPlantaNoCampo ? 'text-blue-700' : COR_DA_SITUACAO[linha.situacao]}`} data-testid={`planta-${key}`}>
        {daPlantaNoCampo
          ? 'Da Planta — confira e salve'
          : `Planta: ${metros(linha.planta)}${unidade}${linha.situacao === 'DIFERENTE' ? ' · diferente' : ''}`}
      </p>
    );
  };
  const [savingTerreno, setSavingTerreno] = React.useState(false);

  const handleSaveTerreno = async (e: React.FormEvent) => {
    e.preventDefault();
    const problema = problemaDaLocalizacao(terrenoForm);
    if (problema) {
      notify(problema, 'error');
      return;
    }
    setSavingTerreno(true);
    // Campo apagado vira NULL (limpa a coluna). Com `undefined` o update ignorava o
    // campo e o valor antigo voltava depois de salvar. Os tipos do registro não
    // declaram `null`, mas as colunas são opcionais no banco.
    const n = (s: string) => (s.trim() === '' ? null : Number(s)) as number | undefined;
    try {
      const gravado = {
        terreno_tipo: (terrenoForm.terreno_tipo || null) as string | undefined,
        terreno_area: n(terrenoForm.terreno_area),
        terreno_frente: n(terrenoForm.terreno_frente),
        terreno_fundos: n(terrenoForm.terreno_fundos),
        terreno_profundidade: n(terrenoForm.terreno_profundidade),
        terreno_frente_azimute: n(terrenoForm.terreno_frente_azimute.replace(',', '.')),
        terreno_latitude: n(terrenoForm.terreno_latitude.replace(',', '.')),
        terreno_longitude: n(terrenoForm.terreno_longitude.replace(',', '.')),
      };
      await empreendimentoService.update(empreendimentoId, gravado);
      await onSalvo?.({ terreno_area: gravado.terreno_area ?? null, terreno_frente: gravado.terreno_frente ?? null });
      notify('Terreno salvo.');
      onTerrenoSaved?.();
    } catch (err: any) {
      notify(`Erro ao salvar terreno: ${err.message}`, 'error');
    } finally {
      setSavingTerreno(false);
    }
  };

  const terrenoCampos: { key: Exclude<keyof TerrenoForm, 'terreno_tipo' | CampoDaLocalizacao>; label: string }[] = [
    { key: 'terreno_area', label: 'Área total (m²)' },
    { key: 'terreno_frente', label: 'Testada / frente (m)' },
    { key: 'terreno_fundos', label: 'Fundos (m)' },
    { key: 'terreno_profundidade', label: 'Profundidade (m)' },
  ];

  return (
        <section className={blocoCls} aria-label="Terreno" data-testid="secao-terreno">
          <SecaoTitulo icon={MapPin} titulo="Terreno" />
          <fieldset disabled={travado} title={somenteLeitura} className="imovib-ro min-w-0 border-0 p-0 m-0">
            {/* items-start: a linha "Planta: …" sob alguns campos não pode desalinhar os campos entre si. */}
            <form onSubmit={handleSaveTerreno} className="grid grid-cols-2 md:grid-cols-6 gap-x-6 gap-y-4 items-start">
              <div className="space-y-1.5">
                <label htmlFor="terreno-tipo" className={rotuloCls}>Tipo de terreno</label>
                <select id="terreno-tipo" className={inputCls} value={terrenoForm.terreno_tipo}
                  onChange={e => setTerrenoForm(p => ({ ...p, terreno_tipo: e.target.value }))}>
                  <option value="">—</option>
                  {TERRENO_TIPO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {dicaDaPlanta('terreno_tipo')}
              </div>
              {terrenoCampos.map(({ key, label }) => {
                return (
                  <div key={key} className="space-y-1.5">
                    <label htmlFor={`terreno-${key}`} className={rotuloCls}>{label}</label>
                    <input id={`terreno-${key}`} className={inputCls} type="number" step="0.01" min="0" value={terrenoForm[key]}
                      onChange={e => setTerrenoForm(p => ({ ...p, [key]: e.target.value }))} />
                    {dicaDaPlanta(key)}
                  </div>
                );
              })}
              {/* Orientação e coordenadas (26/10/2026): a Planta cria o lote da ficha virado para cá e georreferenciado. */}
              <div className="space-y-1.5">
                <label htmlFor="terreno-terreno_frente_azimute" className={rotuloCls}>Frente voltada para (°)</label>
                <input id="terreno-terreno_frente_azimute" className={inputCls} type="number" step="1" min="0" max="360" placeholder="0 = norte, 90 = leste"
                  value={terrenoForm.terreno_frente_azimute} onChange={e => setTerrenoForm(p => ({ ...p, terreno_frente_azimute: e.target.value }))} />
                {terrenoForm.terreno_frente_azimute.trim() !== '' && Number.isFinite(Number(terrenoForm.terreno_frente_azimute)) && (
                  <p className="text-xs text-gray-500" data-testid="terreno-ponto-cardeal">
                    Frente voltada para o {ROTULO_DO_PONTO_CARDEAL[pontoCardeal(Number(terrenoForm.terreno_frente_azimute))]}
                  </p>
                )}
              </div>
              {(['terreno_latitude', 'terreno_longitude'] as const).map(key => (
                <div key={key} className="space-y-1.5">
                  <label htmlFor={`terreno-${key}`} className={rotuloCls}>{FAIXA_DA_LOCALIZACAO[key].rotulo} (graus decimais)</label>
                  <input id={`terreno-${key}`} className={inputCls} type="number" step="any" placeholder={key === 'terreno_latitude' ? 'ex.: −19,9191 (sul é negativo)' : 'ex.: −43,9386 (oeste é negativo)'}
                    value={terrenoForm[key]} onChange={e => setTerrenoForm(p => ({ ...p, [key]: e.target.value }))} />
                </div>
              ))}
              <span title={!terrenoDirty && !travado ? 'Altere algum campo do terreno para salvar.' : undefined} className="col-span-2 md:col-span-1 space-y-1.5">
                {/* Ocupa a altura do rótulo dos campos, para o botão ficar na linha deles. */}
                <span aria-hidden="true" className={`${rotuloCls} hidden md:block invisible`}>.</span>
                <Button type="submit" disabled={savingTerreno || !terrenoDirty} className="w-full">
                  {savingTerreno ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-[15px] h-[15px]" />}
                  Salvar terreno
                </Button>
              </span>
            </form>
          </fieldset>
          {/* A planta vinculada: de onde vêm os números "Planta: …", ou por que não há. */}
          {daPlanta && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3" data-testid="terreno-da-planta">
              <p className="text-xs text-gray-500">
                {daPlanta.ok
                  ? `Planta vinculada: ${daPlanta.plantaNome} — medidas do desenho; profundidade é a média das laterais.`
                  : daPlanta.motivo}
              </p>
              {daPlanta.ok && !travado && (
                <span title={diferentesDaPlanta.length === 0 ? 'O formulário já tem os números da Planta.' : undefined}>
                  <Button type="button" variant="secondary" size="sm" disabled={diferentesDaPlanta.length === 0} onClick={usarValoresDaPlanta}>
                    Usar valores da Planta
                  </Button>
                </span>
              )}
            </div>
          )}
        </section>
  );
};

export default TerrenoSecao;
