// const Queue = require('bee-queue');
// const queue = new Queue('evse_processes');

// const job = queue.createJob({a_id: 5})
// job.save();
// job.on('succeeded', (result) => {
//   console.log(`Received result for job ${job.id}: ${result}`);
// });

// // Process jobs from as many servers or processes as you like
// queue.process(function (job, done) {
//   console.log(`Processing job ${job.id}`);
//   for(var i = 0; i <= 10; i++) {
//     var seconds = 3;
//     var waitTill = new Date(new Date().getTime() + seconds * 1000);
//     while(waitTill > new Date()){}

//     console.log("This line is being executed for the " + i + "th time")
//   }
//   return done(null, job.data.a_id);
// });