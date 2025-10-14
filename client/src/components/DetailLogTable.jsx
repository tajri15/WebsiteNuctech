import React, { useState, useEffect } from 'react';
import { Table, Tag, Modal, Image, Button, Input, Card, Typography, Select, Row, Col, message } from 'antd';
import axios from 'axios';
import io from 'socket.io-client';
import { EyeOutlined, SearchOutlined, ExportOutlined, SyncOutlined } from '@ant-design/icons';

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

  const columns = [
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
      dataIndex: 'id',
      key: 'id',
      width: 200,
      render: (text) => (
        <Text style={{ fontFamily: 'monospace', fontSize: '12px' }}>
          {text}
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
          {text}
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
        const count = [
          record.image1_path,
          record.image2_path,
          record.image3_path,
          record.image4_path
        ].filter(Boolean).length;
        return (
          <Tag color="blue" style={{ textAlign: 'center', minWidth: '30px' }}>
            {count}
          </Tag>
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
          scroll={{ x: 1300 }}
          size="middle"
          style={{ 
            borderRadius: 8,
            overflow: 'hidden'
          }}
        />
      </Card>
      
      {selectedRecord && (
        <Modal
          title={
            <div>
              <Text strong>Detail Images for Container: </Text>
              <Text style={{ color: '#1890ff' }}>{selectedRecord.container_no}</Text>
            </div>
          }
          visible={isModalVisible}
          onCancel={() => setIsModalVisible(false)}
          footer={null}
          width={1000}
          style={{ top: 20 }}
        >
          <Image.PreviewGroup>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-around', 
              flexWrap: 'wrap',
              gap: 16,
              padding: '16px 0'
            }}>
              {selectedRecord.image1_path && (
                <div style={{ textAlign: 'center' }}>
                  <Image 
                    width={200} 
                    height={150}
                    style={{ 
                      objectFit: 'cover',
                      borderRadius: 8,
                      border: '1px solid #d9d9d9'
                    }}
                    src={`http://localhost:5000/images${selectedRecord.image1_path}`}
                    placeholder={
                      <div style={{ 
                        width: 200, 
                        height: 150, 
                        background: '#f5f5f5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 8
                      }}>
                        <Text type="secondary">Loading...</Text>
                      </div>
                    }
                  />
                  <Text style={{ display: 'block', marginTop: 8, fontSize: '12px' }}>
                    Image 1
                  </Text>
                </div>
              )}
              {selectedRecord.image2_path && (
                <div style={{ textAlign: 'center' }}>
                  <Image 
                    width={200} 
                    height={150}
                    style={{ 
                      objectFit: 'cover',
                      borderRadius: 8,
                      border: '1px solid #d9d9d9'
                    }}
                    src={`http://localhost:5000/images${selectedRecord.image2_path}`}
                  />
                  <Text style={{ display: 'block', marginTop: 8, fontSize: '12px' }}>
                    Image 2
                  </Text>
                </div>
              )}
              {selectedRecord.image3_path && (
                <div style={{ textAlign: 'center' }}>
                  <Image 
                    width={200} 
                    height={150}
                    style={{ 
                      objectFit: 'cover',
                      borderRadius: 8,
                      border: '1px solid #d9d9d9'
                    }}
                    src={`http://localhost:5000/images${selectedRecord.image3_path}`}
                  />
                  <Text style={{ display: 'block', marginTop: 8, fontSize: '12px' }}>
                    Image 3
                  </Text>
                </div>
              )}
              {selectedRecord.image4_path && (
                <div style={{ textAlign: 'center' }}>
                  <Image 
                    width={200} 
                    height={150}
                    style={{ 
                      objectFit: 'cover',
                      borderRadius: 8,
                      border: '1px solid #d9d9d9'
                    }}
                    src={`http://localhost:5000/images${selectedRecord.image4_path}`}
                  />
                  <Text style={{ display: 'block', marginTop: 8, fontSize: '12px' }}>
                    Image 4
                  </Text>
                </div>
              )}
            </div>
          </Image.PreviewGroup>
          {!selectedRecord.image1_path && !selectedRecord.image2_path && 
           !selectedRecord.image3_path && !selectedRecord.image4_path && (
            <div style={{ 
              textAlign: 'center', 
              padding: '40px 0',
              color: '#999'
            }}>
              <Text>No images available for this record</Text>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};

export default DetailLogTable;