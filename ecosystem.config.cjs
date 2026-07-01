module.exports = {
  apps: [
    {
      name: "limuna-admin",
      script: "./dist/server.cjs",
      instances: 1, // Single instance (fork mode) is recommended to maximize the effectiveness of the SSH connection & query cache in memory.
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 3000 // Change this port if you want the app to listen on a different port on your server
      }
    }
  ]
};
