class UserDashboard {
    constructor(authManager) {
        this.authManager = authManager;
        this.apiBaseUrl = 'http://localhost:3001/api';
        this.analyticsData = null;
        this.refreshInterval = null;
        this.initializeDashboard();
    }

    initializeDashboard() {
        this.createDashboardHTML();
        this.setupEventListeners();
        this.loadAnalytics();
        
        // Auto-refresh analytics every 30 seconds
        this.refreshInterval = setInterval(() => {
            this.loadAnalytics(false);
        }, 30000);
    }

    createDashboardHTML() {
        const dashboardHTML = `
            <div id="analyticsDashboard" class="analytics-dashboard" style="display: none;">
                <div class="dashboard-header">
                    <h2>📊 Your Analytics Dashboard</h2>
                    <div class="dashboard-controls">
                        <button id="refreshAnalytics" class="secondary-button">🔄 Refresh</button>
                        <button id="closeDashboard" class="secondary-button">✕ Close</button>
                    </div>
                </div>

                <div class="analytics-loading" id="analyticsLoading">
                    <div class="loading-spinner">📊</div>
                    <p>Loading your analytics...</p>
                </div>

                <div class="analytics-content" id="analyticsContent" style="display: none;">
                    <!-- Summary Cards -->
                    <div class="analytics-summary">
                        <div class="summary-card">
                            <div class="summary-icon">📄</div>
                            <div class="summary-data">
                                <div class="summary-number" id="totalDocuments">0</div>
                                <div class="summary-label">Documents Sent</div>
                            </div>
                        </div>
                        <div class="summary-card">
                            <div class="summary-icon">👁️</div>
                            <div class="summary-data">
                                <div class="summary-number" id="totalViews">0</div>
                                <div class="summary-label">Total Views</div>
                            </div>
                        </div>
                        <div class="summary-card">
                            <div class="summary-icon">👥</div>
                            <div class="summary-data">
                                <div class="summary-number" id="totalViewers">0</div>
                                <div class="summary-label">Unique Viewers</div>
                            </div>
                        </div>
                        <div class="summary-card">
                            <div class="summary-icon">📱</div>
                            <div class="summary-data">
                                <div class="summary-number" id="mobileViews">0</div>
                                <div class="summary-label">Mobile Views</div>
                            </div>
                        </div>
                    </div>

                    <!-- Charts Section -->
                    <div class="analytics-charts">
                        <div class="chart-container">
                            <h3>Device Breakdown</h3>
                            <div class="chart-content" id="deviceChart">
                                <div class="device-stats">
                                    <div class="device-stat">
                                        <span class="device-icon">🖥️</span>
                                        <span class="device-label">Desktop</span>
                                        <span class="device-count" id="desktopCount">0</span>
                                    </div>
                                    <div class="device-stat">
                                        <span class="device-icon">📱</span>
                                        <span class="device-label">Mobile</span>
                                        <span class="device-count" id="mobileCount">0</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="chart-container">
                            <h3>Browser Breakdown</h3>
                            <div class="chart-content" id="browserChart">
                                <!-- Dynamic browser stats will be inserted here -->
                            </div>
                        </div>

                        <div class="chart-container">
                            <h3>Geographic Distribution</h3>
                            <div class="chart-content" id="locationChart">
                                <!-- Dynamic location stats will be inserted here -->
                            </div>
                        </div>
                    </div>

                    <!-- Recent Activity -->
                    <div class="recent-activity">
                        <h3>Recent Document Views</h3>
                        <div class="activity-list" id="recentActivity">
                            <!-- Dynamic activity items will be inserted here -->
                        </div>
                    </div>
                </div>

                <div class="analytics-error" id="analyticsError" style="display: none;">
                    <div class="error-message">
                        <p>❌ Failed to load analytics data</p>
                        <button id="retryAnalytics" class="primary-button">Try Again</button>
                    </div>
                </div>
            </div>
        `;

        // Insert dashboard HTML into the main content area
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            mainContent.insertAdjacentHTML('beforeend', dashboardHTML);
        }
    }

    setupEventListeners() {
        // Dashboard controls
        const closeDashboard = document.getElementById('closeDashboard');
        if (closeDashboard) {
            closeDashboard.addEventListener('click', () => this.hideDashboard());
        }

        const refreshAnalytics = document.getElementById('refreshAnalytics');
        if (refreshAnalytics) {
            refreshAnalytics.addEventListener('click', () => this.loadAnalytics(true));
        }

        const retryAnalytics = document.getElementById('retryAnalytics');
        if (retryAnalytics) {
            retryAnalytics.addEventListener('click', () => this.loadAnalytics(true));
        }

        // Add dashboard button to main navigation
        this.addDashboardButton();
    }

    addDashboardButton() {
        const userInfo = document.getElementById('userInfo');
        if (userInfo && this.authManager.isAuthenticated()) {
            const dashboardButton = document.createElement('button');
            dashboardButton.id = 'showDashboard';
            dashboardButton.className = 'secondary-button';
            dashboardButton.innerHTML = '📊 Analytics';
            dashboardButton.addEventListener('click', () => this.showDashboard());
            
            userInfo.appendChild(dashboardButton);
        }
    }

    async loadAnalytics(showLoading = true) {
        if (!this.authManager.isAuthenticated()) {
            console.error('User not authenticated');
            return;
        }

        if (showLoading) {
            this.showLoading();
        }

        try {
            const token = this.authManager.token;
            const response = await fetch(`${this.apiBaseUrl}/analytics/user`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.success) {
                this.analyticsData = result.analytics;
                this.updateDashboard();
                this.showContent();
            } else {
                throw new Error(result.error || 'Failed to load analytics');
            }

        } catch (error) {
            console.error('Analytics loading error:', error);
            this.showError();
        }
    }

    updateDashboard() {
        if (!this.analyticsData) return;

        const data = this.analyticsData;

        // Update summary cards
        this.updateElement('totalDocuments', data.documentsSent || 0);
        this.updateElement('totalViews', data.totalViews || 0);
        this.updateElement('totalViewers', data.totalViewers || 0);
        this.updateElement('mobileViews', data.deviceBreakdown?.mobile || 0);

        // Update device breakdown
        this.updateElement('desktopCount', data.deviceBreakdown?.desktop || 0);
        this.updateElement('mobileCount', data.deviceBreakdown?.mobile || 0);

        // Update browser breakdown
        this.updateBrowserChart(data.browserBreakdown || {});

        // Update location breakdown
        this.updateLocationChart(data.locationBreakdown || {});

        // Update recent activity
        this.updateRecentActivity(data.recentActivity || []);
    }

    updateBrowserChart(browserData) {
        const browserChart = document.getElementById('browserChart');
        if (!browserChart) return;

        let browserHTML = '';
        const browsers = Object.entries(browserData);
        
        if (browsers.length === 0) {
            browserHTML = '<p class="no-data">No browser data available</p>';
        } else {
            browsers.forEach(([browser, count]) => {
                const icon = this.getBrowserIcon(browser);
                browserHTML += `
                    <div class="browser-stat">
                        <span class="browser-icon">${icon}</span>
                        <span class="browser-label">${browser}</span>
                        <span class="browser-count">${count}</span>
                    </div>
                `;
            });
        }

        browserChart.innerHTML = browserHTML;
    }

    updateLocationChart(locationData) {
        const locationChart = document.getElementById('locationChart');
        if (!locationChart) return;

        let locationHTML = '';
        const locations = Object.entries(locationData);
        
        if (locations.length === 0) {
            locationHTML = '<p class="no-data">No location data available</p>';
        } else {
            locations.forEach(([country, count]) => {
                const flag = this.getCountryFlag(country);
                locationHTML += `
                    <div class="location-stat">
                        <span class="location-flag">${flag}</span>
                        <span class="location-label">${country}</span>
                        <span class="location-count">${count}</span>
                    </div>
                `;
            });
        }

        locationChart.innerHTML = locationHTML;
    }

    updateRecentActivity(activities) {
        const activityList = document.getElementById('recentActivity');
        if (!activityList) return;

        let activityHTML = '';
        
        if (activities.length === 0) {
            activityHTML = '<p class="no-data">No recent activity</p>';
        } else {
            activities.slice(0, 10).forEach(activity => {
                const timeAgo = this.getTimeAgo(activity.timestamp);
                const duration = this.formatDuration(activity.duration);
                const viewingTime = this.formatDuration(activity.viewingTime);
                const deviceIcon = activity.device?.type === 'mobile' ? '📱' : '🖥️';
                const statusIcon = activity.completed ? '✅' : '⏸️';
                const violationIcon = activity.violations > 0 ? '⚠️' : '';

                activityHTML += `
                    <div class="activity-item">
                        <div class="activity-main">
                            <div class="activity-recipient">
                                📧 ${activity.recipientEmail}
                            </div>
                            <div class="activity-meta">
                                <span class="activity-time">${timeAgo}</span>
                                <span class="activity-device">${deviceIcon} ${activity.device?.browser || 'Unknown'}</span>
                                <span class="activity-location">📍 ${activity.location?.country || 'Unknown'}</span>
                            </div>
                        </div>
                        <div class="activity-stats">
                            <span class="stat" title="Session Duration">⏱️ ${duration}</span>
                            <span class="stat" title="Viewing Time">👁️ ${viewingTime}</span>
                            <span class="stat-status">${statusIcon}</span>
                            ${violationIcon ? `<span class="stat-violations" title="${activity.violations} violations">${violationIcon} ${activity.violations}</span>` : ''}
                        </div>
                    </div>
                `;
            });
        }

        activityList.innerHTML = activityHTML;
    }

    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    getBrowserIcon(browser) {
        const icons = {
            'Chrome': '🌐',
            'Firefox': '🦊',
            'Safari': '🧭',
            'Edge': '🔷',
            'Opera': '🎭'
        };
        return icons[browser] || '🌏';
    }

    getCountryFlag(country) {
        // Simple country flag mapping
        const flags = {
            'United States': '🇺🇸',
            'United Kingdom': '🇬🇧',
            'Canada': '🇨🇦',
            'Germany': '🇩🇪',
            'France': '🇫🇷',
            'Japan': '🇯🇵',
            'Australia': '🇦🇺',
            'Unknown': '🌍'
        };
        return flags[country] || '🏳️';
    }

    getTimeAgo(timestamp) {
        const now = new Date();
        const time = new Date(timestamp);
        const diffMs = now - time;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 30) return `${diffDays}d ago`;
        return time.toLocaleDateString();
    }

    formatDuration(ms) {
        if (!ms || ms < 0) return '0s';
        
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    showDashboard() {
        const dashboard = document.getElementById('analyticsDashboard');
        if (dashboard) {
            dashboard.style.display = 'block';
            this.loadAnalytics();
        }
    }

    hideDashboard() {
        const dashboard = document.getElementById('analyticsDashboard');
        if (dashboard) {
            dashboard.style.display = 'none';
        }
    }

    showLoading() {
        this.hideElement('analyticsContent');
        this.hideElement('analyticsError');
        this.showElement('analyticsLoading');
    }

    showContent() {
        this.hideElement('analyticsLoading');
        this.hideElement('analyticsError');
        this.showElement('analyticsContent');
    }

    showError() {
        this.hideElement('analyticsLoading');
        this.hideElement('analyticsContent');
        this.showElement('analyticsError');
    }

    showElement(id) {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = 'block';
        }
    }

    hideElement(id) {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = 'none';
        }
    }

    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }

        const dashboard = document.getElementById('analyticsDashboard');
        if (dashboard) {
            dashboard.remove();
        }
    }
}

// Make UserDashboard available globally
window.UserDashboard = UserDashboard;