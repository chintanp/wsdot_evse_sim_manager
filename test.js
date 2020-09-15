/* The following example sends a formatted email: */

var AWS = require('aws-sdk');
var ses = new AWS.SES({ apiVersion: '2010-12-01', region: 'us-west-2' });

var params = {
    Destination: {
     BccAddresses: [
     ], 
     CcAddresses: [
        "recipient3@example.com"
     ], 
     ToAddresses: [
        "cp84@uw.edu", 
        "recipient2@example.com"
     ]
    }, 
    Message: {
     Body: {
      Html: {
       Charset: "UTF-8", 
       Data: "This message body contains HTML formatting. It can, for example, contain links like this one: <a class=\"ulink\" href=\"http://docs.aws.amazon.com/ses/latest/DeveloperGuide\" target=\"_blank\">Amazon SES Developer Guide</a>."
      }, 
      Text: {
       Charset: "UTF-8", 
       Data: "This is the message body in text format."
      }
     }, 
     Subject: {
      Charset: "UTF-8", 
      Data: "Test email"
     }
    }, 
    ReplyToAddresses: [
    ], 
    ReturnPath: "", 
    ReturnPathArn: "", 
    Source: "sender@example.com", 
    SourceArn: ""
   };
   ses.sendEmail(params, function(err, data) {
     if (err) console.log(err, err.stack); // an error occurred
     else     console.log(data);           // successful response
     /*
     data = {
      MessageId: "EXAMPLE78603177f-7a5433e7-8edb-42ae-af10-f0181f34d6ee-000000"
     }
     */
   });