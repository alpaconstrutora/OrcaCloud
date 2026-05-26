-- Motor operacional: templates padrão por tipo de obra
-- org_id NULL = template do sistema; NOT NULL = customização da organização

CREATE TABLE IF NOT EXISTS project_type_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_obra    TEXT NOT NULL,
  org_id       UUID REFERENCES organizations(id) ON DELETE CASCADE,
  eap_phases   JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_docs JSONB NOT NULL DEFAULT '[]'::jsonb,
  indicators   JSONB NOT NULL DEFAULT '[]'::jsonb,
  checklist_template JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Um template de sistema por tipo (org_id NULL), múltiplos por org
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_templates
  ON project_type_templates(tipo_obra)
  WHERE org_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_org_templates
  ON project_type_templates(org_id, tipo_obra)
  WHERE org_id IS NOT NULL;

ALTER TABLE project_type_templates ENABLE ROW LEVEL SECURITY;

-- Templates do sistema (org_id IS NULL) são visíveis para todos os autenticados
CREATE POLICY "system templates readable" ON project_type_templates
  FOR SELECT USING (org_id IS NULL OR is_org_member(org_id));

CREATE POLICY "org admins manage templates" ON project_type_templates
  FOR ALL USING (org_id IS NOT NULL AND is_org_member(org_id));

-- ===================================================
-- SEED: templates padrão do sistema
-- ===================================================

INSERT INTO project_type_templates (tipo_obra, org_id, eap_phases, required_docs, indicators, checklist_template) VALUES

-- Residencial Multifamiliar (Prédio)
('residencial_multifamiliar', NULL,
  '[
    {"code":"1","name":"Serviços Preliminares"},
    {"code":"2","name":"Demolições e Terraplenagem"},
    {"code":"3","name":"Fundações"},
    {"code":"4","name":"Estrutura de Concreto"},
    {"code":"5","name":"Vedações e Alvenaria"},
    {"code":"6","name":"Instalações Hidrossanitárias"},
    {"code":"7","name":"Instalações Elétricas e SPDA"},
    {"code":"8","name":"Instalações de Gás"},
    {"code":"9","name":"Revestimentos Internos"},
    {"code":"10","name":"Revestimentos Externos e Fachada"},
    {"code":"11","name":"Impermeabilização"},
    {"code":"12","name":"Esquadrias e Vidros"},
    {"code":"13","name":"Louças, Metais e Acabamentos"},
    {"code":"14","name":"Elevadores"},
    {"code":"15","name":"Áreas Comuns e Paisagismo"},
    {"code":"16","name":"Limpeza e Entrega"}
  ]'::jsonb,
  '[
    {"name":"ART/RRT do Projeto","required":true,"category":"tecnico"},
    {"name":"ART/RRT da Execução","required":true,"category":"tecnico"},
    {"name":"Alvará de Construção","required":true,"category":"legal"},
    {"name":"Matrícula CNO","required":true,"category":"legal"},
    {"name":"Seguro de Obra (RCOC)","required":true,"category":"legal"},
    {"name":"PPRA / PCMSO","required":true,"category":"seguranca"},
    {"name":"AVCB (Auto de Vistoria do Corpo de Bombeiros)","required":true,"category":"seguranca"},
    {"name":"Habite-se","required":true,"category":"legal"},
    {"name":"Projeto Aprovado pela Prefeitura","required":true,"category":"legal"},
    {"name":"Licença Ambiental (se aplicável)","required":false,"category":"ambiental"}
  ]'::jsonb,
  '[
    {"key":"custo_m2","label":"Custo/m²","unit":"R$/m²"},
    {"key":"custo_por_unidade","label":"Custo por Unidade","unit":"R$"},
    {"key":"prazo_por_pavimento","label":"Prazo por Pavimento","unit":"dias"},
    {"key":"consumo_concreto","label":"Consumo de Concreto","unit":"m³/m²"},
    {"key":"producao_estrutural","label":"Produtividade Estrutural","unit":"m²/equipe/dia"},
    {"key":"indice_retrabalho","label":"Índice de Retrabalho","unit":"%"}
  ]'::jsonb,
  '[
    {"phase":"pre_start","items":["Projeto aprovado e ART registrada","Alvará emitido e afixado","Matrícula CNO aberta","Tapume e placa de obra instalados","PPRA e PCMSO elaborados","EPIs disponíveis para toda a equipe","Ligações provisórias de água e energia","Almoxarifado e canteiro organizados"]},
    {"phase":"in_progress","items":["Diário de obra atualizado diariamente","CND em dia","Medição mensal realizada e aprovada","Controle de qualidade de concretagem","Rastreabilidade de materiais críticos"]},
    {"phase":"pre_completion","items":["Punch list elaborado e resolvido","AVCB obtido","Vistoria final com cliente","Habite-se solicitado","Manual do proprietário entregue","CNO baixada"]}
  ]'::jsonb),

-- Casa Residencial
('casa', NULL,
  '[
    {"code":"1","name":"Serviços Preliminares e Locação"},
    {"code":"2","name":"Fundações"},
    {"code":"3","name":"Estrutura"},
    {"code":"4","name":"Cobertura"},
    {"code":"5","name":"Alvenaria e Vedações"},
    {"code":"6","name":"Instalações Hidrossanitárias"},
    {"code":"7","name":"Instalações Elétricas"},
    {"code":"8","name":"Revestimentos"},
    {"code":"9","name":"Impermeabilização"},
    {"code":"10","name":"Esquadrias"},
    {"code":"11","name":"Acabamentos e Louças"},
    {"code":"12","name":"Pintura"},
    {"code":"13","name":"Limpeza e Entrega"}
  ]'::jsonb,
  '[
    {"name":"ART/RRT do Projeto","required":true,"category":"tecnico"},
    {"name":"ART/RRT da Execução","required":true,"category":"tecnico"},
    {"name":"Alvará de Construção","required":true,"category":"legal"},
    {"name":"Matrícula CNO","required":true,"category":"legal"},
    {"name":"Projeto Aprovado pela Prefeitura","required":true,"category":"legal"},
    {"name":"Habite-se","required":true,"category":"legal"}
  ]'::jsonb,
  '[
    {"key":"custo_m2","label":"Custo/m²","unit":"R$/m²"},
    {"key":"desvio_orcamento","label":"Desvio de Orçamento","unit":"%"},
    {"key":"aditivos_contratados","label":"Valor de Aditivos","unit":"R$"},
    {"key":"prazo_fundacao","label":"Prazo Fundação","unit":"dias"},
    {"key":"prazo_acabamento","label":"Prazo Acabamento","unit":"dias"}
  ]'::jsonb,
  '[
    {"phase":"pre_start","items":["Projeto aprovado e ART registrada","Alvará emitido","Locação da obra","Matrícula CNO aberta","EPI disponível"]},
    {"phase":"in_progress","items":["Aprovações de etapa pelo cliente","Diário de obra atualizado","Controle de pagamentos de fornecedores"]},
    {"phase":"pre_completion","items":["Vistoria com cliente por cômodo","Punch list resolvido","Habite-se solicitado","CNO baixada","Manual de uso entregue"]}
  ]'::jsonb),

-- Loja Comercial
('loja', NULL,
  '[
    {"code":"1","name":"Serviços Preliminares e Tapume"},
    {"code":"2","name":"Demolições"},
    {"code":"3","name":"Estrutura e Laje (se necessário)"},
    {"code":"4","name":"Instalações Elétricas e Lógica"},
    {"code":"5","name":"Instalações Hidrossanitárias"},
    {"code":"6","name":"Ar Condicionado"},
    {"code":"7","name":"Piso"},
    {"code":"8","name":"Forro"},
    {"code":"9","name":"Revestimentos e Pintura"},
    {"code":"10","name":"Marcenaria"},
    {"code":"11","name":"Vitrine e Fachada"},
    {"code":"12","name":"Comunicação Visual"},
    {"code":"13","name":"Limpeza e Inauguração"}
  ]'::jsonb,
  '[
    {"name":"ART/RRT da Execução","required":true,"category":"tecnico"},
    {"name":"Alvará de Reforma/Construção","required":true,"category":"legal"},
    {"name":"AVCB ou Declaração Bombeiros","required":true,"category":"seguranca"},
    {"name":"Manual / Padrão da Franqueadora","required":false,"category":"tecnico"},
    {"name":"Autorização do Shopping (se aplicável)","required":false,"category":"legal"}
  ]'::jsonb,
  '[
    {"key":"dias_atraso_inauguracao","label":"Atraso na Inauguração","unit":"dias"},
    {"key":"custo_m2","label":"Custo/m²","unit":"R$/m²"},
    {"key":"lead_time_marcenaria","label":"Lead Time Marcenaria","unit":"dias"},
    {"key":"indice_retrabalho","label":"Índice de Retrabalho","unit":"%"},
    {"key":"pendencias_punch_list","label":"Pendências Punch List","unit":"itens"}
  ]'::jsonb,
  '[
    {"phase":"pre_start","items":["Alvará obtido","Cronograma aprovado pelo shopping/locador","Tapume instalado conforme padrão","Manual da marca revisado","Fornecedores críticos contratados"]},
    {"phase":"in_progress","items":["Compatibilização diária de instalações","Controle de horário de obra (se shopping)","Aprovações de amostra do cliente"]},
    {"phase":"pre_completion","items":["Punch list completo com cliente e franqueadora","AVCB obtido","Limpeza total finalizada","Comunicação visual instalada e aprovada"]}
  ]'::jsonb),

-- Sala Comercial / Escritório
('sala', NULL,
  '[
    {"code":"1","name":"Serviços Preliminares"},
    {"code":"2","name":"Demolições e Remoções"},
    {"code":"3","name":"Instalações Elétricas e Lógica"},
    {"code":"4","name":"Cabeamento Estruturado e TI"},
    {"code":"5","name":"Ar Condicionado (VRF/Split)"},
    {"code":"6","name":"Piso (elevado ou laminado)"},
    {"code":"7","name":"Forro Modular"},
    {"code":"8","name":"Divisórias e Vidros"},
    {"code":"9","name":"Revestimentos e Pintura"},
    {"code":"10","name":"Marcenaria e Mobiliário Fixo"},
    {"code":"11","name":"Iluminação"},
    {"code":"12","name":"Controle de Acesso"},
    {"code":"13","name":"Limpeza e Mudança"}
  ]'::jsonb,
  '[
    {"name":"ART/RRT da Execução","required":true,"category":"tecnico"},
    {"name":"Alvará de Reforma","required":true,"category":"legal"},
    {"name":"Autorização do Condomínio/Síndico","required":true,"category":"legal"},
    {"name":"AVCB ou Declaração Bombeiros","required":false,"category":"seguranca"}
  ]'::jsonb,
  '[
    {"key":"custo_m2","label":"Custo/m²","unit":"R$/m²"},
    {"key":"prazo_total","label":"Prazo Total","unit":"dias"},
    {"key":"indice_mudancas","label":"Índice de Mudanças de Escopo","unit":"%"},
    {"key":"disponibilidade_ti","label":"Disponibilidade TI pós-entrega","unit":"%"}
  ]'::jsonb,
  '[
    {"phase":"pre_start","items":["Autorização do condomínio obtida","Horário de obra aprovado","Compatibilização arquitetura + TI + HVAC aprovada","Amostras de materiais aprovadas pelo cliente"]},
    {"phase":"in_progress","items":["Mudanças de escopo formalizadas por escrito","Aprovações por etapa com cliente","Testes de rede e elétrica parciais"]},
    {"phase":"pre_completion","items":["Testes completos de rede e elétrica","Comissionamento do ar condicionado","Punch list com cliente e gestora","Limpeza técnica finalizada"]}
  ]'::jsonb),

-- Galpão Industrial / Logístico
('galpao', NULL,
  '[
    {"code":"1","name":"Serviços Preliminares e Terraplenagem"},
    {"code":"2","name":"Fundações"},
    {"code":"3","name":"Estrutura Metálica / Pré-moldada"},
    {"code":"4","name":"Fechamento Lateral"},
    {"code":"5","name":"Cobertura"},
    {"code":"6","name":"Piso Industrial"},
    {"code":"7","name":"Instalações Elétricas e Subestação"},
    {"code":"8","name":"Instalações Hidráulicas e Incêndio"},
    {"code":"9","name":"Docas e Plataformas"},
    {"code":"10","name":"Infraestrutura Externa e Pátio"},
    {"code":"11","name":"Escritório Administrativo"},
    {"code":"12","name":"Paisagismo e Cerca"},
    {"code":"13","name":"Limpeza e Comissionamento"}
  ]'::jsonb,
  '[
    {"name":"ART/RRT do Projeto Estrutural","required":true,"category":"tecnico"},
    {"name":"ART/RRT da Execução","required":true,"category":"tecnico"},
    {"name":"Alvará de Construção","required":true,"category":"legal"},
    {"name":"Matrícula CNO","required":true,"category":"legal"},
    {"name":"Licença Ambiental (LP/LI/LO)","required":true,"category":"ambiental"},
    {"name":"Licença do Corpo de Bombeiros","required":true,"category":"seguranca"},
    {"name":"PPRA / PCMSO / PPRA","required":true,"category":"seguranca"},
    {"name":"Licença Sanitária (se aplicável)","required":false,"category":"ambiental"},
    {"name":"Habite-se / Auto de Conclusão","required":true,"category":"legal"}
  ]'::jsonb,
  '[
    {"key":"custo_m2_estrutura","label":"Custo/m² Estrutura","unit":"R$/m²"},
    {"key":"prazo_montagem_estrutura","label":"Prazo Montagem Estrutural","unit":"dias"},
    {"key":"producao_piso","label":"Produtividade Piso Industrial","unit":"m²/dia"},
    {"key":"custo_m2_total","label":"Custo/m² Total","unit":"R$/m²"},
    {"key":"indice_interferencia","label":"Interferências Industriais","unit":"ocorrências"},
    {"key":"consumo_concreto_piso","label":"Consumo Concreto Piso","unit":"m³/m²"}
  ]'::jsonb,
  '[
    {"phase":"pre_start","items":["Licença ambiental obtida","Licença bombeiros em processo","ART registrada e obra matriculada no CNO","Tapume e placa de obra instalados","Plano de ataque aprovado","EPI e NR-18 implementados","Fornecedor de estrutura metálica/pré-moldada contratado"]},
    {"phase":"in_progress","items":["Raio de guindastes verificado","Espessura e nivelamento do piso controlados","Controle de umidade do concreto do piso","Laudo de solda (se estrutura metálica)","Monitoramento ambiental conforme licença"]},
    {"phase":"pre_completion","items":["Laudo de piso (flatness)","Teste de carga nas docas","Vistoria bombeiros finalizada","Comissionamento elétrico e subestação","Punch list industrial com cliente"]}
  ]'::jsonb),

-- Reforma / Manutenção
('reforma', NULL,
  '[
    {"code":"1","name":"Levantamento e Diagnóstico"},
    {"code":"2","name":"Demolições e Remoções"},
    {"code":"3","name":"Estrutura (se necessário)"},
    {"code":"4","name":"Instalações"},
    {"code":"5","name":"Revestimentos"},
    {"code":"6","name":"Acabamentos"},
    {"code":"7","name":"Limpeza e Entrega"}
  ]'::jsonb,
  '[
    {"name":"ART/RRT da Execução","required":true,"category":"tecnico"},
    {"name":"Alvará de Reforma (se exigido)","required":false,"category":"legal"},
    {"name":"Autorização do Condomínio (se aplicável)","required":false,"category":"legal"}
  ]'::jsonb,
  '[
    {"key":"custo_m2","label":"Custo/m²","unit":"R$/m²"},
    {"key":"desvio_prazo","label":"Desvio de Prazo","unit":"%"},
    {"key":"aditivos","label":"Valor de Aditivos","unit":"R$"}
  ]'::jsonb,
  '[
    {"phase":"pre_start","items":["Escopo detalhado aprovado pelo cliente","ART registrada","Levantamento de interferências"]},
    {"phase":"in_progress","items":["Mudanças de escopo formalizadas","Aprovações de etapa"]},
    {"phase":"pre_completion","items":["Punch list com cliente","Limpeza finalizada"]}
  ]'::jsonb),

-- Outro
('outro', NULL,
  '[
    {"code":"1","name":"Serviços Preliminares"},
    {"code":"2","name":"Execução"},
    {"code":"3","name":"Acabamentos"},
    {"code":"4","name":"Entrega"}
  ]'::jsonb,
  '[
    {"name":"ART/RRT da Execução","required":true,"category":"tecnico"},
    {"name":"Alvará (se exigido)","required":false,"category":"legal"}
  ]'::jsonb,
  '[
    {"key":"custo_total","label":"Custo Total","unit":"R$"},
    {"key":"desvio_prazo","label":"Desvio de Prazo","unit":"%"}
  ]'::jsonb,
  '[
    {"phase":"pre_start","items":["Escopo definido e aprovado","Documentação legal verificada"]},
    {"phase":"pre_completion","items":["Vistoria final","Documentação entregue"]}
  ]'::jsonb)

ON CONFLICT DO NOTHING;
