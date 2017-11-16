'use strict'; // eslint-disable-line

const werelogs = require('werelogs');

const QueueProcessor = require('./QueueProcessor');

const config = require('../../../conf/Config');
const zkConfig = config.zookeeper;
const repConfig = config.extensions.replication;
const sourceConfig = repConfig.source;
const destConfig = repConfig.destination;

const { initManagement } = require('../../../lib/management');

const queueProcessor = new QueueProcessor(zkConfig,
                                          sourceConfig, destConfig,
                                          repConfig);

werelogs.configure({ level: config.log.logLevel,
    dump: config.log.dumpLevel });

function initAndStart() {
    initManagement(error => {
        if (error) {
            console.error('could not load managment db', error);
            setTimeout(initAndStart, 5000);
            return;
        }
        queueProcessor.start();
    });
}

initAndStart();
