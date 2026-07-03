const port = process.env.WDP_PORT || '8080';
const host = process.env.WDP_HOST || '0.0.0.0';

module.exports = {
  apps: [
    {
      name: 'wdp-sheet',
      cwd: __dirname,
      script: 'src/server.js',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        WDP_PORT: port,
        WDP_HOST: host,
      },
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};