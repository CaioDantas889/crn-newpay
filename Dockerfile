# CRM NewPay em container: um serviço só, servindo a API e o front.
#
# Duas etapas: a primeira compila a interface com o Vite, a segunda fica só com
# o servidor e o resultado da compilação — a imagem final não carrega
# ferramenta de build nem dependência de desenvolvimento.

# ------------------------------------------------------- 1. build do front
FROM node:22-alpine AS front
WORKDIR /app

# package.json e lock primeiro: enquanto as dependências não mudam, esta camada
# vem do cache e o build fica rápido.
COPY web/package.json web/package-lock.json ./web/
RUN npm ci --prefix web

COPY web/ ./web/
RUN npm run build --prefix web

# --------------------------------------------------------- 2. imagem final
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
RUN npm ci --omit=dev --prefix server

COPY server/ ./server/
COPY --from=front /app/web/dist ./web/dist

# Banco, anexos e backups ficam aqui — monte um volume nesse caminho, senão
# cada atualização do container leva os dados junto.
ENV NEWPAY_DATA_DIR=/data \
    API_PORT=4000

RUN mkdir -p /data && chown -R node:node /data /app

# O processo não roda como root: se alguém escapar do Node, escapa sem poder.
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1

CMD ["node", "server/src/index.js"]
