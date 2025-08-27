class AuthManager {
    constructor() {
        this.apiBaseUrl = 'http://localhost:3001/api';
        this.currentUser = null;
        this.token = localStorage.getItem('securesend_token');
        this.refreshTimer = null;
        this.initializeAuth();
    }

    async initializeAuth() {
        if (this.token) {
            try {
                const user = await this.validateToken();
                if (user) {
                    this.currentUser = user;
                    this.setupTokenRefresh();
                    this.showAuthenticatedUI();
                } else {
                    this.logout();
                }
            } catch (error) {
                console.error('Token validation failed:', error);
                this.logout();
            }
        } else {
            this.showUnauthenticatedUI();
        }
    }

    /**
     * User Registration
     */
    async register(userData) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: userData.email,
                    password: userData.password,
                    firstName: userData.firstName,
                    lastName: userData.lastName,
                    organization: userData.organization || null,
                    termsAccepted: userData.termsAccepted,
                    privacyAccepted: userData.privacyAccepted
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Registration failed');
            }

            // Auto-login after successful registration
            if (result.token) {
                this.setToken(result.token);
                this.currentUser = result.user;
                this.setupTokenRefresh();
                this.showAuthenticatedUI();
                
                // Send welcome email
                await this.sendWelcomeEmail(result.user);
            }

            return { success: true, user: result.user };

        } catch (error) {
            console.error('Registration error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * User Login
     */
    async login(credentials) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: credentials.email,
                    password: credentials.password,
                    rememberMe: credentials.rememberMe || false
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Login failed');
            }

            this.setToken(result.token);
            this.currentUser = result.user;
            this.setupTokenRefresh();
            this.showAuthenticatedUI();

            // Track login event
            await this.trackUserEvent('login', {
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                ip: await this.getClientIP()
            });

            return { success: true, user: result.user };

        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * User Logout
     */
    async logout() {
        try {
            if (this.token) {
                await fetch(`${this.apiBaseUrl}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json',
                    }
                });
            }
        } catch (error) {
            console.error('Logout error:', error);
        }

        this.clearToken();
        this.currentUser = null;
        this.clearTokenRefresh();
        this.showUnauthenticatedUI();
    }

    /**
     * Password Reset
     */
    async requestPasswordReset(email) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/auth/forgot-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Password reset request failed');
            }

            return { success: true, message: result.message };

        } catch (error) {
            console.error('Password reset error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Reset Password with Token
     */
    async resetPassword(token, newPassword) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/auth/reset-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    token, 
                    password: newPassword 
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Password reset failed');
            }

            return { success: true, message: result.message };

        } catch (error) {
            console.error('Password reset error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Token Management
     */
    setToken(token) {
        this.token = token;
        localStorage.setItem('securesend_token', token);
    }

    clearToken() {
        this.token = null;
        localStorage.removeItem('securesend_token');
    }

    getAuthHeaders() {
        return this.token ? {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
        } : {
            'Content-Type': 'application/json'
        };
    }

    /**
     * Token Validation and Refresh
     */
    async validateToken() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/auth/validate`, {
                headers: this.getAuthHeaders()
            });

            if (!response.ok) {
                throw new Error('Token validation failed');
            }

            const result = await response.json();
            return result.user;

        } catch (error) {
            console.error('Token validation error:', error);
            return null;
        }
    }

    setupTokenRefresh() {
        // Refresh token every 50 minutes (tokens expire in 60 minutes)
        this.refreshTimer = setInterval(async () => {
            try {
                const response = await fetch(`${this.apiBaseUrl}/auth/refresh`, {
                    headers: this.getAuthHeaders()
                });

                if (response.ok) {
                    const result = await response.json();
                    this.setToken(result.token);
                } else {
                    // Refresh failed, logout user
                    this.logout();
                }
            } catch (error) {
                console.error('Token refresh error:', error);
                this.logout();
            }
        }, 50 * 60 * 1000); // 50 minutes
    }

    clearTokenRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    /**
     * User Profile Management
     */
    async updateProfile(profileData) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/auth/profile`, {
                method: 'PUT',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(profileData)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Profile update failed');
            }

            this.currentUser = { ...this.currentUser, ...result.user };
            return { success: true, user: result.user };

        } catch (error) {
            console.error('Profile update error:', error);
            return { success: false, error: error.message };
        }
    }

    async changePassword(currentPassword, newPassword) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/auth/change-password`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    currentPassword,
                    newPassword
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Password change failed');
            }

            return { success: true, message: result.message };

        } catch (error) {
            console.error('Password change error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * UI Management
     */
    showAuthenticatedUI() {
        const authSection = document.getElementById('authSection');
        const mainContent = document.getElementById('mainContent');
        const userInfo = document.getElementById('userInfo');

        if (authSection) authSection.style.display = 'none';
        if (mainContent) mainContent.style.display = 'block';
        
        if (userInfo && this.currentUser) {
            userInfo.innerHTML = `
                <div class="user-profile">
                    <span class="user-name">${this.currentUser.firstName} ${this.currentUser.lastName}</span>
                    <span class="user-email">${this.currentUser.email}</span>
                    <button id="logoutButton" class="secondary-button">Logout</button>
                </div>
            `;

            // Add logout listener
            const logoutButton = document.getElementById('logoutButton');
            if (logoutButton) {
                logoutButton.addEventListener('click', () => this.logout());
            }
        }
    }

    showUnauthenticatedUI() {
        const authSection = document.getElementById('authSection');
        const mainContent = document.getElementById('mainContent');

        if (authSection) authSection.style.display = 'block';
        if (mainContent) mainContent.style.display = 'none';
    }

    /**
     * Utility Functions
     */
    async getClientIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            return 'unknown';
        }
    }

    async sendWelcomeEmail(user) {
        try {
            await fetch(`${this.apiBaseUrl}/email/welcome`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({ userId: user.id })
            });
        } catch (error) {
            console.error('Welcome email error:', error);
        }
    }

    async trackUserEvent(eventType, eventData) {
        try {
            await fetch(`${this.apiBaseUrl}/analytics/user-event`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    eventType,
                    eventData,
                    timestamp: new Date().toISOString()
                })
            });
        } catch (error) {
            console.error('Event tracking error:', error);
        }
    }

    /**
     * Form Validation
     */
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    validatePassword(password) {
        // Minimum 8 characters, at least one uppercase, one lowercase, one number
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
        return passwordRegex.test(password);
    }

    validateForm(formData, formType) {
        const errors = [];

        if (!formData.email || !this.validateEmail(formData.email)) {
            errors.push('Valid email address is required');
        }

        if (!formData.password || !this.validatePassword(formData.password)) {
            errors.push('Password must be at least 8 characters with uppercase, lowercase, and number');
        }

        if (formType === 'register') {
            if (!formData.firstName || formData.firstName.length < 2) {
                errors.push('First name must be at least 2 characters');
            }

            if (!formData.lastName || formData.lastName.length < 2) {
                errors.push('Last name must be at least 2 characters');
            }

            if (formData.password !== formData.confirmPassword) {
                errors.push('Passwords do not match');
            }

            if (!formData.termsAccepted) {
                errors.push('You must accept the terms of service');
            }

            if (!formData.privacyAccepted) {
                errors.push('You must accept the privacy policy');
            }
        }

        return errors;
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return !!(this.token && this.currentUser);
    }

    /**
     * Get current user
     */
    getCurrentUser() {
        return this.currentUser;
    }

    /**
     * Get user permissions
     */
    hasPermission(permission) {
        if (!this.currentUser) return false;
        return this.currentUser.permissions && this.currentUser.permissions.includes(permission);
    }
}

// Make AuthManager available globally
window.AuthManager = AuthManager;