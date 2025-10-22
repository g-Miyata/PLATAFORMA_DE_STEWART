export class SerialManager {
  private port: any = null;
  private reader: any = null;
  private writer: any = null;
  private isReading = false;

  async connect(baudRate = 115200) {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API not supported');
    }

    try {
      this.port = await (navigator as any).serial.requestPort();
      await this.port.open({ baudRate });

      this.reader = this.port.readable.getReader();
      this.writer = this.port.writable.getWriter();

      return true;
    } catch (error) {
      console.error('Error connecting to serial:', error);
      throw error;
    }
  }

  async disconnect() {
    this.isReading = false;

    if (this.reader) {
      await this.reader.cancel();
      this.reader.releaseLock();
    }

    if (this.writer) {
      this.writer.releaseLock();
    }

    if (this.port) {
      await this.port.close();
    }
  }

  async write(data: string) {
    if (!this.writer) {
      throw new Error('Not connected');
    }

    const encoder = new TextEncoder();
    await this.writer.write(encoder.encode(data + '\n'));
  }

  async startReading(onData: (data: string) => void) {
    if (!this.reader) {
      throw new Error('Not connected');
    }

    this.isReading = true;
    const decoder = new TextDecoder();

    try {
      while (this.isReading) {
        const { value, done } = await this.reader.read();
        if (done) break;

        const text = decoder.decode(value);
        onData(text);
      }
    } catch (error) {
      console.error('Error reading serial:', error);
    }
  }
}