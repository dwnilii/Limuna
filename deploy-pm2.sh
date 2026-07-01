#!/bin/bash

# --- Limuna Admin PM2 Deployment Script ---
# This script automates the installation and deployment of Limuna on your Linux server.

set -e # Exit immediately if a command exits with a non-zero status

# Text formatting colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0;m' # No Color

echo -e "${BLUE}===================================================================${NC}"
echo -e "${YELLOW}           🍋 Limuna Admin Panel - PM2 Deployer 🍋                 ${NC}"
echo -e "${BLUE}===================================================================${NC}"

# 1. Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed on this server.${NC}"
    echo -e "Please install Node.js (v18 or v20 recommended) first:"
    echo -e "  For Debian/Ubuntu:"
    echo -e "    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo -e "    sudo apt-get install -y nodejs"
    exit 1
else
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}[✔] Node.js is installed (${NODE_VERSION})${NC}"
fi

# 2. Check if NPM is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: NPM is not installed.${NC}"
    echo -e "Please install npm using: sudo apt-get install -y npm"
    exit 1
else
    NPM_VERSION=$(npm -v)
    echo -e "${GREEN}[✔] NPM is installed (v${NPM_VERSION})${NC}"
fi

# 3. Check and install PM2 globally if not present
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}[!] PM2 is not found. Installing PM2 globally via NPM...${NC}"
    sudo npm install -g pm2
    echo -e "${GREEN}[✔] PM2 installed successfully!${NC}"
else
    PM2_VERSION=$(pm2 -v)
    echo -e "${GREEN}[✔] PM2 is installed (v${PM2_VERSION})${NC}"
fi

# 4. Install project dependencies
echo -e "${BLUE}[~] Installing project dependencies (npm install)...${NC}"
npm install --no-audit --no-fund

# 5. Build the application for production
echo -e "${BLUE}[~] Building frontend assets and backend server (npm run build)...${NC}"
npm run build

# 6. Start / Restart application under PM2
echo -e "${BLUE}[~] Launching/Reloading application in PM2...${NC}"
if pm2 describe limuna-admin &> /dev/null; then
    echo -e "${YELLOW}[~] limuna-admin is already running in PM2. Reloading to apply changes...${NC}"
    pm2 reload ecosystem.config.cjs
else
    echo -e "${GREEN}[~] Starting limuna-admin for the first time...${NC}"
    pm2 start ecosystem.config.cjs
fi

echo -e "${BLUE}===================================================================${NC}"
echo -e "${GREEN}🎉 Limuna Admin Panel is successfully deployed under PM2! 🎉${NC}"
echo -e "${BLUE}===================================================================${NC}"
echo -e "Status Details:"
echo -e " - Port: ${YELLOW}3000${NC} (Check ecosystem.config.cjs to change)"
echo -e " - PM2 App Name: ${GREEN}limuna-admin${NC}"
echo -e ""
echo -e "${YELLOW}👉 To keep the process running after server reboots, run:${NC}"
echo -e "   ${BLUE}pm2 startup${NC}"
echo -e "   ${BLUE}pm2 save${NC}"
echo -e ""
echo -e "${YELLOW}👉 Useful PM2 commands:${NC}"
echo -e "   - See logs:     ${BLUE}pm2 logs limuna-admin${NC}"
echo -e "   - Check status: ${BLUE}pm2 status${NC}"
echo -e "   - Stop app:     ${BLUE}pm2 stop limuna-admin${NC}"
echo -e "==================================================================="
