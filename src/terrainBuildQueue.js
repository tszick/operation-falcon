// One in-flight build and one replaceable latest request; no accumulating backlog.
export class TerrainBuildQueue {
  constructor(worker) {
    this.worker = worker;
    this.busy = null;
    this.latest = null;
    this.ready = null;
    this.failed = false;
    worker.onmessage = ({ data }) => {
      if (data.error) {
        this.fail();
        return;
      }
      if (data.key !== this.busy?.key) return;
      this.busy = null;
      if (data.revision === this.latest?.revision) this.ready = data;
      if (this.latest?.key !== data.key) this.start(this.latest);
    };
    worker.onerror = () => this.fail();
  }
  fail() {
    this.failed = true;
    this.busy = null;
    this.ready = null;
    this.worker.terminate();
  }
  request(job) {
    if (this.failed) return;
    this.latest = job;
    if (!this.busy && this.ready?.key !== job.key) this.start(job);
  }
  start(job) {
    if (!job || this.failed) return;
    this.busy = job;
    try {
      this.worker.postMessage(job);
    } catch {
      this.fail();
    }
  }
  take(revision) {
    const data = this.ready;
    this.ready = null;
    return data?.revision === revision ? data : null;
  }
}
