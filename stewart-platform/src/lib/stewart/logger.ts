export interface LogEntry {
  timestamp: number;
  pose: any;
  actuators: any[];
  valid: boolean;
}

export class DataLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;

  log(entry: Omit<LogEntry, 'timestamp'>) {
    this.logs.push({
      ...entry,
      timestamp: Date.now(),
    });

    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  getLogs() {
    return [...this.logs];
  }

  clear() {
    this.logs = [];
  }

  exportCSV(): string {
    const headers = ['Timestamp', 'X', 'Y', 'Z', 'Roll', 'Pitch', 'Yaw', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'Valid'];

    const rows = this.logs.map((log) => [new Date(log.timestamp).toISOString(), log.pose.x, log.pose.y, log.pose.z, log.pose.roll, log.pose.pitch, log.pose.yaw, ...log.actuators.map((a) => a.length), log.valid]);

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  }

  downloadCSV(filename = 'stewart-platform-log.csv') {
    const csv = this.exportCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
