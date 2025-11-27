module.exports = {
  apps: [
    {
      name: 'trustp2pbot',
      script: 'dist/src/main.js',
      cwd: '/home/umbrel/TrustP2PBot',

      // Ambiente
      node_args: '--max-old-space-size=512',
      env: {
        NODE_ENV: 'production',
      },

      // Auto-restart
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,

      // Logs
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/umbrel/TrustP2PBot/logs/error.log',
      out_file: '/home/umbrel/TrustP2PBot/logs/out.log',
      merge_logs: true,

      // Monitoramento
      max_memory_restart: '500M',

      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};
