const parseLogLine = (line) => {
  console.log('Parsing line:', line);

  // 1. Cek untuk log FTP Upload dengan berbagai format
  if ((line.includes('FTP') && line.includes('UPLOAD')) || 
      (line.includes('ftp') && line.includes('upload')) ||
      (line.includes('Ftp') && line.includes('Upload'))) {
    
    const ipMatch = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    const fileMatch = line.match(/([\w\-\.]+\.(jpg|png|jpeg|txt|log|zip|rar|img))/i);
    
    return {
      type: 'FTP_UPLOAD',
      data: {
        ip: ipMatch ? ipMatch[1] : 'Unknown IP',
        file: fileMatch ? fileMatch[1] : 'Unknown file',
        timestamp: new Date().toISOString(),
        rawMessage: line.trim()
      }
    };
  }

  // 2. Cek untuk response JSON yang berisi data scan (PENTING: pattern yang diperbaiki)
  // Mencari pattern: "response text: { ... JSON ... }"
  const responseTextMatch = line.match(/response text:\s*(\{.*\})/i);
  if (responseTextMatch) {
    try {
      const jsonString = responseTextMatch[1];
      const data = JSON.parse(jsonString);

      // Cek jika ini adalah response yang valid dengan resultData
      if (data.resultCode !== undefined && data.resultData) {
        const resultData = data.resultData;
        
        return {
          type: 'SCAN',
          data: {
            containerNo: resultData.CONTAINER_NO || 'N/A',
            truckNo: resultData.FYCO_PRESENT || 'N/A',
            scanTime: resultData.SCANTIME || new Date().toISOString(),
            status: data.resultCode === true ? 'OK' : 'NOK',
            image1_path: resultData.IMAGE1_PATH || null,
            image2_path: resultData.IMAGE2_PATH || null,
            image3_path: resultData.IMAGE3_PATH || null,
            image4_path: resultData.IMAGE4_PATH || null,
            rawData: resultData // Simpan data lengkap untuk debugging
          }
        };
      }
    } catch (error) {
      console.error('JSON parse error in response text:', error);
      console.log('Problematic JSON string:', responseTextMatch[1]);
    }
  }

  // 3. Cek untuk JSON langsung di baris (fallback)
  const jsonMatch = line.match(/\{.*\}/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[0]);
      
      // Jika ini adalah struktur resultData yang kita cari
      if (data.CONTAINER_NO && data.SCANTIME) {
        return {
          type: 'SCAN',
          data: {
            containerNo: data.CONTAINER_NO,
            truckNo: data.FYCO_PRESENT || 'N/A',
            scanTime: data.SCANTIME,
            status: data.RESPON_TPKS_API === 'OK' ? 'OK' : 'NOK',
            image1_path: data.IMAGE1_PATH || null,
            image2_path: data.IMAGE2_PATH || null,
            image3_path: data.IMAGE3_PATH || null,
            image4_path: data.IMAGE4_PATH || null,
          }
        };
      }
    } catch (error) {
      // Biarkan error, bukan JSON yang kita cari
    }
  }

  // 4. Cek untuk connection logs
  if (line.includes('connected') || line.includes('connection') || 
      line.includes('Connected') || line.includes('connect') ||
      line.includes('disconnect') || line.includes('Disconnected')) {
    return {
      type: 'CONNECTION',
      data: {
        message: line.trim(),
        timestamp: new Date().toISOString()
      }
    };
  }

  // 5. Jika bukan keduanya, anggap sebagai log system
  return { 
    type: 'SYSTEM_LOG',
    data: {
      message: line.trim(),
      timestamp: new Date().toISOString()
    }
  };
};

module.exports = { parseLogLine };