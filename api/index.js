// Vercel serverless function entry point
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import url from 'url';

dotenv.config();

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || 'snooker-parlor-secret-key-change-in-production';
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests from this IP'
});
app.use(limiter);

// Body parsing and logging
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));

// CORS
const corsOrigins = process.env.CORS_ORIGIN?.split(',') || ['https://cue-master-pro.vercel.app'];
app.use(cors({ 
  origin: corsOrigins,
  credentials: true 
}));

// Simple in-memory user store for demo (since SQLite is complex on Vercel)
const users = [
  {
    id: 1,
    username: 'admin',
    password_hash: '$2b$10$MmsyAQ/AIYtj9P2AKqK7xuVFZXrkHqSzGO/b4z6oxcJ/nWtpCm6oG',
    role: 'admin',
    full_name: 'Administrator',
    email: 'admin@snookerparlor.com',
    is_active: 1
  },
  {
    id: 2,
    username: 'employee',
    password_hash: '$2b$10$as1y4GwSTgV0B.4w6Ap0beEQOWRKrZo4dtSRqxKWOt2XKXFSL3PBa',
    role: 'employee',
    full_name: 'Employee',
    email: 'employee@snookerparlor.com',
    is_active: 1
  }
];

// Simple tables data
const tables = [
  { id: 1, type: 'ENGLISH', hourly_rate: 300, status: 'AVAILABLE', light_on: 0 },
  { id: 2, type: 'ENGLISH', hourly_rate: 300, status: 'AVAILABLE', light_on: 0 },
  { id: 3, type: 'FRENCH', hourly_rate: 200, status: 'AVAILABLE', light_on: 0 },
  { id: 4, type: 'FRENCH', hourly_rate: 200, status: 'AVAILABLE', light_on: 0 }
];

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = users.find(u => u.id === decoded.userId && u.is_active === 1);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Admin role middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Authentication endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const user = users.find(u => u.username === username && u.is_active === 1);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        email: user.email
      },
      sessionId
    });
    
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Login failed: ' + error.message });
  }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      full_name: req.user.full_name,
      email: req.user.email
    }
  });
});

// Tables endpoint
app.get('/api/tables', authenticateToken, async (req, res) => {
  res.json(tables);
});

// Summary endpoint
app.get('/api/summary/today', authenticateToken, async (req, res) => {
  res.json({
    date: new Date().toISOString().slice(0, 10),
    total_earnings: 0,
    total_sessions: 0,
    friendly_games: 0,
    english_earnings: 0,
    french_earnings: 0,
    active_earnings: 0,
    active_sessions: 0,
    projected_earnings: 0
  });
});

// Sessions endpoint
app.get('/api/sessions', authenticateToken, async (req, res) => {
  res.json({
    sessions: [],
    total: 0,
    limit: 50,
    offset: 0,
    has_more: false
  });
});

// Health check
app.get('/api/health', async (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: Date.now(),
    version: '2.0.0',
    environment: 'vercel'
  });
});

// Serve static files
app.use(express.static(path.join(__dirname, '..')));

// Catch-all handler for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Export for Vercel
export default app;