module.exports = {
  apps: [
    {
      name: 'optionchain-live',
      script: './src/live.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '256M',
      time: true,
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'sensex-live',
      script: './src/sensex-live.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '256M',
      time: true,
      env: { NODE_ENV: 'production' }
    }
  ]
};
