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
    a_id: '', 
    instance_data: ''
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
    var userData= `#!/bin/bash
    echo "Hello World"
    touch /home/ubuntu/rapps/tripgen/analysis_id
    echo "${job.data.a_id}" >> /home/ubuntu/rapps/tripgen/analysis_id
    cd /home/ubuntu/rapps/tripgen 
    pwd 
    export R_LIBS_USER=/home/ubuntu/R/x86_64-pc-linux-gnu-library/4.0 && R -e ".libPaths()"
    /usr/bin/Rscript --verbose runner.R
    `;
    
    console.log(userData);
    
    // create a buffer
    const userDataBuff = Buffer.from(userData, 'utf-8');
    
    // encode buffer as Base64
    const userDataEncoded = userDataBuff.toString('base64');
    ec2Params.UserData = userDataEncoded;

    ec2.runInstances(ec2Params, function(err, data) {
        if(err) {
            console.log(err, err.stack);
        } else {
            console.log(data);
            job.data.instance_data = data;
        }
    });
    // return await callR(rscript_update_dc, job.data.a_id);
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

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(config.app.port, () => {
    console.log(`Simulation manager listening at http://localhost:${config.app.port}`)
})