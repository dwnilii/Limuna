# 🍋 Limuna Admin Panel - PM2 Production Deployment Guide

This guide explains how to install, build, and run the **Limuna Admin Panel** on your Linux server in a highly performant, stable, and persistent production state using **PM2** (Process Manager 2).

---

## 📋 Prerequisites
Ensure your server has **Node.js** (v18 or v20) and **NPM** installed.

To verify, run:
```bash
node -v
npm -v
```

---

## ⚡ Quick Start: One-Click Automated Deployment
We have provided an automated bash script `deploy-pm2.sh` to handle all the setup steps:

1. Make the script executable:
   ```bash
   chmod +x deploy-pm2.sh
   ```
2. Run the script:
   ```bash
   ./deploy-pm2.sh
   ```

The script will automatically check for Node, install PM2 globally if missing, pull dependencies, compile frontend and backend assets into the `dist/` directory, and start the app under PM2.

---

## 🛠️ Manual Deployment Steps

If you prefer to run the steps manually:

### 1. Install PM2 Globally
```bash
sudo npm install -g pm2
```

### 2. Install Project Dependencies
```bash
npm install
```

### 3. Build for Production
Compiles the React frontend into static assets and bundles the Express backend (`server.ts`) into a standalone CommonJS file (`dist/server.cjs`):
```bash
npm run build
```

### 4. Start the Application via PM2
Using our pre-configured `ecosystem.config.cjs`:
```bash
pm2 start ecosystem.config.cjs
```

---

## 🔄 Persisting Across Server Reboots
By default, PM2 will keep the app running, but if the entire Linux server reboots, you need to tell PM2 to restart itself and load your apps:

1. **Generate Startup Script**:
   ```bash
   pm2 startup
   ```
   *Copy and run the command printed in your terminal (usually starts with `sudo env PATH=...`).*

2. **Save Current Process List**:
   ```bash
   pm2 save
   ```

---

## ⚙️ Customizing the Port
By default, the server listens on port `3000`. You can easily change this:

1. Open `ecosystem.config.cjs`
2. Change the `PORT` environment variable value:
   ```javascript
   env: {
     NODE_ENV: "production",
     PORT: 8080 // Set your custom port here
   }
   ```
3. Apply changes:
   ```bash
   pm2 reload limuna-admin
   ```

---

## 🔍 Useful PM2 Commands

- **Check logs (extremely helpful for debugging connection details)**:
  ```bash
  pm2 logs limuna-admin
  ```
- **Check application CPU/RAM metrics**:
  ```bash
  pm2 status
  ```
- **Stop the app**:
  ```bash
  pm2 stop limuna-admin
  ```
- **Restart/Reload with zero downtime**:
  ```bash
  pm2 reload limuna-admin
  ```

---

## 🔒 Optional: Nginx Reverse Proxy with SSL (Recommended)
To run Limuna securely under standard HTTPS (`https://yourdomain.com`), set up an Nginx reverse proxy:

1. Install Nginx:
   ```bash
   sudo apt update
   sudo apt install nginx -y
   ```
2. Create an Nginx config block `/etc/nginx/sites-available/limuna`:
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:3000; # Points to PM2 port
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
3. Enable configuration and reload Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/limuna /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```
4. Install SSL via Let's Encrypt (Certbot):
   ```bash
   sudo apt install certbot python3-certbot-nginx -y
   sudo certbot --nginx -d yourdomain.com
   ```
