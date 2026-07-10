-- clients.category deixou de ser um enum fixo: categorias hoje são dinâmicas
-- por organização (tabela client_categories, criável livremente pelo usuário
-- em clientCategoryService.create). O CHECK antigo ainda travava em
-- ('Vendas','Locação','Serviços') e quebrava ao salvar qualquer categoria
-- nova (ex: 'Condomínio'), com erro 23514.
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_category_check;
