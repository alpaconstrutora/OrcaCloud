-- Migration: Stored Procedure for Organization Creation
-- Date: 2026-02-15

-- This function creates both the organization and the owner membership in one atomic operation.
-- Being 'security definer', it bypasses RLS for the duration of the function.
create or replace function public.create_organization_v2(
    p_name text,
    p_cnpj text default null,
    p_email text default null,
    p_phone text default null,
    p_website text default null,
    p_logo_url text default null,
    p_address jsonb default '{}'::jsonb,
    p_creator_email text default null
)
returns public.organizations
as $$
declare
    v_org public.organizations;
begin
    -- 1. Insert organization
    insert into public.organizations (
        name, cnpj, email, phone, website, logo_url, address
    ) values (
        p_name, p_cnpj, p_email, p_phone, p_website, p_logo_url, p_address
    )
    returning * into v_org;

    -- 2. If creator email provided, add as owner
    if p_creator_email is not null then
        insert into public.organization_members (
            organization_id, email, role
        ) values (
            v_org.id, p_creator_email, 'owner'
        );
    end if;

    return v_org;
end;
$$ language plpgsql security definer;

-- Grant execution to authenticated users
grant execute on function public.create_organization_v2 to authenticated;
grant execute on function public.create_organization_v2 to anon; -- For dev if needed
