const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Swagger definition
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'NC Media Management API',
      version: '3.0.0',
      description: 'API documentation for NC Media Management Backend',
      contact: {
        name: 'Shaik Mohammad Muzmil',
        email: 'support@neticharthra.com'
      },
    },
    servers: [
      {
        url: '/api/v3',
        description: 'Version 3 API'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [{
      bearerAuth: []
    }]
  },
  // Path to the API docs
  apis: [
    './index.js',
    './common-handlers/v3/routes/*.js',
    './common-handlers/v2/commonRoute.js',
    './common-handlers/v3/commonRoute.js'
  ],
};

// Initialize swagger-jsdoc
const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Function to setup our docs
const swaggerDocs = (app) => {
  // Route for swagger docs
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  
  // Docs in JSON format
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
  
  console.log('📝 Swagger docs available at /api-docs');
};

module.exports = { swaggerDocs };
