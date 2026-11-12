# Imagen del gateway. Mismo esquema que services/orders/Dockerfile, sin base de datos ni migraciones.
#   docker build -f services/gateway/Dockerfile .
# En Railway: lo indica dockerfilePath en .railway/railway.ts

# ─── Etapa 1: compilar ───────────────────────────────────────────────────────────
FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/auth-jwt/package.json packages/auth-jwt/
COPY services/auth/package.json services/auth/
COPY services/orders/package.json services/orders/
COPY services/gateway/package.json services/gateway/
RUN npm ci --workspace @tms/gateway

COPY packages/auth-jwt packages/auth-jwt
COPY services/gateway services/gateway
RUN npm run build --workspace @tms/auth-jwt && npm run build --workspace @tms/gateway

# ─── Etapa 2: imagen final ───────────────────────────────────────────────────────
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/auth-jwt/package.json packages/auth-jwt/
COPY services/auth/package.json services/auth/
COPY services/orders/package.json services/orders/
COPY services/gateway/package.json services/gateway/
RUN npm ci --omit=dev --workspace @tms/gateway && npm cache clean --force

COPY --from=build /app/packages/auth-jwt/dist packages/auth-jwt/dist
COPY --from=build /app/services/gateway/dist services/gateway/dist

WORKDIR /app/services/gateway
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
