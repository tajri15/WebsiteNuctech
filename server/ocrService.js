const Tesseract = require('tesseract.js');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const containerValidator = require('./containerValidator');

class OCRService {
  constructor() {
    this.worker = null;
    this.isInitialized = false;
    this.initialize();
  }

  async initialize() {
    try {
      console.log('🔄 Initializing OCR service...');
      this.worker = await Tesseract.createWorker('eng');
      await this.worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/',
        preserve_interword_spaces: '1',
        tessedit_pageseg_mode: '6' // Assume a single uniform block of text
      });
      this.isInitialized = true;
      console.log('✅ OCR service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize OCR service:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Proses OCR pada gambar
   * @param {string} imagePath - Path gambar
   * @returns {Promise<Object>} - Hasil OCR
   */
  async processImage(imagePath) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      console.log(`🔍 Processing OCR for image: ${imagePath}`);
      
      // Cek apakah file exists
      if (!fs.existsSync(imagePath)) {
        console.log(`⚠️ Image not found: ${imagePath}`);
        return {
          success: false,
          error: 'Image file not found',
          text: '',
          containers: []
        };
      }

      // Process dengan Tesseract
      const { data: { text } } = await this.worker.recognize(imagePath);
      
      // Ekstrak container dari text OCR
      const containers = containerValidator.extractFromOCR(text);
      
      console.log(`📝 OCR Result for ${path.basename(imagePath)}:`, {
        text: text.substring(0, 100) + '...',
        containersFound: containers
      });
      
      return {
        success: true,
        text: text,
        containers: containers,
        containerCount: containers.length,
        primaryContainer: containers[0] || null
      };
      
    } catch (error) {
      console.error(`❌ OCR processing failed for ${imagePath}:`, error);
      return {
        success: false,
        error: error.message,
        text: '',
        containers: []
      };
    }
  }

  /**
   * Proses semua gambar untuk satu scan
   * @param {Object} scanData - Data scan dari database
   * @returns {Promise<Object>} - Hasil validasi semua gambar
   */
  async processScanImages(scanData) {
    const results = {
      scanId: scanData.id,
      containerNo: scanData.container_no,
      scanTime: scanData.scan_time,
      status: scanData.status,
      imageResults: [],
      validationSummary: null
    };

    // Proses gambar 1-6
    for (let i = 1; i <= 6; i++) {
      const imagePath = scanData[`image${i}_path`];
      
      if (!imagePath) {
        results.imageResults.push({
          imageNumber: i,
          processed: false,
          reason: 'No image path'
        });
        continue;
      }

      try {
        // Build full image path
        const fullPath = path.join('\\\\192.111.111.80\\Image', imagePath);
        
        const ocrResult = await this.processImage(fullPath);
        
        // Bandingkan dengan container dari database
        const comparison = containerValidator.compareContainers(
          ocrResult.primaryContainer,
          scanData.container_no
        );

        results.imageResults.push({
          imageNumber: i,
          processed: true,
          imagePath: imagePath,
          ocrResult: ocrResult,
          comparison: comparison,
          match: comparison.match,
          similarity: comparison.similarity
        });

        console.log(`📊 Image ${i} comparison:`, {
          dbContainer: scanData.container_no,
          ocrContainer: ocrResult.primaryContainer,
          match: comparison.match,
          similarity: comparison.similarity
        });

      } catch (error) {
        console.error(`❌ Error processing image ${i}:`, error);
        results.imageResults.push({
          imageNumber: i,
          processed: false,
          error: error.message
        });
      }
    }

    // Buat summary validasi
    results.validationSummary = this.generateValidationSummary(results);
    
    return results;
  }

  /**
   * Generate validation summary
   */
  generateValidationSummary(results) {
    const processedImages = results.imageResults.filter(img => img.processed);
    const successfulOCR = processedImages.filter(img => img.ocrResult?.success);
    const matches = successfulOCR.filter(img => img.match);
    
    const totalImages = processedImages.length;
    const successfulImages = successfulOCR.length;
    const matchCount = matches.length;
    
    // Hitung rata-rata similarity
    const avgSimilarity = successfulOCR.length > 0 
      ? successfulOCR.reduce((sum, img) => sum + (img.similarity || 0), 0) / successfulOCR.length
      : 0;
    
    // Tentukan status validasi
    let validationStatus = 'UNKNOWN';
    let isValid = false;
    
    if (totalImages === 0) {
      validationStatus = 'NO_IMAGES';
    } else if (successfulImages === 0) {
      validationStatus = 'OCR_FAILED';
    } else if (matchCount === successfulImages) {
      validationStatus = 'ALL_MATCH';
      isValid = true;
    } else if (matchCount >= successfulImages * 0.5) {
      validationStatus = 'PARTIAL_MATCH';
      isValid = matchCount > 0;
    } else {
      validationStatus = 'MISMATCH';
      isValid = false;
    }
    
    return {
      totalImages,
      successfulImages,
      matchCount,
      mismatchCount: successfulImages - matchCount,
      avgSimilarity: Math.round(avgSimilarity * 100) / 100,
      validationStatus,
      isValid,
      confidence: successfulImages > 0 ? (matchCount / successfulImages * 100).toFixed(1) : 0
    };
  }

  /**
   * Batch process multiple scans
   */
  async batchProcessScans(scans, options = {}) {
    const { 
      startDate = null, 
      endDate = null, 
      limit = 100,
      status = null 
    } = options;
    
    const results = [];
    let processed = 0;
    
    for (const scan of scans.slice(0, limit)) {
      try {
        console.log(`🔄 Processing scan ${processed + 1}/${Math.min(scans.length, limit)}: ${scan.id}`);
        
        const scanResult = await this.processScanImages(scan);
        results.push(scanResult);
        
        processed++;
        
        // Delay untuk menghindari overload
        if (processed % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`❌ Failed to process scan ${scan.id}:`, error);
        results.push({
          scanId: scan.id,
          error: error.message,
          processed: false
        });
      }
    }
    
    return {
      totalScans: scans.length,
      processed: processed,
      results: results,
      summary: this.generateBatchSummary(results)
    };
  }

  generateBatchSummary(results) {
    const successful = results.filter(r => !r.error && r.validationSummary);
    const failed = results.filter(r => r.error);
    
    const valid = successful.filter(r => r.validationSummary.isValid);
    const invalid = successful.filter(r => !r.validationSummary.isValid);
    
    return {
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      valid: valid.length,
      invalid: invalid.length,
      successRate: results.length > 0 ? (successful.length / results.length * 100).toFixed(1) : 0,
      validationRate: successful.length > 0 ? (valid.length / successful.length * 100).toFixed(1) : 0
    };
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      console.log('✅ OCR service terminated');
    }
  }
}

module.exports = new OCRService();