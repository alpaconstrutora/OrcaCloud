import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Copy, X, MessageSquare, Clipboard, Calendar, FileText, CheckSquare } from 'lucide-react';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

export const OfficesAI: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Olá, sou o **ÒPURA AI**, seu assistente criativo de arquitetura. Escolha uma das sugestões rápidas abaixo ou me diga o que precisa criar hoje!',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Rolagem automática para a última mensagem
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      })
      .catch((err) => {
        console.error('Falha ao copiar:', err);
      });
  };

  // Prompts predefinidos
  const quickPrompts = [
    {
      label: 'Memorial Descritivo',
      icon: FileText,
      prompt: 'Gere um memorial descritivo para uma residência de alto padrão.',
      response: `# Memorial Descritivo — Residência Alto Padrão

**1. Introdução**
O presente memorial descreve os acabamentos e diretrizes para a execução da Residência Alto Padrão, focando em sofisticação, conforto térmico e integração biofílica.

**2. Acabamentos Principais**
- **Pisos:** Porcelanato técnico acetinado 120x120cm nas áreas sociais e taco de madeira cumaru nas áreas íntimas.
- **Paredes:** Pintura acrílica fosca na cor off-white, com detalhes em concreto ripado executado in loco na sala de estar.
- **Teto:** Forro de gesso cartonado com tabica metálica recuada de 2cm, pintado na cor branca neve.

**3. Iluminação**
- Luminárias embutidas no-frame para efeito minimalista.
- Temperatura de cor predominante: 2700K (quente) nas áreas sociais e íntimas para conforto visual.
- Fitas de LED embutidas em rasgos no gesso para luz indireta.`
    },
    {
      label: 'Briefing do Projeto',
      icon: MessageSquare,
      prompt: 'Crie um briefing de projeto comercial para um escritório de advocacia premium.',
      response: `# Briefing Integrado de Projeto Comercial

**1. Identificação do Cliente**
- **Empresa:** Escritório de Advocacia O.P.U.R.A.
- **Representante:** Dr. Altair
- **Área Estimada:** 180 m²

**2. Necessidades de Espaço**
- Recepção imponente com balcão em pedra natural e iluminação cobre.
- 3 Salas de reuniões privadas (sendo 1 master para 10 pessoas).
- Área de staff integrada no conceito Open Office (12 estações de trabalho).
- Copa/Cozinha integrada para descompressão.

**3. Identidade e Estilo**
- Estilo desejado: Contemporâneo Corporativo Premium.
- Cores principais: Grafite escuro, madeira nogueira e detalhes metálicos em cobre.`
    },
    {
      label: 'Cronograma de Projeto',
      icon: Calendar,
      prompt: 'Gere um cronograma estimado de projeto arquitetônico completo.',
      response: `# Cronograma Estimado de Projeto Arquitetônico

**Fase 1: Levantamento & Briefing (Semana 1 - 2)**
- Reunião de alinhamento com o cliente.
- Levantamento métrico e fotográfico no local.
- Consolidação do briefing e aprovação do programa de necessidades.

**Fase 2: Estudo Preliminar (Semana 3 - 5)**
- Criação do conceito estético (moodboards de referência).
- Desenvolvimento de plantas de layout humanizadas.
- Primeira apresentação e ajustes de layout.

**Fase 3: Anteprojeto (Semana 6 - 9)**
- Modelagem 3D detalhada de todos os ambientes.
- Geração de imagens realistas (renders).
- Aprovação final de volumetria e materiais pelo cliente.

**Fase 4: Projeto Executivo & Detalhamento (Semana 10 - 13)**
- Detalhamento de marcenaria, gesso, marmoraria e paginações.
- Emissão do caderno de especificações técnicas para orçamento.`
    },
    {
      label: 'Checklist Visita de Obra',
      icon: CheckSquare,
      prompt: 'Crie um checklist completo para visita técnica de acompanhamento de obra.',
      response: `# Checklist de Visita Técnica à Obra

**1. Infraestrutura Básica**
- [ ] Verificar prumo, alinhamento e esquadro das novas paredes de alvenaria/drywall.
- [ ] Conferir pontos de tomadas, interruptores e iluminação conforme planta executiva de elétrica.
- [ ] Validar diâmetros e caimentos de tubulações de esgoto e ralos secos/sifonados.

**2. Acabamentos & Revestimentos**
- [ ] Verificar paginação e junta de dilatação dos porcelanatos (conferir argamassa e espaçadores).
- [ ] Avaliar a qualidade do lixamento do gesso antes da aplicação de selador/tinta.
- [ ] Conferir dimensões de nichos e bancadas de mármore/quartzo antes da instalação definitiva.

**3. Alinhamento Geral**
- [ ] Registrar diário de obra por fotos (gerar RDO no painel ÒPURA).
- [ ] Conversar com o mestre de obras sobre dúvidas no detalhamento executivo de marcenaria.`
    }
  ];

  const handleSendMessage = (text: string, responseSimulated?: string) => {
    if (!text.trim()) return;

    // Adiciona a mensagem do usuário
    const userMsg: Message = {
      id: `msg-${Math.random().toString(36).substring(2, 9)}`,
      sender: 'user',
      text: text,
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);

    // Simular resposta da IA com delay
    setTimeout(() => {
      let responseText = '';
      if (responseSimulated) {
        responseText = responseSimulated;
      } else {
        // Geração simples e contextual baseada nas palavras-chave digitadas
        const query = text.toLowerCase();
        if (query.includes('memorial') || query.includes('descritivo')) {
          responseText = quickPrompts[0].response;
        } else if (query.includes('briefing') || query.includes('cliente')) {
          responseText = quickPrompts[1].response;
        } else if (query.includes('cronograma') || query.includes('tempo') || query.includes('etapa')) {
          responseText = quickPrompts[2].response;
        } else if (query.includes('obra') || query.includes('rdo') || query.includes('visita')) {
          responseText = quickPrompts[3].response;
        } else {
          responseText = `# Resposta Assistencial ÒPURA AI

Com base na sua solicitação sobre **"${text}"**, recomendo estruturar os seguintes passos:

1. **Alinhamento Conceitual:** Colete inspirações e moodboards no painel de Moodboards para consolidar o conceito.
2. **Especificações Técnicas:** Especifique os materiais correspondentes (madeira freijó, brises metálicos cobre, revestimentos cimentícios) na aba de Especificações.
3. **Diário de Visita:** Lance observações de progresso no painel de Diário de Obra (RDO) do projeto.

*Precisa de algo mais específico? Tente usar termos como "Briefing", "Memorial Descritivo", "Cronograma de Projeto" ou "Checklist".*`;
        }
      }

      const aiMsg: Message = {
        id: `msg-${Math.random().toString(36).substring(2, 9)}`,
        sender: 'ai',
        text: responseText,
        timestamp: new Date()
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 1200);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(inputValue);
  };

  // Renderizador de parágrafos em markdown simples
  const renderFormattedText = (text: string) => {
    return text.split('\n').map((line, idx) => {
      // Títulos
      if (line.startsWith('# ')) {
        return <h1 key={idx} className="text-sm font-black text-white tracking-tight mt-3 mb-1.5 border-b border-white/5 pb-1">{line.substring(2)}</h1>;
      }
      if (line.startsWith('**') && line.endsWith('**')) {
        return <h2 key={idx} className="text-xs font-black text-[#D47A55] tracking-widest uppercase mt-2.5 mb-1">{line.replace(/\*\*/g, '')}</h2>;
      }
      if (line.startsWith('### ')) {
        return <h3 key={idx} className="text-xs font-bold text-white tracking-tight mt-2.5 mb-1">{line.substring(4)}</h3>;
      }
      // Checkbox listas
      if (line.startsWith('- [ ] ')) {
        return (
          <div key={idx} className="flex items-start gap-2 text-[11px] text-slate-350 my-0.5">
            <span className="text-[#D47A55] shrink-0 font-bold">☐</span>
            <span>{line.substring(6)}</span>
          </div>
        );
      }
      if (line.startsWith('- [x] ')) {
        return (
          <div key={idx} className="flex items-start gap-2 text-[11px] text-slate-500 line-through my-0.5">
            <span className="text-emerald-500 shrink-0 font-bold">☑</span>
            <span>{line.substring(6)}</span>
          </div>
        );
      }
      // Listas de tópicos
      if (line.trim().startsWith('- ')) {
        return (
          <div key={idx} className="flex items-start gap-1.5 text-[11px] text-slate-350 ml-2 my-0.5">
            <span className="text-[#D47A55] shrink-0">•</span>
            <span>{line.trim().substring(2)}</span>
          </div>
        );
      }
      // Listas numeradas
      if (/^\d+\.\s/.test(line.trim())) {
        const match = line.trim().match(/^(\d+\.)\s(.*)/);
        if (match) {
          return (
            <div key={idx} className="flex items-start gap-1.5 text-[11px] text-slate-350 ml-2 my-0.5">
              <span className="text-[#D47A55] font-black shrink-0">{match[1]}</span>
              <span>{match[2]}</span>
            </div>
          );
        }
      }
      // Linha vazia
      if (line.trim() === '') return <div key={idx} className="h-2" />;

      // Formatação inline básica de negrito **text**
      const formattedParts = [];
      let currentIdx = 0;
      const regex = /\*\*(.*?)\*\*/g;
      let match;

      while ((match = regex.exec(line)) !== null) {
        if (match.index > currentIdx) {
          formattedParts.push(line.substring(currentIdx, match.index));
        }
        formattedParts.push(<strong key={match.index} className="text-white font-black">{match[1]}</strong>);
        currentIdx = regex.lastIndex;
      }

      if (currentIdx < line.length) {
        formattedParts.push(line.substring(currentIdx));
      }

      return (
        <p key={idx} className="text-[11px] text-slate-300 leading-relaxed font-medium">
          {formattedParts.length > 0 ? formattedParts : line}
        </p>
      );
    });
  };

  return (
    <>
      {/* Botão Flutuante IA (Premium Cobre) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 right-5 md:right-8 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white p-3.5 rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all z-40 border border-[#D47A55]/20 group flex items-center justify-center"
      >
        <Sparkles className="w-5 h-5 animate-pulse" />
      </button>

      {/* Painel Lateral (Drawer) */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-[#121315]/95 backdrop-blur-xl border-l border-white/5 shadow-2xl transition-transform duration-300 ease-out z-50 flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header da IA */}
        <div className="p-4 border-b border-white/5 bg-[#17181A] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#D47A55]/10 border border-[#D47A55]/30 rounded-full flex items-center justify-center text-[#D47A55]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white tracking-tight leading-none">ÒPURA AI</h2>
              <span className="text-[8px] font-black uppercase tracking-widest text-[#D47A55]">Assistente Arquitetônico</span>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Histórico de Conversas */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-none">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col max-w-[90%] space-y-1.5 ${
                msg.sender === 'user' ? 'ml-auto items-end' : 'items-start'
              }`}
            >
              <div
                className={`p-3.5 rounded-[24px] shadow-md ${
                  msg.sender === 'user'
                    ? 'bg-[#D47A55] text-white rounded-tr-none'
                    : 'bg-[#1E2022] border border-white/5 text-slate-200 rounded-tl-none relative group'
                }`}
              >
                {/* Texto Formatado */}
                <div className="space-y-1">
                  {renderFormattedText(msg.text)}
                </div>

                {/* Ação de Copiar (Só na IA) */}
                {msg.sender === 'ai' && msg.id !== 'welcome' && (
                  <button
                    onClick={() => copyToClipboard(msg.text, msg.id)}
                    className="absolute -bottom-3.5 right-3 bg-[#121315] border border-white/5 p-1 rounded-lg text-slate-400 hover:text-white transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[8px] font-black uppercase tracking-wider shadow"
                  >
                    {copiedId === msg.id ? 'Copiado!' : (
                      <>
                        <Copy className="w-2.5 h-2.5" /> Copiar
                      </>
                    )}
                  </button>
                )}
              </div>
              <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}

          {isTyping && (
            <div className="flex flex-col items-start max-w-[80%] space-y-1.5">
              <div className="bg-[#1E2022] border border-white/5 p-3 px-4 rounded-[24px] rounded-tl-none flex gap-1 items-center">
                <div className="w-1.5 h-1.5 bg-[#D47A55] rounded-full animate-bounce delay-100" />
                <div className="w-1.5 h-1.5 bg-[#D47A55] rounded-full animate-bounce delay-200" />
                <div className="w-1.5 h-1.5 bg-[#D47A55] rounded-full animate-bounce delay-300" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Atalhos Rápidos */}
        <div className="p-3 bg-[#17181A] border-t border-white/5 space-y-2">
          <span className="block text-[8px] font-black uppercase tracking-widest text-[#D47A55]">Sugestões de geração</span>
          <div className="grid grid-cols-2 gap-2">
            {quickPrompts.map((qp, idx) => {
              const Icon = qp.icon;
              return (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(qp.prompt, qp.response)}
                  disabled={isTyping}
                  className="flex items-center gap-2 p-2 bg-[#1E2022] hover:bg-[#25282A] border border-white/5 rounded-xl transition-all text-left group disabled:opacity-50"
                >
                  <Icon className="w-3.5 h-3.5 text-[#D47A55] shrink-0 transition-transform group-hover:scale-110" />
                  <span className="text-[9px] font-bold text-slate-350 truncate group-hover:text-white">{qp.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Input Formulário */}
        <form onSubmit={handleFormSubmit} className="p-4 bg-[#17181A] border-t border-white/5 flex gap-2">
          <input
            type="text"
            placeholder="Pergunte ao ÒPURA AI..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isTyping}
            className="flex-1 bg-[#121315] border border-white/5 rounded-xl px-3.5 py-2 text-form-input text-white outline-none focus:border-[#D47A55] placeholder-slate-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isTyping}
            className="p-2 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white rounded-xl transition-all shadow-md disabled:opacity-50 active:scale-95 flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </>
  );
};
