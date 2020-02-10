// This is the main file that will manage the simulation execution. 

// The role of this NodeJS is server is to continuously listen for changes to the 
// database table "analysis_record" and upon a new insert start and execution process. 
// Upon successful completion of the simulation, the status in the table needs to be updated. 

// All the requiring stuff
require('dotenv').config()
const pg = require('pg');
const Mailgun = require('mailgun-js');
const path = require('path');
const spawn = require("child_process").spawn;
const connectionString = `postgres://${process.env.MAIN_USER}:${process.env.MAIN_PWD}@${process.env.MAIN_HOST}:${process.env.MAIN_PORT}/${process.env.MAIN_DB}`;
const Queue = require('bee-queue');
const {
    createLogger,
    format,
    transports
} = require('winston');
const {
    combine,
    timestamp,
    label,
    printf, 
    logstash
} = format;
var ip = require('ip');
require('winston-daily-rotate-file'); // for log file rotation
const redis = require('redis');
require('console-stamp')(console, { pattern: 'dd/mm/yyyy HH:MM:ss.l' });

// Initialization
const redisOptions = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    db: 0,
    options: {},
    retry_strategy(options) {
        // reconnect after
        return Math.min(options.attempt * 100, 3000);
    },
};

//Your api key, from Mailgun’s Control Panel
const api_key = `${process.env.MAILGUN_API_KEY}`;
//Your domain, from the Mailgun Control Panel
const mail_domain = `${process.env.MAILGUN_DOMAIN}`;
//Your sending email address
const from_who = 'wsdot_evse_notice@domain.org';
const mailgun = new Mailgun({
    apiKey: api_key,
    domain: mail_domain
});


var transport = new(transports.DailyRotateFile)({
    dirname: './logs',
    filename: 'application-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
});

const logFormat = printf(({ level, message, label, timestamp }) => {
    return `${timestamp} [${label}] ${level}: ${message}`;
  });

var logger = createLogger({
    format: combine(
        timestamp(), 
        logstash()
    ),
    transports: [
        transport
    ]
});

// TODO change to .env variables
const rscript_update_dc = path.resolve("update_states/R", "runner.R");

// Begin connections
const redisClient = redis.createClient(redisOptions);

redisClient.on('end', () => {
    console.log('REDIS connection has been closed');

    logger.log({
        level: 'debug',
        IP: ip.address(),
        message: "REDIS connection has been closed"
    });

});

redisClient.on('error', (err) => {
    console.log('REDIS client error: ' + err);

    logger.log({
        level: 'error',
        IP: ip.address(),
        message: "REDIS client has err: " + err
    });
});

redisClient.on('connect', () => {
    console.log('REDIS connection is up and running');

    logger.log({
        level: 'info',
        IP: ip.address(),
        message: "REDIS connection is up and running"
    });

    const queue = new Queue('evse_processes', {
        redis: redisClient
    }).on('ready', () => {
        console.log('evse_processes queue is ready');
        logger.log({
            level: 'info',
            IP: ip.address(),
            message: "evse_processes queue is ready"
        });
    });

    console.log(connectionString)

    const pgClient = new pg.Client(connectionString);
    pgClient.connect();

    logger.log({
        level: 'info',
        IP: ip.address(),
        message: 'Connected to the database: ' + process.env.MAIN_DB + ' @ ' + process.env.MAIN_HOST
    });

    const query = pgClient.query('LISTEN new_order')

    const callR = (path, rargs) => {
        return new Promise((resolve, reject) => {
            let err = false;
            const child = spawn(process.env.RSCRIPT,
                [
                    path, "--args", rargs
                ], {
                    cwd: process.env.RSCRIPT_PATH
                });

            child.stderr.on("data", (data) => {
                console.log(data.toString());
                logger.log({
                    level: 'error',
                    IP: ip.address(),
                    message: data.toString()
                });
            });

            child.stdout.on("data", (data) => {
                console.log(data.toString());
                logger.log({
                    level: 'info',
                    IP: ip.address(),
                    message: data.toString()
                });
            });

            child.on('error', (error) => {
                err = true;
                reject(error);
                logger.log({
                    level: 'error',
                    IP: ip.address(),
                    message: error.toString()
                });
            });
            child.on('exit', () => {
                logger.log({
                    level: 'info',
                    IP: ip.address(),
                    message: "child process exited successfully"
                });
                if (err) return; // debounce - already rejected
                resolve("done."); // TODO: check exit code and resolve/reject accordingly
            });
        });
    }

    pgClient.on('notification', async (data) => {
        const payload = JSON.parse(data.payload);
        console.log('row added!', payload)

        logger.log({
            level: 'info',
            IP: ip.address(),
            message: "Analysis request received in the simulation manager"
        });

        const userid = payload.user_id;
        const simdatetime = payload.sim_date_time;
        const status = payload.status;
        const a_id = payload.analysis_id;

        if (status == 'inserted') {
            console.log("Row inserted successfully - begin the process")
            console.log("Invoking R script... at:", rscript_update_dc);

            logger.log({
                level: 'info',
                IP: ip.address(),
                message: "Invoking R script... at:" + rscript_update_dc
            });

            // callR(rscript_update_dc, a_id)
            //     .then(result => {
            //         console.log("finished with result:", result);
            //     })
            //     .catch(error => {
            //         console.log("Finished with error:", error);
            //     });
            const job = queue.createJob({
                a_id: a_id
            });

            console.log("Job created in the queue");
            logger.log({
                level: 'info',
                IP: ip.address(),
                message: "Job created in the queue for analysis_id" + a_id + " with job_id: " + job.id
            });

            pgClient.query("update analysis_record set status = 'queued' where analysis_id = " + a_id, (err, res) => {
                console.log(err, res)
                if (err) {
                    logger.log({
                        level: 'error',
                        IP: ip.address(),
                        message: "Error in updating status to queued"
                    });
                } else {
                    console.log("Status updated to queued");

                    logger.log({
                        level: 'info',
                        IP: ip.address(),
                        message: "Analysis request queued with response: " + res.toString()
                    });
                }

                // pgClient.end()
            });

            job.save();
            console.log("Job saved in the queue");
            logger.log({
                level: 'info',
                IP: ip.address(),
                message: "Analysis job saved to the queue for analysis_id: " + a_id + " with job_id: " + job.id
            });

            var email_id = '';
            var user_id = '';
            var sim_date_time = '';
            job.on('succeeded', (result) => {
                console.log(`Received result for job ${job.id}: ${result}`);
                logger.log({
                    level: 'info',
                    IP: ip.address(),
                    message: "Analysis job succeeded for analysis_id: " + a_id + " with job_id: " + job.id
                });

                pgClient.query("update analysis_record set status = 'solved' where analysis_id = " + a_id, (err, res) => {
                    console.log(err, res)

                    if (err) {
                        logger.log({
                            level: 'error',
                            IP: ip.address(),
                            message: "Error in updating status to solved for analysis_id: " + a_id + " with job_id: " + job.id + " and err: " + err
                        });
                    } else {
                        console.log("Status updated to solved");
                        logger.log({
                            level: 'info',
                            IP: ip.address(),
                            message: "Analysis request Status updated to solved for analysis_id: " + a_id + " with job_id: " + job.id + " and res: " + res
                        });
                    }
                    // pgClient.end()
                });

                pgClient.query(` select u.email_id, u.user_id, a.sim_date_time from user_details u, 
            (select user_id, sim_date_time from analysis_record 
                    where analysis_id = ` + a_id + `) as a
                where u.user_id = a.user_id;`, (err, res) => {
                    console.log(err, res)

                    if(err) {
                        logger.log({
                            level: 'error',
                            IP: ip.address(),
                            message: "error in the select query to lookup email address: " + err
                        });
                    } 
                    
                    email_id = res.rows[0].email_id
                    user_id = res.rows[0].user_id
                    sim_date_time = res.rows[0].sim_date_time
                    
                    var data = {
                        from: from_who,
                        to: email_id,
                        subject: 'WSDOT EVSE Simulation Solved',
                        text: 'The simulation submitted at: ' + sim_date_time + ` is solved. View the results here: http://${process.env.RESULTS_HOST}:${process.env.RESULTS_PORT}/?userid=` + user_id
                    };
                    //Sending the email with attachment
                    mailgun.messages().send(data, function (err, body) {
                        if (err) {
                            console.log("Error: " + err);
                            logger.log({
                                level: 'error',
                                IP: ip.address(),
                                message: "error in the sending email: " + err
                            });
                        } else {
                            logger.log({
                                level: 'info',
                                IP: ip.address(),
                                message: "email sent, response received:  " + body
                            });
                        }

                    });
                    // pgClient.end()
                });


            });
        }
        // console.log("Time to process");
    });

    // Process jobs from as many servers or processes as you like
    queue.process(function (job, done) {
        console.log(`Processing job ${job.id}`);
        logger.log({
            level: 'info',
            IP: ip.address(),
            message: "Processing job: " + job.id
        });

        pgClient.query("update analysis_record set status = 'processing' where analysis_id = " + job.data.a_id, (err, res) => {
            if(err) {
                logger.log({
                    level: 'error',
                    IP: ip.address(),
                    message: "error in the updating status to processing: " + err
                });
            } else {
                console.log("Status updated to processing");
                logger.log({
                    level: 'info',
                    IP: ip.address(),
                    message: "analysis status updated to processing "
                });
            }
            
            // pgClient.end()
        });

        /// TODO: make sure it errors when there are any issues with the R script

        callR(rscript_update_dc, job.data.a_id)
            .then(result => {
                console.log("finished with result:", result);
                return done(null, job.data.a_id);
            })
            .catch(error => {
                console.log("Finished with error:", error);
                pgClient.query("update analysis_record set status = 'errored' where analysis_id = " + job.data.a_id, (err, res) => {
                    console.log(err, res)
                    console.log("Status updated to errored");
                    // pgClient.end()
                });

            });

    });
});
