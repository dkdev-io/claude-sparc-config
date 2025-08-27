class SecureSend {
    constructor() {
        this.currentMode = 'send';
        this.apiBaseUrl = 'http://localhost:3001/api';
        
        // Initialize core components
        this.authManager = new AuthManager();
        this.cryptoManager = new CryptoManager();
        this.cameraRecorder = new CameraRecorder();
        this.analyticsManager = new AnalyticsManager();
        this.documentManager = null;
        this.userDashboard = null;
        
        // Wait for auth initialization then setup components
        setTimeout(() => {
            this.initializeApp();
        }, 100);
    }

    async initializeApp() {
        // Initialize document manager after auth is ready
        this.documentManager = new DocumentManager(this.authManager, this.cryptoManager);
        
        // Initialize dashboard if user is authenticated
        if (this.authManager.isAuthenticated()) {
            this.userDashboard = new UserDashboard(this.authManager);
        }

        this.initializeEventListeners();
        this.setupAuthEventListeners();
        this.checkURLParams();
    }

    initializeEventListeners() {
        // Mode switching
        const sendModeBtn = document.getElementById('sendMode');
        const receiveModeBtn = document.getElementById('receiveMode');
        
        if (sendModeBtn) {
            sendModeBtn.addEventListener('click', () => this.switchMode('send'));
        }
        if (receiveModeBtn) {
            receiveModeBtn.addEventListener('click', () => this.switchMode('receive'));
        }

        // Receive mode listeners
        const accessButton = document.getElementById('accessButton');
        if (accessButton) {
            accessButton.addEventListener('click', () => this.accessDocument());
        }

        // Camera consent listeners
        const consentButton = document.getElementById('consentButton');
        const declineButton = document.getElementById('declineButton');
        
        if (consentButton) {
            consentButton.addEventListener('click', () => this.handleCameraConsent(true));
        }
        if (declineButton) {
            declineButton.addEventListener('click', () => this.handleCameraConsent(false));
        }

        // Security modal
        const securityOkButton = document.getElementById('securityOkButton');
        if (securityOkButton) {
            securityOkButton.addEventListener('click', () => this.closeSecurityModal());
        }

        // Global security listeners
        this.setupGlobalSecurity();
    }

    setupAuthEventListeners() {
        // Login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Registration form
        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => this.handleRegistration(e));
        }

        // Password reset form
        const resetForm = document.getElementById('resetForm');
        if (resetForm) {
            resetForm.addEventListener('submit', (e) => this.handlePasswordReset(e));
        }

        // Auth tab switching
        const loginTab = document.getElementById('loginTab');
        const registerTab = document.getElementById('registerTab');
        
        if (loginTab) {
            loginTab.addEventListener('click', () => this.switchAuthTab('login'));
        }
        if (registerTab) {
            registerTab.addEventListener('click', () => this.switchAuthTab('register'));
        }

        // Password reset link
        const forgotPasswordLink = document.getElementById('forgotPasswordLink');
        const backToLoginLink = document.getElementById('backToLoginLink');
        
        if (forgotPasswordLink) {
            forgotPasswordLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showPasswordReset();
            });
        }
        if (backToLoginLink) {
            backToLoginLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchAuthTab('login');
            });
        }
    }

    async handleLogin(event) {
        event.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const rememberMe = document.getElementById('rememberMe').checked;

        const result = await this.authManager.login({ email, password, rememberMe });
        
        if (result.success) {
            this.showAlert('Login successful! Welcome back.', 'success');
            
            // Initialize dashboard for authenticated user
            if (!this.userDashboard) {
                this.userDashboard = new UserDashboard(this.authManager);
            }
        } else {
            this.showAlert(result.error || 'Login failed', 'error');
        }
    }

    async handleRegistration(event) {
        event.preventDefault();
        
        const formData = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            email: document.getElementById('registerEmail').value,
            organization: document.getElementById('organization').value,
            password: document.getElementById('registerPassword').value,
            confirmPassword: document.getElementById('confirmPassword').value,
            termsAccepted: document.getElementById('termsAccepted').checked,
            privacyAccepted: document.getElementById('privacyAccepted').checked
        };

        // Client-side validation
        const errors = this.authManager.validateForm(formData, 'register');
        if (errors.length > 0) {
            this.showAlert(errors.join('\\n'), 'error');
            return;
        }

        const result = await this.authManager.register(formData);
        
        if (result.success) {
            this.showAlert('Registration successful! Welcome to SecureSend.', 'success');
            
            // Initialize dashboard for new user
            if (!this.userDashboard) {
                this.userDashboard = new UserDashboard(this.authManager);
            }
        } else {
            this.showAlert(result.error || 'Registration failed', 'error');
        }
    }

    async handlePasswordReset(event) {
        event.preventDefault();
        
        const email = document.getElementById('resetEmail').value;
        
        if (!this.authManager.validateEmail(email)) {
            this.showAlert('Please enter a valid email address', 'error');
            return;
        }

        const result = await this.authManager.requestPasswordReset(email);
        
        if (result.success) {
            this.showAlert('Password reset email sent! Check your inbox.', 'success');
            setTimeout(() => this.switchAuthTab('login'), 2000);
        } else {
            this.showAlert(result.error || 'Password reset failed', 'error');
        }
    }

    switchAuthTab(tab) {
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const resetForm = document.getElementById('resetForm');
        const loginTab = document.getElementById('loginTab');
        const registerTab = document.getElementById('registerTab');

        // Hide all forms
        if (loginForm) loginForm.style.display = 'none';
        if (registerForm) registerForm.style.display = 'none';
        if (resetForm) resetForm.style.display = 'none';

        // Remove active class from tabs
        if (loginTab) loginTab.classList.remove('active');
        if (registerTab) registerTab.classList.remove('active');

        // Show selected form and activate tab
        switch (tab) {
            case 'login':
                if (loginForm) loginForm.style.display = 'block';
                if (loginTab) loginTab.classList.add('active');
                break;
            case 'register':
                if (registerForm) registerForm.style.display = 'block';
                if (registerTab) registerTab.classList.add('active');
                break;
            case 'reset':
                if (resetForm) resetForm.style.display = 'block';
                break;
        }
    }

    showPasswordReset() {
        this.switchAuthTab('reset');
    }

    switchMode(mode) {
        this.currentMode = mode;
        
        const sendSection = document.getElementById('sendSection');
        const receiveSection = document.getElementById('receiveSection');
        const sendModeBtn = document.getElementById('sendMode');
        const receiveModeBtn = document.getElementById('receiveMode');

        if (mode === 'send') {
            if (sendSection) sendSection.style.display = 'block';
            if (receiveSection) receiveSection.style.display = 'none';
            if (sendModeBtn) sendModeBtn.classList.add('active');
            if (receiveModeBtn) receiveModeBtn.classList.remove('active');
        } else {
            if (sendSection) sendSection.style.display = 'none';
            if (receiveSection) receiveSection.style.display = 'block';
            if (sendModeBtn) sendModeBtn.classList.remove('active');
            if (receiveModeBtn) receiveModeBtn.classList.add('active');
        }
    }

    async accessDocument() {
        const accessCodeInput = document.getElementById('accessCodeInput');
        const accessCode = accessCodeInput?.value?.trim()?.toUpperCase();

        if (!accessCode) {
            this.showAlert('Please enter an access code', 'error');
            return;
        }

        if (!this.validateAccessCode(accessCode)) {
            this.showAlert('Invalid access code format', 'error');
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/documents/access`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    accessCode,
                    requestTimestamp: new Date().toISOString()
                })
            });

            const result = await response.json();

            if (!result.success) {
                this.showAlert(result.error || 'Failed to access document', 'error');
                return;
            }

            // Initialize analytics session
            if (result.sessionId) {
                this.analyticsManager.initializeSession(result.sessionId);
            }

            const document = result.document;

            // Check if camera is required
            if (document.cameraRequired) {
                this.showCameraConsent(document);
            } else {
                this.displayDocument(document);
            }

        } catch (error) {
            console.error('Document access error:', error);
            this.showAlert('Failed to access document. Please try again.', 'error');
        }
    }

    validateAccessCode(code) {
        return /^[A-Z0-9]{8,16}$/.test(code);
    }

    showCameraConsent(document) {
        const cameraConsent = document.getElementById('cameraConsent');
        const receiveSection = document.getElementById('receiveSection');
        
        if (cameraConsent) {
            cameraConsent.style.display = 'block';
            this.pendingDocument = document;
        }
        if (receiveSection) {
            receiveSection.style.display = 'none';
        }
    }

    async handleCameraConsent(accepted) {
        const cameraConsent = document.getElementById('cameraConsent');
        
        if (!accepted) {
            if (cameraConsent) cameraConsent.style.display = 'none';
            this.switchMode('receive');
            this.showAlert('Camera recording is required to view this document', 'error');
            return;
        }

        try {
            // Start camera recording
            await this.cameraRecorder.startRecording();
            
            // Track camera event
            this.analyticsManager.trackCameraEvent('RECORDING_STARTED', {
                consentGiven: true,
                timestamp: new Date().toISOString()
            });

            if (cameraConsent) cameraConsent.style.display = 'none';
            this.displayDocument(this.pendingDocument);
            
        } catch (error) {
            console.error('Camera recording error:', error);
            this.showAlert('Failed to start camera recording', 'error');
            if (cameraConsent) cameraConsent.style.display = 'none';
            this.switchMode('receive');
        }
    }

    displayDocument(document) {
        const viewerSection = document.getElementById('viewerSection');
        const documentViewer = document.getElementById('documentViewer');
        const cameraIndicator = document.getElementById('cameraIndicator');

        if (!viewerSection || !documentViewer) return;

        try {
            // Decrypt the document content
            const decryptedContent = this.cryptoManager.decryptFile(
                document.encryptedFile.data,
                document.encryptedFile.key,
                document.encryptedFile.iv
            );

            // Display the document
            this.renderDocument(documentViewer, decryptedContent, document.metadata);
            
            // Show viewer section
            viewerSection.style.display = 'block';

            // Show camera indicator if recording
            if (document.cameraRequired && cameraIndicator) {
                cameraIndicator.style.display = 'block';
            }

            // Set up watermark
            this.setupWatermark(document);

            // Start analytics tracking
            this.analyticsManager.startViewing();

            // Track document interaction
            this.analyticsManager.trackDocumentInteraction('DOCUMENT_OPENED', {
                documentId: document.id,
                hasCamera: document.cameraRequired,
                printingAllowed: document.printingAllowed
            });

        } catch (error) {
            console.error('Document display error:', error);
            this.showAlert('Failed to display document', 'error');
        }
    }

    renderDocument(container, content, metadata) {
        const fileType = metadata.type;
        
        container.innerHTML = '';

        if (fileType.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = `data:${fileType};base64,${btoa(String.fromCharCode.apply(null, content))}`;
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            container.appendChild(img);
        } else if (fileType === 'application/pdf') {
            const iframe = document.createElement('iframe');
            iframe.src = `data:application/pdf;base64,${btoa(String.fromCharCode.apply(null, content))}`;
            iframe.style.width = '100%';
            iframe.style.height = '600px';
            container.appendChild(iframe);
        } else if (fileType.startsWith('text/')) {
            const pre = document.createElement('pre');
            pre.textContent = new TextDecoder().decode(content);
            pre.style.whiteSpace = 'pre-wrap';
            pre.style.wordWrap = 'break-word';
            container.appendChild(pre);
        } else {
            const p = document.createElement('p');
            p.textContent = `Document: ${metadata.name} (${metadata.size} bytes)`;
            container.appendChild(p);
            
            const downloadBtn = document.createElement('button');
            downloadBtn.textContent = 'Download Document';
            downloadBtn.className = 'primary-button';
            downloadBtn.onclick = () => this.downloadDocument(content, metadata);
            container.appendChild(downloadBtn);
        }
    }

    downloadDocument(content, metadata) {
        const blob = new Blob([content], { type: metadata.type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = metadata.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Track download event
        this.analyticsManager.trackDocumentInteraction('DOCUMENT_DOWNLOADED', {
            fileName: metadata.name,
            fileSize: metadata.size,
            fileType: metadata.type
        });
    }

    setupWatermark(document) {
        const watermarkOverlay = document.getElementById('watermarkOverlay');
        if (watermarkOverlay) {
            watermarkOverlay.textContent = `CONFIDENTIAL - ${document.recipient}`;
        }
    }

    setupGlobalSecurity() {
        // Prevent right-click context menu
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.analyticsManager.trackViolation('RIGHT_CLICK_ATTEMPT');
            return false;
        });

        // Prevent text selection
        document.addEventListener('selectstart', (e) => {
            if (e.target.closest('#viewerSection')) {
                e.preventDefault();
                this.analyticsManager.trackViolation('TEXT_SELECTION_ATTEMPT');
                return false;
            }
        });

        // Prevent dragging
        document.addEventListener('dragstart', (e) => {
            e.preventDefault();
            this.analyticsManager.trackViolation('DRAG_ATTEMPT');
            return false;
        });

        // Monitor for violations on unload
        window.addEventListener('beforeunload', () => {
            this.analyticsManager.endSession();
            if (this.cameraRecorder.isRecording) {
                this.cameraRecorder.stopRecording();
            }
        });
    }

    checkURLParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const accessCode = urlParams.get('code');
        
        if (accessCode) {
            // Switch to receive mode and populate access code
            this.switchMode('receive');
            const accessCodeInput = document.getElementById('accessCodeInput');
            if (accessCodeInput) {
                accessCodeInput.value = accessCode.toUpperCase();
            }
        }
    }

    showAlert(message, type = 'info') {
        const modal = document.getElementById('securityModal');
        const messageElement = document.getElementById('securityMessage');
        
        if (modal && messageElement) {
            messageElement.textContent = message;
            modal.style.display = 'block';
        } else {
            alert(message);
        }
    }

    closeSecurityModal() {
        const modal = document.getElementById('securityModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.secureSendApp = new SecureSend();
});

// Handle page visibility changes for analytics
document.addEventListener('visibilitychange', () => {
    if (window.secureSendApp && window.secureSendApp.analyticsManager) {
        if (document.hidden) {
            window.secureSendApp.analyticsManager.endViewing();
        } else {
            window.secureSendApp.analyticsManager.startViewing();
        }
    }
});

// Export for global access
window.SecureSend = SecureSend;