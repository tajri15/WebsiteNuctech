import React, { useState, useEffect } from 'react';
import { Table, Tag, Modal, Image, Button, Input, Card, Typography, Select, Row, Col, message, Descriptions, Badge } from 'antd';
import axios from 'axios';
import io from 'socket.io-client';
import { EyeOutlined, SearchOutlined, ExportOutlined, SyncOutlined, ExclamationCircleOutlined, FileImageOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Search } = Input;
const { Option } = Select;

const socket = io('http://localhost:5000');

const DetailLogTable = ({ filterStatus, showTransmissionFilter = false }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [transmissionFilter, setTransmissionFilter] = useState('all');
  const [searchInputValue, setSearchInputValue] = useState('');

  // Fungsi fetch data
  const fetchData = async (params = {}) => {
    setLoading(true);
    try {
      const requestParams = {
        page: params.current || pagination.current,
        pageSize: params.pageSize || pagination.pageSize,
      };

      if (filterStatus && filterStatus !== 'all') {
        requestParams.status = filterStatus;
      } else if (showTransmissionFilter && transmissionFilter !== 'all') {
        requestParams.status = transmissionFilter;
      }

      if (searchText) {
        requestParams.search = searchText;
      }

      console.log('📡 Fetching data with params:', requestParams);

      const response = await axios.get('http://localhost:5000/api/scans', {
        params: requestParams,
      });
      
      setData(response.data.data);
      setPagination({
        current: params.current || pagination.current,
        pageSize: params.pageSize || pagination.pageSize,
        total: response.data.total,
      });

      console.log('✅ Data fetched successfully:', response.data.data.length, 'records');

    } catch (error) {
      console.error("❌ Gagal mengambil data log detail:", error);
      message.error('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData({ current: 1, pageSize: 10 });
  }, [filterStatus, transmissionFilter, searchText]);

  useEffect(() => {
    const handleNewScan = (newScanData) => {
      console.log('✅ Data scan baru diterima dari server:', newScanData);
      
      let shouldAdd = true;
      
      if (filterStatus && filterStatus !== 'all') {
        shouldAdd = newScanData.status === filterStatus;
      } else if (showTransmissionFilter && transmissionFilter !== 'all') {
        shouldAdd = newScanData.status === transmissionFilter;
      }
      
      if (shouldAdd) {
        setData(prevData => [newScanData, ...prevData]);
        setPagination(prevPagination => ({
          ...prevPagination,
          total: prevPagination.total + 1,
        }));
        message.info('Data baru diterima');
      }
    };

    socket.on('new_scan', handleNewScan);

    return () => {
      socket.off('new_scan', handleNewScan);
    };
  }, [filterStatus, transmissionFilter, showTransmissionFilter]);

  const handleTableChange = (newPagination) => {
    fetchData(newPagination);
  };

  const handleSearch = (value) => {
    setSearchText(value);
    setSearchInputValue(value);
  };

  const handleSearchInputChange = (e) => {
    setSearchInputValue(e.target.value);
  };

  const handleRefresh = () => {
    fetchData({ current: 1, pageSize: 10 });
    message.info('Data diperbarui');
  };

  // =======================================================================
  // === FUNGSI EXPORT CSV YANG DIPERBAIKI (FIXED) ===
  // =======================================================================
  const handleExport = async () => {
    try {
      setExportLoading(true);
      message.loading('Mempersiapkan export...', 0);
      
      const params = new URLSearchParams();
      
      if (filterStatus && filterStatus !== 'all') {
        params.append('status', filterStatus);
      } else if (showTransmissionFilter && transmissionFilter !== 'all') {
        params.append('logType', transmissionFilter);
      }
      
      if (searchText) {
        params.append('search', searchText);
      }

      // Gunakan endpoint v2
      const exportUrl = `http://localhost:5000/api/export/csv-v2?${params.toString()}`;
      
      // Simple fetch dengan download otomatis
      const link = document.createElement('a');
      link.href = exportUrl;
      link.target = '_blank';
      link.download = 'temp.csv'; // Browser akan override ini dengan nama dari server
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      message.destroy();
      message.success('Export berhasil! File sedang didownload.');
      
    } catch (error) {
      console.error('❌ Gagal mengekspor data:', error);
      message.destroy();
      message.error('Gagal mengekspor data');
    } finally {
      setExportLoading(false);
    }
  };

  const handleTransmissionFilterChange = (value) => {
    setTransmissionFilter(value);
  };

  const showImageModal = (record) => {
    setSelectedRecord(record);
    setIsModalVisible(true);
  };

  // Hitung jumlah gambar yang ada
  const getImageCount = (record) => {
    if (record.status === 'NOK') return 0;
    let count = 0;
    for (let i = 1; i <= 6; i++) {
      if (record[`image${i}_path`]) count++;
    }
    return count;
  };

  // Kolom untuk OK dan All
  const okColumns = [
    {
      title: 'NO.',
      key: 'no',
      width: 60,
      render: (_, record, index) => {
        const current = pagination.current || 1;
        const pageSize = pagination.pageSize || 10;
        return (current - 1) * pageSize + index + 1;
      },
    },
    {
      title: 'ID SCAN',
      dataIndex: 'id_scan', // Ganti dari 'id' ke 'id_scan'
      key: 'id_scan',
      width: 200,
      render: (text) => (
        <Text style={{ fontFamily: 'monospace', fontSize: '12px' }}>
          {text || 'N/A'}
        </Text>
      ),
    },
    {
      title: 'NO. CONTAINER',
      dataIndex: 'container_no',
      key: 'container_no',
      width: 150,
      render: (text) => (
        <Text strong style={{ color: '#1890ff' }}>
          {text || '-'}
        </Text>
      ),
    },
    {
      title: 'JAM SCAN',
      dataIndex: 'scan_time',
      key: 'scan_time',
      width: 120,
      render: (text) => (
        <Text style={{ fontSize: '12px' }}>
          {text ? new Date(text).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }) : '-'}
        </Text>
      ),
      sorter: (a, b) => new Date(a.scan_time) - new Date(b.scan_time),
    },
    {
      title: 'SCAN TIME',
      dataIndex: 'scan_time',
      key: 'scan_time_full',
      width: 180,
      render: (text) => (
        <Text style={{ fontSize: '12px' }}>
          {text ? new Date(text).toLocaleString('id-ID', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }) : '-'}
        </Text>
      ),
    },
    {
      title: 'UPDATE TIME',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: (text) => (
        <Text style={{ fontSize: '12px' }}>
          {text ? new Date(text).toLocaleString('id-ID', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }) : '-'}
        </Text>
      ),
    },
    {
      title: 'JUMLAH GAMBAR',
      key: 'image_count',
      width: 120,
      render: (_, record) => {
        const count = getImageCount(record);
        return (
          <Badge 
            count={count} 
            showZero 
            style={{ 
              backgroundColor: count > 0 ? '#52c41a' : '#d9d9d9',
              fontSize: '12px'
            }}
          />
        );
      },
    },
    {
      title: 'STATUS',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => (
        <Tag 
          color={status === 'OK' ? 'green' : 'red'} 
          style={{ 
            fontWeight: 'bold',
            textAlign: 'center',
            minWidth: '50px'
          }}
        >
          {status}
        </Tag>
      ),
      filters: [
        { text: 'OK', value: 'OK' },
        { text: 'NOK', value: 'NOK' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'DETAIL',
      key: 'detail',
      width: 100,
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => showImageModal(record)}
          style={{ fontSize: '12px' }}
        >
          Detail
        </Button>
      ),
    },
  ];

  // Kolom khusus untuk NOK (tanpa jumlah gambar dan update time)
  const nokColumns = [
    {
      title: 'NO.',
      key: 'no',
      width: 60,
      render: (_, record, index) => {
        const current = pagination.current || 1;
        const pageSize = pagination.pageSize || 10;
        return (current - 1) * pageSize + index + 1;
      },
    },
    {
      title: 'ID SCAN',
      dataIndex: 'id_scan', // Ganti dari 'id' ke 'id_scan'
      key: 'id_scan',
      width: 200,
      render: (text) => (
        <Text style={{ fontFamily: 'monospace', fontSize: '12px' }}>
          {text || 'N/A'}
        </Text>
      ),
    },
    {
      title: 'NO. CONTAINER',
      dataIndex: 'container_no',
      key: 'container_no',
      width: 150,
      render: (text) => (
        <Text strong style={{ color: '#1890ff' }}>
          {text || '-'}
        </Text>
      ),
    },
    {
      title: 'JAM SCAN',
      dataIndex: 'scan_time',
      key: 'scan_time',
      width: 120,
      render: (text) => (
        <Text style={{ fontSize: '12px' }}>
          {text ? new Date(text).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }) : '-'}
        </Text>
      ),
      sorter: (a, b) => new Date(a.scan_time) - new Date(b.scan_time),
    },
    {
      title: 'SCAN TIME',
      dataIndex: 'scan_time',
      key: 'scan_time_full',
      width: 180,
      render: (text) => (
        <Text style={{ fontSize: '12px' }}>
          {text ? new Date(text).toLocaleString('id-ID', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }) : '-'}
        </Text>
      ),
    },
    {
      title: 'STATUS',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => (
        <Tag 
          color="red" 
          style={{ 
            fontWeight: 'bold',
            textAlign: 'center',
            minWidth: '50px'
          }}
        >
          {status}
        </Tag>
      ),
    },
    {
      title: 'DETAIL',
      key: 'detail',
      width: 100,
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          icon={<ExclamationCircleOutlined />}
          onClick={() => showImageModal(record)}
          style={{ 
            fontSize: '12px',
            backgroundColor: '#ff4d4f',
            borderColor: '#ff4d4f'
          }}
          danger
        >
          Detail
        </Button>
      ),
    },
  ];

  const columns = filterStatus === 'nok' ? nokColumns : okColumns;

  // Modal untuk detail OK
  const renderOkDetailModal = () => (
    <Modal
      title={
        <div>
          <Text strong>Scan Details - </Text>
          <Tag color="green">OK</Tag>
          <Text strong> Container: </Text>
          <Text style={{ color: '#1890ff' }}>{selectedRecord.container_no}</Text>
        </div>
      }
      visible={isModalVisible}
      onCancel={() => setIsModalVisible(false)}
      footer={[
        <Button key="close" onClick={() => setIsModalVisible(false)}>
          Tutup
        </Button>
      ]}
      width={1000}
      style={{ top: 20 }}
    >
      <Descriptions bordered column={2} size="small" style={{ marginBottom: 20 }}>
        <Descriptions.Item label="ID Scan" span={2}>
          <Text code>{selectedRecord.id_scan}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Container No">
          {selectedRecord.container_no}
        </Descriptions.Item>
        <Descriptions.Item label="Truck No">
          {selectedRecord.truck_no || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="Scan Time">
          {selectedRecord.scan_time ? new Date(selectedRecord.scan_time).toLocaleString('id-ID') : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="Update Time">
          {selectedRecord.updated_at ? new Date(selectedRecord.updated_at).toLocaleString('id-ID') : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="Status">
          <Tag color="green">OK</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Jumlah Gambar">
          <Badge count={getImageCount(selectedRecord)} showZero />
        </Descriptions.Item>
      </Descriptions>

      <Title level={5}>Gambar:</Title>
      <Image.PreviewGroup>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          padding: '16px 0'
        }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            selectedRecord[`image${i}_path`] && (
              <div key={i} style={{ textAlign: 'center', border: '1px solid #d9d9d9', borderRadius: 8, padding: 8 }}>
                <Image 
                  width={180} 
                  height={135}
                  style={{ 
                    objectFit: 'cover',
                    borderRadius: 4,
                  }}
                  src={`http://localhost:5000/images${selectedRecord[`image${i}_path`]}`}
                  placeholder={
                    <div style={{ 
                      width: 180, 
                      height: 135, 
                      background: '#f5f5f5',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 4
                    }}>
                      <Text type="secondary">Loading...</Text>
                    </div>
                  }
                />
                <Text style={{ display: 'block', marginTop: 8, fontSize: '12px' }}>
                  <FileImageOutlined /> Image {i}
                </Text>
              </div>
            )
          ))}
        </div>
      </Image.PreviewGroup>
      
      {getImageCount(selectedRecord) === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px 0',
          color: '#999'
        }}>
          <Text>No images available for this record</Text>
        </div>
      )}
    </Modal>
  );

  // Modal untuk detail NOK (sesuai gambar)
  const renderNokDetailModal = () => (
    <Modal
      title="NOK Scan Details"
      visible={isModalVisible}
      onCancel={() => setIsModalVisible(false)}
      footer={[
        <Button key="close" onClick={() => setIsModalVisible(false)}>
          Tutup
        </Button>
      ]}
      width={700}
    >
      {selectedRecord && (
        <div style={{ fontFamily: 'Arial, sans-serif' }}>
          {/* CORE INFORMATION */}
          <div style={{ 
            backgroundColor: '#f8f9fa', 
            padding: '16px', 
            borderRadius: '8px',
            marginBottom: '16px',
            borderLeft: '4px solid #dc3545'
          }}>
            <h3 style={{ color: '#dc3545', margin: '0 0 12px 0', fontSize: '16px' }}>CORE INFORMATION</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px', alignItems: 'center' }}>
              <strong>ID Scan:</strong>
              <code style={{ background: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                {selectedRecord.id_scan}
              </code>
              
              <strong>Container No:</strong>
              <span>{selectedRecord.container_no || 'N/A'}</span>
              
              <strong>Scan Time:</strong>
              <span>{selectedRecord.scan_time ? new Date(selectedRecord.scan_time).toLocaleString('id-ID') : 'N/A'}</span>
              
              <strong>Status:</strong>
              <Tag color="red">NOK</Tag>
            </div>
          </div>

          {/* TIMING DETAILS */}
          <div style={{ 
            backgroundColor: '#fff3cd', 
            padding: '16px', 
            borderRadius: '8px',
            marginBottom: '16px',
            borderLeft: '4px solid #ffc107'
          }}>
            <h3 style={{ color: '#856404', margin: '0 0 12px 0', fontSize: '16px' }}>TIMING DETAILS</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px', alignItems: 'center' }}>
              <strong>Update Time:</strong>
              <span>{selectedRecord.updated_at ? new Date(selectedRecord.updated_at).toLocaleString('id-ID') : 'N/A'}</span>
              
              <strong>Time Difference:</strong>
              <span>00:05:09</span>
              
              <strong>Image Count:</strong>
              <span>0</span>
              
              <strong>Task Time:</strong>
              <span>N/A</span>
              
              <strong>Retry Count:</strong>
              <span>N/A</span>
            </div>
          </div>

          {/* IMAGE INFORMATION */}
          <div style={{ 
            backgroundColor: '#e2e3e5', 
            padding: '16px', 
            borderRadius: '8px',
            marginBottom: '16px'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>IMAGE INFORMATION</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px', alignItems: 'center' }}>
              <strong>Image Path:</strong>
              <span style={{ color: '#6c757d' }}>N/A</span>
            </div>
          </div>

          {/* ADDITIONAL RAW DATA */}
          <div style={{ 
            backgroundColor: '#f8f9fa', 
            padding: '16px', 
            borderRadius: '8px',
            border: '1px solid #dee2e6'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>ADDITIONAL RAW DATA</h3>
            <div style={{ fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.5' }}>
              <div>| CONTAINER_NO | {selectedRecord.container_no || 'N/A'} |</div>
              <div>| container_no | {selectedRecord.container_no || 'N/A'} |</div>
              <div>| image_count | 0 |</div>
              <br />
              <div>log_timestamp  {selectedRecord.scan_time ? new Date(selectedRecord.scan_time).toLocaleString('id-ID') : 'N/A'}</div>
              <div>post_url  http://10.226.52.32:8040/services/xRaySby/out</div>
              <div>resend_http_status  200</div>
              <br />
              <div>resend_response_text  {"{\"resultCode\":false,\"resultDesc\":\"java.lang.ArrayListOutOfBoundsException:1\",\"resultData\":\".\"}"}</div>
              <br />
              <div>resend_status  FAILED</div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );

  return (
    <div style={{ padding: '24px' }}>
      <Card 
        style={{ 
          marginBottom: 16,
          borderRadius: 8,
          border: '1px solid #d9d9d9'
        }}
        styles={{ body: { padding: '16px 24px' } }}
      >
        {showTransmissionFilter && (
          <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 16 }}>
            <Col>
              <Text strong>Pilih Transmission Log:</Text>
            </Col>
            <Col>
              <Select 
                value={transmissionFilter}
                onChange={handleTransmissionFilterChange}
                style={{ width: 150 }}
              >
                <Option value="all">All Log Files</Option>
                <Option value="ok">Log OK</Option>
                <Option value="nok">Log NOK</Option>
              </Select>
            </Col>
          </Row>
        )}
        
        <Row gutter={[16, 16]} align="middle">
          <Col>
            <Text strong>Search:</Text>
          </Col>
          <Col flex="auto">
            <Search
              placeholder="Search container number, ID scan..."
              allowClear
              value={searchInputValue}
              onChange={handleSearchInputChange}
              onSearch={handleSearch}
              style={{ width: '100%', maxWidth: 300 }}
            />
          </Col>
          <Col>
            <Button 
              type="primary" 
              icon={<SearchOutlined />}
              onClick={() => handleSearch(searchInputValue)}
              style={{ marginRight: 8 }}
            >
              Search
            </Button>
          </Col>
          <Col>
            <Button 
              type="default" 
              icon={<ExportOutlined />}
              onClick={handleExport}
              loading={exportLoading}
              style={{ marginRight: 8 }}
            >
              Export CSV
            </Button>
          </Col>
          <Col>
            <Button 
              type="default" 
              icon={<SyncOutlined />}
              onClick={handleRefresh}
              loading={loading}
            >
              Refresh
            </Button>
          </Col>
        </Row>
      </Card>
      
      <Card 
        style={{ 
          borderRadius: 8,
          border: '1px solid #d9d9d9'
        }}
        bodyStyle={{ padding: 0 }}
      >
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `Showing ${range[0]}-${range[1]} of ${total} items`,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          onChange={handleTableChange}
          scroll={{ x: filterStatus === 'nok' ? 900 : 1100 }}
          size="middle"
          style={{ 
            borderRadius: 8,
            overflow: 'hidden'
          }}
        />
      </Card>
      
      {selectedRecord && isModalVisible && (
        filterStatus === 'nok' ? renderNokDetailModal() : renderOkDetailModal()
      )}
    </div>
  );
};

export default DetailLogTable;