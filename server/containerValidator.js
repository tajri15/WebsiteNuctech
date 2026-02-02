const containerValidator = {
  // Pola dasar container: 4 huruf + 7 angka
  CONTAINER_PATTERN: /^[A-Z]{4}\d{7}$/,
  
  // Pola untuk double container: XXXX1234567/XXXX7654321
  DOUBLE_CONTAINER_PATTERN: /^[A-Z]{4}\d{7}\/[A-Z]{4}\d{7}$/,
  
  // Pola OCR umum (untuk menangkap hasil OCR yang mungkin tidak sempurna)
  OCR_PATTERN: /([A-Z]{3,4}[0-9]{6,7})/gi,
  
  /**
   * Validasi format nomor container
   * @param {string} containerNo - Nomor container
   * @returns {Object} - Hasil validasi
   */
  validateFormat: function(containerNo) {
    if (!containerNo || containerNo === 'N/A') {
      return {
        isValid: false,
        type: 'INVALID',
        reason: 'No container number provided'
      };
    }
    
    // Cek double container
    if (this.DOUBLE_CONTAINER_PATTERN.test(containerNo)) {
      const containers = containerNo.split('/');
      const firstValid = this.CONTAINER_PATTERN.test(containers[0]);
      const secondValid = this.CONTAINER_PATTERN.test(containers[1]);
      
      return {
        isValid: firstValid && secondValid,
        type: 'DOUBLE',
        containers: containers,
        reason: firstValid && secondValid ? null : 'Invalid double container format'
      };
    }
    
    // Cek single container
    const isValid = this.CONTAINER_PATTERN.test(containerNo);
    
    return {
      isValid: isValid,
      type: 'SINGLE',
      container: containerNo,
      reason: isValid ? null : 'Invalid container format (expected: XXXX1234567)'
    };
  },
  
  /**
   * Ekstrak nomor container dari text hasil OCR
   * @param {string} ocrText - Text hasil OCR
   * @returns {Array} - Array nomor container yang ditemukan
   */
  extractFromOCR: function(ocrText) {
    if (!ocrText) return [];
    
    const matches = [];
    const lines = ocrText.split('\n');
    
    lines.forEach(line => {
      // Cari pola 4 huruf + 7 angka
      const pattern = /([A-Z]{4}[0-9]{7})/g;
      const lineMatches = line.match(pattern);
      
      if (lineMatches) {
        matches.push(...lineMatches);
      }
      
      // Coba pola lebih fleksibel untuk OCR yang kurang akurat
      const flexiblePattern = /([A-Z]{3,4}[0-9]{6,7})/g;
      const flexibleMatches = line.match(flexiblePattern);
      
      if (flexibleMatches) {
        flexibleMatches.forEach(match => {
          if (!matches.includes(match) && match.length >= 10 && match.length <= 12) {
            matches.push(match);
          }
        });
      }
    });
    
    return [...new Set(matches)]; // Hapus duplikat
  },
  
  /**
   * Bandingkan container dari OCR dengan database
   * @param {string} ocrContainer - Container dari OCR
   * @param {string} dbContainer - Container dari database
   * @returns {Object} - Hasil perbandingan
   */
  compareContainers: function(ocrContainer, dbContainer) {
    // Bersihkan whitespace dan uppercase
    const cleanOCR = ocrContainer ? ocrContainer.trim().toUpperCase() : '';
    const cleanDB = dbContainer ? dbContainer.trim().toUpperCase() : '';
    
    // Jika tidak ada container dari OCR
    if (!cleanOCR) {
      return {
        match: false,
        score: 0,
        similarity: 0,
        status: 'NO_OCR',
        message: 'No container detected in image'
      };
    }
    
    // Jika tidak ada container di database
    if (!cleanDB || cleanDB === 'N/A') {
      return {
        match: false,
        score: 0,
        similarity: 0,
        status: 'NO_DB_CONTAINER',
        message: 'No container data in database'
      };
    }
    
    // Hitung similarity dengan Levenshtein distance
    const similarity = this.calculateSimilarity(cleanOCR, cleanDB);
    
    // Cek apakah exact match
    if (cleanOCR === cleanDB) {
      return {
        match: true,
        score: 100,
        similarity: 100,
        status: 'EXACT_MATCH',
        message: 'Container numbers match exactly'
      };
    }
    
    // Cek untuk double container
    if (cleanDB.includes('/')) {
      const dbContainers = cleanDB.split('/');
      const matches = dbContainers.map(dbCont => ({
        container: dbCont,
        similarity: this.calculateSimilarity(cleanOCR, dbCont)
      }));
      
      const bestMatch = matches.reduce((prev, current) => 
        prev.similarity > current.similarity ? prev : current
      );
      
      return {
        match: bestMatch.similarity >= 90,
        score: bestMatch.similarity,
        similarity: bestMatch.similarity,
        status: bestMatch.similarity >= 90 ? 'DOUBLE_CONTAINER_MATCH' : 'DOUBLE_CONTAINER_MISMATCH',
        message: bestMatch.similarity >= 90 ? 
          `Matches one of double containers (${bestMatch.container})` : 
          'Does not match any double container',
        bestMatch: bestMatch.container
      };
    }
    
    // Untuk single container
    const match = similarity >= 90;
    
    return {
      match: match,
      score: similarity,
      similarity: similarity,
      status: match ? 'SINGLE_MATCH' : 'MISMATCH',
      message: match ? 'Container numbers match' : 'Container numbers do not match',
      differences: this.findDifferences(cleanOCR, cleanDB)
    };
  },
  
  /**
   * Hitung similarity antara dua string
   * @param {string} str1 - String pertama
   * @param {string} str2 - String kedua
   * @returns {number} - Persentase similarity
   */
  calculateSimilarity: function(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 100.0;
    
    // Hitung Levenshtein distance
    const distance = this.levenshteinDistance(longer, shorter);
    const similarity = ((longer.length - distance) / longer.length) * 100;
    
    return Math.round(similarity * 100) / 100;
  },
  
  /**
   * Algoritma Levenshtein distance
   */
  levenshteinDistance: function(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    
    const matrix = [];
    
    // Inisialisasi matrix
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    // Isi matrix
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  },
  
  /**
   * Temukan perbedaan antara dua string
   */
  findDifferences: function(str1, str2) {
    const differences = [];
    const maxLength = Math.max(str1.length, str2.length);
    
    for (let i = 0; i < maxLength; i++) {
      const char1 = str1[i] || '';
      const char2 = str2[i] || '';
      
      if (char1 !== char2) {
        differences.push({
          position: i + 1,
          expected: char2,
          actual: char1,
          isNumber: !isNaN(parseInt(char1)) && !isNaN(parseInt(char2))
        });
      }
    }
    
    return differences;
  }
};

module.exports = containerValidator;