require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const chokidar = require('chokidar');
const { parseLogLine } = require('./logParser');

const app = express();
const PORT = process.env.PORT || 5000;

// GANTI DENGAN PATH ABSOLUT (LENGKAP) KE FILE LOG ANDA!
// Contoh Windows: 'C:\\Users\\nama_anda\\Documents\\Nuctech\\Transmission.log'
// Penting: Gunakan double backslash (\\) untuk path di Windows.
const LOG_FILE_PATH = 'C:\Users\ramal\Downloads\Proyek\WebsiteNuctech\server\Transmission.log'; 

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Server is running and watching log file!');
});

// Pastikan file log ada sebelum mulai memantau
if (!fs.existsSync(LOG_FILE_PATH)) {
    console.error(`ERROR: File log tidak ditemukan di path: ${LOG_FILE_PATH}`);
    console.error('Harap periksa kembali path di file server/index.js');
    process.exit(1); // Hentikan server jika file tidak ada
}

// Inisialisasi watcher untuk memantau perubahan pada file log
const watcher = chokidar.watch(LOG_FILE_PATH, {
  persistent: true,
  usePolling: true, // Gunakan opsi ini jika file berada di network drive atau VM
});

console.log(`Memantau perubahan pada file: ${LOG_FILE_PATH}`);

// Variabel untuk menyimpan ukuran file terakhir
let lastSize = fs.statSync(LOG_FILE_PATH).size;

// Event listener ini akan terpanggil setiap kali file log diubah (ditambah isinya)
watcher.on('change', (path) => {
  fs.stat(path, (err, stats) => {
    if (err) {
      console.error("Error mendapatkan status file:", err);
      return;
    }

    // Hanya proses jika file bertambah besar
    if (stats.size > lastSize) {
      const stream = fs.createReadStream(path, { start: lastSize, end: stats.size });
      stream.on('data', (buffer) => {
        const newData = buffer.toString('utf8');
        // Pisahkan menjadi beberapa baris jika ada lebih dari satu update
        const lines = newData.trim().split('\n');
        
        lines.forEach(line => {
          if (line) { // Pastikan baris tidak kosong
            const parsedData = parseLogLine(line);
            if (parsedData) {
              console.log('--- DATA TRANSAKSI BARU ---');
              console.log(parsedData);
              // TODO: Langkah selanjutnya adalah menyimpan `parsedData` ini ke database.
              // TODO: Dan mengirimkannya ke frontend melalui WebSocket (Socket.IO).
            }
          }
        });
      });
      lastSize = stats.size; // Update ukuran terakhir
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});