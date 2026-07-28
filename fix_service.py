import re

with open('services/electricalProjectService.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Add OpuraElectricalElement type
type_regex = r"export interface OpuraElectricalWall \{.*?\}"
new_types = """export interface OpuraElectricalWall {
  id: string;
  organizationId: string;
  planId: string;
  points: number[] | number[][];
  thicknessM?: number;
  heightM?: number;
  createdAt: string;
  updatedAt: string;
}

export interface OpuraElectricalElement {
  id: string;
  organizationId: string;
  planId: string;
  type: string;
  points: number[] | number[][];
  properties?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}"""

content = re.sub(type_regex, new_types, content, flags=re.DOTALL)

# Add CRUD methods to the electricalProjectService object
insert_pos = content.find("};\n\nconst mapProjectToSnakeCase")
if insert_pos == -1:
    insert_pos = content.find("\n};\n")

crud_methods = """,
  // ==========================================
  // ELEMENTOS (Portas, Janelas, Escadas)
  // ==========================================
  
  async listElementsByPlan(planId: string): Promise<OpuraElectricalElement[]> {
    const { data, error } = await supabase
      .from('opura_electrical_elements')
      .select('*')
      .eq('plan_id', planId);

    if (error) throw error;
    return (data || []).map(toCamelCaseObject) as OpuraElectricalElement[];
  },

  async createElement(element: Partial<OpuraElectricalElement>): Promise<OpuraElectricalElement> {
    const { data, error } = await supabase
      .from('opura_electrical_elements')
      .insert(toSnakeCaseObject(element))
      .select()
      .single();

    if (error) throw error;
    return toCamelCaseObject(data) as OpuraElectricalElement;
  },

  async updateElement(id: string, updates: Partial<OpuraElectricalElement>): Promise<OpuraElectricalElement> {
    const { data, error } = await supabase
      .from('opura_electrical_elements')
      .update(toSnakeCaseObject(updates))
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return toCamelCaseObject(data) as OpuraElectricalElement;
  },

  async deleteElement(id: string): Promise<void> {
    const { error } = await supabase
      .from('opura_electrical_elements')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }"""

if insert_pos != -1:
    content = content[:insert_pos] + crud_methods + content[insert_pos:]

with open('services/electricalProjectService.ts', 'w', encoding='utf-8') as f:
    f.write(content)
