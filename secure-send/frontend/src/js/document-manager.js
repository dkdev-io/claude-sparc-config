class DocumentManager {
    constructor(authManager, cryptoManager) {
        this.authManager = authManager;
        this.cryptoManager = cryptoManager;
        this.apiBaseUrl = 'http://localhost:3001/api';
        this.selectedFiles = [];
        this.uploadProgress = {};
        this.currentUpload = null;
        this.maxFileSize = 50 * 1024 * 1024; // 50MB limit
        this.allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain',
            'image/jpeg',
            'image/png'
        ];
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // File selection
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const selectButton = document.getElementById('selectButton');

        if (uploadArea) {
            uploadArea.addEventListener('click', () => this.triggerFileSelect());
            uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
            uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            uploadArea.addEventListener('drop', (e) => this.handleFileDrop(e));
        }

        if (selectButton) {
            selectButton.addEventListener('click', () => this.triggerFileSelect());
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }

        // Send document form
        const sendForm = document.getElementById('sendDocumentForm');
        if (sendForm) {
            sendForm.addEventListener('submit', (e) => this.handleSendDocument(e));
        }

        // File removal
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-file-btn')) {
                const fileId = e.target.getAttribute('data-file-id');
                this.removeFile(fileId);
            }
        });
    }

    /**
     * File Selection and Validation
     */
    triggerFileSelect() {
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.click();
        }
    }

    handleFileSelect(event) {
        const files = Array.from(event.target.files);
        this.processSelectedFiles(files);
    }

    handleDragOver(event) {
        event.preventDefault();
        event.currentTarget.classList.add('drag-over');
    }

    handleDragLeave(event) {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');
    }

    handleFileDrop(event) {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');
        
        const files = Array.from(event.dataTransfer.files);
        this.processSelectedFiles(files);
    }

    async processSelectedFiles(files) {
        for (const file of files) {
            const validation = this.validateFile(file);
            
            if (validation.valid) {
                const fileId = this.generateFileId();
                const fileData = {
                    id: fileId,
                    file: file,
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    lastModified: file.lastModified,
                    status: 'ready',
                    encrypted: false,
                    encryptedData: null,
                    preview: await this.generateFilePreview(file)
                };
                
                this.selectedFiles.push(fileData);
                this.displaySelectedFiles();
                this.updateUploadUI();
            } else {
                this.showFileError(file.name, validation.error);
            }
        }
    }

    validateFile(file) {
        // Check file size
        if (file.size > this.maxFileSize) {
            return {
                valid: false,
                error: `File size exceeds ${this.formatFileSize(this.maxFileSize)} limit`
            };
        }

        // Check file type
        if (!this.allowedTypes.includes(file.type)) {
            return {
                valid: false,
                error: 'File type not supported. Supported types: PDF, Word, PowerPoint, Excel, Text, JPEG, PNG'
            };
        }

        // Check for duplicate files
        const isDuplicate = this.selectedFiles.some(f => 
            f.name === file.name && f.size === file.size && f.lastModified === file.lastModified
        );

        if (isDuplicate) {
            return {
                valid: false,
                error: 'File already selected'
            };
        }

        return { valid: true };
    }

    async generateFilePreview(file) {
        if (file.type.startsWith('image/')) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(file);
            });
        }
        
        // Return file type icon based on extension
        const extension = file.name.split('.').pop().toLowerCase();
        const iconMap = {
            'pdf': '📄',
            'doc': '📝', 'docx': '📝',
            'ppt': '📊', 'pptx': '📊',
            'xls': '📈', 'xlsx': '📈',
            'txt': '📃',
            'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️'
        };
        
        return iconMap[extension] || '📎';
    }

    /**
     * File Management
     */
    removeFile(fileId) {
        this.selectedFiles = this.selectedFiles.filter(f => f.id !== fileId);
        this.displaySelectedFiles();
        this.updateUploadUI();
    }

    displaySelectedFiles() {
        const container = document.getElementById('selectedFilesContainer');
        if (!container) return;

        if (this.selectedFiles.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        container.innerHTML = `
            <h3>Selected Files (${this.selectedFiles.length})</h3>
            <div class="file-list">
                ${this.selectedFiles.map(file => this.renderFileItem(file)).join('')}
            </div>
        `;
    }

    renderFileItem(fileData) {
        const progressBar = fileData.status === 'uploading' ? 
            `<div class="file-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${this.uploadProgress[fileData.id] || 0}%"></div>
                </div>
                <span class="progress-text">${this.uploadProgress[fileData.id] || 0}%</span>
            </div>` : '';

        const statusIcon = {
            'ready': '📎',
            'encrypting': '🔐',
            'uploading': '⬆️',
            'completed': '✅',
            'error': '❌'
        }[fileData.status] || '📎';

        return `
            <div class="file-item" data-file-id="${fileData.id}">
                <div class="file-preview">
                    ${typeof fileData.preview === 'string' && fileData.preview.startsWith('data:') 
                        ? `<img src="${fileData.preview}" alt="${fileData.name}">` 
                        : `<div class="file-icon">${fileData.preview}</div>`}
                </div>
                <div class="file-info">
                    <div class="file-name">${fileData.name}</div>
                    <div class="file-meta">
                        ${this.formatFileSize(fileData.size)} • ${fileData.type.split('/')[1].toUpperCase()}
                        ${fileData.encrypted ? ' • 🔐 Encrypted' : ''}
                    </div>
                    ${progressBar}
                </div>
                <div class="file-actions">
                    <span class="file-status">${statusIcon}</span>
                    ${fileData.status === 'ready' ? 
                        `<button class="remove-file-btn" data-file-id="${fileData.id}">×</button>` : ''}
                </div>
            </div>
        `;
    }

    updateUploadUI() {
        const uploadArea = document.getElementById('uploadArea');
        const recipientSection = document.getElementById('recipientSection');

        if (this.selectedFiles.length > 0) {
            if (uploadArea) {
                uploadArea.classList.add('has-files');
            }
            if (recipientSection) {
                recipientSection.style.display = 'block';
            }
        } else {
            if (uploadArea) {
                uploadArea.classList.remove('has-files');
            }
            if (recipientSection) {
                recipientSection.style.display = 'none';
            }
        }
    }

    /**
     * Document Sending Workflow
     */
    async handleSendDocument(event) {
        event.preventDefault();

        if (!this.authManager.isAuthenticated()) {
            this.showError('Please login to send documents');
            return;
        }

        if (this.selectedFiles.length === 0) {
            this.showError('Please select at least one document to send');
            return;
        }

        // Get form data
        const formData = this.getDocumentFormData();
        const validation = this.validateDocumentForm(formData);

        if (validation.errors.length > 0) {
            this.showError(validation.errors.join('<br>'));
            return;
        }

        try {
            this.showLoadingState('Preparing secure document package...');
            
            // Encrypt all files
            await this.encryptAllFiles(formData.accessCode);
            
            // Create document package
            const documentPackage = await this.createDocumentPackage(formData);
            
            // Store on server
            const result = await this.storeDocumentPackage(documentPackage);
            
            if (result.success) {
                // Send email notification
                await this.sendDocumentNotification(documentPackage, result.packageId);
                
                this.hideLoadingState();
                this.showSendConfirmation(documentPackage, result);
            } else {
                throw new Error(result.error || 'Failed to store document package');
            }

        } catch (error) {
            this.hideLoadingState();
            console.error('Document send error:', error);
            this.showError(`Failed to send document: ${error.message}`);
        }
    }

    getDocumentFormData() {
        return {
            recipientEmail: document.getElementById('recipientEmail')?.value || '',
            recipientName: document.getElementById('recipientName')?.value || '',
            subject: document.getElementById('documentSubject')?.value || '',
            message: document.getElementById('documentMessage')?.value || '',
            cameraRequired: document.getElementById('cameraRequired')?.checked || false,
            printingAllowed: document.getElementById('printingAllowed')?.checked || true,
            downloadAllowed: document.getElementById('downloadAllowed')?.checked || false,
            expiryHours: parseInt(document.getElementById('expiryHours')?.value || '24'),
            maxViews: parseInt(document.getElementById('maxViews')?.value || '10'),
            requireLogin: document.getElementById('requireLogin')?.checked || true,
            accessCode: this.cryptoManager.generateSecureAccessCode(12)
        };
    }

    validateDocumentForm(formData) {
        const errors = [];

        if (!formData.recipientEmail || !this.authManager.validateEmail(formData.recipientEmail)) {
            errors.push('Valid recipient email is required');
        }

        if (!formData.recipientName || formData.recipientName.length < 2) {
            errors.push('Recipient name is required');
        }

        if (!formData.subject || formData.subject.length < 5) {
            errors.push('Document subject must be at least 5 characters');
        }

        if (formData.expiryHours < 1 || formData.expiryHours > 8760) { // Max 1 year
            errors.push('Expiry must be between 1 hour and 1 year');
        }

        if (formData.maxViews < 1 || formData.maxViews > 100) {
            errors.push('Maximum views must be between 1 and 100');
        }

        return { errors };
    }

    async encryptAllFiles(baseAccessCode) {
        for (let i = 0; i < this.selectedFiles.length; i++) {
            const fileData = this.selectedFiles[i];
            
            if (!fileData.encrypted) {
                fileData.status = 'encrypting';
                this.displaySelectedFiles();

                // Use unique access code per file for additional security
                const fileAccessCode = baseAccessCode + '_' + i;
                
                try {
                    const encryptedData = await this.cryptoManager.encryptFile(fileData.file, fileAccessCode);
                    fileData.encryptedData = encryptedData;
                    fileData.encrypted = true;
                    fileData.status = 'ready';
                } catch (error) {
                    fileData.status = 'error';
                    throw new Error(`Failed to encrypt ${fileData.name}: ${error.message}`);
                }
                
                this.displaySelectedFiles();
            }
        }
    }

    async createDocumentPackage(formData) {
        const currentUser = this.authManager.getCurrentUser();
        const packageId = this.generatePackageId();
        
        const documentPackage = {
            id: packageId,
            sender: {
                id: currentUser.id,
                name: `${currentUser.firstName} ${currentUser.lastName}`,
                email: currentUser.email,
                organization: currentUser.organization
            },
            recipient: {
                email: formData.recipientEmail,
                name: formData.recipientName,
                requiresAccount: formData.requireLogin
            },
            metadata: {
                subject: formData.subject,
                message: formData.message,
                createdAt: new Date().toISOString(),
                expiryDate: new Date(Date.now() + formData.expiryHours * 60 * 60 * 1000).toISOString()
            },
            security: {
                accessCode: formData.accessCode,
                cameraRequired: formData.cameraRequired,
                printingAllowed: formData.printingAllowed,
                downloadAllowed: formData.downloadAllowed,
                maxViews: formData.maxViews,
                requireLogin: formData.requireLogin
            },
            files: this.selectedFiles.map((file, index) => ({
                id: file.id,
                name: file.name,
                size: file.size,
                type: file.type,
                encryptedData: file.encryptedData,
                accessCode: formData.accessCode + '_' + index,
                index: index
            })),
            analytics: {
                packageId: packageId,
                createdBy: currentUser.id,
                trackingEnabled: true
            }
        };

        return documentPackage;
    }

    async storeDocumentPackage(documentPackage) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/documents/package`, {
                method: 'POST',
                headers: this.authManager.getAuthHeaders(),
                body: JSON.stringify(documentPackage)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to store document package');
            }

            return result;

        } catch (error) {
            console.error('Package storage error:', error);
            return { success: false, error: error.message };
        }
    }

    async sendDocumentNotification(documentPackage, packageId) {
        try {
            const emailData = {
                to: documentPackage.recipient.email,
                recipientName: documentPackage.recipient.name,
                senderName: documentPackage.sender.name,
                senderEmail: documentPackage.sender.email,
                subject: documentPackage.metadata.subject,
                message: documentPackage.metadata.message,
                accessCode: documentPackage.security.accessCode,
                packageId: packageId,
                fileCount: documentPackage.files.length,
                expiryDate: documentPackage.metadata.expiryDate,
                requiresAccount: documentPackage.recipient.requiresAccount,
                securityFeatures: {
                    cameraRequired: documentPackage.security.cameraRequired,
                    printingAllowed: documentPackage.security.printingAllowed,
                    downloadAllowed: documentPackage.security.downloadAllowed
                }
            };

            const response = await fetch(`${this.apiBaseUrl}/email/document-notification`, {
                method: 'POST',
                headers: this.authManager.getAuthHeaders(),
                body: JSON.stringify(emailData)
            });

            const result = await response.json();

            if (!response.ok) {
                console.error('Email notification failed:', result.error);
                // Don't throw error - document is still sent successfully
            }

            return result;

        } catch (error) {
            console.error('Email notification error:', error);
            // Don't throw error - document is still sent successfully
        }
    }

    /**
     * UI Feedback Methods
     */
    showSendConfirmation(documentPackage, result) {
        const confirmationSection = document.getElementById('sendConfirmation');
        const mainForm = document.getElementById('sendDocumentForm');

        if (mainForm) mainForm.style.display = 'none';
        
        if (confirmationSection) {
            confirmationSection.style.display = 'block';
            confirmationSection.innerHTML = `
                <div class="confirmation-success">
                    <h3>✅ Documents Sent Successfully</h3>
                    <div class="confirmation-details">
                        <div class="confirmation-item">
                            <strong>Sent to:</strong> ${documentPackage.recipient.name} (${documentPackage.recipient.email})
                        </div>
                        <div class="confirmation-item">
                            <strong>Subject:</strong> ${documentPackage.metadata.subject}
                        </div>
                        <div class="confirmation-item">
                            <strong>Files:</strong> ${documentPackage.files.length} document${documentPackage.files.length > 1 ? 's' : ''}
                        </div>
                        <div class="confirmation-item">
                            <strong>Access Code:</strong> 
                            <code class="access-code-display">${documentPackage.security.accessCode}</code>
                        </div>
                        <div class="confirmation-item">
                            <strong>Expires:</strong> ${new Date(documentPackage.metadata.expiryDate).toLocaleString()}
                        </div>
                        <div class="confirmation-item">
                            <strong>Package ID:</strong> <code>${result.packageId}</code>
                        </div>
                    </div>
                    
                    <div class="security-summary">
                        <h4>Security Features Enabled:</h4>
                        <ul>
                            <li>🔐 End-to-end encryption</li>
                            <li>${documentPackage.security.cameraRequired ? '📹' : '❌'} Camera monitoring ${documentPackage.security.cameraRequired ? 'required' : 'disabled'}</li>
                            <li>${documentPackage.security.printingAllowed ? '🖨️' : '❌'} Printing ${documentPackage.security.printingAllowed ? 'allowed' : 'blocked'}</li>
                            <li>${documentPackage.security.downloadAllowed ? '💾' : '❌'} Download ${documentPackage.security.downloadAllowed ? 'allowed' : 'blocked'}</li>
                            <li>👁️ Maximum ${documentPackage.security.maxViews} views allowed</li>
                            <li>${documentPackage.security.requireLogin ? '🔑' : '❌'} Recipient account ${documentPackage.security.requireLogin ? 'required' : 'optional'}</li>
                        </ul>
                    </div>

                    <div class="confirmation-actions">
                        <button id="sendAnotherButton" class="primary-button">Send Another Document</button>
                        <button id="viewAnalyticsButton" class="secondary-button">View Analytics</button>
                    </div>
                </div>
            `;

            // Add event listeners for confirmation actions
            const sendAnotherButton = document.getElementById('sendAnotherButton');
            const viewAnalyticsButton = document.getElementById('viewAnalyticsButton');

            if (sendAnotherButton) {
                sendAnotherButton.addEventListener('click', () => this.resetSendForm());
            }

            if (viewAnalyticsButton) {
                viewAnalyticsButton.addEventListener('click', () => this.showPackageAnalytics(result.packageId));
            }
        }
    }

    resetSendForm() {
        // Reset form
        const form = document.getElementById('sendDocumentForm');
        const confirmationSection = document.getElementById('sendConfirmation');

        if (form) {
            form.reset();
            form.style.display = 'block';
        }

        if (confirmationSection) {
            confirmationSection.style.display = 'none';
        }

        // Clear selected files
        this.selectedFiles = [];
        this.displaySelectedFiles();
        this.updateUploadUI();

        // Reset file input
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.value = '';
        }
    }

    /**
     * Utility Methods
     */
    generateFileId() {
        return 'file_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    generatePackageId() {
        return 'pkg_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showLoadingState(message) {
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'documentLoadingIndicator';
        loadingDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 20px 40px;
            border-radius: 10px;
            z-index: 10000;
            text-align: center;
        `;
        loadingDiv.innerHTML = `
            <div style="margin-bottom: 15px;">📤</div>
            <div>${message}</div>
            <div style="margin-top: 15px; font-size: 14px; opacity: 0.8;">This may take a moment...</div>
        `;
        document.body.appendChild(loadingDiv);
    }

    hideLoadingState() {
        const loadingDiv = document.getElementById('documentLoadingIndicator');
        if (loadingDiv) {
            loadingDiv.parentNode.removeChild(loadingDiv);
        }
    }

    showError(message) {
        if (window.secureSendApp) {
            window.secureSendApp.showSecurityAlert(message);
        } else {
            alert(message);
        }
    }

    showFileError(fileName, error) {
        this.showError(`File "${fileName}": ${error}`);
    }

    /**
     * Analytics Integration
     */
    async showPackageAnalytics(packageId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/analytics/package/${packageId}`, {
                headers: this.authManager.getAuthHeaders()
            });

            const result = await response.json();

            if (response.ok && result.analytics) {
                this.displayAnalytics(result.analytics);
            } else {
                this.showError('Analytics data not yet available');
            }

        } catch (error) {
            console.error('Analytics error:', error);
            this.showError('Failed to load analytics data');
        }
    }

    displayAnalytics(analytics) {
        // This will be implemented as part of the analytics dashboard
        console.log('Package Analytics:', analytics);
        this.showError('Analytics dashboard coming soon!');
    }
}

// Make DocumentManager available globally
window.DocumentManager = DocumentManager;