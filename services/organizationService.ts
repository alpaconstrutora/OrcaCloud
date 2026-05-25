import { supabase } from '../lib/supabase';
import { Organization, OrganizationMember, OrganizationRole, ResourceRole } from '../types';

export const organizationService = {
    async listOrganizations(): Promise<Organization[]> {
        const { data: orgs, error: orgsError } = await supabase
            .from('organizations')
            .select('*')
            .order('name');

        if (orgsError) {
            console.error("[OrganizationService] Error fetching organizations:", orgsError);
            throw orgsError;
        }
        if (!orgs || orgs.length === 0) {
            console.log('[OrganizationService] Nenhuma organização encontrada. Verifique se o RLS está permitindo o acesso para o seu e-mail no banco.');
            return [];
        }
        
        console.log(`[OrganizationService] ${orgs.length} organizações carregadas.`);

        const orgIds = orgs.map(org => org.id);

        // Fetch members and custom roles in parallel
        const [membersResult, rolesResult] = await Promise.all([
            supabase.from('organization_members').select('*').in('organization_id', orgIds),
            supabase.from('organization_custom_roles').select('*').in('organization_id', orgIds)
        ]);

        if (membersResult.error) throw membersResult.error;

        // Handle custom roles gracefully in case the table hasn't been created yet
        let allRoles = [];
        if (rolesResult.error) {
            console.error("Note: organization_custom_roles table might be missing. Run your migrations.", rolesResult.error);
            if (rolesResult.error.code !== '42P01') { // 42P01 is "undefined_table"
                throw rolesResult.error;
            }
        } else {
            allRoles = rolesResult.data || [];
        }

        const allMembers = membersResult.data || [];

        // ── NOVO: Unificação de Recursos da nova Gestão de Mão de Obra ──
        const [employeesResult, teamsResult] = await Promise.all([
            supabase.from('employees').select('*').in('org_id', orgIds),
            supabase.from('labor_teams').select('*').in('org_id', orgIds)
        ]);
        const allEmployees = employeesResult.data || [];
        const allLaborTeams = teamsResult.data || [];

        return orgs.map(org => {
            const orgEmployees = allEmployees.filter(e => e.org_id === org.id);
            const orgLaborTeams = allLaborTeams.filter(t => t.org_id === org.id);
            
            // Map de cargos para garantir IDs consistentes
            const generateRoleId = (name: string) => `role-${name.toLowerCase().trim().replace(/\s+/g, '-')}`;
            
            // Sintetizar Cargos a partir dos funcionários
            const employeeRoles = Array.from(new Set(orgEmployees.map(e => e.role))).map(rName => ({
                id: generateRoleId(rName),
                name: rName,
                costPerHour: 0,
                costPerDay: 0,
                description: `Função do módulo de Mão de Obra: ${rName}`,
                source: 'LaborModule'
            }));

            // Map de Trabalhadores
            const employeeWorkers = orgEmployees.map(e => ({
                id: e.id,
                name: e.name,
                roleId: generateRoleId(e.role),
                costPerHour: e.hourly_cost || (e.daily_cost / 8) || 0,
                source: 'LaborModule'
            }));

            // Map de Equipes
            const mappedTeams = orgLaborTeams.map(t => ({
                id: t.id,
                name: t.name,
                memberIds: [], // Membros podem ser linkados se necessário
                source: 'LaborModule'
            }));

            // Mesclar com recursos legatários (evitando duplicados por nome normalizado)
            const legacy = org.resources || { roles: [], workers: [], teams: [] };
             
            // 1. Unificar Cargos (Usando o nome normalizado como chave única)
            const rolesMap = new Map<string, ResourceRole>();
            
            // Prioridade para cargos já existentes no projeto (legacy)
            legacy.roles.forEach((r: ResourceRole) => {
                const key = (r.name || '').toLowerCase().trim();
                if (key) rolesMap.set(key, r);
            });

            // Adicionar cargos do módulo de Mão de Obra se não existirem
            employeeRoles.forEach(er => {
                const key = (er.name || '').toLowerCase().trim();
                if (key && !rolesMap.has(key)) {
                    rolesMap.set(key, er);
                }
            });

            const finalRoles = Array.from(rolesMap.values());

            // 2. Unificar Trabalhadores (Garantindo que o roleId aponte para o ID consolidado)
            const mergedWorkers = [...legacy.workers];
            employeeWorkers.forEach(ew => {
                // Descobrir o nome do cargo original deste funcionário
                const rawEmployee = orgEmployees.find(e => e.id === ew.id);
                const rawRoleName = (rawEmployee?.role || '').toLowerCase().trim();
                
                // Encontrar o cargo correspondente na lista final
                const consolidatedRole = finalRoles.find(r => (r.name || '').toLowerCase().trim() === rawRoleName);
                
                const finalWorker = {
                    ...ew,
                    roleId: consolidatedRole ? consolidatedRole.id : ew.roleId
                };

                if (!mergedWorkers.some(w => (w.name || '').toLowerCase().trim() === (finalWorker.name || '').toLowerCase().trim())) {
                    mergedWorkers.push(finalWorker);
                }
            });

            // 3. Unificar Equipes
            const mergedTeams = [...legacy.teams];
            mappedTeams.forEach(mt => {
                if (!mergedTeams.some(t => t.name.toLowerCase() === mt.name.toLowerCase())) {
                    mergedTeams.push(mt);
                }
            });

            return {
                ...org,
                logoUrl: org.logo_url,
                address: org.address || {},
                customRoles: allRoles.filter(r => r.organization_id === org.id).map(r => ({
                    id: r.id,
                    name: r.name,
                    permissions: r.permissions
                })),
                members: allMembers.filter(m => m.organization_id === org.id).map(m => ({
                    id: m.id,
                    name: m.email.split('@')[0],
                    email: m.email,
                    role: m.role,
                    customRoleId: m.custom_role_id,
                    joinedAt: m.joined_at,
                    permissions: m.permissions || {}
                })),
                resources: {
                    roles: finalRoles,
                    workers: mergedWorkers,
                    teams: mergedTeams
                }
            };
        }) as Organization[];
    },

    async createOrganization(org: Omit<Organization, 'id' | 'members' | 'customRoles'>, creatorEmail?: string): Promise<Organization> {
        const { data, error } = await supabase
            .rpc('create_organization_v2', {
                p_name: org.name,
                p_cnpj: org.cnpj,
                p_email: org.email,
                p_phone: org.phone,
                p_website: org.website,
                p_logo_url: org.logoUrl,
                p_address: org.address,
                p_creator_email: creatorEmail
            });

        if (error) {
            console.error('RPC Error details:', error);
            throw error;
        }

        return {
            ...data,
            logoUrl: data.logo_url,
            members: creatorEmail ? [{ email: creatorEmail, role: 'owner' }] : []
        } as Organization;
    },

    async updateOrganization(id: string, org: Partial<Organization>): Promise<Organization> {
        // 1. Update basic info
        const { data, error } = await supabase
            .from('organizations')
            .update({
                name: org.name,
                cnpj: org.cnpj,
                email: org.email,
                phone: org.phone,
                website: org.website,
                logo_url: org.logoUrl,
                address: org.address,
                resources: org.resources
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // 2. Sync Custom Roles
        if (org.customRoles) {
            // Get current roles to identify removals
            const { data: currentRoles } = await supabase
                .from('organization_custom_roles')
                .select('id')
                .eq('organization_id', id);

            const currentRoleIds = (currentRoles || []).map(r => r.id);
            const newRoleIds = org.customRoles.map(r => r.id).filter(Boolean);
            const removedRoleIds = currentRoleIds.filter(rid => !newRoleIds.includes(rid));

            if (removedRoleIds.length > 0) {
                await supabase.from('organization_custom_roles').delete().in('id', removedRoleIds);
            }

            for (const role of org.customRoles) {
                if (role.id.length > 30) { // Likely a real UUID
                    await supabase
                        .from('organization_custom_roles')
                        .upsert({
                            id: role.id,
                            organization_id: id,
                            name: role.name,
                            permissions: role.permissions
                        });
                } else { // Temp ID, create new
                    await supabase
                        .from('organization_custom_roles')
                        .insert({
                            organization_id: id,
                            name: role.name,
                            permissions: role.permissions
                        });
                }
            }
        }

        // 3. Sync Member Permissions and Roles
        if (org.members) {
            const { data: currentMembers } = await supabase
                .from('organization_members')
                .select('email')
                .eq('organization_id', id);

            const currentEmails = (currentMembers || []).map(m => m.email.toLowerCase());
            const newEmails = org.members.map(m => m.email.toLowerCase());
            const removedEmails = currentEmails.filter(e => !newEmails.includes(e));

            if (removedEmails.length > 0) {
                await supabase
                    .from('organization_members')
                    .delete()
                    .eq('organization_id', id)
                    .in('email', removedEmails);
            }

            for (const member of org.members) {
                await supabase
                    .from('organization_members')
                    .upsert({
                        organization_id: id,
                        email: member.email.toLowerCase(),
                        role: member.role,
                        custom_role_id: member.customRoleId,
                        permissions: member.permissions
                    }, {
                        onConflict: 'organization_id,email'
                    });
            }
        }

        return {
            ...data,
            logoUrl: data.logo_url,
            address: data.address || {}
        } as Organization;
    },

    async deleteOrganization(id: string): Promise<void> {
        const { error } = await supabase
            .from('organizations')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    // Member Management
    async addMember(organizationId: string, email: string, role: string = 'member'): Promise<void> {
        const { error } = await supabase
            .from('organization_members')
            .insert({
                organization_id: organizationId,
                email: email.toLowerCase(),
                role: role
            });

        if (error) throw error;
    },

    async removeMember(organizationId: string, email: string): Promise<void> {
        const { error } = await supabase
            .from('organization_members')
            .delete()
            .eq('organization_id', organizationId)
            .eq('email', email.toLowerCase());

        if (error) throw error;
    }
};
