// Customers API endpoints
import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'snooker-parlor-secret-key-change-in-production';
const router = express.Router();

// Simple in-memory customers store for demo
let customers = [
  {
    id: 1,
    name: 'John Doe',
    phone: '+91 9876543210',
    email: 'john@example.com',
    membership_type: 'REGULAR',
    membership_status: 'ACTIVE',
    membership_start_date: '2024-01-01',
    membership_expiry_date: '2025-01-01',
    loyalty_points: 150,
    total_spent: 4500,
    date_of_birth: '1990-05-15',
    address: '123 Main St, City',
    emergency_contact: '+91 9876543211',
    notes: 'Regular customer',
    created_at: '2024-01-01T00:00:00Z',
    last_visit: '2024-12-01T10:00:00Z'
  },
  {
    id: 2,
    name: 'Jane Smith',
    phone: '+91 9876543211',
    email: 'jane@example.com',
    membership_type: 'VIP',
    membership_status: 'ACTIVE',
    membership_start_date: '2024-02-01',
    membership_expiry_date: '2025-02-01',
    loyalty_points: 300,
    total_spent: 12000,
    date_of_birth: '1985-08-20',
    address: '456 Oak Ave, City',
    emergency_contact: '+91 9876543212',
    notes: 'VIP member',
    created_at: '2024-02-01T00:00:00Z',
    last_visit: '2024-12-02T14:30:00Z'
  },
  {
    id: 3,
    name: 'Bob Johnson',
    phone: '+91 9876543212',
    email: 'bob@example.com',
    membership_type: 'PREMIUM',
    membership_status: 'ACTIVE',
    membership_start_date: '2024-03-01',
    membership_expiry_date: '2025-03-01',
    loyalty_points: 500,
    total_spent: 25000,
    date_of_birth: '1975-12-10',
    address: '789 Pine Rd, City',
    emergency_contact: '+91 9876543213',
    notes: 'Premium member',
    created_at: '2024-03-01T00:00:00Z',
    last_visit: '2024-12-03T16:45:00Z'
  }
];

// Simple sessions data for analytics
let sessions = [
  {
    id: 1,
    customer_id: 1,
    table_id: 1,
    table_type: 'ENGLISH',
    start_time: '2024-12-01T10:00:00Z',
    end_time: '2024-12-01T12:00:00Z',
    billed_minutes: 120,
    amount: 600,
    is_friendly: false,
    payment_method: 'CASH'
  },
  {
    id: 2,
    customer_id: 1,
    table_id: 2,
    table_type: 'ENGLISH',
    start_time: '2024-11-28T14:00:00Z',
    end_time: '2024-11-28T16:30:00Z',
    billed_minutes: 150,
    amount: 750,
    is_friendly: false,
    payment_method: 'UPI'
  },
  {
    id: 3,
    customer_id: 2,
    table_id: 3,
    table_type: 'FRENCH',
    start_time: '2024-12-02T14:30:00Z',
    end_time: '2024-12-02T17:00:00Z',
    billed_minutes: 150,
    amount: 500,
    is_friendly: false,
    payment_method: 'CARD'
  }
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
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Get all customers with optional filtering
router.get('/', authenticateToken, (req, res) => {
  try {
    let filteredCustomers = [...customers];

    // Filter by membership type
    if (req.query.membership_type) {
      const types = req.query.membership_type.split(',');
      filteredCustomers = filteredCustomers.filter(customer =>
        types.includes(customer.membership_type)
      );
    }

    // Filter by search query
    if (req.query.search) {
      const searchTerm = req.query.search.toLowerCase();
      filteredCustomers = filteredCustomers.filter(customer =>
        customer.name.toLowerCase().includes(searchTerm) ||
        customer.phone.includes(searchTerm)
      );
    }

    // Sort by last visit
    filteredCustomers.sort((a, b) => new Date(b.last_visit) - new Date(a.last_visit));

    // Limit results
    const limit = parseInt(req.query.limit) || 20;
    filteredCustomers = filteredCustomers.slice(0, limit);

    res.json(filteredCustomers);
  } catch (error) {
    console.error('❌ Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Get customer by ID
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const customer = customers.find(c => c.id === customerId);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(customer);
  } catch (error) {
    console.error('❌ Error fetching customer:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

// Get customer analytics
router.get('/:id/analytics', authenticateToken, (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const customer = customers.find(c => c.id === customerId);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get customer's sessions
    const customerSessions = sessions.filter(s => s.customer_id === customerId);

    // Calculate analytics
    const totalSessions = customerSessions.length;
    const paidSessions = customerSessions.filter(s => !s.is_friendly).length;
    const friendlySessions = customerSessions.filter(s => s.is_friendly).length;
    const totalSpent = customerSessions.reduce((sum, s) => sum + (s.amount || 0), 0);
    const totalDuration = customerSessions.reduce((sum, s) => sum + (s.billed_minutes || 0), 0);
    const avgSessionDuration = totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0;
    const avgSpendingPerSession = totalSessions > 0 ? Math.round(totalSpent / totalSessions) : 0;

    // Calculate streak data (simplified - last 90 days)
    const streakData = {};
    const today = new Date();
    for (let i = 89; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().slice(0, 10);

      const sessionsOnDate = customerSessions.filter(s =>
        s.start_time.startsWith(dateKey)
      ).length;

      streakData[dateKey] = sessionsOnDate;
    }

    // Calculate current and max streak
    let currentStreak = 0;
    let maxStreak = 0;
    let tempStreak = 0;

    Object.values(streakData).reverse().forEach(count => {
      if (count > 0) {
        tempStreak++;
        maxStreak = Math.max(maxStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    });

    // Find the most recent session date for current streak
    const sortedDates = Object.keys(streakData).sort().reverse();
    for (const date of sortedDates) {
      if (streakData[date] > 0) {
        currentStreak++;
      } else if (currentStreak > 0) {
        break;
      }
    }

    // Table usage stats
    const tableUsage = {};
    customerSessions.forEach(session => {
      if (!tableUsage[session.table_type]) {
        tableUsage[session.table_type] = {
          sessions: 0,
          total_spent: 0,
          total_duration: 0
        };
      }
      tableUsage[session.table_type].sessions++;
      tableUsage[session.table_type].total_spent += session.amount || 0;
      tableUsage[session.table_type].total_duration += session.billed_minutes || 0;
    });

    // Monthly spending (last 12 months)
    const monthlySpending = {};
    const last12Months = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      last12Months.push(monthKey);
      monthlySpending[monthKey] = 0;
    }

    customerSessions.forEach(session => {
      const sessionDate = new Date(session.start_time);
      const monthKey = `${sessionDate.getFullYear()}-${String(sessionDate.getMonth() + 1).padStart(2, '0')}`;
      if (monthlySpending.hasOwnProperty(monthKey)) {
        monthlySpending[monthKey] += session.amount || 0;
      }
    });

    // Hourly stats
    const hourlyStats = {};
    for (let i = 0; i < 24; i++) {
      hourlyStats[i] = 0;
    }

    customerSessions.forEach(session => {
      const hour = new Date(session.start_time).getHours();
      hourlyStats[hour]++;
    });

    // Recent sessions (last 10)
    const recentSessions = customerSessions
      .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
      .slice(0, 10);

    const analytics = {
      customer: customer,
      analytics: {
        total_sessions: totalSessions,
        paid_sessions: paidSessions,
        friendly_sessions: friendlySessions,
        total_spent: totalSpent,
        avg_session_duration: avgSessionDuration,
        avg_spending_per_session: avgSpendingPerSession,
        current_streak: currentStreak,
        max_streak: maxStreak,
        loyalty_points: customer.loyalty_points,
        table_usage: tableUsage,
        monthly_spending: monthlySpending,
        hourly_stats: hourlyStats
      },
      streak_data: streakData,
      recent_sessions: recentSessions
    };

    res.json(analytics);
  } catch (error) {
    console.error('❌ Error fetching customer analytics:', error);
    res.status(500).json({ error: 'Failed to fetch customer analytics' });
  }
});

// Create new customer
router.post('/', authenticateToken, (req, res) => {
  try {
    const newCustomer = {
      id: customers.length + 1,
      ...req.body,
      created_at: new Date().toISOString(),
      last_visit: new Date().toISOString()
    };

    customers.push(newCustomer);
    res.status(201).json(newCustomer);
  } catch (error) {
    console.error('❌ Error creating customer:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Update customer
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const customerIndex = customers.findIndex(c => c.id === customerId);

    if (customerIndex === -1) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    customers[customerIndex] = {
      ...customers[customerIndex],
      ...req.body,
      id: customerId // Ensure ID doesn't change
    };

    res.json(customers[customerIndex]);
  } catch (error) {
    console.error('❌ Error updating customer:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// Delete customer
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const customerIndex = customers.findIndex(c => c.id === customerId);

    if (customerIndex === -1) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    customers.splice(customerIndex, 1);
    res.json({ success: true, message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting customer:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

export default router;