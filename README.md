# 🎱 Snooker Parlor Management System

A comprehensive, full-featured snooker parlor management system with real-time table tracking, user authentication, financial management, and advanced business features.

## ✨ Current Features

### 🔐 **Authentication & Security**
- **Role-Based Access Control**: Admin and Employee user roles
- **Secure Authentication**: JWT-based login with bcrypt password hashing
- **Session Management**: Automatic logout and session tracking
- **Protected Routes**: API endpoints secured based on user permissions

### 🎯 **Table Management**
- **Dynamic Table Operations**: Add, edit, delete tables with different types
- **Real-Time Status Tracking**: Live updates for table availability
- **Session Management**: Start, pause, resume, stop sessions
- **Hardware Integration**: Light control system (ready for Arduino integration)
- **Table Types**: Support for English and French snooker tables

### 💰 **Financial Management**
- **Real-Time Billing**: Automatic calculation based on time and rates
- **Payment Methods**: Cash, UPI, Card payment tracking
- **Discount System**: Percentage-based discounts
- **Daily Summaries**: Earnings breakdown by table type and payment method
- **Financial Reports**: CSV export and detailed session history

### 👥 **Customer Management**
- **Customer Profiles**: Name, phone number, and session history
- **Friendly Games**: Non-billable sessions for practice
- **Session Notes**: Custom notes for each session
- **Customer Analytics**: Track customer playing patterns

### ⚙️ **Admin Settings**
- **Parlor Configuration**: Customize parlor name and settings
- **Pricing Management**: Set different rates for table types
- **System Settings**: Configure session timeouts and features
- **Database Management**: Backup and restore functionality

### 📱 **Modern Web App**
- **Progressive Web App (PWA)**: Install as mobile/desktop app
- **Offline Support**: Service worker for offline functionality
- **Real-Time Updates**: Server-Sent Events for live notifications
- **Responsive Design**: Works on all devices and screen sizes

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ installed
- npm or yarn package manager

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/arsalan507/SnookerParlorManagement.git
cd SnookerParlorManagement
```

2. **Install server dependencies**
```bash
cd server
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start the server**
```bash
npm start
```

5. **Access the application**
Open your browser and navigate to `http://localhost:8080`

### Default Login Credentials

**Admin Access** (Full Features)
- Username: `admin`
- Password: `admin123`

**Employee Access** (Basic Features)
- Username: `employee`
- Password: `employee123`

## 📊 System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Database      │
│   (Web App)     │◄──►│   (Node.js)     │◄──►│   (SQLite)      │
│                 │    │                 │    │                 │
│ • React-like UI │    │ • Express.js    │    │ • User Auth     │
│ • PWA Features  │    │ • JWT Auth      │    │ • Tables        │
│ • Real-time     │    │ • SSE Events    │    │ • Sessions      │
│ • Offline       │    │ • RESTful API   │    │ • Customers     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🛠️ Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **SQLite** - Database
- **JWT** - Authentication
- **bcrypt** - Password hashing
- **Server-Sent Events** - Real-time updates

### Frontend
- **Vanilla JavaScript** - Core functionality
- **CSS3** - Modern styling with animations
- **Service Worker** - PWA and offline support
- **HTML5** - Semantic markup

### DevOps
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **Environment Variables** - Configuration management

## 📋 API Documentation

### Authentication Endpoints
```
POST /api/auth/login     - User login
POST /api/auth/logout    - User logout
GET  /api/auth/me        - Get current user info
```

### Table Management
```
GET    /api/tables           - Get all tables
POST   /api/admin/tables     - Create new table (Admin)
PATCH  /api/admin/tables/:id - Update table (Admin)
DELETE /api/admin/tables/:id - Delete table (Admin)
```

### Session Management
```
POST /api/table/:id/start  - Start session
POST /api/table/:id/pause  - Pause session
POST /api/table/:id/resume - Resume session
POST /api/table/:id/stop   - Stop session
```

### Reports & Analytics
```
GET /api/summary/today        - Today's summary
GET /api/sessions             - Session history
GET /api/reports/daily.csv    - Export daily report
```

## 🎯 User Roles & Permissions

### Admin Users
- ✅ Full dashboard access
- ✅ Settings page access
- ✅ Add/edit/delete tables
- ✅ Modify pricing and configuration
- ✅ View all reports and analytics
- ✅ User management (future)

### Employee Users
- ✅ Dashboard access
- ✅ Start/stop sessions
- ✅ View session history
- ✅ Basic reporting
- ❌ No settings access
- ❌ Cannot modify tables or pricing

## 🚀 Deployment Guide

Ready to deploy your Snooker Parlor Dashboard to the cloud? Check out our comprehensive [**Deployment Guide**](DEPLOYMENT_GUIDE.md) for:

- **Free Cloud Hosting** with Vercel, Railway, or Render
- **Custom Domain Setup** (snookheroes.com + dashboard.snookheroes.com)
- **Landing Page Creation** with professional design
- **Database Migration** to production
- **SSL Certificates** and security setup
- **Cost Breakdown** (starts at ₹67/month)

## 📈 Feature Roadmap

For detailed information about completed features and future development plans, see our comprehensive [**Feature Roadmap**](FEATURE_ROADMAP.md).

### 🎯 **Next Phase Development**
1. **Inventory Management** - Track equipment and consumables
2. **Staff Management** - Employee scheduling and payroll
3. **Membership System** - Customer loyalty and tiers
4. **Advanced Reporting** - Business intelligence and analytics
5. **Mobile App** - Native iOS/Android applications

## 🐳 Docker Deployment

### Using Docker Compose (Recommended)
```bash
docker-compose up -d
```

### Manual Docker Build
```bash
# Build the image
docker build -t snooker-parlor .

# Run the container
docker run -p 8080:8080 -v $(pwd)/data:/app/data snooker-parlor
```

## 🔧 Configuration

### Environment Variables
```bash
# Server Configuration
PORT=8080
NODE_ENV=production

# Database
DATABASE_PATH=./data/parlor.db

# Authentication
JWT_SECRET=your-secret-key-here
ADMIN_USER=admin
ADMIN_PASS=admin123

# Hardware Integration (Optional)
HARDWARE_ENABLED=false
ARDUINO_HOST=192.168.1.100

# CORS
CORS_ORIGIN=http://localhost:8080
```

### Hardware Integration
The system supports Arduino-based hardware integration for:
- Table light control
- Automatic session detection
- IoT sensor integration

See [Hardware Integration Guide](docs/Hardware_Integration.md) for setup instructions.

## 🧪 Testing

### Manual Testing
1. Start the server: `npm start`
2. Open browser to `http://localhost:8080`
3. Test login with provided credentials
4. Verify table operations and session management

### API Testing
Use tools like Postman or curl to test API endpoints:
```bash
# Login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Get tables (with auth token)
curl -X GET http://localhost:8080/api/tables \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🤝 Contributing

We welcome contributions! Please see our [Feature Roadmap](FEATURE_ROADMAP.md) for planned features and development priorities.

### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and test thoroughly
4. Commit your changes: `git commit -m 'Add amazing feature'`
5. Push to the branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

### Code Style
- Use consistent indentation (2 spaces)
- Follow existing naming conventions
- Add comments for complex logic
- Test on multiple browsers/devices

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support & Issues

- **Documentation**: Check our [Feature Roadmap](FEATURE_ROADMAP.md)
- **Issues**: [GitHub Issues](https://github.com/arsalan507/SnookerParlorManagement/issues)
- **Discussions**: [GitHub Discussions](https://github.com/arsalan507/SnookerParlorManagement/discussions)

## 📊 Project Status

| Component | Status | Coverage |
|-----------|--------|----------|
| **Core Operations** | ✅ Complete | 90% |
| **Authentication** | ✅ Complete | 95% |
| **Financial Management** | ✅ Mostly Complete | 70% |
| **Advanced Features** | 🚧 In Development | 15% |
| **Mobile App** | 📋 Planned | 0% |

**Overall System Maturity: 45%**

## 🌟 Acknowledgments

- Built with modern web technologies
- Inspired by real snooker parlor management needs
- Community-driven feature development
- Open source and free to use

---

**🎱 Made with ❤️ for snooker parlor owners worldwide**

*Transform your snooker business with modern technology*