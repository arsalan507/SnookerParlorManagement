class SettingsManager {
    constructor() {
        this.token = localStorage.getItem('auth_token');
        this.user = JSON.parse(localStorage.getItem('user_data') || '{}');
        
        if (!this.token || this.user.role !== 'admin') {
            window.location.href = '/login.html';
            return;
        }
        
        this.init();
    }
    
    init() {
        this.loadSettings();
        this.loadTables();
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // General settings form
        document.getElementById('generalSettingsForm').addEventListener('submit', this.saveGeneralSettings.bind(this));
        
        // Add table form
        document.getElementById('addTableForm').addEventListener('submit', this.addTable.bind(this));
        
        // Edit table form
        document.getElementById('editTableForm').addEventListener('submit', this.editTable.bind(this));
        
        // System settings form
        document.getElementById('systemSettingsForm').addEventListener('submit', this.saveSystemSettings.bind(this));
        
        // Backup button
        document.getElementById('backupBtn').addEventListener('click', this.createBackup.bind(this));
    }
    
    async makeRequest(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            }
        };
        
        const response = await fetch(url, { ...defaultOptions, ...options });
        
        if (response.status === 401) {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_data');
            window.location.href = '/login.html';
            return;
        }
        
        return response;
    }
    
    async loadSettings() {
        try {
            const response = await this.makeRequest('/api/settings');
            
            if (response.ok) {
                const settings = await response.json();
                
                // Populate general settings
                document.getElementById('parlorName').value = settings.parlor_name?.value || 'Snooker Parlor';
                document.getElementById('defaultEnglishRate').value = settings.default_english_rate?.value || '300';
                document.getElementById('defaultFrenchRate').value = settings.default_french_rate?.value || '300';
                document.getElementById('allowFriendlyGames').value = settings.allow_friendly_games?.value || 'true';
                
                // Populate system settings
                document.getElementById('sessionTimeout').value = settings.session_timeout?.value || '24';
                document.getElementById('autoBackup').value = settings.auto_backup_enabled?.value || 'true';
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            this.showMessage('generalMessage', 'Failed to load settings', 'error');
        }
    }
    
    async loadTables() {
        try {
            const response = await this.makeRequest('/api/tables');
            
            if (response.ok) {
                const tables = await response.json();
                this.renderTables(tables);
            }
        } catch (error) {
            console.error('Error loading tables:', error);
            this.showMessage('tableMessage', 'Failed to load tables', 'error');
        }
    }
    
    renderTables(tables) {
        const tablesList = document.getElementById('tablesList');
        
        if (tables.length === 0) {
            tablesList.innerHTML = '<p style="color: rgba(255, 255, 255, 0.7); text-align: center;">No tables found</p>';
            return;
        }
        
        tablesList.innerHTML = tables.map(table => `
            <div class="table-item">
                <div class="table-info">
                    <strong>Table ${table.id}</strong> - ${table.type} (₹${table.hourly_rate}/hr)
                    <br>
                    <small style="color: rgba(255, 255, 255, 0.6);">Status: ${table.status}</small>
                </div>
                <div class="table-actions">
                    <button class="btn btn-primary btn-small" onclick="settingsManager.openEditModal(${table.id}, '${table.type}', ${table.hourly_rate})">
                        Edit
                    </button>
                    <button class="btn btn-danger btn-small" onclick="settingsManager.deleteTable(${table.id})" 
                            ${table.status === 'OCCUPIED' ? 'disabled title="Cannot delete occupied table"' : ''}>
                        Delete
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    async saveGeneralSettings(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const settings = {};
        
        for (const [key, value] of formData.entries()) {
            settings[key] = value;
        }
        
        try {
            const response = await this.makeRequest('/api/settings', {
                method: 'PATCH',
                body: JSON.stringify(settings)
            });
            
            if (response.ok) {
                this.showMessage('generalMessage', 'General settings saved successfully', 'success');
            } else {
                const error = await response.json();
                this.showMessage('generalMessage', error.error || 'Failed to save settings', 'error');
            }
        } catch (error) {
            console.error('Error saving general settings:', error);
            this.showMessage('generalMessage', 'Failed to save settings', 'error');
        }
    }
    
    async saveSystemSettings(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const settings = {};
        
        for (const [key, value] of formData.entries()) {
            settings[key] = value;
        }
        
        try {
            const response = await this.makeRequest('/api/settings', {
                method: 'PATCH',
                body: JSON.stringify(settings)
            });
            
            if (response.ok) {
                this.showMessage('systemMessage', 'System settings saved successfully', 'success');
            } else {
                const error = await response.json();
                this.showMessage('systemMessage', error.error || 'Failed to save settings', 'error');
            }
        } catch (error) {
            console.error('Error saving system settings:', error);
            this.showMessage('systemMessage', 'Failed to save settings', 'error');
        }
    }
    
    async addTable(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const tableData = {
            type: formData.get('type'),
            hourly_rate: parseInt(formData.get('hourly_rate'))
        };
        
        try {
            const response = await this.makeRequest('/api/admin/tables', {
                method: 'POST',
                body: JSON.stringify(tableData)
            });
            
            if (response.ok) {
                this.showMessage('tableMessage', 'Table added successfully', 'success');
                e.target.reset();
                this.loadTables(); // Refresh table list
            } else {
                const error = await response.json();
                this.showMessage('tableMessage', error.error || 'Failed to add table', 'error');
            }
        } catch (error) {
            console.error('Error adding table:', error);
            this.showMessage('tableMessage', 'Failed to add table', 'error');
        }
    }
    
    openEditModal(id, type, hourlyRate) {
        document.getElementById('editTableId').value = id;
        document.getElementById('editTableType').value = type;
        document.getElementById('editHourlyRate').value = hourlyRate;
        document.getElementById('editTableModal').classList.remove('hidden');
    }
    
    async editTable(e) {
        e.preventDefault();
        
        const tableId = document.getElementById('editTableId').value;
        const formData = new FormData(e.target);
        const tableData = {
            type: formData.get('type'),
            hourly_rate: parseInt(formData.get('hourly_rate'))
        };
        
        try {
            const response = await this.makeRequest(`/api/admin/tables/${tableId}`, {
                method: 'PATCH',
                body: JSON.stringify(tableData)
            });
            
            if (response.ok) {
                this.showMessage('tableMessage', 'Table updated successfully', 'success');
                this.closeEditModal();
                this.loadTables(); // Refresh table list
            } else {
                const error = await response.json();
                this.showMessage('tableMessage', error.error || 'Failed to update table', 'error');
            }
        } catch (error) {
            console.error('Error updating table:', error);
            this.showMessage('tableMessage', 'Failed to update table', 'error');
        }
    }
    
    async deleteTable(tableId) {
        if (!confirm('Are you sure you want to delete this table? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await this.makeRequest(`/api/admin/tables/${tableId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                this.showMessage('tableMessage', 'Table deleted successfully', 'success');
                this.loadTables(); // Refresh table list
            } else {
                const error = await response.json();
                this.showMessage('tableMessage', error.error || 'Failed to delete table', 'error');
            }
        } catch (error) {
            console.error('Error deleting table:', error);
            this.showMessage('tableMessage', 'Failed to delete table', 'error');
        }
    }
    
    closeEditModal() {
        document.getElementById('editTableModal').classList.add('hidden');
    }
    
    async createBackup() {
        try {
            const response = await this.makeRequest('/api/admin/backup', {
                method: 'POST'
            });
            
            if (response.ok) {
                const result = await response.json();
                this.showMessage('systemMessage', 'Backup created successfully', 'success');
            } else {
                const error = await response.json();
                this.showMessage('systemMessage', error.error || 'Failed to create backup', 'error');
            }
        } catch (error) {
            console.error('Error creating backup:', error);
            this.showMessage('systemMessage', 'Failed to create backup', 'error');
        }
    }
    
    showMessage(elementId, message, type) {
        const element = document.getElementById(elementId);
        element.className = type === 'success' ? 'success-message' : 'error-message';
        element.textContent = message;
        element.style.display = 'block';
        
        // Hide message after 5 seconds
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }
}

// Global functions for modal
function closeEditModal() {
    document.getElementById('editTableModal').classList.add('hidden');
}

// Initialize settings manager
let settingsManager;
document.addEventListener('DOMContentLoaded', () => {
    settingsManager = new SettingsManager();
});

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        closeEditModal();
    }
});