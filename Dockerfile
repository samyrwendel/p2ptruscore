FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm ci

# Copiar código fonte
COPY . .

# Compilar aplicação
RUN npm run build

# Estágio de produção
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /usr/src/app

# Instalar dependências do sistema
RUN apk add --no-cache wget curl bash

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

# Copiar arquivos de dependências
COPY --from=builder /usr/src/app/package*.json ./

# Instalar apenas dependências de produção
RUN npm ci --omit=dev && npm cache clean --force

# Copiar aplicação compilada
COPY --from=builder /usr/src/app/dist ./dist

# Copiar templates e arquivos estáticos
COPY --from=builder /usr/src/app/views ./views
COPY --from=builder /usr/src/app/.env.production ./.env.production
COPY --from=builder /usr/src/app/setup-docker.sh ./setup-docker.sh

# Tornar script executável
RUN chmod +x setup-docker.sh

# Ajustar permissões
RUN chown -R nestjs:nodejs /usr/src/app
USER nestjs

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/config/status || exit 1

# Comando de inicialização
CMD ["node", "dist/main.js"]