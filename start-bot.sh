#!/bin/bash
export PATH=/usr/local/bin:$PATH
export PM2_HOME=/home/umbrel/.pm2

cd /home/umbrel/TrustP2PBot
/usr/local/bin/npx pm2 resurrect || /usr/local/bin/npx pm2 start ecosystem.config.js
