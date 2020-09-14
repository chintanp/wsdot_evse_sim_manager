const Queue = require('bull');
const AWS = require('aws-sdk');
const nodemailer = require('nodemailer');
const { setQueues, UI } = require('bull-board');
const app = require('express')();
const createSubscriber = require('pg-listen');
const path = require('path');
const spawn = require("child_process").spawn;
const logger = require('./utils/logger');
const config = require('./config.js');
const emailController = require('./controllers/controller-email');

AWS.config.update({ region: 'us-west-2' });
const ec2 = new AWS.EC2({ apiVersion: '2016-11-15' });

const ec2Params = {
    ImageId: config.ec2.rAmiId,
    InstanceType: 't2.small',
    KeyName: config.ec2.keyPairName,
    MinCount: 1,
    MaxCount: 1,
    SecurityGroupIds: [
        config.ec2.securityGroupName
    ],
    UserData: '',
    IamInstanceProfile: {
        Arn: config.ec2.iAmInstanceProfileArn
    },
    TagSpecifications: [
        {
            ResourceType: "instance",
            Tags: [
                {
                    Key: "Name",
                    Value: "cp84_evi-dss"
                },
                {
                    Key: "Project",
                    Value: "cp84"
                },
                {
                    Key: "End_date",
                    Value: "06-30-2021"
                }
            ]
        }
    ]
};

const rEC2InstanceData = '';
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
const new_order_subscriber = createSubscriber(pgconfig);

(async () => {
    await new_order_subscriber.connect();
    await new_order_subscriber.listenTo('new_order');
})();


// Accepts the same connection config object that the "pg" package would take
const tripgen_subscriber = createSubscriber(pgconfig);

(async () => {
    await tripgen_subscriber.connect();
    await tripgen_subscriber.listenTo('trips_generated');
})();

const rscript_update_dc = path.resolve("wsdot_evse_update_states/R", "runner.R");

app.use('/admin/queues', UI);

// 1. Initiating the Queue
const tripgenQueue = new Queue('trip_generation', {
    redis: {
        host: config.redis.host,
        port: config.redis.port
    }
});

setQueues([tripgenQueue]);

const tripgen_data = {
    a_id: '',
    instance_data: '',
    ec2_params: ''
};

const tripgenQueueOptions = {
    delay: 0,
    attempts: 1
};

new_order_subscriber.notifications.on('new_order', payload => {
    logger.info(`new_order payload ${JSON.stringify(payload)}`);

    const userid = payload.user_id;
    const simdatetime = payload.sim_date_time;
    const status = payload.status;
    const a_id = payload.analysis_id;

    tripgen_data.a_id = a_id;
    logger.info(tripgen_data);
    // 2. Adding a Job to the Queue
    tripgenQueue.add(tripgen_data, tripgenQueueOptions);
});

// 3. Consumer 
tripgenQueue.process(async job => {
    var userData = `#!/bin/bash
    echo "Hello World"
    touch /home/test/rapps/tripgen/analysis_id
    echo "${job.data.a_id}" >> /home/test/rapps/tripgen/analysis_id
    su - test &
    cd /home/test/rapps/tripgen 
    pwd 
    export R_LIBS_USER=/home/test/R/x86_64-pc-linux-gnu-library/4.0 && R -e ".libPaths()"
    /usr/bin/Rscript --verbose runner.R
    `;

    logger.info(userData);

    // create a buffer
    const userDataBuff = Buffer.from(userData, 'utf-8');

    // encode buffer as Base64
    const userDataEncoded = userDataBuff.toString('base64');
    ec2Params.UserData = userDataEncoded;



    // tripgen_data.ec2_params = ec2Params.InstanceType;

    ec2.runInstances(ec2Params, async function (err, data) {
        if (err) {
            logger.error(err, err.stack);
        } else {
            logger.info(data);
            tripgen_data.a_id = job.data.a_id
            tripgen_data.instance_data = data
            const result = await job.update(tripgen_data);
        }
    });
    // return await callR(rscript_update_dc, job.data.a_id);
});

// 4.1 Completed Event
tripgenQueue.on('completed', job => {
    logger.info(`tripgenQueue Job with id ${job.id} has been completed`);
});

tripgenQueue.on('error', (error) => {
    // An error occured.
    logger.error(`There has been an error in tripgenQueue: ${error}`);
});

// 4.2 Failed Event
tripgenQueue.on('failed', (job, err) => {
    logger.error(`Job with id ${job.id} has failed with error: ${err}`);
});


tripgen_subscriber.notifications.on('trips_generated', async (payload) => {
    logger.info(`trips_generated payload: ${JSON.stringify(payload)}`);

    const userid = payload.user_id;
    const simdatetime = payload.sim_date_time;
    const status = payload.status;
    const a_id = payload.analysis_id;

    const completed_jobs = await tripgenQueue.getJobs(['completed']);

    const instanceId = findInstanceId(a_id, completed_jobs)

    var params = {
        InstanceIds: [
            instanceId
        ]
    };
    ec2.terminateInstances(params, function (err, data) {
        if (err) logger.error(err, err.stack); // an error occurred
        else {
            logger.info("Instance terminated: " + instanceId);
            // console.log(data);
        }          // successful response
    });

});

function findInstanceId(a_id, jobs) {
    for (var i = 0; i < jobs.length; i++) {
        if (jobs[i].data.a_id === a_id) {
            return jobs[i].data.instance_data.Instances[0].InstanceId;
        }
    }
}

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(config.app.port, () => {
    logger.info(`Simulation manager listening at http://localhost:${config.app.port}`)
})