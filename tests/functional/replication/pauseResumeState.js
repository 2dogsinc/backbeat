const assert = require('assert');
const async = require('async');
const Redis = require('ioredis');
const zookeeper = require('node-zookeeper-client');

// const BackbeatConsumer = require('../../../lib/BackbeatConsumer');
const QueueProcessor = require('../../../extensions/replication' +
                               '/queueProcessor/QueueProcessor');

const config = require('../../config.json');
const redisConfig = { host: '127.0.0.1', port: 6379 };
const ZK_TEST_CRR_STATE_PATH = '/backbeattest/state';
const EPHEMERAL_NODE = 1;

/*
- Emulate sending a redis signal from the api side

- BackbeatConsumer
-- Extend and Mock `_init`
- make checks to:
//  // - getServiceStatus()

How validations should be made:
1. CRR does not need to take place. Rather, have 2 sites setup with multiple
   queueprocessors.
2. Validate state. Check zookeeper. Make sure zookeeper nodes are ephemeral
   like how setup in server tests. Make sure zookeeper nodes and pathing are not
   conflicting with existing production settings
3. Validate BackbeatConsumer.getServiceStatus()
4. QP.scheduledResume can be a scheduled job if expected
*/

// SETUP

const futureDate = new Date();
futureDate.setHours(futureDate.getHours() + 5);

const kafkaConfig = config.kafka;
// config.extensions.replication
const repConfig = config.extensions.replication;

// repConfig.source
const sourceConfig = {
    auth: { type: 'skip' },
};
// repconfig.destination && destConfig.bootstrapList = config.getBootstrapList()
// const destConfig = repConfig.destination;
const destConfig = {
    auth: { type: 'skip', vault: 'skip' },
    bootstrapList: [
        { site: 'test-site-1', servers: ['127.0.0.1:9443'] },
        { site: 'test-site-2', type: 'aws_s3' },
    ],
};

const mConfig = config.metrics;

// const { connectionString } = config.zookeeper;

// Need to create clients with relevant data
// const zkClient = zookeeper.createClient(connectionString);


class ZKStateHelper {
    constructor(zkConfig, firstSite, secondSite) {
        this.zkConfig = zkConfig;
        this.zkClient = null;

        this.firstPath = `${ZK_TEST_CRR_STATE_PATH}/${firstSite}`;
        this.secondPath = `${ZK_TEST_CRR_STATE_PATH}/${secondSite}`;
    }

    getClient() {
        return this.zkClient;
    }

    get(site, cb) {
        const path = `${ZK_TEST_CRR_STATE_PATH}/${site}`;
        this.zkClient.getData(path, (err, data) => {
            if (err) {
                process.stdout.write('Zookeeper test helper error in ' +
                'ZKStateHelper.get at zkClient.getData');
                return cb(err);
            }
            try {
                const state = JSON.parse(data.toString());
                return cb(null, state);
            } catch (parseErr) {
                process.stdout.write('Zookeeper test helper error in ' +
                'ZKStateHelper.get at JSON.parse');
                return cb(parseErr);
            }
        });
    }

    /**
     * Setup initial zookeeper state for pause/resume tests. After each test,
     * state should be reset to this initial state.
     * State is setup as such:
     *   - firstSite: { paused: false }
     *   - secondSite: { paused: true, scheduledResume: futureDate }
     * Where futureDate is defined at the top of this test file.
     * @param {function} cb - callback(err)
     * @return {undefined}
     */
    init(cb) {
        const { connectionString } = config.zookeeper;
        this.zkClient = zookeeper.createClient(connectionString);
        this.zkClient.connect();
        this.zkClient.once('connected', () => {
            async.series([
                next => this.zkClient.mkdirp(ZK_TEST_CRR_STATE_PATH, err => {
                    if (err && err.name !== 'NODE_EXISTS') {
                        return next(err);
                    }
                    return next();
                }),
                next => {
                    // emulate first site to be active (not paused)
                    const data =
                        Buffer.from(JSON.stringify({ paused: false }));
                    this.zkClient.create(this.firstPath, data, EPHEMERAL_NODE,
                        next);
                },
                next => {
                    // emulate second site to be paused
                    const data = Buffer.from(JSON.stringify({
                        paused: true,
                        scheduledResume: futureDate.toString(),
                    }));
                    this.zkClient.create(this.secondPath, data, EPHEMERAL_NODE,
                        next);
                },
            ], err => {
                if (err) {
                    process.stdout.write('Zookeeper test helper error in ' +
                    'ZKStateHelper.init');
                    return cb(err);
                }
                return cb();
            });
        });
    }

    reset(cb) {
        // reset state, just overwrite regardless of current state
        async.parallel([
            next => {
                const data = Buffer.from(JSON.stringify({
                    paused: false,
                    scheduledResume: null,
                }));
                this.zkClient.setData(this.firstPath, data, next);
            },
            next => {
                const data = Buffer.from(JSON.stringify({
                    paused: true,
                    scheduledResume: futureDate.toString(),
                }));
                this.zkClient.setData(this.secondPath, data, next);
            },
        ], err => {
            if (err) {
                process.stdout.write('Zookeeper test helper error in ' +
                'ZKStateHelper.reset');
                return cb(err);
            }
            return cb();
        });
    }

    close() {
        if (this.zkClient) {
            this.zkClient.close();
            this.zkClient = null;
        }
    }
}

class MockAPI {
    constructor() {
        this.publisher = new Redis();
    }

    _sendRequest(site, msg) {
        const channel = `${repConfig.topic}-${site}`;
        this.publisher.publish(channel, msg);
    }

    /**
     * mock a delete schedule resume call
     * @param {string} site - site name
     * @return {undefined}
     */
    deleteScheduledResumeService(site) {
        const message = JSON.stringify({
            action: 'cancelScheduledResumeService',
        });
        this._sendRequest(site, message);
    }

    /**
     * mock a resume api call
     * @param {string} site - site name
     * @param {Date} [date] - optional date object
     * @return {undefined}
     */
    resumeCRRService(site, date) {
        const message = {
            action: 'resumeService',
        };
        if (date) {
            message.date = date;
        }
        this._sendRequest(site, JSON.stringify(message));
    }

    /**
     * mock a pause api call
     * @param {string} site - site name
     * @return {undefined}
     */
    pauseCRRService(site) {
        const message = JSON.stringify({
            action: 'pauseService',
        });
        this._sendRequest(site, message);
    }
}

// function checkUntil(condition, cb) {
//     async.whilst(() => condition, next => setTimeout(() => next, 1000), cb);
// }

function isConsumerActive(consumer) {
    return consumer.getServiceStatus();
}

describe('CRR Pause/Resume status updates', function d() {
    this.timeout(10000);
    let zkHelper;
    let mockAPI;
    const firstSite = destConfig.bootstrapList[0].site;
    const secondSite = destConfig.bootstrapList[1].site;
    let qpSite1;
    let qpSite2;
    let consumer1;
    let consumer2;

    before(done => {
        mockAPI = new MockAPI();
        zkHelper = new ZKStateHelper(config.zookeeper, firstSite,
            secondSite);
        zkHelper.init(err => {
            if (err) {
                return done(err);
            }
            const zkClient = zkHelper.getClient();
            qpSite1 = new QueueProcessor(zkClient, kafkaConfig, sourceConfig,
                destConfig, repConfig, redisConfig, mConfig, firstSite);
            qpSite1.start();
            qpSite2 = new QueueProcessor(zkClient, kafkaConfig, sourceConfig,
                destConfig, repConfig, redisConfig, mConfig, secondSite);
            // second site is paused by default
            qpSite2.start({ paused: true });
            // second site has a scheduled resume by default
            qpSite2.scheduleResume(futureDate);
            // wait for clients/jobs to set
            return async.whilst(() => (
                !consumer1 && !consumer2 && !qpSite2.scheduledResume
            ), cb => setTimeout(() => {
                consumer1 = qpSite1._consumer;
                consumer2 = qpSite2._consumer;
                return cb();
            }, 1000), done);
        });
    });

    afterEach(done => {
        consumer1.resume();
        consumer2.pause();
        async.whilst(() => qpSite1.scheduledResume !== null ||
            !qpSite2.scheduledResume,
        cb => setTimeout(() => {
            qpSite1._cancelScheduledResumeService();
            qpSite2.scheduleResume(futureDate);
            cb();
        }, 1000), err => {
            assert.ifError(err);
            zkHelper.reset(done);
        });
    });

    after(() => {
        zkHelper.close();
        // TODO: Close QueueProcessors
    });

    // it.only('HALP CLEAN ZK', done => {
    //     done()
    // })

    it('should pause an active location', done => {
        // idea will be to mock an api request
        // When the request comes in, zookeeper state should be updated as well
        // as internal state (i.e. scheduled timer, backbeatconsumer
        // subscriptions)
        let zkPauseState;
        mockAPI.pauseCRRService(firstSite);
        return async.whilst(() => isConsumerActive(consumer1) !== false ||
            zkPauseState !== true,
        cb => setTimeout(() => {
            zkHelper.get(firstSite, (err, data) => {
                // we can ignore get errors because api side should retry
                if (!err) {
                    zkPauseState = data.paused;
                }
                cb();
            });
        }, 1000), err => {
            assert.ifError(err);
            // is zookeeper state shown as paused?
            assert.strictEqual(zkPauseState, true);
            // is the consumer currently subscribed to any topics?
            assert.strictEqual(isConsumerActive(consumer1), false);

            return done();
        });
    });

    // it('TEST: should reset', done => {
    //     zkHelper.get(firstSite, (err, data) => {
    //         assert.ifError(err);
    //         console.log(`firstSite: ${JSON.stringify(data)}`);
    //     });
    //     zkHelper.get(secondSite, (err, data) => {
    //         assert.ifError(err);
    //         console.log(`secondSite: ${JSON.stringify(data)}`);
    //         done()
    //     });
    // });

    // TODO: use doWhilst calls for tests where I expect no change
    it('should not change state if pausing an already paused location',
    done => {
        let zkPauseState;
        assert.strictEqual(isConsumerActive(consumer2), false);
        mockAPI.pauseCRRService(secondSite);
        return async.whilst(() => isConsumerActive(consumer2) !== false ||
            zkPauseState !== true,
        cb => setTimeout(() => {
            zkHelper.get(secondSite, (err, data) => {
                if (!err) {
                    zkPauseState = data.paused;
                }
                cb();
            });
        }, 1000), err => {
            assert.ifError(err);
            assert.strictEqual(zkPauseState, true);
            assert.strictEqual(isConsumerActive(consumer2), false);

            return done();
        });
    });

    it('should resume a paused location', done => {
        let zkPauseState;
        mockAPI.resumeCRRService(secondSite);
        return async.whilst(() => isConsumerActive(consumer2) !== true ||
            zkPauseState !== false,
        cb => setTimeout(() => {
            zkHelper.get(secondSite, (err, data) => {
                if (!err) {
                    zkPauseState = data.paused;
                }
                cb();
            });
        }, 1000), err => {
            assert.ifError(err);
            assert.strictEqual(zkPauseState, false);
            assert.strictEqual(isConsumerActive(consumer2), true);
            return done();
        });
    });

    // TODO: use doWhilst calls for tests where I expect no change
    it('should not change state if resuming an already active location',
    done => {
        let zkPauseState;
        assert.strictEqual(isConsumerActive(consumer1), true);
        mockAPI.resumeCRRService(firstSite);
        return async.whilst(() => isConsumerActive(consumer1) !== true ||
            zkPauseState !== false,
        cb => setTimeout(() => {
            zkHelper.get(firstSite, (err, data) => {
                if (!err) {
                    zkPauseState = data.paused;
                }
                cb();
            });
        }, 1000), err => {
            assert.ifError(err);
            assert.strictEqual(zkPauseState, false);
            assert.strictEqual(isConsumerActive(consumer1), true);
            return done();
        });
    });

    it('should cancel a scheduled resume for a given location', done => {
        let zkScheduleState;
        mockAPI.deleteScheduledResumeService(secondSite);
        return async.whilst(() => zkScheduleState !== null,
        cb => setTimeout(() => {
            zkHelper.get(secondSite, (err, data) => {
                if (!err) {
                    zkScheduleState = data.scheduledResume;
                }
                cb();
            });
        }, 1000), err => {
            assert.ifError(err);
            assert.strictEqual(zkScheduleState, null);
            return done();
        });
    });

    it('should schedule a resume', done => {
        let zkScheduleState;
        // first make sure the site is paused
        mockAPI.resumeCRRService(firstSite, futureDate);
        return async.whilst(() => {
            if (zkScheduleState) {
                const zkStateDate = new Date(zkScheduleState);
                return zkStateDate.getTime() !== futureDate.getTime();
            }
            return true;
        }, cb => setTimeout(() => {
            zkHelper.get(firstSite, (err, data) => {
                if (!err) {
                    zkScheduleState = data.scheduledResume;
                }
                cb();
            });
        }, 1000), err => {
            assert.ifError(err);
            assert.strictEqual(new Date(zkScheduleState).toString(),
                futureDate.toString());
            done();
        });
    });

    it('should overwrite an existing scheduled resume on new request', done => {
        let zkScheduleState;
        const newScheduledDate = new Date();
        newScheduledDate.setHours(newScheduledDate.getHours() + 1);
        mockAPI.resumeCRRService(secondSite, newScheduledDate);
        return async.whilst(() => {
            if (zkScheduleState) {
                const zkStateDate = new Date(zkScheduleState);
                return zkStateDate.getTime() !== newScheduledDate.getTime();
            }
            return true;
        }, cb => setTimeout(() => {
            zkHelper.get(secondSite, (err, data) => {
                if (!err) {
                    zkScheduleState = data.scheduledResume;
                }
                cb();
            });
        }, 1000), err => {
            assert.ifError(err);
            assert.strictEqual(new Date(zkScheduleState).toString(),
                newScheduledDate.toString());
            done();
        });
    });

    it('should cancel a scheduled resume when the location is manually ' +
    'resumed', done => {
        let zkScheduleState;
        let zkPauseState;
        mockAPI.resumeCRRService(secondSite);
        return async.whilst(() => isConsumerActive(consumer2) !== true ||
            zkPauseState !== false,
        cb => setTimeout(() => {
            zkHelper.get(secondSite, (err, data) => {
                if (!err) {
                    zkPauseState = data.paused;
                    zkScheduleState = data.scheduledResume;
                }
                cb();
            });
        }, 1000), err => {
            assert.ifError(err);
            assert.strictEqual(zkScheduleState, null);
            done();
        });
    });

    // TODO: use doWhilst calls for tests where I expect no change
    it.only('should not schedule a resume when the location is already active ',
    done => {
        let zkScheduleState;
        let zkPauseState;
        mockAPI.resumeCRRService(firstSite, futureDate);
        return async.whilst(() => isConsumerActive(consumer1) !== true ||
            zkPauseState !== false,
        cb => setTimeout(() => {
            zkHelper.get(firstSite, (err, data) => {
                if (!err) {
                    zkScheduleState = data.scheduledResume;
                    zkPauseState = data.paused;
                }
                cb();
            });
        }, 1000), err => {
            assert.ifError(err);
            assert.strictEqual();
        });
    });

    it.skip('should resume a location when a scheduled resume triggers', done => {
        done();
    });
});
