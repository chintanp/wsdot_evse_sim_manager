require('dotenv').config();
var AWS = require('aws-sdk');
var SES = new AWS.SES({ apiVersion: '2010-12-01', region: 'us-west-2' });

config = {
    serviceName: process.env.SERVICENAME || '',
    loggerLevel: process.env.LOGGERLEVEL || 'debug',
    redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379,
        db: 0,
        options: {}
    },
    db: {
        user: process.env.MAIN_USER || '',
        database: process.env.MAIN_DB || '',
        password: process.env.MAIN_PWD || '',
        host: process.env.MAIN_HOST || '',
        port: parseInt(process.env.MAIN_PORT) || 5432,
        max: parseInt(process.env.DB_MAX_CLIENTS) || 20,
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS) || 30000
    }, 
    email: {
        transport: SES, 
        from: '', 
        subject: ''
    }, 
    app: {
        port: process.env.SIMMAN_PORT || 3000
    }
}

module.exports = config;