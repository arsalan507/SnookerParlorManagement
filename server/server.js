import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import basicAuth from 'express-basic-auth';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import url from 'url';
import { getDB, migrate, closeDB, backupDatabase } from './db.js';

dotenv.config();

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'snooker-parlor-secret-key-change-in-production';
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for SSE
  crossOriginEmbedderPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP'
});
app.use(limiter);

// Body parsing and logging
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));

// CORS
const corsOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:8080'];
app.use(cors({ 
  origin: corsOrigins,
  credentials: true 
}));

// Admin authentication
const adminAuth = basicAuth({ 
  users: { [process.env.ADMIN_USER || 'admin']: process.env.ADMIN_PASS || 'admin' }, 
  challenge: true,
  realm: 'Snooker Parlor Admin'
});

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = await getDB();
    const user = await db.get('SELECT * FROM users WHERE id = ? AND is_active = 1', decoded.userId);
    
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

// Server-Sent Events for real-time updates
const clients = new Set();

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.flushHeaders();
  
  // Send initial connection confirmation
  res.write('event: connected\ndata: {"message":"Connected to real-time updates"}\n\n');
  res.write('retry: 3000\n\n');

  const clientId = Date.now().toString();
  const client = { id: clientId, res, lastPing: Date.now() };
  clients.add(client);

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    if (clients.has(client)) {
      res.write('event: heartbeat\ndata: {"timestamp":' + Date.now() + '}\n\n');
      client.lastPing = Date.now();
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(client);
    console.log(`🔌 Client ${clientId} disconnected. Active clients: ${clients.size}`);
  });

  console.log(`🔌 Client ${clientId} connected. Active clients: ${clients.size}`);
});

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const deadClients = new Set();
  
  for (const client of clients) {
    try {
      client.res.write(payload);
    } catch (error) {
      console.error('📡 Failed to send to client:', error.message);
      deadClients.add(client);
    }
  }
  
  // Clean up dead connections
  for (const client of deadClients) {
    clients.delete(client);
  }
  
  if (deadClients.size > 0) {
    console.log(`🧹 Cleaned up ${deadClients.size} dead connections. Active: ${clients.size}`);
  }
}

// Utility functions
const now = () => Date.now();
const ceilToMinute = (ms) => Math.ceil(ms / 60000);
const formatCurrency = (amount) => `₹${amount.toLocaleString('en-IN')}`;
const formatDuration = (ms) => {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
};

// Enhanced computation with better error handling
async function computeRunningAmount(table) {
  try {
    const db = await getDB();
    const session = await db.get(`
      SELECT * FROM sessions 
      WHERE table_id = ? AND end_time IS NULL 
      ORDER BY id DESC LIMIT 1
    `, table.id);
    
    if (!session) return 0;
    
    const currentTime = now();
    const resumeTime = session.last_resume_time || session.start_time;
    const elapsed = currentTime - resumeTime;
    const effectiveMs = (session.duration_ms || 0) + elapsed - (session.paused_ms || 0);
    const minutes = Math.max(0, ceilToMinute(effectiveMs));
    const ratePerMin = table.hourly_rate / 60;
    const baseAmount = Math.round(minutes * ratePerMin);
    const discount = (session.discount_percent || 0) / 100;
    const finalAmount = session.is_friendly ? 0 : Math.round(baseAmount * (1 - discount));
    
    return {
      amount: finalAmount,
      minutes,
      duration: formatDuration(effectiveMs),
      elapsed_ms: effectiveMs
    };
  } catch (error) {
    console.error('❌ Error computing running amount:', error);
    return 0;
  }
}

// API Routes

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const db = await getDB();
    await db.get('SELECT 1');
    res.json({ 
      status: 'healthy', 
      timestamp: now(),
      version: '2.0.0',
      uptime: process.uptime(),
      clients: clients.size 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      error: error.message,
      timestamp: now() 
    });
  }
});

// Authentication endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const db = await getDB();
    const user = await db.get('SELECT * FROM users WHERE username = ? AND is_active = 1', username);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Verify password using bcrypt
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update last login
    await db.run('UPDATE users SET last_login = ? WHERE id = ?', Date.now(), user.id);
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Create session record
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
    
    await db.run(
      'INSERT INTO user_sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
      sessionId, user.id, expiresAt
    );
    
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
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (sessionId) {
      const db = await getDB();
      await db.run('DELETE FROM user_sessions WHERE id = ?', sessionId);
    }
    
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
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

// Settings endpoints (admin only)
app.get('/api/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDB();
    const settings = await db.all('SELECT * FROM settings ORDER BY key');
    
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.key] = {
        value: setting.value,
        description: setting.description,
        updated_at: setting.updated_at
      };
    });
    
    res.json(settingsObj);
  } catch (error) {
    console.error('❌ Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.patch('/api/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const updates = req.body;
    const db = await getDB();
    
    for (const [key, value] of Object.entries(updates)) {
      await db.run(
        'INSERT OR REPLACE INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)',
        key, value, Date.now(), req.user.id
      );
    }
    
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('❌ Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Table management endpoints (admin only)
app.post('/api/admin/tables', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { type, hourly_rate } = req.body;
    
    if (!type || !hourly_rate) {
      return res.status(400).json({ error: 'Type and hourly rate required' });
    }
    
    if (!['ENGLISH', 'FRENCH'].includes(type)) {
      return res.status(400).json({ error: 'Invalid table type' });
    }
    
    const db = await getDB();
    const result = await db.run(
      'INSERT INTO tables (type, hourly_rate) VALUES (?, ?)',
      type, parseInt(hourly_rate)
    );
    
    const newTable = await db.get('SELECT * FROM tables WHERE id = ?', result.lastID);
    
    broadcast('table:created', newTable);
    res.json({ success: true, table: newTable });
    
  } catch (error) {
    console.error('❌ Error creating table:', error);
    res.status(500).json({ error: 'Failed to create table' });
  }
});

app.patch('/api/admin/tables/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const tableId = parseInt(req.params.id);
    const { type, hourly_rate } = req.body;
    
    const db = await getDB();
    const updates = {};
    
    if (type && ['ENGLISH', 'FRENCH'].includes(type)) {
      updates.type = type;
    }
    
    if (hourly_rate) {
      updates.hourly_rate = parseInt(hourly_rate);
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }
    
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(tableId);
    
    await db.run(`UPDATE tables SET ${setClause} WHERE id = ?`, ...values);
    
    const updatedTable = await db.get('SELECT * FROM tables WHERE id = ?', tableId);
    
    broadcast('table:updated', updatedTable);
    res.json({ success: true, table: updatedTable });
    
  } catch (error) {
    console.error('❌ Error updating table:', error);
    res.status(500).json({ error: 'Failed to update table' });
  }
});

app.delete('/api/admin/tables/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const tableId = parseInt(req.params.id);
    
    const db = await getDB();
    
    // Check if table has active sessions
    const activeSession = await db.get(
      'SELECT id FROM sessions WHERE table_id = ? AND end_time IS NULL',
      tableId
    );
    
    if (activeSession) {
      return res.status(400).json({ error: 'Cannot delete table with active session' });
    }
    
    await db.run('DELETE FROM tables WHERE id = ?', tableId);
    
    broadcast('table:deleted', { id: tableId });
    res.json({ success: true, message: 'Table deleted successfully' });
    
  } catch (error) {
    console.error('❌ Error deleting table:', error);
    res.status(500).json({ error: 'Failed to delete table' });
  }
});

// Tables management
app.get('/api/tables', async (req, res) => {
  try {
    const db = await getDB();
    const tables = await db.all('SELECT * FROM tables ORDER BY id');
    
    // Enrich with running amounts and session info
    const enriched = await Promise.all(tables.map(async (table) => {
      const runningData = await computeRunningAmount(table);
      const activeSession = await db.get(`
        SELECT id, customer_name, start_time, is_friendly, break_count 
        FROM sessions 
        WHERE table_id = ? AND end_time IS NULL 
        ORDER BY id DESC LIMIT 1
      `, table.id);
      
      return {
        ...table,
        running_amount: typeof runningData === 'object' ? runningData.amount : runningData,
        running_data: typeof runningData === 'object' ? runningData : null,
        active_session: activeSession
      };
    }));
    
    res.json(enriched);
  } catch (error) {
    console.error('❌ Error fetching tables:', error);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

app.patch('/api/table/:id/status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const tableId = parseInt(req.params.id);
    
    if (!['AVAILABLE', 'OCCUPIED', 'MAINTENANCE'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const db = await getDB();
    await db.run('UPDATE tables SET status = ?, updated_at = ? WHERE id = ?', 
      status, now(), tableId);
    
    const updatedTable = await db.get('SELECT * FROM tables WHERE id = ?', tableId);
    
    if (status === 'MAINTENANCE') {
      await db.run('UPDATE tables SET last_maintenance = ? WHERE id = ?', now(), tableId);
    }
    
    broadcast('table:update', updatedTable);
    res.json(updatedTable);
  } catch (error) {
    console.error('❌ Error updating table status:', error);
    res.status(500).json({ error: 'Failed to update table status' });
  }
});

// Session management - Enhanced
app.post('/api/table/:id/start', async (req, res) => {
  try {
    const tableId = parseInt(req.params.id);
    const { 
      is_friendly = false, 
      customer_name = null, 
      customer_phone = null,
      notes = null,
      discount_percent = 0,
      payment_method = 'CASH'
    } = req.body;
    
    const db = await getDB();
    const table = await db.get('SELECT * FROM tables WHERE id = ?', tableId);
    
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    if (table.status === 'OCCUPIED') {
      return res.status(409).json({ error: 'Table already occupied' });
    }
    
    if (table.status === 'MAINTENANCE') {
      return res.status(409).json({ error: 'Table under maintenance' });
    }
    
    const startTime = now();
    
    // Handle customer registration/update
    let customerId = null;
    if (customer_phone) {
      const existingCustomer = await db.get('SELECT * FROM customers WHERE phone = ?', customer_phone);
      if (existingCustomer) {
        await db.run(`
          UPDATE customers SET 
            name = COALESCE(?, name),
            total_sessions = total_sessions + 1,
            last_visit = ?
          WHERE phone = ?
        `, customer_name, startTime, customer_phone);
        customerId = existingCustomer.id;
      } else if (customer_name) {
        const result = await db.run(`
          INSERT INTO customers (name, phone, total_sessions, last_visit) 
          VALUES (?, ?, 1, ?)
        `, customer_name, customer_phone, startTime);
        customerId = result.lastID;
      }
    }
    
    // Create session
    const sessionResult = await db.run(`
      INSERT INTO sessions (
        table_id, start_time, is_friendly, customer_name, customer_phone,
        notes, last_resume_time, discount_percent, payment_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, tableId, startTime, is_friendly ? 1 : 0, customer_name, customer_phone, 
       notes, startTime, discount_percent, payment_method);
    
    // Update table status
    await db.run('UPDATE tables SET status = "OCCUPIED", light_on = 1 WHERE id = ?', tableId);
    
    const session = await db.get('SELECT * FROM sessions WHERE id = ?', sessionResult.lastID);
    const updatedTable = await db.get('SELECT * FROM tables WHERE id = ?', tableId);
    
    // Hardware integration
    await controlTableLight(tableId, true);
    
    broadcast('session:start', { session, table: updatedTable });
    
    res.json({ 
      success: true, 
      session, 
      table: updatedTable,
      message: `Session started on Table ${tableId}` 
    });
    
  } catch (error) {
    console.error('❌ Error starting session:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

app.post('/api/table/:id/pause', async (req, res) => {
  try {
    const tableId = parseInt(req.params.id);
    const db = await getDB();
    
    const session = await db.get(`
      SELECT * FROM sessions 
      WHERE table_id = ? AND end_time IS NULL 
      ORDER BY id DESC LIMIT 1
    `, tableId);
    
    if (!session) {
      return res.status(404).json({ error: 'No active session found' });
    }
    
    if (!session.last_resume_time) {
      return res.status(400).json({ error: 'Session is already paused' });
    }
    
    const pauseTime = now();
    const additionalMs = pauseTime - session.last_resume_time;
    const newDuration = (session.duration_ms || 0) + additionalMs;
    
    await db.run(`
      UPDATE sessions SET 
        duration_ms = ?,
        last_resume_time = NULL,
        break_count = break_count + 1
      WHERE id = ?
    `, newDuration, session.id);
    
    broadcast('session:pause', { table_id: tableId, session_id: session.id });
    
    res.json({ 
      success: true, 
      message: 'Session paused',
      duration: formatDuration(newDuration)
    });
    
  } catch (error) {
    console.error('❌ Error pausing session:', error);
    res.status(500).json({ error: 'Failed to pause session' });
  }
});

app.post('/api/table/:id/resume', async (req, res) => {
  try {
    const tableId = parseInt(req.params.id);
    const db = await getDB();
    
    const session = await db.get(`
      SELECT * FROM sessions 
      WHERE table_id = ? AND end_time IS NULL 
      ORDER BY id DESC LIMIT 1
    `, tableId);
    
    if (!session) {
      return res.status(404).json({ error: 'No active session found' });
    }
    
    if (session.last_resume_time) {
      return res.status(400).json({ error: 'Session is not paused' });
    }
    
    const resumeTime = now();
    await db.run('UPDATE sessions SET last_resume_time = ? WHERE id = ?', resumeTime, session.id);
    
    broadcast('session:resume', { table_id: tableId, session_id: session.id });
    
    res.json({ 
      success: true, 
      message: 'Session resumed' 
    });
    
  } catch (error) {
    console.error('❌ Error resuming session:', error);
    res.status(500).json({ error: 'Failed to resume session' });
  }
});

app.post('/api/table/:id/stop', async (req, res) => {
  try {
    const tableId = parseInt(req.params.id);
    const { payment_method = 'CASH', discount_percent = 0 } = req.body;
    
    const db = await getDB();
    const table = await db.get('SELECT * FROM tables WHERE id = ?', tableId);
    const session = await db.get(`
      SELECT * FROM sessions 
      WHERE table_id = ? AND end_time IS NULL 
      ORDER BY id DESC LIMIT 1
    `, tableId);
    
    if (!table || !session) {
      return res.status(404).json({ error: 'Table or active session not found' });
    }
    
    const endTime = now();
    const additionalMs = session.last_resume_time ? (endTime - session.last_resume_time) : 0;
    const totalDurationMs = (session.duration_ms || 0) + additionalMs;
    const billedMinutes = Math.max(0, ceilToMinute(totalDurationMs));
    const ratePerMinute = table.hourly_rate / 60;
    const baseAmount = Math.round(billedMinutes * ratePerMinute);
    const discountAmount = Math.round(baseAmount * (discount_percent / 100));
    const finalAmount = session.is_friendly ? 0 : (baseAmount - discountAmount);
    
    // Update session
    await db.run(`
      UPDATE sessions SET 
        end_time = ?,
        duration_ms = ?,
        billed_minutes = ?,
        amount = ?,
        payment_method = ?,
        discount_percent = ?,
        payment_status = 'PAID'
      WHERE id = ?
    `, endTime, totalDurationMs, billedMinutes, finalAmount, payment_method, discount_percent, session.id);
    
    // Update table
    await db.run('UPDATE tables SET status = "AVAILABLE", light_on = 0 WHERE id = ?', tableId);
    
    // Update customer total spent
    if (session.customer_phone) {
      await db.run(`
        UPDATE customers SET total_spent = total_spent + ? 
        WHERE phone = ?
      `, finalAmount, session.customer_phone);
    }
    
    // Update daily summary
    const today = new Date().toISOString().slice(0, 10);
    const existingSummary = await db.get('SELECT * FROM daily_summaries WHERE date = ?', today);
    
    const earningsField = table.type === 'ENGLISH' ? 'english_earnings' : 'french_earnings';
    const paymentField = `${payment_method.toLowerCase()}_earnings`;
    
    if (!existingSummary) {
      await db.run(`
        INSERT INTO daily_summaries (
          date, total_earnings, total_sessions, friendly_games,
          english_earnings, french_earnings, cash_earnings, upi_earnings, card_earnings
        ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
      `, today, finalAmount, session.is_friendly ? 1 : 0,
         table.type === 'ENGLISH' ? finalAmount : 0,
         table.type === 'FRENCH' ? finalAmount : 0,
         payment_method === 'CASH' ? finalAmount : 0,
         payment_method === 'UPI' ? finalAmount : 0,
         payment_method === 'CARD' ? finalAmount : 0);
    } else {
      await db.run(`
        UPDATE daily_summaries SET 
          total_earnings = total_earnings + ?,
          total_sessions = total_sessions + 1,
          friendly_games = friendly_games + ?,
          ${earningsField} = ${earningsField} + ?,
          ${paymentField} = ${paymentField} + ?
        WHERE date = ?
      `, finalAmount, session.is_friendly ? 1 : 0, finalAmount, finalAmount, today);
    }
    
    const finalSession = await db.get('SELECT * FROM sessions WHERE id = ?', session.id);
    const updatedTable = await db.get('SELECT * FROM tables WHERE id = ?', tableId);
    
    // Hardware integration
    await controlTableLight(tableId, false);
    
    broadcast('session:stop', { session: finalSession, table: updatedTable });
    
    res.json({ 
      success: true,
      session: finalSession, 
      table: updatedTable,
      receipt: {
        amount: finalAmount,
        duration: formatDuration(totalDurationMs),
        minutes: billedMinutes,
        rate: `₹${table.hourly_rate}/hr`,
        discount: discount_percent > 0 ? `${discount_percent}%` : null
      }
    });
    
  } catch (error) {
    console.error('❌ Error stopping session:', error);
    res.status(500).json({ error: 'Failed to stop session' });
  }
});

// Hardware integration functions
async function controlTableLight(tableId, on) {
  if (process.env.HARDWARE_ENABLED !== 'true') return;
  
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(`http://${process.env.ARDUINO_HOST}/light/${tableId}/${on ? 'on' : 'off'}`, {
      method: 'POST',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    const db = await getDB();
    await db.run(`
      INSERT INTO hardware_logs (table_id, action, status, response_time_ms)
      VALUES (?, ?, ?, ?)
    `, tableId, `light_${on ? 'on' : 'off'}`, response.ok ? 1 : 0, Date.now() - start);
    
  } catch (error) {
    // Only log hardware errors in development mode to reduce noise
    if (process.env.NODE_ENV === 'development') {
      console.log(`⚠️ Hardware not available for table ${tableId} (${error.name})`);
    }
    
    try {
      const db = await getDB();
      await db.run(`
        INSERT INTO hardware_logs (table_id, action, status, error_message)
        VALUES (?, ?, 0, ?)
      `, tableId, `light_${on ? 'on' : 'off'}`, error.name || error.message);
    } catch (dbError) {
      // Ignore database errors for hardware logs
    }
  }
}

// Reports and analytics
app.get('/api/summary/today', async (req, res) => {
  try {
    const db = await getDB();
    const today = new Date().toISOString().slice(0, 10);
    
    const summary = await db.get('SELECT * FROM daily_summaries WHERE date = ?', today);
    
    // Get real-time data for active sessions
    const activeSessions = await db.all(`
      SELECT s.*, t.hourly_rate, t.type 
      FROM sessions s 
      JOIN tables t ON s.table_id = t.id 
      WHERE s.end_time IS NULL
    `);
    
    let activeEarnings = 0;
    for (const session of activeSessions) {
      if (!session.is_friendly) {
        const elapsed = now() - (session.last_resume_time || session.start_time);
        const totalMs = (session.duration_ms || 0) + elapsed - (session.paused_ms || 0);
        const minutes = Math.max(0, ceilToMinute(totalMs));
        activeEarnings += Math.round(minutes * (session.hourly_rate / 60));
      }
    }
    
    const result = summary || { 
      date: today, 
      total_earnings: 0, 
      total_sessions: 0, 
      friendly_games: 0,
      english_earnings: 0,
      french_earnings: 0,
      cash_earnings: 0,
      upi_earnings: 0,
      card_earnings: 0
    };
    
    res.json({
      ...result,
      active_earnings: activeEarnings,
      active_sessions: activeSessions.length,
      projected_earnings: result.total_earnings + activeEarnings
    });
    
  } catch (error) {
    console.error('❌ Error fetching today summary:', error);
    res.status(500).json({ error: 'Failed to fetch today summary' });
  }
});

app.get('/api/sessions', async (req, res) => {
  try {
    const { date, limit = 50, offset = 0, customer_phone } = req.query;
    const db = await getDB();
    
    let query = 'SELECT s.*, t.type as table_type FROM sessions s JOIN tables t ON s.table_id = t.id';
    let params = [];
    let conditions = [];
    
    if (date) {
      const startTime = new Date(date + 'T00:00:00Z').getTime();
      const endTime = startTime + 24 * 60 * 60 * 1000;
      conditions.push('s.start_time >= ? AND s.start_time < ?');
      params.push(startTime, endTime);
    }
    
    if (customer_phone) {
      conditions.push('s.customer_phone = ?');
      params.push(customer_phone);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY s.start_time DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const sessions = await db.all(query, ...params);
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM sessions s';
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }
    const countResult = await db.get(countQuery, ...params.slice(0, -2));
    
    res.json({
      sessions,
      total: countResult.total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      has_more: countResult.total > parseInt(offset) + parseInt(limit)
    });
    
  } catch (error) {
    console.error('❌ Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

app.get('/api/customers', async (req, res) => {
  try {
    const { search, limit = 20 } = req.query;
    const db = await getDB();
    
    let query = 'SELECT * FROM customers';
    let params = [];
    
    if (search) {
      query += ' WHERE name LIKE ? OR phone LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ' ORDER BY last_visit DESC LIMIT ?';
    params.push(parseInt(limit));
    
    const customers = await db.all(query, ...params);
    res.json(customers);
    
  } catch (error) {
    console.error('❌ Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// CSV Export
app.get('/api/reports/daily.csv', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const startTime = new Date(date + 'T00:00:00Z').getTime();
    const endTime = startTime + 24 * 60 * 60 * 1000;
    
    const db = await getDB();
    const sessions = await db.all(`
      SELECT s.*, t.type as table_type 
      FROM sessions s 
      JOIN tables t ON s.table_id = t.id 
      WHERE s.start_time >= ? AND s.start_time < ? 
      ORDER BY s.table_id, s.start_time
    `, startTime, endTime);
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="daily-report-${date}.csv"`);
    
    // CSV Header
    const headers = [
      'Session ID', 'Table', 'Table Type', 'Customer Name', 'Customer Phone',
      'Start Time', 'End Time', 'Duration (min)', 'Amount', 'Payment Method',
      'Friendly Game', 'Discount %', 'Break Count', 'Notes'
    ].join(',');
    
    res.write(headers + '\n');
    
    // CSV Data
    for (const session of sessions) {
      const row = [
        session.id,
        session.table_id,
        session.table_type,
        session.customer_name || '',
        session.customer_phone || '',
        new Date(session.start_time).toLocaleString(),
        session.end_time ? new Date(session.end_time).toLocaleString() : 'Active',
        session.billed_minutes || 0,
        session.amount || 0,
        session.payment_method || 'CASH',
        session.is_friendly ? 'Yes' : 'No',
        session.discount_percent || 0,
        session.break_count || 0,
        (session.notes || '').replace(/,/g, ';')
      ].join(',');
      
      res.write(row + '\n');
    }
    
    res.end();
    
  } catch (error) {
    console.error('❌ Error generating CSV report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Admin routes
app.patch('/api/session/:id', adminAuth, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const allowedFields = [
      'end_time', 'duration_ms', 'billed_minutes', 'amount', 'is_friendly',
      'customer_name', 'customer_phone', 'notes', 'payment_method', 
      'payment_status', 'discount_percent'
    ];
    
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    const db = await getDB();
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(sessionId);
    
    await db.run(`UPDATE sessions SET ${setClause} WHERE id = ?`, ...values);
    
    const updatedSession = await db.get('SELECT * FROM sessions WHERE id = ?', sessionId);
    broadcast('session:update', updatedSession);
    
    res.json(updatedSession);
    
  } catch (error) {
    console.error('❌ Error updating session:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

app.post('/api/admin/backup', adminAuth, async (req, res) => {
  try {
    const backupPath = await backupDatabase();
    res.json({ 
      success: true, 
      message: 'Database backup created', 
      path: backupPath 
    });
  } catch (error) {
    console.error('❌ Backup failed:', error);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

// Hardware integration endpoints
app.post('/api/lights/:id/toggle', authenticateToken, async (req, res) => {
  try {
    const tableId = parseInt(req.params.id);
    const { on } = req.body;
    
    const db = await getDB();
    const table = await db.get('SELECT * FROM tables WHERE id = ?', tableId);
    
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    // Update light status
    await db.run('UPDATE tables SET light_on = ? WHERE id = ?', on ? 1 : 0, tableId);
    
    // Auto session management based on light control
    if (on && table.status !== 'OCCUPIED') {
      // Auto-start session when light turns on
      const startTime = now();
      const sessionResult = await db.run(`
        INSERT INTO sessions (table_id, start_time, is_friendly, last_resume_time) 
        VALUES (?, ?, 0, ?)
      `, tableId, startTime, startTime);
      
      await db.run('UPDATE tables SET status = "OCCUPIED" WHERE id = ?', tableId);
      
      broadcast('session:auto_start', {
        table_id: tableId,
        session_id: sessionResult.lastID
      });
    }
    
    if (!on && table.status === 'OCCUPIED') {
      // Auto-stop session when light turns off
      const session = await db.get(`
        SELECT * FROM sessions
        WHERE table_id = ? AND end_time IS NULL
        ORDER BY id DESC LIMIT 1
      `, tableId);
      
      if (session) {
        const endTime = now();
        const additionalMs = session.last_resume_time ? (endTime - session.last_resume_time) : 0;
        const totalMs = (session.duration_ms || 0) + additionalMs;
        const minutes = Math.max(0, ceilToMinute(totalMs));
        const amount = session.is_friendly ? 0 : Math.round(minutes * (table.hourly_rate / 60));
        
        await db.run(`
          UPDATE sessions SET
            end_time = ?, duration_ms = ?, billed_minutes = ?, amount = ?
          WHERE id = ?
        `, endTime, totalMs, minutes, amount, session.id);
        
        await db.run('UPDATE tables SET status = "AVAILABLE" WHERE id = ?', tableId);
        
        // Update daily summary
        const today = new Date().toISOString().slice(0, 10);
        const summary = await db.get('SELECT * FROM daily_summaries WHERE date = ?', today);
        
        if (!summary) {
          await db.run(`
            INSERT INTO daily_summaries (date, total_earnings, total_sessions, friendly_games)
            VALUES (?, ?, 1, ?)
          `, today, amount, session.is_friendly ? 1 : 0);
        } else {
          await db.run(`
            UPDATE daily_summaries SET
              total_earnings = total_earnings + ?,
              total_sessions = total_sessions + 1,
              friendly_games = friendly_games + ?
            WHERE date = ?
          `, amount, session.is_friendly ? 1 : 0, today);
        }
        
        broadcast('session:auto_stop', { table_id: tableId, session_id: session.id });
      }
    }
    
    // Hardware control
    await controlTableLight(tableId, on);
    
    const updatedTable = await db.get('SELECT * FROM tables WHERE id = ?', tableId);
    broadcast('table:update', updatedTable);
    
    res.json(updatedTable);
    
  } catch (error) {
    console.error('❌ Error toggling light:', error);
    res.status(500).json({ error: 'Failed to toggle light' });
  }
});

// Static files - serve the web interface
app.use('/', express.static(path.join(__dirname, '../web')));

// Global error handler
app.use((error, req, res, next) => {
  console.error('🚨 Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  // Close all SSE connections
  for (const client of clients) {
    try {
      client.res.write('event: shutdown\ndata: {"message":"Server shutting down"}\n\n');
      client.res.end();
    } catch (error) {
      // Ignore errors when closing connections
    }
  }
  clients.clear();
  
  // Close database
  try {
    await closeDB();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error closing database:', error);
  }
  
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeDB();
  process.exit(0);
});

// Start server
const runMigrations = process.argv.includes('--migrate') || process.env.NODE_ENV !== 'production';

async function startServer() {
  try {
    if (runMigrations) {
      await migrate();
    }
    
    const server = app.listen(PORT, () => {
      console.log(`🎱 Snooker Parlor Server v2.0.0`);
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔧 Hardware integration: ${process.env.HARDWARE_ENABLED === 'true' ? 'Enabled' : 'Disabled'}`);
      console.log(`📡 Real-time clients: ${clients.size}`);
    });

    // Graceful shutdown handling
    server.on('close', async () => {
      await closeDB();
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();