# Worker do OpenWA (ver ../LEIA-ME.md). Node 22 + @supabase/supabase-js, nada mais.
#
# Imagem base: por padrão a tag `node:22-alpine`. Para fixar por digest (recomendado),
# defina WORKER_NODE_IMAGE no .env, ex.: node:22-alpine@sha256:<digest> — o LEIA-ME
# mostra como resolver o digest na instalação. O compose repassa como build arg.
ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE}

ENV NODE_ENV=production
WORKDIR /app

# Dependências exatamente como no package-lock.json (npm ci falha se divergir).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

COPY nucleo.mjs worker.mjs ./

# Sem root; o compose ainda põe o sistema de arquivos só-leitura.
USER node
CMD ["node", "worker.mjs"]
