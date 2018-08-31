const lolex = require('lolex');

class TimeMachine {
    constructor(now) {
        this._now = now || new Date();
        this._clock = lolex.install({ now });
    }

    moveTimeForward(future) {
        this._clock.setSystemTime(future);
    }

    getInitialDate() {
        return this._now;
    }
}

module.exports = TimeMachine;
