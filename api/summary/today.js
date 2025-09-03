import jwt from 'jsonwebtoken';

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
    
    // Return today's summary
    const today = new Date().toISOString().slice(0, 10);
    
    return res.status(200).json({
      date: today,
      total_earnings: 0,
      total_sessions: 0,
      friendly_games: 0,
      english_earnings: 0,
      french_earnings: 0,
      cash_earnings: 0,
      upi_earnings: 0,
      card_earnings: 0,
      active_earnings: 0,
      active_sessions: 0,
      projected_earnings: 0
    });
    
  } catch (error) {
    console.error('❌ Summary API error:', error);
    return res.status(401).json({ 
      error: error.message || 'Authentication failed'
    });
  }
}