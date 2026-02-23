const nodemailer = require('nodemailer');

/**
 * Utility to send emails for Grievance operations.
 * 
 * Strategy: Zoho requires that the authenticated user EXACTLY matches 
 * the 'from' address. We create a dedicated transporter for grievances.
 */

const SENDER_EMAIL = process.env.EMAIL_GRIEVANCE_USER || 'grievance@neticharithra.com';

const grievanceTransporter = nodemailer.createTransport({
    host: "smtp.zoho.in",
    port: 587,
    secure: false, // TLS
    auth: {
        user: SENDER_EMAIL,
        pass: process.env.EMAIL_GRIEVANCE_PASSWORD
    }
});

/**
 * Send an email confirmation when a grievance is submitted.
 * 
 * @param {string} to - Complainant email
 * @param {string} name - Complainant name
 * @param {string} ticketId - Generated Ticket ID
 * @param {string} category - Issue category
 */
const sendGrievanceSubmissionEmail = async (to, name, ticketId, category) => {
    try {
        const htmlTemplate = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; margin: 0; padding: 0; line-height: 1.6; }
                .container { max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
                .header { background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: white; padding: 40px 30px; text-align: center; }
                .header h1 { margin: 0; font-size: 26px; font-weight: 600; letter-spacing: -0.5px; }
                .content { padding: 40px 35px; color: #334155; }
                .ticket-card { background-color: #f1f5f9; border-radius: 8px; padding: 25px; margin: 25px 0; border-left: 4px solid #3b82f6; }
                .ticket-id { font-family: 'Courier New', Courier, monospace; font-size: 24px; font-weight: bold; color: #1e3a8a; margin: 10px 0; }
                .status-badge { display: inline-block; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; background-color: #dcfce7; color: #166534; }
                .footer { background-color: #f8fafc; padding: 25px; text-align: center; font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0; }
                .button { display: inline-block; padding: 14px 28px; background-color: #2563eb; color: white !important; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Grievance Received</h1>
                </div>
                <div class="content">
                    <p>Dear <strong>${name}</strong>,</p>
                    <p>Thank you for reaching out to NetiCharithra. Your grievance has been successfully submitted and registered in our system.</p>
                    
                    <div class="ticket-card">
                        <div style="font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Ticket ID</div>
                        <div class="ticket-id">${ticketId}</div>
                        <div style="margin-top: 10px;">
                            <span class="status-badge">Submitted</span>
                            <span style="margin-left: 10px; color: #64748b; font-size: 14px;">| Category: ${category}</span>
                        </div>
                    </div>

                    <p>Our editorial and compliance team will investigate the issue and take necessary actions in accordance with our grievance redressal policy.</p>
                    
                    <p>You can track the progress of your ticket anytime using our public tracking portal:</p>
                    
                    <div style="text-align: center;">
                        <a href="https://neticharithra.com/grievance/${ticketId}/track" class="button">Track Your Grievance</a>
                    </div>

                    <p style="margin-top: 30px; font-size: 14px;">If you have any additional evidence or information, please keep it ready as our team might reach out to you via email or phone.</p>
                </div>
                <div class="footer">
                    <p>© ${new Date().getFullYear()} NetiCharithra Redressal Cell. All rights reserved.</p>
                    <p>This is an automated legal notification. Please do not reply to this email.</p>
                </div>
            </div>
        </body>
        </html>
        `;

        await grievanceTransporter.sendMail({
            from: `"NetiCharithra Grievance Cell" <${SENDER_EMAIL}>`,
            to: to,
            subject: `[NC-Grievance] Ticket Registered: ${ticketId}`,
            html: htmlTemplate,
            text: `Dear ${name}, your grievance has been registered with Ticket ID: ${ticketId}. You can track it at https://neticharithra.com/track-grievance?id=${ticketId}`
        });

        console.log(`✅ Grievance submission email sent to ${to} for ticket ${ticketId}`);
    } catch (error) {
        console.error(`❌ Error sending grievance submission email:`, error);
        // We don't throw here to avoid failing the whole request just because email failed
    }
};

/**
 * Send an email notification when a grievance status is updated.
 * 
 * @param {string} to - Complainant email
 * @param {string} name - Complainant name
 * @param {string} ticketId - Ticket ID
 * @param {string} newStatus - The updated status
 * @param {string} actionTaken - Description of action taken
 * @param {string} remarks - Admin remarks
 */
const sendGrievanceUpdateEmail = async (to, name, ticketId, newStatus, actionTaken, remarks) => {
    try {
        const getStatusColor = (status) => {
            switch (status) {
                case 'RESOLVED': return '#166534';
                case 'REJECTED': return '#991b1b';
                case 'UNDER_INVESTIGATION': return '#854d0e';
                default: return '#1e40af';
            }
        };

        const getStatusBg = (status) => {
            switch (status) {
                case 'RESOLVED': return '#dcfce7';
                case 'REJECTED': return '#fee2e2';
                case 'UNDER_INVESTIGATION': return '#fef9c3';
                default: return '#dbeafe';
            }
        };

        const htmlTemplate = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; margin: 0; padding: 0; line-height: 1.6; }
                .container { max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
                .header { background: #1e293b; color: white; padding: 30px; text-align: center; }
                .header h1 { margin: 0; font-size: 22px; font-weight: 600; }
                .content { padding: 40px 35px; color: #334155; }
                .status-update-box { background-color: ${getStatusBg(newStatus)}; border-radius: 8px; padding: 20px; text-align: center; margin: 25px 0; border: 1px solid ${getStatusColor(newStatus)}33; }
                .status-label { font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px; }
                .status-value { font-size: 26px; font-weight: 800; color: ${getStatusColor(newStatus)}; }
                .details-box { background-color: #f8fafc; border-radius: 8px; padding: 20px; margin: 25px 0; border: 1px solid #e2e8f0; }
                .detail-row { margin-bottom: 15px; }
                .detail-label { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; }
                .detail-value { font-size: 15px; color: #334155; margin-top: 4px; }
                .footer { background-color: #f1f5f9; padding: 25px; text-align: center; font-size: 13px; color: #64748b; }
                .button { display: inline-block; padding: 12px 24px; background-color: #1e293b; color: white !important; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 15px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Grievance Status Update</h1>
                </div>
                <div class="content">
                    <p>Dear <strong>${name}</strong>,</p>
                    <p>This is a notification regarding your grievance with Ticket ID <strong>${ticketId}</strong>. There has been a new update on your case.</p>
                    
                    <div class="status-update-box">
                        <div class="status-label">Current Status</div>
                        <div class="status-value">${newStatus}</div>
                    </div>

                    <div class="details-box">
                        <div class="detail-row">
                            <div class="detail-label">Action Performed</div>
                            <div class="detail-value">${actionTaken}</div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">Official Remarks</div>
                            <div class="detail-value">${remarks}</div>
                        </div>
                    </div>

                    <p>You can view the full audit trail and history of your grievance on our portal:</p>
                    
                    <div style="text-align: center;">
                        <a href="https://neticharithra.com/track-grievance?id=${ticketId}" class="button">View Full History</a>
                    </div>
                </div>
                <div class="footer">
                    <p>© ${new Date().getFullYear()} NetiCharithra Redressal Cell. All rights reserved.</p>
                    <p>Ticket ID: ${ticketId} | This is an automated legal notification.</p>
                </div>
            </div>
        </body>
        </html>
        `;

        await grievanceTransporter.sendMail({
            from: `"NetiCharithra Grievance Cell" <${SENDER_EMAIL}>`,
            to: to,
            subject: `[NC-Update] Ticket ${ticketId}: Status updated to ${newStatus}`,
            html: htmlTemplate,
            text: `Dear ${name}, the status of your grievance ${ticketId} has been updated to ${newStatus}. Action taken: ${actionTaken}. Remarks: ${remarks}. Track it at https://neticharithra.com/track-grievance?id=${ticketId}`
        });

        console.log(`✅ Grievance status update email sent to ${to} for ticket ${ticketId}`);
    } catch (error) {
        console.error(`❌ Error sending grievance update email:`, error);
    }
};

module.exports = {
    sendGrievanceSubmissionEmail,
    sendGrievanceUpdateEmail
};
