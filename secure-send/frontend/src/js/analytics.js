class AnalyticsManager {
    constructor() {
        this.apiBaseUrl = 'http://localhost:3001/api';
        this.sessionId = null;
        this.viewStartTime = null;
        this.isTracking = false;
        this.heartbeatInterval = null;
        this.events = [];
    }

    /**
     * Initialize analytics session when document is accessed
     */
    initializeSession(sessionId) {
        this.sessionId = sessionId;
        this.isTracking = true;

        // Start heartbeat to track viewing time
        this.startHeartbeat();

        // Track page visibility changes
        this.setupVisibilityTracking();

        // Track security violations
        this.setupViolationTracking();

        console.log('Analytics session initialized:', sessionId);
    }

    /**
     * Track session events
     */
    async trackEvent(eventType, eventData = {}) {
        if (!this.sessionId || !this.isTracking) {
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/analytics/session/${this.sessionId}/event`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    eventType,
                    eventData: {
                        ...eventData,
                        userAgent: navigator.userAgent,
                        timestamp: new Date().toISOString(),
                        url: window.location.href,
                        screenResolution: `${screen.width}x${screen.height}`,
                        viewport: `${window.innerWidth}x${window.innerHeight}`
                    }
                })
            });

            if (!response.ok) {
                console.warn('Analytics tracking failed:', response.status);
                return;
            }

            // Store locally as backup
            this.events.push({
                eventType,
                eventData,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Analytics tracking error:', error);
        }
    }

    /**
     * Start viewing session
     */
    startViewing() {
        this.viewStartTime = new Date();
        this.trackEvent('VIEW_START', {
            documentViewer: 'opened',
            startTime: this.viewStartTime.toISOString()
        });
    }

    /**
     * End viewing session
     */
    endViewing() {
        if (this.viewStartTime) {
            const viewDuration = Date.now() - this.viewStartTime.getTime();
            this.trackEvent('VIEW_END', {
                documentViewer: 'closed',
                endTime: new Date().toISOString(),
                duration: viewDuration
            });
            this.viewStartTime = null;
        }
    }

    /**
     * Track security violations
     */
    trackViolation(violationType, details = {}) {
        this.trackEvent('VIOLATION', {
            type: violationType,
            severity: this.getViolationSeverity(violationType),
            details,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * End analytics session
     */
    async endSession() {
        if (!this.sessionId || !this.isTracking) {
            return;
        }

        // End any active viewing
        this.endViewing();

        // Stop heartbeat
        this.stopHeartbeat();

        // Send final session event
        await this.trackEvent('SESSION_END', {
            totalEvents: this.events.length,
            sessionDuration: Date.now() - (this.sessionStartTime || Date.now()),
            endReason: 'user_action'
        });

        // Cleanup
        this.cleanup();
        
        console.log('Analytics session ended');
    }

    /**
     * Setup heartbeat for continuous tracking
     */
    startHeartbeat() {
        // Send heartbeat every 30 seconds while viewing
        this.heartbeatInterval = setInterval(() => {
            if (this.viewStartTime && document.visibilityState === 'visible') {
                this.trackEvent('HEARTBEAT', {
                    activeViewTime: Date.now() - this.viewStartTime.getTime(),
                    scrollPosition: window.pageYOffset,
                    isActive: !this.isPageInactive()
                });
            }
        }, 30000); // 30 seconds
    }

    /**
     * Stop heartbeat tracking
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Setup page visibility tracking
     */
    setupVisibilityTracking() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.trackEvent('PAGE_HIDDEN', {
                    reason: 'visibility_change'
                });
                if (this.viewStartTime) {
                    this.endViewing();
                }
            } else {
                this.trackEvent('PAGE_VISIBLE', {
                    reason: 'visibility_change'
                });
                if (!this.viewStartTime) {
                    this.startViewing();
                }
            }
        });

        // Track page unload
        window.addEventListener('beforeunload', () => {
            this.endSession();
        });

        // Track focus/blur events
        window.addEventListener('focus', () => {
            this.trackEvent('WINDOW_FOCUS');
        });

        window.addEventListener('blur', () => {
            this.trackEvent('WINDOW_BLUR');
        });
    }

    /**
     * Setup security violation tracking
     */
    setupViolationTracking() {
        // Track right-click attempts
        document.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            this.trackViolation('RIGHT_CLICK_ATTEMPT', {
                element: event.target.tagName,
                prevented: true
            });
        });

        // Track key press violations
        document.addEventListener('keydown', (event) => {
            const forbiddenKeys = [
                'F12', 'F5', 'PrintScreen',
                { key: 's', ctrl: true }, // Ctrl+S
                { key: 'p', ctrl: true }, // Ctrl+P
                { key: 'c', ctrl: true }, // Ctrl+C
                { key: 'a', ctrl: true }, // Ctrl+A
                { key: 'u', ctrl: true }, // Ctrl+U
                { key: 'i', ctrl: true, shift: true } // Ctrl+Shift+I
            ];

            const isForbidden = forbiddenKeys.some(forbidden => {
                if (typeof forbidden === 'string') {
                    return event.key === forbidden;
                }
                return event.key === forbidden.key && 
                       event.ctrlKey === !!forbidden.ctrl && 
                       event.shiftKey === !!forbidden.shift;
            });

            if (isForbidden) {
                event.preventDefault();
                this.trackViolation('FORBIDDEN_KEYPRESS', {
                    key: event.key,
                    ctrlKey: event.ctrlKey,
                    shiftKey: event.shiftKey,
                    prevented: true
                });
            }
        });

        // Track drag attempts
        document.addEventListener('dragstart', (event) => {
            event.preventDefault();
            this.trackViolation('DRAG_ATTEMPT', {
                element: event.target.tagName,
                prevented: true
            });
        });

        // Track selection attempts
        document.addEventListener('selectstart', (event) => {
            if (event.target.closest('.document-viewer')) {
                event.preventDefault();
                this.trackViolation('TEXT_SELECTION_ATTEMPT', {
                    element: event.target.tagName,
                    prevented: true
                });
            }
        });

        // Track dev tools detection
        this.setupDevToolsDetection();
    }

    /**
     * Setup developer tools detection
     */
    setupDevToolsDetection() {
        let devToolsOpen = false;
        const threshold = 160;

        setInterval(() => {
            const widthThreshold = window.outerWidth - window.innerWidth > threshold;
            const heightThreshold = window.outerHeight - window.innerHeight > threshold;
            
            if (widthThreshold || heightThreshold) {
                if (!devToolsOpen) {
                    devToolsOpen = true;
                    this.trackViolation('DEV_TOOLS_OPENED', {
                        method: 'size_detection',
                        outerWidth: window.outerWidth,
                        innerWidth: window.innerWidth,
                        outerHeight: window.outerHeight,
                        innerHeight: window.innerHeight
                    });
                }
            } else {
                if (devToolsOpen) {
                    devToolsOpen = false;
                    this.trackViolation('DEV_TOOLS_CLOSED', {
                        method: 'size_detection'
                    });
                }
            }
        }, 500);
    }

    /**
     * Get violation severity level
     */
    getViolationSeverity(violationType) {
        const severityMap = {
            'RIGHT_CLICK_ATTEMPT': 'low',
            'TEXT_SELECTION_ATTEMPT': 'low',
            'DRAG_ATTEMPT': 'medium',
            'FORBIDDEN_KEYPRESS': 'medium',
            'DEV_TOOLS_OPENED': 'high',
            'SCREENSHOT_ATTEMPT': 'high',
            'PRINT_ATTEMPT': 'high'
        };
        
        return severityMap[violationType] || 'medium';
    }

    /**
     * Check if page appears inactive
     */
    isPageInactive() {
        return document.hidden || 
               !document.hasFocus() || 
               Date.now() - this.lastActivityTime > 60000; // 1 minute
    }

    /**
     * Get session analytics from server
     */
    async getSessionAnalytics(sessionId = this.sessionId) {
        if (!sessionId) {
            return null;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/analytics/session/${sessionId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch session analytics');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Failed to retrieve session analytics:', error);
            return null;
        }
    }

    /**
     * Get user analytics (requires authentication)
     */
    async getUserAnalytics(authToken) {
        if (!authToken) {
            return null;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/analytics/user`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch user analytics');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Failed to retrieve user analytics:', error);
            return null;
        }
    }

    /**
     * Cleanup analytics session
     */
    cleanup() {
        this.stopHeartbeat();
        this.sessionId = null;
        this.viewStartTime = null;
        this.isTracking = false;
        this.events = [];
    }

    /**
     * Track camera recording events
     */
    trackCameraEvent(eventType, eventData = {}) {
        this.trackEvent('CAMERA_EVENT', {
            cameraEventType: eventType,
            ...eventData
        });
    }

    /**
     * Track document interactions
     */
    trackDocumentInteraction(interactionType, details = {}) {
        this.trackEvent('DOCUMENT_INTERACTION', {
            interactionType,
            details,
            timestamp: new Date().toISOString()
        });
    }
}

// Make AnalyticsManager available globally
window.AnalyticsManager = AnalyticsManager;