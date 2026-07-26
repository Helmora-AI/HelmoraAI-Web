FROM node:24-bookworm-slim AS build

WORKDIR /build
COPY LICENSE NOTICE ./
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json tsconfig.e2e.json vite.config.ts playwright.config.ts ./
COPY public ./public
COPY scripts ./scripts
COPY src ./src
COPY e2e ./e2e
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="Helmora-Web" \
      org.opencontainers.image.version="2.0.0-alpha.1" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.licenses="Apache-2.0"
ENV NODE_ENV=production \
    HELMORA_WEB_HOST=0.0.0.0 \
    HELMORA_WEB_PORT=4173 \
    HELMORA_HUB_URL=http://127.0.0.1:3000
WORKDIR /app
COPY --from=build /build/dist ./dist
COPY --from=build /build/scripts/serve.mjs ./scripts/serve.mjs
COPY --from=build /build/LICENSE /build/NOTICE ./
RUN chown -R node:node /app
USER node
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.HELMORA_WEB_PORT+'/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "scripts/serve.mjs"]
