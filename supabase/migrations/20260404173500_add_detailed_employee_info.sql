-- Adiciona campos detalhados para a Ficha de Registro de Empregado
DO $$ 
BEGIN 
    -- Pessoais e Filiação
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'father_name') THEN
        ALTER TABLE public.employees ADD COLUMN father_name text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'mother_name') THEN
        ALTER TABLE public.employees ADD COLUMN mother_name text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'birth_date') THEN
        ALTER TABLE public.employees ADD COLUMN birth_date date;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'birth_place') THEN
        ALTER TABLE public.employees ADD COLUMN birth_place text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'nationality') THEN
        ALTER TABLE public.employees ADD COLUMN nationality text DEFAULT 'BRASIL';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'marital_status') THEN
        ALTER TABLE public.employees ADD COLUMN marital_status text;
    END IF;

    -- Documentos (RG)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'rg_number') THEN
        ALTER TABLE public.employees ADD COLUMN rg_number text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'rg_issuing_agency') THEN
        ALTER TABLE public.employees ADD COLUMN rg_issuing_agency text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'rg_issue_date') THEN
        ALTER TABLE public.employees ADD COLUMN rg_issue_date date;
    END IF;

    -- Documentos (CTPS)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'ctps_number') THEN
        ALTER TABLE public.employees ADD COLUMN ctps_number text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'ctps_series') THEN
        ALTER TABLE public.employees ADD COLUMN ctps_series text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'ctps_issue_date') THEN
        ALTER TABLE public.employees ADD COLUMN ctps_issue_date date;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'ctps_uf') THEN
        ALTER TABLE public.employees ADD COLUMN ctps_uf text;
    END IF;

    -- Outros Documentos
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'military_doc') THEN
        ALTER TABLE public.employees ADD COLUMN military_doc text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'military_category') THEN
        ALTER TABLE public.employees ADD COLUMN military_category text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'voter_title_number') THEN
        ALTER TABLE public.employees ADD COLUMN voter_title_number text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'voter_title_zone') THEN
        ALTER TABLE public.employees ADD COLUMN voter_title_zone text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'voter_title_section') THEN
        ALTER TABLE public.employees ADD COLUMN voter_title_section text;
    END IF;

    -- Características e Diversos
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'ethnicity') THEN
        ALTER TABLE public.employees ADD COLUMN ethnicity text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'gender') THEN
        ALTER TABLE public.employees ADD COLUMN gender text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'education_level') THEN
        ALTER TABLE public.employees ADD COLUMN education_level text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'is_disabled') THEN
        ALTER TABLE public.employees ADD COLUMN is_disabled boolean DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'cbo') THEN
        ALTER TABLE public.employees ADD COLUMN cbo text;
    END IF;

    -- Endereço e Contato Adicional
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'residential_phone') THEN
        ALTER TABLE public.employees ADD COLUMN residential_phone text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'address_street') THEN
        ALTER TABLE public.employees ADD COLUMN address_street text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'address_number') THEN
        ALTER TABLE public.employees ADD COLUMN address_number text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'address_complement') THEN
        ALTER TABLE public.employees ADD COLUMN address_complement text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'address_neighborhood') THEN
        ALTER TABLE public.employees ADD COLUMN address_neighborhood text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'address_city') THEN
        ALTER TABLE public.employees ADD COLUMN address_city text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'address_uf') THEN
        ALTER TABLE public.employees ADD COLUMN address_uf text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'address_zip_code') THEN
        ALTER TABLE public.employees ADD COLUMN address_zip_code text;
    END IF;
END $$;
