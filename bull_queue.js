// This file tests the queuing using "bull"

var Queue = require('bull');

var videoQueue = new Queue('video transcoding', 'redis://127.0.0.1:6379')
var audioQueue = new Queue('audio transcoding', {redis: {port: 6379, host: '127.0.0.1', password: 'foobared'}});
var imageQueue = new Queue('image transcoding');
var pdfQueue = new Queue ('pdf transcoding');

videoQueue.process(function(job, done) {
    job.progress(42);

    done();
    done(new Error('error transcoding'));

    done(null, {framerate: 29.5});

    throw new Error ('some unexpected error');
});
videoQueue.add({video: 'http://example.com/video1.mov'});