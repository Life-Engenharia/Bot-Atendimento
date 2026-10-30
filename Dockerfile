# Build stage: compila TypeScript sem levar ferramentas de desenvolvimento à imagem final.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Runtime stage: somente dependências de produção e artefatos necessários ao servidor.
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist/src ./dist/src
# Static branding assets are read by the API at runtime.
COPY --from=build /app/src/public ./src/public
COPY docs/api ./dist/docs/api

USER node
EXPOSE 8080

CMD ["node", "dist/src/server.js"]
