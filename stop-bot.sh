#!/bin/bash

# Script para parar o TrustP2PBot de forma segura
# Uso: ./stop-bot.sh

echo "🛑 Parando TrustP2PBot..."

# Função para parar processos específicos do bot
stop_bot_processes() {
    local pattern="$1"
    local description="$2"
    
    local pids=$(ps aux | grep "$pattern" | grep -v grep | awk '{print $2}')
    
    if [ -n "$pids" ]; then
        echo "📍 Encontrados processos $description:"
        ps aux | grep "$pattern" | grep -v grep | awk '{print "   PID " $2 ": " $11 " " $12 " " $13}'
        
        for pid in $pids; do
            echo "   ⏹️  Parando PID $pid..."
            kill $pid
            sleep 1
            
            # Verificar se o processo ainda está rodando
            if kill -0 $pid 2>/dev/null; then
                echo "   ⚠️  Processo $pid ainda rodando, forçando parada..."
                kill -9 $pid
            fi
        done
        echo "   ✅ Processos $description parados"
    else
        echo "   ℹ️  Nenhum processo $description encontrado"
    fi
}

# Parar processos específicos do TrustP2PBot
echo ""
echo "🔍 Procurando processos do TrustP2PBot..."

# 1. Parar processos npm start relacionados ao TrustP2PBot
stop_bot_processes "npm.*start.*TrustP2PBot\|npm start" "npm start"

# 2. Parar processos npm run start:dev
stop_bot_processes "npm.*start:dev" "npm run start:dev"

# 3. Parar processos nest start
stop_bot_processes "nest start" "nest start"

# 4. Parar processos node main específicos do TrustP2PBot
stop_bot_processes "node.*TrustP2PBot.*main\|node.*--enable-source-maps.*TrustP2PBot" "node main (TrustP2PBot)"

# 5. Verificar se ainda há processos rodando na pasta do projeto
project_processes=$(ps aux | grep "/root/TrustP2PBot" | grep -v grep | grep -v "stop-bot.sh")
if [ -n "$project_processes" ]; then
    echo ""
    echo "⚠️  Ainda há processos rodando na pasta do projeto:"
    echo "$project_processes"
    echo ""
    echo "🤔 Deseja parar estes processos também? (y/N)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "$project_processes" | awk '{print $2}' | while read -r pid; do
            echo "   ⏹️  Parando PID $pid..."
            kill $pid
        done
    fi
fi

echo ""
echo "🔍 Verificação final..."

# Verificar se ainda há processos do bot rodando
remaining=$(ps aux | grep -E "npm.*start|nest.*start|node.*TrustP2PBot.*main" | grep -v grep | grep -v "stop-bot.sh")

if [ -z "$remaining" ]; then
    echo "✅ TrustP2PBot parado com sucesso!"
    echo "   Nenhum processo relacionado ao bot encontrado."
else
    echo "⚠️  Ainda há alguns processos rodando:"
    echo "$remaining"
    echo ""
    echo "💡 Se necessário, você pode parar manualmente com:"
    echo "   kill <PID>"
fi

echo ""
echo "🏁 Script finalizado."