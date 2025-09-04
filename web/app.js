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

    // Inventory state
    this.equipment = [];
    this.consumables = [];
    this.vendors = [];
    this.transactions = [];
    this.currentInventoryTab = 'equipment';

    // Membership state
    this.members = [];
    this.membershipTiers = [];
    this.loyaltyTransactions = [];
    this.currentMembershipTab = 'members';

    // Staff state
    this.staff = [];
    this.shifts = [];
    this.attendance = [];
    this.leaveRequests = [];
    this.currentStaffTab = 'staff-list';

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

    // Load and display parlor name
    this.loadParlorName();

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

    // Listen for parlor name changes from settings
    window.addEventListener('storage', (e) => {
      if (e.key === 'parlor_name' && e.newValue) {
        this.updateDashboardHeader(e.newValue);
      }
    });

    // Refresh parlor name when page becomes visible (in case it was changed in another tab)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.loadParlorName();
      }
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

    // Clear customer form fields
    document.getElementById('customer-name').value = '';
    document.getElementById('customer-phone').value = '';
    document.getElementById('session-notes').value = '';
    document.getElementById('discount-percent').value = '0';
    document.getElementById('is-friendly').checked = false;

    // Setup autocomplete
    this.setupCustomerAutocomplete();

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

  // Customer Autocomplete Methods
  setupCustomerAutocomplete() {
    const customerNameInput = document.getElementById('customer-name');
    const suggestionsContainer = document.getElementById('customer-suggestions');

    if (!customerNameInput || !suggestionsContainer) return;

    // Remove existing event listeners
    customerNameInput.removeEventListener('input', this.handleCustomerInput);
    customerNameInput.removeEventListener('keydown', this.handleCustomerKeydown);
    customerNameInput.removeEventListener('blur', this.handleCustomerBlur);

    // Bind methods
    this.handleCustomerInput = this.handleCustomerInput.bind(this);
    this.handleCustomerKeydown = this.handleCustomerKeydown.bind(this);
    this.handleCustomerBlur = this.handleCustomerBlur.bind(this);

    // Add event listeners
    customerNameInput.addEventListener('input', this.handleCustomerInput);
    customerNameInput.addEventListener('keydown', this.handleCustomerKeydown);
    customerNameInput.addEventListener('blur', this.handleCustomerBlur);

    // Store reference to suggestions container
    this.customerSuggestionsContainer = suggestionsContainer;
    this.selectedSuggestionIndex = -1;
  }

  async handleCustomerInput(event) {
    const query = event.target.value.trim();
    const suggestionsContainer = this.customerSuggestionsContainer;

    if (query.length < 2) {
      this.hideCustomerSuggestions();
      return;
    }

    try {
      const response = await fetch(`/api/customers?search=${encodeURIComponent(query)}&limit=10`, {
        headers: this.auth.getAuthHeaders()
      });

      if (response.ok) {
        const customers = await response.json();
        this.showCustomerSuggestions(customers, query);
      }
    } catch (error) {
      console.error('❌ Failed to fetch customer suggestions:', error);
    }
  }

  handleCustomerKeydown(event) {
    const suggestions = this.customerSuggestionsContainer.querySelectorAll('.autocomplete-suggestion');

    if (!suggestions.length) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedSuggestionIndex = Math.min(this.selectedSuggestionIndex + 1, suggestions.length - 1);
        this.updateSuggestionSelection(suggestions);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.selectedSuggestionIndex = Math.max(this.selectedSuggestionIndex - 1, -1);
        this.updateSuggestionSelection(suggestions);
        break;
      case 'Enter':
        event.preventDefault();
        if (this.selectedSuggestionIndex >= 0) {
          const selectedSuggestion = suggestions[this.selectedSuggestionIndex];
          if (selectedSuggestion) {
            this.selectCustomerSuggestion(selectedSuggestion.dataset.customerId);
          }
        }
        break;
      case 'Escape':
        this.hideCustomerSuggestions();
        break;
    }
  }

  handleCustomerBlur(event) {
    // Delay hiding to allow click on suggestions
    setTimeout(() => {
      this.hideCustomerSuggestions();
    }, 150);
  }

  showCustomerSuggestions(customers, query) {
    const suggestionsContainer = this.customerSuggestionsContainer;
    suggestionsContainer.innerHTML = '';

    if (customers.length === 0) {
      suggestionsContainer.innerHTML = `
        <div class="autocomplete-suggestion">
          <div class="name">No customers found</div>
          <div class="phone">Try a different search term</div>
        </div>
      `;
    } else {
      customers.forEach(customer => {
        const suggestion = document.createElement('div');
        suggestion.className = 'autocomplete-suggestion';
        suggestion.dataset.customerId = customer.id;

        const tierClass = customer.membership_type ? customer.membership_type.toLowerCase() : 'regular';

        suggestion.innerHTML = `
          <div class="name">${this.highlightMatch(customer.name, query)}</div>
          <div class="phone">${customer.phone}</div>
          ${customer.membership_type ? `<span class="tier ${tierClass}">${customer.membership_type}</span>` : ''}
        `;

        suggestion.addEventListener('click', () => {
          this.selectCustomerSuggestion(customer.id);
        });

        suggestionsContainer.appendChild(suggestion);
      });
    }

    suggestionsContainer.classList.add('show');
    this.selectedSuggestionIndex = -1;
  }

  hideCustomerSuggestions() {
    const suggestionsContainer = this.customerSuggestionsContainer;
    if (suggestionsContainer) {
      suggestionsContainer.classList.remove('show');
    }
    this.selectedSuggestionIndex = -1;
  }

  updateSuggestionSelection(suggestions) {
    suggestions.forEach((suggestion, index) => {
      if (index === this.selectedSuggestionIndex) {
        suggestion.classList.add('active');
      } else {
        suggestion.classList.remove('active');
      }
    });
  }

  async selectCustomerSuggestion(customerId) {
    try {
      const response = await fetch(`/api/customers/${customerId}`, {
        headers: this.auth.getAuthHeaders()
      });

      if (response.ok) {
        const customer = await response.json();

        // Only populate phone number (user is already typing the name)
        document.getElementById('customer-phone').value = customer.phone;

        // Hide suggestions
        this.hideCustomerSuggestions();

        // Focus on next field
        document.getElementById('session-notes').focus();
      }
    } catch (error) {
      console.error('❌ Failed to fetch customer details:', error);
      this.showToast('Failed to load customer details', 'error');
    }
  }

  highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
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

  // ===== PARLOR NAME MANAGEMENT =====

  async loadParlorName() {
    try {
      // First check localStorage for immediate display
      let parlorName = localStorage.getItem('parlor_name');

      // Always try to fetch fresh data from server to ensure we have latest
      const response = await fetch('/api/settings', {
        headers: this.auth.getAuthHeaders()
      });

      if (response.ok) {
        const settings = await response.json();
        parlorName = settings.parlor_name?.value || 'Snooker Parlor';
        localStorage.setItem('parlor_name', parlorName);
      } else if (response.status === 403) {
        // User doesn't have admin access, use default or localStorage
        parlorName = parlorName || 'Snooker Parlor';
      } else if (!parlorName) {
        // Fallback if server request fails and no localStorage
        parlorName = 'Snooker Parlor';
      }

      this.updateDashboardHeader(parlorName);
    } catch (error) {
      console.error('Error loading parlor name:', error);
      // Use localStorage value or fallback
      const parlorName = localStorage.getItem('parlor_name') || 'Snooker Parlor';
      this.updateDashboardHeader(parlorName);
    }
  }

  updateDashboardHeader(parlorName) {
    const headerElement = document.querySelector('.topbar-left h1');
    if (headerElement) {
      headerElement.innerHTML = `🎱 ${parlorName}`;
    }
  }

  // ===== INVENTORY MANAGEMENT METHODS =====

  showInventorySection() {
    // Hide other sections
    const tablesSection = document.getElementById('tables-section');
    const historySection = document.getElementById('history-section');
    const inventorySection = document.getElementById('inventory-section');
    const staffSection = document.getElementById('staff-section');

    if (tablesSection) tablesSection.style.display = 'none';
    if (historySection) historySection.style.display = 'none';
    if (inventorySection) inventorySection.style.display = 'block';
    if (staffSection) staffSection.style.display = 'none';

    // Show dashboard button, hide other nav buttons
    const dashboardBtn = document.getElementById('dashboard-btn');
    const inventoryBtn = document.getElementById('inventory-btn');
    const staffBtn = document.getElementById('staff-btn');
    const reportsBtn = document.getElementById('reports-btn');

    if (dashboardBtn) dashboardBtn.style.display = 'inline-block';
    if (inventoryBtn) inventoryBtn.style.display = 'none';
    if (staffBtn) staffBtn.style.display = 'none';
    if (reportsBtn) reportsBtn.style.display = 'none';

    // Load inventory data
    this.loadInventoryData();
  }

  async loadInventoryData() {
    try {
      const headers = this.auth.getAuthHeaders();
      const [equipmentRes, consumablesRes, vendorsRes, transactionsRes] = await Promise.all([
        fetch('/api/inventory/equipment', { headers }),
        fetch('/api/inventory/consumables', { headers }),
        fetch('/api/vendors', { headers }),
        fetch('/api/inventory/transactions?limit=50', { headers })
      ]);

      if (equipmentRes.ok) {
        this.equipment = await equipmentRes.json();
      }

      if (consumablesRes.ok) {
        this.consumables = await consumablesRes.json();
      }

      if (vendorsRes.ok) {
        this.vendors = await vendorsRes.json();
      }

      if (transactionsRes.ok) {
        const data = await transactionsRes.json();
        this.transactions = data.transactions || [];
      }

      this.renderInventory();

    } catch (error) {
      console.error('❌ Failed to load inventory data:', error);
      this.showToast('Failed to load inventory data', 'error');
    }
  }

  renderInventory() {
    this.renderEquipment();
    this.renderConsumables();
    this.renderTransactions();
    this.populateVendorSelects();
  }

  renderEquipment() {
    const tbody = document.getElementById('equipment-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (this.equipment.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center" style="padding: 2rem; color: var(--text-muted);">
            No equipment found. Add your first equipment item.
          </td>
        </tr>
      `;
      return;
    }

    for (const item of this.equipment) {
      const row = document.createElement('tr');

      const statusBadge = item.available_quantity <= item.reorder_level ?
        '<span class="badge badge-warning">Low Stock</span>' :
        '<span class="badge badge-success">In Stock</span>';

      row.innerHTML = `
        <td>${item.name}</td>
        <td>${item.category}</td>
        <td>${item.total_quantity}</td>
        <td>${item.available_quantity}</td>
        <td>${item.damaged_quantity || 0}</td>
        <td>${item.maintenance_quantity || 0}</td>
        <td>₹${item.unit_cost.toLocaleString('en-IN')}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="app.editEquipment(${item.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteEquipment(${item.id})">Delete</button>
        </td>
      `;

      tbody.appendChild(row);
    }
  }

  renderConsumables() {
    const tbody = document.getElementById('consumables-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (this.consumables.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center" style="padding: 2rem; color: var(--text-muted);">
            No consumables found. Add your first consumable item.
          </td>
        </tr>
      `;
      return;
    }

    for (const item of this.consumables) {
      const row = document.createElement('tr');

      const expiryDate = item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : 'N/A';
      const isExpiringSoon = item.expiry_date && new Date(item.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const expiryBadge = isExpiringSoon ?
        '<span class="badge badge-warning">Expiring Soon</span>' : '';

      row.innerHTML = `
        <td>${item.name}</td>
        <td>${item.category}</td>
        <td>${item.current_stock}</td>
        <td>₹${item.unit_cost.toLocaleString('en-IN')}</td>
        <td>${expiryDate} ${expiryBadge}</td>
        <td>${item.supplier_name || 'N/A'}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="app.editConsumable(${item.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteConsumable(${item.id})">Delete</button>
        </td>
      `;

      tbody.appendChild(row);
    }
  }

  renderTransactions() {
    const tbody = document.getElementById('transactions-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (this.transactions.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center" style="padding: 2rem; color: var(--text-muted);">
            No transactions found.
          </td>
        </tr>
      `;
      return;
    }

    for (const transaction of this.transactions) {
      const row = document.createElement('tr');

      const date = new Date(transaction.created_at).toLocaleString();
      const itemName = transaction.item_type === 'EQUIPMENT' ?
        this.equipment.find(e => e.id === transaction.item_id)?.name || 'Unknown' :
        this.consumables.find(c => c.id === transaction.item_id)?.name || 'Unknown';

      row.innerHTML = `
        <td>${date}</td>
        <td>${itemName}</td>
        <td>${transaction.transaction_type}</td>
        <td>${transaction.quantity > 0 ? '+' : ''}${transaction.quantity}</td>
        <td>${transaction.previous_stock}</td>
        <td>${transaction.new_stock}</td>
        <td>${transaction.performed_by_name || 'System'}</td>
        <td>${transaction.notes || ''}</td>
      `;

      tbody.appendChild(row);
    }
  }

  populateVendorSelects() {
    const selects = [
      'equipment-supplier',
      'consumable-supplier'
    ];

    selects.forEach(selectId => {
      const select = document.getElementById(selectId);
      if (select) {
        select.innerHTML = '<option value="">Select Supplier</option>';
        for (const vendor of this.vendors) {
          const option = document.createElement('option');
          option.value = vendor.id;
          option.textContent = vendor.name;
          select.appendChild(option);
        }
      }
    });
  }

  showAddEquipmentModal() {
    this.populateVendorSelects();
    this.showModal('add-equipment-modal');
  }

  async addEquipment(formData) {
    try {
      const response = await fetch('/api/inventory/equipment', {
        method: 'POST',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(formData)
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Equipment added successfully!', 'success');
        this.hideModal('add-equipment-modal');
        await this.loadInventoryData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to add equipment', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to add equipment:', error);
      this.showToast('Failed to add equipment', 'error');
    }
  }

  showAddConsumableModal() {
    this.populateVendorSelects();
    this.showModal('add-consumable-modal');
  }

  async addConsumable(formData) {
    try {
      const response = await fetch('/api/inventory/consumables', {
        method: 'POST',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(formData)
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Consumable added successfully!', 'success');
        this.hideModal('add-consumable-modal');
        await this.loadInventoryData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to add consumable', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to add consumable:', error);
      this.showToast('Failed to add consumable', 'error');
    }
  }

  showVendorsModal() {
    this.renderVendors();
    this.showModal('vendors-modal');
  }

  renderVendors() {
    const tbody = document.getElementById('vendors-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (this.vendors.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center" style="padding: 2rem; color: var(--text-muted);">
            No vendors found. Add your first vendor.
          </td>
        </tr>
      `;
      return;
    }

    for (const vendor of this.vendors) {
      const row = document.createElement('tr');

      const rating = '⭐'.repeat(vendor.rating);

      row.innerHTML = `
        <td>${vendor.name}</td>
        <td>${vendor.contact_person || 'N/A'}</td>
        <td>${vendor.phone || 'N/A'}</td>
        <td>${vendor.email || 'N/A'}</td>
        <td>${rating}</td>
        <td>
          <span class="badge ${vendor.is_active ? 'badge-success' : 'badge-secondary'}">
            ${vendor.is_active ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="app.editVendor(${vendor.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteVendor(${vendor.id})">Delete</button>
        </td>
      `;

      tbody.appendChild(row);
    }
  }

  async addVendor(formData) {
    try {
      const response = await fetch('/api/vendors', {
        method: 'POST',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(formData)
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Vendor added successfully!', 'success');
        this.hideModal('add-vendor-modal');
        await this.loadInventoryData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to add vendor', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to add vendor:', error);
      this.showToast('Failed to add vendor', 'error');
    }
  }

  switchInventoryTab(tabName) {
    // Update active tab
    const tabButtons = document.querySelectorAll('.inventory-tabs .tab-btn');
    tabButtons.forEach(btn => {
      btn.classList.remove('active');
    });

    const activeTabBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeTabBtn) {
      activeTabBtn.classList.add('active');
    }

    // Show selected tab content
    const tabPanes = document.querySelectorAll('.tab-pane');
    tabPanes.forEach(pane => {
      pane.classList.remove('active');
    });

    const activeTabPane = document.getElementById(`${tabName}-tab`);
    if (activeTabPane) {
      activeTabPane.classList.add('active');
    }

    this.currentInventoryTab = tabName;
  }

  // ===== MEMBERSHIP MANAGEMENT METHODS =====

  showMembershipSection() {
    console.log('🏠 Showing membership section...');

    // Hide other sections
    document.getElementById('tables-grid').style.display = 'none';
    document.getElementById('history-section').style.display = 'none';
    document.getElementById('inventory-section').style.display = 'none';
    document.getElementById('staff-section').style.display = 'none';
    document.getElementById('membership-section').style.display = 'block';

    // Show dashboard button, hide other nav buttons
    const dashboardBtn = document.getElementById('dashboard-btn');
    const inventoryBtn = document.getElementById('inventory-btn');
    const staffBtn = document.getElementById('staff-btn');
    const membershipBtn = document.getElementById('membership-btn');
    const reportsBtn = document.getElementById('reports-btn');

    console.log('🔧 Setting navigation button visibility:', {
      dashboardBtn: dashboardBtn ? 'found' : 'not found',
      inventoryBtn: inventoryBtn ? 'found' : 'not found',
      staffBtn: staffBtn ? 'found' : 'not found',
      membershipBtn: membershipBtn ? 'found' : 'not found',
      reportsBtn: reportsBtn ? 'found' : 'not found'
    });

    if (dashboardBtn) {
      dashboardBtn.style.display = 'inline-block';
      console.log('✅ Dashboard button set to visible');
    } else {
      console.error('❌ Dashboard button not found!');
    }

    if (inventoryBtn) inventoryBtn.style.display = 'inline-block';
    if (staffBtn) staffBtn.style.display = 'inline-block';
    if (membershipBtn) membershipBtn.style.display = 'none';
    if (reportsBtn) reportsBtn.style.display = 'inline-block';

    console.log('✅ Membership section navigation setup complete');

    // Load membership data
    this.loadMembershipData();
  }

  async loadMembershipData() {
    console.log('📡 Fetching membership data...');

    try {
      const headers = this.auth.getAuthHeaders();
      const [membersRes, tiersRes] = await Promise.all([
        fetch('/api/customers?membership_type=REGULAR,VIP,PREMIUM', { headers }),
        fetch('/api/membership/tiers', { headers })
      ]);

      if (membersRes.ok) {
        this.members = await membersRes.json();
        console.log('✅ Members fetched successfully:', this.members.length, 'members');
      } else if (membersRes.status === 403) {
        console.log('Membership data not accessible - user may not have required permissions');
        this.members = [];
      }

      if (tiersRes.ok) {
        this.membershipTiers = await tiersRes.json();
        console.log('✅ Membership tiers fetched successfully:', this.membershipTiers.length, 'tiers');
      } else if (tiersRes.status === 403) {
        console.log('Membership tiers not accessible - user may not have required permissions');
        this.membershipTiers = [];
      }

      this.renderMembership();

    } catch (error) {
      console.error('❌ Failed to load membership data:', error);
      this.showToast('Failed to load membership data', 'error');
    }
  }

  renderMembership() {
    this.renderMembers();
    this.renderMembershipTiers();
    this.renderLoyaltyTransactions();
    this.populateMemberSelects();
  }

  renderMembers() {
    const tbody = document.getElementById('members-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (this.members.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center" style="padding: 2rem; color: var(--text-muted);">
            No members found. Add your first member.
          </td>
        </tr>
      `;
      return;
    }

    for (const member of this.members) {
      const row = document.createElement('tr');

      const tierBadge = this.getTierBadge(member.membership_type);
      const statusBadge = this.getStatusBadge(member.membership_status || 'ACTIVE');
      const joinDate = member.membership_start_date ? new Date(member.membership_start_date).toLocaleDateString() : 'N/A';

      row.innerHTML = `
        <td>${member.name}</td>
        <td>${member.phone}</td>
        <td>${member.email || 'N/A'}</td>
        <td>${tierBadge}</td>
        <td>${member.loyalty_points || 0}</td>
        <td>₹${(member.total_spent || 0).toLocaleString('en-IN')}</td>
        <td>${joinDate}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="app.editMember(${member.id})">Edit</button>
          <button class="btn btn-sm btn-success" onclick="app.viewMemberAnalytics(${member.id})">📊</button>
        </td>
      `;

      tbody.appendChild(row);
    }
  }

  renderMembershipTiers() {
    const tbody = document.getElementById('tiers-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (this.membershipTiers.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center" style="padding: 2rem; color: var(--text-muted);">
            No membership tiers found.
          </td>
        </tr>
      `;
      return;
    }

    for (const tier of this.membershipTiers) {
      const row = document.createElement('tr');

      row.innerHTML = `
        <td>${tier.name}</td>
        <td>${tier.description || 'N/A'}</td>
        <td>₹${tier.monthly_fee || 0}</td>
        <td>₹${tier.annual_fee || 0}</td>
        <td>${tier.session_discount_percent || 0}%</td>
        <td>${tier.consumable_discount_percent || 0}%</td>
        <td>${tier.free_sessions_per_month || 0}</td>
        <td>${tier.points_multiplier || 1.0}x</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="app.editTier(${tier.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteTier(${tier.id})">Delete</button>
        </td>
      `;

      tbody.appendChild(row);
    }
  }

  renderLoyaltyTransactions() {
    const tbody = document.getElementById('loyalty-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (this.loyaltyTransactions.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center" style="padding: 2rem; color: var(--text-muted);">
            No loyalty transactions found.
          </td>
        </tr>
      `;
      return;
    }

    for (const transaction of this.loyaltyTransactions) {
      const row = document.createElement('tr');

      const date = new Date(transaction.created_at).toLocaleString();
      const pointsDisplay = transaction.transaction_type === 'EARNED' ?
        `+${transaction.points}` : `-${transaction.points}`;

      row.innerHTML = `
        <td>${transaction.customer_name || 'Unknown'}</td>
        <td>${transaction.transaction_type}</td>
        <td>${pointsDisplay}</td>
        <td>${transaction.new_balance}</td>
        <td>${transaction.description || ''}</td>
        <td>${date}</td>
        <td>${transaction.performed_by_name || 'System'}</td>
      `;

      tbody.appendChild(row);
    }
  }

  populateMemberSelects() {
    const selects = [
      'earn-member',
      'redeem-member',
      'analytics-member-filter'
    ];

    selects.forEach(selectId => {
      const select = document.getElementById(selectId);
      if (select) {
        select.innerHTML = '<option value="">Select Member</option>';
        for (const member of this.members) {
          const option = document.createElement('option');
          option.value = member.id;
          option.textContent = `${member.name} (${member.phone})`;
          select.appendChild(option);
        }
      }
    });
  }

  getTierBadge(tier) {
    const badges = {
      'REGULAR': '<span class="badge badge-secondary">Regular</span>',
      'VIP': '<span class="badge badge-warning">VIP</span>',
      'PREMIUM': '<span class="badge badge-success">Premium</span>'
    };
    return badges[tier] || '<span class="badge">Unknown</span>';
  }

  getStatusBadge(status) {
    const badges = {
      'ACTIVE': '<span class="badge badge-success">Active</span>',
      'EXPIRED': '<span class="badge badge-danger">Expired</span>',
      'SUSPENDED': '<span class="badge badge-warning">Suspended</span>'
    };
    return badges[status] || '<span class="badge">Unknown</span>';
  }

  showAddMemberModal() {
    this.showModal('add-member-modal');
  }

  async addMember(formData) {
    console.log('👤 Adding new member:', formData);

    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(formData)
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Member added successfully:', result);
        this.showToast('Member added successfully!', 'success');
        this.hideModal('add-member-modal');
        await this.loadMembershipData();
      } else {
        const error = await response.json();
        console.error('❌ Failed to add member:', error);
        this.showToast(error.error || 'Failed to add member', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to add member:', error);
      this.showToast('Failed to add member', 'error');
    }
  }

  async editMember(memberId) {
    try {
      const response = await fetch(`/api/customers/${memberId}`, {
        headers: this.auth.getAuthHeaders()
      });

      if (response.ok) {
        const member = await response.json();

        // Populate edit form
        document.getElementById('edit-member-id').value = member.id;
        document.getElementById('edit-member-name').value = member.name;
        document.getElementById('edit-member-phone').value = member.phone;
        document.getElementById('edit-member-email').value = member.email || '';
        document.getElementById('edit-member-dob').value = member.date_of_birth ?
          new Date(member.date_of_birth).toISOString().slice(0, 10) : '';
        document.getElementById('edit-member-address').value = member.address || '';
        document.getElementById('edit-member-tier').value = member.membership_type;
        document.getElementById('edit-member-status').value = member.membership_status || 'ACTIVE';
        document.getElementById('edit-member-start-date').value = member.membership_start_date ?
          new Date(member.membership_start_date).toISOString().slice(0, 10) : '';
        document.getElementById('edit-member-expiry-date').value = member.membership_expiry_date ?
          new Date(member.membership_expiry_date).toISOString().slice(0, 10) : '';
        document.getElementById('edit-member-emergency-contact').value = member.emergency_contact || '';
        document.getElementById('edit-member-loyalty-points').value = member.loyalty_points || 0;
        document.getElementById('edit-member-notes').value = member.notes || '';

        this.showModal('edit-member-modal');
      }
    } catch (error) {
      console.error('❌ Failed to load member:', error);
      this.showToast('Failed to load member', 'error');
    }
  }

  async updateMember(formData) {
    const memberId = document.getElementById('edit-member-id').value;

    try {
      const response = await fetch(`/api/customers/${memberId}`, {
        method: 'PUT',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(formData)
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Member updated successfully!', 'success');
        this.hideModal('edit-member-modal');
        await this.loadMembershipData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to update member', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to update member:', error);
      this.showToast('Failed to update member', 'error');
    }
  }

  async viewMemberAnalytics(memberId) {
    try {
      const response = await fetch(`/api/customers/${memberId}/analytics`, {
        headers: this.auth.getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();

        // Display enhanced analytics
        const content = document.getElementById('analytics-content');
        if (content) {
          content.innerHTML = `
            <div class="member-analytics">
              <!-- Member Header -->
              <div class="member-header">
                <div class="member-info">
                  <h3>${data.customer.name}</h3>
                  <div class="member-details">
                    <span class="membership-badge ${data.customer.membership_type?.toLowerCase() || 'regular'}">
                      ${data.customer.membership_type || 'Regular'}
                    </span>
                    <span class="phone">${data.customer.phone}</span>
                  </div>
                </div>
                <div class="member-stats">
                  <div class="stat-item">
                    <span class="stat-value">${data.analytics.current_streak}</span>
                    <span class="stat-label">Current Streak</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-value">${data.analytics.max_streak}</span>
                    <span class="stat-label">Max Streak</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-value">${data.analytics.loyalty_points}</span>
                    <span class="stat-label">Loyalty Points</span>
                  </div>
                </div>
              </div>

              <!-- Streak Calendar -->
              <div class="analytics-section">
                <h4>🎯 Activity Calendar</h4>
                <div class="streak-calendar">
                  ${this.generateStreakCalendar(data.streak_data)}
                </div>
                <div class="calendar-legend">
                  <div class="legend-item">
                    <div class="legend-color none"></div>
                    <span>No sessions</span>
                  </div>
                  <div class="legend-item">
                    <div class="legend-color low"></div>
                    <span>1 session</span>
                  </div>
                  <div class="legend-item">
                    <div class="legend-color medium"></div>
                    <span>2-3 sessions</span>
                  </div>
                  <div class="legend-item">
                    <div class="legend-color high"></div>
                    <span>4+ sessions</span>
                  </div>
                </div>
              </div>

              <!-- Key Metrics -->
              <div class="analytics-section">
                <h4>📊 Key Metrics</h4>
                <div class="metrics-grid">
                  <div class="metric-card">
                    <div class="metric-icon">🎱</div>
                    <div class="metric-data">
                      <div class="metric-value">${data.analytics.total_sessions}</div>
                      <div class="metric-label">Total Sessions</div>
                    </div>
                  </div>
                  <div class="metric-card">
                    <div class="metric-icon">💰</div>
                    <div class="metric-data">
                      <div class="metric-value">₹${data.analytics.total_spent.toLocaleString('en-IN')}</div>
                      <div class="metric-label">Total Spent</div>
                    </div>
                  </div>
                  <div class="metric-card">
                    <div class="metric-icon">⏱️</div>
                    <div class="metric-data">
                      <div class="metric-value">${data.analytics.avg_session_duration} min</div>
                      <div class="metric-label">Avg Duration</div>
                    </div>
                  </div>
                  <div class="metric-card">
                    <div class="metric-icon">💵</div>
                    <div class="metric-data">
                      <div class="metric-value">₹${Math.round(data.analytics.avg_spending_per_session).toLocaleString('en-IN')}</div>
                      <div class="metric-label">Avg per Session</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Session Breakdown -->
              <div class="analytics-section">
                <h4>🎯 Session Breakdown</h4>
                <div class="breakdown-grid">
                  <div class="breakdown-item">
                    <div class="breakdown-value">${data.analytics.paid_sessions}</div>
                    <div class="breakdown-label">Paid Sessions</div>
                  </div>
                  <div class="breakdown-item">
                    <div class="breakdown-value">${data.analytics.friendly_sessions}</div>
                    <div class="breakdown-label">Friendly Games</div>
                  </div>
                </div>
              </div>

              <!-- Table Usage -->
              <div class="analytics-section">
                <h4>🎱 Table Preferences</h4>
                <div class="table-usage">
                  ${Object.entries(data.analytics.table_usage).map(([tableType, stats]) => `
                    <div class="table-usage-item">
                      <div class="table-type">${tableType}</div>
                      <div class="table-stats">
                        <div class="stat">${stats.sessions} sessions</div>
                        <div class="stat">₹${stats.total_spent.toLocaleString('en-IN')} spent</div>
                        <div class="stat">${Math.round(stats.total_duration / stats.sessions)} min avg</div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Monthly Spending Chart -->
              <div class="analytics-section">
                <h4>📈 Monthly Spending</h4>
                <div class="monthly-chart">
                  ${Object.entries(data.analytics.monthly_spending).map(([month, amount]) => `
                    <div class="month-bar">
                      <div class="month-label">${new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}</div>
                      <div class="bar-container">
                        <div class="bar" style="width: ${Math.min((amount / Math.max(...Object.values(data.analytics.monthly_spending))) * 100, 100)}%"></div>
                      </div>
                      <div class="amount">₹${amount.toLocaleString('en-IN')}</div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Peak Hours -->
              <div class="analytics-section">
                <h4>🕐 Peak Hours</h4>
                <div class="peak-hours">
                  ${Object.entries(data.analytics.hourly_stats).map(([hour, sessions]) => `
                    <div class="hour-bar">
                      <div class="hour-label">${hour}:00</div>
                      <div class="hour-bar-container">
                        <div class="hour-bar-fill" style="height: ${Math.min((sessions / Math.max(...Object.values(data.analytics.hourly_stats))) * 100, 100)}%"></div>
                      </div>
                      <div class="hour-count">${sessions}</div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Recent Sessions -->
              <div class="analytics-section">
                <h4>📋 Recent Sessions</h4>
                <div class="recent-sessions">
                  ${data.recent_sessions.map(session => `
                    <div class="session-item">
                      <div class="session-date">${new Date(session.start_time).toLocaleDateString()}</div>
                      <div class="session-details">
                        <div class="session-table">Table ${session.table_id} (${session.table_type})</div>
                        <div class="session-duration">${session.billed_minutes || 0} minutes</div>
                        <div class="session-amount">₹${(session.amount || 0).toLocaleString('en-IN')}</div>
                      </div>
                      <div class="session-status ${session.is_friendly ? 'friendly' : 'paid'}">
                        ${session.is_friendly ? 'Friendly' : 'Paid'}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          `;
        }

        this.switchMembershipTab('analytics');
      }
    } catch (error) {
      console.error('❌ Failed to load member analytics:', error);
      this.showToast('Failed to load member analytics', 'error');
    }
  }

  generateStreakCalendar(streakData) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Group data by month and week
    const calendarData = {};
    const today = new Date();

    // Initialize last 12 months
    for (let i = 11; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      calendarData[monthKey] = {
        month: months[date.getMonth()],
        year: date.getFullYear(),
        weeks: []
      };

      // Create weeks for this month
      const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      const startDate = new Date(firstDay);
      startDate.setDate(startDate.getDate() - firstDay.getDay()); // Start from Sunday

      const weeks = [];
      let currentWeek = [];

      for (let d = new Date(startDate); d <= lastDay || currentWeek.length < 7; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().slice(0, 10);
        const count = streakData[dateKey] || 0;
        const isCurrentMonth = d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear();

        currentWeek.push({
          date: d.getDate(),
          count: count,
          isCurrentMonth: isCurrentMonth,
          dateKey: dateKey
        });

        if (currentWeek.length === 7) {
          weeks.push(currentWeek);
          currentWeek = [];
        }
      }

      if (currentWeek.length > 0) {
        weeks.push(currentWeek);
      }

      calendarData[monthKey].weeks = weeks;
    }

    // Generate HTML
    let html = '<div class="calendar-months">';

    Object.values(calendarData).forEach(monthData => {
      html += `
        <div class="calendar-month">
          <div class="month-header">${monthData.month} ${monthData.year}</div>
          <div class="month-grid">
            ${days.map(day => `<div class="day-label">${day}</div>`).join('')}
            ${monthData.weeks.map(week =>
              week.map(day => `
                <div class="calendar-day ${day.isCurrentMonth ? '' : 'other-month'} ${this.getStreakClass(day.count)}"
                     title="${day.date}: ${day.count} session${day.count !== 1 ? 's' : ''}">
                  ${day.isCurrentMonth ? day.date : ''}
                </div>
              `).join('')
            ).join('')}
          </div>
        </div>
      `;
    });

    html += '</div>';
    return html;
  }

  getStreakClass(count) {
    if (count === 0) return 'none';
    if (count === 1) return 'low';
    if (count <= 3) return 'medium';
    return 'high';
  }

  switchMembershipTab(tabName) {
    // Update active tab
    document.querySelectorAll('.membership-tabs .tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Show selected tab content
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');

    this.currentMembershipTab = tabName;
  }

  async addTier(formData) {
    try {
      const response = await fetch('/api/membership/tiers', {
        method: 'POST',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(formData)
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Membership tier added successfully!', 'success');
        this.hideModal('add-tier-modal');
        await this.loadMembershipData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to add membership tier', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to add membership tier:', error);
      this.showToast('Failed to add membership tier', 'error');
    }
  }

  async earnPoints(formData) {
    try {
      const response = await fetch('/api/customers/loyalty/earn', {
        method: 'POST',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(formData)
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Points earned successfully!', 'success');
        this.hideModal('earn-points-modal');
        await this.loadMembershipData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to earn points', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to earn points:', error);
      this.showToast('Failed to earn points', 'error');
    }
  }

  async redeemPoints(formData) {
    try {
      const response = await fetch('/api/customers/loyalty/redeem', {
        method: 'POST',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(formData)
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Points redeemed successfully!', 'success');
        this.hideModal('redeem-points-modal');
        await this.loadMembershipData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to redeem points', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to redeem points:', error);
      this.showToast('Failed to redeem points', 'error');
    }
  }

  filterEquipment() {
    const categoryFilter = document.getElementById('equipment-category-filter').value;
    const lowStockFilter = document.getElementById('low-stock-filter').checked;

    let filtered = this.equipment;

    if (categoryFilter) {
      filtered = filtered.filter(item => item.category === categoryFilter);
    }

    if (lowStockFilter) {
      filtered = filtered.filter(item => item.available_quantity <= item.reorder_level);
    }

    this.renderFilteredEquipment(filtered);
  }

  renderFilteredEquipment(filteredEquipment) {
    const tbody = document.getElementById('equipment-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (filteredEquipment.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center" style="padding: 2rem; color: var(--text-muted);">
            No equipment matches the current filters.
          </td>
        </tr>
      `;
      return;
    }

    for (const item of filteredEquipment) {
      const row = document.createElement('tr');

      const statusBadge = item.available_quantity <= item.reorder_level ?
        '<span class="badge badge-warning">Low Stock</span>' :
        '<span class="badge badge-success">In Stock</span>';

      row.innerHTML = `
        <td>${item.name}</td>
        <td>${item.category}</td>
        <td>${item.total_quantity}</td>
        <td>${item.available_quantity}</td>
        <td>${item.damaged_quantity || 0}</td>
        <td>${item.maintenance_quantity || 0}</td>
        <td>₹${item.unit_cost.toLocaleString('en-IN')}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="app.editEquipment(${item.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteEquipment(${item.id})">Delete</button>
        </td>
      `;

      tbody.appendChild(row);
    }
  }

  filterConsumables() {
    const categoryFilter = document.getElementById('consumables-category-filter').value;
    const lowStockFilter = document.getElementById('consumables-low-stock-filter').checked;
    const expiringSoonFilter = document.getElementById('expiring-soon-filter').checked;

    let filtered = this.consumables;

    if (categoryFilter) {
      filtered = filtered.filter(item => item.category === categoryFilter);
    }

    if (lowStockFilter) {
      filtered = filtered.filter(item => item.current_stock <= item.reorder_level);
    }

    if (expiringSoonFilter) {
      const thirtyDaysFromNow = Date.now() + (30 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(item =>
        item.expiry_date && new Date(item.expiry_date) <= thirtyDaysFromNow
      );
    }

    this.renderFilteredConsumables(filtered);
  }

  renderFilteredConsumables(filteredConsumables) {
    const tbody = document.getElementById('consumables-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (filteredConsumables.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center" style="padding: 2rem; color: var(--text-muted);">
            No consumables match the current filters.
          </td>
        </tr>
      `;
      return;
    }

    for (const item of filteredConsumables) {
      const row = document.createElement('tr');

      const expiryDate = item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : 'N/A';
      const isExpiringSoon = item.expiry_date && new Date(item.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const expiryBadge = isExpiringSoon ?
        '<span class="badge badge-warning">Expiring Soon</span>' : '';

      row.innerHTML = `
        <td>${item.name}</td>
        <td>${item.category}</td>
        <td>${item.current_stock}</td>
        <td>₹${item.unit_cost.toLocaleString('en-IN')}</td>
        <td>${expiryDate} ${expiryBadge}</td>
        <td>${item.supplier_name || 'N/A'}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="app.editConsumable(${item.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteConsumable(${item.id})">Delete</button>
        </td>
      `;

      tbody.appendChild(row);
    }
  }

  filterStaff() {
    const departmentFilter = document.getElementById('staff-department-filter').value;
    const activeFilter = document.getElementById('active-staff-filter').checked;

    let filtered = this.staff;

    if (departmentFilter) {
      filtered = filtered.filter(member => member.department === departmentFilter);
    }

    if (activeFilter) {
      filtered = filtered.filter(member => member.is_active === 1);
    }

    this.renderFilteredStaff(filtered);
  }

  renderFilteredStaff(filteredStaff) {
    const tbody = document.getElementById('staff-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (filteredStaff.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center" style="padding: 2rem; color: var(--text-muted);">
            No staff members match the current filters.
          </td>
        </tr>
      `;
      return;
    }

    for (const member of filteredStaff) {
      const row = document.createElement('tr');

      const statusBadge = member.is_active ?
        '<span class="badge badge-success">Active</span>' :
        '<span class="badge badge-secondary">Inactive</span>';

      row.innerHTML = `
        <td>${member.full_name}</td>
        <td>${member.employee_id || 'N/A'}</td>
        <td>${member.department}</td>
        <td>${member.position}</td>
        <td>${member.role}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="app.editStaff(${member.user_id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteStaff(${member.user_id})">Delete</button>
        </td>
      `;

      tbody.appendChild(row);
    }
  }

  filterAttendance() {
    const dateFilter = document.getElementById('attendance-date-filter').value;

    if (dateFilter) {
      // Filter attendance records by date
      const filteredAttendance = this.attendance.filter(record =>
        new Date(record.date).toISOString().slice(0, 10) === dateFilter
      );
      this.renderFilteredAttendance(filteredAttendance);
    } else {
      this.renderAttendance();
    }
  }

  renderFilteredAttendance(filteredAttendance) {
    const tbody = document.getElementById('attendance-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (filteredAttendance.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center" style="padding: 2rem; color: var(--text-muted);">
            No attendance records found for the selected date.
          </td>
        </tr>
      `;
      return;
    }

    for (const record of filteredAttendance) {
      const row = document.createElement('tr');

      const recordDate = new Date(record.date).toLocaleDateString();
      const checkIn = record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString() : '-';
      const checkOut = record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString() : '-';
      const totalHours = record.total_hours ? `${record.total_hours.toFixed(2)}h` : '-';

      row.innerHTML = `
        <td>${record.staff_name}</td>
        <td>${recordDate}</td>
        <td>${checkIn}</td>
        <td>${checkOut}</td>
        <td>${totalHours}</td>
        <td>${record.status}</td>
        <td>${record.notes || ''}</td>
      `;

      tbody.appendChild(row);
    }
  }

  renderFilteredConsumables(filteredConsumables) {
    const tbody = document.getElementById('consumables-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (filteredConsumables.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center" style="padding: 2rem; color: var(--text-muted);">
            No consumables match the current filters.
          </td>
        </tr>
      `;
      return;
    }

    for (const item of filteredConsumables) {
      const row = document.createElement('tr');

      const expiryDate = item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : 'N/A';
      const isExpiringSoon = item.expiry_date && new Date(item.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const expiryBadge = isExpiringSoon ?
        '<span class="badge badge-warning">Expiring Soon</span>' : '';

      row.innerHTML = `
        <td>${item.name}</td>
        <td>${item.category}</td>
        <td>${item.current_stock}</td>
        <td>₹${item.unit_cost.toLocaleString('en-IN')}</td>
        <td>${expiryDate} ${expiryBadge}</td>
        <td>${item.supplier_name || 'N/A'}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="app.editConsumable(${item.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteConsumable(${item.id})">Delete</button>
        </td>
      `;

      tbody.appendChild(row);
    }
  }

  // ===== STAFF MANAGEMENT METHODS =====

  showStaffSection() {
    // Hide other sections
    const tablesSection = document.getElementById('tables-section');
    const historySection = document.getElementById('history-section');
    const inventorySection = document.getElementById('inventory-section');
    const staffSection = document.getElementById('staff-section');

    if (tablesSection) tablesSection.style.display = 'none';
    if (historySection) historySection.style.display = 'none';
    if (inventorySection) inventorySection.style.display = 'none';
    if (staffSection) staffSection.style.display = 'block';

    // Show dashboard button, hide other nav buttons
    const dashboardBtn = document.getElementById('dashboard-btn');
    const inventoryBtn = document.getElementById('inventory-btn');
    const staffBtn = document.getElementById('staff-btn');
    const reportsBtn = document.getElementById('reports-btn');

    if (dashboardBtn) dashboardBtn.style.display = 'inline-block';
    if (inventoryBtn) inventoryBtn.style.display = 'none';
    if (staffBtn) staffBtn.style.display = 'none';
    if (reportsBtn) reportsBtn.style.display = 'none';

    // Load staff data
    this.loadStaffData();
  }

  showDashboard() {
    // Show main sections
    const tablesSection = document.getElementById('tables-section');
    const historySection = document.getElementById('history-section');
    const tablesGrid = document.getElementById('tables-grid');

    if (tablesSection) tablesSection.style.display = 'block';
    if (historySection) historySection.style.display = 'block';
    if (tablesGrid) tablesGrid.style.display = 'grid'; // Ensure tables grid is visible

    // Hide other sections
    const inventorySection = document.getElementById('inventory-section');
    const staffSection = document.getElementById('staff-section');
    const membershipSection = document.getElementById('membership-section');

    if (inventorySection) inventorySection.style.display = 'none';
    if (staffSection) staffSection.style.display = 'none';
    if (membershipSection) membershipSection.style.display = 'none';

    // Show nav buttons, hide dashboard button
    const dashboardBtn = document.getElementById('dashboard-btn');
    const inventoryBtn = document.getElementById('inventory-btn');
    const staffBtn = document.getElementById('staff-btn');
    const membershipBtn = document.getElementById('membership-btn');
    const reportsBtn = document.getElementById('reports-btn');

    if (dashboardBtn) dashboardBtn.style.display = 'none';
    if (inventoryBtn) inventoryBtn.style.display = 'inline-block';
    if (staffBtn) staffBtn.style.display = 'inline-block';
    if (membershipBtn) membershipBtn.style.display = 'inline-block';
    if (reportsBtn) reportsBtn.style.display = 'inline-block';

    // Refresh dashboard data
    this.loadData();
  }

  async loadStaffData() {
    try {
      const headers = this.auth.getAuthHeaders();
      const [staffRes, shiftsRes, attendanceRes, leaveRes] = await Promise.all([
        fetch('/api/staff', { headers }),
        fetch('/api/staff/shifts', { headers }),
        fetch('/api/staff/attendance', { headers }),
        fetch('/api/staff/leave', { headers })
      ]);

      if (staffRes.ok) {
        this.staff = await staffRes.json();
      }

      if (shiftsRes.ok) {
        this.shifts = await shiftsRes.json();
      }

      if (attendanceRes.ok) {
        this.attendance = await attendanceRes.json();
      }

      if (leaveRes.ok) {
        this.leaveRequests = await leaveRes.json();
      }

      this.renderStaff();

    } catch (error) {
      console.error('❌ Failed to load staff data:', error);
      this.showToast('Failed to load staff data', 'error');
    }
  }

  renderStaff() {
    this.renderStaffList();
    this.renderShifts();
    this.renderAttendance();
    this.renderLeaveRequests();
    this.populateStaffSelects();
  }

  renderStaffList() {
    const tbody = document.getElementById('staff-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (this.staff.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center" style="padding: 2rem; color: var(--text-muted);">
            No staff members found. Add your first staff member.
          </td>
        </tr>
      `;
      return;
    }

    for (const member of this.staff) {
      const row = document.createElement('tr');

      const statusBadge = member.is_active ?
        '<span class="badge badge-success">Active</span>' :
        '<span class="badge badge-secondary">Inactive</span>';

      row.innerHTML = `
        <td>${member.full_name}</td>
        <td>${member.employee_id || 'N/A'}</td>
        <td>${member.department}</td>
        <td>${member.position}</td>
        <td>${member.role}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="app.editStaff(${member.user_id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteStaff(${member.user_id})">Delete</button>
        </td>
      `;

      tbody.appendChild(row);
    }
  }

  renderShifts() {
    const tbody = document.getElementById('shifts-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (this.shifts.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center" style="padding: 2rem; color: var(--text-muted);">
            No shifts scheduled. Add your first shift.
          </td>
        </tr>
      `;
      return;
    }

    for (const shift of this.shifts) {
      const row = document.createElement('tr');

      const shiftDate = new Date(shift.shift_date).toLocaleDateString();

      row.innerHTML = `
        <td>${shift.staff_name}</td>
        <td>${shiftDate}</td>
        <td>${shift.start_time}</td>
        <td>${shift.end_time}</td>
        <td>${shift.break_duration}</td>
        <td>${shift.shift_type}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="app.editShift(${shift.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteShift(${shift.id})">Delete</button>
        </td>
      `;

      tbody.appendChild(row);
    }
  }

  renderAttendance() {
    const tbody = document.getElementById('attendance-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (this.attendance.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center" style="padding: 2rem; color: var(--text-muted);">
            No attendance records found.
          </td>
        </tr>
      `;
      return;
    }

    for (const record of this.attendance) {
      const row = document.createElement('tr');

      const recordDate = new Date(record.date).toLocaleDateString();
      const checkIn = record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString() : '-';
      const checkOut = record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString() : '-';
      const totalHours = record.total_hours ? `${record.total_hours.toFixed(2)}h` : '-';

      row.innerHTML = `
        <td>${record.staff_name}</td>
        <td>${recordDate}</td>
        <td>${checkIn}</td>
        <td>${checkOut}</td>
        <td>${totalHours}</td>
        <td>${record.status}</td>
        <td>${record.notes || ''}</td>
      `;

      tbody.appendChild(row);
    }
  }

  renderLeaveRequests() {
    const tbody = document.getElementById('leave-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (this.leaveRequests.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center" style="padding: 2rem; color: var(--text-muted);">
            No leave requests found.
          </td>
        </tr>
      `;
      return;
    }

    for (const request of this.leaveRequests) {
      const row = document.createElement('tr');

      const startDate = new Date(request.start_date).toLocaleDateString();
      const endDate = new Date(request.end_date).toLocaleDateString();

      let statusBadge = '';
      switch (request.status) {
        case 'Approved':
          statusBadge = '<span class="badge badge-success">Approved</span>';
          break;
        case 'Rejected':
          statusBadge = '<span class="badge badge-danger">Rejected</span>';
          break;
        case 'Pending':
          statusBadge = '<span class="badge badge-warning">Pending</span>';
          break;
        default:
          statusBadge = `<span class="badge badge-secondary">${request.status}</span>`;
      }

      let actions = '';
      if (this.auth.isAdmin() && request.status === 'Pending') {
        actions = `
          <button class="btn btn-sm btn-success" onclick="app.approveLeave(${request.id})">Approve</button>
          <button class="btn btn-sm btn-danger" onclick="app.rejectLeave(${request.id})">Reject</button>
        `;
      }

      row.innerHTML = `
        <td>${request.staff_name}</td>
        <td>${request.leave_type}</td>
        <td>${startDate}</td>
        <td>${endDate}</td>
        <td>${request.total_days}</td>
        <td>${statusBadge}</td>
        <td>${actions}</td>
      `;

      tbody.appendChild(row);
    }
  }

  populateStaffSelects() {
    const selects = ['shift-staff', 'staff-manager', 'edit-shift-staff'];

    selects.forEach(selectId => {
      const select = document.getElementById(selectId);
      if (select) {
        // Keep the first option
        const firstOption = select.querySelector('option');
        select.innerHTML = '';
        if (firstOption) select.appendChild(firstOption);

        for (const member of this.staff) {
          const option = document.createElement('option');
          option.value = member.user_id;
          option.textContent = member.full_name;
          select.appendChild(option);
        }
      }
    });
  }

  showAddStaffModal() {
    this.populateStaffSelects();
    this.showModal('add-staff-modal');
  }

  async addStaff(formData) {
    try {
      const response = await fetch('/api/staff', {
        method: 'POST',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(formData)
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Staff member added successfully!', 'success');
        this.hideModal('add-staff-modal');
        await this.loadStaffData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to add staff member', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to add staff member:', error);
      this.showToast('Failed to add staff member', 'error');
    }
  }

  async addShift(formData) {
    try {
      const response = await fetch('/api/staff/shifts', {
        method: 'POST',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(formData)
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Shift added successfully!', 'success');
        this.hideModal('add-shift-modal');
        await this.loadStaffData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to add shift', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to add shift:', error);
      this.showToast('Failed to add shift', 'error');
    }
  }

  async checkIn() {
    try {
      const response = await fetch('/api/staff/attendance/checkin', {
        method: 'POST',
        headers: this.auth.getAuthHeaders()
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        const result = await response.json();
        this.showToast('Checked in successfully!', 'success');
        await this.loadStaffData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to check in', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to check in:', error);
      this.showToast('Failed to check in', 'error');
    }
  }

  async checkOut() {
    try {
      const response = await fetch('/api/staff/attendance/checkout', {
        method: 'POST',
        headers: this.auth.getAuthHeaders()
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        const result = await response.json();
        this.showToast('Checked out successfully!', 'success');
        await this.loadStaffData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to check out', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to check out:', error);
      this.showToast('Failed to check out', 'error');
    }
  }

  async requestLeave(formData) {
    try {
      const response = await fetch('/api/staff/leave', {
        method: 'POST',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(formData)
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Leave request submitted successfully!', 'success');
        this.hideModal('request-leave-modal');
        await this.loadStaffData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to submit leave request', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to submit leave request:', error);
      this.showToast('Failed to submit leave request', 'error');
    }
  }

  async approveLeave(leaveId) {
    try {
      const response = await fetch(`/api/staff/leave/${leaveId}/approve`, {
        method: 'PATCH',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify({ status: 'Approved' })
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Leave request approved!', 'success');
        await this.loadStaffData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to approve leave', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to approve leave:', error);
      this.showToast('Failed to approve leave', 'error');
    }
  }

  async rejectLeave(leaveId) {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    try {
      const response = await fetch(`/api/staff/leave/${leaveId}/approve`, {
        method: 'PATCH',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify({ status: 'Rejected', rejection_reason: reason })
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Leave request rejected!', 'success');
        await this.loadStaffData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to reject leave', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to reject leave:', error);
      this.showToast('Failed to reject leave', 'error');
    }
  }

  // ===== STAFF CRUD OPERATIONS =====

  async editStaff(userId) {
    try {
      const response = await fetch(`/api/staff/${userId}`, {
        headers: this.auth.getAuthHeaders()
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        const staffMember = await response.json();
        this.populateEditStaffModal(staffMember);
        this.showModal('edit-staff-modal');
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to load staff member', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to load staff member:', error);
      this.showToast('Failed to load staff member', 'error');
    }
  }

  async deleteStaff(userId) {
    if (!confirm('Are you sure you want to delete this staff member? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/staff/${userId}`, {
        method: 'DELETE',
        headers: this.auth.getAuthHeaders()
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Staff member deleted successfully!', 'success');
        await this.loadStaffData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to delete staff member', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to delete staff member:', error);
      this.showToast('Failed to delete staff member', 'error');
    }
  }

  populateEditStaffModal(staffMember) {
    // Populate the edit modal with staff member data
    document.getElementById('edit-staff-id').value = staffMember.user_id;
    document.getElementById('edit-staff-username').value = staffMember.username;
    document.getElementById('edit-staff-full-name').value = staffMember.full_name;
    document.getElementById('edit-staff-email').value = staffMember.email || '';
    document.getElementById('edit-staff-employee-id').value = staffMember.employee_id || '';
    document.getElementById('edit-staff-role').value = staffMember.role;
    document.getElementById('edit-staff-department').value = staffMember.department;
    document.getElementById('edit-staff-position').value = staffMember.position;
    document.getElementById('edit-staff-phone').value = staffMember.phone || '';
    document.getElementById('edit-staff-hire-date').value = staffMember.hire_date ? new Date(staffMember.hire_date).toISOString().slice(0, 10) : '';
    document.getElementById('edit-staff-hourly-rate').value = staffMember.hourly_rate || '';
    document.getElementById('edit-staff-monthly-salary').value = staffMember.monthly_salary || '';
    document.getElementById('edit-staff-employment-type').value = staffMember.employment_type;
  }

  async updateStaff(formData) {
    const userId = document.getElementById('edit-staff-id').value;

    try {
      const response = await fetch(`/api/staff/${userId}`, {
        method: 'PATCH',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(formData)
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Staff member updated successfully!', 'success');
        this.hideModal('edit-staff-modal');
        await this.loadStaffData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to update staff member', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to update staff member:', error);
      this.showToast('Failed to update staff member', 'error');
    }
  }

  // ===== EQUIPMENT CRUD OPERATIONS =====

  async editEquipment(equipmentId) {
    try {
      const response = await fetch(`/api/inventory/equipment/${equipmentId}`, {
        headers: this.auth.getAuthHeaders()
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        const equipment = await response.json();
        this.populateEditEquipmentModal(equipment);
        this.showModal('edit-equipment-modal');
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to load equipment', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to load equipment:', error);
      this.showToast('Failed to load equipment', 'error');
    }
  }

  async deleteEquipment(equipmentId) {
    if (!confirm('Are you sure you want to delete this equipment? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/inventory/equipment/${equipmentId}`, {
        method: 'DELETE',
        headers: this.auth.getAuthHeaders()
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Equipment deleted successfully!', 'success');
        await this.loadInventoryData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to delete equipment', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to delete equipment:', error);
      this.showToast('Failed to delete equipment', 'error');
    }
  }

  populateEditEquipmentModal(equipment) {
    document.getElementById('edit-equipment-id').value = equipment.id;
    document.getElementById('edit-equipment-name').value = equipment.name;
    document.getElementById('edit-equipment-category').value = equipment.category;
    document.getElementById('edit-equipment-description').value = equipment.description || '';
    document.getElementById('edit-equipment-quantity').value = equipment.total_quantity;
    document.getElementById('edit-equipment-cost').value = equipment.unit_cost;
    document.getElementById('edit-equipment-reorder-level').value = equipment.reorder_level;
    document.getElementById('edit-equipment-location').value = equipment.location || '';
    document.getElementById('edit-equipment-condition').value = equipment.condition_status;
  }

  async updateEquipment(formData) {
    const equipmentId = document.getElementById('edit-equipment-id').value;

    try {
      const response = await fetch(`/api/inventory/equipment/${equipmentId}`, {
        method: 'PATCH',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(formData)
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Equipment updated successfully!', 'success');
        this.hideModal('edit-equipment-modal');
        await this.loadInventoryData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to update equipment', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to update equipment:', error);
      this.showToast('Failed to update equipment', 'error');
    }
  }

  // ===== CONSUMABLE CRUD OPERATIONS =====

  async editConsumable(consumableId) {
    try {
      const response = await fetch(`/api/inventory/consumables/${consumableId}`, {
        headers: this.auth.getAuthHeaders()
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        const consumable = await response.json();
        this.populateEditConsumableModal(consumable);
        this.showModal('edit-consumable-modal');
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to load consumable', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to load consumable:', error);
      this.showToast('Failed to load consumable', 'error');
    }
  }

  async deleteConsumable(consumableId) {
    if (!confirm('Are you sure you want to delete this consumable? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/inventory/consumables/${consumableId}`, {
        method: 'DELETE',
        headers: this.auth.getAuthHeaders()
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Consumable deleted successfully!', 'success');
        await this.loadInventoryData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to delete consumable', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to delete consumable:', error);
      this.showToast('Failed to delete consumable', 'error');
    }
  }

  populateEditConsumableModal(consumable) {
    document.getElementById('edit-consumable-id').value = consumable.id;
    document.getElementById('edit-consumable-name').value = consumable.name;
    document.getElementById('edit-consumable-category').value = consumable.category;
    document.getElementById('edit-consumable-description').value = consumable.description || '';
    document.getElementById('edit-consumable-stock').value = consumable.current_stock;
    document.getElementById('edit-consumable-cost').value = consumable.unit_cost;
    document.getElementById('edit-consumable-reorder-level').value = consumable.reorder_level;
    document.getElementById('edit-consumable-expiry').value = consumable.expiry_date ? new Date(consumable.expiry_date).toISOString().slice(0, 10) : '';
    document.getElementById('edit-consumable-location').value = consumable.storage_location || '';
  }

  async updateConsumable(formData) {
    const consumableId = document.getElementById('edit-consumable-id').value;

    try {
      const response = await fetch(`/api/inventory/consumables/${consumableId}`, {
        method: 'PATCH',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(formData)
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Consumable updated successfully!', 'success');
        this.hideModal('edit-consumable-modal');
        await this.loadInventoryData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to update consumable', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to update consumable:', error);
      this.showToast('Failed to update consumable', 'error');
    }
  }

  // ===== VENDOR CRUD OPERATIONS =====

  async editVendor(vendorId) {
    try {
      const response = await fetch(`/api/vendors/${vendorId}`, {
        headers: this.auth.getAuthHeaders()
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        const vendor = await response.json();
        this.populateEditVendorModal(vendor);
        this.showModal('edit-vendor-modal');
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to load vendor', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to load vendor:', error);
      this.showToast('Failed to load vendor', 'error');
    }
  }

  async deleteVendor(vendorId) {
    if (!confirm('Are you sure you want to delete this vendor? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/vendors/${vendorId}`, {
        method: 'DELETE',
        headers: this.auth.getAuthHeaders()
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Vendor deleted successfully!', 'success');
        await this.loadInventoryData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to delete vendor', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to delete vendor:', error);
      this.showToast('Failed to delete vendor', 'error');
    }
  }

  populateEditVendorModal(vendor) {
    document.getElementById('edit-vendor-id').value = vendor.id;
    document.getElementById('edit-vendor-name').value = vendor.name;
    document.getElementById('edit-vendor-contact').value = vendor.contact_person || '';
    document.getElementById('edit-vendor-phone').value = vendor.phone || '';
    document.getElementById('edit-vendor-email').value = vendor.email || '';
    document.getElementById('edit-vendor-address').value = vendor.address || '';
    document.getElementById('edit-vendor-payment-terms').value = vendor.payment_terms || '';
    document.getElementById('edit-vendor-rating').value = vendor.rating;
  }

  async updateVendor(formData) {
    const vendorId = document.getElementById('edit-vendor-id').value;

    try {
      const response = await fetch(`/api/vendors/${vendorId}`, {
        method: 'PATCH',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(formData)
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Vendor updated successfully!', 'success');
        this.hideModal('edit-vendor-modal');
        await this.loadInventoryData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to update vendor', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to update vendor:', error);
      this.showToast('Failed to update vendor', 'error');
    }
  }

  // ===== SHIFT CRUD OPERATIONS =====

  async editShift(shiftId) {
    try {
      const response = await fetch(`/api/staff/shifts/${shiftId}`, {
        headers: this.auth.getAuthHeaders()
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        const shift = await response.json();
        this.populateEditShiftModal(shift);
        this.showModal('edit-shift-modal');
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to load shift', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to load shift:', error);
      this.showToast('Failed to load shift', 'error');
    }
  }

  async deleteShift(shiftId) {
    if (!confirm('Are you sure you want to delete this shift? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/staff/shifts/${shiftId}`, {
        method: 'DELETE',
        headers: this.auth.getAuthHeaders()
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Shift deleted successfully!', 'success');
        await this.loadStaffData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to delete shift', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to delete shift:', error);
      this.showToast('Failed to delete shift', 'error');
    }
  }

  populateEditShiftModal(shift) {
    document.getElementById('edit-shift-id').value = shift.id;
    document.getElementById('edit-shift-staff').value = shift.staff_id;
    document.getElementById('edit-shift-date').value = new Date(shift.shift_date).toISOString().slice(0, 10);
    document.getElementById('edit-shift-start').value = shift.start_time;
    document.getElementById('edit-shift-end').value = shift.end_time;
    document.getElementById('edit-shift-break').value = shift.break_duration;
    document.getElementById('edit-shift-type').value = shift.shift_type;
    document.getElementById('edit-shift-notes').value = shift.notes || '';
  }

  async updateShift(formData) {
    const shiftId = document.getElementById('edit-shift-id').value;

    try {
      const response = await fetch(`/api/staff/shifts/${shiftId}`, {
        method: 'PATCH',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify(formData)
      });

      if (response.status === 401) {
        this.auth.handleAuthError();
        return;
      }

      if (response.ok) {
        this.showToast('Shift updated successfully!', 'success');
        this.hideModal('edit-shift-modal');
        await this.loadStaffData();
      } else {
        const error = await response.json();
        this.showToast(error.error || 'Failed to update shift', 'error');
      }
    } catch (error) {
      console.error('❌ Failed to update shift:', error);
      this.showToast('Failed to update shift', 'error');
    }
  }

  switchStaffTab(tabName) {
    // Update active tab
    const staffTabButtons = document.querySelectorAll('.staff-tabs .tab-btn');
    staffTabButtons.forEach(btn => {
      btn.classList.remove('active');
    });

    const activeStaffTabBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeStaffTabBtn) {
      activeStaffTabBtn.classList.add('active');
    }

    // Show selected tab content
    const staffTabPanes = document.querySelectorAll('#staff-section .tab-pane');
    staffTabPanes.forEach(pane => {
      pane.classList.remove('active');
    });

    const activeStaffTabPane = document.getElementById(`${tabName}-tab`);
    if (activeStaffTabPane) {
      activeStaffTabPane.classList.add('active');
    }

    this.currentStaffTab = tabName;
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

  // Navigation
  document.getElementById('dashboard-btn')?.addEventListener('click', () => {
    app.showDashboard();
  });

  // Membership management
  document.getElementById('membership-btn')?.addEventListener('click', () => {
    app.showMembershipSection();
  });

  // Inventory management
  document.getElementById('inventory-btn')?.addEventListener('click', () => {
    app.showInventorySection();
  });

  // Staff management
  document.getElementById('staff-btn')?.addEventListener('click', () => {
    app.showStaffSection();
  });

  // Inventory tabs
  document.querySelectorAll('.inventory-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabName = e.target.getAttribute('data-tab');
      app.switchInventoryTab(tabName);
    });
  });

  // Add equipment/consumable buttons
  document.getElementById('add-equipment-btn')?.addEventListener('click', () => {
    app.showAddEquipmentModal();
  });

  document.getElementById('add-consumable-btn')?.addEventListener('click', () => {
    app.showAddConsumableModal();
  });

  document.getElementById('manage-vendors-btn')?.addEventListener('click', () => {
    app.showVendorsModal();
  });

  document.getElementById('add-vendor-btn')?.addEventListener('click', () => {
    app.showModal('add-vendor-modal');
  });

  // Inventory forms
  document.getElementById('add-equipment-form')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = {
      name: document.getElementById('equipment-name').value,
      category: document.getElementById('equipment-category').value,
      description: document.getElementById('equipment-description').value,
      total_quantity: parseInt(document.getElementById('equipment-quantity').value),
      unit_cost: parseFloat(document.getElementById('equipment-cost').value),
      reorder_level: parseInt(document.getElementById('equipment-reorder-level').value),
      supplier_id: document.getElementById('equipment-supplier').value || null,
      location: document.getElementById('equipment-location').value,
      condition_status: document.getElementById('equipment-condition').value
    };

    app.addEquipment(formData);
  });

  document.getElementById('add-consumable-form')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = {
      name: document.getElementById('consumable-name').value,
      category: document.getElementById('consumable-category').value,
      description: document.getElementById('consumable-description').value,
      current_stock: parseInt(document.getElementById('consumable-stock').value),
      unit_cost: parseFloat(document.getElementById('consumable-cost').value),
      reorder_level: parseInt(document.getElementById('consumable-reorder-level').value),
      supplier_id: document.getElementById('consumable-supplier').value || null,
      expiry_date: document.getElementById('consumable-expiry').value || null,
      storage_location: document.getElementById('consumable-location').value
    };

    app.addConsumable(formData);
  });

  document.getElementById('add-vendor-form')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = {
      name: document.getElementById('vendor-name').value,
      contact_person: document.getElementById('vendor-contact').value,
      phone: document.getElementById('vendor-phone').value,
      email: document.getElementById('vendor-email').value,
      address: document.getElementById('vendor-address').value,
      payment_terms: document.getElementById('vendor-payment-terms').value,
      rating: parseInt(document.getElementById('vendor-rating').value)
    };

    app.addVendor(formData);
  });

  // Inventory filters
  document.getElementById('equipment-category-filter')?.addEventListener('change', () => {
    if (app && typeof app.filterEquipment === 'function') {
      app.filterEquipment();
    }
  });

  document.getElementById('low-stock-filter')?.addEventListener('change', () => {
    if (app && typeof app.filterEquipment === 'function') {
      app.filterEquipment();
    }
  });

  document.getElementById('consumables-category-filter')?.addEventListener('change', () => {
    if (app && typeof app.filterConsumables === 'function') {
      app.filterConsumables();
    }
  });

  document.getElementById('consumables-low-stock-filter')?.addEventListener('change', () => {
    if (app && typeof app.filterConsumables === 'function') {
      app.filterConsumables();
    }
  });

  document.getElementById('expiring-soon-filter')?.addEventListener('change', () => {
    if (app && typeof app.filterConsumables === 'function') {
      app.filterConsumables();
    }
  });

  // Staff management
  document.getElementById('add-staff-btn')?.addEventListener('click', () => {
    app.showAddStaffModal();
  });

  document.getElementById('manage-shifts-btn')?.addEventListener('click', () => {
    app.switchStaffTab('shifts');
  });

  document.getElementById('attendance-btn')?.addEventListener('click', () => {
    app.switchStaffTab('attendance');
  });

  document.getElementById('leave-btn')?.addEventListener('click', () => {
    app.switchStaffTab('leave');
  });

  document.getElementById('add-shift-btn')?.addEventListener('click', () => {
    app.showModal('add-shift-modal');
  });

  document.getElementById('request-leave-btn')?.addEventListener('click', () => {
    app.showModal('request-leave-modal');
  });

  document.getElementById('checkin-btn')?.addEventListener('click', () => {
    app.checkIn();
  });

  document.getElementById('checkout-btn')?.addEventListener('click', () => {
    app.checkOut();
  });

  // Staff tabs
  document.querySelectorAll('.staff-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabName = e.target.getAttribute('data-tab');
      app.switchStaffTab(tabName);
    });
  });

  // Staff forms
  document.getElementById('add-staff-form')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = {
      username: document.getElementById('staff-username').value,
      password: document.getElementById('staff-password').value,
      full_name: document.getElementById('staff-full-name').value,
      email: document.getElementById('staff-email').value,
      employee_id: document.getElementById('staff-employee-id').value,
      role: document.getElementById('staff-role').value,
      department: document.getElementById('staff-department').value,
      position: document.getElementById('staff-position').value,
      phone: document.getElementById('staff-phone').value,
      hire_date: document.getElementById('staff-hire-date').value,
      hourly_rate: parseFloat(document.getElementById('staff-hourly-rate').value) || null,
      monthly_salary: parseFloat(document.getElementById('staff-monthly-salary').value) || null,
      employment_type: document.getElementById('staff-employment-type').value,
      manager_id: document.getElementById('staff-manager').value || null
    };

    app.addStaff(formData);
  });

  document.getElementById('add-shift-form')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = {
      staff_id: document.getElementById('shift-staff').value,
      shift_date: document.getElementById('shift-date').value,
      start_time: document.getElementById('shift-start').value,
      end_time: document.getElementById('shift-end').value,
      break_duration: parseInt(document.getElementById('shift-break').value) || 30,
      shift_type: document.getElementById('shift-type').value,
      notes: document.getElementById('shift-notes').value
    };

    app.addShift(formData);
  });

  document.getElementById('request-leave-form')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = {
      leave_type: document.getElementById('leave-type').value,
      start_date: document.getElementById('leave-start').value,
      end_date: document.getElementById('leave-end').value,
      reason: document.getElementById('leave-reason').value
    };

    app.requestLeave(formData);
  });

  // Edit forms
  document.getElementById('edit-staff-form')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = {
      username: document.getElementById('edit-staff-username').value,
      full_name: document.getElementById('edit-staff-full-name').value,
      email: document.getElementById('edit-staff-email').value,
      employee_id: document.getElementById('edit-staff-employee-id').value,
      role: document.getElementById('edit-staff-role').value,
      department: document.getElementById('edit-staff-department').value,
      position: document.getElementById('edit-staff-position').value,
      phone: document.getElementById('edit-staff-phone').value,
      hire_date: document.getElementById('edit-staff-hire-date').value,
      hourly_rate: parseFloat(document.getElementById('edit-staff-hourly-rate').value) || null,
      monthly_salary: parseFloat(document.getElementById('edit-staff-monthly-salary').value) || null,
      employment_type: document.getElementById('edit-staff-employment-type').value
    };

    app.updateStaff(formData);
  });

  document.getElementById('edit-equipment-form')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = {
      name: document.getElementById('edit-equipment-name').value,
      category: document.getElementById('edit-equipment-category').value,
      description: document.getElementById('edit-equipment-description').value,
      total_quantity: parseInt(document.getElementById('edit-equipment-quantity').value),
      unit_cost: parseFloat(document.getElementById('edit-equipment-cost').value),
      reorder_level: parseInt(document.getElementById('edit-equipment-reorder-level').value),
      location: document.getElementById('edit-equipment-location').value,
      condition_status: document.getElementById('edit-equipment-condition').value
    };

    app.updateEquipment(formData);
  });

  document.getElementById('edit-consumable-form')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = {
      name: document.getElementById('edit-consumable-name').value,
      category: document.getElementById('edit-consumable-category').value,
      description: document.getElementById('edit-consumable-description').value,
      current_stock: parseInt(document.getElementById('edit-consumable-stock').value),
      unit_cost: parseFloat(document.getElementById('edit-consumable-cost').value),
      reorder_level: parseInt(document.getElementById('edit-consumable-reorder-level').value),
      expiry_date: document.getElementById('edit-consumable-expiry').value || null,
      storage_location: document.getElementById('edit-consumable-location').value
    };

    app.updateConsumable(formData);
  });

  document.getElementById('edit-vendor-form')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = {
      name: document.getElementById('edit-vendor-name').value,
      contact_person: document.getElementById('edit-vendor-contact').value,
      phone: document.getElementById('edit-vendor-phone').value,
      email: document.getElementById('edit-vendor-email').value,
      address: document.getElementById('edit-vendor-address').value,
      payment_terms: document.getElementById('edit-vendor-payment-terms').value,
      rating: parseInt(document.getElementById('edit-vendor-rating').value)
    };

    app.updateVendor(formData);
  });

  document.getElementById('edit-shift-form')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = {
      staff_id: document.getElementById('edit-shift-staff').value,
      shift_date: document.getElementById('edit-shift-date').value,
      start_time: document.getElementById('edit-shift-start').value,
      end_time: document.getElementById('edit-shift-end').value,
      break_duration: parseInt(document.getElementById('edit-shift-break').value) || 30,
      shift_type: document.getElementById('edit-shift-type').value,
      notes: document.getElementById('edit-shift-notes').value
    };

    app.updateShift(formData);
  });

  // Staff filters
  document.getElementById('staff-department-filter')?.addEventListener('change', () => {
    if (app && typeof app.filterStaff === 'function') {
      app.filterStaff();
    }
  });

  document.getElementById('active-staff-filter')?.addEventListener('change', () => {
    if (app && typeof app.filterStaff === 'function') {
      app.filterStaff();
    }
  });

  document.getElementById('attendance-date-filter')?.addEventListener('change', () => {
    if (app && typeof app.filterAttendance === 'function') {
      app.filterAttendance();
    }
  });

  document.getElementById('filter-attendance-btn')?.addEventListener('click', () => {
    if (app && typeof app.filterAttendance === 'function') {
      app.filterAttendance();
    }
  });

  // Membership management
  document.getElementById('add-member-btn')?.addEventListener('click', () => {
    app.showAddMemberModal();
  });

  document.getElementById('manage-tiers-btn')?.addEventListener('click', () => {
    app.switchMembershipTab('tiers');
  });

  document.getElementById('loyalty-program-btn')?.addEventListener('click', () => {
    app.switchMembershipTab('loyalty');
  });

  document.getElementById('earn-points-btn')?.addEventListener('click', () => {
    app.showModal('earn-points-modal');
  });

  document.getElementById('redeem-points-btn')?.addEventListener('click', () => {
    app.showModal('redeem-points-modal');
  });

  document.getElementById('generate-analytics-btn')?.addEventListener('click', () => {
    const memberId = document.getElementById('analytics-member-filter').value;
    if (memberId) {
      app.viewMemberAnalytics(memberId);
    } else {
      app.showToast('Please select a member', 'warning');
    }
  });

  // Membership tabs
  document.querySelectorAll('.membership-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabName = e.target.getAttribute('data-tab');
      app.switchMembershipTab(tabName);
    });
  });

  // Membership forms
  document.getElementById('add-member-form')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = {
      name: document.getElementById('member-name').value,
      phone: document.getElementById('member-phone').value,
      email: document.getElementById('member-email').value,
      date_of_birth: document.getElementById('member-dob').value,
      address: document.getElementById('member-address').value,
      membership_type: document.getElementById('member-tier').value,
      membership_start_date: document.getElementById('member-start-date').value,
      membership_expiry_date: document.getElementById('member-expiry-date').value,
      emergency_contact: document.getElementById('member-emergency-contact').value,
      notes: document.getElementById('member-notes').value
    };

    app.addMember(formData);
  });

  document.getElementById('edit-member-form')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = {
      name: document.getElementById('edit-member-name').value,
      phone: document.getElementById('edit-member-phone').value,
      email: document.getElementById('edit-member-email').value,
      date_of_birth: document.getElementById('edit-member-dob').value,
      address: document.getElementById('edit-member-address').value,
      membership_type: document.getElementById('edit-member-tier').value,
      membership_status: document.getElementById('edit-member-status').value,
      membership_start_date: document.getElementById('edit-member-start-date').value,
      membership_expiry_date: document.getElementById('edit-member-expiry-date').value,
      emergency_contact: document.getElementById('edit-member-emergency-contact').value,
      loyalty_points: parseInt(document.getElementById('edit-member-loyalty-points').value) || 0,
      notes: document.getElementById('edit-member-notes').value
    };

    app.updateMember(formData);
  });

  document.getElementById('add-tier-form')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = {
      name: document.getElementById('tier-name').value,
      description: document.getElementById('tier-description').value,
      monthly_fee: parseFloat(document.getElementById('tier-monthly-fee').value) || 0,
      annual_fee: parseFloat(document.getElementById('tier-annual-fee').value) || 0,
      session_discount_percent: parseInt(document.getElementById('tier-session-discount').value) || 0,
      consumable_discount_percent: parseInt(document.getElementById('tier-consumable-discount').value) || 0,
      free_sessions_per_month: parseInt(document.getElementById('tier-free-sessions').value) || 0,
      points_multiplier: parseFloat(document.getElementById('tier-points-multiplier').value) || 1.0,
      min_spending: parseFloat(document.getElementById('tier-min-spending').value) || 0,
      priority_booking: document.getElementById('tier-priority-booking').value === '1'
    };

    app.addTier(formData);
  });

  document.getElementById('earn-points-form')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = {
      customer_id: document.getElementById('earn-member').value,
      points: parseInt(document.getElementById('earn-points').value),
      transaction_type: 'EARNED',
      reference_type: document.getElementById('earn-reference-type').value,
      description: document.getElementById('earn-description').value
    };

    app.earnPoints(formData);
  });

  document.getElementById('redeem-points-form')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = {
      customer_id: document.getElementById('redeem-member').value,
      points: parseInt(document.getElementById('redeem-points').value),
      transaction_type: 'REDEEMED',
      description: document.getElementById('redeem-description').value
    };

    app.redeemPoints(formData);
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