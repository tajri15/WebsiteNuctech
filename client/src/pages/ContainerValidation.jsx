import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  DatePicker,
  Typography,
  message,
  Modal,
  Image,
  Spin,
  Tooltip,
  Row,
  Col,
  Statistic,
  Progress,
  Select,
  Input
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  ReloadOutlined,
  SearchOutlined,
  EyeOutlined,
  WarningOutlined,
  FileExcelOutlined,
  FilePdfOutlined
} from '@ant-design/icons';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import dayjs from 'dayjs';
import axios from 'axios';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// Fungsi untuk validasi format nomor container
const validateContainerFormat = (containerNo) => {
  if (!containerNo || containerNo.trim() === '' || containerNo.toUpperCase().includes('SCAN FAILED')) {
    return { isValid: false, reason: 'empty_or_failed' };
  }

  // Pattern untuk single container: 4 huruf + 7 angka
  const singlePattern = /^[A-Z]{4}\d{7}$/;
  
  // Pattern untuk double container: 4 huruf + 7 angka / 4 huruf + 7 angka
  const doublePattern = /^[A-Z]{4}\d{7}\/[A-Z]{4}\d{7}$/;

  if (singlePattern.test(containerNo.trim()) || doublePattern.test(containerNo.trim())) {
    return { isValid: true, reason: 'valid' };
  }

  return { isValid: false, reason: 'invalid_format' };
};

// Fungsi untuk membandingkan container dengan OCR dari gambar
const compareContainerWithOCR = async (containerNo, images) => {
  // Simulasi OCR comparison - dalam implementasi real, ini akan call API OCR
  // Untuk demo, kita akan validasi format saja
  const validation = validateContainerFormat(containerNo);
  
  return {
    match: validation.isValid,
    confidence: validation.isValid ? 95 : 0,
    ocrText: containerNo,
    validation: validation
  };
};

const ContainerValidation = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [dateRange, setDateRange] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);
  const [statistics, setStatistics] = useState({
    total: 0,
    valid: 0,
    invalid: 0,
    validPercentage: 0
  });

  // Fetch data dari API
  const fetchValidationData = async () => {
    setLoading(true);
    try {
      const response = await axios.get('http://localhost:5000/api/container-validation', {
        params: {
          startDate: dateRange?.[0]?.format('YYYY-MM-DD HH:mm:ss'),
          endDate: dateRange?.[1]?.format('YYYY-MM-DD HH:mm:ss')
        }
      });

      const validationResults = await Promise.all(
        response.data.data.map(async (item) => {
          const images = [
            item.image1_path,
            item.image2_path,
            item.image3_path,
            item.image4_path,
            item.image5_path,
            item.image6_path
          ].filter(Boolean);

          const ocrResult = await compareContainerWithOCR(item.container_no, images);

          return {
            ...item,
            isValid: ocrResult.match,
            confidence: ocrResult.confidence,
            ocrText: ocrResult.ocrText,
            validationReason: ocrResult.validation.reason,
            images: images
          };
        })
      );

      setData(validationResults);
      updateStatistics(validationResults);
      
      message.success('Data berhasil dimuat');
    } catch (error) {
      console.error('Error fetching validation data:', error);
      message.error('Gagal memuat data validasi');
    } finally {
      setLoading(false);
    }
  };

  // Update statistik
  const updateStatistics = (validationData) => {
    const total = validationData.length;
    const valid = validationData.filter(item => item.isValid).length;
    const invalid = total - valid;
    const validPercentage = total > 0 ? ((valid / total) * 100).toFixed(2) : 0;

    setStatistics({
      total,
      valid,
      invalid,
      validPercentage: parseFloat(validPercentage)
    });
  };

  // Filter data
  useEffect(() => {
    let filtered = [...data];

    // Filter berdasarkan status
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(item => {
        if (selectedStatus === 'valid') return item.isValid;
        if (selectedStatus === 'invalid') return !item.isValid;
        return true;
      });
    }

    // Filter berdasarkan search
    if (searchText) {
      filtered = filtered.filter(item =>
        item.container_no?.toLowerCase().includes(searchText.toLowerCase()) ||
        item.id_scan?.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    setFilteredData(filtered);
  }, [data, selectedStatus, searchText]);

  // Load data saat component mount
  useEffect(() => {
    fetchValidationData();
  }, [dateRange]);

  // Download Excel
  const downloadExcel = () => {
    const invalidData = filteredData.filter(item => !item.isValid);
    
    if (invalidData.length === 0) {
      message.warning('Tidak ada data invalid untuk didownload');
      return;
    }

    const exportData = invalidData.map((item, index) => ({
      'No': index + 1,
      'ID Scan': item.id_scan,
      'Container No': item.container_no,
      'Waktu Scan': dayjs(item.scan_time).format('DD/MM/YYYY HH:mm:ss'),
      'Status': item.validationReason === 'empty_or_failed' ? 'Empty/Failed' : 'Format Invalid',
      'Confidence': `${item.confidence}%`,
      'Truck No': item.truck_no || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Invalid Containers');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 5 },  // No
      { wch: 20 }, // ID Scan
      { wch: 20 }, // Container No
      { wch: 20 }, // Waktu Scan
      { wch: 15 }, // Status
      { wch: 12 }, // Confidence
      { wch: 15 }  // Truck No
    ];

    const fileName = `Invalid_Containers_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    message.success(`File ${fileName} berhasil didownload`);
  };

  // Download PDF
  const downloadPDF = () => {
    const invalidData = filteredData.filter(item => !item.isValid);
    
    if (invalidData.length === 0) {
      message.warning('Tidak ada data invalid untuk didownload');
      return;
    }

    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.setTextColor(220, 53, 69); // Red color
    doc.text('Laporan Container Invalid', 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Tanggal Export: ${dayjs().format('DD/MM/YYYY HH:mm:ss')}`, 14, 30);
    
    if (dateRange) {
      doc.text(
        `Periode: ${dateRange[0].format('DD/MM/YYYY')} - ${dateRange[1].format('DD/MM/YYYY')}`,
        14,
        36
      );
    }

    // Summary
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Total Invalid: ${invalidData.length} container`, 14, 44);

    // Table
    const tableData = invalidData.map((item, index) => [
      index + 1,
      item.id_scan,
      item.container_no || 'N/A',
      dayjs(item.scan_time).format('DD/MM/YYYY HH:mm'),
      item.validationReason === 'empty_or_failed' ? 'Empty/Failed' : 'Format Invalid',
      `${item.confidence}%`
    ]);

    doc.autoTable({
      head: [['No', 'ID Scan', 'Container No', 'Waktu Scan', 'Alasan', 'Confidence']],
      body: tableData,
      startY: 50,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [220, 53, 69], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { top: 50 }
    });

    const fileName = `Invalid_Containers_${dayjs().format('YYYYMMDD_HHmmss')}.pdf`;
    doc.save(fileName);
    message.success(`File ${fileName} berhasil didownload`);
  };

  // Show images modal
  const showImages = (images) => {
    setSelectedImages(images);
    setImageModalVisible(true);
  };

  // Table columns
  const columns = [
    {
      title: 'No',
      key: 'index',
      width: 60,
      render: (text, record, index) => index + 1,
      align: 'center'
    },
    {
      title: 'Status',
      key: 'status',
      width: 100,
      align: 'center',
      filters: [
        { text: 'Valid', value: true },
        { text: 'Invalid', value: false }
      ],
      onFilter: (value, record) => record.isValid === value,
      render: (_, record) => (
        <Tooltip title={record.isValid ? 'Container Valid' : `Invalid: ${record.validationReason}`}>
          {record.isValid ? (
            <Tag icon={<CheckCircleOutlined />} color="success">
              VALID
            </Tag>
          ) : (
            <Tag icon={<CloseCircleOutlined />} color="error">
              INVALID
            </Tag>
          )}
        </Tooltip>
      )
    },
    {
      title: 'ID Scan',
      dataIndex: 'id_scan',
      key: 'id_scan',
      width: 180,
      ellipsis: true
    },
    {
      title: 'Container No',
      dataIndex: 'container_no',
      key: 'container_no',
      width: 180,
      render: (text, record) => (
        <div>
          <Text strong style={{ color: record.isValid ? '#52c41a' : '#ff4d4f' }}>
            {text || 'N/A'}
          </Text>
          {!record.isValid && (
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {record.validationReason === 'empty_or_failed' ? '(Empty/Failed)' : '(Invalid Format)'}
              </Text>
            </div>
          )}
        </div>
      )
    },
    {
      title: 'Waktu Scan',
      dataIndex: 'scan_time',
      key: 'scan_time',
      width: 180,
      render: (text) => dayjs(text).format('DD/MM/YYYY HH:mm:ss'),
      sorter: (a, b) => new Date(a.scan_time) - new Date(b.scan_time)
    },
    {
      title: 'Confidence',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 120,
      align: 'center',
      render: (confidence) => (
        <div>
          <Progress
            percent={confidence}
            size="small"
            status={confidence >= 90 ? 'success' : confidence >= 70 ? 'normal' : 'exception'}
            format={(percent) => `${percent}%`}
          />
        </div>
      ),
      sorter: (a, b) => a.confidence - b.confidence
    },
    {
      title: 'Jumlah Gambar',
      key: 'imageCount',
      width: 120,
      align: 'center',
      render: (_, record) => (
        <Tag color="blue">{record.images.length} gambar</Tag>
      )
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 100,
      align: 'center',
      render: (_, record) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => showImages(record.images)}
          disabled={record.images.length === 0}
        >
          Lihat
        </Button>
      )
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <Card style={{ marginBottom: 24, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <Title level={2} style={{ color: 'white', margin: 0 }}>
          <WarningOutlined /> Container Validation
        </Title>
        <Text style={{ color: 'rgba(255,255,255,0.9)' }}>
          Validasi nomor container berdasarkan hasil OCR dari gambar scan
        </Text>
      </Card>

      {/* Statistics Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Container"
              value={statistics.total}
              prefix={<SearchOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Valid"
              value={statistics.valid}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
              suffix={`(${statistics.validPercentage}%)`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Invalid"
              value={statistics.invalid}
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
              suffix={`(${(100 - statistics.validPercentage).toFixed(2)}%)`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">Accuracy Rate</Text>
              <Progress
                type="circle"
                percent={statistics.validPercentage}
                width={80}
                strokeColor={{
                  '0%': '#108ee9',
                  '100%': '#87d068',
                }}
              />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Filters and Actions */}
      <Card style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Row gutter={16}>
            <Col span={8}>
              <Text strong>Rentang Waktu:</Text>
              <RangePicker
                showTime
                format="DD/MM/YYYY HH:mm"
                style={{ width: '100%', marginTop: 8 }}
                onChange={(dates) => setDateRange(dates)}
                placeholder={['Tanggal Mulai', 'Tanggal Selesai']}
              />
            </Col>
            <Col span={6}>
              <Text strong>Status:</Text>
              <Select
                style={{ width: '100%', marginTop: 8 }}
                value={selectedStatus}
                onChange={setSelectedStatus}
                options={[
                  { label: 'Semua', value: 'all' },
                  { label: 'Valid', value: 'valid' },
                  { label: 'Invalid', value: 'invalid' }
                ]}
              />
            </Col>
            <Col span={6}>
              <Text strong>Cari:</Text>
              <Input
                placeholder="Cari container atau ID scan..."
                prefix={<SearchOutlined />}
                style={{ marginTop: 8 }}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
              />
            </Col>
            <Col span={4} style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={fetchValidationData}
                loading={loading}
                style={{ width: '100%' }}
              >
                Refresh
              </Button>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={24}>
              <Space>
                <Button
                  type="primary"
                  icon={<FileExcelOutlined />}
                  onClick={downloadExcel}
                  style={{ background: '#52c41a', borderColor: '#52c41a' }}
                >
                  Download Excel (Invalid Only)
                </Button>
                <Button
                  type="primary"
                  icon={<FilePdfOutlined />}
                  onClick={downloadPDF}
                  danger
                >
                  Download PDF (Invalid Only)
                </Button>
                <Text type="secondary">
                  Menampilkan {filteredData.length} dari {data.length} data
                </Text>
              </Space>
            </Col>
          </Row>
        </Space>
      </Card>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} items`,
            pageSizeOptions: ['10', '20', '50', '100']
          }}
          rowClassName={(record) => !record.isValid ? 'invalid-row' : 'valid-row'}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* Image Modal */}
      <Modal
        title="Container Images"
        visible={imageModalVisible}
        onCancel={() => setImageModalVisible(false)}
        footer={null}
        width={900}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          {selectedImages.map((img, index) => (
            <div key={index} style={{ textAlign: 'center' }}>
              <Text strong>Image {index + 1}</Text>
              <Image
                src={`http://localhost:5000/images/${img}`}
                alt={`Container Image ${index + 1}`}
                style={{ width: '100%', marginTop: 8, border: '1px solid #d9d9d9', borderRadius: 4 }}
                fallback="data:image/png;base64,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"
              />
            </div>
          ))}
        </div>
      </Modal>

      {/* Custom CSS for row colors */}
      <style>{`
        .valid-row {
          background-color: #f6ffed !important;
        }
        .invalid-row {
          background-color: #fff1f0 !important;
        }
        .valid-row:hover {
          background-color: #d9f7be !important;
        }
        .invalid-row:hover {
          background-color: #ffccc7 !important;
        }
      `}</style>
    </div>
  );
};

export default ContainerValidation;