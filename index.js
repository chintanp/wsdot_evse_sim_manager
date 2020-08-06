const Queue = require('bull');
const config = require('./config.js');
const nodemailer = require('nodemailer');
const { setQueues, UI } = require('bull-board');
const app = require('express')();
const createSubscriber = require('pg-listen');
const path = require('path');
const spawn = require("child_process").spawn;
const logger = require('./utils/logger');

// console.log(JSON.stringify(config));

const pgconfig = {
    user: config.db.user,
    database: config.db.database,
    password: config.db.password,
    host: config.db.host,
    port: config.db.port,
    max: config.db.max,
    idleTimeoutMillis: config.db.idleTimeoutMillis
}

// Accepts the same connection config object that the "pg" package would take
const subscriber = createSubscriber(pgconfig);

(async () => {
    await subscriber.connect();
    await subscriber.listenTo('new_order');
})();

const rscript_update_dc = path.resolve("wsdot_evse_update_states/R", "runner.R");

app.use('/admin/queues', UI);

// 1. Initiating the Queue
const analysisQueue = new Queue('sendMail', {
    redis: {
        host: config.redis.host,
        port: config.redis.port
    }
});

setQueues([analysisQueue]);

const data = {
    a_id: ''
};

const analysisQueueOptions = {
    delay: 0,
    attempts: 1
};

subscriber.notifications.on('new_order', payload => {
    console.log(`${JSON.stringify(payload)}`);

    const userid = payload.user_id;
    const simdatetime = payload.sim_date_time;
    const status = payload.status;
    const a_id = payload.analysis_id;

    data.a_id = a_id;
    console.log(data);
    // 2. Adding a Job to the Queue
    analysisQueue.add(data, analysisQueueOptions);
});

// 3. Consumer 
analysisQueue.process(async job => {
    return await callR(rscript_update_dc, job.data.a_id);
});

// 4.1 Completed Event
analysisQueue.on('completed', job => {
    console.log(`Job with id ${job.id} has been completed`);
});

analysisQueue.on('error', (error) => {
    // An error occured.
    console.log(`There has been an error: ${error}`);
});

// 4.2 Failed Event
analysisQueue.on('failed', (job, err) => {
    console.log(`Job with id ${job.id} has failed with error: ${err}`);
});

// function sendMail(email) {
//     return new Promise((resolve, reject) => {
//         let mailOptions = {
//             from: 'fromuser@domain.com',
//             to: email,
//             subject: 'Bull - npm',
//             text: "This email is from bull job scheduler tutorial."
//         };

//         let mailConfig = {
//             host: 'smtp.ethereal.email',
//             port: 587,
//             auth: {
//                 user: 'mae.hintz@ethereal.email',
//                 pass: 'RCmtt8JBahY9x2JhGh'
//             }
//         };

//         nodemailer.createTransport(mailConfig).sendMail(mailOptions,
//             (err, info) => {
//                 if (err) {
//                     reject(err);
//                 } else {
//                     resolve(info);
//                 }
//             });
//     });
// }
const callR = (rpath, rargs) => {
    return new Promise((resolve, reject) => {
        let err = false;

        var rscript_path = path.join(__dirname, process.env.RSCRIPT_PATH);
        console.log(rscript_path);

        const child = spawn(process.env.RSCRIPT,
            [
                rpath, "--args", rargs
            ], {
            cwd: rscript_path
        });

        child.stderr.on("data", (data) => {
            console.log(data.toString());
            // logger.log({
            //     level: 'error',
            //     IP: ip.address(),
            //     message: data.toString()
            // });
        });

        child.stdout.on("data", (data) => {
            console.log(data.toString());
            // logger.log({
            //     level: 'info',
            //     IP: ip.address(),
            //     message: data.toString()
            // });
        });

        child.on('error', (error) => {
            err = true;
            reject(error);
            // logger.log({
            //     level: 'error',
            //     IP: ip.address(),
            //     message: error.toString()
            // });
        });
        child.on('exit', () => {
            // logger.log({
            //     level: 'info',
            //     IP: ip.address(),
            //     message: "child process exited successfully"
            // });
            if (err) return; // debounce - already rejected
            resolve("done."); // TODO: check exit code and resolve/reject accordingly
        });
    });
}

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(config.app.port, () => {
    console.log(`Simulation manager listening at http://localhost:${config.app.port}`)
})