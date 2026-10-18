// PM2 process file: `pm2 start ecosystem.config.js`
module.exports = {
  apps: [{
    name: 'tuition',
    script: 'server.js',
    instances: 1, // SQLite: keep a single process
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOST: '127.0.0.1',
      TZ: 'Asia/Kolkata',
      COOKIE_SECURE: '1', // set to '0' until HTTPS is configured
    },
  }],
};
