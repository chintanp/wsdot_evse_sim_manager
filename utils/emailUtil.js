var nodemailer = require('nodemailer');
var path = require('path');
var fs = require('fs');

const config = require('../config.js');
const logger = require('./logger');

const mailConfig = {
    from: config.email.from, 
    subject: config.email.subject,
    attachmentName: config.email.attachmentName,
    transport: config.email.transport
}

var transporter = nodemailer.createTransport({
    SES: mailConfig.transport
});

var mailOptions = {
    from: mailConfig.from,
    subject: mailConfig.subject,
    html: '',
    to: '',
    // bcc: Any BCC address you want here in an array,
    attachments: [
        {
            filename: mailConfig.attachmentName,
            path: '',
            cid: 'uniq-mailtrap.png' 
        }
    ]
};

module.exports.sendEmail = async (email, body, attachment) => {
    try {
        // set the mailOptions
        mailOptions.to = email;
        mailOptions.html = body;
        mailOptions.attachments[0].path = attachment
        logger.debug(`sendEmail() email: ${email} | body: ${body} | attachment: ${attachment}`);
        let result = await transporter.sendMail(mailOptions);
        return result;
    } catch (error) {
        logger.error(`nodemailer sendEmail error: ${error.message}`);
        return error;
    }
};