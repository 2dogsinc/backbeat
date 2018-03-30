'use strict'; // eslint-disable-line
const werelogs = require('werelogs');
const QueueProcessor = require('./QueueProcessor');
const config = require('../../../conf/Config');
const { initManagement } = require('../../../lib/management');

const zkConfig = config.zookeeper;
const MetricsProducer = require('../../../lib/MetricsProducer');

const kafkaConfig = config.kafka;
const repConfig = config.extensions.replication;
const sourceConfig = repConfig.source;
const mConfig = config.metrics;

const log = new werelogs.Logger('Backbeat:QueueProcessor:task');
werelogs.configure({ level: config.log.logLevel,
    dump: config.log.dumpLevel });

const metricsProducer = new MetricsProducer(kafkaConfig, mConfig);
metricsProducer.setupProducer(err => {
    if (err) {
        log.error('error starting metrics producer for queue processor', {
            error: err,
            method: 'MetricsProducer::setupProducer',
        });
        return undefined;
    }
    function initAndStart() {
        initManagement(error => {
            if (error) {
                log.error('could not load managment db', error);
                setTimeout(initAndStart, 5000);
                return;
            }
            log.info('management init done');

            const replicationEndpoints = config.getReplicationEndpoints();

            const destConfig = Object.assign({}, repConfig.destination);
            destConfig.bootstrapList = replicationEndpoints;

            const queueProcessor = new QueueProcessor(zkConfig, kafkaConfig,
                sourceConfig, destConfig, repConfig, metricsProducer);
            queueProcessor.start();
        });
    }
    return initAndStart();
});
