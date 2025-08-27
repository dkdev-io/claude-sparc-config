const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs').promises;

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransporter({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: process.env.SMTP_PORT || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER || 'your-email@gmail.com',
                pass: process.env.SMTP_PASS || 'your-app-password'
            }
        });

        this.appUrl = process.env.APP_URL || 'https://securesend.app';
        this.fromEmail = process.env.FROM_EMAIL || 'noreply@securesend.app';
        this.fromName = process.env.FROM_NAME || 'SecureSend';

        this.verifyConnection();
    }

    async verifyConnection() {
        try {
            await this.transporter.verify();
            console.log('Email service is ready');
        } catch (error) {
            console.error('Email service configuration error:', error);
        }
    }

    /**
     * Send document notification email to recipient
     */
    async sendDocumentNotification(emailData) {
        const {
            to,
            recipientName,
            senderName,
            senderEmail,
            subject,
            message,
            accessCode,
            packageId,
            fileCount,
            expiryDate,
            requiresAccount,
            securityFeatures
        } = emailData;

        try {
            const hasAccount = await this.checkUserExists(to);
            const actionUrl = hasAccount 
                ? `${this.appUrl}/access/${packageId}`
                : `${this.appUrl}/signup?package=${packageId}&email=${encodeURIComponent(to)}`;

            const emailHtml = await this.generateDocumentNotificationHTML({
                recipientName,
                senderName,
                senderEmail,
                subject,
                message,
                accessCode,
                packageId,
                fileCount,
                expiryDate,
                requiresAccount,
                hasAccount,
                actionUrl,
                securityFeatures
            });

            const emailText = this.generateDocumentNotificationText({
                recipientName,
                senderName,
                subject,
                accessCode,
                fileCount,
                expiryDate,
                hasAccount,
                actionUrl
            });

            const mailOptions = {
                from: `${this.fromName} <${this.fromEmail}>`,
                to: to,
                subject: `🔐 Secure Document${fileCount > 1 ? 's' : ''}: ${subject}`,
                text: emailText,
                html: emailHtml,
                headers: {
                    'X-SecureSend-Package-ID': packageId,
                    'X-SecureSend-Sender': senderEmail
                }
            };

            const result = await this.transporter.sendMail(mailOptions);
            
            // Log email sent event
            console.log('Document notification sent:', {
                messageId: result.messageId,
                to: to,
                packageId: packageId,
                senderEmail: senderEmail
            });

            return {
                success: true,
                messageId: result.messageId,
                requiresAccount: requiresAccount && !hasAccount
            };

        } catch (error) {
            console.error('Document notification email failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send welcome email to new users
     */
    async sendWelcomeEmail(user) {
        try {
            const emailHtml = await this.generateWelcomeHTML(user);
            const emailText = this.generateWelcomeText(user);

            const mailOptions = {
                from: `${this.fromName} <${this.fromEmail}>`,
                to: user.email,
                subject: '🎉 Welcome to SecureSend - Your Account is Ready!',
                text: emailText,
                html: emailHtml
            };

            const result = await this.transporter.sendMail(mailOptions);
            
            console.log('Welcome email sent:', {
                messageId: result.messageId,
                to: user.email,
                userId: user.id
            });

            return { success: true, messageId: result.messageId };

        } catch (error) {
            console.error('Welcome email failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send password reset email
     */
    async sendPasswordResetEmail(email, resetToken, userName) {
        try {
            const resetUrl = `${this.appUrl}/reset-password?token=${resetToken}`;
            
            const emailHtml = await this.generatePasswordResetHTML({
                userName,
                resetUrl,
                expiryMinutes: 60
            });

            const emailText = this.generatePasswordResetText({
                userName,
                resetUrl,
                expiryMinutes: 60
            });

            const mailOptions = {
                from: `${this.fromName} <${this.fromEmail}>`,
                to: email,
                subject: '🔑 Reset Your SecureSend Password',
                text: emailText,
                html: emailHtml
            };

            const result = await this.transporter.sendMail(mailOptions);
            
            console.log('Password reset email sent:', {
                messageId: result.messageId,
                to: email
            });

            return { success: true, messageId: result.messageId };

        } catch (error) {
            console.error('Password reset email failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send document access analytics to sender
     */
    async sendAccessAnalyticsEmail(senderEmail, packageData, accessEvent) {
        try {
            const emailHtml = await this.generateAccessAnalyticsHTML({
                packageData,
                accessEvent
            });

            const emailText = this.generateAccessAnalyticsText({
                packageData,
                accessEvent
            });

            const mailOptions = {
                from: `${this.fromName} <${this.fromEmail}>`,
                to: senderEmail,
                subject: `📊 Document Accessed: ${packageData.metadata.subject}`,
                text: emailText,
                html: emailHtml
            };

            const result = await this.transporter.sendMail(mailOptions);
            
            return { success: true, messageId: result.messageId };

        } catch (error) {
            console.error('Access analytics email failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * HTML Email Templates
     */
    async generateDocumentNotificationHTML(data) {
        const securityBadges = this.generateSecurityBadges(data.securityFeatures);
        
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Secure Document from ${data.senderName}</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f4; }
                .container { max-width: 600px; margin: 0 auto; background: white; }
                .header { background: #000; color: #FFD700; padding: 20px; text-align: center; }
                .content { padding: 30px; }
                .button { display: inline-block; padding: 15px 30px; background: #000; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
                .security-badges { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0; }
                .badge { padding: 8px 12px; background: #f0f0f0; border-radius: 15px; font-size: 12px; }
                .access-code { background: #FFD700; padding: 15px; text-align: center; font-family: monospace; font-size: 24px; font-weight: bold; letter-spacing: 3px; margin: 20px 0; }
                .footer { background: #f8f8f8; padding: 20px; font-size: 12px; color: #666; }
                .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 20px 0; border-radius: 5px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔒 SECURE SEND</h1>
                    <p>End-to-End Encrypted Document Sharing</p>
                </div>
                
                <div class="content">
                    <h2>Hello ${data.recipientName},</h2>
                    
                    <p><strong>${data.senderName}</strong> (${data.senderEmail}) has sent you ${data.fileCount} secure document${data.fileCount > 1 ? 's' : ''}:</p>
                    
                    <h3>📄 ${data.subject}</h3>
                    
                    ${data.message ? `<div style="background: #f8f9fa; padding: 15px; margin: 20px 0; border-left: 4px solid #FFD700;"><p><em>"${data.message}"</em></p></div>` : ''}
                    
                    <div class="security-badges">
                        <div class="badge">🔐 End-to-End Encrypted</div>
                        ${securityBadges}
                    </div>
                    
                    ${!data.hasAccount && data.requiresAccount ? 
                        `<div class="warning">
                            <strong>⚠️ Account Required</strong><br>
                            You need to create a SecureSend account to access these documents. Don't worry - it only takes a minute!
                        </div>` : ''}
                    
                    <div class="access-code">
                        ACCESS CODE: ${data.accessCode}
                    </div>
                    
                    <div style="text-align: center;">
                        <a href="${data.actionUrl}" class="button">
                            ${data.hasAccount ? '🔓 Access Documents' : '🚀 Create Account & Access Documents'}
                        </a>
                    </div>
                    
                    <p><strong>⏰ Expires:</strong> ${new Date(data.expiryDate).toLocaleString()}</p>
                    
                    <hr style="margin: 30px 0;">
                    
                    <h3>🛡️ Security Information:</h3>
                    <ul>
                        <li>Documents are encrypted with military-grade AES-256 encryption</li>
                        <li>Only you can decrypt and view the content</li>
                        <li>Screenshot blocking is automatically enabled</li>
                        <li>All access attempts are logged for security</li>
                        ${data.securityFeatures.cameraRequired ? '<li>Camera recording will be active during viewing</li>' : ''}
                    </ul>
                    
                    <p><small>If you did not expect to receive this document, please ignore this email. The documents will automatically expire on ${new Date(data.expiryDate).toLocaleDateString()}.</small></p>
                </div>
                
                <div class="footer">
                    <p>© 2024 SecureSend - Secure Document Sharing Platform</p>
                    <p>This email was sent to ${data.to} regarding package ${data.packageId}</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    generateDocumentNotificationText(data) {
        return `
SECURE DOCUMENT FROM ${data.senderName}

Hello ${data.recipientName},

${data.senderName} (${data.senderEmail}) has sent you ${data.fileCount} secure document${data.fileCount > 1 ? 's' : ''}:

Subject: ${data.subject}
${data.message ? `Message: "${data.message}"` : ''}

ACCESS CODE: ${data.accessCode}

${data.hasAccount ? 'Access your documents:' : 'Create account and access documents:'}
${data.actionUrl}

Expires: ${new Date(data.expiryDate).toLocaleString()}

Security Features:
- End-to-end encrypted with AES-256
- Screenshot blocking enabled
- Access attempts logged
${data.securityFeatures.cameraRequired ? '- Camera recording during viewing' : ''}

If you did not expect this document, please ignore this email.

© 2024 SecureSend - Secure Document Sharing
        `.trim();
    }

    async generateWelcomeHTML(user) {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to SecureSend</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f4; }
                .container { max-width: 600px; margin: 0 auto; background: white; }
                .header { background: #000; color: #FFD700; padding: 20px; text-align: center; }
                .content { padding: 30px; }
                .button { display: inline-block; padding: 15px 30px; background: #000; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
                .feature { display: flex; align-items: center; margin: 15px 0; }
                .feature-icon { font-size: 24px; margin-right: 15px; }
                .footer { background: #f8f8f8; padding: 20px; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Welcome to SecureSend!</h1>
                    <p>Your secure document sharing platform</p>
                </div>
                
                <div class="content">
                    <h2>Hi ${user.firstName},</h2>
                    
                    <p>Welcome to SecureSend! Your account has been successfully created and you're ready to start sharing documents securely.</p>
                    
                    <div style="text-align: center;">
                        <a href="${this.appUrl}/dashboard" class="button">🚀 Go to Dashboard</a>
                    </div>
                    
                    <h3>🛡️ What makes SecureSend secure?</h3>
                    
                    <div class="feature">
                        <div class="feature-icon">🔐</div>
                        <div><strong>End-to-End Encryption:</strong> All documents are encrypted with AES-256 before leaving your device</div>
                    </div>
                    
                    <div class="feature">
                        <div class="feature-icon">📹</div>
                        <div><strong>Camera Monitoring:</strong> Optional recording during document viewing for maximum security</div>
                    </div>
                    
                    <div class="feature">
                        <div class="feature-icon">⏱️</div>
                        <div><strong>Auto-Expiry:</strong> Documents automatically expire and self-destruct</div>
                    </div>
                    
                    <div class="feature">
                        <div class="feature-icon">🚫</div>
                        <div><strong>Screenshot Blocking:</strong> Advanced protection against unauthorized copying</div>
                    </div>
                    
                    <div class="feature">
                        <div class="feature-icon">📊</div>
                        <div><strong>Analytics:</strong> Track when and how your documents are accessed</div>
                    </div>
                    
                    <h3>🚀 Getting Started:</h3>
                    <ol>
                        <li>Log in to your SecureSend dashboard</li>
                        <li>Upload your first document</li>
                        <li>Choose security options (camera, expiry, etc.)</li>
                        <li>Enter recipient's email</li>
                        <li>Send and track access analytics</li>
                    </ol>
                    
                    <p>Need help? Reply to this email or visit our help center.</p>
                </div>
                
                <div class="footer">
                    <p>© 2024 SecureSend - Secure Document Sharing Platform</p>
                    <p>Account: ${user.email}</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    generateWelcomeText(user) {
        return `
Welcome to SecureSend!

Hi ${user.firstName},

Your SecureSend account has been successfully created! You can now start sharing documents with military-grade security.

Go to your dashboard: ${this.appUrl}/dashboard

What makes SecureSend secure?
- End-to-end encryption with AES-256
- Optional camera monitoring during viewing
- Auto-expiring documents
- Screenshot blocking protection
- Detailed access analytics

Getting Started:
1. Log in to your dashboard
2. Upload your first document
3. Choose security options
4. Enter recipient's email
5. Send and track analytics

Need help? Reply to this email.

© 2024 SecureSend
Account: ${user.email}
        `.trim();
    }

    async generatePasswordResetHTML(data) {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Your SecureSend Password</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f4; }
                .container { max-width: 600px; margin: 0 auto; background: white; }
                .header { background: #000; color: #FFD700; padding: 20px; text-align: center; }
                .content { padding: 30px; }
                .button { display: inline-block; padding: 15px 30px; background: #000; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
                .footer { background: #f8f8f8; padding: 20px; font-size: 12px; color: #666; }
                .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 20px 0; border-radius: 5px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔑 Password Reset</h1>
                    <p>SecureSend Account Recovery</p>
                </div>
                
                <div class="content">
                    <h2>Hi ${data.userName},</h2>
                    
                    <p>We received a request to reset your SecureSend password. If you made this request, click the button below to create a new password:</p>
                    
                    <div style="text-align: center;">
                        <a href="${data.resetUrl}" class="button">🔄 Reset Password</a>
                    </div>
                    
                    <div class="warning">
                        <strong>⚠️ Security Notice:</strong><br>
                        This link expires in ${data.expiryMinutes} minutes for your security.
                    </div>
                    
                    <p>If you didn't request a password reset, please ignore this email. Your account remains secure.</p>
                    
                    <p><strong>For security reasons:</strong></p>
                    <ul>
                        <li>Never share this reset link with anyone</li>
                        <li>Choose a strong, unique password</li>
                        <li>Enable two-factor authentication if available</li>
                    </ul>
                </div>
                
                <div class="footer">
                    <p>© 2024 SecureSend - Secure Document Sharing Platform</p>
                    <p>If you need help, reply to this email</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    generatePasswordResetText(data) {
        return `
PASSWORD RESET REQUEST

Hi ${data.userName},

We received a request to reset your SecureSend password.

Reset your password: ${data.resetUrl}

This link expires in ${data.expiryMinutes} minutes for security.

If you didn't request this reset, please ignore this email.

© 2024 SecureSend
        `.trim();
    }

    async generateAccessAnalyticsHTML(data) {
        const { packageData, accessEvent } = data;
        
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Document Access Alert</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f4; }
                .container { max-width: 600px; margin: 0 auto; background: white; }
                .header { background: #000; color: #FFD700; padding: 20px; text-align: center; }
                .content { padding: 30px; }
                .analytics-box { background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 5px; }
                .footer { background: #f8f8f8; padding: 20px; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📊 Document Accessed</h1>
                    <p>SecureSend Analytics Alert</p>
                </div>
                
                <div class="content">
                    <h2>Document Access Notification</h2>
                    
                    <p>Your secure document "<strong>${packageData.metadata.subject}</strong>" has been accessed.</p>
                    
                    <div class="analytics-box">
                        <h3>📍 Access Details:</h3>
                        <ul>
                            <li><strong>Accessed by:</strong> ${accessEvent.recipientEmail}</li>
                            <li><strong>Time:</strong> ${new Date(accessEvent.timestamp).toLocaleString()}</li>
                            <li><strong>Location:</strong> ${accessEvent.location || 'Unknown'}</li>
                            <li><strong>Device:</strong> ${accessEvent.userAgent || 'Unknown'}</li>
                            <li><strong>Duration:</strong> ${accessEvent.duration || 'In progress'}</li>
                            <li><strong>Files Viewed:</strong> ${accessEvent.filesViewed || 'All'}</li>
                        </ul>
                    </div>
                    
                    <p>View complete analytics in your SecureSend dashboard.</p>
                </div>
                
                <div class="footer">
                    <p>© 2024 SecureSend - Document Analytics</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    generateAccessAnalyticsText(data) {
        const { packageData, accessEvent } = data;
        
        return `
DOCUMENT ACCESS ALERT

Your document "${packageData.metadata.subject}" has been accessed.

Access Details:
- Accessed by: ${accessEvent.recipientEmail}
- Time: ${new Date(accessEvent.timestamp).toLocaleString()}
- Location: ${accessEvent.location || 'Unknown'}
- Duration: ${accessEvent.duration || 'In progress'}

View complete analytics in your SecureSend dashboard.

© 2024 SecureSend
        `.trim();
    }

    /**
     * Helper Methods
     */
    generateSecurityBadges(features) {
        const badges = [];
        
        if (features.cameraRequired) badges.push('<div class="badge">📹 Camera Recording</div>');
        if (features.printingAllowed) badges.push('<div class="badge">🖨️ Printing Allowed</div>');
        if (features.downloadAllowed) badges.push('<div class="badge">💾 Download Allowed</div>');
        if (!features.printingAllowed) badges.push('<div class="badge">🚫 No Printing</div>');
        if (!features.downloadAllowed) badges.push('<div class="badge">🔒 View Only</div>');
        
        return badges.join('');
    }

    async checkUserExists(email) {
        // This would check the actual user database
        // For now, return false to simulate new users
        return false;
    }

    /**
     * Bulk email methods for notifications
     */
    async sendBulkEmails(emails) {
        const results = [];
        
        for (const emailData of emails) {
            try {
                const result = await this.transporter.sendMail(emailData);
                results.push({ success: true, messageId: result.messageId, to: emailData.to });
            } catch (error) {
                results.push({ success: false, error: error.message, to: emailData.to });
            }
            
            // Add small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return results;
    }
}

module.exports = EmailService;