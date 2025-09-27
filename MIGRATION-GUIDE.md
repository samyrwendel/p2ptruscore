# 🚀 Guia de Migração - TrustP2PBot

## �� Pré-requisitos da Nova VPS

### Recursos Mínimos Recomendados:
- **RAM**: 8GB (vs 3.7GB atual)
- **CPU**: 4 cores
- **Storage**: 50GB SSD
- **OS**: Ubuntu 20.04+ ou Debian 11+

## 🔧 Passos para Migração

### 1. Preparar Nova VPS
```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PM2 para gerenciamento de processos
sudo npm install -g pm2

# Instalar Git
sudo apt install git -y
```

### 2. Clonar Repositório
```bash
cd /root
git clone https://github.com/samyrwendel/p2ptruscore.git TrustP2PBot
cd TrustP2PBot
```

### 3. Configurar Ambiente
```bash
# Instalar dependências
npm install

# Copiar e configurar .env
cp .env.example .env
nano .env
```

### 4. Configurações Essenciais no .env
```bash
# Bot Telegram
TELEGRAM_BOT_TOKEN=seu_token_aqui
TELEGRAM_BOT_USERNAME=p2pscorebot

# Grupo e Tópico
TELEGRAM_GROUP_ID=-1002907400287
TELEGRAM_THREAD_ID=250

# MongoDB (VPS separada)
MONGODB_CNN=mongodb://ipmais:senha@mongo.ipmais.com:27077/trustscore_bot?authSource=admin

# Porta
PORT=3000
```

### 5. Build e Deploy
```bash
# Build da aplicação
npm run build

# Configurar PM2
pm2 start dist/src/main.js --name "trustp2p-bot"
pm2 save
pm2 startup
```

### 6. Verificações Pós-Deploy
```bash
# Verificar status
pm2 status
pm2 logs trustp2p-bot

# Testar conectividade
curl http://localhost:3000/config/status
```

## 🔒 Segurança

### Firewall
```bash
sudo ufw allow 22/tcp
sudo ufw allow 3000/tcp
sudo ufw enable
```

### Backup Automático
```bash
# Criar script de backup
echo '#!/bin/bash
cd /root/TrustP2PBot
git add .
git commit -m "Auto backup $(date)"
git push origin main' > /root/backup.sh

chmod +x /root/backup.sh

# Cron para backup diário
echo "0 2 * * * /root/backup.sh" | crontab -
```

## 📊 Monitoramento

### Recursos do Sistema
```bash
# Instalar htop para monitoramento
sudo apt install htop -y

# Verificar uso de recursos
free -h
df -h
htop
```

### Logs do Bot
```bash
# Ver logs em tempo real
pm2 logs trustp2p-bot --lines 100

# Logs de erro
pm2 logs trustp2p-bot --err
```

## 🔄 Rollback (se necessário)

### Voltar para VPS Anterior
1. Parar bot na nova VPS: `pm2 stop trustp2p-bot`
2. Iniciar bot na VPS antiga
3. Atualizar DNS/proxy se aplicável

## 📞 Contatos de Emergência

- **Desenvolvedor**: @samyralmeida
- **Repositório**: https://github.com/samyrwendel/p2ptruscore
- **Documentação**: README.md

---
**Última atualização**: $(date)
**Versão**: v2.1.0
