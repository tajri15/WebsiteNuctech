const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const { watchLogFile } = require('./log-parser');

const app = express();
app.use(cors());

const server = http.createServer(app);

// Konfigurasi Socket.IO untuk terhubung dengan frontend React Anda
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Sesuaikan jika port frontend Anda berbeda
    methods: ["GET", "POST"]
  }
});

const PORT = 3001;

// Endpoint dasar untuk mengecek apakah server berjalan
app.get('/', (req, res) => {
  res.send('Real-time Log Server is running.');
});

// Listener yang akan berjalan setiap kali ada client (browser) yang terhubung
io.on('connection', (socket) => {
  console.log('Client baru terhubung:', socket.id);

  // Listener yang akan berjalan ketika client terputus
  socket.on('disconnect', () => {
    console.log('Client terputus:', socket.id);
  });
});

// Menjalankan server pada port yang ditentukan
server.listen(PORT, () => {
  console.log(`Backend server berjalan di http://localhost:${PORT}`);
  
  // <-- Memulai fungsi untuk memonitor file log setelah server siap
  watchLogFile(io); 
});