module.exports = {
  apps: [{
    name: "gold-admin-api",
    script: "./server/api.cjs",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: "production",
      PORT: 3001
    }
  }]
};
