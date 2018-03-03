'use strict'; // eslint-disable-line strict

const IN_SYNC_REPLICAS = 3;

/**
 * Handles healthcheck routes
 *
 * @class
 */
class Healthcheck {
    /**
     * @constructor
     * @param {object} repConfig - extensions.replication configs
     * @param {node-zookeeper-client.Client} zkClient - zookeeper client
     * @param {BackbeatProducer} crrProducer - producer for CRR topic
     * @param {BackbeatProducer} crrStatusProducer - CRR status producer
     * @param {BackbeatProducer} metricProducer - producer for metric
     */
    constructor(repConfig, zkClient, crrProducer, crrStatusProducer,
    metricProducer) {
        this._repConfig = repConfig;
        this._zkClient = zkClient;
        this._crrProducer = crrProducer;
        this._crrStatusProducer = crrStatusProducer;
        this._metricProducer = metricProducer;
    }

    _checkProducersReady() {
        return this._crrProducer.isReady() && this._metricProducer.isReady()
            && this._crrStatusProducer.isReady();
    }

    _getConnectionDetails() {
        return {
            zookeeper: {
                status: this._zkClient.getState().name === 'SYNC_CONNECTED' ?
                    'ok' : 'error',
                details: this._zkClient.getState(),
            },
            kafkaProducer: {
                status: this._checkProducersReady() ? 'ok' : 'error',
            },
        };
    }

    /**
     * Checks health of in-sync replicas
     * @param {object} md - topic metadata object
     * @return {string} 'ok' if ISR is healthy, else 'error'
     */
    _checkISRHealth(md) {
        // eslint-disable-next-line consistent-return
        const keys = Object.keys(md);
        for (let i = 0; i < keys.length; i++) {
            if (md[keys[i]].isr &&
            md[keys[i]].isr.length !== IN_SYNC_REPLICAS) {
                return 'error';
            }
        }
        return 'ok';
    }

    /**
     * Builds the healthcheck response
     * @param {function} cb - callback(error, data)
     * @return {undefined}
     */
    getHealthcheck(cb) {
        const client = this._crrProducer.getKafkaClient();

        // TODO: refactor by calling specific topic
        client.loadMetadataForTopics([], (err, res) => {
            if (err) {
                const error = {
                    method: 'Healthcheck.getHealthcheck',
                    error: 'error getting healthcheck metadata for topics',
                };
                return cb(error);
            }
            const response = res.map(i => (Object.assign({}, i)));
            const connections = {};
            const topicMD = {};
            response.forEach((obj, idx) => {
                if (obj.metadata && obj.metadata[this._repConfig.topic]) {
                    let copy;
                    try {
                        copy = JSON.parse(JSON.stringify(obj.metadata[
                            this._repConfig.topic]));
                        topicMD.metadata = copy;
                        response.splice(idx, 1);
                    } catch (e) {
                        this._logger.error('error getting topic metadata', {
                            error: e.message,
                        });
                    }
                }
            });
            response.push(topicMD);

            if (topicMD.metadata) {
                connections.isrHealth = this._checkISRHealth(topicMD.metadata);
            }

            Object.assign(connections, this._getConnectionDetails());
            response.push({
                internalConnections: connections,
            });

            return cb(null, response);
        });
    }
}

module.exports = Healthcheck;
