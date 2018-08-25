const assert = require('assert');
const async = require('async');
const Redis = require('ioredis');
const zookeeper = require('node-zookeeper-client');

const BackbeatConsumer = require('../../../lib/BackbeatConsumer');
const QueueProcessor = require('../../../extensions/replication' +
                               '/queueProcessor/QueueProcessor');


// Emulate sending a redis signal from the api side
