'use strict';

const Homey = require('homey');
const net = require('net');

module.exports = class IcmpPingDevice extends Homey.Device {

  async onInit() {
    this._interval = null;
    this._isPinging = false;
    this._online = false;
    this.debugLog(`Ping device gestart: ${this.getName()}`);

    try {
      await this._ensureCapabilities();

      this.registerCapabilityListener('onoff', async () => {
        await this.pingNow({ triggerFlows: true });
        return this._online;
      });

      await this._safeSetAvailable();
      this.startPolling();
      await this.pingNow({ triggerFlows: false });
    } catch (error) {
      this.debugError('[init]', this.getName(), 'initialisatie mislukt', error);
      await this._safeSetUnavailable(`Initialisatie mislukt: ${this._formatError(error)}`);
    }
  }

  async onAdded() {
    this.debugLog('Ping device toegevoegd');
    try {
      await this.pingNow({ triggerFlows: false });
    } catch (error) {
      this.debugError('[device]', this.getName(), 'eerste ping na toevoegen mislukt', error);
    }
  }

  async onSettings({ changedKeys }) {
    if (
      changedKeys.includes('host')
      || changedKeys.includes('interval')
      || changedKeys.includes('timeout')
      || changedKeys.includes('tcp_port')
    ) {
      this.startPolling();
      try {
        await this.pingNow({ triggerFlows: false });
      } catch (error) {
        this.debugError('[settings]', this.getName(), 'ping na settingswijziging mislukt', error);
      }
    }
  }

  async onDeleted() {
    this.stopPolling();
    this.debugLog('Ping device verwijderd');
  }

  isOnline() {
    return this._online;
  }

  getHost() {
    const { host } = this.getSettings();
    return String(host || '').trim();
  }

  startPolling() {
    this.stopPolling();

    const intervalSeconds = this._clampNumber(this.getSettings().interval, 30, 5, 3600);
    this.debugLog('[ping]', this.getHost() || '(geen host)', `polling gestart: elke ${intervalSeconds}s`);
    // eslint-disable-next-line homey-app/global-timers
    this._interval = setInterval(() => {
      this.debugLog('[ping]', this.getHost() || '(geen host)', 'interval tick');
      this.pingNow({ triggerFlows: true }).catch((error) => this.debugError(error));
    }, intervalSeconds * 1000);
  }

  stopPolling() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
      this.debugLog('[ping]', this.getHost() || '(geen host)', 'polling gestopt');
    }
  }

  async pingNow({ triggerFlows = true } = {}) {
    const host = this.getHost();
    if (!host) {
      await this._safeSetAvailable();
      await this._safeSetWarning(this.homey.__('errors.no_host'));
      await this._applyOnlineState(false, triggerFlows);
      this.debugLog('[ping]', 'geen host ingesteld');
      return false;
    }

    if (this._isPinging) {
      this.debugLog('[ping]', host, 'skip: ping al bezig');
      return this._online;
    }

    this._isPinging = true;
    this.debugLog('[ping]', host, 'start');

    try {
      const timeoutMs = this._clampNumber(this.getSettings().timeout, 2000, 500, 10000);
      const tcpPort = this._clampNumber(this.getSettings().tcp_port, 443, 1, 65535);
      const online = await this._probeTcpHost(host, tcpPort, timeoutMs);
      await this._safeSetAvailable();
      if (online) {
        await this._safeUnsetWarning();
      } else {
        await this._safeSetWarning(this.homey.__('errors.no_reply'));
      }
      await this._applyOnlineState(online, triggerFlows);
      this.debugLog('[ping]', host, `resultaat: ${online ? 'ONLINE' : 'OFFLINE'}`);
      return online;
    } catch (error) {
      this.debugError('Ping mislukt', error);
      const reason = this._formatError(error);
      await this._safeSetAvailable();
      await this._safeSetWarning(`${this.homey.__('errors.ping_failed')}: ${reason}`.slice(0, 255));
      await this._applyOnlineState(false, triggerFlows);
      this.debugError('[ping]', host, `fout: ${reason}`);
      return false;
    } finally {
      this._isPinging = false;
      this.debugLog('[ping]', host, 'einde');
    }
  }

  async _probeTcpHost(host, port, timeoutMs) {
    this.debugLog('[ping]', host, `tcp probe start: port ${port}`);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const online = await this._probeTcpHostOnce(host, port, timeoutMs, attempt + 1);
      if (online) {
        return true;
      }
    }

    return false;
  }

  async _probeTcpHostOnce(host, port, timeoutMs, attempt) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;

      const finalize = (online) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(online);
      };

      socket.setTimeout(timeoutMs);

      socket.once('connect', () => {
        this.debugLog('[ping]', host, `tcp attempt ${attempt}: connect OK op ${port}`);
        finalize(true);
      });

      socket.once('timeout', () => {
        this.debugLog('[ping]', host, `tcp attempt ${attempt}: timeout ${timeoutMs}ms op ${port}`);
        finalize(false);
      });

      socket.once('error', (error) => {
        const code = error && error.code ? error.code : 'UNKNOWN';
        this.debugLog('[ping]', host, `tcp attempt ${attempt}: error ${code}`);

        if (code === 'ECONNREFUSED') {
          // Host is bereikbaar, poort is dicht.
          finalize(true);
          return;
        }

        finalize(false);
      });

      socket.connect(port, host);
      this.debugLog('[ping]', host, `tcp attempt ${attempt}: connect ${host}:${port}`);
    });
  }

  async _applyOnlineState(online, triggerFlows) {
    const changed = this._online !== online;
    this._online = online;

    await this._safeSetCapabilityValue('onoff', online);
    await this._safeSetCapabilityValue('ping_status', online ? 'online' : 'offline');

    if (!changed || !triggerFlows) {
      return;
    }

    if (online) {
      await this.driver.triggerBecameOnline(this);
      return;
    }

    await this.driver.triggerBecameOffline(this);
  }

  _clampNumber(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, parsed));
  }

  _formatError(error) {
    if (!error) return this.homey.__('errors.unknown_error');
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    return this.homey.__('errors.unknown_error');
  }

  async _ensureCapabilities() {
    if (!this.hasCapability('ping_status')) {
      try {
        await this.addCapability('ping_status');
      } catch (error) {
        this.debugError('[capability]', this.getName(), 'kon ping_status niet toevoegen', error);
      }
    }

    if (this.hasCapability('alarm_generic')) {
      try {
        await this.removeCapability('alarm_generic');
      } catch (error) {
        this.debugError('[capability]', this.getName(), 'kon alarm_generic niet verwijderen', error);
      }
    }
  }

  async _safeSetAvailable() {
    try {
      await this.setAvailable();
    } catch (error) {
      this.debugError('[device]', this.getName(), 'setAvailable mislukt', error);
    }
  }

  async _safeSetUnavailable(message) {
    try {
      await this.setUnavailable(String(message || this.homey.__('errors.unknown_error')).slice(0, 255));
    } catch (error) {
      this.debugError('[device]', this.getName(), 'setUnavailable mislukt', error);
    }
  }

  async _safeSetWarning(message) {
    try {
      await this.setWarning(String(message || '').slice(0, 255));
    } catch (error) {
      this.debugError('[device]', this.getName(), 'setWarning mislukt', error);
    }
  }

  async _safeUnsetWarning() {
    try {
      await this.unsetWarning();
    } catch (error) {
      this.debugError('[device]', this.getName(), 'unsetWarning mislukt', error);
    }
  }

  async _safeSetCapabilityValue(capabilityId, value) {
    if (!this.hasCapability(capabilityId)) {
      this.debugError('[capability]', this.getName(), `capability ontbreekt: ${capabilityId}`);
      return;
    }

    try {
      await this.setCapabilityValue(capabilityId, value);
    } catch (error) {
      this.debugError('[capability]', this.getName(), `setCapabilityValue mislukt: ${capabilityId}`, error);
    }
  }

  debugLog(...args) {
    this.log(...args);
    if (this.homey.app && this.homey.app.forwardDebug) {
      this.homey.app.forwardDebug('info', `device:${this.getName()}`, {
        deviceName: this.getName(),
        host: this.getHost(),
        args,
      });
    }
  }

  debugError(...args) {
    this.error(...args);
    if (this.homey.app && this.homey.app.forwardDebug) {
      this.homey.app.forwardDebug('error', `device:${this.getName()}`, {
        deviceName: this.getName(),
        host: this.getHost(),
        args,
      });
    }
  }

};
