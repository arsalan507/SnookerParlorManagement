import jwt from 'jsonwebtoken';

// Simple tables data for demo
const tables = [
  { id: 1, type: 'ENGLISH', hourly_rate: 300, status: 'AVAILABLE', light_on: 0, running_amount: 0, active_session: null },
  { id: 2, type: 'ENGLISH', hourly_rate: 300, status: 'AVAILABLE', light_on: 0, running_amount: 0, active_session: null },
  { id: 3, type: 'FRENCH', hourly_rate: 200, status: 'AVAILABLE', light_on: 0, running_amount: 0, active_session: null },
  { id: 4, type: 'FRENCH', hourly_rate: 200, status: 'AVAILABLE', light_on: 0, running_amount: 0, active_session: null }
];

// Authentication middleware
function authenticateToken(req) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    throw new Error('Access token required');
  }

  const JWT_SECRET = process.env.JWT_SECRET || 'cue-master-pro-super-secret-jwt-key-2025-snooker-management';
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = authenticateToken(req);
    
    // Return tables data
    return res.status(200).json(tables);
    
  } catch (error) {
    console.error('❌ Tables API error:', error);
    return res.status(401).json({ 
      error: error.message || 'Authentication failed'
    });
  }
}