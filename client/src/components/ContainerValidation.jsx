import { useState, useEffect, useCallback } from 'react';
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
  Tooltip,
  Row,
  Col,
  Statistic,
  Select,
  Input,
  Divider,
  Badge,
  Alert
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  EyeOutlined,
  FilePdfOutlined,
  PictureOutlined,
  SafetyCertificateOutlined,
  CalendarOutlined,
  ScanOutlined,
  CheckOutlined,
  StopOutlined
} from '@ant-design/icons';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';
import axios from 'axios';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const API_BASE = 'http://localhost:5000';

// ============================================================
// Validasi format container (4 huruf + 7 angka)
// ============================================================
const validateContainerFormat = (containerNo) => {
  if (!containerNo || containerNo.trim() === '') {
    return { isValid: false, reason: 'empty' };
  }

  const pattern = /^[A-Z]{4}\d{7}$/;
  const trimmed = containerNo.trim().toUpperCase();

  return {
    isValid: pattern.test(trimmed),
    reason: pattern.test(trimmed) ? 'valid' : 'invalid_format'
  };
};

// ============================================================
// Main Component
// ============================================================
const ContainerValidation = () => {
  const [loading, setLoading] = useState(false);
  const [rawData, setRawData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [dateRange, setDateRange] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [validationModalVisible, setValidationModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [messageApi, contextHolder] = message.useMessage();

  const [stats, setStats] = useState({
    total: 0,
    formatValid: 0,
    formatInvalid: 0,
    validManual: 0,
    invalidManual: 0,
    unchecked: 0
  });

  // ============================================================
  // Fetch data dari API
  // ============================================================
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateRange?.[0]) params.startDate = dateRange[0].format('YYYY-MM-DD HH:mm:ss');
      if (dateRange?.[1]) params.endDate = dateRange[1].format('YYYY-MM-DD HH:mm:ss');

      const res = await axios.get(`${API_BASE}/api/container-validation`, { params });

      // Enrich data dengan validasi format
      const enriched = res.data.data.map(item => {
        const formatValidation = validateContainerFormat(item.container_no);
        const images = [
          item.image1_path, item.image2_path, item.image3_path,
          item.image4_path, item.image5_path, item.image6_path,
          item.image7_path, item.image8_path
        ].filter(Boolean);

        return {
          ...item,
          formatValid: formatValidation.isValid,
          formatReason: formatValidation.reason,
          images,
          // Status manual validation (dari database)
          manualStatus: item.manual_status || 'UNCHECKED' // 'VALID', 'INVALID', 'UNCHECKED'
        };
      });

      setRawData(enriched);
      
      // Hitung statistik
      const total = enriched.length;
      const formatValid = enriched.filter(d => d.formatValid).length;
      const validManual = enriched.filter(d => d.manualStatus === 'VALID').length;
      const invalidManual = enriched.filter(d => d.manualStatus === 'INVALID').length;
      const unchecked = enriched.filter(d => d.manualStatus === 'UNCHECKED').length;
      
      setStats({
        total,
        formatValid,
        formatInvalid: total - formatValid,
        validManual,
        invalidManual,
        unchecked
      });
      
    } catch (err) {
      console.error(err);
      messageApi.error('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [dateRange, messageApi]);

  // ============================================================
  // Filter data
  // ============================================================
  useEffect(() => {
    let d = [...rawData];
    
    if (selectedStatus === 'format_valid') d = d.filter(x => x.formatValid);
    if (selectedStatus === 'format_invalid') d = d.filter(x => !x.formatValid);
    if (selectedStatus === 'manual_valid') d = d.filter(x => x.manualStatus === 'VALID');
    if (selectedStatus === 'manual_invalid') d = d.filter(x => x.manualStatus === 'INVALID');
    if (selectedStatus === 'unchecked') d = d.filter(x => x.manualStatus === 'UNCHECKED');
    
    if (searchText.trim()) {
      const s = searchText.trim().toLowerCase();
      d = d.filter(x =>
        (x.container_no || '').toLowerCase().includes(s) ||
        (x.id_scan || '').toLowerCase().includes(s)
      );
    }
    
    setFilteredData(d);
  }, [rawData, selectedStatus, searchText]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ============================================================
  // Buka modal validasi
  // ============================================================
  const openValidationModal = (record) => {
    setSelectedRecord(record);
    setValidationModalVisible(true);
  };

  // ============================================================
  // Handle validasi (Sesuai / Tidak Sesuai)
  // ============================================================
  const handleValidation = async (status) => {
    try {
      // Simpan ke database
      await axios.post(`${API_BASE}/api/manual-validation-status`, {
        scanId: selectedRecord.id,
        status: status // 'VALID' atau 'INVALID'
      });

      messageApi.success(`Data ditandai sebagai ${status === 'VALID' ? 'SESUAI' : 'TIDAK SESUAI'}`);
      setValidationModalVisible(false);
      fetchData(); // Refresh data
    } catch (err) {
      messageApi.error('Gagal menyimpan');
      console.error(err);
    }
  };

  // ============================================================
  // Download PDF
  // ============================================================
  const downloadPDF = () => {
    if (!filteredData.length) {
      messageApi.warning('Tidak ada data');
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape' });

    // Header
    doc.setFontSize(16);
    doc.setTextColor(0, 21, 41);
    doc.text('LAPORAN VALIDASI MANUAL CONTAINER', 14, 15);

    doc.setFontSize(10);
    doc.setTextColor(100);
    
    let periodeText = 'Periode: SEMUA DATA';
    if (dateRange?.[0] && dateRange?.[1]) {
      periodeText = `Periode: ${dateRange[0].format('DD/MM/YYYY HH:mm')} - ${dateRange[1].format('DD/MM/YYYY HH:mm')}`;
    }
    doc.text(periodeText, 14, 22);
    doc.text(`Dicetak: ${dayjs().format('DD/MM/YYYY HH:mm:ss')}`, 14, 28);

    // Statistik
    doc.setFontSize(11);
    doc.text('RINGKASAN', 14, 38);
    doc.setFontSize(9);
    doc.text(`Total Data: ${filteredData.length}`, 14, 45);
    doc.text(`Sudah Validasi: ${filteredData.filter(d => d.manualStatus !== 'UNCHECKED').length}`, 14, 52);
    doc.text(`- Sesuai: ${filteredData.filter(d => d.manualStatus === 'VALID').length}`, 20, 59);
    doc.text(`- Tidak Sesuai: ${filteredData.filter(d => d.manualStatus === 'INVALID').length}`, 20, 66);
    doc.text(`Belum Validasi: ${filteredData.filter(d => d.manualStatus === 'UNCHECKED').length}`, 14, 73);

    // Tabel
    autoTable(doc, {
      startY: 80,
      head: [['No', 'ID Scan', 'Nomor Container', 'Status Format', 'Status Validasi', 'Waktu Scan']],
      body: filteredData.map((item, i) => [
        i + 1,
        item.id_scan || '-',
        item.container_no || '-',
        item.formatValid ? 'VALID' : 'INVALID',
        item.manualStatus === 'VALID' ? 'SESUAI' : 
        item.manualStatus === 'INVALID' ? 'TIDAK SESUAI' : 'BELUM',
        dayjs(item.scan_time).format('DD/MM/YYYY HH:mm')
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 21, 41], textColor: 255 },
      columnStyles: {
        4: { 
          cellWidth: 30,
          halign: 'center',
          cellCallback: (cell, data) => {
            if (cell.raw === 'SESUAI') cell.styles.fillColor = [230, 255, 230];
            if (cell.raw === 'TIDAK SESUAI') cell.styles.fillColor = [255, 230, 230];
          }
        }
      }
    });

    doc.save(`Validasi_Manual_${dayjs().format('YYYYMMDD_HHmmss')}.pdf`);
    messageApi.success('PDF berhasil didownload');
  };

  // ============================================================
  // Table Columns
  // ============================================================
  const columns = [
    {
      title: 'No',
      key: 'no',
      width: 50,
      render: (_, __, i) => i + 1
    },
    {
      title: 'Status Format',
      key: 'formatStatus',
      width: 100,
      render: (_, record) => (
        record.formatValid 
          ? <Tag icon={<CheckCircleOutlined />} color="success">FORMAT VALID</Tag>
          : <Tag icon={<CloseCircleOutlined />} color="error">FORMAT INVALID</Tag>
      )
    },
    {
      title: 'Validasi Manual',
      key: 'manualStatus',
      width: 120,
      render: (_, record) => {
        if (record.manualStatus === 'VALID') {
          return <Tag icon={<CheckCircleOutlined />} color="success">✓ SESUAI</Tag>;
        }
        if (record.manualStatus === 'INVALID') {
          return <Tag icon={<CloseCircleOutlined />} color="error">✗ TIDAK SESUAI</Tag>;
        }
        return <Tag color="default">⏳ BELUM</Tag>;
      }
    },
    {
      title: 'ID Scan',
      dataIndex: 'id_scan',
      width: 180,
      ellipsis: true
    },
    {
      title: 'Nomor Container',
      dataIndex: 'container_no',
      width: 150,
      render: (text, record) => (
        <Text style={{ 
          color: record.manualStatus === 'VALID' ? '#52c41a' : 
                 record.manualStatus === 'INVALID' ? '#ff4d4f' : 'inherit',
          fontWeight: 'bold'
        }}>
          {text || '-'}
        </Text>
      )
    },
    {
      title: 'Waktu Scan',
      dataIndex: 'scan_time',
      width: 150,
      render: t => dayjs(t).format('DD/MM/YYYY HH:mm')
    },
    {
      title: 'Gambar',
      key: 'images',
      width: 60,
      align: 'center',
      render: (_, record) => (
        <Badge count={record.images.length} color="#1890ff" showZero>
          <PictureOutlined style={{ fontSize: 18 }} />
        </Badge>
      )
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          icon={<ScanOutlined />}
          onClick={() => openValidationModal(record)}
          disabled={!record.images || record.images.length === 0}
        >
          Validasi
        </Button>
      )
    }
  ];

  // ============================================================
  // Render
  // ============================================================
  return (
    <div style={{ padding: 24, background: '#f0f2f5', minHeight: '100vh' }}>
      {contextHolder}

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #001529 0%, #002140 100%)',
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 24
      }}>
        <Title level={3} style={{ color: 'white', margin: 0 }}>
          <SafetyCertificateOutlined style={{ marginRight: 12 }} />
          Validasi Manual Container
        </Title>
        <Text style={{ color: 'rgba(255,255,255,0.7)' }}>
          Lihat gambar dan tandai apakah nomor container SESUAI atau TIDAK SESUAI
        </Text>
      </div>

      {/* Statistik */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={4}>
          <Card>
            <Statistic title="Total Scan" value={stats.total} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="Format Valid" value={stats.formatValid} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="Format Invalid" value={stats.formatInvalid} valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card style={{ background: '#f6ffed' }}>
            <Statistic title="✓ Sesuai" value={stats.validManual} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card style={{ background: '#fff1f0' }}>
            <Statistic title="✗ Tidak Sesuai" value={stats.invalidManual} valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card style={{ background: '#e6f7ff' }}>
            <Statistic title="⏳ Belum" value={stats.unchecked} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
      </Row>

      {/* Filter */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col span={6}>
            <RangePicker
              showTime
              format="DD/MM/YYYY HH:mm"
              style={{ width: '100%' }}
              onChange={setDateRange}
            />
          </Col>
          <Col span={4}>
            <Select
              style={{ width: '100%' }}
              value={selectedStatus}
              onChange={setSelectedStatus}
            >
              <Option value="all">Semua Data</Option>
              <Option value="format_valid">Format Valid</Option>
              <Option value="format_invalid">Format Invalid</Option>
              <Option value="manual_valid">✓ Sesuai</Option>
              <Option value="manual_invalid">✗ Tidak Sesuai</Option>
              <Option value="unchecked">⏳ Belum</Option>
            </Select>
          </Col>
          <Col span={6}>
            <Input
              placeholder="Cari container..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col span={4}>
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchData}
              loading={loading}
              block
            >
              Refresh
            </Button>
          </Col>
          <Col span={4}>
            <Button
              icon={<FilePdfOutlined />}
              onClick={downloadPDF}
              block
            >
              PDF
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Tabel */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1200 }}
          pagination={{ pageSize: 20 }}
          rowClassName={record => {
            if (record.manualStatus === 'VALID') return 'row-valid';
            if (record.manualStatus === 'INVALID') return 'row-invalid';
            return '';
          }}
        />
      </Card>

      {/* Modal Validasi */}
      <Modal
        title={
          <Space>
            <PictureOutlined style={{ color: '#1890ff' }} />
            <span>Validasi Container: {selectedRecord?.container_no || ''}</span>
          </Space>
        }
        open={validationModalVisible}
        onCancel={() => setValidationModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedRecord && (
          <>
            <Alert
              message="Periksa gambar container"
              description="Apakah nomor container pada gambar SESUAI dengan nomor di database?"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={12}>
                <Card size="small" title="Nomor di Database">
                  <Text strong style={{ fontSize: 24, color: '#1890ff' }}>
                    {selectedRecord.container_no || '-'}
                  </Text>
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" title="Status Format">
                  {selectedRecord.formatValid 
                    ? <Tag color="success">FORMAT VALID</Tag>
                    : <Tag color="error">FORMAT INVALID</Tag>
                  }
                </Card>
              </Col>
            </Row>

            <Divider>Gambar Container</Divider>

            <Image.PreviewGroup>
              <Row gutter={[8, 8]}>
                {selectedRecord.images.map((img, idx) => (
                  <Col key={idx} span={12}>
                    <Image
                      src={`${API_BASE}/images/${img}`}
                      style={{ width: '100%', height: 200, objectFit: 'contain' }}
                    />
                  </Col>
                ))}
              </Row>
            </Image.PreviewGroup>

            <Divider />

            <Row gutter={16} justify="center">
              <Col span={10}>
                <Button
                  size="large"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleValidation('VALID')}
                  style={{ 
                    width: '100%', 
                    height: 50,
                    background: '#52c41a',
                    borderColor: '#52c41a'
                  }}
                >
                  ✓ SESUAI
                </Button>
              </Col>
              <Col span={10}>
                <Button
                  size="large"
                  danger
                  icon={<CloseCircleOutlined />}
                  onClick={() => handleValidation('INVALID')}
                  style={{ width: '100%', height: 50 }}
                >
                  ✗ TIDAK SESUAI
                </Button>
              </Col>
            </Row>
          </>
        )}
      </Modal>

      <style>{`
        .row-valid td { background: #f6ffed !important; }
        .row-invalid td { background: #fff1f0 !important; }
        .row-valid:hover td { background: #d9f7be !important; }
        .row-invalid:hover td { background: #ffccc7 !important; }
      `}</style>
    </div>
  );
};

export default ContainerValidation;