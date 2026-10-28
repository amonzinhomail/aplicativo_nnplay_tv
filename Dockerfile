FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=5173 TRUST_PROXY=1 COOKIE_SECURE=1

# Sem dependências npm: só copiamos os arquivos do site.
COPY server.js paths.js index.html style.css app.js data.js loading-logo.webp ./
COPY admin ./admin
COPY tools ./tools
COPY uploads ./uploads
COPY seed ./seed

# O volume /data guarda banners, uploads, data.js e senha (precisa pertencer ao usuário "node").
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:5173/healthz || exit 1
CMD ["node", "server.js"]
