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
const paramsController = require('./controllers/controller-params');

AWS.config.update({ region: 'us-west-2' });
const ec2 = new AWS.EC2({ apiVersion: '2016-11-15' });

const resview_URL = config.resview.host;

const tripgenEC2Params = {
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
                    Value: "cp84_chargeval_tripgen_" + config.deployment.tag
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

const eviabmEC2Params = {
    ImageId: config.ec2.gamaAmiId,
    InstanceType: 't2.large',
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
                    Value: "cp84_chargeval_eviabm_" + config.deployment.tag
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
const gamaEC2InstanceData = '';
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

// this subscribers listen for new analysis requests
const new_order_subscriber = createSubscriber(pgconfig);

(async () => {
    await new_order_subscriber.connect();
    await new_order_subscriber.listenTo('new_order');
})();


// This subscriber listens for trips generated notification, 
const tripgen_subscriber = createSubscriber(pgconfig);

(async () => {
    await tripgen_subscriber.connect();
    await tripgen_subscriber.listenTo('trips_generated');
})();

// This subscriber listens for GAMA analysis solution 
const eviabm_subscriber = createSubscriber(pgconfig);

(async () => {
    await eviabm_subscriber.connect();
    await eviabm_subscriber.listenTo('solved');
})();

app.use('/admin/queues', UI);

// 1. Initiating the Queue
const tripgenQueue = new Queue('trip_generation', {
    redis: {
        host: config.redis.host,
        port: config.redis.port
    }
});

const eviabmQueue = new Queue('eviabm', {
    redis: {
        host: config.redis.host,
        port: config.redis.port
    }
});

setQueues([tripgenQueue, eviabmQueue]);

const tripgen_data = {
    a_id: '',
    instance_data: '',
    ec2_params: ''
};

const tripgenQueueOptions = {
    delay: 0,
    attempts: 1
};

const eviabm_data = {
    a_id: '',
    instance_data: '',
    ec2_params: ''
};

const eviabmQueueOptions = {
    delay: 0,
    attempts: 1
};

new_order_subscriber.notifications.on('new_order', payload => {
    logger.info(`new_order payload: ${JSON.stringify(payload)}`);

    const userid = payload.user_id;
    const simdatetime = payload.sim_date_time;
    const status = payload.status;
    const a_id = payload.analysis_id;

    tripgen_data.a_id = a_id;
    logger.info(JSON.stringify(tripgen_data));
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
    cd /home/test/rapps/tripgen && git pull origin ${config.deployment.branch}
    pwd 
    export R_LIBS_USER=/home/test/R/x86_64-pc-linux-gnu-library/4.0 && R -e ".libPaths()"
    R -e 'remotes::install_local(upgrade="never")'
    /usr/bin/Rscript --verbose runner.R
    `;

    logger.info("tripgen userdata: " + userData);

    // create a buffer
    const userDataBuff = Buffer.from(userData, 'utf-8');

    // encode buffer as Base64
    const userDataEncoded = userDataBuff.toString('base64');
    tripgenEC2Params.UserData = userDataEncoded;

    // tripgen_data.ec2_params = ec2Params.InstanceType;

    ec2.runInstances(tripgenEC2Params, async function (err, data) {
        if (err) {
            logger.error(err, err.stack);
        } else {
            logger.info(JSON.stringify(data));
            tripgen_data.a_id = job.data.a_id
            tripgen_data.instance_data = data
            const result = await job.update(tripgen_data);
        }
    });
});

// 4.1 Completed Event
tripgenQueue.on('completed', job => {
    logger.info(`tripgen job with id ${job.id} has been completed`);
});

tripgenQueue.on('error', (error) => {
    // An error occured.
    logger.error(`There has been an error in tripgen: ${error}`);
});

// 4.2 Failed Event
tripgenQueue.on('failed', (job, err) => {
    logger.error(`tripgen job with id ${job.id} has failed with error: ${err}`);
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

    // Add a job in the EVIABM queue now
    eviabm_data.a_id = a_id;
    logger.info(eviabm_data);
    // 2. Adding a Job to the Queue
    eviabmQueue.add(eviabm_data, eviabmQueueOptions);

});

eviabmQueue.process(async job => {
    var analysis_id = job.data.a_id;
    paramsController.getSeed(analysis_id).then((res) => {
        seed = res[0].param_value
        logger.info("seed: " + seed);
        
        var userData = `#!/bin/bash
    echo "Hello World"
    rm /home/test/wsdot_ev/evi-abm/analysis_id
    touch /home/test/wsdot_ev/evi-abm/analysis_id
    echo "${analysis_id}\n${seed}" >> /home/test/wsdot_ev/evi-abm/analysis_id
    su - test &
    cd /home/test/wsdot_ev/evi-abm && git pull origin ${config.deployment.branch}
    cd /home/test/headless 
    pwd 
    ./runner.sh
    `;

        logger.info("eviabm userdata: " + userData);

        // create a buffer
        const userDataBuff = Buffer.from(userData, 'utf-8');
        // encode buffer as Base64
        const userDataEncoded = userDataBuff.toString('base64');
        eviabmEC2Params.UserData = userDataEncoded;

        ec2.runInstances(eviabmEC2Params, async function (err, data) {
            if (err) {
                logger.error(err, err.stack);
            } else {
                logger.info(JSON.stringify(data));
                eviabm_data.a_id = job.data.a_id
                eviabm_data.instance_data = data
                const result = await job.update(eviabm_data);
            }
        });

    });

});

eviabm_subscriber.notifications.on('solved', async (payload) => {
    logger.info(`eviabm payload: ${JSON.stringify(payload)}`);

    const userid = payload.user_id;
    const simdatetime = payload.sim_date_time;
    const status = payload.status;
    const a_id = payload.analysis_id;

    const completed_jobs = await eviabmQueue.getJobs(['completed']);

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

            // send email to the company
            ids = emailController.sendEmail(resview_URL, a_id, simdatetime, userid)
                .then(res => {

                });
            // console.log(data);
        }          // successful response
    });

    // send mail that all is done

});
// 4.1 Completed Event
eviabmQueue.on('completed', job => {
    logger.info(`EVIABM Job with id ${job.id} has been completed`);
});

eviabmQueue.on('error', (error) => {
    // An error occured.
    logger.error(`EVIABM job has an error: ${error}`);
});

// 4.2 Failed Event
eviabmQueue.on('failed', (job, err) => {
    logger.error(`EVIABM Job with id ${job.id} has failed with error: ${err}`);
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
