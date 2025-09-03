// Authentication Manager
class AuthManager {
  constructor() {
    this.token = localStorage.getItem('auth_token');
    this.user = JSON.parse(localStorage.getItem('user_data') || '{}');
    this.sessionId = localStorage.getItem('session_id');
  }
  
  isAuthenticated() {
    return !!this.token;
  }
  
  isAdmin() {
    return this.user.role === 'admin';
  }
  
  getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }
  
  async logout() {
    try {
      if (this.sessionId) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify({ sessionId: this.sessionId })
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_data');
      localStorage.removeItem('session_id');
      window.location.href = '/login.html';
    }
  }
  
  handleAuthError() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    localStorage.removeItem('session_id');
    window.location.href = '/login.html';
  }
}

// App State Management
class AppState {
  constructor() {
    this.auth = new AuthManager();
    this.tables = [];
    this.sessions = [];
    this.todaySummary = {};
    this.eventSource = null;
    this.isOnline = false;
    this.currentPage = 1;
    this.sessionsPerPage = 50;
    this.selectedDate = null;
    this.timers = new Map();
    
    // Check authentication
    if (!this.auth.isAuthenticated()) {
      window.location.href = '/login.html';
      return;
    }
    
    // Bind methods
    this.init = this.init.bind(this);
    this.loadData = this.loadData.bind(this);
    this.setupEventSource = this.setupEventSource.bind(this);
    this.handleRealtimeEvent = this.handleRealtimeEvent.bind(this);
  }
  
  async init() {
    console.log('🎱 Initializing Snooker Parlor App...');
    
    try {
      // Setup user interface
      this.setupUserInterface();
      
      // Load initial data
      await this.loadData();
      
      // Setup real-time updates
      this.setupEventSource();
      
      // Start UI updates
      this.startPeriodicUpdates();
      
      console.log('✅ App initialized successfully');
      
      // Hide loading screen
      document.getElementById('loading-screen').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      
    } catch (error) {
      console.error('❌ App initialization failed:', error);
      this.showToast('Failed to initialize app', 'error');
    }
  }
  
  setupUserInterface() {
    // Populate user information
    const user = this.auth.user;
    document.getElementById('user-name').textContent = user.username || 'User';
    document.getElementById('user-role').textContent = user.role || 'employee';
    document.getElementById('user-full-name').textContent = user.full_name || user.username || 'User';
    document.getElementById('user-email').textContent = user.email || 'No email';
    
    // Set role-specific styling
    const roleElement = document.getElementById('user-role');
    if (user.role === 'admin') {
      roleElement.classList.add('admin');
    }
    
    // Show/hide admin-only elements
    if (this.auth.isAdmin()) {
      document.getElementById('settings-btn').style.display = 'inline-block';
    }
    
    // Setup user menu toggle
    const userMenuBtn = document.getElementById('user-menu-btn');
    const userDropdown = document.getElementById('user-dropdown');
    
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('show');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      userDropdown.classList.remove('show');
    });
    
    // Prevent dropdown from closing when clicking inside
    userDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
  
  async loadData() {
    try {
      const headers = this.auth.getAuthHeaders();
      const [tablesRes, summaryRes, sessionsRes] = await Promise.all([
        fetch('/api/tables', { headers }),
        fetch('/api/summary/today', { headers }),
        fetch('/api/sessions?limit=' + this.sessionsPerPage, { headers })
      ]);
      
      // Check for authentication errors
      if (tablesRes.status === 401 || summaryRes.status === 401 || sessionsRes.status === 401) {
        this.auth.handleAuthError();
        return;
      }
      
      if (tablesRes.ok) {
        this.tables = await tablesRes.json();
        this.renderTables();
      }
      
      if (summaryRes.ok) {
        this.todaySummary = await summaryRes.json();
        this.updateStats();
      }
      
      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        this.sessions = data.sessions || [];
        this.renderSessions();
      }
      
    } catch (error) {
      console.error('❌ Failed to load data:', error);
      this.showToast('Failed to load data', 'error');
    }
  }
  
  setupEventSource() {
    if (this.eventSource) {
      this.eventSource.close();
    }
    
    try {
      this.eventSource = new EventSource('/api/events');
      
      this.eventSource.addEventListener('open', () => {
        console.log('📡 Connected to real-time updates');
        this.isOnline = true;
        this.updateConnectionStatus();
      });
      
      this.eventSource.addEventListener('error', (e) => {
        console.error('📡 Connection error:', e);
        this.isOnline = false;
        this.updateConnectionStatus();
        
        // Reconnect after 5 seconds
        setTimeout(() => {
          if (this.eventSource.readyState === EventSource.CLOSED) {
            this.setupEventSource();
          }
        }, 5000);
      });
      
      this.eventSource.addEventListener('connected', this.handleRealtimeEvent);
      this.eventSource.addEventListener('table:update', this.handleRealtimeEvent);
      this.eventSource.addEventListener('session:start', this.handleRealtimeEvent);
      this.eventSource.addEventListener('session:stop', this.handleRealtimeEvent);
      this.eventSource.addEventListener('session:pause', this.handleRealtimeEvent);
      this.eventSource.addEventListener('session:resume', this.handleRealtimeEvent);
      this.eventSource.addEventListener('session:update', this.handleRealtimeEvent);
      this.eventSource.addEventListener('heartbeat', () => {
        this.isOnline = true;
        this.updateConnectionStatus();
      });
      
    } catch (error) {
      console.error('❌ Failed to setup EventSource:', error);
      this.isOnline = false;
      this.updateConnectionStatus();
    }
  }
  
  handleRealtimeEvent(event) {
    try {
      const data = JSON.parse(event.data);
      console.log('📡 Real-time event:', event.type, data);
      
      switch (event.type) {
        case 'table:update':
          this.updateTable(data);
          break;
        case 'session:start':
        case 'session:stop':
        case 'session:pause':
        case 'session:resume':
          this.handleSessionEvent(event.type, data);
          break;
        case 'session:update':
          this.updateSession(data);
          break;
        default:
          console.log('📡 Unhandled event:', event.type);
      }
      
      // Refresh data periodically to stay in sync
      if (['session:start', 'session:stop'].includes(event.type)) {
        setTimeout(() => this.loadData(), 1000);
      }
      
    } catch (error) {
      console.error('❌ Failed to handle real-time event:', error);
    }
  }
  
  updateTable(tableData) {
    const index = this.tables.findIndex(t => t.id === tableData.id);
    if (index !== -1) {
      this.tables[index] = tableData;
      this.renderTables();
    }
  }
  
  handleSessionEvent(eventType, data) {
    this.showToast(this.getSessionEventMessage(eventType, data), 'info');
    
    // Update timers
    if (eventType === 'session:start' && data.session) {
      this.startTimer(data.session.table_id, data.session.start_time);
    } else if (eventType === 'session:stop' && data.session) {
      this.stopTimer(data.session.table_id);
    }
    
    // Refresh data
    this.loadData();
  }
  
  getSessionEventMessage(eventType, data) {
    const tableId = data.table_id || data.session?.table_id;
    const messages = {
      'session:start': `🎯 Session started on Table ${tableId}`,
      'session:stop': `🛑 Session stopped on Table ${tableId}`,
      'session:pause': `⏸ Session paused on Table ${tableId}`,
      'session:resume': `▶ Session resumed on Table ${tableId}`
    };
    return messages[eventType] || 'Session updated';
  }
  
  updateConnectionStatus() {
    const statusEl = document.getElementById('connection-status');
    const dotEl = statusEl.querySelector('.status-dot');
    const textEl = statusEl.querySelector('.status-text');
    
    if (this.isOnline) {
      dotEl.className = 'status-dot online';
      textEl.textContent = 'Connected';
    } else {
      dotEl.className = 'status-dot offline';
      textEl.textContent = 'Offline';
    }
  }
  
  startPeriodicUpdates() {
    // Update clock every second
    setInterval(() => {
      this.updateClock();
    }, 1000);
    
    // Update running sessions every 30 seconds
    setInterval(() => {
      if (this.isOnline) {
        this.updateRunningTimers();
      }
    }, 30000);
    
    // Refresh all data every 5 minutes
    setInterval(() => {
      if (this.isOnline) {
        this.loadData();
      }
    }, 300000);
  }
  
  updateClock() {
    const clockEl = document.getElementById('live-clock');
    if (clockEl) {
      clockEl.textContent = new Date().toLocaleTimeString();
    }
  }
  
  startTimer(tableId, startTime) {
    if (this.timers.has(tableId)) {
      clearInterval(this.timers.get(tableId));
    }
    
    const timer = setInterval(() => {
      this.updateTableTimer(tableId, startTime);
    }, 1000);
    
    this.timers.set(tableId, timer);
  }
  
  stopTimer(tableId) {
    if (this.timers.has(tableId)) {
      clearInterval(this.timers.get(tableId));
      this.timers.delete(tableId);
    }
  }
  
  updateTableTimer(tableId, startTime) {
    const table = this.tables.find(t => t.id === tableId);
    if (!table || table.status !== 'OCCUPIED') {
      this.stopTimer(tableId);
      return;
    }
    
    const elapsed = Date.now() - startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const duration = `${Math.floor(minutes / 60)}:${(minutes % 60).toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    const timerEl = document.querySelector(`[data-table-id="${tableId}"] .session-timer`);
    if (timerEl) {
      timerEl.textContent = duration;
    }
  }
  
  updateRunningTimers() {
    for (const table of this.tables) {
      if (table.status === 'OCCUPIED' && table.active_session) {
        this.updateTableTimer(table.id, table.active_session.start_time);
      }
    }
  }
  
  updateStats() {
    const summary = this.todaySummary;
    
    // Total earnings
    document.getElementById('total-earnings').textContent = 
      `₹${(summary.total_earnings || 0).toLocaleString('en-IN')}`;
    
    // Breakdown
    const english = summary.english_earnings || 0;
    const french = summary.french_earnings || 0;
    document.getElementById('earnings-breakdown').textContent = 
      `EN: ₹${english.toLocaleString('en-IN')} | FR: ₹${french.toLocaleString('en-IN')}`;
    
    // Sessions
    const total = summary.total_sessions || 0;
    const friendly = summary.friendly_games || 0;
    document.getElementById('session-count').textContent = 
      `${total} (${friendly} friendly)`;
    
    // Active sessions
    const active = this.tables.filter(t => t.status === 'OCCUPIED').length;
    document.getElementById('active-sessions').textContent = active.toString();
  }
  
  renderTables() {
    const container = document.getElementById('tables-grid');
    if (!container) return;
    
    container.innerHTML = '';
    
    for (const table of this.tables.sort((a, b) => a.id - b.id)) {
      const card = this.createTableCard(table);
      container.appendChild(card);
    }
  }
  
  createTableCard(table) {
    const card = document.createElement('div');
    card.className = `table-card ${table.status.toLowerCase()} ${table.type.toLowerCase()}`;
    card.setAttribute('data-table-id', table.id);
    
    const isOccupied = table.status === 'OCCUPIED';
    const session = table.active_session;
    
    card.innerHTML = `
      <div class="table-header">
        <div class="table-number">Table ${table.id}</div>
        <div class="table-type ${table.type.toLowerCase()}">${table.type}</div>
      </div>
      
      <div class="table-status">
        <div class="status-badge ${table.status.toLowerCase()}">${table.status}</div>
        <div class="light-indicator ${table.light_on ? 'on' : ''}" title="Light ${table.light_on ? 'ON' : 'OFF'}"></div>
      </div>
      
      <div class="table-info">
        <div class="rate-display">₹${table.hourly_rate}/hr</div>
        
        ${isOccupied && session ? `
          <div class="session-details">
            <div class="session-timer">00:00:00</div>
            <div class="running-amount">₹${(table.running_amount || 0).toLocaleString('en-IN')}</div>
            ${session.customer_name ? `
              <div class="customer-info">
                ${session.customer_name}
                ${session.is_friendly ? '(Friendly)' : ''}
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
      
      <div class="table-actions">
        ${this.getTableActions(table)}
      </div>
    `;
    
    // Start timer if occupied
    if (isOccupied && session) {
      this.startTimer(table.id, session.start_time);
    }
    
    return card;
  }
  
  getTableActions(table) {
    const isOccupied = table.status === 'OCCUPIED';
    const isMaintenance = table.status === 'MAINTENANCE';
    
    if (isOccupied) {
      return `
        <button class="btn btn-warning btn-sm" onclick="app.pauseSession(${table.id})">
          ⏸ Pause
        </button>
        <button class="btn btn-success btn-sm" onclick="app.resumeSession(${table.id})">
          ▶ Resume
        </button>
        <button class="btn btn-danger btn-sm" onclick="app.showStopSessionModal(${table.id})">
          🛑 Stop
        </button>
      `;
    } else if (isMaintenance) {
      return `
        <button class="btn btn-success btn-sm" onclick="app.setTableStatus(${table.id}, 'AVAILABLE')">
          ✅ Available
        </button>
      `;
    } else {
      return `
        <button class="btn btn-primary btn-sm" onclick="app.showStartSessionModal(${table.id})">
          🎯 Start
        </button>
        <button class="btn btn-warning btn-sm" onclick="app.setTableStatus(${table.id}, 'MAINTENANCE')">
          🔧 Maintenance
        </button>
        <button class="btn btn-ghost btn-sm" onclick="app.toggleLight(${table.id}, ${!table.light_on})">
          💡 ${table.light_on ? 'OFF' : 'ON'}
        </button>
      `;
    }
  }
  
  renderSessions() {
    const tbody = document.getElementById('sessions-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (this.sessions.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center" style="padding: 2rem; color: var(--text-muted);">
            No sessions found for the selected date
          </td>
        </tr>
      `;
      return;
    }
    
    for (const session of this.sessions) {
      const row = this.createSessionRow(session);
      tbody.appendChild(row);
    }
  }
  
  createSessionRow(session) {
    const row = document.createElement('tr');
    
    const startTime = new Date(session.start_time).toLocaleString();
    const endTime = session.end_time ? new Date(session.end_time).toLocaleString() : 'Active';
    const duration = session.billed_minutes ? `${session.billed_minutes}m` : '-';
    const amount = session.amount ? `₹${session.amount.toLocaleString('en-IN')}` : '-';
    const customer = session.customer_name || '-';
    const paymentMethod = session.payment_method || 'CASH';
    const status = session.end_time ? 'Completed' : 'Active';
    
    row.innerHTML = `
      <td>${session.id}</td>
      <td>Table ${session.table_id} (${session.table_type || 'N/A'})</td>
      <td>${customer}</td>
      <td>${startTime}</td>
      <td>${endTime}</td>
      <td>${duration}</td>
      <td>${amount}</td>
      <td>${paymentMethod}</td>
      <td>
        <span class="badge ${session.is_friendly ? 'badge-warning' : (status === 'Active' ? 'badge-info' : 'badge-success')}">
          ${session.is_friendly ? 'Friendly' : status}
        </span>
      </td>
      <td>
        ${!session.end_time ? `
          <button class="btn btn-danger btn-sm" onclick="app.showStopSessionModal(${session.table_id})">
            Stop
          </button>
        ` : ''}
      </td>
    `;
    
    return row;
  }
  
  // Modal Management
  showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('show');
      document.body.style.overflow = 'hidden';
    }
  }
  
  hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('show');
      document.body.style.overflow = '';
    }
  }
  
  hideAllModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
      modal.classList.remove('show');
    });
    document.body.style.overflow = '';
  }
  
  // Toast Notifications
  showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    toast.innerHTML = `
      ${message}
      <div class="toast-progress"></div>
    `;
    
    container.appendChild(toast);
    
    // Show toast
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Remove toast
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => container.removeChild(toast), 300);
    }, duration);
  }
  
  // Session Management Methods
  async showStartSessionModal(tableId) {
    const table = this.tables.find(t => t.id === tableId);
    if (!table) return;
    
    document.getElementById('selected-table-id').value = tableId;
    document.getElementById('selected-table-info').innerHTML = `
      <div class="table-info-number">Table ${table.id}</div>
      <div class="table-info-details">
        <div class="table-info-type">${table.type}</div>
        <div class="table-info-rate">₹${table.hourly_rate}/hr</div>
      </div>
    `;
    
    this.showModal('start-session-modal');
  }
  
  async startSession(tableId, sessionData) {
    try {
      const response = await fetch(`/api/table/${tableId}/start`, {
        method: 'POST',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(sessionData)
      });
      
      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }
      
      if (response.ok) {
        this.showToast('Session started successfully!', 'success');
        this.hideModal('start-session-modal');
        await this.loadData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to start session', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to start session:', error);
      this.showToast('Failed to start session', 'error');
    }
  }
  
  async showStopSessionModal(tableId) {
    const table = this.tables.find(t => t.id === tableId);
    if (!table || !table.active_session) return;
    
    document.getElementById('stop-table-id').value = tableId;
    
    // Calculate session summary
    const session = table.active_session;
    const elapsed = Date.now() - session.start_time;
    const minutes = Math.ceil(elapsed / 60000);
    const baseAmount = Math.round(minutes * (table.hourly_rate / 60));
    
    document.getElementById('session-summary').innerHTML = `
      <div class="summary-row">
        <span class="summary-label">Duration:</span>
        <span class="summary-value">${minutes} minutes</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Rate:</span>
        <span class="summary-value">₹${table.hourly_rate}/hr</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Base Amount:</span>
        <span class="summary-value">₹${baseAmount.toLocaleString('en-IN')}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Total Amount:</span>
        <span class="summary-value">₹${baseAmount.toLocaleString('en-IN')}</span>
      </div>
    `;
    
    this.showModal('stop-session-modal');
  }
  
  async stopSession(tableId, paymentData) {
    try {
      const response = await fetch(`/api/table/${tableId}/stop`, {
        method: 'POST',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(paymentData)
      });
      
      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }
      
      if (response.ok) {
        const result = await response.json();
        this.showToast(`Session completed! Amount: ₹${result.receipt.amount}`, 'success');
        this.hideModal('stop-session-modal');
        await this.loadData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to stop session', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to stop session:', error);
      this.showToast('Failed to stop session', 'error');
    }
  }
  
  async pauseSession(tableId) {
    try {
      const response = await fetch(`/api/table/${tableId}/pause`, {
        method: 'POST',
        headers: this.auth.getAuthHeaders()
      });
      
      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }
      
      if (response.ok) {
        this.showToast('Session paused', 'info');
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to pause session', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to pause session:', error);
      this.showToast('Failed to pause session', 'error');
    }
  }
  
  async resumeSession(tableId) {
    try {
      const response = await fetch(`/api/table/${tableId}/resume`, {
        method: 'POST',
        headers: this.auth.getAuthHeaders()
      });
      
      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }
      
      if (response.ok) {
        this.showToast('Session resumed', 'info');
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to resume session', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to resume session:', error);
      this.showToast('Failed to resume session', 'error');
    }
  }
  
  async setTableStatus(tableId, status) {
    try {
      const response = await fetch(`/api/table/${tableId}/status`, {
        method: 'PATCH',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify({ status })
      });
      
      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }
      
      if (response.ok) {
        this.showToast(`Table ${tableId} set to ${status}`, 'success');
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to update table status', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to update table status:', error);
      this.showToast('Failed to update table status', 'error');
    }
  }
  
  async toggleLight(tableId, on) {
    try {
      const response = await fetch(`/api/lights/${tableId}/toggle`, {
        method: 'POST',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify({ on })
      });
      
      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }
      
      if (response.ok) {
        this.showToast(`Table ${tableId} light ${on ? 'ON' : 'OFF'}`, 'info');
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to toggle light', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to toggle light:', error);
      this.showToast('Failed to toggle light', 'error');
    }
  }
  
  // Utility Methods
  async exportTodayReport() {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const response = await fetch(`/api/reports/daily.csv?date=${today}`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `daily-report-${today}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        this.showToast('Report exported successfully!', 'success');
      } else {
        this.showToast('Failed to export report', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to export report:', error);
      this.showToast('Failed to export report', 'error');
    }
  }
  
  toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    const themeIcon = document.querySelector('#theme-toggle .icon');
    if (themeIcon) {
      themeIcon.textContent = newTheme === 'dark' ? '🌙' : '☀';
    }
  }
  
  async refreshData() {
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.querySelector('.icon').textContent = '⏳';
    }
    
    try {
      await this.loadData();
      this.showToast('Data refreshed!', 'success');
    } catch (error) {
      this.showToast('Failed to refresh data', 'error');
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.querySelector('.icon').textContent = '🔄';
      }
    }
  }
}

// Initialize app
const app = new AppState();

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Load saved theme
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  // Initialize app
  app.init();
  
  // Global event listeners
  setupEventListeners();
});

function setupEventListeners() {
  // Theme toggle
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    app.toggleTheme();
  });
  
  // Refresh button
  document.getElementById('refresh-btn')?.addEventListener('click', () => {
    app.refreshData();
  });
  
  // Export button
  document.getElementById('export-today')?.addEventListener('click', () => {
    app.exportTodayReport();
  });
  
  // Logout button
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    app.auth.logout();
  });
  
  // Settings button (admin only)
  document.getElementById('settings-btn')?.addEventListener('click', () => {
    window.location.href = '/settings.html';
  });
  
  // Start session form
  document.getElementById('start-session-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const tableId = document.getElementById('selected-table-id').value;
    
    const sessionData = {
      is_friendly: document.getElementById('is-friendly').checked,
      customer_name: document.getElementById('customer-name').value || null,
      customer_phone: document.getElementById('customer-phone').value || null,
      notes: document.getElementById('session-notes').value || null,
      payment_method: document.getElementById('payment-method').value || 'CASH',
      discount_percent: parseInt(document.getElementById('discount-percent').value) || 0
    };
    
    app.startSession(parseInt(tableId), sessionData);
  });
  
  // Stop session button
  document.getElementById('confirm-stop')?.addEventListener('click', () => {
    const tableId = document.getElementById('stop-table-id').value;
    const paymentMethod = document.getElementById('final-payment-method').value;
    const discount = parseInt(document.getElementById('final-discount').value) || 0;
    
    app.stopSession(parseInt(tableId), {
      payment_method: paymentMethod,
      discount_percent: discount
    });
  });
  
  // Modal close buttons
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      app.hideAllModals();
    });
  });
  
  // Modal background click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        app.hideAllModals();
      }
    });
  });
  
  // Date filter
  document.getElementById('date-filter')?.addEventListener('change', (e) => {
    app.filterSessionsByDate(e.target.value);
  });
  
  // Clear filter
  document.getElementById('clear-filter')?.addEventListener('click', () => {
    document.getElementById('date-filter').value = '';
    app.filterSessionsByDate(null);
  });
  
  // Reports modal
  document.getElementById('reports-btn')?.addEventListener('click', () => {
    app.showModal('reports-modal');
  });
  
  // Escape key to close modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      app.hideAllModals();
    }
  });
  
  // Quick actions
  document.getElementById('start-all-lights')?.addEventListener('click', async () => {
    for (const table of app.tables) {
      if (!table.light_on) {
        await app.toggleLight(table.id, true);
        await new Promise(resolve => setTimeout(resolve, 500)); // Delay between requests
      }
    }
  });
  
  document.getElementById('stop-all-lights')?.addEventListener('click', async () => {
    for (const table of app.tables) {
      if (table.light_on) {
        await app.toggleLight(table.id, false);
        await new Promise(resolve => setTimeout(resolve, 500)); // Delay between requests
      }
    }
  });
}

// Additional App Methods
AppState.prototype.filterSessionsByDate = async function(date) {
  this.selectedDate = date;
  
  try {
    const url = date ? `/api/sessions?date=${date}` : `/api/sessions?limit=${this.sessionsPerPage}`;
    const response = await fetch(url, {
      headers: this.auth.getAuthHeaders()
    });
    
    if (response.status === 401) {
      this.auth.handleAuthError();
      return;
    }
    
    if (response.ok) {
      const data = await response.json();
      this.sessions = data.sessions || [];
      this.renderSessions();
    }
  } catch (error) {
    console.error('❌ Failed to filter sessions:', error);
    this.showToast('Failed to filter sessions', 'error');
  }
};

// Service Worker registration and offline handling
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(registration => {
      console.log('✅ Service Worker registered:', registration);
      
      // Check for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            app.showToast('New version available! Refresh to update.', 'info', 10000);
          }
        });
      });
    })
    .catch(error => {
      console.error('❌ Service Worker registration failed:', error);
    });
}

// PWA install prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  // Show install button or prompt
  const installBtn = document.createElement('button');
  installBtn.textContent = '📱 Install App';
  installBtn.className = 'btn btn-primary btn-sm';
  installBtn.onclick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`PWA install prompt: ${outcome}`);
      deferredPrompt = null;
      installBtn.remove();
    }
  };
  
  document.querySelector('.topbar-controls')?.appendChild(installBtn);
});