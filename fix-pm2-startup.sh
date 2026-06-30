#!/bin/bash
# Configura persistência completa do TrustP2PBot:
#   1. Serviço systemd para PM2 iniciar no boot
#   2. Timer systemd para monitor verificar o bot a cada 5 minutos
# Execute com: sudo bash fix-pm2-startup.sh

set -e

echo "=== [1/4] Criando pm2-umbrel.service ==="
cat > /etc/systemd/system/pm2-umbrel.service << 'EOF'
[Unit]
Description=PM2 process manager - TrustP2PBot
Documentation=https://pm2.keymetrics.io/
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=forking
User=umbrel
LimitNOFILE=infinity
LimitNPROC=infinity
LimitCORE=infinity
Environment=PATH=/usr/local/bin:/usr/bin:/bin
Environment=PM2_HOME=/home/umbrel/.pm2
PIDFile=/home/umbrel/.pm2/pm2.pid
Restart=on-failure
RestartSec=15
ExecStartPre=/bin/sleep 10
ExecStart=/home/umbrel/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2 resurrect
ExecReload=/home/umbrel/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2 reload all
ExecStop=/home/umbrel/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2 kill

[Install]
WantedBy=multi-user.target
EOF

echo "=== [2/4] Criando trustp2pbot-monitor.service ==="
cat > /etc/systemd/system/trustp2pbot-monitor.service << 'EOF'
[Unit]
Description=TrustP2PBot health monitor
After=network-online.target

[Service]
Type=oneshot
User=umbrel
ExecStart=/home/umbrel/TrustP2PBot/monitor.sh
EOF

echo "=== [3/4] Criando trustp2pbot-monitor.timer ==="
cat > /etc/systemd/system/trustp2pbot-monitor.timer << 'EOF'
[Unit]
Description=Run TrustP2PBot monitor every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Unit=trustp2pbot-monitor.service

[Install]
WantedBy=timers.target
EOF

echo "=== [4/4] Habilitando serviços ==="
systemctl daemon-reload
systemctl enable pm2-umbrel.service
systemctl enable trustp2pbot-monitor.timer
systemctl start trustp2pbot-monitor.timer
systemctl enable systemd-networkd-wait-online.service 2>/dev/null || true

echo ""
echo "=== Concluído ==="
systemctl status trustp2pbot-monitor.timer --no-pager
echo ""
echo "Verifique o serviço PM2 com: systemctl status pm2-umbrel.service"
