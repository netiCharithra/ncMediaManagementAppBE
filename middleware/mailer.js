const nodemailer = require("nodemailer");

// For Gmail: Use Gmail App Password (not regular password)
// 1. Enable 2FA on Gmail
// 2. Generate App Password: https://myaccount.google.com/apppasswords
// 3. Use: service: 'gmail', auth: { user: 'your-email@gmail.com', pass: 'app-password' }

// For Zoho: Use Zoho App Password
// 1. Go to Zoho Mail Settings → Security → App Passwords
// 2. Generate app password for Nodemailer
// 3. Use the configuration below

const transporter = nodemailer.createTransport({
  host: "smtp.zoho.in",
  port: 587,
  secure: false, // TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

module.exports = transporter;
