const { Tail } = require('tail');
const path = require('path');

// Path ke file log. Pastikan file ini ada di folder 'backend'
const logFilePath = path.join(__dirname, 'Transmission.log'); 

function watchLogFile(io) {
  console.log(`Mencoba memonitor file: ${logFilePath}`);

  try {
    const tail = new Tail(logFilePath, { fromBeginning: false });

    tail.on("line", function(data) {
      // Cari string yang terlihat seperti objek JSON '{...}' di dalam baris log
      const jsonMatch = data.match(/{.*}/);
      if (jsonMatch) {
        try {
          const transactionData = JSON.parse(jsonMatch[0]);
          // Cek apakah data valid sebelum dikirim
          if (transactionData.VEHICLE_NO || transactionData.CONTAINER_NO) {
            console.log("Transaksi Baru -> Plat:", transactionData.VEHICLE_NO, "| Kontainer:", transactionData.CONTAINER_NO);
            // Kirim data ke semua client melalui WebSocket
            io.emit('new_transaction', transactionData);
          }
        } catch (e) {
          // Abaikan jika baris log tidak berisi JSON yang valid
        }
      }
    });

    tail.on("error", function(error) {
      console.error('ERROR TAIL:', error);
    });

  } catch (error) {
    console.error(`Error kritis: File log tidak ditemukan di ${logFilePath}.`);
    console.error('Pastikan Anda sudah meletakkan Transmission.log di dalam folder /backend.');
  }
}

module.exports = { watchLogFile };