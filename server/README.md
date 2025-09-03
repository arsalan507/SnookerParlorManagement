# 🎱 Snooker Parlor Management System

A complete, production-ready snooker parlor management system with real-time table monitoring, customer management, and hardware integration capabilities.

## ✨ Features

### Core Management
- **8 Table Support**: 4 English tables (₹300/hr) + 4 French tables (₹200/hr)
- **Real-time Monitoring**: Live table status updates via Server-Sent Events
- **Session Management**: Start, pause, resume, and stop sessions with accurate billing
- **Customer Tracking**: Phone-based customer database with visit history
- **Payment Methods**: Support for Cash, UPI, and Card payments
- **Friendly Games**: Non-billable session support

### Advanced Features
- **Hardware Integration**: Arduino/Raspberry Pi light control
- **PWA Support**: Offline-capable Progressive Web App
- **Dark/Light Themes**: Modern responsive UI
- **Real-time Dashboard**: Live earnings and session tracking
- **Comprehensive Reporting**: Daily/weekly analytics with CSV export
- **Admin Authentication**: Secure admin operations
- **Database Backups**: Automated backup system

### Technical Features
- **SQLite Database**: WAL mode for performance
- **RESTful API**: Complete API with rate limiting
- **Security**: Helmet, CORS, input validation
- **Docker Ready**: Production deployment configuration
- **Service Worker**: Offline caching and PWA features

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone and Setup**
```bash
git clone <repository-url>
cd snooker-parlor/server
cp .env.example .env
```

2. **Configure Environment**
Edit `.env` file with your settings:
```env
PORT=8080
ADMIN_USER=admin
ADMIN_PASS=your-secure-password
HARDWARE_ENABLED=false
```

3. **Install Dependencies**
```bash
npm install
```

4. **Initialize Database**
```bash
npm run migrate
```

5. **Start Development Server**
```bash
npm run dev
```

6. **Access Application**
Open http://localhost:8080 in your browser

## 📋 API Documentation

### Health Check
```bash
GET /api/health
```

### Tables Management
```bash
GET /api/tables                    # Get all tables with status
PATCH /api/table/:id/status        # Update table status (admin)
```

### Session Management
```bash
POST /api/table/:id/start          # Start new session
POST /api/table/:id/pause          # Pause active session
POST /api/table/:id/resume         # Resume paused session
POST /api/table/:id/stop           # Stop and bill session
```

### Hardware Control
```bash
POST /api/lights/:id/toggle        # Toggle table light
```

### Reports & Analytics
```bash
GET /api/summary/today             # Today's summary
GET /api/sessions                  # Session history
GET /api/customers                 # Customer database
GET /api/reports/daily.csv         # Export daily report
```

### Real-time Updates
```bash
GET /api/events                    # Server-Sent Events stream
```

## 🏗️ Project Structure

```
server/
├── server.js              # Main application server
├── db.js                  # Database management
├── schema.sql             # Database schema
├── package.json           # Dependencies
├── .env.example           # Environment template
├── Dockerfile             # Docker configuration
└── README.md              # This file

web/
├── index.html             # Main dashboard
├── app.js                 # Frontend application
├── styles.css             # Modern styling
├── sw.js                  # Service worker
└── manifest.webmanifest   # PWA manifest

docs/
└── Hardware_Integration.md # Hardware setup guide
```

## 🐳 Docker Deployment

### Using Docker Compose
```bash
# Copy environment file
cp server/.env.example server/.env
# Edit server/.env with production settings

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f snooker-server
```

### Manual Docker Build
```bash
cd server
docker build -t snooker-parlor .
docker run -p 8080:8080 -v $(pwd)/data:/app/data snooker-parlor
```

## 🔧 Configuration

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 8080 |
| `NODE_ENV` | Environment | development |
| `ADMIN_USER` | Admin username | admin |
| `ADMIN_PASS` | Admin password | admin |
| `HARDWARE_ENABLED` | Enable hardware control | false |
| `ARDUINO_HOST` | Arduino IP address | 192.168.1.100 |
| `DB_PATH` | Database file path | ./parlor.db |

### Table Configuration
The system is configured for:
- **Tables 1-4**: English Snooker @ ₹300/hour
- **Tables 5-8**: French Snooker @ ₹200/hour

To modify table configuration, edit the seeding section in `db.js`.

## 🔌 Hardware Integration

### Supported Hardware
- Arduino Uno/ESP32
- Raspberry Pi (any model with GPIO)
- 8-channel relay modules
- LED strips or bulbs

### Setup Guide
See [Hardware Integration Guide](../docs/Hardware_Integration.md) for detailed setup instructions.

### Quick Hardware Test
```bash
# Enable hardware in .env
HARDWARE_ENABLED=true
ARDUINO_HOST=192.168.1.100

# Test light control
curl -X POST http://localhost:8080/api/lights/1/toggle \
  -H "Content-Type: application/json" \
  -d '{"on": true}'
```

## 📊 Database Schema

### Tables
- `tables` - Table configuration and status
- `sessions` - Session records with billing
- `customers` - Customer database
- `daily_summaries` - Daily earnings summaries
- `hardware_logs` - Hardware operation logs

### Key Features
- **WAL Mode**: Better concurrent access
- **Foreign Keys**: Data integrity
- **Indexes**: Optimized queries
- **Triggers**: Automatic timestamps

## 🔒 Security Features

- **Rate Limiting**: 1000 requests per 15 minutes
- **Helmet**: Security headers
- **CORS**: Configurable origins
- **Input Validation**: SQL injection prevention
- **Admin Auth**: Basic authentication for admin routes
- **Error Handling**: Secure error responses

## 📈 Performance

### Optimizations
- **SQLite WAL Mode**: Concurrent read/write
- **Connection Pooling**: Efficient database access
- **Static File Serving**: Optimized asset delivery
- **Gzip Compression**: Reduced bandwidth
- **Service Worker**: Offline caching

### Monitoring
- **Health Checks**: `/api/health` endpoint
- **Real-time Metrics**: Active connections, uptime
- **Error Logging**: Comprehensive error tracking
- **Performance Logs**: Request timing

## 🧪 Testing

### Manual Testing
```bash
# Start development server
npm run dev

# Test API endpoints
curl http://localhost:8080/api/health
curl http://localhost:8080/api/tables
```

### Load Testing
```bash
# Install artillery
npm install -g artillery

# Run load test
artillery quick --count 10 --num 100 http://localhost:8080/api/health
```

## 🔄 Backup & Recovery

### Automatic Backups
```bash
# Create backup
curl -X POST http://localhost:8080/api/admin/backup \
  -u admin:your-password
```

### Manual Backup
```bash
# Copy database file
cp server/parlor.db server/backup-$(date +%Y%m%d).db
```

### Recovery
```bash
# Restore from backup
cp server/backup-20240101.db server/parlor.db
npm start
```

## 🚨 Troubleshooting

### Common Issues

1. **Port Already in Use**
```bash
# Change port in .env
PORT=8081
```

2. **Database Locked**
```bash
# Stop all instances and restart
pkill node
npm start
```

3. **Hardware Not Responding**
```bash
# Check network connectivity
ping 192.168.1.100

# Verify hardware service is running
curl http://192.168.1.100/status
```

4. **Real-time Updates Not Working**
```bash
# Check EventSource connection
# Open browser dev tools -> Network -> EventSource
```

### Logs
```bash
# View application logs
npm run dev

# View system logs (production)
docker-compose logs -f snooker-server
```

## 📞 Support

### Getting Help
1. Check this README
2. Review [Hardware Integration Guide](../docs/Hardware_Integration.md)
3. Check application logs
4. Verify environment configuration

### Reporting Issues
When reporting issues, include:
- Node.js version
- Operating system
- Error messages
- Steps to reproduce
- Environment configuration (without passwords)

## 🔮 Future Enhancements

- [ ] Mobile app (React Native)
- [ ] Advanced analytics dashboard
- [ ] Multi-location support
- [ ] Inventory management
- [ ] Staff management
- [ ] Automated tournament brackets
- [ ] SMS notifications
- [ ] Payment gateway integration

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with Node.js and Express
- SQLite for reliable data storage
- Modern web technologies for the frontend
- Arduino/Raspberry Pi community for hardware integration

---

**Made with ❤️ for snooker parlor owners**