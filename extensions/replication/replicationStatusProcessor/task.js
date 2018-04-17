'use strict'; // eslint-disable-line

const werelogs = require('werelogs');

const ReplicationStatusProcessor = require('./ReplicationStatusProcessor');

const config = require('../../../conf/Config');
const kafkaConfig = config.kafka;
const repConfig = config.extensions.replication;
const sourceConfig = repConfig.source;
const gcConfig = config.gc;

const { initManagement } = require('../../../lib/management');
const replicationStatusProcessor = new ReplicationStatusProcessor(
    kafkaConfig, sourceConfig, repConfig, gcConfig);

werelogs.configure({ level: config.log.logLevel,
     dump: config.log.dumpLevel });

const logger = new werelogs.Logger('backbeat:ReplicationStatusProcessor:Init');
function initAndStart() {
    initManagement(error => {
        if (error) {
            logger.error('could not load management db', error);
            setTimeout(initAndStart, 5000);
            return;
        }
        logger.info('management init done');
        replicationStatusProcessor.start();
    });
}

initAndStart();
