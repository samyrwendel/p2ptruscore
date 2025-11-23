#!/bin/bash

# Script para iniciar o TrustP2PBot em modo desenvolvimento
# Uso: ./start-bot-dev.sh

echo "🚀 Iniciando TrustP2PBot em modo desenvolvimento..."

# Verificar se já há processos rodando
existing=$(ps aux | grep -E "npm.*start|nest.*start|node.*TrustP2PBot.*main" | grep -v grep)

if [ -n "$existing" ]; then
    echo "⚠️  Já há processos do bot rodando:"
    echo "$existing"
    echo ""
    echo "🤔 Deseja parar os processos existentes primeiro? (Y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Nn]$ ]]; then
        echo "🛑 Parando processos existentes..."
        ./stop-bot.sh
        echo ""
        echo "⏳ Aguardando 3 segundos..."
        sleep 3
    else
        echo "❌ Cancelando inicialização para evitar conflitos."
        exit 1
    fi
fi

echo "🔧 Verificando ambiente..."

# Verificar se o arquivo package.json existe
if [ ! -f "package.json" ]; then
    echo "❌ Erro: package.json não encontrado!"
    echo "   Certifique-se de estar na pasta do projeto TrustP2PBot"
    exit 1
fi

# Verificar se node_modules existe
if [ ! -d "node_modules" ]; then
    echo "📦 node_modules não encontrado, instalando dependências..."
    npm install
fi

echo ""
echo "🏗️  Compilando projeto..."

# Tentar compilar o projeto
if NODE_OPTIONS="--max-old-space-size=2048" npm run build; then
    echo "✅ Compilação bem-sucedida!"
else
    echo "⚠️  Falha na compilação, tentando iniciar sem compilar..."
fi

echo ""
echo "🎯 Iniciando servidor em modo desenvolvimento..."
echo "🛡️  Política de Porta: FIXA em 3031 (NUNCA alterar)"
export PORT=3031

echo "🔍 Verificando porta 3031 ocupada..."
occupied=$(ss -ltnp | grep ':3031 ' || true)
if [ -n "$occupied" ]; then
  echo "⚠️  Porta 3031 já está em uso. Encerrando processo ocupante..."
  pid=$(echo "$occupied" | sed -E 's/.*pid=([0-9]+).*/\1/')
  if [ -n "$pid" ]; then
    echo "   ⏹️  kill $pid"
    kill $pid || true
    sleep 1
    if kill -0 $pid 2>/dev/null; then
      echo "   ⚠️  Processo ainda rodando, forçando kill -9 $pid"
      kill -9 $pid || true
      sleep 1
    fi
  fi
fi

# Tentar diferentes métodos de inicialização
echo "📝 Método 1: npm run start:dev (PORT=3031)"
if NODE_ENV=development NODE_OPTIONS="--max-old-space-size=2048" timeout 10s PORT=3031 npm run start:dev; then
    echo "✅ Servidor iniciado com npm run start:dev"
else
    echo "⚠️  Falha com npm run start:dev, tentando método alternativo..."
    
    echo "📝 Método 2: npx nest start --watch (PORT=3031)"
    if NODE_ENV=development NODE_OPTIONS="--max-old-space-size=2048" PORT=3031 npx nest start --watch; then
        echo "✅ Servidor iniciado com nest start --watch"
    else
        echo "⚠️  Falha com nest start --watch, tentando modo produção..."
        
        echo "📝 Método 3: npm start (modo produção, PORT=3031)"
        if NODE_ENV=development PORT=3031 npm start; then
            echo "✅ Servidor iniciado em modo produção"
        else
            echo "❌ Falha em todos os métodos de inicialização!"
            echo ""
            echo "💡 Sugestões:"
            echo "   1. Verifique se há espaço em disco suficiente"
            echo "   2. Verifique se há memória RAM suficiente"
            echo "   3. Execute: npm install"
            echo "   4. Execute: npm run build"
            echo "   5. Tente iniciar manualmente: npm start"
            exit 1
        fi
    fi
fi

echo ""
echo "🎉 TrustP2PBot iniciado!"
echo "📊 Para acompanhar os logs, o servidor está rodando em primeiro plano."
echo "🛑 Para parar o servidor, use Ctrl+C ou execute: ./stop-bot.sh"

# Usar mais memória e otimizações (sempre 3031)
NODE_ENV=development NODE_OPTIONS="--max-old-space-size=4096 --optimize-for-size --max-semi-space-size=128" PORT=3031 npm run start:dev