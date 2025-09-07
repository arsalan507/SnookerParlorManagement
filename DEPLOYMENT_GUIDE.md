# 🚀 Snooker Parlor Dashboard - Complete Deployment Guide

## 📋 Overview

This guide will help you deploy your Snooker Parlor Management System to the cloud with:
- **Landing Page**: `https://snookheroes.com/`
- **Dashboard**: `https://dashboard.snookheroes.com/`
- **Free/Low-Cost Hosting Options**
- **Custom Domain Setup**
- **SSL Certificates**

---

## 🎯 Quick Start Options

### **Option 1: Vercel (Recommended - Free)**
- ✅ **Free Tier**: 100GB bandwidth/month
- ✅ **Custom Domains**: Free
- ✅ **SSL**: Automatic
- ✅ **Database**: PlanetScale (Free tier)
- ✅ **GitHub Integration**: Automatic deployments

### **Option 2: Railway (Alternative)**
- ✅ **Free Tier**: 512MB RAM, 1GB storage
- ✅ **PostgreSQL**: Free tier available
- ✅ **Custom Domains**: Supported

### **Option 3: Render (Good Alternative)**
- ✅ **Free Tier**: 750 hours/month
- ✅ **PostgreSQL**: Free tier
- ✅ **Custom Domains**: Free

---

## 📁 Step 1: Prepare Your Project for Deployment

### **1.1 Create GitHub Repository**

```bash
# Initialize git if not already done
git init
git add .
git commit -m "Initial commit - Snooker Parlor Dashboard"

# Create GitHub repository
# Go to https://github.com/new
# Repository name: snooker-parlor-dashboard
# Make it public or private

# Add remote and push
git remote add origin https://github.com/YOUR_USERNAME/snooker-parlor-dashboard.git
git push -u origin main
```

### **1.2 Project Structure for Deployment**

```
snooker-parlor-dashboard/
├── server/                 # Backend API
│   ├── server.js          # Main server file
│   ├── package.json       # Dependencies
│   ├── schema.sql         # Database schema
│   └── .env.example       # Environment variables
├── web/                   # Frontend
│   ├── index.html         # Dashboard
│   ├── login.html         # Login page
│   ├── app.js            # Frontend logic
│   └── styles.css        # Styles
├── landing/               # Landing page (we'll create this)
│   ├── index.html
│   ├── styles.css
│   └── assets/
├── vercel.json           # Vercel configuration
├── package.json          # Root package.json
└── README.md
```

---

## 🌐 Step 2: Choose and Setup Domain

### **2.1 Domain Registration (Free/Low-Cost)**

#### **Option A: Free Subdomains**
- **Netlify**: `yoursite.netlify.app`
- **Vercel**: `yoursite.vercel.app`
- **GitHub Pages**: `username.github.io`

#### **Option B: Paid Domains (₹500-2000/year)**
- **GoDaddy**: ₹800-1500/year
- **Namecheap**: ₹500-1000/year
- **Hostinger**: ₹600-1200/year

### **2.2 Recommended Domain Setup**
```
Main Domain: snookheroes.com
Subdomain: dashboard.snookheroes.com
```

---

## 🚀 Step 3: Deploy with Vercel (Recommended)

### **3.1 Setup Vercel Account**
1. Go to [vercel.com](https://vercel.com)
2. Sign up with GitHub
3. Connect your repository

### **3.2 Configure Project Structure**

#### **Create `vercel.json` (Root level)**
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server/server.js",
      "use": "@vercel/node"
    },
    {
      "src": "web/package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "web"
      }
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/server/server.js"
    },
    {
      "src": "/(.*)",
      "dest": "/web/$1"
    }
  ],
  "env": {
    "NODE_ENV": "production",
    "JWT_SECRET": "@jwt-secret",
    "DATABASE_URL": "@database-url"
  }
}
```

#### **Create `web/vercel.json`**
```json
{
  "version": 2,
  "builds": [
    {
      "src": "web/index.html",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/web/$1"
    }
  ]
}
```

### **3.3 Database Setup (PlanetScale)**

1. **Create PlanetScale Account**
   - Go to [planetscale.com](https://planetscale.com)
   - Sign up (Free tier available)

2. **Create Database**
   ```bash
   # Install PlanetScale CLI
   npm install -g @planetscale/cli

   # Login
   pscale auth login

   # Create database
   pscale database create snooker-db

   # Create branch
   pscale branch create snooker-db main

   # Get connection string
   pscale connect snooker-db main --port 3306
   ```

3. **Update Environment Variables**
   ```bash
   # In Vercel dashboard, add these environment variables:
   DATABASE_URL=mysql://username:password@host:port/database
   JWT_SECRET=your-super-secret-jwt-key-here
   NODE_ENV=production
   ```

### **3.4 Deploy to Vercel**

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel --prod

# Or deploy from GitHub (recommended)
# Push to GitHub and Vercel will auto-deploy
```

---

## 🏠 Step 4: Create Landing Page

### **4.1 Create Landing Page Structure**

#### **Create `landing/index.html`**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Snook Heroes - Premium Snooker Parlor</title>
    <link rel="stylesheet" href="styles.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
</head>
<body>
    <!-- Header -->
    <header class="header">
        <nav class="nav">
            <div class="logo">
                <h1>🎱 Snook Heroes</h1>
            </div>
            <div class="nav-links">
                <a href="#home">Home</a>
                <a href="#features">Features</a>
                <a href="#pricing">Pricing</a>
                <a href="#contact">Contact</a>
                <a href="https://dashboard.snookheroes.com" class="btn-primary">Login</a>
            </div>
        </nav>
    </header>

    <!-- Hero Section -->
    <section class="hero" id="home">
        <div class="hero-content">
            <h1>Professional Snooker Experience</h1>
            <p>Experience world-class snooker at Snook Heroes. Premium tables, expert coaching, and modern facilities.</p>
            <div class="hero-buttons">
                <a href="#booking" class="btn-primary">Book a Table</a>
                <a href="#tour" class="btn-secondary">Virtual Tour</a>
            </div>
        </div>
        <div class="hero-image">
            <img src="assets/snooker-table.jpg" alt="Snooker Table">
        </div>
    </section>

    <!-- Features Section -->
    <section class="features" id="features">
        <div class="container">
            <h2>Why Choose Snook Heroes?</h2>
            <div class="features-grid">
                <div class="feature-card">
                    <div class="feature-icon">🎱</div>
                    <h3>Premium Tables</h3>
                    <p>State-of-the-art Brunswick tables with professional cloth and equipment.</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon">👨‍🏫</div>
                    <h3>Expert Coaching</h3>
                    <p>Learn from certified coaches with years of professional experience.</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon">🏆</div>
                    <h3>Tournaments</h3>
                    <p>Regular tournaments and leagues for all skill levels.</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon">☕</div>
                    <h3>Cafe & Lounge</h3>
                    <p>Relax with premium beverages and snacks during your game.</p>
                </div>
            </div>
        </div>
    </section>

    <!-- Pricing Section -->
    <section class="pricing" id="pricing">
        <div class="container">
            <h2>Membership Plans</h2>
            <div class="pricing-grid">
                <div class="pricing-card">
                    <h3>Walk-in</h3>
                    <div class="price">₹300<span>/hour</span></div>
                    <ul>
                        <li>Access to all tables</li>
                        <li>Equipment provided</li>
                        <li>Cafe access</li>
                    </ul>
                    <a href="#booking" class="btn-primary">Book Now</a>
                </div>
                <div class="pricing-card featured">
                    <h3>VIP Member</h3>
                    <div class="price">₹500<span>/month</span></div>
                    <ul>
                        <li>Unlimited play (off-peak)</li>
                        <li>Priority booking</li>
                        <li>Free coaching sessions</li>
                        <li>Loyalty points</li>
                    </ul>
                    <a href="#contact" class="btn-primary">Join Now</a>
                </div>
                <div class="pricing-card">
                    <h3>Premium</h3>
                    <div class="price">₹1000<span>/month</span></div>
                    <ul>
                        <li>24/7 access</li>
                        <li>Personal coach</li>
                        <li>Tournament entry</li>
                        <li>Guest passes</li>
                    </ul>
                    <a href="#contact" class="btn-primary">Get Premium</a>
                </div>
            </div>
        </div>
    </section>

    <!-- Contact Section -->
    <section class="contact" id="contact">
        <div class="container">
            <h2>Visit Us</h2>
            <div class="contact-content">
                <div class="contact-info">
                    <div class="contact-item">
                        <h4>📍 Location</h4>
                        <p>123 Snooker Street<br>City, State 12345</p>
                    </div>
                    <div class="contact-item">
                        <h4>📞 Phone</h4>
                        <p>+91 98765 43210</p>
                    </div>
                    <div class="contact-item">
                        <h4>🕒 Hours</h4>
                        <p>Mon-Sun: 10AM - 12AM</p>
                    </div>
                </div>
                <div class="contact-form">
                    <h3>Send us a message</h3>
                    <form>
                        <input type="text" placeholder="Your Name" required>
                        <input type="email" placeholder="Your Email" required>
                        <input type="tel" placeholder="Your Phone">
                        <textarea placeholder="Your Message" rows="4"></textarea>
                        <button type="submit" class="btn-primary">Send Message</button>
                    </form>
                </div>
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
        <div class="container">
            <div class="footer-content">
                <div class="footer-section">
                    <h4>🎱 Snook Heroes</h4>
                    <p>Your premier destination for snooker excellence.</p>
                </div>
                <div class="footer-section">
                    <h4>Quick Links</h4>
                    <a href="#home">Home</a>
                    <a href="#features">Features</a>
                    <a href="#pricing">Pricing</a>
                    <a href="#contact">Contact</a>
                </div>
                <div class="footer-section">
                    <h4>Follow Us</h4>
                    <div class="social-links">
                        <a href="#">📘 Facebook</a>
                        <a href="#">📷 Instagram</a>
                        <a href="#">🐦 Twitter</a>
                    </div>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; 2024 Snook Heroes. All rights reserved.</p>
            </div>
        </div>
    </footer>

    <script src="script.js"></script>
</body>
</html>
```

#### **Create `landing/styles.css`**
```css
/* Reset and Base Styles */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Inter', sans-serif;
    line-height: 1.6;
    color: #333;
    overflow-x: hidden;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
}

/* Header */
.header {
    position: fixed;
    top: 0;
    width: 100%;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    z-index: 1000;
    border-bottom: 1px solid #e0e0e0;
}

.nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 0;
    max-width: 1200px;
    margin: 0 auto;
}

.logo h1 {
    color: #1a365d;
    font-size: 1.8rem;
    font-weight: 700;
}

.nav-links {
    display: flex;
    align-items: center;
    gap: 2rem;
}

.nav-links a {
    text-decoration: none;
    color: #4a5568;
    font-weight: 500;
    transition: color 0.3s;
}

.nav-links a:hover {
    color: #1a365d;
}

.btn-primary {
    background: #1a365d;
    color: white;
    padding: 0.5rem 1.5rem;
    border-radius: 25px;
    text-decoration: none;
    font-weight: 600;
    transition: all 0.3s;
    border: 2px solid #1a365d;
}

.btn-primary:hover {
    background: #2d3748;
    border-color: #2d3748;
    transform: translateY(-2px);
}

.btn-secondary {
    background: transparent;
    color: #1a365d;
    padding: 0.5rem 1.5rem;
    border-radius: 25px;
    text-decoration: none;
    font-weight: 600;
    border: 2px solid #1a365d;
    transition: all 0.3s;
}

.btn-secondary:hover {
    background: #1a365d;
    color: white;
    transform: translateY(-2px);
}

/* Hero Section */
.hero {
    display: flex;
    align-items: center;
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 120px 0 80px;
}

.hero-content {
    flex: 1;
    padding: 0 40px;
}

.hero-content h1 {
    font-size: 3.5rem;
    font-weight: 700;
    margin-bottom: 1.5rem;
    line-height: 1.2;
}

.hero-content p {
    font-size: 1.3rem;
    margin-bottom: 2rem;
    opacity: 0.9;
}

.hero-buttons {
    display: flex;
    gap: 1rem;
}

.hero-image {
    flex: 1;
    text-align: center;
    padding: 0 40px;
}

.hero-image img {
    max-width: 100%;
    border-radius: 20px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}

/* Features Section */
.features {
    padding: 80px 0;
    background: #f8f9fa;
}

.features h2 {
    text-align: center;
    font-size: 2.5rem;
    margin-bottom: 3rem;
    color: #1a365d;
}

.features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
}

.feature-card {
    background: white;
    padding: 2rem;
    border-radius: 15px;
    text-align: center;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
    transition: transform 0.3s;
}

.feature-card:hover {
    transform: translateY(-10px);
}

.feature-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
}

.feature-card h3 {
    font-size: 1.5rem;
    margin-bottom: 1rem;
    color: #1a365d;
}

/* Pricing Section */
.pricing {
    padding: 80px 0;
    background: white;
}

.pricing h2 {
    text-align: center;
    font-size: 2.5rem;
    margin-bottom: 3rem;
    color: #1a365d;
}

.pricing-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
    max-width: 1000px;
    margin: 0 auto;
}

.pricing-card {
    background: white;
    padding: 2rem;
    border-radius: 15px;
    text-align: center;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
    border: 2px solid #e0e0e0;
    transition: all 0.3s;
}

.pricing-card:hover {
    transform: translateY(-10px);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.pricing-card.featured {
    border-color: #1a365d;
    transform: scale(1.05);
}

.price {
    font-size: 3rem;
    font-weight: 700;
    color: #1a365d;
    margin: 1rem 0;
}

.price span {
    font-size: 1rem;
    font-weight: 400;
    color: #718096;
}

.pricing-card ul {
    list-style: none;
    margin: 2rem 0;
}

.pricing-card li {
    padding: 0.5rem 0;
    color: #4a5568;
}

/* Contact Section */
.contact {
    padding: 80px 0;
    background: #f8f9fa;
}

.contact h2 {
    text-align: center;
    font-size: 2.5rem;
    margin-bottom: 3rem;
    color: #1a365d;
}

.contact-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4rem;
    max-width: 1000px;
    margin: 0 auto;
}

.contact-item {
    margin-bottom: 2rem;
}

.contact-item h4 {
    color: #1a365d;
    margin-bottom: 0.5rem;
}

.contact-form h3 {
    color: #1a365d;
    margin-bottom: 1.5rem;
}

.contact-form input,
.contact-form textarea {
    width: 100%;
    padding: 1rem;
    margin-bottom: 1rem;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    font-family: inherit;
}

.contact-form button {
    width: 100%;
}

/* Footer */
.footer {
    background: #1a365d;
    color: white;
    padding: 40px 0 20px;
}

.footer-content {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    margin-bottom: 2rem;
}

.footer-section h4 {
    margin-bottom: 1rem;
    color: #e2e8f0;
}

.footer-section a {
    display: block;
    color: #cbd5e0;
    text-decoration: none;
    margin-bottom: 0.5rem;
    transition: color 0.3s;
}

.footer-section a:hover {
    color: white;
}

.social-links {
    display: flex;
    gap: 1rem;
}

.footer-bottom {
    text-align: center;
    padding-top: 2rem;
    border-top: 1px solid #2d3748;
    color: #cbd5e0;
}

/* Responsive Design */
@media (max-width: 768px) {
    .nav-links {
        display: none;
    }

    .hero {
        flex-direction: column;
        text-align: center;
        padding: 100px 0 40px;
    }

    .hero-content h1 {
        font-size: 2.5rem;
    }

    .hero-buttons {
        justify-content: center;
    }

    .features-grid {
        grid-template-columns: 1fr;
    }

    .pricing-grid {
        grid-template-columns: 1fr;
    }

    .contact-content {
        grid-template-columns: 1fr;
        gap: 2rem;
    }

    .footer-content {
        grid-template-columns: 1fr;
    }
}
```

### **4.2 Deploy Landing Page**

#### **Option A: Netlify (Free)**
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Deploy landing page
cd landing
netlify deploy --prod --dir=.
```

#### **Option B: Vercel**
```bash
# Create separate Vercel project for landing page
vercel --prod --name snookheroes-landing
```

---

## 🔗 Step 5: Domain Configuration

### **5.1 Point Domain to Vercel**

#### **For Main Domain (snookheroes.com)**
1. Go to Vercel Dashboard
2. Project Settings → Domains
3. Add `snookheroes.com`
4. Follow DNS instructions from Vercel

#### **For Subdomain (dashboard.snookheroes.com)**
1. In Vercel Dashboard, add `dashboard.snookheroes.com`
2. Configure DNS records as instructed

### **5.2 DNS Configuration**

#### **Example DNS Records:**
```
Type: A
Name: @
Value: 76.76.21.21 (Vercel's IP)

Type: CNAME
Name: dashboard
Value: cname.vercel-dns.com

Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

---

## 🗄️ Step 6: Database Migration

### **6.1 Export Local Database**

```bash
# Export SQLite database
sqlite3 server/parlor.db .dump > backup.sql

# Or use the backup script
cd server
node -e "const { backupDatabase } = require('./db.js'); backupDatabase();"
```

### **6.2 Setup Production Database**

#### **PlanetScale (Recommended)**
```bash
# Install PlanetScale CLI
npm install -g @planetscale/cli

# Login
pscale auth login

# Create database
pscale database create snooker-production

# Import schema
pscale shell snooker-production < server/schema.sql

# Import data (if needed)
pscale shell snooker-production < backup.sql
```

#### **Alternative: Railway PostgreSQL**
```bash
# Railway provides PostgreSQL
# Update your connection string in environment variables
DATABASE_URL=postgresql://user:password@host:port/database
```

---

## 🔐 Step 7: Environment Configuration

### **7.1 Production Environment Variables**

#### **Vercel Environment Variables:**
```bash
# Database
DATABASE_URL=your-production-database-url
DB_TYPE=sqlite|postgres|mysql

# Authentication
JWT_SECRET=your-super-secure-jwt-secret-here
SESSION_TIMEOUT=24

# Features
NODE_ENV=production
HARDWARE_ENABLED=false
AUTO_BACKUP_ENABLED=true

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### **7.2 Security Checklist**
- ✅ JWT secret is strong and unique
- ✅ Database credentials are secure
- ✅ No sensitive data in client-side code
- ✅ HTTPS enabled (automatic with Vercel)
- ✅ CORS properly configured

---

## 🚀 Step 8: Final Deployment

### **8.1 Deploy to Production**

```bash
# Push all changes to GitHub
git add .
git commit -m "Production deployment setup"
git push origin main

# Vercel will auto-deploy
# Check deployment status at vercel.com
```

### **8.2 Test Production Deployment**

#### **Test Checklist:**
- ✅ Landing page loads: `https://snookheroes.com/`
- ✅ Dashboard accessible: `https://dashboard.snookheroes.com/`
- ✅ Login functionality works
- ✅ Database connections work
- ✅ SSL certificate active
- ✅ Mobile responsive design

---

## 📊 Step 9: Monitoring & Maintenance

### **9.1 Vercel Analytics**
- Real-time monitoring
- Performance metrics
- Error tracking
- Bandwidth usage

### **9.2 Database Monitoring**
```bash
# PlanetScale metrics
pscale database show snooker-production

# Check connection health
pscale ping
```

### **9.3 Backup Strategy**
```bash
# Automatic backups with PlanetScale
# Manual backups
pscale database dump snooker-production > backup.sql
```

---

## 💰 Cost Breakdown

### **Free Tier Limits:**
| Service | Free Limit | Cost if Exceeded |
|---------|------------|------------------|
| **Vercel** | 100GB bandwidth | $20/100GB |
| **PlanetScale** | 1GB storage | $0.25/GB/month |
| **Domain** | - | ₹800-1500/year |

### **Total Monthly Cost (Free Tier):**
- **Hosting**: $0
- **Database**: $0
- **Domain**: ₹67/month (₹800/year)
- **SSL**: Free (included)
- **Total**: **₹67/month** (~$0.80)

---

## 🆘 Troubleshooting

### **Common Issues:**

#### **1. Domain Not Working**
```bash
# Check DNS propagation
nslookup snookheroes.com
nslookup dashboard.snookheroes.com

# Clear DNS cache
# Windows: ipconfig /flushdns
# macOS: sudo killall -HUP mDNSResponder
```

#### **2. Database Connection Issues**
```bash
# Test database connection
pscale connect snooker-production

# Check environment variables in Vercel
# Dashboard → Project → Settings → Environment Variables
```

#### **3. Build Failures**
```bash
# Check Vercel build logs
# Dashboard → Project → Deployments → View Logs

# Common fixes:
# - Check package.json scripts
# - Verify file paths in vercel.json
# - Ensure all dependencies are listed
```

---

## 🎉 Success Checklist

- ✅ **GitHub Repository**: Created and configured
- ✅ **Vercel Account**: Connected to GitHub
- ✅ **Domain Purchased**: snookheroes.com
- ✅ **DNS Configured**: Points to Vercel
- ✅ **Landing Page**: Created and deployed
- ✅ **Dashboard**: Deployed to subdomain
- ✅ **Database**: Migrated to production
- ✅ **SSL**: Automatic with Vercel
- ✅ **Environment**: Production variables set
- ✅ **Testing**: All features working

---

## 📞 Support & Resources

### **Helpful Links:**
- **Vercel Docs**: [vercel.com/docs](https://vercel.com/docs)
- **PlanetScale Docs**: [planetscale.com/docs](https://planetscale.com/docs)
- **Domain Registration**: [namecheap.com](https://namecheap.com)

### **Community Support:**
- **Vercel Discord**: [vercel.com/discord](https://vercel.com/discord)
- **PlanetScale Community**: [planetscale.com/slack](https://planetscale.com/slack)

---

**🎯 Your Snooker Parlor Dashboard is now live at:**
- **Landing Page**: `https://cuemasterpro.com/`
- **Dashboard**: `https://dashboard.cuemasterpro.com/`

**Total Cost: ₹67/month** (~$0.80) for the first year!

**Ready to deploy? Follow the steps above and you'll be live in under 2 hours! 🚀**