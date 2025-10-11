/**
 * Menerima satu baris string dari file log dan mencoba mem-parsing-nya.
 * @param {string} line - Satu baris teks dari file Transmission.log.
 * @returns {object|null} - Mengembalikan objek dengan data terstruktur jika berhasil, atau null jika gagal.
 */
const parseLogLine = (line) => {
  try {
    // Cari posisi awal dari JSON, yang biasanya ditandai dengan '{'
    const jsonStartIndex = line.indexOf('{');
    if (jsonStartIndex === -1) {
      // Jika tidak ada '{' di baris ini, ini bukan baris data transaksi, jadi kita abaikan.
      return null;
    }

    // Ekstrak bagian string yang merupakan JSON, mulai dari '{' sampai akhir.
    const jsonString = line.substring(jsonStartIndex);

    // Ubah string JSON menjadi objek JavaScript
    const data = JSON.parse(jsonString);

    // Pastikan data yang di-parse adalah objek
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return null;
    }

    // Ekstrak data yang relevan sesuai dengan field di log Anda.
    // Nama field di sini (sebelah kanan) harus sama persis dengan yang ada di log.
    const relevantData = {
      containerNo: data.CONTAINER_NO || 'N/A',
      truckNo: data.FYCO_PRESENT || 'N/A',
      scanTime: data.SCANTIME || new Date().toISOString(),
      status: data.RESPON_TPKS_API === 'OK' ? 'OK' : 'NOK',
      image1_path: data.IMAGE1_PATH || null,
      image2_path: data.IMAGE2_PATH || null,
      image3_path: data.IMAGE3_PATH || null,
      image4_path: data.IMAGE4_PATH || null,
    };

    // Pastikan data esensial seperti nomor kontainer ada
    if (relevantData.containerNo === 'N/A') {
        return null;
    }

    return relevantData;
  } catch (error) {
    return null;
  }
};

module.exports = { parseLogLine };