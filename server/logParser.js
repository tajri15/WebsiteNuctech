const parseLogLine = (line) => {
  console.log('Parsing line:', line);

  // 1. Cek untuk log FTP Upload dengan berbagai format
  if ((line.includes('FTP') && line.includes('UPLOAD')) || 
      (line.includes('ftp') && line.includes('upload')) ||
      (line.includes('Ftp') && line.includes('Upload'))) {
    
    const ipMatch = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    const fileMatch = line.match(/(\w+\.(jpg|png|jpeg|txt|log|zip|rar))/i);
    
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

  // 2. Cek untuk log JSON (data scan)
  const jsonStartIndex = line.indexOf('{');
  if (jsonStartIndex !== -1) {
    try {
      const jsonString = line.substring(jsonStartIndex);
      const data = JSON.parse(jsonString);

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
      console.error('JSON parse error:', error);
    }
  }

  // 3. Cek untuk connection logs
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

  // 4. Jika bukan keduanya, anggap sebagai log system
  return { 
    type: 'SYSTEM_LOG',
    data: {
      message: line.trim(),
      timestamp: new Date().toISOString()
    }
  };
};

module.exports = { parseLogLine };