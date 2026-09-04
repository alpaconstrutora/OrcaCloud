import React, { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { rotuloCurto, type FamiliaComUid } from '../../utils/blueprintKernel';
import ActionIconButton from '../ui/ActionIconButton';

/**
 * Linha "Identificador" das caixas de seleção da Planta Inteligente.
 *
 * Mostra o rótulo curto do `uid` (P-1A2B) e copia o uid inteiro. É o mesmo
 * nome que sai no `Tag` do IFC, no diff da aba Versões ("Parede P-1A2B movida")
 * e em `blueprint_objects.element_uid` — quem confere um elemento entre a tela,
 * o Revit e o banco procura pelo mesmo texto nos três.
 *
 * ─── SÓ LEITURA, E COPIÁVEL ──────────────────────────────────────────────────
 *
 * O uid não é editável (é identidade, não conteúdo — ver `identity.ts`), então
 * não é `<input>`. Mas precisa ser copiável, porque 36 caracteres não se
 * transcrevem à mão: um botão-ícone (§9.2) escreve no clipboard e confirma por
 * dois segundos trocando o ícone — sem toast, que seria barulho para uma ação
 * que o usuário vê acontecer.
 *
 * Padrão registrado em `docs/ui_ux_guia_unificado.md` §27.
 *
 * Elemento sem uid (modelo construído à mão em teste) não renderiza nada: não
 * há o que mostrar, e uma linha "Identificador: —" só levantaria a pergunta.
 */
export default function IdentificadorDoElemento({
  uid,
  familia,
}: {
  uid: string | undefined;
  familia: FamiliaComUid;
}) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(t);
  }, [copiado]);

  if (!uid) return null;

  const copiar = async () => {
    try {
      await navigator.clipboard?.writeText(uid);
      setCopiado(true);
    } catch {
      // Sem clipboard (http:// fora de localhost, iframe sem permissão): o
      // `title` continua mostrando o uid inteiro para seleção manual.
      setCopiado(false);
    }
  };

  return (
    <div className="mt-1.5 flex items-center gap-2" data-testid="identificador-do-elemento">
      <span className="text-xs font-semibold text-slate-500">Identificador</span>
      <span
        className="font-mono text-[10px] text-slate-400"
        title={uid}
        aria-label={`Identificador ${uid}`}
      >
        {rotuloCurto(uid, familia)}
      </span>
      <ActionIconButton
        kind="duplicate"
        size="sm"
        title={copiado ? 'Copiado' : 'Copiar identificador completo'}
        aria-label="Copiar identificador completo"
        icon={copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        onClick={copiar}
      />
    </div>
  );
}
