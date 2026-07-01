# 🍋 Limuna Admin Panel

> A lightweight, highly optimized, and modern web panel for managing Linux servers via SSH. Designed with an elegant Cosmic Amber theme, persistent connection caching, and memory-friendly command optimization.
>
> یک پنل وب سبک، بسیار بهینه‌شده و مدرن برای مدیریت سرورهای لینوکس از طریق SSH. طراحی شده با تم جذاب Cosmic Amber، سیستم کشینگ کانکشن‌های پویا و بهینه‌سازی شده برای به حداقل رساندن لود سرور و پردازش‌های SSH.

---

## 🌐 Language Options / انتخاب زبان

- [English Version](#-english-version)
- [نسخه فارسی](#-نسخه-فارسی)

---

## 🇬🇧 English Version

Limuna is a single-server Linux management control panel that runs entirely in user-space, communicating with target servers securely over SSH. It features a persistent connection cache to avoid spawning repeated SSH processes and caches safe read-only queries (like system metrics, UFW statuses, user listings) in memory for 3 seconds to keep your SSH pipe and server resource usage incredibly light.

### 🌟 Key Features

- **🍋 Modern Lime Aesthetic**: Formed with high-contrast displays, beautiful negative space, and custom vector icons.
- **⚡ SSH Resource Optimization**: Reuses established SSH connections and caches system stats/logs temporarily to reduce SSH process overhead.
- **👥 Full User & Group Management**: Create, delete, modify users, reset passwords, and manage Linux system groups with safe confirmation states.
- **🛡️ Dynamic Firewall (UFW) Control**: List, add, insert, delete, and reorder UFW rules dynamically from the UI.
- **📦 Reliable Backup Engine**: Create live disk/directory archive plans, view progress, and generate command steps for reliable recovery.
- **🪵 Live Log Streamer**: Watch system services, auth logs, or custom systemd unit logs in real-time with adjustable line limits.

---

### ⚙️ Production Deployment

We have prepared automated tools to get Limuna running under **PM2** on your production server instantly.

#### Prerequisites
- **Node.js** (v18 or v20 recommended)
- **NPM**

#### Option A: Quick Automated Installer (Recommended)
Clone this repository to your server and run:
```bash
chmod +x deploy-pm2.sh
./deploy-pm2.sh
```
This script automatically:
1. Installs PM2 globally if missing.
2. Resolves and installs dependencies.
3. Compiles the React frontend and bundles the Express backend server into `dist/server.cjs`.
4. Starts/reloads the service under PM2 using the optimal `ecosystem.config.cjs`.

#### Option B: Manual Setup
```bash
# 1. Install PM2
npm install -g pm2

# 2. Pull dependencies
npm install

# 3. Build optimized application assets
npm run build

# 4. Fire it up with PM2 configuration
pm2 start ecosystem.config.cjs
```

#### Persist across Server Reboots
To ensure Limuna automatically recovers when your Linux server restarts:
```bash
pm2 startup
# (Run the command outputted by the screen under sudo)
pm2 save
```

---

### 🔒 Nginx Reverse Proxy with SSL

For production environments, we highly recommend serving Limuna through Nginx over HTTPS.

1. **Install Nginx**:
   ```bash
   sudo apt update && sudo apt install nginx -y
   ```
2. **Create config block** in `/etc/nginx/sites-available/limuna`:
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
3. **Enable & Restart**:
   ```bash
   sudo ln -s /etc/nginx/sites-available/limuna /etc/nginx/sites-enabled/
   sudo systemctl restart nginx
   ```
4. **Acquire SSL** (Let's Encrypt):
   ```bash
   sudo apt install certbot python3-certbot-nginx -y
   sudo certbot --nginx -d yourdomain.com
   ```

---

## 🇮🇷 نسخه فارسی

پنل مدیریتی لیمونا (Limuna) یک ابزار فوق‌العاده سبک، سریع و امن برای کنترل سرورهای لینوکسی شماست که به صورت مستقیم و بدون نیاز به نصب هیچ ایجنتی روی سرور مقصد، با پروتکل SSH ارتباط برقرار می‌کند. این پنل به یک مکانیزم هوشمند حافظه مجهز است که با کش‌کردن دستورات خواندنی (Read-Only) مانند بررسی وضعیت فایروال یا وضعیت سیستم و نگهداری کانکشن‌های فعال، از ایجاد پردازش‌های مجدد SSH و تحمیل فشار بی‌مورد بر روی سرور جلوگیری می‌کند.

### 🌟 قابلیت‌های برجسته

- **🍋 طراحی مدرن لیمویی (Cosmic Amber)**: استفاده از فضاهای منفی استاندارد، جلوه‌های بصری خیره‌کننده و آیکون‌های وکتور شخصی‌سازی شده.
- **⚡ فوق‌العاده سبک و بهینه‌سازی شده**: نگهداری هوشمند اتصالات SSH فعال و کش‌کردن موقت نتایج خروجی به مدت ۳ ثانیه برای کاهش شدید مصرف منابع.
- **👥 مدیریت کامل کاربران و گروه‌ها**: امکان ساخت کاربر جدید، تعیین کلمه عبور، حذف کاربر، تعریف گروه‌های سیستمی لینوکس و بررسی جزییات ایدی کاربران (UID/GID) با سیستم تایید امن چند مرحله‌ای.
- **🛡️ فایروال قدرتمند (UFW)**: مشاهده لحظه‌ای قوانین فعال، افزودن آسان پورت‌ها و رنج‌های آی‌پی، اولویت‌بندی مجدد قوانین و حذف آنی از پنل کاربری.
- **📦 زمان‌بندی و مدیریت فایل‌های پشتیبان**: امکان آرشیو دایرکتوری‌ها، مانیتورینگ فضای دیسک و ساخت برنامه‌های جامع ریکاوری.
- **🪵 نمایشگر زنده لاگ‌ها (Live Log Streamer)**: اتصال پویا به فایل‌های لاگ سیستمی نظیر Auth.log، لاگ وب‌سرورها یا وب‌سوکت‌ها با امکان تنظیم تعداد خطوط دریافتی.

---

### ⚙️ راهنمای پیاده‌سازی و اجرا در سرور واقعی (PM2)

تمام فایل‌های لازم برای راه‌اندازی سریع و ماندگار پنل روی وب‌سرور شخصی شما با استفاده از ابزار قدرتمند **PM2** از پیش آماده شده است.

#### پیش‌نیازها
- نصب بودن **Node.js** (نسخه ۱۸ یا ۲۰ پیشنهاد می‌شود)
- نصب بودن **NPM**

#### روش اول: راه‌اندازی خودکار تنها با یک دستور (پیشنهاد شده)
مخزن را روی سرور خود کلون کرده و کدهای زیر را اجرا کنید:
```bash
chmod +x deploy-pm2.sh
./deploy-pm2.sh
```
این اسکریپت به صورت خودکار مراحل زیر را انجام می‌دهد:
1. بررسی و نصب سراسری (Global) ابزار PM2 در صورت عدم وجود روی سرور.
2. دانلود و نصب وابستگی‌های پروژه (NPM packages).
3. کامپایل رابط کاربری فرانت‌اند و ادغام کدهای بک‌اند اکسپرس در قالب یک فایل باندل بهینه‌شده به آدرس `dist/server.cjs`.
4. اجرا یا ریلود کردن سرویس در پس‌زمینه با پیکربندی ایده آل تعریف شده در `ecosystem.config.cjs`.

#### روش دوم: راه‌اندازی دستی
```bash
# ۱. نصب سراسری PM2
npm install -g pm2

# ۲. نصب پیش‌نیازهای پکیج
npm install

# ۳. بیلد نهایی پروژه با ابزارهای بهینه‌ساز
npm run build

# ۴. اجرا توسط تنظیمات آماده اکوسیستم
pm2 start ecosystem.config.cjs
```

#### بالا آمدن خودکار پس از ری‌استارت شدن سرور
برای اینکه با هر بار ری‌استارت شدن یا خاموش‌روشن شدن سرور فیزیکی، پنل لیمونا به صورت خودکار در پس‌زمینه لود شود دستورات زیر را وارد کنید:
```bash
pm2 startup
# (دستوری که در خروجی به شما نمایش داده می‌شود را کپی کرده و با دسترسی Sudo اجرا کنید)
pm2 save
```

---

### 🔒 راه‌اندازی امن معکوس با Nginx و SSL

جهت امنیت و پایداری در سطح پروداکشن، پیشنهاد می‌شود پنل را در بستر پروتکل امن HTTPS و از طریق وب‌سرور Nginx بالا بیاورید.

1. **نصب Nginx**:
   ```bash
   sudo apt update && sudo apt install nginx -y
   ```
2. **ساخت فایل پیکربندی** در مسیر `/etc/nginx/sites-available/limuna`:
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com; # آدرس دامنه یا آی‌پی اختصاصی خود را وارد کنید

       location / {
           proxy_pass http://127.0.0.1:3000; # پورت پیش‌فرض پنل لیمونا
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
3. **فعالسازی و راه‌اندازی مجدد**:
   ```bash
   sudo ln -s /etc/nginx/sites-available/limuna /etc/nginx/sites-enabled/
   sudo systemctl restart nginx
   ```
4. **دریافت گواهی امنیتی رایگان SSL** (از طریق Let's Encrypt):
   ```bash
   sudo apt install certbot python3-certbot-nginx -y
   sudo certbot --nginx -d yourdomain.com
   ```

---

## 👨‍💻 Author

Created with Passion by **D.khandan v1.0**

ساخته شده با عشق توسط **D.khandan v1.0**
