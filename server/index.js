require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const chokidar = require('chokidar');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const os = require('os');

const { parseLogLine } = require('./logParser');
const db = require('./db');

const LOG_FILE_PATH = 'C:\\Users\\ramal\\Downloads\\Proyek\\WebsiteNuctech\\server\\Transmission.log';
const PORT = process.env.PORT || 5000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- Fungsi untuk mendapatkan IP lokal komputer ---
const getLocalIP = () => {
  try {
    const interfaces = os.networkInterfaces();
    
    // Cari IPv4 yang bukan internal (127.0.0.1)
    for (const interfaceName of Object.keys(interfaces)) {
      for (const interface of interfaces[interfaceName]) {
        // Skip internal dan IPv6
        if (interface.family === 'IPv4' && !interface.internal) {
          // Prioritaskan WiFi atau Ethernet
          if (interfaceName.includes('Wi-Fi') || interfaceName.includes('Ethernet')) {
            return interface.address;
          }
        }
      }
    }
    
    // Fallback: ambil IP pertama yang ditemukan
    for (const interfaceName of Object.keys(interfaces)) {
      for (const interface of interfaces[interfaceName]) {
        if (interface.family === 'IPv4' && !interface.internal) {
          return interface.address;
        }
      }
    }
    
    return '127.0.0.1'; // Fallback ke localhost
  } catch (error) {
    console.error('Error getting local IP:', error);
    return '127.0.0.1';
  }
};

// --- State Management ---
const localIP = getLocalIP();
console.log(`🖥️  Local IP Address: ${localIP}`);

let systemState = {
  ftpServer1: {
    name: 'FTP Server 1',
    status: 'standby',
    lastActivity: '-',
    version: 'V2.0/5.0/21.0',
    details: 'Waiting for activity...',
    ip: localIP // Gunakan IP lokal komputer
  },
  ftpServer2: {
    name: 'FTP Server 2',
    status: 'standby',
    lastActivity: '-',
    version: 'V2.0/5.0/21.0',
    details: 'Standby server',
    ip: '192.168.1.100' // Contoh IP untuk server 2
  }
};

let systemActivity = {
  uptime: '0 days 00:00:00',
  lastUpdate: new Date().toLocaleTimeString('en-US', { hour12: false }),
  activeConnections: 0,
  logFiles: '0 files',
  totalScans: 0,
  successfulScans: 0,
  failedScans: 0,
  successRate: '0%'
};

let serverStartTime = Date.now();
let processedLogs = new Set();

// --- Fungsi Helper ---
const updateUptime = () => {
  const now = Date.now();
  const uptimeMs = now - serverStartTime;
  const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((uptimeMs % (1000 * 60)) / 1000);
  
  systemActivity.uptime = `${days} days ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const updateFTPStatus = (server, status, details, ip = null) => {
  if (server === 1) {
    systemState.ftpServer1.status = status;
    systemState.ftpServer1.lastActivity = new Date().toLocaleTimeString('en-US', { hour12: true });
    systemState.ftpServer1.details = details;
    if (ip && ip !== '::1') { // Jangan update jika IP adalah IPv6 localhost
      systemState.ftpServer1.ip = ip;
    }
  } else {
    systemState.ftpServer2.status = status;
    systemState.ftpServer2.lastActivity = new Date().toLocaleTimeString('en-US', { hour12: true });
    systemState.ftpServer2.details = details;
    if (ip) {
      systemState.ftpServer2.ip = ip;
    }
  }
  
  io.emit('ftp_update', {
    server1: systemState.ftpServer1,
    server2: systemState.ftpServer2
  });
};

const updateSystemActivity = async () => {
  try {
    // Update stats dari database
    const statsQuery = `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'OK') as ok, COUNT(*) FILTER (WHERE status = 'NOK') as nok FROM scans;`;
    const statsResult = await db.query(statsQuery);
    
    if (statsResult.rows[0]) {
      const stats = statsResult.rows[0];
      systemActivity.totalScans = parseInt(stats.total);
      systemActivity.successfulScans = parseInt(stats.ok);
      systemActivity.failedScans = parseInt(stats.nok);
      systemActivity.successRate = stats.total > 0 ? 
        ((stats.ok / stats.total) * 100).toFixed(1) + '%' : '0%';
    }

    // Update log files count
    const logDir = path.dirname(LOG_FILE_PATH);
    try {
      const files = fs.readdirSync(logDir).filter(file => file.endsWith('.log'));
      systemActivity.logFiles = `${files.length} files`;
    } catch (err) {
      systemActivity.logFiles = 'Directory not accessible';
    }

    systemActivity.lastUpdate = new Date().toLocaleTimeString('en-US', { hour12: false });
    systemActivity.activeConnections = io.engine.clientsCount;
    
    io.emit('system_activity_update', systemActivity);
  } catch (err) {
    console.error('Error updating system activity:', err);
  }
};

// --- Middleware & Konfigurasi ---
app.use(cors());
app.use(express.json());

// --- API untuk mendapatkan IP server ---
app.get('/api/server-ip', (req, res) => {
  res.json({ 
    serverIP: localIP,
    hostname: os.hostname(),
    platform: os.platform()
  });
});

// --- Koneksi WebSocket ---
io.on('connection', (socket) => {
  console.log(`🔌 Pengguna terhubung: ${socket.id}`);
  
  // Dapatkan IP client yang sebenarnya
  const clientIp = socket.handshake.headers['x-forwarded-for'] || 
                   socket.handshake.address;
  
  console.log(`📍 Client IP: ${clientIp}`);
  
  // Kirim status FTP dengan IP server yang benar
  io.emit('ftp_update', {
    server1: systemState.ftpServer1,
    server2: systemState.ftpServer2
  });
  
  updateSystemActivity();
  
  socket.on('disconnect', () => {
    console.log(`🔌 Pengguna terputus: ${socket.id}`);
    updateSystemActivity();
  });
});

// --- API Endpoints ---
app.get('/api/initial-data', async (req, res) => {
  try {
    const statsQuery = `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'OK') as ok, COUNT(*) FILTER (WHERE status = 'NOK') as nok FROM scans;`;
    const statsResult = await db.query(statsQuery);
    
    const scansQuery = `SELECT * FROM scans ORDER BY scan_time DESC LIMIT 10`;
    const scansResult = await db.query(scansQuery);

    // Update log files count
    const logDir = path.dirname(LOG_FILE_PATH);
    try {
      const files = fs.readdirSync(logDir).filter(file => file.endsWith('.log'));
      systemActivity.logFiles = `${files.length} files`;
    } catch (err) {
      systemActivity.logFiles = 'Directory not accessible';
    }

    updateUptime();
    await updateSystemActivity();

    res.json({
      stats: statsResult.rows[0],
      recentScans: scansResult.rows,
      systemState: systemState,
      systemActivity: systemActivity
    });
  } catch (err) {
    console.error("Error fetching initial data:", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Log File Watcher ---
if (!fs.existsSync(LOG_FILE_PATH)) {
  console.error(`ERROR: File log tidak ditemukan di path: ${LOG_FILE_PATH}`);
  process.exit(1);
}

const watcher = chokidar.watch(LOG_FILE_PATH, { 
  persistent: true, 
  usePolling: true,
  interval: 1000 
});

console.log(`👀 Memantau perubahan pada file: ${LOG_FILE_PATH}`);
let lastSize = fs.statSync(LOG_FILE_PATH).size;

watcher.on('change', async (path) => {
  const currentSize = fs.statSync(path).size;
  if (currentSize <= lastSize) {
    lastSize = currentSize;
    return;
  }

  try {
    const stream = fs.createReadStream(path, { start: lastSize, end: currentSize });
    let buffer = '';
    
    stream.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
    });

    stream.on('end', async () => {
      const lines = buffer.trim().split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        // Cegah pemrosesan duplikat
        const lineHash = Buffer.from(line).toString('base64');
        if (processedLogs.has(lineHash)) continue;
        processedLogs.add(lineHash);
        
        console.log('📝 Log line:', line);
        const parsed = parseLogLine(line);

        if (parsed.type === 'SCAN') {
          const pData = parsed.data;
          try {
            const query = `INSERT INTO scans(container_no, truck_no, scan_time, status, image1_path) VALUES($1, $2, $3, $4, $5) RETURNING *`;
            const values = [pData.containerNo, pData.truckNo, pData.scanTime, pData.status, pData.image1_path];
            const dbRes = await db.query(query, values);
            const newScanFromDB = dbRes.rows[0];

            console.log(`[SCAN] Data untuk ${newScanFromDB.container_no} disimpan.`);
            
            // Update FTP status untuk server 1 dengan IP server
            updateFTPStatus(1, 'uploading', `Uploading ${pData.containerNo}`, localIP);
            
            // Siarkan scan baru ke semua client
            io.emit('new_scan', {
              scan: newScanFromDB,
              timestamp: new Date().toISOString()
            });

            // Update stats real-time
            await updateSystemActivity();

            // Simulasikan proses upload selesai setelah 3 detik
            setTimeout(() => {
              updateFTPStatus(1, 'connected', `Completed: ${pData.containerNo}`, localIP);
            }, 3000);

          } catch (dbErr) {
            console.error('Gagal menyimpan ke DB:', dbErr.stack);
            updateFTPStatus(1, 'error', `Error: ${dbErr.message}`, localIP);
          }
        }
        else if (parsed.type === 'FTP_UPLOAD') {
          console.log(`[FTP] Upload activity detected: ${parsed.data.ip}`);
          // Gunakan IP dari log FTP, atau fallback ke IP server
          const ftpIp = parsed.data.ip !== 'Unknown IP' ? parsed.data.ip : localIP;
          updateFTPStatus(1, 'uploading', `FTP Upload to ${parsed.data.ip}`, ftpIp);
        }
        else if (parsed.type === 'CONNECTION') {
          console.log(`[CONNECTION] ${parsed.data.message}`);
          updateFTPStatus(1, 'connected', parsed.data.message, localIP);
        }
      }

      // Update system activity setelah memproses log
      updateUptime();
      await updateSystemActivity();
      
      lastSize = currentSize;
    });

  } catch (err) {
    console.error('Error reading log file:', err);
  }
});

// Update uptime setiap menit
setInterval(updateUptime, 60000);
// Update system activity setiap 5 detik
setInterval(updateSystemActivity, 5000);

server.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  console.log(`🖥️  Server IP: ${localIP}`);
  console.log(`💻 Hostname: ${os.hostname()}`);
  updateUptime();
});