/**
 * Response handler middleware
 * This middleware standardizes all API responses
 */

const responseHandler = (req, res, next) => {
    // Store the original json method
    const originalJson = res.json;
    
    // Override the json method
    res.json = (data) => {
        // If the response already has a status code and it's an error
        if (res.statusCode >= 400) {
            return originalJson.call(res, {
                status: 'error',
                code: data.code || `HTTP_${res.statusCode}`,
                message: data.message || 'An error occurred',
                ...(process.env.NODE_ENV === 'development' && { stack: data.stack }),
                ...(data.errors && { errors: data.errors })
            });
        }
        
        // For successful responses
        return originalJson.call(res, {
            status: 'success',
            data: data.data || data,
            ...(data.meta && { meta: data.meta })
        });
    };

    // Success response method
    res.success = (data, statusCode = 200, meta) => {
        return res.status(statusCode).json({
            data,
            ...(meta && { meta })
        });
    };

    // Error response method
    res.error = (message, statusCode = 400, code = 'BAD_REQUEST', errors = null) => {
        return res.status(statusCode).json({
            message,
            code,
            ...(errors && { errors })
        });
    };

    // Not found response method
    res.notFound = (message = 'Resource not found') => {
        return res.status(404).json({
            message,
            code: 'NOT_FOUND'
        });
    };

    // Unauthorized response method
    res.unauthorized = (message = 'Unauthorized') => {
        return res.status(401).json({
            message,
            code: 'UNAUTHORIZED'
        });
    };

    // Forbidden response method
    res.forbidden = (message = 'Forbidden') => {
        return res.status(403).json({
            message,
            code: 'FORBIDDEN'
        });
    };

    // Validation error response method
    res.validationError = (errors, message = 'Validation failed') => {
        return res.status(422).json({
            message,
            code: 'VALIDATION_ERROR',
            errors
        });
    };

    next();
};

module.exports = responseHandler;
