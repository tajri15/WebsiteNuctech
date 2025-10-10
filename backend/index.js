const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors()); // Middleware untuk mengizinkan request dari domain lain

const server = http.createServer(app);

// Konfigurasi Socket.IO untuk terhubung dengan frontend React
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Alamat default Vite React
    methods: ["GET", "POST"]
  }
});

const PORT = 3001;

app.get('/', (req, res) => {
  res.send('Real-time Log Server is running.');
});

// Listener untuk koneksi baru dari client
io.on('connection', (socket) => {
  console.log('Client terhubung:', socket.id);
  socket.on('disconnect', () => {
    console.log('Client terputus:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Backend server berjalan di http://localhost:${PORT}`);
});