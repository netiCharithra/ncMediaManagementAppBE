const reportersSchema = require('../modals/reportersSchema');

const adminAuth = async (req, res, next) => {
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return next();
    }

    try {
        const body = req.body;
        console.log("admin auth", body)
        if (!body.employeeId) {
            return res.status(401).json({
                status: "failed",
                msg: 'Authentication required! Employee ID is missing.',
                code: 'AUTH_MISSING_EMPLOYEE_ID'
            });
        }

        const employee = await reportersSchema.findOne({
            employeeId: body.employeeId
        });

        if (!employee) {
            return res.status(401).json({
                status: "failed",
                msg: 'Authentication failed! Invalid employee ID.',
                code: 'AUTH_INVALID_EMPLOYEE_ID'
            });
        }

        if (employee.disabledUser) {
            return res.status(403).json({
                status: "failed",
                msg: 'Forbidden Access! Your account has been disabled.',
                code: 'ACCOUNT_DISABLED'
            });
        }

        if (!employee.activeUser) {
            return res.status(403).json({
                status: "failed",
                msg: 'Employment not yet approved. Kindly contact your superior.'
            });
        }

        // Attach employee info to request for use in route handlers
        req.employee = employee;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(500).json({
            status: "error",
            msg: 'Internal server error during authentication.'
        });
    }
};

module.exports = adminAuth;
