const config = require('../config');
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, logstash } = format;
require('winston-daily-rotate-file');

const loggerFormat = printf(info => {
    return `${info.timestamp} | ${info.level}: ${info.message}`;
});

const fileTransport = new (transports.DailyRotateFile)({
    dirname: './logs',
    filename: 'simman-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    format: format.combine(
        timestamp(),
        format.json()
    )
});

const consoleTransport = new transports.Console({
    'timestamp': true,
    format: format.combine(
        timestamp(),
        format.colorize(),
        format.simple()
    )
});

const logger = createLogger({
    level: config.loggerLevel,
    transports: [
        consoleTransport,
        fileTransport
    ],
    exceptionHandlers: [
        new transports.File({ filename: 'logs/exceptions.log' })
    ]
});

//
// Handle errors
//
logger.on('error', function (err) {
    console.log("Logging error: " + err);
});

module.exports = logger;