const { sleep } = require('../util');

/**
 * Fans events out to (a) the desktop shell over IPC when running inside the app and
 * (b) an optional webhook, serialized with spacing to respect rate limits. Never throws.
 */
class Notifier {
  constructor(url, logger) {
    this.url = url;
    this.logger = logger;
    this.chain = Promise.resolve();
  }

  send(title, description = '', color = 0x5865f2) {
    try { process.send?.({ type: 'notify', title: String(title), description: String(description).slice(0, 300) }); } catch {}
    if (!this.url) return;
    const body = JSON.stringify({
      username: 'Veil',
      embeds: [{ title: String(title).slice(0, 256), description: String(description).slice(0, 4000), color, timestamp: new Date().toISOString() }],
    });
    this.chain = this.chain
      .then(async () => {
        const res = await fetch(this.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
        if (!res.ok) this.logger.warn(`Webhook responded ${res.status}`);
        await sleep(600);
      })
      .catch((e) => this.logger.warn('Webhook failed:', e.message));
  }
}

module.exports = { Notifier };
