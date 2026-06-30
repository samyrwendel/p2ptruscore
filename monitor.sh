#!/bin/bash
# Monitor TrustP2PBot - reinicia se não responder

PM2=/home/umbrel/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2
LOG_FILE="/home/umbrel/TrustP2PBot/logs/monitor.log"

BOT_TOKEN=$(grep TELEGRAM_BOT_TOKEN ~/TrustP2PBot/.env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
RESPONSE=$(curl -s -m 15 "https://api.telegram.org/bot${BOT_TOKEN}/getMe" 2>&1)

if [[ "$RESPONSE" == *'"ok":true'* ]]; then
  exit 0
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') - Bot não respondeu. Response: $RESPONSE" >> "$LOG_FILE"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Reiniciando trustp2pbot..." >> "$LOG_FILE"

export PM2_HOME=/home/umbrel/.pm2
$PM2 restart trustp2pbot >> "$LOG_FILE" 2>&1 || $PM2 start /home/umbrel/TrustP2PBot/ecosystem.config.js >> "$LOG_FILE" 2>&1

echo "$(date '+%Y-%m-%d %H:%M:%S') - Restart concluído" >> "$LOG_FILE"
