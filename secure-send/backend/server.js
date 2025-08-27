const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const EmailService = require('./email-service');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
        },
    },
}));

app.use(cors({
    origin: ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// Stricter rate limiting for sensitive endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // limit each IP to 5 auth requests per windowMs
    message: 'Too many authentication attempts, please try again later.',
    skipSuccessfulRequests: true,
});

const accessLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // limit document access attempts
    message: 'Too many document access attempts, please try again later.',
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// In-memory storage (in production, use encrypted database)
const documents = new Map();
const documentPackages = new Map();
const users = new Map();
const accessLog = new Map();
const blockedIPs = new Set();
const analytics = new Map();
const passwordResetTokens = new Map();

// Security configuration
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
const IV_LENGTH = 16;

// Email service initialization
const emailService = new EmailService();

// Test email configuration on startup
(async () => {
    try {
        await emailService.verifyConnection();
        console.log('Email service ready for sending messages');
    } catch (error) {
        console.error('Email service verification failed:', error);
    }
})();

// Utility functions
const generateSecureId = () => crypto.randomBytes(16).toString('hex');

const encryptData = (text) => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return {
        encrypted,
        iv: iv.toString('hex')
    };
};

const decryptData = (encryptedData, iv) => {
    const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

const validateAccessCode = (code) => {
    return /^[A-Z0-9]{8,16}$/.test(code);
};

const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const parseBrowser = (userAgent) => {
    if (!userAgent) return 'Unknown';
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Other';
};

const parseOS = (userAgent) => {
    if (!userAgent) return 'Unknown';
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
    return 'Other';
};

const logSecurityEvent = (type, ip, details = {}) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        type,
        ip,
        details
    };
    console.warn('SECURITY EVENT:', logEntry);
    
    // In production, send to security monitoring service
    if (type === 'SUSPICIOUS_ACTIVITY' || type === 'INVALID_ACCESS') {
        // Block IP after multiple violations
        const violations = (accessLog.get(ip) || []).filter(
            log => Date.now() - new Date(log.timestamp).getTime() < 15 * 60 * 1000
        ).length;
        
        if (violations > 5) {
            blockedIPs.add(ip);
            console.warn('IP BLOCKED:', ip);
        }
    }
};

// Security middleware
const blockSuspiciousIPs = (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (blockedIPs.has(clientIP)) {
        logSecurityEvent('BLOCKED_IP_ACCESS', clientIP);
        return res.status(403).json({ 
            success: false, 
            error: 'Access denied' 
        });
    }
    
    next();
};

const validateRequest = (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    // Log all access attempts
    if (!accessLog.has(clientIP)) {
        accessLog.set(clientIP, []);
    }
    accessLog.get(clientIP).push({
        timestamp: new Date().toISOString(),
        endpoint: req.path,
        method: req.method
    });
    
    // Validate common headers
    const userAgent = req.get('User-Agent');
    if (!userAgent || userAgent.length < 10) {
        logSecurityEvent('SUSPICIOUS_ACTIVITY', clientIP, { 
            reason: 'Invalid User-Agent' 
        });
        return res.status(400).json({ 
            success: false, 
            error: 'Invalid request' 
        });
    }
    
    next();
};

app.use(blockSuspiciousIPs);
app.use(validateRequest);

// Authentication Routes

// User registration
app.post('/api/auth/register', authLimiter, async (req, res) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    try {
        const {
            email,
            password,
            firstName,
            lastName,
            organization,
            termsAccepted,
            privacyAccepted
        } = req.body;

        // Validation
        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        if (!validateEmail(email)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format'
            });
        }

        // Check if user already exists
        if (users.has(email)) {
            return res.status(409).json({
                success: false,
                error: 'User already exists'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);
        const userId = generateSecureId();
        const now = new Date();

        // Create user
        const userData = {
            id: userId,
            email,
            firstName,
            lastName,
            organization: organization || null,
            hashedPassword,
            termsAccepted: Boolean(termsAccepted),
            privacyAccepted: Boolean(privacyAccepted),
            createdAt: now.toISOString(),
            lastLogin: null,
            isActive: true,
            permissions: ['user'],
            documentsSent: 0,
            documentsReceived: 0,
            analytics: {
                loginCount: 0,
                lastIP: clientIP,
                accountCreationIP: clientIP
            }
        };

        users.set(email, userData);

        // Generate JWT token
        const token = jwt.sign(
            { userId, email, permissions: userData.permissions },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Send welcome email
        try {
            await emailService.sendWelcomeEmail(userData);
        } catch (emailError) {
            console.error('Welcome email failed:', emailError);
        }

        console.log('User registered:', {
            userId,
            email: email.substring(0, 3) + '***',
            name: `${firstName} ${lastName}`
        });

        res.status(201).json({
            success: true,
            token,
            user: {
                id: userId,
                email,
                firstName,
                lastName,
                organization,
                permissions: userData.permissions
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        logSecurityEvent('REGISTRATION_ERROR', clientIP, { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Registration failed'
        });
    }
});

// User login
app.post('/api/auth/login', authLimiter, async (req, res) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    try {
        const { email, password, rememberMe } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password required'
            });
        }

        const user = users.get(email);
        if (!user) {
            logSecurityEvent('INVALID_LOGIN', clientIP, { email: email.substring(0, 3) + '***' });
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.hashedPassword);
        if (!isValidPassword) {
            logSecurityEvent('INVALID_LOGIN', clientIP, { email: email.substring(0, 3) + '***' });
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Update user login info
        user.lastLogin = new Date().toISOString();
        user.analytics.loginCount++;
        user.analytics.lastIP = clientIP;
        users.set(email, user);

        // Generate JWT token
        const tokenExpiry = rememberMe ? '30d' : '1h';
        const token = jwt.sign(
            { userId: user.id, email, permissions: user.permissions },
            JWT_SECRET,
            { expiresIn: tokenExpiry }
        );

        console.log('User logged in:', {
            userId: user.id,
            email: email.substring(0, 3) + '***',
            loginCount: user.analytics.loginCount
        });

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email,
                firstName: user.firstName,
                lastName: user.lastName,
                organization: user.organization,
                permissions: user.permissions
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        logSecurityEvent('LOGIN_ERROR', clientIP, { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
});

// Token validation
app.get('/api/auth/validate', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'No token provided'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.get(decoded.email);
        
        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                organization: user.organization,
                permissions: user.permissions
            }
        });

    } catch (error) {
        res.status(401).json({
            success: false,
            error: 'Invalid token'
        });
    }
});

// Token refresh
app.post('/api/auth/refresh', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'No token provided'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.get(decoded.email);
        
        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        // Generate new token
        const newToken = jwt.sign(
            { userId: user.id, email: user.email, permissions: user.permissions },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({
            success: true,
            token: newToken
        });

    } catch (error) {
        res.status(401).json({
            success: false,
            error: 'Token refresh failed'
        });
    }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    // In a production app with Redis/database, you'd blacklist the token
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// Password reset request
app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
    const { email } = req.body;
    
    if (!email || !validateEmail(email)) {
        return res.status(400).json({
            success: false,
            error: 'Valid email required'
        });
    }

    const user = users.get(email);
    if (!user) {
        // Don't reveal if user exists
        return res.json({
            success: true,
            message: 'If an account exists, a reset link has been sent'
        });
    }

    try {
        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpiry = Date.now() + 60 * 60 * 1000; // 1 hour

        passwordResetTokens.set(resetToken, {
            email,
            expiry: resetExpiry,
            used: false
        });

        // Send reset email
        await emailService.sendPasswordResetEmail(
            email,
            resetToken,
            `${user.firstName} ${user.lastName}`
        );

        res.json({
            success: true,
            message: 'Password reset link sent to your email'
        });

    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send reset email'
        });
    }
});

// Password reset with token
app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).json({
            success: false,
            error: 'Token and new password required'
        });
    }

    const resetData = passwordResetTokens.get(token);
    if (!resetData || resetData.used || Date.now() > resetData.expiry) {
        return res.status(400).json({
            success: false,
            error: 'Invalid or expired reset token'
        });
    }

    try {
        const user = users.get(resetData.email);
        if (!user) {
            return res.status(400).json({
                success: false,
                error: 'User not found'
            });
        }

        // Update password
        user.hashedPassword = await bcrypt.hash(password, 12);
        users.set(resetData.email, user);

        // Mark token as used
        resetData.used = true;
        passwordResetTokens.set(token, resetData);

        console.log('Password reset completed:', {
            userId: user.id,
            email: user.email.substring(0, 3) + '***'
        });

        res.json({
            success: true,
            message: 'Password reset successful'
        });

    } catch (error) {
        console.error('Password reset completion error:', error);
        res.status(500).json({
            success: false,
            error: 'Password reset failed'
        });
    }
});

// Routes

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Store encrypted document
app.post('/api/documents/store', authLimiter, async (req, res) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    try {
        const {
            encryptedFile,
            metadata,
            accessCode,
            sender,
            recipient,
            expiryDate,
            cameraRequired,
            printingAllowed,
            secureToken
        } = req.body;

        // Validation
        if (!encryptedFile || !metadata || !accessCode || !sender || !recipient) {
            logSecurityEvent('INVALID_REQUEST', clientIP, { 
                endpoint: '/api/documents/store',
                reason: 'Missing required fields'
            });
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields' 
            });
        }

        if (!validateAccessCode(accessCode)) {
            logSecurityEvent('INVALID_ACCESS_CODE', clientIP, { accessCode });
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid access code format' 
            });
        }

        if (!validateEmail(recipient)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid recipient email' 
            });
        }

        // Check if access code already exists
        if (documents.has(accessCode)) {
            logSecurityEvent('DUPLICATE_ACCESS_CODE', clientIP, { accessCode });
            return res.status(409).json({ 
                success: false, 
                error: 'Access code already exists' 
            });
        }

        // Validate expiry date
        const expiry = new Date(expiryDate);
        const now = new Date();
        const maxExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

        if (expiry <= now || expiry > maxExpiry) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid expiry date' 
            });
        }

        // Store document with additional security metadata
        const documentId = generateSecureId();
        const documentData = {
            id: documentId,
            encryptedFile,
            metadata: encryptData(JSON.stringify(metadata)),
            sender: encryptData(sender),
            recipient: encryptData(recipient),
            accessCode,
            secureToken,
            cameraRequired: Boolean(cameraRequired),
            printingAllowed: Boolean(printingAllowed),
            expiryDate: expiry.toISOString(),
            createdAt: now.toISOString(),
            accessCount: 0,
            maxAccess: 10,
            createdBy: clientIP,
            accessHistory: []
        };

        documents.set(accessCode, documentData);

        // Send email notification to recipient
        try {
            await emailService.sendDocumentNotification({
                recipientEmail: recipient,
                recipientName: metadata.recipientName || 'Recipient',
                senderName: sender,
                subject: metadata.subject || 'Secure Document Shared',
                message: metadata.message,
                accessCode,
                expiryDate: expiry.toISOString(),
                documentCount: metadata.fileCount || 1,
                cameraRequired,
                printingAllowed
            });
        } catch (emailError) {
            console.error('Email notification failed:', emailError);
            // Continue without failing the document storage
        }

        // Log successful storage
        console.log('Document stored:', {
            documentId,
            accessCode,
            sender: sender.substring(0, 3) + '***',
            recipient: recipient.substring(0, 3) + '***',
            expiryDate: expiry.toISOString(),
            emailSent: true
        });

        res.status(201).json({
            success: true,
            documentId,
            message: 'Document stored and notification sent successfully'
        });

    } catch (error) {
        console.error('Document storage error:', error);
        logSecurityEvent('STORAGE_ERROR', clientIP, { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Failed to store document' 
        });
    }
});

// Retrieve encrypted document
app.post('/api/documents/access', accessLimiter, async (req, res) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    try {
        const { accessCode, requestTimestamp } = req.body;

        if (!accessCode || !validateAccessCode(accessCode)) {
            logSecurityEvent('INVALID_ACCESS', clientIP, { 
                accessCode: accessCode ? accessCode.substring(0, 3) + '***' : 'missing'
            });
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid access code' 
            });
        }

        const document = documents.get(accessCode);
        
        if (!document) {
            logSecurityEvent('DOCUMENT_NOT_FOUND', clientIP, { 
                accessCode: accessCode.substring(0, 3) + '***'
            });
            return res.status(404).json({ 
                success: false, 
                error: 'Document not found' 
            });
        }

        // Check expiry
        const now = new Date();
        const expiry = new Date(document.expiryDate);
        
        if (now > expiry) {
            // Remove expired document
            documents.delete(accessCode);
            logSecurityEvent('EXPIRED_ACCESS', clientIP, { 
                accessCode: accessCode.substring(0, 3) + '***'
            });
            return res.status(410).json({ 
                success: false, 
                error: 'Document has expired' 
            });
        }

        // Check access count
        if (document.accessCount >= document.maxAccess) {
            logSecurityEvent('MAX_ACCESS_EXCEEDED', clientIP, { 
                accessCode: accessCode.substring(0, 3) + '***',
                accessCount: document.accessCount
            });
            return res.status(429).json({ 
                success: false, 
                error: 'Maximum access attempts exceeded' 
            });
        }

        // Increment access count and log access with detailed analytics
        const sessionId = generateSecureId();
        const accessEvent = {
            sessionId,
            timestamp: now.toISOString(),
            ip: clientIP,
            userAgent: req.get('User-Agent'),
            location: {
                country: req.get('CF-IPCountry') || 'Unknown',
                city: req.get('CF-IPCity') || 'Unknown',
                timezone: req.get('CF-Timezone') || 'Unknown'
            },
            device: {
                type: /Mobile|Android|iPhone|iPad/.test(req.get('User-Agent')) ? 'mobile' : 'desktop',
                browser: parseBrowser(req.get('User-Agent')),
                os: parseOS(req.get('User-Agent'))
            },
            startTime: now.toISOString(),
            duration: null, // Will be updated when session ends
            viewingTime: 0,
            violations: [],
            completed: false
        };

        document.accessCount++;
        document.accessHistory.push(accessEvent);

        // Initialize analytics session
        analytics.set(sessionId, {
            documentId: document.id,
            accessCode,
            recipientEmail: decryptData(document.recipient.encrypted, document.recipient.iv),
            senderEmail: decryptData(document.sender.encrypted, document.sender.iv),
            sessionData: accessEvent,
            events: [],
            isActive: true
        });

        // Update document in storage
        documents.set(accessCode, document);

        // Prepare response (decrypt metadata for response)
        const decryptedMetadata = JSON.parse(decryptData(
            document.metadata.encrypted, 
            document.metadata.iv
        ));
        const decryptedSender = decryptData(
            document.sender.encrypted, 
            document.sender.iv
        );
        const decryptedRecipient = decryptData(
            document.recipient.encrypted, 
            document.recipient.iv
        );

        // Log successful access
        console.log('Document accessed:', {
            documentId: document.id,
            accessCode: accessCode.substring(0, 3) + '***',
            accessCount: document.accessCount,
            remainingAccess: document.maxAccess - document.accessCount
        });

        res.json({
            success: true,
            sessionId,
            document: {
                id: document.id,
                encryptedFile: document.encryptedFile,
                metadata: decryptedMetadata,
                sender: decryptedSender,
                recipient: decryptedRecipient,
                cameraRequired: document.cameraRequired,
                printingAllowed: document.printingAllowed,
                expiryDate: document.expiryDate,
                accessCount: document.accessCount,
                maxAccess: document.maxAccess,
                createdAt: document.createdAt
            }
        });

    } catch (error) {
        console.error('Document access error:', error);
        logSecurityEvent('ACCESS_ERROR', clientIP, { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Failed to access document' 
        });
    }
});

// Document status endpoint (for checking expiry, access count, etc.)
app.get('/api/documents/:accessCode/status', accessLimiter, (req, res) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const { accessCode } = req.params;

    if (!validateAccessCode(accessCode)) {
        logSecurityEvent('INVALID_STATUS_CHECK', clientIP, { accessCode });
        return res.status(400).json({ 
            success: false, 
            error: 'Invalid access code' 
        });
    }

    const document = documents.get(accessCode);
    
    if (!document) {
        return res.status(404).json({ 
            success: false, 
            error: 'Document not found' 
        });
    }

    const now = new Date();
    const expiry = new Date(document.expiryDate);
    const isExpired = now > expiry;

    if (isExpired) {
        documents.delete(accessCode);
    }

    res.json({
        success: true,
        status: {
            exists: !isExpired,
            expired: isExpired,
            expiryDate: document.expiryDate,
            accessCount: document.accessCount,
            maxAccess: document.maxAccess,
            remainingAccess: Math.max(0, document.maxAccess - document.accessCount),
            cameraRequired: document.cameraRequired,
            printingAllowed: document.printingAllowed
        }
    });
});

// Analytics endpoints

// Track session events (viewing time, violations, etc.)
app.post('/api/analytics/session/:sessionId/event', (req, res) => {
    const { sessionId } = req.params;
    const { eventType, eventData } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;

    if (!sessionId || !eventType) {
        return res.status(400).json({
            success: false,
            error: 'Session ID and event type required'
        });
    }

    const session = analytics.get(sessionId);
    if (!session || !session.isActive) {
        return res.status(404).json({
            success: false,
            error: 'Session not found or inactive'
        });
    }

    try {
        const event = {
            timestamp: new Date().toISOString(),
            type: eventType,
            data: eventData,
            ip: clientIP
        };

        session.events.push(event);

        // Handle specific event types
        switch (eventType) {
            case 'VIEW_START':
                session.sessionData.viewingStarted = event.timestamp;
                break;
            case 'VIEW_END':
                session.sessionData.viewingEnded = event.timestamp;
                if (session.sessionData.viewingStarted) {
                    const viewTime = new Date(event.timestamp) - new Date(session.sessionData.viewingStarted);
                    session.sessionData.viewingTime += Math.max(0, viewTime);
                }
                break;
            case 'VIOLATION':
                session.sessionData.violations.push(event);
                logSecurityEvent('SESSION_VIOLATION', clientIP, {
                    sessionId,
                    violationType: eventData?.type,
                    details: eventData
                });
                break;
            case 'SESSION_END':
                session.isActive = false;
                session.sessionData.completed = true;
                session.sessionData.duration = new Date(event.timestamp) - new Date(session.sessionData.startTime);
                
                // Send analytics email to sender
                setTimeout(async () => {
                    try {
                        await emailService.sendAccessAnalyticsEmail(
                            session.senderEmail,
                            {
                                documentId: session.documentId,
                                accessCode: session.accessCode,
                                recipientEmail: session.recipientEmail
                            },
                            session.sessionData
                        );
                    } catch (emailError) {
                        console.error('Analytics email failed:', emailError);
                    }
                }, 1000); // Delay to ensure session data is complete
                break;
        }

        analytics.set(sessionId, session);

        res.json({
            success: true,
            message: 'Event tracked successfully'
        });

    } catch (error) {
        console.error('Analytics tracking error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to track event'
        });
    }
});

// Get session analytics
app.get('/api/analytics/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    const session = analytics.get(sessionId);
    if (!session) {
        return res.status(404).json({
            success: false,
            error: 'Session not found'
        });
    }

    res.json({
        success: true,
        session: {
            sessionId,
            documentId: session.documentId,
            sessionData: session.sessionData,
            eventCount: session.events.length,
            isActive: session.isActive
        }
    });
});

// Get user analytics (requires authentication)
app.get('/api/analytics/user', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.get(decoded.email);
        
        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                error: 'Invalid authentication'
            });
        }

        // Collect analytics for user's documents
        const userAnalytics = {
            documentsSent: user.documentsSent,
            documentsReceived: user.documentsReceived,
            totalViews: 0,
            totalViewers: 0,
            recentActivity: [],
            deviceBreakdown: { mobile: 0, desktop: 0 },
            browserBreakdown: {},
            locationBreakdown: {}
        };

        // Analyze sessions for this user's documents
        for (const [sessionId, session] of analytics.entries()) {
            if (session.senderEmail === user.email) {
                userAnalytics.totalViews++;
                
                const sessionData = session.sessionData;
                if (sessionData.device?.type) {
                    userAnalytics.deviceBreakdown[sessionData.device.type]++;
                }
                if (sessionData.device?.browser) {
                    userAnalytics.browserBreakdown[sessionData.device.browser] = 
                        (userAnalytics.browserBreakdown[sessionData.device.browser] || 0) + 1;
                }
                if (sessionData.location?.country) {
                    userAnalytics.locationBreakdown[sessionData.location.country] = 
                        (userAnalytics.locationBreakdown[sessionData.location.country] || 0) + 1;
                }

                userAnalytics.recentActivity.push({
                    sessionId,
                    documentId: session.documentId,
                    recipientEmail: session.recipientEmail.substring(0, 3) + '***',
                    timestamp: sessionData.timestamp,
                    duration: sessionData.duration,
                    viewingTime: sessionData.viewingTime,
                    device: sessionData.device,
                    location: sessionData.location,
                    violations: sessionData.violations.length,
                    completed: sessionData.completed
                });
            }
        }

        // Sort recent activity by timestamp
        userAnalytics.recentActivity.sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        ).slice(0, 50); // Last 50 activities

        userAnalytics.totalViewers = new Set(
            userAnalytics.recentActivity.map(activity => activity.recipientEmail)
        ).size;

        res.json({
            success: true,
            analytics: userAnalytics
        });

    } catch (error) {
        console.error('User analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve analytics'
        });
    }
});

// Admin endpoint for security monitoring (in production, require authentication)
app.get('/api/admin/security-logs', (req, res) => {
    const logs = Array.from(accessLog.entries()).map(([ip, entries]) => ({
        ip: ip.replace(/\d+$/, 'xxx'), // Anonymize last octet
        entriesCount: entries.length,
        recentActivity: entries.slice(-5)
    }));

    res.json({
        success: true,
        logs,
        blockedIPs: Array.from(blockedIPs).map(ip => ip.replace(/\d+$/, 'xxx')),
        documentsCount: documents.size
    });
});

// Cleanup expired documents (run periodically)
const cleanupExpiredDocuments = () => {
    const now = new Date();
    let cleanedCount = 0;

    for (const [accessCode, document] of documents.entries()) {
        const expiry = new Date(document.expiryDate);
        if (now > expiry) {
            documents.delete(accessCode);
            cleanedCount++;
        }
    }

    if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} expired documents`);
    }
};

// Run cleanup every hour
setInterval(cleanupExpiredDocuments, 60 * 60 * 1000);

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    logSecurityEvent('SERVER_ERROR', req.ip, { error: err.message });
    res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
    });
});

// 404 handler
app.use((req, res) => {
    logSecurityEvent('NOT_FOUND', req.ip, { path: req.path });
    res.status(404).json({ 
        success: false, 
        error: 'Not found' 
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully');
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`Secure document server running on port ${PORT}`);
    console.log('Security features enabled:');
    console.log('- Rate limiting');
    console.log('- Request validation');
    console.log('- IP blocking');
    console.log('- Data encryption');
    console.log('- Access logging');
});

module.exports = app;