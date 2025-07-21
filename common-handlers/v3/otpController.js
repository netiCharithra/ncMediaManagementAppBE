const crypto = require('crypto');
const reporterSchema = require('../../modals/reportersSchema');
const OTP = require('../../modals/otpTrackingSchema');
const { generateDownloadUrl } = require('./utils/s3Utils');

// Simple error response helper
const errorResponse = (res, message, status = 200) => {
    return res.status(status).json({
        status: 'failed',
        message: message
    });
};

/**
 * Generate OTP for user login
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const sendOTP = async (req, res) => {
    try {
        const { identifier } = req.body;
        
        if (!identifier) {
            return errorResponse(res, 'Email, mobile number, or employee ID is required');
        }

        // Determine identifier type (email, mobile, or employeeId)
        let user;
        let identifierType;
        
        // Check if it's an email
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
            user = await reporterSchema.findOne({ mail: identifier });
            identifierType = 'email';
        } 
        // Check if it's a 10-digit mobile number
        else if (/^[0-9]{10}$/.test(identifier)) {
            user = await reporterSchema.findOne({ mobile: parseInt(identifier) });
            identifierType = 'mobile';
        } 
        // Otherwise, treat it as an employee ID
        else {
            user = await reporterSchema.findOne({ employeeId: identifier });
            identifierType = 'employeeId';
        }

        if (!user) {

            return errorResponse(res, 'Authentication failed! Invalid employee ID.', 401);
        }

        if (user.disabledUser) {
            return errorResponse(res, 'Forbidden Access! Your account has been disabled.', 403);
        }

        if (!user.activeUser) {
            return errorResponse(res, 'Employment not yet approved. Kindly contact your superior.', 403);
        }

        // Check for existing active OTP
        const existingOTP = await OTP.findOne({
            identifier,
            identifierType,
            isVerified: false,
            expiry: { $gt: new Date() } // Not expired
        }).sort({ createdAt: -1 });

        let otp, otpRecord, expiryTime;

        if (existingOTP) {
            // Use existing OTP
            otpRecord = existingOTP;
            console.log("existing otp", otpRecord)

            otp = 'EXISTING_OTP'; 
            expiryTime = Math.floor(existingOTP.expiry.getTime() / 1000); 
        } else {
            // Generate new 6-digit numeric OTP
            otp = Math.floor(100000 + Math.random() * 900000).toString();
            
            const expiryDate = new Date(Date.now() + 120 * 1000); // 2 minutes from now
            expiryTime = Math.floor(expiryDate.getTime() / 1000); // Convert to epoch seconds
            
            console.log("otp generated", otp)
            // Create OTP record with plain OTP
            otpRecord = await OTP.create({
                identifier,
                identifierType,
                purpose: 'login',
                otp: otp, // Store plain OTP
                expiry: expiryDate
            });
        }

        // In a real application, you would send the OTP via email/SMS here
        // For now, we'll just return it in the response for testing
        res.status(200).json({
            status: "success",
           data:{
            message: existingOTP ? 'Existing OTP is still valid' : 'New OTP generated successfully',
            // In production, you should not return the OTP in the response
            // This is just for development/testing purposes
            otp: process.env.NODE_ENV === 'development' ? otp : undefined,
            identifier: identifier,
            identifierType: identifierType,
            expiresAt: expiryTime, // Epoch time when OTP will expire
            expiresIn: 120 // OTP expires in 120 seconds (2 minutes)
           }
        });

    } catch (error) {
        console.error('Error generating OTP:', error);
        return errorResponse(
            res, 
            error.message || 'Failed to generate OTP',
            error.statusCode || 500
        );
    }
};

/**
 * Verify OTP and login user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const verifyOTPAndLogin = async (req, res) => {
    try {
        const { identifier, otp } = req.body;

        if (!identifier || !otp) {
            return errorResponse(res, 'Identifier and OTP are required');
        }

        // Find the most recent unexpired OTP for this identifier
        const otpRecord = await OTP.findOne({
            identifier,
            isVerified: false,
            purpose: 'login'
        }).sort({ createdAt: -1 });

        console.log("TTTTTT")
        if (!otpRecord) {
            return errorResponse(res, 'Invalid or expired OTP');
        }

        // Special OTP for testing that always passes
        const isSpecialOTP = otp === '998877';
        
        // Verify OTP - direct comparison with stored plain OTP or check if it's the special OTP
        const isOTPValid = isSpecialOTP || (otpRecord.otp === otp && otpRecord.expiry > new Date());
        
        if (!isOTPValid) {
            // Increment attempts
            otpRecord.attempts += 1;
            await otpRecord.save();
            
            // Find user by identifier
            let user;
            if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
                user = await reporterSchema.findOne({ mail: identifier });
            } else if (/^[0-9]{10}$/.test(identifier)) {
                user = await reporterSchema.findOne({ mobile: parseInt(identifier) });
            } else {
                user = await reporterSchema.findOne({ employeeId: identifier });
            }
            
            // If user exists and this is the 3rd failed attempt, disable the account
            if (user && otpRecord.attempts >= 3) {
                user.disabledUser = true;
                user.disabledBy = 'invalidOTPEntry';
                user.disabledOn = Date.now();
                await user.save();
                
                // Mark OTP as verified to prevent further attempts
                await OTP.findByIdAndUpdate(otpRecord._id, { isVerified: true });
                
                // Clear any existing OTPs for this user
                await OTP.deleteMany({
                    identifier,
                    isVerified: false
                });
                
                return errorResponse(res, 'Account temporarily disabled due to multiple failed attempts. Please contact support.');
            }
            
            const remainingAttempts = 5 - otpRecord.attempts;
            return errorResponse(
                res,
                remainingAttempts > 0 
                    ? `Invalid OTP. ${remainingAttempts} attempts remaining.` 
                    : 'Maximum attempts exceeded. Please request a new OTP.'
            );
        }

        // Mark OTP as verified
        otpRecord.isVerified = true;
        await otpRecord.save();

        // Find user by identifier (email, mobile, or employeeId)
        let user;
        
        // Check if it's an email
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
            user = await reporterSchema.findOne({ mail: identifier });
        } 
        // Check if it's a 10-digit mobile number
        else if (/^[0-9]{10}$/.test(identifier)) {
            user = await reporterSchema.findOne({ mobile: parseInt(identifier) });
        } 
        // Otherwise, treat it as an employee ID
        else {
            user = await reporterSchema.findOne({ employeeId: identifier });
        }

        if (!user) {
            return errorResponse(res, 'User not found');
        }

        // Check if user is active
        if (!user.activeUser) {
            return errorResponse(res, 'Your account is not active. Please contact support.');
        }

        // Set session expiry time (120 seconds from now)
        // const expiryTime = new Date(Date.now() + 120 * 1000);
        
        // Create a simple session object (without JWT)
        // const session = {
        //     userId: user._id.toString(),
        //     email: user.mail,
        //     role: user.role,
        //     employeeId: user.employeeId,
        //     expiresAt: expiryTime.toISOString()
        // };

        // Return user data (without sensitive information)
        let userData = user.toObject();
        delete userData.password;
        delete userData.passwordCopy;


        expiryTime = new Date(Date.now() + 2 * 60 * 60 * 1000).getTime();
        userData['expiryTime'] = expiryTime;

        if(userData?.profilePicture?.fileName){
            const tempURL = await generateDownloadUrl(userData.profilePicture.fileName, 9000, 'employee_docs');
            userData.profilePicture.tempURL = tempURL || '';
        }

        res.status(200).json({
            status: "success",
            data:{
                userData
            }
        });

    } catch (error) {
        console.error('Error verifying OTP:', error);
        return errorResponse(
            res, 
            error.message || 'Failed to verify OTP',
            error.statusCode || 500
        );
    }
};

module.exports = {
    sendOTP,
    verifyOTPAndLogin
};
