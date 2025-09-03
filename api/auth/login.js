const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Simple in-memory user store for Vercel demo
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

module.exports = async function handler(req, res) {
  console.log('🔐 Login function called:', req.method, req.url);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ CORS preflight handled');
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    console.log('❌ Invalid method:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📝 Request body:', req.body);
    
    const { username, password } = req.body;
    
    if (!username || !password) {
      console.log('❌ Missing credentials');
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    console.log('🔍 Looking for user:', username);
    const user = users.find(u => u.username === username && u.is_active === 1);
    
    if (!user) {
      console.log('❌ User not found:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    console.log('🔐 Verifying password for user:', user.username);
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      console.log('❌ Invalid password for user:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const JWT_SECRET = process.env.JWT_SECRET || 'cue-master-pro-super-secret-jwt-key-2025-snooker-management';
    console.log('🎫 Generating JWT token for user:', user.username);
    
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log('✅ Login successful for user:', user.username, 'Role:', user.role);
    
    return res.status(200).json({
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
    return res.status(500).json({ 
      error: 'Login failed', 
      message: error.message,
      timestamp: Date.now(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};