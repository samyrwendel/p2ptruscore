const fs = require('fs');
const path = require('path');

// Ler e parsear o arquivo .env manualmente (para ignorar variáveis do sistema)
function loadEnvFile(filePath) {
  const envVars = {};
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    content.split('\n').forEach(line => {
      // Ignorar comentários e linhas vazias
      if (line.trim() && !line.trim().startsWith('#')) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();
          // Remover aspas se existirem
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          envVars[key] = value;
        }
      }
    });
  } catch (err) {
    console.error('Erro ao ler .env:', err.message);
  }
  return envVars;
}

// Carregar variáveis do .env (NÃO do processo atual)
const envFile = loadEnvFile(path.join(__dirname, '.env'));

module.exports = {
  apps: [
    {
      name: 'trustp2pbot',
      script: 'dist/src/main.js',
      cwd: '/home/umbrel/TrustP2PBot',

      // Ambiente - usar variáveis do .env diretamente
      node_args: '--max-old-space-size=512 --require ./preload.js --dns-result-order=ipv4first',
      env: {
        NODE_ENV: 'production',
        TELEGRAM_BOT_TOKEN: envFile.TELEGRAM_BOT_TOKEN,
        TELEGRAM_BOT_USERNAME: envFile.TELEGRAM_BOT_USERNAME,
        TELEGRAM_GROUP_ID: envFile.TELEGRAM_GROUP_ID,
        TELEGRAM_THREAD_ID: envFile.TELEGRAM_THREAD_ID,
        MONGODB_CNN: envFile.MONGODB_CNN,
        PORT: envFile.PORT || '3031',
        LOG_LEVEL: envFile.LOG_LEVEL || 'info',
        REQUEST_TIMEOUT: envFile.REQUEST_TIMEOUT,
        RATE_LIMIT_TTL: envFile.RATE_LIMIT_TTL,
        RATE_LIMIT_LIMIT: envFile.RATE_LIMIT_LIMIT,
        BROADCAST_CONCURRENCY: envFile.BROADCAST_CONCURRENCY,
        BROADCAST_DELAY_MS: envFile.BROADCAST_DELAY_MS,
        TELEGRAM_BACKOFF_RETRIES: envFile.TELEGRAM_BACKOFF_RETRIES,
        TELEGRAM_BACKOFF_INITIAL_MS: envFile.TELEGRAM_BACKOFF_INITIAL_MS,
        TELEGRAM_BACKOFF_FACTOR: envFile.TELEGRAM_BACKOFF_FACTOR,
        CACHE_TTL: envFile.CACHE_TTL,
        TELEGRAM_ADMIN_CHANNEL_ID: envFile.TELEGRAM_ADMIN_CHANNEL_ID,
      },

      // Auto-restart - MÁXIMA RESILIÊNCIA (otimizado para quedas de energia)
      autorestart: true,
      watch: false,
      max_restarts: 100,          // Mais tentativas antes de desistir
      min_uptime: '10s',          // Considera iniciado após 10s
      restart_delay: 10000,       // Espera 10s entre restarts (dar tempo à rede)
      exp_backoff_restart_delay: 5000, // Backoff exponencial começa em 5s

      // Logs
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/umbrel/TrustP2PBot/logs/error.log',
      out_file: '/home/umbrel/TrustP2PBot/logs/out.log',
      merge_logs: true,
      log_type: 'json',

      // Monitoramento
      max_memory_restart: '500M',

      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 15000,      // Mais tempo para inicializar

      // Cron para restart diário preventivo (3h da manhã)
      cron_restart: '0 3 * * *',
    },
  ],
};
