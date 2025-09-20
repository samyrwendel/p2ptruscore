#!/bin/bash

# Script de configuração inicial para Docker
# Este script configura o ambiente automaticamente

echo "🚀 Iniciando configuração do TrustScore Bot..."

# Criar .env se não existir
if [ ! -f ".env" ]; then
    echo "📋 Criando arquivo .env..."
    cp .env.production .env
    echo "✅ Arquivo .env criado com configurações padrão"
else
    echo "📋 Arquivo .env já existe"
fi

# Verificar se as variáveis essenciais estão configuradas
echo "🔍 Verificando configurações..."

source .env

if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ "$TELEGRAM_BOT_TOKEN" = "SEU_TOKEN_AQUI" ]; then
    echo "⚠️  TELEGRAM_BOT_TOKEN não configurado"
    echo "📝 Configure via interface web em http://localhost:3000/config"
fi

if [ -z "$TELEGRAM_BOT_USERNAME" ] || [ "$TELEGRAM_BOT_USERNAME" = "seu_bot_username" ]; then
    echo "⚠️  TELEGRAM_BOT_USERNAME não configurado"
    echo "📝 Configure via interface web em http://localhost:3000/config"
fi

echo "🔧 Instalando dependências..."
npm ci --only=production

echo "🏗️  Compilando aplicação..."
npm run build

echo "🌐 Iniciando servidor..."
echo "📱 Interface de configuração: http://localhost:3000/config"
echo "📊 MongoDB Express: http://localhost:8081"
echo "📋 Logs da aplicação serão exibidos abaixo:"
echo "----------------------------------------"

npm run start:prod