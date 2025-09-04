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
                // Update local storage with new parlor name for immediate reflection
                const parlorName = settings.parlor_name;
                const oldName = localStorage.getItem('parlor_name');
                localStorage.setItem('parlor_name', parlorName);

                // Trigger storage event for other tabs/windows
                const storageEvent = new StorageEvent('storage', {
                    key: 'parlor_name',
                    newValue: parlorName,
                    oldValue: oldName,
                    storageArea: localStorage
                });
                window.dispatchEvent(storageEvent);
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
        console.log('🎯 openEditModal called with:', { id, type, hourlyRate });

        // Get modal element
        const modal = document.getElementById('editTableModal');
        if (!modal) {
            console.error('❌ Edit table modal not found!');
            alert('Modal element not found!');
            return;
        }

        console.log('✅ Modal element found');

        // Populate form fields
        const tableIdField = document.getElementById('editTableId');
        const tableTypeField = document.getElementById('editTableType');
        const hourlyRateField = document.getElementById('editHourlyRate');

        if (tableIdField) {
            tableIdField.value = id;
            console.log('Set table ID to:', id);
        }
        if (tableTypeField) {
            tableTypeField.value = type;
            console.log('Set table type to:', type);
        }
        if (hourlyRateField) {
            hourlyRateField.value = hourlyRate;
            console.log('Set hourly rate to:', hourlyRate);
        }

        // Force show modal with aggressive styling
        modal.classList.remove('hidden');
        modal.style.cssText = `
            display: flex !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background-color: rgba(0, 0, 0, 0.9) !important;
            z-index: 999999 !important;
            align-items: center !important;
            justify-content: center !important;
            opacity: 1 !important;
            visibility: visible !important;
        `;

        // Ensure modal content is visible
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.cssText = `
                display: block !important;
                background-color: #1a1a2e !important;
                border: 2px solid #00ff88 !important;
                border-radius: 15px !important;
                padding: 2rem !important;
                max-width: 400px !important;
                width: 90% !important;
                z-index: 1000000 !important;
                position: relative !important;
                color: white !important;
            `;
            console.log('✅ Modal content styled');
        }

        // Prevent body scrolling
        document.body.style.overflow = 'hidden';

        console.log('🎉 Modal should now be visible!');
        console.log('Modal display:', window.getComputedStyle(modal).display);
        console.log('Modal z-index:', window.getComputedStyle(modal).zIndex);

        // Add a visual confirmation
        const confirmDiv = document.createElement('div');
        confirmDiv.textContent = 'MODAL OPENED!';
        confirmDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: green;
            color: white;
            padding: 10px;
            border-radius: 5px;
            z-index: 1000001;
            font-weight: bold;
        `;
        document.body.appendChild(confirmDiv);
        setTimeout(() => {
            if (confirmDiv.parentNode) {
                confirmDiv.parentNode.removeChild(confirmDiv);
            }
        }, 2000);
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
        const modal = document.getElementById('editTableModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
            // Reset body scroll
            document.body.style.overflow = '';
        }
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
    
    updateDashboardHeader(parlorName) {
        // This method will be called from the main dashboard
        const headerElement = document.querySelector('.topbar-left h1');
        if (headerElement) {
            headerElement.innerHTML = `🎱 ${parlorName}`;
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
    const modal = document.getElementById('editTableModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        // Reset body scroll
        document.body.style.overflow = '';
    }
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