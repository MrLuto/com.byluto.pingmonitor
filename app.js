'use strict';

const Homey = require('homey');
const {
  DebugLogger,
  DEBUG_CID_SETTING_KEY,
  DEBUG_ENABLED_SETTING_KEY,
  generateDebugCid,
} = require('./lib/debug_logger');

module.exports = class HomeyPingApp extends Homey.App {

  async onInit() {
    this._ensureDebugCid();
    this.debugLogger = new DebugLogger(this.homey, this.log.bind(this), this.error.bind(this));
    this.homey.settings.on('set', this._onSettingSet.bind(this));
    this.debugLog('app', 'Homey Ping is gestart');
  }

  _ensureDebugCid() {
    const currentCid = this.homey.settings.get(DEBUG_CID_SETTING_KEY);
    if (typeof currentCid === 'string' && currentCid.trim() !== '') {
      return;
    }

    this.homey.settings.set(DEBUG_CID_SETTING_KEY, generateDebugCid());
  }

  _onSettingSet(key) {
    if (!this.debugLogger) {
      return;
    }

    if (key === DEBUG_CID_SETTING_KEY) {
      this.debugLogger.capture('info', 'settings', [{
        message: 'Debug CID updated',
        cid: this.homey.settings.get(DEBUG_CID_SETTING_KEY),
      }], true);
      return;
    }

    if (key === DEBUG_ENABLED_SETTING_KEY) {
      this.debugLogger.capture('info', 'settings', [{
        message: 'Debug setting changed',
        enabled: this.homey.settings.get(DEBUG_ENABLED_SETTING_KEY) === true,
        cid: this.homey.settings.get(DEBUG_CID_SETTING_KEY),
      }], true);
    }
  }

  forwardDebug(level, source, ...args) {
    if (!this.debugLogger) {
      return;
    }

    this.debugLogger.capture(level, source, args);
  }

  debugLog(source, ...args) {
    this.log(...args);
    this.forwardDebug('info', source, ...args);
  }

  debugError(source, ...args) {
    this.error(...args);
    this.forwardDebug('error', source, ...args);
  }

};
